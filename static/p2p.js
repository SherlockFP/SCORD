/**
 * p2p.js — WebRTC P2P Mesh Engine for SCORD
 * ===============================================
 * Manages the full-mesh topology: every peer connects to every other peer
 * via RTCPeerConnection. Text chat goes over RTCDataChannel.
 * Voice goes over audio MediaStreamTracks added to each connection.
 */

"use strict";

function _scordTiming() {
    return typeof window !== "undefined" && window.SCORD_TIMING ? window.SCORD_TIMING : {};
}

const ICE_SERVERS = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.relay.metered.ca:80" },
    {
        urls: "turn:global.relay.metered.ca:80",
        username: "scord",
        credential: "scord2024",
    },
];

class P2PMesh {
    /**
     * @param {string} roomId
     * @param {string} peerId
     * @param {string} signalingUrl  - ws:// URL to signaling server
     * @param {object} callbacks
     *   .onMessage(fromPeerId, data)
     *   .onPeerJoined(peerId, info)
     *   .onPeerLeft(peerId)
     *   .onVoiceStream(peerId, stream)
     *   .onTrackAdded(peerId, track, stream)
     *   .onPeerConnected(peerId)
     *   .onStatusChange(status)
     */
    constructor(roomId, peerId, signalingUrl, callbacks = {}) {
        this.roomId = roomId;
        this.peerId = peerId;
        this.signalingUrl = signalingUrl;
        this.cb = callbacks;

        this.ws = null;                 // Signaling WebSocket
        this.peers = {};                // peerId → { pc, dc, info }
        this.localStream = null;        // MediaStream for voice
        this.screenStream = null;       // MediaStream for screen
        this.voiceActive = false;
        this.micMuted = false;

        this._pendingIce = {};           // peerId → [candidate, ...]
        this._reconnectTimer = null;
        this._dead = false;
        this.cameraStream = null;
    }

    /* ── Connect to signaling server ─────────────────────────── */
    connect(username, avatarColor, avatarImage = null) {
        this._dead = false;
        this.username = username;
        this.avatarColor = avatarColor;
        this.avatarImage = avatarImage;
        const url = `${this.signalingUrl}/${this.roomId}/${this.peerId}?username=${encodeURIComponent(username)}&color=${encodeURIComponent(avatarColor)}`;
        this._setStatus("connecting");
        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log("[P2P] Signaling connected");
            this._setStatus("connected");
            this._startPing();
        };

        this.ws.onmessage = async (ev) => {
            const msg = JSON.parse(ev.data);
            await this._handleSignal(msg);
        };

        this.ws.onclose = () => {
            if (this._dead) return;
            console.warn("[P2P] Signaling disconnected — reconnecting in 3s");
            this._setStatus("disconnected");
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = setTimeout(
                () => this.connect(this.username, this.avatarColor, this.avatarImage),
                _scordTiming().P2P_WS_RECONNECT_MS ?? 3000
            );
        };

        this.ws.onerror = (e) => console.error("[P2P] WS error:", e);
    }

    disconnect() {
        this._dead = true;
        clearTimeout(this._reconnectTimer);
        this._pingTimer && clearInterval(this._pingTimer);
        Object.keys(this.peers).forEach(pid => this._closePeer(pid));
        this.ws && this.ws.close();
    }

    /* ── Signaling message dispatcher ────────────────────────── */
    async _handleSignal(msg) {
        switch (msg.type) {
            case "room_state":
                // We got here — now initiate connections to existing peers
                for (const peer of msg.room.peers) {
                    if (peer.peer_id !== this.peerId) {
                        // V11 Fix: Trigger join callback for existing peers so UI populates early
                        this.cb.onPeerJoined?.(peer.peer_id, {
                            username: peer.username,
                            avatar_color: peer.avatar_color,
                            avatar_image: peer.avatar_image
                        });
                        await this._initiatePeer(peer.peer_id, peer, true);
                    }
                }
                break;

            case "peer_joined":
                // New peer: we are the polite peer, wait for their offer
                if (msg.peer_id !== this.peerId) {
                    this.cb.onPeerJoined?.(msg.peer_id, { username: msg.username, avatar_color: msg.avatar_color });
                    await this._initiatePeer(msg.peer_id, msg, false);
                }
                break;

            case "peer_left":
                this.cb.onPeerLeft?.(msg.peer_id);
                this._closePeer(msg.peer_id);
                break;

            case "offer":
                await this._handleOffer(msg.from, msg.sdp);
                break;

            case "answer":
                await this._handleAnswer(msg.from, msg.sdp);
                break;

            case "ice_candidate":
                await this._handleIce(msg.from, msg.candidate);
                break;

            case "broadcast":
                this.cb.onMessage?.(msg.from, msg.data);
                break;

            case "error":
                console.error("[P2P] Server error:", msg.message);
                break;
        }
    }

    /* ── Create a peer connection ─────────────────────────────── */
    async _initiatePeer(peerId, info, makeOffer) {
        if (this.peers[peerId]) return; // already connected

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const peerObj = { pc, dc: null, info };
        this.peers[peerId] = peerObj;
        this._pendingIce[peerId] = [];

        // Add local audio if voice is active
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => pc.addTrack(t, this.localStream));
        }

        // Add local screen stream if active
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(t => pc.addTrack(t, this.screenStream));
        }

        // Add local camera stream if active
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(t => pc.addTrack(t, this.cameraStream));
        }

        // Receive remote tracks (Voice + Screen)
        pc.ontrack = (ev) => {
            if (!this.remoteStreams) this.remoteStreams = {};
            if (!this.remoteStreams[peerId]) {
                this.remoteStreams[peerId] = new MediaStream();
                this.cb.onVoiceStream?.(peerId, this.remoteStreams[peerId]);
            }
            this.remoteStreams[peerId].addTrack(ev.track);
            this.cb.onTrackAdded?.(peerId, ev.track, this.remoteStreams[peerId]);
        };

        pc.onicecandidate = (ev) => {
            if (ev.candidate) {
                this._send({ type: "ice_candidate", target: peerId, candidate: ev.candidate.toJSON() });
            }
        };

        peerObj._negTimer = null;
        pc.onnegotiationneeded = () => {
            clearTimeout(peerObj._negTimer);
            peerObj._negTimer = setTimeout(async () => {
                try {
                    if (pc.connectionState === "closed") return;
                    if (pc.signalingState !== "stable") return;
                    const offer = await pc.createOffer();
                    await pc.setLocalDescription(offer);
                    this._send({ type: "offer", target: peerId, sdp: pc.localDescription });
                } catch (err) {
                    console.error("[P2P] Renegotiation error:", err);
                }
            }, _scordTiming().P2P_NEGOTIATION_DEBOUNCE_MS ?? 150);
        };

        pc.onconnectionstatechange = () => {
            console.log(`[P2P] ${peerId} → ${pc.connectionState}`);
        };

        if (makeOffer) {
            // Setup data channel as offerer
            const dc = pc.createDataChannel("chat", { ordered: true });
            this._wireDataChannel(dc, peerId);
            peerObj.dc = dc;

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this._send({ type: "offer", target: peerId, sdp: pc.localDescription });
        } else {
            // Answerer: wait for data channel
            pc.ondatachannel = (ev) => {
                this._wireDataChannel(ev.channel, peerId);
                peerObj.dc = ev.channel;
            };
        }
    }

    _wireDataChannel(dc, peerId) {
        dc.onopen = () => {
            console.log(`[P2P] DataChannel open with ${peerId}`);
            this.cb.onPeerConnected?.(peerId);

            dc.send(JSON.stringify({
                type: "identity_announce",
                peerId: this.peerId,
                username: this.username || "Anonim",
                avatarColor: this.avatarColor || "#7c3aed",
                avatarImage: this.avatarImage || null
            }));
        };
        dc.onmessage = (ev) => {
            try {
                const data = JSON.parse(ev.data);
                this.cb.onMessage?.(peerId, data);
            } catch { /* ignore malformed */ }
        };
        dc.onerror = (e) => console.warn(`[P2P] DC error with ${peerId}:`, e);
        dc.onclose = () => console.log(`[P2P] DC closed with ${peerId}`);
    }

    async _handleOffer(fromId, sdp) {
        let peerObj = this.peers[fromId];
        if (!peerObj) {
            // Ensure we have a peer entry for answerer
            await this._initiatePeer(fromId, {}, false);
            peerObj = this.peers[fromId];
        }
        const { pc } = peerObj;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));

        // Flush pending ICE
        for (const c of (this._pendingIce[fromId] || [])) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => { });
        }
        this._pendingIce[fromId] = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this._send({ type: "answer", target: fromId, sdp: pc.localDescription });
    }

    async _handleAnswer(fromId, sdp) {
        const peerObj = this.peers[fromId];
        if (!peerObj) return;
        await peerObj.pc.setRemoteDescription(new RTCSessionDescription(sdp));

        for (const c of (this._pendingIce[fromId] || [])) {
            await peerObj.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => { });
        }
        this._pendingIce[fromId] = [];
    }

    async _handleIce(fromId, candidate) {
        const peerObj = this.peers[fromId];
        if (!peerObj) return;
        const { pc } = peerObj;
        if (pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => { });
        } else {
            this._pendingIce[fromId] = this._pendingIce[fromId] || [];
            this._pendingIce[fromId].push(candidate);
        }
    }

    _closePeer(peerId) {
        const p = this.peers[peerId];
        if (!p) return;
        p.dc && p.dc.close();
        p.pc.close();
        delete this.peers[peerId];
    }

    /* ── Send text message over DataChannels ──────────────────── */
    broadcast(data) {
        const raw = JSON.stringify(data);
        const maxBuf = _scordTiming().P2P_DC_MAX_BUFFERED_BYTES ?? 262144;
        for (const [, peerObj] of Object.entries(this.peers)) {
            const dc = peerObj.dc;
            if (!dc || dc.readyState !== "open") continue;
            if (dc.bufferedAmount > maxBuf) {
                console.warn("[P2P] DC buffer yüksek, gönderim atlandı:", peerObj);
                continue;
            }
            try {
                dc.send(raw);
            } catch (e) {
                console.warn("[P2P] broadcast send error:", e);
            }
        }
    }

    sendTo(targetPeerId, data) {
        const peerObj = this.peers[targetPeerId];
        const dc = peerObj?.dc;
        if (!dc || dc.readyState !== "open") return;
        const maxBuf = _scordTiming().P2P_DC_MAX_BUFFERED_BYTES ?? 262144;
        if (dc.bufferedAmount > maxBuf) {
            console.warn("[P2P] sendTo buffer yüksek:", targetPeerId);
            return;
        }
        try {
            dc.send(JSON.stringify(data));
        } catch (e) {
            console.warn("[P2P] sendTo error:", e);
        }
    }

    /* ── Voice ───────────────────────────────────────────────── */
    async startVoice(stream = null) {
        try {
            this.localStream = stream || await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.voiceActive = true;
            for (const [, peerObj] of Object.entries(this.peers)) {
                this.localStream.getTracks().forEach(t => {
                    try { peerObj.pc.addTrack(t, this.localStream); } catch { }
                });
            }
            return true;
        } catch (err) {
            console.error("[P2P] Mic error:", err);
            return false;
        }
    }

    stopVoice() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(t => t.stop());
            this.localStream = null;
        }
        this.voiceActive = false;
    }

    toggleMic() {
        if (!this.localStream) return;
        this.micMuted = !this.micMuted;
        this.localStream.getAudioTracks().forEach(t => { t.enabled = !this.micMuted; });
        return this.micMuted;
    }

    /* ── Screen Sharing ──────────────────────────────────────── */
    async startScreenShare() {
        try {
            this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });

            const screenTrack = this.screenStream.getVideoTracks()[0];
            screenTrack.onended = () => {
                this.stopScreenShare();
            };

            // Add track to all existing peers -> triggers onnegotiationneeded automatically
            for (const [, peerObj] of Object.entries(this.peers)) {
                try {
                    peerObj.pc.addTrack(screenTrack, this.screenStream);
                } catch (e) {
                    console.warn("[P2P] Failed to add screen track to peer", e);
                }
            }
            return true;
        } catch (err) {
            console.error("[P2P] Screen capture error:", err);
            return false;
        }
    }

    stopScreenShare() {
        if (!this.screenStream) return;

        const screenTrack = this.screenStream.getVideoTracks()[0];

        // Remove track from all existing peers -> triggers onnegotiationneeded automatically
        for (const [, peerObj] of Object.entries(this.peers)) {
            const senders = peerObj.pc.getSenders();
            const sender = senders.find(s => s.track === screenTrack);
            if (sender) {
                try {
                    peerObj.pc.removeTrack(sender);
                } catch (e) { }
            }
        }

        screenTrack.stop();
        this.screenStream = null;

        // Trigger callback if defined globally in app.js
        if (typeof window.onLocalScreenShareEnded === "function") {
            window.onLocalScreenShareEnded();
        }
    }

    /* ── Helpers ─────────────────────────────────────────────── */
    _send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    _setStatus(status) {
        this.cb.onStatusChange?.(status);
    }

    _startPing() {
        const pingMs = _scordTiming().P2P_SIGNALING_PING_INTERVAL_MS ?? 25000;
        this._pingTimer = setInterval(() => {
            this._send({ type: "ping" });
        }, pingMs);
    }

    get connectedPeerCount() {
        return Object.keys(this.peers).length;
    }
}

// Export globally
window.P2PMesh = P2PMesh;
