/**
 * app.js — SCORD Main Application
 * =====================================
 * Orchestrates: identity, server management, chat, voice, UI.
 */

"use strict";

/* ── Constants ────────────────────────────────────────────── */
const WS_BASE = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
const API_BASE = "/api";

const CHAT_INITIAL_LIMIT = 200;
const CHAT_LOAD_MORE_STEP = 150;
const CHAT_QUEUE_TOAST_COOLDOWN_MS = 9000;
const A11Y_ANNOUNCE_THROTTLE_MS = 1200;

/** @returns {typeof window.SCORD_TIMING} */
function SCORD_T() {
    return window.SCORD_TIMING || {};
}

const AVATAR_COLORS = [
    "#7c3aed", "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b",
    "#ef4444", "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16",
];

const EMOJIS = ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇",
    "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑",
    "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥",
    "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "🥴", "😵",
    "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "😟", "🙁", "😮", "😯", "😲", "😳",
    "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩",
    "😫", "🥱", "😤", "😡", "😠", "🤬", "🔥", "💯", "❤️", "🧡", "💛", "💚", "💙", "💜",
    "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝",
    "👍", "👎", "👊", "✊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏",
    "✍️", "💪", "🦾", "🖖", "👋", "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇",
    "☝️", "✌️", "🤞", "🤟", "🤘", "🤙", "💅", "🎉", "🎊", "🎈", "🎁",
    "🏆", "🥇", "🥈", "🥉", "⚡", "💥", "💫", "💦", "💨", "🔥", "✨", "🌟",
    "💬", "👁️", "🧠", "💡", "🎮", "🎧", "🎵", "🎶", "🎤", "🎬", "🎭", "🎨",
    "💀", "💩", "🤡", "👻", "👽", "👾", "🤖", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾"];

/* ── Local state ──────────────────────────────────────────── */
let state = {
    peerId: null,
    username: "",
    avatarColor: "#7c3aed",
    avatarImage: null,
    appBackground: null,
    voiceSettings: { micId: "default", volume: 1, filter: "none" },
    screenShareQuality: "720p",
    cameraQuality: "720p",
    roomCreatedAt: {}, // roomId -> timestamp
    // Game activity state
    gameActivity: null, // { game: string, icon: string, color: string }
    spotifyActivity: null, // { song: string, artist: string, album: string, icon: string }
    // Settings state
    settings: {
        theme: 'dark', // dark, light, auto
        messageDensity: 'cozy', // comfortable, cozy, compact
        emojiSize: 'medium', // small, medium, large
        animations: true,
        soundEnabled: true,
        notificationSound: 'default',
        highContrast: false,
        fontSize: 14,
        fontFamily: 'Inter',
    },
    servers: [],        // { id, name, ownerId, channels, members, messages }
    activeServerId: null,
    activeChannelId: null,
    mesh: null,         // P2PMesh instance
    voiceChannelId: null,
    micMuted: false,
    deafened: false,
    remoteAudios: {},   // peerId → HTMLAudioElement
    emojiOpen: false,
    membersOpen: true,
    dms: {},            // peerId -> [messages]
    activeDM: null,     // peerId
    recentDMs: [],      // [{peerId, name, ...}]
    friends: [],        // [{peerId, name, avatarColor, avatarImage}]
    peerRoles: {},
    pinnedMessages: [],
    history: {}, // Loaded from server
    translationEnabled: false,
    targetLang: "tr",
    theme: "sapphire",
    recentVoiceToasts: new Set(),
    /** @type {{ messageId: string, author: string, authorId: string, text: string } | null} */
    replyTo: null,
    _p2pOutbox: [],
    peerLatencyMs: {},
    peerIngressMs: {},
    _rttPingTimer: null,
    // Typing indicators
    typingIndicators: {}, // serverId-channelId -> {peerId -> timestamp}
    _typingTimeout: null,
    // User profiles and notes
    userProfiles: {}, // peerId -> {notes: string, friends: Set}
    userNotes: {}, // peerId -> {notes: string}
    // Message search
    searchOpen: false,
    searchQuery: "",
    searchResults: [],
    _meshHealthTimer: null,
    _lastMeshStatus: "",
    _queuedBroadcastToastAt: 0,
    _a11yAnnounceAt: 0,
    notifSettings: { chat: true, dm: true, join: true, chatLevel: "all" },
    compactMode: false,
    _qsOpen: false,
};

// ── V16 Helpers ───────────────────────────────────────────────
const UI = {
    debounce: (fn, delay) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), delay);
        };
    }
};

const updateMembersDebounced = UI.debounce(() => {
    if (state.activeServerId) updateMembersPanel(state.activeServerId);
}, SCORD_T().MEMBERS_PANEL_DEBOUNCE_MS ?? 300);

/* ── Helpers ──────────────────────────────────────────────── */
function genId() {
    return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

function now() {
    return new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

function initials(name) {
    return (name || "?").slice(0, 2).toUpperCase();
}

/** Map legacy / mismatched text channel ids so messages land in the same bucket as the UI. */
function canonicalChannelIdForChat(server, channelId) {
    if (!server?.channels || channelId == null || channelId === "") return channelId;
    if (server.channels.some(c => c.id === channelId)) return channelId;
    const firstText = server.channels.find(c => c.type === "text");
    if (!firstText) return channelId;
    const lid = String(channelId).toLowerCase();
    if (lid === "general" || lid === "ch-genel" || lid === "genel") return firstText.id;
    const textChs = server.channels.filter(c => c.type === "text");
    if (textChs.length === 1) return firstText.id;
    return channelId;
}

/** Ses kanalı id eşlemesi (farklı istemci / eski kayıtlar). */
function canonicalVoiceChannelId(server, channelId) {
    if (!server?.channels || channelId == null || channelId === "") return channelId;
    if (server.channels.some(c => c.id === channelId && c.type === "voice")) return channelId;
    const voices = server.channels.filter(c => c.type === "voice");
    if (voices.length === 1) return voices[0].id;
    return channelId;
}

function getLocalShareStream() {
    return state.screenStream || state.mesh?.screenStream || null;
}

function anyMeshDcOpen(mesh) {
    if (!mesh?.peers) return false;
    return Object.values(mesh.peers).some(p => p.dc && p.dc.readyState === "open");
}

/** Queue until at least one DataChannel is open so chat is not silently dropped. */
function meshBroadcastReliable(payload) {
    if (!state.mesh) return;
    const wsOk = state.mesh.ws && state.mesh.ws.readyState === WebSocket.OPEN;
    if (anyMeshDcOpen(state.mesh)) {
        state.mesh.broadcast(payload);
        return;
    }
    // Fallback: if signaling is up, still deliver small JSON events (chat/presence) via WS.
    // This prevents the whole app from "going dark" when DC negotiation is flaky.
    if (wsOk && typeof state.mesh.broadcastSignal === "function") {
        state.mesh.broadcastSignal(payload);
        return;
    }
    if (!state._p2pOutbox) state._p2pOutbox = [];
    state._p2pOutbox.push(payload);
    if (payload?.type === "chat") {
        const t = Date.now();
        if (t - (state._queuedBroadcastToastAt || 0) > CHAT_QUEUE_TOAST_COOLDOWN_MS) {
            state._queuedBroadcastToastAt = t;
            toast("P2P veri yolu hazır değil; mesaj sıraya alındı.", "info");
        }
    }
}

/** Fetch with kullanıcıya kısa hata bildirimi */
async function scordFetch(url, options = {}) {
    try {
        const res = await fetch(url, options);
        if (!res.ok) {
            const msg = `${res.status} ${res.statusText || ""}`.trim();
            toast(`İstek başarısız: ${msg}`, "error");
        }
        return res;
    } catch (e) {
        console.warn("scordFetch", url, e);
        toast("Ağ hatası — bağlantını kontrol et.", "error");
        throw e;
    }
}

function announceA11y(text) {
    if (!text) return;
    const t = Date.now();
    if (t - state._a11yAnnounceAt < A11Y_ANNOUNCE_THROTTLE_MS) return;
    state._a11yAnnounceAt = t;
    const el = document.getElementById("sr-announcer");
    if (!el) return;
    el.textContent = "";
    requestAnimationFrame(() => { el.textContent = text; });
}

function clearMeshHealthPoll() {
    if (state._meshHealthTimer) {
        clearInterval(state._meshHealthTimer);
        state._meshHealthTimer = null;
    }
}

function startMeshHealthPoll() {
    clearMeshHealthPoll();
    state._meshHealthTimer = setInterval(() => {
        if (state.mesh) refreshConnectionBadge();
    }, 2000);
}

function resetConnectionState() {
    try {
        // Keep username/color/theme etc, only reset connection identity and cached rooms.
        localStorage.removeItem("scord_peer_id");
        localStorage.removeItem("scord_recent_dms");
        localStorage.removeItem("scord_friends");
    } catch { }
    try { state.mesh?.disconnect?.(); } catch { }
    location.reload();
}

function maybeOfferP2PTroubleshoot(wsOk, dcOpen) {
    const peerCount = state.mesh ? Object.keys(state.mesh.peers || {}).length : 0;
    if (!wsOk || dcOpen || peerCount === 0) {
        state._p2pWaitSince = null;
        state._p2pTriedHelp = false;
        return;
    }
    const nowT = Date.now();
    if (!state._p2pWaitSince) state._p2pWaitSince = nowT;
    const waitedMs = nowT - state._p2pWaitSince;
    if (waitedMs < 12000 || state._p2pTriedHelp) return;
    state._p2pTriedHelp = true;

    const body = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <div><b>P2P kurulamadı</b> (DataChannel açılmıyor). Gizli sekmede çalışıp normal sekmede takılıyorsa genelde <b>uzantı / VPN / güvenlik yazılımı</b> WebRTC’yi engelliyordur.</div>
        <div style="opacity:.9">
          Denenecekler:
          <ul style="margin:8px 0 0 18px;display:flex;flex-direction:column;gap:6px">
            <li>VPN / AdBlock / “privacy” uzantılarını kapat</li>
            <li>Site verisini temizle veya “Bağlantıyı Sıfırla” de</li>
            <li>Farklı tarayıcı (Chrome/Edge) dene</li>
          </ul>
        </div>
      </div>
    `;
    const footer = `
      <button class="btn-secondary" onclick="hideModal()">Kapat</button>
      <button class="btn-primary" onclick="window.scordResetConnection()">Bağlantıyı Sıfırla</button>
    `;
    window.scordResetConnection = resetConnectionState;
    showModal("Bağlantı Sorunu", body, footer);
}

function refreshConnectionBadge() {
    const chatEl = document.getElementById("connection-badge");
    const voiceEl = document.getElementById("voice-connection-badge");
    const apply = (el) => {
        if (!el) return;
        const m = state.mesh;
        if (!m) {
            el.textContent = "";
            el.className = el.id === "voice-connection-badge" ? "connection-badge connection-badge--voice" : "connection-badge";
            return;
        }
        const wsOk = m.ws && m.ws.readyState === WebSocket.OPEN;
        const dcOpen = anyMeshDcOpen(m);
        const peerCount = Object.values(m.peers || {}).length;
        const n = Object.values(m.peers || {}).filter(p => p.dc && p.dc.readyState === "open").length;
        let label = "";
        let extra = "";
        if (!wsOk) {
            extra = state._lastMeshStatus === "disconnected" ? "err" : "warn";
            label = state._lastMeshStatus === "disconnected" ? "Sinyal kesildi" : "Sinyale bağlanıyor…";
        } else if (!dcOpen) {
            if (peerCount === 0) {
                extra = "ok";
                label = "Henüz kimse yok";
            } else {
                extra = "warn";
                label = "P2P veri yolu bekleniyor…";
            }
        } else {
            extra = "ok";
            label = `P2P · ${n} kanal`;
        }
        el.textContent = label;
        const base = el.id === "voice-connection-badge" ? "connection-badge connection-badge--voice" : "connection-badge";
        el.className = `${base} ${extra}`.trim();

        // Only run once per tick (chat badge is first).
        if (el.id === "connection-badge") {
            maybeOfferP2PTroubleshoot(wsOk, dcOpen);
        }
    };
    apply(chatEl);
    apply(voiceEl);
}

function flushP2pOutbox() {
    if (!state.mesh || !state._p2pOutbox?.length) return;
    if (!anyMeshDcOpen(state.mesh)) return;
    const batch = state._p2pOutbox.splice(0);
    for (const item of batch) {
        state.mesh.broadcast(item);
    }
}

/** Ses oturumunu ilk boş kanala katılan belirler (senkron referans / UI). */
function ensureVoiceSessionHost(server, channelId, peerId, username) {
    if (!server || !channelId || !peerId) return;
    if (!server.voiceSessionHost) server.voiceSessionHost = {};
    if (server.voiceSessionHost[channelId]) return;
    server.voiceSessionHost[channelId] = { peerId, username: username || "?", at: Date.now() };
}

function transferVoiceSessionHost(server, channelId, leftPeerId) {
    if (!server?.voiceSessionHost?.[channelId]) return;
    const cur = server.voiceSessionHost[channelId];
    if (cur.peerId !== leftPeerId) return;
    const remaining = (server.voiceMembers?.[channelId] || []).filter(m => m.peer_id !== leftPeerId);
    const next = remaining[0];
    if (next) {
        server.voiceSessionHost[channelId] = {
            peerId: next.peer_id,
            username: next.username,
            at: Date.now(),
        };
    } else {
        delete server.voiceSessionHost[channelId];
    }
}

/** Mesh yayınlarına zaman damgası + oturum host bilgisi (çok kullanıcı gecikme senkronu). */
function attachMeshBroadcastSync(mesh, roomId) {
    const orig = mesh.broadcast.bind(mesh);
    mesh.broadcast = function (payload) {
        if (!payload || typeof payload !== "object") return orig(payload);
        if (payload.type === "latency_ping" || payload.type === "latency_pong") return orig(payload);
        const server = state.servers.find(s => s.id === roomId);
        const ch = state.voiceChannelId;
        let voiceHostId = null;
        let voiceHostName = null;
        if (server && ch && server.voiceSessionHost?.[ch]) {
            voiceHostId = server.voiceSessionHost[ch].peerId;
            voiceHostName = server.voiceSessionHost[ch].username;
        }
        return orig({
            ...payload,
            _sync: {
                sentAt: Date.now(),
                voiceHostId,
                voiceHostName,
                originPeerId: state.peerId,
            },
        });
    };
}

function updateVoiceSessionMeta() {
    const el = document.getElementById("voice-sync-meta");
    const voiceView = document.getElementById("voice-view");
    if (!el || !voiceView || voiceView.classList.contains("hidden")) {
        if (el) el.textContent = "";
        return;
    }
    const server = state.servers.find(s => s.id === state.activeServerId);
    const ch = state.voiceChannelId || state.activeChannelId;
    if (!server || !ch) {
        el.textContent = "";
        return;
    }
    const host = server.voiceSessionHost?.[ch];
    const rt = state.peerLatencyMs || {};
    const vals = Object.values(rt).filter(n => typeof n === "number" && n >= 0);
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    const ing = state.peerIngressMs || {};
    const ingVals = Object.values(ing).filter(n => typeof n === "number");
    const ingAvg = ingVals.length ? Math.round(ingVals.reduce((a, b) => a + b, 0) / ingVals.length) : null;
    const st = SCORD_T();
    const parts = [];
    if (host) parts.push(`Oturumu ilk açan: ${host.username}`);
    if (avg != null) parts.push(`RTT ~${avg}ms`);
    if (ingAvg != null) parts.push(`paket ~${ingAvg}ms`);
    parts.push(
        `UI ${st.VOICE_SPEAKING_POLL_MS ?? 100}/${st.VOICE_SPEAKING_HOLD_MS ?? 250}ms · overlay ${st.SCREEN_OVERLAY_SYNC_INTERVAL_MS ?? 750}ms · neg ${st.P2P_NEGOTIATION_DEBOUNCE_MS ?? 150}ms · ping ${st.RTT_PING_INTERVAL_MS ?? 4000}ms`
    );
    el.textContent = parts.join(" · ");
    el.title = [
        host ? `Ses oturumunu ilk başlatan: ${host.username}` : null,
        avg != null ? `Ölçülen ortalama RTT (yaklaşık tek yön ×2): ~${avg} ms` : null,
        ingAvg != null ? `Paket üzerinden tahmini gecikme: ~${ingAvg} ms` : null,
        `timing.js sabitleri — konuşma tarama ${st.VOICE_SPEAKING_POLL_MS}ms, histerezis ${st.VOICE_SPEAKING_HOLD_MS}ms, uzak video UI ${st.VOICE_TRACK_RENDER_DELAY_MS}ms, akış UI ${st.VOICE_STREAM_RENDER_DELAY_MS}ms, ekran overlay ${st.SCREEN_OVERLAY_SYNC_INTERVAL_MS}ms, WebRTC offer debounce ${st.P2P_NEGOTIATION_DEBOUNCE_MS}ms, WS yeniden bağlanma ${st.P2P_WS_RECONNECT_MS}ms, sinyal ping ${st.P2P_SIGNALING_PING_INTERVAL_MS}ms, üye paneli ${st.MEMBERS_PANEL_DEBOUNCE_MS}ms, RTT ölçüm ${st.RTT_PING_INTERVAL_MS}ms`,
    ]
        .filter(Boolean)
        .join("\n");
}

function sendPeerLatencyPings() {
    if (!state.mesh || !anyMeshDcOpen(state.mesh)) return;
    const t0 = Date.now();
    const pingId = genId();
    for (const pid of Object.keys(state.mesh.peers)) {
        if (pid === state.peerId) continue;
        state.mesh.sendTo(pid, { type: "latency_ping", pingId, t0 });
    }
}

function clearRttPingTimer() {
    if (state._rttPingTimer) {
        clearInterval(state._rttPingTimer);
        state._rttPingTimer = null;
    }
}

function startRttPingTimer() {
    clearRttPingTimer();
    const ms = SCORD_T().RTT_PING_INTERVAL_MS ?? 4000;
    sendPeerLatencyPings();
    state._rttPingTimer = setInterval(sendPeerLatencyPings, ms);
}

function applyAvatarToElement(el, color, image, name) {
    if (image) {
        el.style.backgroundColor = "transparent";
        el.style.backgroundImage = `url(${image})`;
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center";
        el.textContent = "";
    } else {
        el.style.backgroundColor = color || "#7c3aed";
        el.style.backgroundImage = "none";
        el.textContent = initials(name);
    }
}

function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = message;
    document.getElementById("toast-container").appendChild(el);
    setTimeout(() => el.remove(), SCORD_T().TOAST_DURATION_MS ?? 4000);
}

function playSound(frequency = 440, duration = 200, type = "sine") {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration / 1000);
    } catch (e) {
        // Ignore if Web Audio not supported
    }
}

function showModal(title, bodyHTML, footerHTML) {
    document.getElementById("modal-title").textContent = title;
    const mb = document.getElementById("modal-body");
    mb.innerHTML = "";
    if (typeof bodyHTML === "string") mb.innerHTML = bodyHTML;
    else if (bodyHTML && bodyHTML.nodeType === 1) mb.appendChild(bodyHTML);
    document.getElementById("modal-footer").innerHTML = footerHTML || "";
    document.getElementById("modal-backdrop").classList.remove("hidden");
}

function mergeRoomPayloadIntoServer(server, payload) {
    if (!server || !payload) return;
    if (payload.name != null && String(payload.name).trim() !== "") server.name = payload.name;
    if (payload.channels) server.channels = payload.channels;
    if (payload.roles) server.roles = payload.roles;
    if (payload.peer_roles) server.peer_roles = payload.peer_roles;
    if (payload.channel_backgrounds) server.channel_backgrounds = payload.channel_backgrounds;
    if (payload.voicePermissionMode) server.voicePermissionMode = payload.voicePermissionMode;
    const inv = payload.inviteCode ?? payload.invite_code;
    if (inv != null && inv !== "") server.inviteCode = inv;
    const icon = payload.icon_url ?? payload.iconUrl;
    if (icon !== undefined && icon !== "") server.icon_url = icon;
}

/** Modüler UI: `data-scord-palette` renk seti, `data-scord-chat` balon / klasik */
function applyScordAppearance() {
    const pal = localStorage.getItem("scord_palette") || "glass";
    const chat = localStorage.getItem("scord_chat_layout") || "bubbles";
    document.documentElement.setAttribute("data-scord-palette", pal);
    document.documentElement.setAttribute("data-scord-chat", chat);
    if (!document.documentElement.getAttribute("data-msg-density")) {
        document.documentElement.setAttribute("data-msg-density", localStorage.getItem("scord_msg_density") || "cozy");
    }
}

function applyChannelBackground(serverId, channelId) {
    const server = state.servers.find(s => s.id === serverId);
    const raw = server?.channel_backgrounds?.[channelId];
    const chatView = document.getElementById("chat-view");
    const voiceView = document.getElementById("voice-view");
    const overlay = "linear-gradient(rgba(6, 6, 16, 0.88), rgba(6, 6, 16, 0.94))";
    const urlOk = raw && /^https?:\/\//i.test(String(raw).trim());
    [chatView, voiceView].filter(Boolean).forEach(el => {
        if (urlOk) {
            const u = JSON.stringify(String(raw).trim());
            el.style.backgroundImage = `${overlay}, url(${u})`;
            el.style.backgroundSize = "cover";
            el.style.backgroundPosition = "center";
            el.style.backgroundAttachment = "fixed";
        } else {
            el.style.backgroundImage = "";
            el.style.backgroundAttachment = "";
        }
    });
}

function getMyEffectiveRole(server) {
    if (!server) return "member";
    if (server.ownerId === state.peerId) return "owner";
    return server.peer_roles?.[state.peerId] || "member";
}

function normalizeReactionsMap(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const [emoji, peers] of Object.entries(raw)) {
        if (peers instanceof Set) out[emoji] = [...peers];
        else if (Array.isArray(peers)) out[emoji] = peers.filter(Boolean);
        else out[emoji] = [];
    }
    return out;
}

function escapeHtml(s) {
    if (s == null) return "";
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
}

function chMuteStorageKey(serverId) {
    return `scord_ch_mute_${serverId}`;
}

function getChannelMuteSet(serverId) {
    try {
        const a = JSON.parse(localStorage.getItem(chMuteStorageKey(serverId)) || "[]");
        return Array.isArray(a) ? a : [];
    } catch {
        return [];
    }
}

function isChannelMuted(serverId, channelId) {
    return getChannelMuteSet(serverId).includes(channelId);
}

function toggleChannelMuteLocal(serverId, channelId) {
    const set = [...getChannelMuteSet(serverId)];
    const i = set.indexOf(channelId);
    if (i >= 0) {
        set.splice(i, 1);
        toast("Kanal bildirimleri açık.", "info");
    } else {
        set.push(channelId);
        toast("Kanal sessize alındı (sadece bu cihaz).", "info");
    }
    localStorage.setItem(chMuteStorageKey(serverId), JSON.stringify(set));
    updateChannelSidebar(serverId);
}

function markChannelRead(serverId, channelId) {
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return;
    if (!server.unread) server.unread = {};
    server.unread[channelId] = 0;
    updateChannelSidebar(serverId);
}

function showChannelContextMenu(ev, channel, serverId) {
    closeContextMenu();
    ev.preventDefault();
    ev.stopPropagation();
    const x = ev.clientX;
    const y = ev.clientY;
    const menu = document.createElement("div");
    menu.className = "ctx-menu ctx-menu--chat";
    menu.id = "ctx-menu";
    menu.style.left = `${Math.min(x, window.innerWidth - 260)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 280)}px`;

    const addItem = (icon, label, action) => {
        const item = document.createElement("div");
        item.className = "ctx-item";
        item.innerHTML = `<span class="ctx-icon">${icon}</span>${label}`;
        item.onclick = () => { closeContextMenu(); action(); };
        menu.appendChild(item);
    };

    if (channel.type === "text") {
        addItem("✓", "Okundu olarak işaretle", () => markChannelRead(serverId, channel.id));
        const muted = isChannelMuted(serverId, channel.id);
        addItem(muted ? "🔔" : "🔕", muted ? "Sessize almayı kaldır" : "Kanalı sessize al (yerel)", () => toggleChannelMuteLocal(serverId, channel.id));
    }
    if (channel.type === "voice") {
        addItem("🔊", "Kanala katıl", () => {
            joinVoiceChannel(channel.id);
            updateChannelSidebar(serverId);
        });
    }
    addItem("📋", "Kanal ID kopyala", () => {
        const id = channel.id || "";
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(id).then(() => toast("Kanal ID kopyalandı", "info")).catch(() => toast("Kopyalanamadı", "error"));
        }
    });

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener("click", closeContextMenu, { once: true });
    }, 10);
}

function setReplyTarget(msg) {
    state.replyTo = {
        messageId: msg.id,
        author: msg.author,
        authorId: msg.authorId,
        text: msg.text || "",
    };
    const bar = document.getElementById("reply-preview-bar");
    const auth = document.getElementById("reply-preview-author");
    const snip = document.getElementById("reply-preview-snippet");
    if (bar && auth && snip) {
        bar.classList.remove("hidden");
        auth.textContent = msg.author || "";
        snip.textContent = (msg.text || "").replace(/\s+/g, " ").slice(0, 100);
    }
    document.getElementById("chat-input")?.focus();
}

function clearReplyTarget() {
    state.replyTo = null;
    document.getElementById("reply-preview-bar")?.classList.add("hidden");
}

function scrollToChatMessage(messageId) {
    if (!messageId) return;
    const rid = String(messageId).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const row = document.querySelector(`[data-msg-id="${rid}"]`);
    if (!row) {
        toast("Mesaj bu görünümde yok veya silindi.", "info");
        return;
    }
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("msg-highlight");
    setTimeout(() => row.classList.remove("msg-highlight"), 2400);
}

async function persistChannelBackground(roomId, channelId, url) {
    try {
        await scordFetch(`${API_BASE}/rooms/${roomId}/channel_background`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel_id: channelId, url: url || null }),
        });
    } catch (e) {
        console.warn("persistChannelBackground", e);
    }
}

function hideModal() {
    document.getElementById("modal-backdrop").classList.add("hidden");
}

/* ── Setup overlay ────────────────────────────────────────── */
function initSetup() {
    const nameInput = document.getElementById("username-input");
    const enterBtn = document.getElementById("enter-btn");

    nameInput.addEventListener("input", () => {
        enterBtn.disabled = nameInput.value.trim().length < 2;
    });

    nameInput.addEventListener("keydown", e => {
        if (e.key === "Enter" && !enterBtn.disabled) enterBtn.click();
    });

    enterBtn.addEventListener("click", () => {
        state.username = nameInput.value.trim();
        state.peerId = genId();
        localStorage.setItem("scord_username", state.username);
        localStorage.setItem("scord_color", state.avatarColor);
        localStorage.setItem("scord_peer_id", state.peerId);
        startApp();
    });

    // Restore saved identity
    const saved = {
        username: localStorage.getItem("scord_username"),
        color: localStorage.getItem("scord_color"),
        peerId: localStorage.getItem("scord_peer_id"),
        image: localStorage.getItem("scord_avatar_image"),
        theme: localStorage.getItem("scord_theme"),
        friends: localStorage.getItem("scord_friends"),
        recentDMs: localStorage.getItem("scord_recent_dms"),
    };
    if (saved.friends) {
        try { state.friends = JSON.parse(saved.friends); } catch (e) { }
    }
    if (saved.recentDMs) {
        try { state.recentDMs = JSON.parse(saved.recentDMs); } catch (e) { }
    }
    if (saved.theme) {
        state.theme = saved.theme;
        document.documentElement.className = saved.theme;
    }
    applyScordAppearance();
    if (saved.bg) {
        state.appBackground = saved.bg;
        document.body.style.backgroundImage = `url(${saved.bg})`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
    }
    if (saved.voice) {
        try { state.voiceSettings = JSON.parse(saved.voice); } catch (e) { }
    }
    if (saved.image) {
        state.avatarImage = saved.image;
    }
    if (saved.username) {
        nameInput.value = saved.username;
        enterBtn.disabled = false;
        if (saved.color) {
            state.avatarColor = saved.color;
        }
        if (saved.peerId) state.peerId = saved.peerId;
    }
}

/* ── Start app after identity chosen ─────────────────────── */
function startApp() {
    document.getElementById("setup-overlay").classList.remove("active");
    document.getElementById("app").classList.remove("hidden");
    loadUserPrefs();
    applyScordAppearance();
    applyFocusModeButton();
    // Load runtime config (ICE/TURN) for better P2P reliability.
    loadRuntimeConfig();

    // Apply user info to UI
    const avatar = document.getElementById("user-bar-avatar");
    const nameEl = document.getElementById("user-bar-name");

    if (nameEl) {
        nameEl.textContent = state.username || "Anonim";
        console.log("[App] Identity updated:", state.username);
    }
    if (avatar) {
        applyAvatarToElement(avatar, state.avatarColor, state.avatarImage, state.username);
    }

    // Quick Avatar Upload
    const quickAvInput = document.createElement("input");
    quickAvInput.type = "file";
    quickAvInput.accept = "image/*";
    quickAvInput.style.display = "none";
    quickAvInput.onchange = (e) => {
        fileToBase64(e.target.files[0], (b64) => {
            state.avatarImage = b64;
            localStorage.setItem("scord_avatar_image", b64);
            applyAvatarToElement(avatar, state.avatarColor, state.avatarImage, state.username);
            if (state.mesh) {
                state.mesh.broadcast({ type: "broadcast", payload: { type: "profile_update", username: state.username, avatarImage: state.avatarImage } });
            }
            toast("Profil fotoğrafın başarıyla güncellendi!", "success");
        });
    };
    document.body.appendChild(quickAvInput);

    avatar.style.cursor = "pointer";
    avatar.title = "Profil Fotoğrafını Değiştir";
    avatar.onclick = () => quickAvInput.click();

    showHomeView();
    refreshDiscovery();
    initMobileNav();
    setInterval(refreshDiscovery, SCORD_T().DISCOVERY_REFRESH_INTERVAL_MS ?? 15000);
}

let _runtimeCfgLoaded = false;
async function loadRuntimeConfig() {
    if (_runtimeCfgLoaded) return;
    _runtimeCfgLoaded = true;
    try {
        const res = await fetch(`${API_BASE}/config`, { cache: "no-store" });
        if (!res.ok) return;
        const cfg = await res.json();
        if (cfg && Array.isArray(cfg.iceServers) && cfg.iceServers.length) {
            window.SCORD_ICE_SERVERS = cfg.iceServers;
        }
        if (cfg && cfg.hasTurn === false) {
            // Not fatal, but many NATs will fail without TURN.
            toast("Uyarı: TURN ayarlı değil; bazı ağlarda sesli/P2P bağlanmayabilir.", "info");
        }
    } catch {
        // Ignore; defaults in p2p.js will apply
    }
}

function initMobileNav() {
    const menuBtn = document.getElementById("mobile-menu-btn");
    const mask = document.getElementById("mobile-nav-mask");
    const membersBtn = document.getElementById("members-toggle-btn");

    if (menuBtn) {
        menuBtn.onclick = () => {
            document.body.classList.toggle("nav-open");
            mask.classList.toggle("hidden", !document.body.classList.contains("nav-open"));
            mask.classList.toggle("active", document.body.classList.contains("nav-open"));
        };
    }

    if (mask) {
        mask.onclick = closeMobileNav;
    }

    if (membersBtn) {
        membersBtn.onclick = () => {
            const panel = document.getElementById("members-panel");
            panel.classList.toggle("mobile-active");
            if (panel.classList.contains("mobile-active")) {
                mask.classList.remove("hidden");
                mask.classList.add("active");
            } else {
                closeMobileNav();
            }
        };
    }

    const settingsBtn = document.getElementById("server-settings-btn");
    console.log("[App] Attaching settings listener to:", settingsBtn);
    if (settingsBtn) {
        settingsBtn.onclick = (e) => {
            console.log("[App] Settings icon clicked");
            openServerSettingsModal();
        };
    }
}

function closeMobileNav() {
    document.body.classList.remove("nav-open");
    document.getElementById("members-panel").classList.remove("mobile-active");
    const mask = document.getElementById("mobile-nav-mask");
    mask.classList.add("hidden");
    mask.classList.remove("active");
}

/* ── Views ────────────────────────────────────────────────── */
function showHomeView() {
    closeMobileNav();
    clearRttPingTimer();
    clearMeshHealthPoll();
    if (state.activeServerId && state.activeChannelId) {
        persistChatDraftFor(state.activeServerId, state.activeChannelId);
    }
    if (state.voiceChannelId) {
        try { leaveVoiceChannel(); } catch (e) { /* noop */ }
    }
    if (state.mesh) {
        clearMeshHealthPoll();
        try { state.mesh.disconnect(); } catch (e) { /* noop */ }
        state.mesh = null;
    }
    refreshConnectionBadge();
    document.getElementById("home-view").classList.remove("hidden");
    document.getElementById("chat-view").classList.add("hidden");
    document.getElementById("voice-view").classList.add("hidden");
    state.activeChannelId = null;
    state.activeServerId = null;
    updateChannelSidebar(null);
    document.querySelectorAll(".rail-icon").forEach(el => el.classList.remove("active"));
    document.getElementById("home-btn").classList.add("active");
    document.getElementById("sidebar-server-name").textContent = "SCORD";
}

// Message search state
let searchState = {
    open: false,
    query: "",
    results: [],
    activeIndex: 0,
    filters: { from: "", has: "", in: "", on: "" }
};

function showChatView(serverId, channelId) {
    closeMobileNav();
    const server = state.servers.find(s => s.id === serverId);
    if (!server) {
        console.warn("[App] showChatView: Server not found:", serverId);
        return;
    }
    const channel = server.channels ? server.channels.find(c => c.id === channelId) : null;
    if (!channel) {
        console.warn("[App] showChatView: Channel not found:", channelId);
        return;
    }

    const prevSid = state.activeServerId;
    const prevCid = state.activeChannelId;
    const chatVisible = document.getElementById("chat-view") && !document.getElementById("chat-view").classList.contains("hidden");
    if (prevSid && prevCid && chatVisible && (prevSid !== serverId || prevCid !== channelId)) {
        persistChatDraftFor(prevSid, prevCid);
    }

    state.activeServerId = serverId;
    state.activeChannelId = channelId;

    const canonCh = canonicalChannelIdForChat(server, channelId);
    if (server._msgListOffset && canonCh) delete server._msgListOffset[canonCh];

    const inp = document.getElementById("chat-input");
    if (inp) {
        const dk = draftStorageKey(serverId, channelId);
        inp.value = localStorage.getItem(dk) || "";
        inp.style.height = "auto";
    }
    hideNewMsgsChip();
    wireMessagesScroll();

    document.getElementById("home-view").classList.add("hidden");
    document.getElementById("chat-view").classList.remove("hidden");
    document.getElementById("voice-view").classList.add("hidden");

    // Fix: the HTML element ID for the channel title is 'active-channel-name' not 'server-name-label'
    const channelNameEl = document.getElementById("active-channel-name");
    if (channelNameEl) channelNameEl.textContent = `# ${channel.name}`;

    document.getElementById("chat-input").placeholder = `#${channel.name} kanalına mesaj gönder`;
    document.getElementById("sidebar-server-name").textContent = server.name;
    updateChannelSidebar(serverId);

    renderMessages(serverId, channelId);
    applyChannelBackground(serverId, channelId);

    updateMuteStates();
    updateMembersDebounced();
    updatePeerCountBadge(serverId);
}

function updateMuteStates() {
    if (!state.mesh || !state.remoteMedia) return;
    const server = state.servers.find(s => s.id === state.activeServerId);
    const activeChannel = state.voiceChannelId;
    Object.entries(state.remoteMedia).forEach(([peerId, videoEl]) => {
        const tracks = videoEl.srcObject?.getAudioTracks() || [];
        const sameChannel = activeChannel && server?.voiceMembers?.[activeChannel]?.some(m => m.peer_id === peerId);
        tracks.forEach(t => t.enabled = !!sameChannel);
    });
}

function showVoiceView(serverId, channelId) {
    closeMobileNav();
    const server = state.servers.find(s => s.id === serverId);
    const channel = server?.channels.find(c => c.id === channelId);
    if (!server || !channel) return;

    if (state.activeServerId && state.activeChannelId) {
        const prevCh = server.channels?.find(c => c.id === state.activeChannelId);
        if (prevCh?.type === "text") persistChatDraftFor(state.activeServerId, state.activeChannelId);
    }

    state.activeServerId = serverId;
    state.activeChannelId = channelId;

    document.getElementById("home-view").classList.add("hidden");
    document.getElementById("chat-view").classList.add("hidden");
    document.getElementById("voice-view").classList.remove("hidden");
    document.getElementById("voice-channel-name").textContent = channel.name;
    document.getElementById("sidebar-server-name").textContent = server.name;
    updateChannelSidebar(serverId);
    renderVoiceParticipants(serverId, channelId);
    updateMembersPanel(serverId);
    // Show share buttons even if not joined
    document.getElementById("voice-screen-btn")?.classList.remove("hidden");
    document.getElementById("voice-camera-btn")?.classList.remove("hidden");
    updateVoiceSessionMeta();
    applyChannelBackground(serverId, channelId);
}

/* ── Server rail ──────────────────────────────────────────── */
function renderServerRail() {
    const container = document.getElementById("server-icons");
    container.innerHTML = "";
    state.servers.forEach(server => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "rail-icon rail-server-guild" + (server.id === state.activeServerId ? " active" : "");
        btn.dataset.serverId = server.id;
        btn.title = server.name;

        if (server.icon_url) {
            btn.innerHTML = `<img src="${server.icon_url}" alt="" class="rail-guild-img" />`;
            btn.style.background = "var(--bg-deep)";
            btn.style.padding = "0";
            btn.textContent = "";
        } else {
            btn.textContent = initials(server.name);
            btn.style.background = server.color || "var(--accent-light)";
        }

        btn.onclick = () => switchToServer(server.id);
        container.appendChild(btn);
    });
}

/* ── Channel sidebar ──────────────────────────────────────── */
/* ── Screen Sharing ───────────────────────────────────────── */
async function startScreenShare() {
    if (!state.mesh || !state.mesh.voiceActive) return toast("Önce sesli kanala katıl.", "error");

    try {
        const quality = state.screenShareQuality || "720p";
        const qualityConstraints = {
            "4k": { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
            "1080p": { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
            "720p": { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            "480p": { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
            "360p": { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } },
        };
        const stream = await navigator.mediaDevices.getDisplayMedia({ 
            video: { ...qualityConstraints[quality], cursor: "always" }, 
            audio: true 
        });
        state.screenStream = stream;
        state.mesh.screenStream = stream;

        // Add tracks to all existing peer connections
        for (const [, peerObj] of Object.entries(state.mesh.peers)) {
            const pc = peerObj.pc;
            if (!pc || pc.connectionState === "closed") continue;

            stream.getTracks().forEach(track => {
                // Check if a sender for this track kind (video) already exists
                const existingSender = pc.getSenders().find(s => s.track && s.track.kind === track.kind);
                if (existingSender) {
                    existingSender.replaceTrack(track).catch(e => console.warn("replaceTrack error", e));
                } else {
                    pc.addTrack(track, stream);
                }
            });
        }

        stream.getVideoTracks()[0].onended = () => {
            stream.getTracks().forEach(t => t.stop());
            state.screenStream = null;
            if (state.mesh) {
                state.mesh.screenStream = null;
                state.mesh.broadcast({
                    type: "screen_status",
                    sharing: false,
                    channelId: state.voiceChannelId || state.activeChannelId,
                });
            }
            document.getElementById("voice-screen-btn")?.classList.remove("active");
            if (state.activeServerId && state.voiceChannelId) {
                renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
            }
        };

        document.getElementById("voice-screen-btn").classList.add("active");
        if (state.mesh) {
            state.mesh.broadcast({
                type: "screen_status",
                sharing: true,
                channelId: state.voiceChannelId || state.activeChannelId,
            });
        }
        toast("Ekran başarıyla paylaşıldı!", "success");
        // Local preview: allow opening fullscreen overlay quickly
        const preview = document.getElementById("local-screen-preview");
        if (preview) preview.onclick = () => openScreenOverlay(state.peerId, state.username);
        if (state.activeServerId && state.voiceChannelId) {
            renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
        }
    } catch (err) {
        if (err.name !== "NotAllowedError") console.error("Screen share error", err);
        toast("Ekran paylaşımı iptal edildi veya hata oluştu.", "error");
    }
}

/* ── Camera Sharing ───────────────────────────────────────── */
async function startCameraShare() {
    if (!state.mesh || !state.mesh.voiceActive) return toast("Önce sesli kanala katıl.", "error");

    try {
        const quality = state.cameraQuality || "720p";
        const qualityConstraints = {
            "4k": { width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
            "1080p": { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
            "720p": { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            "480p": { width: { ideal: 854 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
            "360p": { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } },
        };
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { ...qualityConstraints[quality] }, 
            audio: false 
        });
        state.cameraStream = stream;
        state.mesh.cameraStream = stream;

        for (const [, peerObj] of Object.entries(state.mesh.peers)) {
            const pc = peerObj.pc;
            if (!pc || pc.connectionState === "closed") continue;

            stream.getTracks().forEach(track => {
                const existingSender = pc.getSenders().find(s => s.track && s.track.kind === track.kind);
                if (existingSender) {
                    existingSender.replaceTrack(track).catch(console.warn);
                } else {
                    pc.addTrack(track, stream);
                }
            });
        }

        stream.getVideoTracks()[0].onended = () => {
            stopCameraShare();
        };

        const preview = document.getElementById("local-screen-preview");
        const video = document.getElementById("self-share-video");
        const lbl = document.getElementById("local-preview-label");
        if (preview && video) {
            preview.classList.remove("hidden");
            video.srcObject = stream;
            if (lbl) lbl.textContent = "Kameran Açık";
            preview.onclick = () => openScreenOverlay(state.peerId, state.username);
        }

        state.mesh.broadcast({
            type: "video_status",
            sharing: true,
            channelId: state.voiceChannelId || state.activeChannelId,
        });

        const btn = document.getElementById("voice-camera-btn");
        if (btn) btn.classList.add("active");

        // Force UI refresh to show local video in gallery
        if (state.activeServerId && state.voiceChannelId) {
            renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
        }

        toast("Kamera açıldı!", "success");
    } catch (err) {
        if (err.name !== "NotAllowedError") console.error("Camera error", err);
        toast("Kamera açılamadı veya izin verilmedi.", "error");
    }
}

function stopCameraShare() {
    if (state.cameraStream) {
        state.cameraStream.getTracks().forEach(t => t.stop());
        state.cameraStream = null;
        if (state.mesh) state.mesh.cameraStream = null;

        for (const [, peerObj] of Object.entries(state.mesh?.peers || {})) {
            const pc = peerObj.pc;
            if (!pc) continue;
            pc.getSenders().filter(s => s.track?.kind === "video").forEach(s => {
                try { pc.removeTrack(s); } catch (e) { }
            });
        }

        const btn = document.getElementById("voice-camera-btn");
        if (btn) btn.classList.remove("active");

        if (state.mesh) {
            state.mesh.broadcast({
                type: "video_status",
                sharing: false,
                channelId: state.voiceChannelId || state.activeChannelId,
            });
        }

        const preview = document.getElementById("local-screen-preview");
        const video = document.getElementById("self-share-video");
        const lbl = document.getElementById("local-preview-label");
        if (!state.screenStream && preview) {
            preview.classList.add("hidden");
            if (video) video.srcObject = null;
        } else if (state.screenStream && video) {
            video.srcObject = state.screenStream;
            if (lbl) lbl.textContent = "Yayındasın (Önizleme)";
        }
    }
}

function updateChannelSidebar(serverId) {
    console.log("[Sidebar] Updating for server:", serverId);
    const list = document.getElementById("channel-list");
    if (!list) return console.error("[Sidebar] channel-list not found!");

    list.innerHTML = "";
    if (!serverId) {
        console.log("[Sidebar] No serverId, rendering Home");
        renderHomeSidebar();
        return;
    }
    const server = state.servers.find(s => s.id === serverId);
    if (!server) {
        console.warn("[Sidebar] Server not found in state:", serverId);
        return;
    }

    console.log("[Sidebar] Found server:", server.name, "Channels:", server.channels?.length);
    if (!server.channels) {
        console.error("[Sidebar] Server has no channels array!");
        return;
    }

    const textChannels = server.channels.filter(c => c.type === "text");
    const voiceChannels = server.channels.filter(c => c.type === "voice");

    if (textChannels.length) {
        const cat = document.createElement("div");
        cat.className = "channel-category";
        cat.style.display = "flex";
        cat.style.justifyContent = "space-between";
        cat.style.alignItems = "center";
        cat.innerHTML = `<span><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg> METİN KANALLARI</span>`;

        const isAdmin = server.ownerId === state.peerId || server.peer_roles?.[state.peerId] === "admin";
        if (isAdmin) {
            const addBtn = document.createElement("span");
            addBtn.className = "add-ch-btn";
            addBtn.textContent = "+";
            addBtn.style.cursor = "pointer";
            addBtn.style.fontSize = "18px";
            addBtn.onclick = (e) => { e.stopPropagation(); promptAddChannel(server.id, "text"); };
            cat.appendChild(addBtn);
        }

        list.appendChild(cat);
        textChannels.forEach(ch => {
            const item = createChannelItem(ch, server.id);
            list.appendChild(item);
        });
    }

    if (voiceChannels.length) {
        const cat = document.createElement("div");
        cat.className = "channel-category";
        cat.style.display = "flex";
        cat.style.justifyContent = "space-between";
        cat.style.alignItems = "center";
        cat.innerHTML = `<span><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg> SESLİ KANALLAR</span>`;

        const isAdmin = server.ownerId === state.peerId || server.peer_roles?.[state.peerId] === "admin";
        if (isAdmin) {
            const addBtn = document.createElement("span");
            addBtn.className = "add-ch-btn";
            addBtn.textContent = "+";
            addBtn.style.cursor = "pointer";
            addBtn.style.fontSize = "18px";
            addBtn.onclick = (e) => { e.stopPropagation(); promptAddChannel(server.id, "voice"); };
            cat.appendChild(addBtn);
        }

        list.appendChild(cat);
        voiceChannels.forEach(ch => {
            const item = createChannelItem(ch, server.id);
            list.appendChild(item);
            // Show voice members under voice channels
            const voiceMembers = (server.voiceMembers?.[ch.id]) || [];
            voiceMembers.forEach(m => {
                const vm = document.createElement("div");
                vm.className = "voice-member";
                const av = document.createElement("div");
                av.className = "vm-avatar";
                applyAvatarToElement(av, m.avatar_color, m.avatar_image, m.username);
                vm.appendChild(av);
                const name = document.createElement("span");
                name.textContent = m.username + (m.peer_id === state.peerId ? " (sen)" : "");
                vm.appendChild(name);

                if (m.peer_id !== state.peerId) {
                    vm.style.cursor = "pointer";
                    vm.onclick = () => openUserProfile(m.peer_id, m.username, m.avatar_image, m.avatar_color);
                    vm.oncontextmenu = (e) => {
                        e.preventDefault();
                        showContextMenu(m.peer_id, m.username, e.clientX, e.clientY);
                    };
                }

                list.appendChild(vm);
            });
        });
    }
}

function renderHomeSidebar() {
    const list = document.getElementById("channel-list");
    list.innerHTML = `
        <div class="channel-category">ANA MENÜ</div>
        <div class="channel-item active" onclick="showHomeView()">
            <span class="ch-icon">🏠</span> <span class="ch-name">Giriş</span>
        </div>
        <div class="channel-item" onclick="toast('Yakında...','info')">
            <span class="ch-icon">💬</span> <span class="ch-name">Direkt Mesajlar</span>
        </div>
        <div class="channel-item" onclick="toast('Yakında...','info')">
            <span class="ch-icon">👥</span> <span class="ch-name">Arkadaşlar</span>
        </div>
    `;
}

function createChannelItem(channel, serverId) {
    const server = state.servers.find(s => s.id === serverId);
    const item = document.createElement("div");
    item.className = "channel-item" + (channel.id === state.activeChannelId ? " active" : "");
    item.id = `ch-${channel.id}`;
    item.dataset.ch = channel.id;
    if (channel.type === "text" && isChannelMuted(serverId, channel.id)) {
        item.classList.add("channel-muted");
        item.title = "Bu kanal yerel olarak sessize alındı";
    }

    const icon = document.createElement("span");
    icon.className = "ch-icon";
    icon.textContent = channel.type === "voice" ? "🔊" : "#";

    const name = document.createElement("span");
    name.className = "ch-name";
    name.textContent = channel.name;

    item.appendChild(icon);
    item.appendChild(name);

    // Unread badge
    const unread = server?.unread?.[channel.id] || 0;
    if (unread > 0) {
        const badge = document.createElement("span");
        badge.className = "ch-badge";
        badge.textContent = unread > 99 ? "99+" : unread;
        item.appendChild(badge);
    }

    item.onclick = () => {
        if (channel.type === "voice") showVoiceView(serverId, channel.id);
        else showChatView(serverId, channel.id);
        updateChannelSidebar(serverId);
    };

    item.ondblclick = () => {
        if (channel.type === "voice") {
            joinVoiceChannel(channel.id);
        }
    };

    item.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showChannelContextMenu(e, channel, serverId);
    };

    if (channel.type === "voice") {
        const isAdmin = server && (server.ownerId === state.peerId || server.peer_roles?.[state.peerId] === "admin");

        if (isAdmin) {
            item.ondragover = (e) => e.preventDefault();
            item.ondrop = (e) => {
                e.preventDefault();
                const targetPeer = e.dataTransfer.getData("peerId");
                if (targetPeer && targetPeer !== state.peerId) {
                    state.mesh.broadcast({ type: "force_route", target: targetPeer, targetChannel: channel.id });
                    toast("Kullanıcı yeni odaya yönlendiriliyor...", "info");
                }
            };
        }
    }

    return item;
}

/* ── Members panel ────────────────────────────────────────── */
function updateMembersPanel(serverId) {
    const server = state.servers.find(s => s.id === serverId);
    const lists = [
        document.getElementById("members-list"),
        document.getElementById("voice-members-list")
    ].filter(l => l);
    const counts = [
        document.getElementById("member-count"),
        document.getElementById("voice-member-count")
    ].filter(c => c);
    lists.forEach(l => l.innerHTML = "");
    if (!server) return;

    const members = server.members || [];
    const roles = server.roles || {};
    counts.forEach(c => c.textContent = members.length);

    // Grouping by role
    const groups = {};
    Object.keys(roles).forEach(rid => groups[rid] = []);
    groups["member"] = groups["member"] || [];

    members.forEach(m => {
        const rid = server.peer_roles?.[m.peer_id] || "member";
        if (!groups[rid]) groups[rid] = [];
        groups[rid].push(m);
    });

    const allRids = Array.from(new Set([...Object.keys(roles), ...Object.keys(groups)]));
    const sortedRids = allRids.sort((a, b) => {
        const ra = roles[a] || { name: a.charAt(0).toUpperCase() + a.slice(1), hoist: false };
        const rb = roles[b] || { name: b.charAt(0).toUpperCase() + b.slice(1), hoist: false };
        if (ra.hoist && !rb.hoist) return -1;
        if (!ra.hoist && rb.hoist) return 1;
        return 0;
    });

    sortedRids.forEach(rid => {
        const groupMembers = groups[rid];
        if (groupMembers.length === 0) return;

        const roleData = roles[rid] || { name: rid.charAt(0).toUpperCase() + rid.slice(1), color: 'inherit' };
        lists.forEach(list => {
            const cat = document.createElement("div");
            cat.className = "member-role-cat";
            cat.textContent = `${roleData.name} — ${groupMembers.length}`;
            cat.style.color = "var(--text-muted)";
            cat.style.fontSize = "11px";
            cat.style.fontWeight = "bold";
            cat.style.padding = "16px 12px 8px";
            cat.style.textTransform = "uppercase";
            list.appendChild(cat);
        });

        groupMembers.forEach(m => {
            lists.forEach(list => {
                const item = document.createElement("div");
                item.className = "member-item";
                item.setAttribute("data-peer-id", m.peer_id);

                const isAdmin = server.ownerId === state.peerId || server.peer_roles?.[state.peerId] === "admin";
                if (isAdmin && m.peer_id !== state.peerId) {
                    item.draggable = true;
                    item.ondragstart = (e) => {
                        e.dataTransfer.setData("peerId", m.peer_id);
                    };
                }

                const av = document.createElement("div");
                av.className = "member-avatar";
                applyAvatarToElement(av, m.avatar_color, m.avatar_image, m.username);

                const dot = document.createElement("div");
                dot.className = "status-dot";
                av.appendChild(dot);

                const name = document.createElement("span");
                name.className = "member-name";
                name.textContent = m.username;
                name.style.color = roles[rid]?.color || "inherit";

                if (server.ownerId === m.peer_id) {
                    const crown = document.createElement("span");
                    crown.textContent = " 👑";
                    crown.title = "Sunucu Sahibi";
                    crown.style.fontSize = "12px";
                    name.appendChild(crown);
                }

                item.appendChild(av);
                item.appendChild(name);

                if (m.peer_id === state.peerId) {
                    const tag = document.createElement("span");
                    tag.className = "member-you-tag";
                    tag.textContent = "sen";
                    item.appendChild(tag);
                } else {
                    item.style.cursor = "pointer";
                    item.onclick = () => openUserProfile(m.peer_id, m.username, m.avatar_image, m.avatar_color);
                    item.oncontextmenu = (e) => {
                        e.preventDefault();
                        showContextMenu(m.peer_id, m.username, e.clientX, e.clientY);
                    };
                }

                list.appendChild(item);
            });
        });
    });
}

function updatePeerCountBadge(serverId) {
    const server = state.servers.find(s => s.id === serverId);
    const count = (server?.members?.length || 1);
    document.getElementById("peer-count-badge").textContent = `${count} kişi`;
}

/* ── Messages ─────────────────────────────────────────────── */
function renderMessages(serverId, channelId) {
    const server = state.servers.find(s => s.id === serverId);
    const area = document.getElementById("messages-area");
    const cid = server ? canonicalChannelIdForChat(server, channelId) : channelId;
    const all = server?.messages?.[cid] || [];
    const loadWrap = document.getElementById("messages-load-more-wrap");
    const loadBtn = document.getElementById("messages-load-more-btn");

    if (all.length === 0) {
        if (loadWrap) {
            loadWrap.classList.add("hidden");
            const lb = document.getElementById("messages-load-more-btn");
            if (lb) lb.onclick = null;
        }
        area.innerHTML = `<div class="messages-welcome">
    <div class="messages-welcome-icon">💬</div>
    <h3># ${server?.channels.find(c => c.id === cid)?.name || channelId}</h3>
    <p>Bu kanalın başlangıcı. Merhaba! 👋</p>
  </div>`;
        if (server) {
            if (!server.unread) server.unread = {};
            server.unread[cid] = 0;
            updateChannelSidebar(serverId);
        }
        return;
    }

    if (!server._msgListOffset) server._msgListOffset = {};
    let start = server._msgListOffset[cid];
    if (typeof start !== "number" || start < 0) {
        start = Math.max(0, all.length - CHAT_INITIAL_LIMIT);
        server._msgListOffset[cid] = start;
    }
    start = Math.min(start, Math.max(0, all.length - 1));
    server._msgListOffset[cid] = start;
    const messages = all.slice(start);

    if (loadWrap && loadBtn) {
        if (start > 0) {
            loadWrap.classList.remove("hidden");
            loadBtn.textContent = `Daha eski mesajlar (${start} önceki)`;
            loadBtn.onclick = () => {
                server._msgListOffset[cid] = Math.max(0, start - CHAT_LOAD_MORE_STEP);
                renderMessages(serverId, channelId);
            };
        } else {
            loadWrap.classList.add("hidden");
            loadBtn.onclick = null;
        }
    }

    area.innerHTML = "";
    let lastAuthor = null;

    const pins = server?.pinned_messages || [];
    messages.forEach(msg => {
        const grouped = msg.authorId === lastAuthor && !msg.replyTo;
        const copy = { ...msg };
        if (pins.find(p => p.id === msg.id)) copy.isPinned = true;
        appendMessageDOM(copy, grouped, serverId, { scrollToBottom: true });
        lastAuthor = msg.authorId;
    });

    if (server) {
        if (!server.unread) server.unread = {};
        server.unread[cid] = 0;
        updateChannelSidebar(serverId);
    }
    requestAnimationFrame(() => {
        area.scrollTop = area.scrollHeight;
        hideNewMsgsChip();
    });
}

function hydrateMessageReactions(bubbleEl, msg) {
    const norm = normalizeReactionsMap(msg.reactions);
    msg.reactions = norm;
    if (Object.keys(norm).length === 0) return;
    updateReactionBar(msg.id, norm);
}

function appendMessageDOM(msg, grouped = false, serverId = null, opts = {}) {
    const forceBottom = opts.scrollToBottom === true;
    const area = document.getElementById("messages-area");
    const sid = serverId || state.activeServerId;
    const isSelf = msg.authorId === state.peerId;
    const el = document.createElement("div");
    el.className = "message message-bubble msg-row" + (isSelf ? " msg-row--self" : " msg-row--other") + (grouped ? " grouped" : "");
    el.dataset.msgId = msg.id;
    el.style.position = "relative";

    const inner = document.createElement("div");
    inner.className = "msg-row-inner";

    const avatarDiv = document.createElement("div");
    avatarDiv.className = "msg-avatar";
    applyAvatarToElement(avatarDiv, msg.avatarColor, msg.avatarImage, msg.author);

    const stack = document.createElement("div");
    stack.className = "msg-stack";

    const bubble = document.createElement("div");
    bubble.className = "msg-bubble" + (isSelf ? " msg-bubble--self" : " msg-bubble--other");

    if (!grouped) {
        const header = document.createElement("div");
        header.className = "msg-header";
        const authorSpan = document.createElement("span");
        authorSpan.className = "msg-author" + (isSelf ? " is-you" : "");
        authorSpan.textContent = msg.author;
        if (!isSelf) {
            authorSpan.style.cursor = "pointer";
            authorSpan.onclick = () => openUserProfile(msg.authorId, msg.author, msg.avatarImage, msg.avatarColor);
            authorSpan.oncontextmenu = (e) => {
                e.preventDefault();
                showContextMenu(msg.authorId, msg.author, e.clientX, e.clientY);
            };
        }
        const timeSpan = document.createElement("span");
        timeSpan.className = "msg-time";
        timeSpan.textContent = msg.time;
        header.appendChild(authorSpan);
        header.appendChild(timeSpan);
        bubble.appendChild(header);
    }

    if (msg.replyTo?.messageId) {
        const ref = document.createElement("button");
        ref.type = "button";
        ref.className = "msg-reply-ref" + (grouped ? " msg-reply-ref--compact" : "");
        const sn = escapeHtml((msg.replyTo.snippet || msg.replyTo.text || "").replace(/\s+/g, " ").slice(0, 80));
        ref.innerHTML = `<span class="msg-reply-bar"></span><span class="msg-reply-meta">@${escapeHtml(msg.replyTo.author || "?")}</span><span class="msg-reply-snippet">${sn}</span>`;
        ref.onclick = (e) => {
            e.preventDefault();
            scrollToChatMessage(msg.replyTo.messageId);
        };
        if (!grouped) bubble.insertBefore(ref, bubble.firstChild);
        else bubble.appendChild(ref);
    }

    const textDiv = document.createElement("div");
    textDiv.className = "msg-text";
    textDiv.innerHTML = parseMessageText(msg.text, sid);
    textDiv.addEventListener("click", (e) => {
        const elM = e.target.closest(".mention");
        if (!elM) return;
        const pid = elM.getAttribute("data-peer");
        if (!pid) return;
        const server = state.servers.find(s => s.id === sid);
        const member = server?.members?.find(m => m.peer_id === pid);
        if (member) {
            e.preventDefault();
            openUserProfile(pid, member.username, member.avatar_image, member.avatar_color);
        }
    });

    const onCtx = (e) => {
        e.preventDefault();
        showMsgContextMenu(msg, e.clientX, e.clientY);
    };
    el.oncontextmenu = onCtx;
    bubble.oncontextmenu = onCtx;

    if (msg.attachment) {
        const img = document.createElement("img");
        img.className = "msg-attach-img";
        img.src = msg.attachment;
        img.loading = "lazy";
        img.decoding = "async";
        img.alt = "Ek";
        img.onclick = () => img.classList.toggle("msg-attach-img--expanded");
        textDiv.appendChild(img);
    }

    bubble.appendChild(textDiv);
    stack.appendChild(bubble);
    inner.appendChild(avatarDiv);
    inner.appendChild(stack);
    el.appendChild(inner);

    if (msg.isPinned) {
        el.classList.add("pinned");
        const pinIcon = document.createElement("span");
        pinIcon.className = "pin-badge";
        pinIcon.innerHTML = "📌";
        pinIcon.title = "Sabitlenmiş Mesaj";
        bubble.appendChild(pinIcon);
    }

    hydrateMessageReactions(el, msg);

    const stickBottom = forceBottom || !isChatScrolledUp();
    area.appendChild(el);
    if (stickBottom) {
        area.scrollTop = area.scrollHeight;
        hideNewMsgsChip();
    } else if (!isSelf && msg.channelId === state.activeChannelId && sid === state.activeServerId) {
        showNewMsgsChip();
    }
}

function addSystemMessage(text) {
    const area = document.getElementById("messages-area");
    const el = document.createElement("div");
    el.className = "system-message";
    el.textContent = text;
    const stick = !isChatScrolledUp();
    area.appendChild(el);
    if (stick) {
        area.scrollTop = area.scrollHeight;
        hideNewMsgsChip();
    }
}

/* ── Send chat message ────────────────────────────────────── */
async function sendMessage() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text || !state.activeServerId || !state.activeChannelId) return;

    // Music Bot — yalnızca sesli kanaldaysan; P2P’de voiceChannelId ile aynı odayı eşle
    if (text.startsWith("!play ")) {
        if (!state.voiceChannelId) {
            toast("Müzik için önce bir sesli kanala katıl.", "warning");
            return;
        }
        const query = text.slice(6).trim();
        if (!query) {
            toast("Kullanım: !play şarkı adı veya YouTube linki", "info");
            return;
        }
        input.value = "";
        input.style.height = "auto";

        const vch = state.voiceChannelId;
        const firePlay = (videoId) => {
            const startAt = Date.now();
            meshBroadcastReliable({
                type: "music_play",
                videoId,
                startAt,
                voiceChannelId: vch,
            });
            startMusicBot(videoId, startAt);
        };

        const directId = extractYouTubeVideoId(query);
        if (directId) {
            addSystemMessage("🎵 YouTube videosu başlatılıyor…");
            firePlay(directId);
            return;
        }

        addSystemMessage(`🎵 Aranıyor: "${query}"…`);
        fetch(`${API_BASE}/ytsearch?q=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                if (data.id) firePlay(data.id);
                else addSystemMessage("❌ Müzik bulunamadı.");
            })
            .catch(() => addSystemMessage("❌ Sunucu araması başarısız."));
        return;
    } else if (text === "!stop" || text === "!skip") {
        if (!state.voiceChannelId) {
            toast("Sesli kanalda değilsin.", "warning");
            return;
        }
        meshBroadcastReliable({ type: "music_stop", voiceChannelId: state.voiceChannelId });
        stopMusicBot();
        input.value = "";
        input.style.height = "auto";
        return;
    } else if (text === "!pause") {
        if (!state.voiceChannelId) {
            toast("Sesli kanalda değilsin.", "warning");
            return;
        }
        meshBroadcastReliable({ type: "music_pause", voiceChannelId: state.voiceChannelId });
        if (state.musicBot && state.musicBot.player && typeof state.musicBot.player.pauseVideo === "function") {
            state.musicBot.player.pauseVideo();
        }
        input.value = "";
        input.style.height = "auto";
        return;
    } else if (text === "!resume") {
        if (!state.voiceChannelId) {
            toast("Sesli kanalda değilsin.", "warning");
            return;
        }
        meshBroadcastReliable({ type: "music_resume", voiceChannelId: state.voiceChannelId });
        if (state.musicBot && state.musicBot.player && typeof state.musicBot.player.playVideo === "function") {
            state.musicBot.player.playVideo();
        }
        input.value = "";
        input.style.height = "auto";
        return;
    }

    let finalJoinText = text;
    if (state.translationEnabled) {
        toast("Çeviriliyor...", "info");
        finalJoinText = await translateText(text, state.targetLang);
    }

    const msg = {
        type: "chat",
        channelId: state.activeChannelId,
        text: finalJoinText,
        author: state.username,
        authorId: state.peerId,
        avatarColor: state.avatarColor,
        avatarImage: state.avatarImage,
        time: now(),
        id: genId(),
        isPinned: false
    };

    if (state.replyTo?.messageId) {
        msg.replyTo = {
            messageId: state.replyTo.messageId,
            author: state.replyTo.author,
            authorId: state.replyTo.authorId,
            snippet: (state.replyTo.text || "").slice(0, 120),
            text: (state.replyTo.text || "").slice(0, 200),
        };
    }

    // V16: Server-side Persistence
    fetch(`${API_BASE}/rooms/${state.activeServerId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg })
    });

    input.value = "";
    input.style.height = "auto";

    clearReplyTarget();
    saveMessage(state.activeServerId, msg);
    meshBroadcastReliable({ type: "chat", payload: msg });
}

/** !play: youtube.com/watch, embed/, youtu.be veya 11 karakter id */
function extractYouTubeVideoId(query) {
    const s = String(query || "").trim();
    const m = s.match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
    if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
    return null;
}

function renderPlainChatSegment(segment, serverId) {
    const chunks = [];
    let i = 0;
    const str = String(segment);
    while (i < str.length) {
        const o = str.indexOf("||", i);
        if (o === -1) {
            chunks.push({ kind: "text", v: str.slice(i) });
            break;
        }
        if (o > i) chunks.push({ kind: "text", v: str.slice(i, o) });
        const c = str.indexOf("||", o + 2);
        if (c === -1) {
            chunks.push({ kind: "text", v: str.slice(o) });
            break;
        }
        chunks.push({ kind: "spoiler", v: str.slice(o + 2, c) });
        i = c + 2;
    }
    return chunks.map(ch => {
        if (ch.kind === "spoiler") {
            return `<span class="spoiler" title="Göstermek için tıkla" onclick="this.classList.toggle('revealed')">${escapeHtml(ch.v)}</span>`;
        }
        return applyMentionsThenEscape(ch.v, serverId);
    }).join("");
}

function applyMentionsThenEscape(text, serverId) {
    let s = String(text);
    const ph = [];
    if (serverId) {
        const server = state.servers.find(ss => ss.id === serverId);
        const members = server?.members || [];
        const names = [...new Set(members.map(m => m.username).filter(Boolean))].sort((a, b) => b.length - a.length);
        names.forEach(name => {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const re = new RegExp(`(^|\\s)@${escaped}(?!\\w)`, "g");
            s = s.replace(re, (full, lead) => {
                const member = members.find(mm => mm.username === name);
                const idx = ph.length;
                ph.push(`<span class="mention" data-peer="${escapeHtml(member?.peer_id || "")}">${escapeHtml("@" + (member?.username || name))}</span>`);
                return `${lead}\uE000${idx}\uE001`;
            });
        });
    }
    s = escapeHtml(s);
    for (let i = 0; i < ph.length; i++) {
        s = s.split(`\uE000${i}\uE001`).join(ph[i]);
    }
    return s;
}

function parseMessageText(text, serverId) {
    if (!text) return "";
    const sid = arguments.length >= 2 ? serverId : state.activeServerId;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return String(text).split(urlRegex).map(part => {
        if (part.match(urlRegex)) {
            // Check for images
            if (part.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)) {
                return `<a href="${part}" target="_blank" class="rich-link"><img src="${part}" class="chat-embed-img" alt="" loading="lazy" decoding="async" /></a>`;
            }
            // Check for YouTube
            const ytMatch = part.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (ytMatch) {
                return `<div class="chat-embed-video"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe></div>`;
            }
            // Generic link
            return `<a href="${part}" target="_blank" class="chat-link">${part}</a>`;
        }
        return renderPlainChatSegment(part, sid);
    }).join("");
}

async function translateText(text, target = "tr") {
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json && json[0]) {
            return json[0].map(x => x[0]).join("");
        }
        return text;
    } catch (e) {
        console.error("Translation failed", e);
        return text;
    }
}

function saveMessage(serverId, msg) {
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return;
    if (msg.reactions) msg.reactions = normalizeReactionsMap(msg.reactions);
    const cid = canonicalChannelIdForChat(server, msg.channelId);
    const normalized = cid !== msg.channelId ? { ...msg, channelId: cid } : msg;

    if (!server.messages) server.messages = {};
    if (!server.messages[normalized.channelId]) server.messages[normalized.channelId] = [];
    server.messages[normalized.channelId].push(normalized);

    const activeCanon = canonicalChannelIdForChat(server, state.activeChannelId);
    // If this is the active channel, append to DOM
    if (normalized.channelId === activeCanon && serverId === state.activeServerId) {
        const msgs = server.messages[normalized.channelId];
        const prev = msgs[msgs.length - 2];
        const grouped = prev && prev.authorId === normalized.authorId && !normalized.replyTo;
        appendMessageDOM(normalized, grouped, serverId);
    } else {
        // Mark unread (skip when this channel is locally muted)
        if (!isChannelMuted(serverId, normalized.channelId)) {
            if (!server.unread) server.unread = {};
            server.unread[normalized.channelId] = (server.unread[normalized.channelId] || 0) + 1;
        }
        updateChannelSidebar(serverId);
    }
}

/* ── Typing Indicators ────────────────────────────────────── */
function broadcastTypingIndicator() {
    if (!state.mesh || !state.activeServerId || !state.activeChannelId) return;
    
    meshBroadcastReliable({
        type: "typing_start",
        serverId: state.activeServerId,
        channelId: state.activeChannelId,
        username: state.username,
        peerId: state.peerId
    });
    
    // Clear any previous timeout
    if (state._typingTimeout) clearTimeout(state._typingTimeout);
    
    // Stop typing after 3 seconds of inactivity
    state._typingTimeout = setTimeout(() => {
        meshBroadcastReliable({
            type: "typing_stop",
            serverId: state.activeServerId,
            channelId: state.activeChannelId,
            peerId: state.peerId
        });
    }, 3000);
}

function updateTypingIndicator(serverId, channelId, peerId, username, isTyping) {
    const key = `${serverId}-${channelId}`;
    if (!state.typingIndicators[key]) {
        state.typingIndicators[key] = {};
    }
    
    if (isTyping) {
        state.typingIndicators[key][peerId] = { username, timestamp: Date.now() };
    } else {
        delete state.typingIndicators[key][peerId];
    }
    
    // Update typing display
    if (serverId === state.activeServerId && channelId === state.activeChannelId) {
        updateTypingDisplay();
    }
}

function updateTypingDisplay() {
    const key = `${state.activeServerId}-${state.activeChannelId}`;
    const typing = Object.values(state.typingIndicators[key] || {});
    const typingEl = document.getElementById("typing-indicator");
    
    if (!typingEl) return;
    
    if (typing.length === 0) {
        typingEl.classList.add("hidden");
        return;
    }
    
    const names = typing.map(t => t.username).join(", ");
    const count = typing.length;
    typingEl.classList.remove("hidden");
    
    if (count === 1) {
        typingEl.textContent = `${names} yazıyor...`;
    } else if (count === 2) {
        typingEl.textContent = `${names} yazıyor...`;
    } else {
        typingEl.textContent = `${count} kişi yazıyor...`;
    }
}

/* ── User Notes & Profiles ────────────────────────────────── */
function saveUserNote(peerId, note) {
    state.userNotes[peerId] = note;
    localStorage.setItem(`scord_note_${peerId}`, note);
}

function getUserNote(peerId) {
    if (!state.userNotes[peerId]) {
        const saved = localStorage.getItem(`scord_note_${peerId}`);
        if (saved) state.userNotes[peerId] = saved;
    }
    return state.userNotes[peerId] || "";
}

function mergeMessageHistoryIntoServer(server, incoming) {
    if (!server || !incoming || typeof incoming !== "object") return;
    if (!server.messages) server.messages = {};
    Object.keys(incoming).forEach(chId => {
        const canonical = canonicalChannelIdForChat(server, chId);
        const inc = incoming[chId];
        if (!Array.isArray(inc) || inc.length === 0) return;
        if (!server.messages[canonical]) server.messages[canonical] = [];
        const target = server.messages[canonical];
        const seen = new Set(target.map(m => m.id));
        for (const m of inc) {
            if (m && m.id && !seen.has(m.id)) {
                target.push(m);
                seen.add(m.id);
            }
        }
        target.sort((a, b) => String(a.time || "").localeCompare(String(b.time || ""), "tr"));
    });
}

/* ── Server creation ──────────────────────────────────────── */
async function createServer(name) {
    // POST to signaling server to register the room
    const res = await scordFetch(`${API_BASE}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, owner_id: state.peerId }),
    });
    if (!res.ok) return;
    const created = await res.json();
    const room_id = created.room_id;
    const inviteCode = created.invite_code || "";

    const server = {
        id: room_id,
        name: name,
        ownerId: state.peerId,
        inviteCode,
        channels: [
            { id: "ch-genel", name: "genel", type: "text" },
            { id: "ch-duyurular", name: "duyurular", type: "text" },
            { id: "ch-sesli", name: "sesli-sohbet", type: "voice" },
            { id: "ch-muzik", name: "müzik", type: "voice" },
        ],
        roles: {
            "admin": { name: "Admin", color: "#ef4444", hoist: true },
            "member": { name: "Üye", color: "#94a3b8", hoist: false }
        },
        peer_roles: { [state.peerId]: "admin" },
        members: [{
            peer_id: state.peerId,
            username: state.username,
            avatar_color: state.avatarColor,
            avatar_image: state.avatarImage,
        }],
        messages: {},
        unread: {},
        voiceMembers: {},
        voiceSessionHost: {},
        channel_backgrounds: {},
    };

    state.servers.push(server);
    renderServerRail();
    connectToRoom(room_id);
    const sidebarName = document.getElementById("sidebar-server-name");
    if (sidebarName) sidebarName.textContent = name;
    if (server.channels && server.channels.length > 0) {
        showChatView(server.id, server.channels[0].id);
    }
    toast(`"${name}" sunucusu oluşturuldu! 🎉`, "success");
    return server;
}

function promptAddChannel(serverId, type) {
    const title = type === "voice" ? "Yeni Sesli Kanal Oluştur" : "Yeni Metin Kanalı Oluştur";
    const body = `
        <div style="margin-bottom: 15px;">
            <label style="display: block; margin-bottom: 5px; color: var(--text-muted); font-size: 12px; font-weight: bold; text-transform: uppercase;">KANAL ADI</label>
            <input type="text" id="new-ch-name" placeholder="kanal-adı" style="width: 100%; padding: 10px; background: var(--bg-dark); border: none; border-radius: 4px; color: var(--text-normal); outline: none;">
        </div>
    `;
    const footer = `
        <button class="btn-secondary" onclick="hideModal()">İptal</button>
        <button class="btn-primary" onclick="submitAddChannel('${serverId}', '${type}')">Kanal Oluştur</button>
    `;
    showModal(title, body, footer);
    setTimeout(() => document.getElementById("new-ch-name").focus(), 100);
}

async function submitAddChannel(serverId, type) {
    const nameInput = document.getElementById("new-ch-name");
    const name = nameInput.value.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return toast("Bir kanal adı girmelisin.", "error");

    const res = await fetch(`${API_BASE}/rooms/${serverId}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type })
    });
    const newCh = await res.json();

    if (newCh.error) return toast(newCh.error, "error");

    const server = state.servers.find(s => s.id === serverId);
    if (server) {
        server.channels.push(newCh);
        if (state.mesh) {
            state.mesh.broadcast({ type: "channel_create", payload: { serverId, channel: newCh } });
        }
        updateChannelSidebar(serverId);
    }

    hideModal();
    toast(`#${name} kanalı oluşturuldu.`, "success");
}

/* ── Join existing server ─────────────────────────────────── */
async function joinServer(roomId) {
    // Check room exists
    const rooms = await fetch(`${API_BASE}/rooms`).then(r => r.json());
    const room = rooms.find(r => r.room_id === roomId);
    if (!room) { toast("Sunucu bulunamadı.", "error"); return; }

    // Check not already joined
    if (state.servers.find(s => s.id === roomId)) {
        toast("Zaten bu sunucudasın.", "info");
        return;
    }

    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const peerList = (room.peers || []).map(p => ({
        peer_id: p.peer_id,
        username: p.username,
        avatar_color: p.avatar_color,
        avatar_image: p.avatar_image ?? null,
    }));
    if (!peerList.some(m => m.peer_id === state.peerId)) {
        peerList.push({
            peer_id: state.peerId,
            username: state.username,
            avatar_color: state.avatarColor,
            avatar_image: state.avatarImage,
        });
    }
    const server = {
        id: roomId,
        name: room.name,
        color,
        ownerId: room.owner_id,
        inviteCode: room.invite_code,
        channels: room.channels || [
            { id: "ch-genel", name: "genel", type: "text" },
            { id: "ch-duyurular", name: "duyurular", type: "text" },
            { id: "ch-sesli", name: "sesli-sohbet", type: "voice" },
            { id: "ch-muzik", name: "müzik", type: "voice" },
        ],
        roles: room.roles || {},
        peer_roles: room.peer_roles || {},
        members: peerList,
        messages: room.messages || {},
        pinned_messages: room.pinned_messages || [],
        unread: {},
        voiceMembers: {},
        voiceSessionHost: {},
        channel_backgrounds: room.channel_backgrounds || {},
    };

    state.servers.push(server);
    renderServerRail();
    connectToRoom(roomId);
    const firstText = server.channels.find(c => c.type === "text");
    showChatView(server.id, firstText ? firstText.id : server.channels[0].id);
    toast(`"${room.name}" sunucusuna katıldın! 👋`, "success");
}

/* ── P2P Mesh connection management ──────────────────────── */
function connectToRoom(roomId) {
    state._p2pOutbox = [];
    clearRttPingTimer();
    // Disconnect old mesh if any
    if (state.mesh) {
        clearMeshHealthPoll();
        state.mesh.disconnect();
        state.mesh = null;
    }

    const wsUrl = `${WS_BASE}`;
    state.mesh = new P2PMesh(roomId, state.peerId, wsUrl, {
        onMessage: (fromPeerId, data) => handleIncomingP2P(fromPeerId, data, roomId),
        onPeerJoined: (peerId, info) => handlePeerJoined(peerId, info, roomId),
        onPeerLeft: (peerId) => handlePeerLeft(peerId, roomId),
        onVoiceStream: (peerId, stream) => handleVoiceStream(peerId, stream),
        onTrackAdded: (peerId, track, stream) => handleTrackAdded(peerId, track, stream),
        onPeerConnected: (peerId) => handlePeerConnected(peerId, roomId),
        onStatusChange: (status) => updateConnectionStatus(status),
    });

    attachMeshBroadcastSync(state.mesh, roomId);
    state.mesh.connect(state.username, state.avatarColor, state.avatarImage);
    startRttPingTimer();
    startMeshHealthPoll();
    refreshConnectionBadge();
}

function connectMesh(serverId) {
    if (!serverId) return;
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return;
    connectToRoom(serverId);
}

/* ── P2P event handlers ───────────────────────────────────── */
function handleIncomingP2P(fromPeerId, data, roomId) {
    if (data && data.type === "broadcast" && data.payload && typeof data.payload === "object") {
        handleIncomingP2P(fromPeerId, data.payload, roomId);
        return;
    }
    if (!data || typeof data !== "object") return;

    if (data.type === "latency_ping") {
        state.mesh?.sendTo(fromPeerId, { type: "latency_pong", pingId: data.pingId, t0: data.t0 });
        return;
    }
    if (data.type === "latency_pong" && data.t0 != null) {
        const rtt = Date.now() - data.t0;
        state.peerRttMs = state.peerRttMs || {};
        state.peerLatencyMs = state.peerLatencyMs || {};
        state.peerRttMs[fromPeerId] = rtt;
        state.peerLatencyMs[fromPeerId] = Math.round(rtt / 2);
        updateVoiceSessionMeta();
        return;
    }

    if (data._sync) {
        const trip = Date.now() - data._sync.sentAt;
        const oneWay = Math.min(9999, Math.round(trip / 2));
        state.peerIngressMs = state.peerIngressMs || {};
        state.peerIngressMs[fromPeerId] = oneWay;
        const { _sync, ...rest } = data;
        data = rest;
        updateVoiceSessionMeta();
    }

    if (data.type === "chat") {
        const msg = data.payload;
        saveMessage(roomId, msg);
        const srv = state.servers.find(s => s.id === roomId);
        const msgCanon = srv ? canonicalChannelIdForChat(srv, msg.channelId) : msg.channelId;
        const activeCanon = srv ? canonicalChannelIdForChat(srv, state.activeChannelId) : state.activeChannelId;
        const inactive = msgCanon !== activeCanon || roomId !== state.activeServerId;
        if (inactive && shouldShowChatToast(msg)) {
            toast(`${msg.author}: ${(msg.text || "").slice(0, 60)}`, "info");
        }
        if (!inactive && msg.authorId !== state.peerId) {
            announceA11y(`${msg.author} yazdı`);
        }
    } else if (data.type === "dm") {
        if (!state.dms) state.dms = {};
        if (!state.dms[fromPeerId]) state.dms[fromPeerId] = [];
        state.dms[fromPeerId].push(data.payload);

        addToRecentDMs(fromPeerId, data.payload.author, data.payload.avatarColor, data.payload.avatarImage);

        if (state.activeDM === fromPeerId) {
            renderDMMessages(fromPeerId);
        } else if (state.notifSettings?.dm !== false) {
            toast(`Özel Mesaj (DM) - ${data.payload.author}: ${(data.payload.text || "").slice(0, 60)}`, "info");
        }
    } else if (data.type === "identity_announce" || data.type === "profile_update") {
        const payload = data.type === "identity_announce" ? data : data.payload;
        const uname = payload.username || payload.name;
        const acol = payload.avatarColor || payload.avatar_color;
        const aimg = payload.avatarImage ?? payload.avatar_image;

        const server = state.servers.find(s => s.id === roomId);
        if (server) {
            if (!server.members) server.members = [];
            let memberIdx = server.members.findIndex(m => m.peer_id === fromPeerId);
            if (memberIdx === -1) {
                server.members.push({
                    peer_id: fromPeerId,
                    username: uname || "Anonim",
                    avatar_color: acol || "#7c3aed",
                    avatar_image: aimg ?? null,
                });
            } else {
                if (uname) server.members[memberIdx].username = uname;
                if (acol) server.members[memberIdx].avatar_color = acol;
                if (aimg !== undefined) server.members[memberIdx].avatar_image = aimg;
            }
        }

        if (state.activeServerId === roomId) {
            updateMembersPanel(roomId);
            updatePeerCountBadge(roomId);
        }
    } else if (data.type === "voice_join") {
        // Only update local UI/state. Do NOT reply with voice_state_sync here,
        // otherwise peers can enter a join<->sync ping-pong loop.
        const server = state.servers.find(s => s.id === roomId);
        if (server) {
            if (!server.voiceMembers) server.voiceMembers = {};
            const ch = canonicalVoiceChannelId(server, data.channelId);

            // Remove the user from other voice channels within the same room
            Object.keys(server.voiceMembers).forEach(chId => {
                if (chId !== ch) {
                    server.voiceMembers[chId] = server.voiceMembers[chId].filter(m => m.peer_id !== fromPeerId);
                }
            });

            if (!server.voiceMembers[ch]) server.voiceMembers[ch] = [];
            const othersBeforeJoin = server.voiceMembers[ch].filter(m => m.peer_id !== fromPeerId);
            if (othersBeforeJoin.length === 0) {
                ensureVoiceSessionHost(server, ch, fromPeerId, data.username);
            }

            let member = server.voiceMembers[ch].find(m => m.peer_id === fromPeerId);

            if (!member) {
                member = {
                    peer_id: fromPeerId,
                    username: data.username,
                    avatar_color: data.avatarColor,
                    avatar_image: data.avatarImage,
                    isSharingScreen: !!data.isSharingScreen,
                    isSharingCamera: !!data.isSharingCamera
                };
                server.voiceMembers[ch].push(member);
            } else {
                member.username = data.username;
                member.avatar_color = data.avatarColor;
                member.avatar_image = data.avatarImage;
                member.isSharingScreen = !!data.isSharingScreen;
                member.isSharingCamera = !!data.isSharingCamera;
            }

            updateChannelSidebar(roomId);
            if (state.activeChannelId === ch || state.voiceChannelId === ch) {
                renderVoiceParticipants(roomId, ch);
                updateVoiceSessionMeta();
            }
            updateMuteStates();

            // Notify user about new participant (join only)
            if (data.username && data.username !== state.username && state.notifSettings?.join !== false) {
                const key = `${fromPeerId}-join`;
                if (!state.recentVoiceToasts.has(key)) {
                    toast(`${data.username} sesli kanala katıldı!`, "info");
                    playSound(523, SCORD_T().SOUND_JOIN_MS ?? 300);
                    state.recentVoiceToasts.add(key);
                    setTimeout(() => state.recentVoiceToasts.delete(key), SCORD_T().VOICE_NOTIFY_DEDUP_MS ?? 10000);
                }
            }
        }

    } else if (data.type === "voice_state_request") {
        // New user is requesting voice state. Respond with all participants in this channel.
        const server = state.servers.find(s => s.id === roomId);
        if (server?.voiceMembers && state.voiceChannelId) {
            const ch = canonicalVoiceChannelId(server, data.channelId);
            const members = server.voiceMembers[ch] || [];
            // Respond to the requester with all members in this channel
            state.mesh?.sendTo(fromPeerId, {
                type: "voice_state_list",
                channelId: ch,
                members: members
            });
        }

    } else if (data.type === "voice_state_sync") {
        // State synchronization: update membership flags only.
        // No toasts/sounds here.
        const server = state.servers.find(s => s.id === roomId);
        if (server && server.voiceMembers) {
            const ch = canonicalVoiceChannelId(server, data.channelId);
            if (!server.voiceMembers[ch]) server.voiceMembers[ch] = [];

            let member = server.voiceMembers[ch].find(m => m.peer_id === fromPeerId);
            if (!member) {
                member = {
                    peer_id: fromPeerId,
                    username: data.username,
                    avatar_color: data.avatarColor,
                    avatar_image: data.avatarImage,
                    isSharingScreen: !!data.isSharingScreen,
                    isSharingCamera: !!data.isSharingCamera
                };
                server.voiceMembers[ch].push(member);
            } else {
                member.username = data.username;
                member.avatar_color = data.avatarColor;
                member.avatar_image = data.avatarImage;
                member.isSharingScreen = !!data.isSharingScreen;
                member.isSharingCamera = !!data.isSharingCamera;
            }

            if (state.activeChannelId === ch || state.voiceChannelId === ch) renderVoiceParticipants(roomId, ch);
            updateMuteStates();
        }

    } else if (data.type === "voice_leave") {
        const server = state.servers.find(s => s.id === roomId);
        if (server?.voiceMembers) {
            const leaveCh = data.channelId ? canonicalVoiceChannelId(server, data.channelId) : null;
            if (leaveCh) transferVoiceSessionHost(server, leaveCh, fromPeerId);
            Object.keys(server.voiceMembers).forEach(chId => {
                server.voiceMembers[chId] = server.voiceMembers[chId].filter(m => m.peer_id !== fromPeerId);
            });
            updateChannelSidebar(roomId);
            if (state.activeServerId === roomId) {
                const vch = leaveCh || state.voiceChannelId || state.activeChannelId;
                renderVoiceParticipants(roomId, vch);
                updateVoiceSessionMeta();
            }
            updateMuteStates();

            // Notify user about leaving participant
            const member = server.members?.find(m => m.peer_id === fromPeerId);
            if (member && member.username !== state.username) {
                const key = `${fromPeerId}-leave`;
                if (!state.recentVoiceToasts.has(key)) {
                    toast(`${member.username} sesli kanaldan ayrıldı.`, "info");
                    playSound(330, SCORD_T().SOUND_LEAVE_MS ?? 300);
                    state.recentVoiceToasts.add(key);
                    setTimeout(() => state.recentVoiceToasts.delete(key), SCORD_T().VOICE_NOTIFY_DEDUP_MS ?? 10000);
                }
            }
        }
    } else if (data.type === "msg_pin_toggle") {
        const server = state.servers.find(s => s.id === roomId);
        if (server && data.payload) {
            const { msgId, isPinned, msg } = data.payload;
            const chId = msg?.channelId;
            if (!server.pinned_messages) server.pinned_messages = [];
            if (isPinned && msg) {
                if (!server.pinned_messages.find(m => m.id === msgId)) server.pinned_messages.push(msg);
            } else {
                server.pinned_messages = server.pinned_messages.filter(m => m.id !== msgId);
            }
            if (chId && server.messages?.[chId]) {
                const live = server.messages[chId].find(m => m.id === msgId);
                if (live) live.isPinned = !!isPinned;
            }
            if (state.activeServerId === roomId && chId && state.activeChannelId === chId) {
                renderMessages(roomId, chId);
                applyChannelBackground(roomId, chId);
            }
        }
    } else if (data.type === "msg_delete") {
        const { channelId: delCh, msgId } = data.payload || {};
        const server = state.servers.find(s => s.id === roomId);
        if (server && delCh && msgId && server.messages?.[delCh]) {
            server.messages[delCh] = server.messages[delCh].filter(m => m.id !== msgId);
            server.pinned_messages = (server.pinned_messages || []).filter(m => m.id !== msgId);
            if (state.activeServerId === roomId && state.activeChannelId === delCh) {
                renderMessages(roomId, delCh);
            }
        }
    } else if (data.type === "voice_force_disconnect") {
        if (data.target === state.peerId && state.voiceChannelId) {
            leaveVoiceChannel();
            toast("Bir moderatör seni ses kanalından çıkardı.", "warning");
        }
    } else if (data.type === "music_play") {
        const vch = data.voiceChannelId;
        if (!state.voiceChannelId) return;
        if (vch && vch !== state.voiceChannelId) return;
        startMusicBot(data.videoId, data.startAt);
    } else if (data.type === "music_stop") {
        const vch = data.voiceChannelId;
        if (vch && state.voiceChannelId && vch !== state.voiceChannelId) return;
        if (state.voiceChannelId) stopMusicBot();
    } else if (data.type === "music_pause") {
        const vch = data.voiceChannelId;
        if (vch && state.voiceChannelId && vch !== state.voiceChannelId) return;
        if (state.voiceChannelId && state.musicBot.player && typeof state.musicBot.player.pauseVideo === "function") {
            state.musicBot.player.pauseVideo();
        }
    } else if (data.type === "music_resume") {
        const vch = data.voiceChannelId;
        if (vch && state.voiceChannelId && vch !== state.voiceChannelId) return;
        if (state.voiceChannelId && state.musicBot.player && typeof state.musicBot.player.playVideo === "function") {
            state.musicBot.player.playVideo();
        }
    } else if (data.type === "typing_start") {
        // Handle typing indicator start
        updateTypingIndicator(data.serverId, data.channelId, fromPeerId, data.username, true);
    } else if (data.type === "typing_stop") {
        // Handle typing indicator stop
        updateTypingIndicator(data.serverId, data.channelId, fromPeerId, data.username, false);
    } else if (data.type === "voice_status") {
        const server = state.servers.find(s => s.id === roomId);
        if (server?.voiceMembers) {
            const prefer = data.channelId != null ? canonicalVoiceChannelId(server, data.channelId) : null;
            const order = prefer && server.voiceMembers[prefer]
                ? [prefer, ...Object.keys(server.voiceMembers).filter(k => k !== prefer)]
                : Object.keys(server.voiceMembers);
            for (const chId of order) {
                const list = server.voiceMembers[chId];
                if (!list) continue;
                const member = list.find(m => m.peer_id === fromPeerId);
                if (member) {
                    member.isSpeaking = !!data.speaking;
                    if (state.activeServerId === roomId && (state.activeChannelId === chId || state.voiceChannelId === chId)) {
                        renderVoiceParticipants(roomId, chId);
                    }
                    break;
                }
            }
        }
    } else if (data.type === "voice_state_list") {
        // Receiving list of voice members from a peer. Update all members.
        const server = state.servers.find(s => s.id === roomId);
        if (server?.voiceMembers && data.members && Array.isArray(data.members)) {
            const ch = canonicalVoiceChannelId(server, data.channelId);
            if (!server.voiceMembers[ch]) server.voiceMembers[ch] = [];
            
            // Merge received members with existing list (don't duplicate)
            data.members.forEach(m => {
                if (!server.voiceMembers[ch].find(existing => existing.peer_id === m.peer_id)) {
                    server.voiceMembers[ch].push(m);
                } else {
                    // Update existing member's info
                    const existing = server.voiceMembers[ch].find(x => x.peer_id === m.peer_id);
                    Object.assign(existing, m);
                }
            });
            
            if (state.activeServerId === roomId && (state.activeChannelId === ch || state.voiceChannelId === ch)) {
                renderVoiceParticipants(roomId, ch);
            }
        }

    } else if (data.type === "screen_status" || data.type === "video_status") {
        const server = state.servers.find(s => s.id === roomId);
        const chId = data.channelId || state.voiceChannelId || state.activeChannelId;
        if (server?.voiceMembers?.[chId]) {
            const member = server.voiceMembers[chId].find(m => m.peer_id === fromPeerId);
            if (member) {
                if (data.type === "screen_status") {
                    member.isSharingScreen = !!data.sharing;
                } else {
                    member.isSharingCamera = !!(data.sharing ?? data.sharingCamera);
                }
                if (state.activeServerId === roomId && (state.activeChannelId === chId || state.voiceChannelId === chId)) {
                    renderVoiceParticipants(roomId, chId);
                }
            }
        }
    } else if (data.type === "server_update") {
        const payload = data.payload;
        const idx = state.servers.findIndex(s => s.id === payload.id);
        if (idx !== -1) {
            mergeRoomPayloadIntoServer(state.servers[idx], payload);
            if (state.activeServerId === payload.id) {
                document.getElementById("sidebar-server-name").textContent = state.servers[idx].name;
                updateChannelSidebar(payload.id);
                updateMembersPanel(payload.id);
                applyChannelBackground(payload.id, state.activeChannelId);
            }
        }
    } else if (data.type === "channel_create") {
        const { serverId, channel } = data.payload;
        const server = state.servers.find(s => s.id === serverId);
        if (server) {
            if (!server.channels.find(c => c.id === channel.id)) {
                server.channels.push(channel);
                if (state.activeServerId === serverId) {
                    updateChannelSidebar(serverId);
                }
                toast(`#${channel.name} kanalı eklendi.`, "info");
            }
        }
    } else if (data.type === "history_sync") {
        const server = state.servers.find(s => s.id === roomId);
        if (server) {
            mergeMessageHistoryIntoServer(server, data.messages || {});
            if (data.roles) server.roles = { ...data.roles, ...(server.roles || {}) };
            if (state.activeServerId === roomId) {
                renderMessages(roomId, state.activeChannelId);
                updateMembersPanel(roomId);
            }
        }
    } else if (data.type === "force_kick" && data.target === state.peerId) {
        const server = state.servers.find(s => s.id === roomId);
        if (server && (server.ownerId === fromPeerId || server.peer_roles?.[fromPeerId] === "admin")) {
            if (state.voiceChannelId) leaveVoiceChannel();
            if (state.mesh) { state.mesh.disconnect(); state.mesh = null; }
            toast("Bir yönetici tarafından sunucudan atıldın. 🚪", "error");
        }
    } else if (data.type === "force_mute" && data.target === state.peerId) {
        const server = state.servers.find(s => s.id === roomId);
        if (server && (server.ownerId === fromPeerId || server.peer_roles?.[fromPeerId] === "admin" || server.peer_roles?.[fromPeerId] === "mod")) {
            if (state.mesh?.localStream) {
                state.mesh.localStream.getAudioTracks().forEach(t => { t.enabled = false; });
                state.micMuted = true;
                document.getElementById("voice-mute-btn")?.classList.add("active");
            }
            toast("Bir yönetici tarafından sesin kapatıldı. \uD83D\uDD07", "warn");
        }
    } else if (data.type === "force_route" && data.target === state.peerId) {
        const server = state.servers.find(s => s.id === roomId);
        if (server && (server.ownerId === fromPeerId || server.peer_roles?.[fromPeerId] === "admin" || server.peer_roles?.[fromPeerId] === "mod")) {
            toast("Bir yetkili tarafından odan değiştirildi.", "warning");
            if (state.voiceChannelId) leaveVoiceChannel();
            setTimeout(() => joinVoiceChannel(data.targetChannel), SCORD_T().FORCE_ROUTE_VOICE_JOIN_DELAY_MS ?? 200);
        }
    }
}
function handlePeerJoined(peerId, info, roomId) {
    const server = state.servers.find(s => s.id === roomId);
    if (!server) return;

    // Standardize properties (handle both Snake Case and Camel Case)
    const username = info.username || "Anonim";
    const color = info.avatar_color || info.avatarColor || "#7c3aed";
    const image = info.avatar_image || info.avatarImage || null;

    if (!server.members) server.members = [];

    const existingIdx = server.members.findIndex(m => m.peer_id === peerId);
    if (existingIdx === -1) {
        server.members.push({
            peer_id: peerId,
            username: username,
            avatar_color: color,
            avatar_image: image
        });
    } else {
        server.members[existingIdx].username = username;
        server.members[existingIdx].avatar_color = color;
        server.members[existingIdx].avatar_image = image;
    }

    if (state.activeServerId === roomId) {
        updateMembersPanel(roomId);
        updatePeerCountBadge(roomId);
    }

    renderServerRail();
}

function handlePeerLeft(peerId, roomId) {
    const server = state.servers.find(s => s.id === roomId);
    if (!server) return;

    server.members = (server.members || []).filter(m => m.peer_id !== peerId);

    if (server.voiceMembers && server.voiceSessionHost) {
        Object.keys(server.voiceMembers).forEach(chId => {
            if ((server.voiceMembers[chId] || []).some(m => m.peer_id === peerId)) {
                transferVoiceSessionHost(server, chId, peerId);
            }
        });
    }

    if (server.voiceMembers) {
        Object.keys(server.voiceMembers).forEach(chId => {
            server.voiceMembers[chId] = server.voiceMembers[chId].filter(m => m.peer_id !== peerId);
        });
    }

    if (state.peerLatencyMs) delete state.peerLatencyMs[peerId];
    if (state.peerIngressMs) delete state.peerIngressMs[peerId];
    if (state.peerRttMs) delete state.peerRttMs[peerId];

    if (state.activeServerId === roomId) {
        updateMembersPanel(roomId);
        updatePeerCountBadge(roomId);
        if (state.activeChannelId) renderVoiceParticipants(roomId, state.activeChannelId);
    }

    // Remove remote media
    if (state.remoteMedia && state.remoteMedia[peerId]) {
        state.remoteMedia[peerId].srcObject = null;
        state.remoteMedia[peerId].remove();
        delete state.remoteMedia[peerId];
    }
}

function handleVoiceStream(peerId, stream) {
    if (!state.remoteMedia) state.remoteMedia = {};
    if (!state.remoteMedia[peerId]) {
        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        video.muted = peerId === state.peerId;
        video.className = "voice-video";

        // Ensure UI updates when video actually starts
        const refreshVoiceUI = () => {
            if (state.activeServerId && state.voiceChannelId) {
                renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
                updateMuteStates();
            }
        };
        video.onloadedmetadata = refreshVoiceUI;
        video.onplaying = refreshVoiceUI;

        state.remoteMedia[peerId] = video;

        if (state.activeServerId && state.voiceChannelId) {
            renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
        }
        setTimeout(() => {
            if (state.activeServerId && state.voiceChannelId) {
                renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
            }
            updateMuteStates();
        }, SCORD_T().VOICE_STREAM_RENDER_DELAY_MS ?? 400);
    }
    state.remoteMedia[peerId].srcObject = stream;
    updateMuteStates();
}

function updateConnectionStatus(status) {
    state._lastMeshStatus = status || "";
    console.log("[App] Connection status:", status);
    const key = String(status || "");
    const t = Date.now();
    if (key === "ws_error") {
        if (t - (state._wsErrToastAt || 0) > 8000) {
            state._wsErrToastAt = t;
            toast("Sinyal sunucusuna (WebSocket) bağlanılamadı. Render linkini ve ağını kontrol et.", "error");
        }
    } else if (key === "room_not_found") {
        if (t - (state._roomNFToastAt || 0) > 8000) {
            state._roomNFToastAt = t;
            toast("Oda bulunamadı (sunucu yeniden başlamış olabilir). Sunucuyu yeniden oluşturup tekrar davet et.", "error");
        }
    } else if (key === "server_error") {
        if (t - (state._srvErrToastAt || 0) > 8000) {
            state._srvErrToastAt = t;
            toast("Sinyal sunucusu hata verdi. Render loglarını kontrol et.", "error");
        }
    }
    refreshConnectionBadge();
}

function loadUserPrefs() {
    try {
        const raw = localStorage.getItem("scord_notif_settings");
        const o = raw ? JSON.parse(raw) : {};
        const chatLevel = o.chatLevel || (o.chat === false ? "none" : "all");
        state.notifSettings = {
            chat: o.chat !== false && chatLevel !== "none",
            dm: o.dm !== false,
            join: o.join !== false,
            chatLevel,
        };
    } catch {
        state.notifSettings = { chat: true, dm: true, join: true, chatLevel: "all" };
    }
    state.compactMode = localStorage.getItem("scord_compact_mode") === "1";
    document.body.classList.toggle("compact-mode", state.compactMode);
    const dens = localStorage.getItem("scord_msg_density") || "cozy";
    document.documentElement.setAttribute("data-msg-density", dens);
    document.documentElement.classList.toggle("scord-high-contrast", localStorage.getItem("scord_high_contrast") === "1");
    const app = document.getElementById("app");
    if (app) app.setAttribute("data-scord-focus", localStorage.getItem("scord_focus_mode") === "1" ? "1" : "0");
}

function applyFocusModeButton() {
    const btn = document.getElementById("focus-mode-toggle");
    const app = document.getElementById("app");
    if (!btn || !app) return;
    const on = app.getAttribute("data-scord-focus") === "1";
    btn.classList.toggle("active", on);
    btn.title = on ? "Odak modunu kapat (üyeleri göster)" : "Odak modu (üye panelini gizle)";
}

function draftStorageKey(serverId, channelId) {
    return `scord_draft_${serverId}_${channelId}`;
}

function persistChatDraftFor(serverId, channelId) {
    if (!serverId || !channelId) return;
    const inp = document.getElementById("chat-input");
    if (!inp) return;
    const v = inp.value;
    const key = draftStorageKey(serverId, channelId);
    if (v.trim()) localStorage.setItem(key, v);
    else localStorage.removeItem(key);
}

function shouldShowChatToast(msg) {
    const ns = state.notifSettings || { chatLevel: "all" };
    const level = ns.chatLevel || "all";
    if (level === "none" || ns.chat === false) return false;
    if (level === "mentions") {
        const u = (state.username || "").trim();
        if (!u) return false;
        const t = msg.text || "";
        const esc = u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp(`(^|[^\\w#])@${esc}(?!\\w)`, "i").test(t);
    }
    return true;
}

function hideNewMsgsChip() {
    document.getElementById("new-msgs-chip")?.classList.add("hidden");
}

function showNewMsgsChip() {
    document.getElementById("new-msgs-chip")?.classList.remove("hidden");
}

function isChatScrolledUp() {
    const area = document.getElementById("messages-area");
    if (!area) return false;
    return area.scrollHeight - area.scrollTop - area.clientHeight > 100;
}

function wireMessagesScroll() {
    const area = document.getElementById("messages-area");
    if (!area || area.dataset.scordScrollWired) return;
    area.dataset.scordScrollWired = "1";
    area.addEventListener("scroll", () => {
        if (!isChatScrolledUp()) hideNewMsgsChip();
    });
}

// Consolidated above

function handlePeerConnected(peerId, roomId) {
    const server = state.servers.find(s => s.id === roomId);
    if (!server || !state.mesh) return;

    if (server.messages && Object.keys(server.messages).length > 0) {
        state.mesh.sendTo(peerId, {
            type: "history_sync",
            messages: server.messages,
            roles: server.roles || {}
        });
    }

    if (state.voiceChannelId) {
        state.mesh.sendTo(peerId, {
            type: "voice_state_sync",
            channelId: state.voiceChannelId,
            username: state.username,
            avatarColor: state.avatarColor,
            avatarImage: state.avatarImage,
            isSharingScreen: !!getLocalShareStream(),
            isSharingCamera: !!state.cameraStream
        });
    }

    flushP2pOutbox();
    refreshConnectionBadge();
}

function handleTrackAdded(peerId, track, stream) {
    console.log(`[Voice] Track added from ${peerId}: ${track.kind}`);

    const video = state.remoteMedia?.[peerId];
    if (video) {
        // Force refresh srcObject and play to jumpstart rendering
        if (video.srcObject !== stream) video.srcObject = stream;
        video.play().catch(e => console.warn("Auto-play blocked or failed", e));
    }

    if (track.kind === "video") {
        setTimeout(() => {
            const ch = state.voiceChannelId || state.activeChannelId;
            if (state.activeServerId && ch) {
                renderVoiceParticipants(state.activeServerId, ch);
            }
        }, SCORD_T().VOICE_TRACK_RENDER_DELAY_MS ?? 400);
    }
    updateMuteStates();
}

/* ── Voice channel ────────────────────────────────────────── */
async function joinVoiceChannel(channelId) {
    if (!state.mesh) return;

    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    if (state.voiceChannelId) {
        if (state.voiceChannelId === channelId) return;
        leaveVoiceChannel();
    }

    // Build Web Audio Stream Pipeline
    let processedStream = null;
    try {
        const vs = state.voiceSettings || {};
        const audioConstraints = {
            noiseSuppression: vs.noiseSuppression !== false,
            echoCancellation: vs.echoCancellation !== false,
            ...(vs.micId && vs.micId !== "default" ? { deviceId: vs.micId } : {})
        };
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });

        state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = state.audioCtx.createMediaStreamSource(stream);
        const gainNode = state.audioCtx.createGain();
        gainNode.gain.value = state.voiceSettings?.volume || 1;

        const filterNode = state.audioCtx.createBiquadFilter();
        const filterType = state.voiceSettings?.filter || "none";
        if (filterType === "bass") {
            filterNode.type = "lowshelf";
            filterNode.frequency.value = 200;
            filterNode.gain.value = 15;
        } else if (filterType === "radio") {
            filterNode.type = "bandpass";
            filterNode.frequency.value = 1000;
            filterNode.Q.value = 2;
        } else {
            filterNode.type = "allpass";
        }

        const analyser = state.audioCtx.createAnalyser();
        analyser.fftSize = 256;
        state.analyser = analyser;

        const dest = state.audioCtx.createMediaStreamDestination();
        source.connect(filterNode);
        filterNode.connect(analyser); // Monitor before gain
        gainNode.connect(dest);
        filterNode.connect(gainNode);

        processedStream = dest.stream;
        state.originalMicStream = stream; // save original to kill hardware light later

        // PTT Initial State
        if (state.voiceSettings?.inputMode === "ptt") {
            stream.getAudioTracks()[0].enabled = !!state._pttActive;
        }

        const currentRole = server.ownerId === state.peerId ? "owner"
            : server.peer_roles?.[state.peerId] === "admin" ? "admin"
                : server.peer_roles?.[state.peerId] === "mod" ? "mod" : "member";
        const isVoiceRestricted = server.voicePermissionMode === "mods_only" && !["owner", "admin", "mod"].includes(currentRole);
        if (isVoiceRestricted) {
            stream.getAudioTracks()[0].enabled = false;
            toast("Bu ses kanalında konuşma izni yalnızca moderatör ve üstlerine ait.", "warning");
        }

        // Start Volume Loop
        state._speakingLoop = setInterval(() => {
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            const sum = data.reduce((a, b) => a + b, 0);
            const avg = sum / data.length;
            const isSpeakingNow = avg > 25; // Slightly higher threshold

            // Debounce / Hysteresis
            if (isSpeakingNow) {
                state._lastSpeakTime = Date.now();
            }

            const holdMs = SCORD_T().VOICE_SPEAKING_HOLD_MS ?? 250;
            const isSpeaking = (Date.now() - (state._lastSpeakTime || 0)) < holdMs;

            if (isSpeaking !== state.isSpeaking) {
                state.isSpeaking = isSpeaking;
                if (state.mesh) {
                    state.mesh.broadcast({
                        type: "voice_status",
                        speaking: isSpeaking,
                        channelId: state.voiceChannelId,
                    });
                }
                renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
            }
        }, SCORD_T().VOICE_SPEAKING_POLL_MS ?? 100);
    } catch (err) {
        console.error("Audio error", err);
        toast("Mikrofon hatası: İzin verilmedi.", "error");
        return;
    }

    const ok = await state.mesh.startVoice(processedStream);
    if (!ok) { toast("Ses yayını başlatılamadı.", "error"); return; }

    const canonCh = server ? canonicalVoiceChannelId(server, channelId) : channelId;
    state.voiceChannelId = canonCh;

    showVoiceView(state.activeServerId, canonCh);

    if (server) {
        if (!server.voiceMembers) server.voiceMembers = {};
        if (!server.voiceMembers[canonCh]) server.voiceMembers[canonCh] = [];
        const othersOnly = server.voiceMembers[canonCh].filter(m => m.peer_id !== state.peerId);
        if (othersOnly.length === 0) {
            ensureVoiceSessionHost(server, canonCh, state.peerId, state.username);
        }
        if (!server.voiceMembers[canonCh].find(m => m.peer_id === state.peerId)) {
            server.voiceMembers[canonCh].push({ peer_id: state.peerId, username: state.username, avatar_color: state.avatarColor, avatar_image: state.avatarImage });
        }
        updateChannelSidebar(state.activeServerId);
    }

    meshBroadcastReliable({
        type: "voice_join",
        channelId: canonCh,
        username: state.username,
        avatarColor: state.avatarColor,
        avatarImage: state.avatarImage,
        isSharingScreen: !!getLocalShareStream(),
        isSharingCamera: !!state.cameraStream
    });

    // Request voice state from existing participants
    setTimeout(() => {
        meshBroadcastReliable({
            type: "voice_state_request",
            channelId: canonCh
        });
    }, 100);

    renderVoiceParticipants(state.activeServerId, canonCh);
    showVoiceStatusBar(state.activeServerId, canonCh);

    state.membersOpen = false;
    document.getElementById("members-panel")?.classList.add("collapsed");
    document.getElementById("voice-members-panel")?.classList.add("collapsed");

    // Toggle buttons
    document.getElementById("voice-join-btn").classList.add("hidden");
    document.getElementById("voice-leave-btn").classList.remove("hidden");
    document.getElementById("voice-screen-btn")?.classList.remove("hidden");
    document.getElementById("voice-camera-btn")?.classList.remove("hidden");

    updateMuteStates();
    updateVoiceSessionMeta();
    toast("Sesli kanala katıldın! 🎙️", "success");
}

function leaveVoiceChannel() {
    if (!state.mesh) return;
    const channelId = state.voiceChannelId;
    state.mesh.stopVoice();
    state.voiceChannelId = null;

    if (state.originalMicStream) {
        state.originalMicStream.getTracks().forEach(t => t.stop());
        state.originalMicStream = null;
    }
    if (state.audioCtx) {
        state.audioCtx.close();
        state.audioCtx = null;
    }
    if (state._speakingLoop) {
        clearInterval(state._speakingLoop);
        state._speakingLoop = null;
    }

    meshBroadcastReliable({ type: "voice_leave", channelId });

    const server = state.servers.find(s => s.id === state.activeServerId);
    if (server?.voiceMembers?.[channelId]) {
        transferVoiceSessionHost(server, channelId, state.peerId);
        server.voiceMembers[channelId] = server.voiceMembers[channelId].filter(m => m.peer_id !== state.peerId);
        updateChannelSidebar(state.activeServerId);
    }

    renderVoiceParticipants(state.activeServerId, channelId);
    updateVoiceSessionMeta();
    hideVoiceStatusBar();

    document.getElementById("voice-join-btn").classList.remove("hidden");
    document.getElementById("voice-leave-btn").classList.add("hidden");
    document.getElementById("voice-screen-btn")?.classList.add("hidden");
    document.getElementById("voice-camera-btn")?.classList.add("hidden");

    try {
        if (state.mesh?.screenStream) state.mesh.stopScreenShare();
    } catch (e) { /* noop */ }
    if (state.screenStream) {
        try { state.screenStream.getTracks().forEach(t => t.stop()); } catch (e) { /* noop */ }
        state.screenStream = null;
    }

    if (state.cameraStream) stopCameraShare(); // Reset camera state

    updateMuteStates();
    toast("Sesli kanaldan ayrıldın.", "info");
}

function renderVoiceParticipants(serverId, channelId) {
    const server = state.servers.find(s => s.id === serverId);
    const container = document.getElementById("voice-participants");
    if (!container) return;
    const members = server?.voiceMembers?.[channelId] || [];
    const countEl = document.getElementById("voice-participant-count");
    if (countEl) countEl.textContent = `${members.length} kişi`;

    if (members.length === 0) {
        container.innerHTML = `
          <div class="voice-empty-state">
            <span class="voice-empty-state-icon" aria-hidden="true">🎙️</span>
            <h4>Burada henüz kimse yok</h4>
            <p>Arkadaşlarını davet et veya aşağıdan kanala katıl. Ses P2P üzerinden aktarılır.</p>
          </div>`;
        updateVoiceSessionMeta();
        return;
    }

    // Full re-render to avoid duplicates and bugs
    container.innerHTML = '';

    members.forEach(m => {
        const card = document.createElement("div");
        card.className = "voice-participant-card";
        card.setAttribute('data-peer-id', m.peer_id);
        container.appendChild(card);

        // Avatar
        let av = card.querySelector('.vpc-avatar');
        if (!av) {
            av = document.createElement("div");
            av.className = "vpc-avatar";
            card.appendChild(av);
        }
        applyAvatarToElement(av, m.avatar_color, m.avatar_image, m.username);

        // Speaking Glow (make it robust: only one source of truth)
        const currentlySpeaking = !!m.isSpeaking || (m.peer_id === state.peerId && !!state.isSpeaking);
        if (currentlySpeaking) {
            card.classList.add("speaking");
            av.classList.add("speaking");
        } else {
            card.classList.remove("speaking");
            av.classList.remove("speaking");
        }

        // Name and Badge
        let nameContainer = card.querySelector('.vpc-name-container');
        if (!nameContainer) {
            nameContainer = document.createElement("div");
            nameContainer.className = "vpc-name-container";
            nameContainer.style.display = "flex";
            nameContainer.style.alignItems = "center";
            nameContainer.style.justifyContent = "center";
            nameContainer.style.width = "100%";
            card.appendChild(nameContainer);
        }

        let nameEl = nameContainer.querySelector('.vpc-name');
        if (!nameEl) {
            nameEl = document.createElement("div");
            nameEl.className = "vpc-name";
            nameContainer.appendChild(nameEl);
        }
        nameEl.textContent = m.username + (m.peer_id === state.peerId ? " (sen)" : "");

        // Add sharing icons
        let shareIcon = nameContainer.querySelector('.share-icon');
        if (m.isSharingScreen || (m.peer_id === state.peerId && getLocalShareStream())) {
            if (!shareIcon) {
                shareIcon = document.createElement("span");
                shareIcon.className = "share-icon";
                shareIcon.textContent = "🖥️";
                shareIcon.title = "Ekran Paylaşıyor";
                nameContainer.appendChild(shareIcon);
            }
        } else if (m.isSharingCamera || (m.peer_id === state.peerId && state.cameraStream)) {
            if (!shareIcon) {
                shareIcon = document.createElement("span");
                shareIcon.className = "share-icon";
                shareIcon.textContent = "📹";
                shareIcon.title = "Kamera Açık";
                nameContainer.appendChild(shareIcon);
            }
        } else if (shareIcon) {
            shareIcon.remove();
        }

        const roleLabel = m.peer_id === server.ownerId ? "Kurucu"
            : server.peer_roles?.[m.peer_id] === "admin" ? "Admin"
                : server.peer_roles?.[m.peer_id] === "mod" ? "Mod" : "Üye";
        const isStaff = m.peer_id === server.ownerId || server.peer_roles?.[m.peer_id] === "admin" || server.peer_roles?.[m.peer_id] === "mod";
        const isListenerOnly = server.voicePermissionMode === "mods_only" && !isStaff;
        const roleTags = [roleLabel];
        if (isListenerOnly) roleTags.push("Dinleyici");
        if (server.voiceSessionHost?.[channelId]?.peerId === m.peer_id) roleTags.push("Host");
        let roleBadge = nameContainer.querySelector('.vpc-role-badge');
        if (!roleBadge) {
            roleBadge = document.createElement("div");
            roleBadge.className = "vpc-role-badge";
            nameContainer.appendChild(roleBadge);
        }
        roleBadge.textContent = roleTags.join(" · ");

        const isSharing = m.isSharingScreen || m.isSharingCamera || (m.peer_id === state.peerId && (getLocalShareStream() || state.cameraStream));
        let liveBadge = nameContainer.querySelector('.live-badge');
        if (isSharing) {
            if (!liveBadge) {
                liveBadge = document.createElement("span");
                liveBadge.className = "live-badge";
                liveBadge.textContent = "CANLI";
                nameContainer.appendChild(liveBadge);
            }
        } else if (liveBadge) {
            liveBadge.remove();
        }

        // Video / Screen Share (STABLE NODE)
        let videoEl = state.remoteMedia?.[m.peer_id];

        // Handle local user's own streams!
        if (m.peer_id === state.peerId) {
            const localStream = getLocalShareStream() || state.cameraStream;
            if (localStream) {
                if (!state.localVideoEl) {
                    state.localVideoEl = document.createElement("video");
                    state.localVideoEl.muted = true;
                    state.localVideoEl.playsInline = true;
                    state.localVideoEl.autoplay = true;
                }
                state.localVideoEl.srcObject = localStream;
                videoEl = state.localVideoEl;
            } else {
                videoEl = null;
                if (state.localVideoEl) {
                    state.localVideoEl.srcObject = null;
                    state.localVideoEl.remove();
                }
            }
        }

        let watchBtn = card.querySelector('.watch-btn');

        const hasVideoTrack = !!(videoEl && videoEl.srcObject?.getVideoTracks?.()?.length > 0);
        if (hasVideoTrack) {
            card.classList.add("has-video");
            if (videoEl.parentNode !== card) {
                videoEl.style.width = "100%";
                videoEl.style.height = "100%";
                videoEl.style.objectFit = "contain";
                videoEl.style.marginTop = "12px";
                videoEl.style.borderRadius = "8px";
                videoEl.style.cursor = "pointer";
                videoEl.onclick = () => openScreenOverlay(m.peer_id, m.username);
                card.appendChild(videoEl);
                videoEl.play().catch(() => { });
            }
        } else {
            card.classList.remove("has-video");
            if (videoEl && videoEl.parentNode === card) videoEl.remove();
        }

        // Watch button should appear as soon as someone is "sharing",
        // even if the track is still negotiating/loading.
        if (isSharing) {
            if (!watchBtn) {
                watchBtn = document.createElement("button");
                watchBtn.className = "btn-primary watch-btn";
                watchBtn.style.marginTop = "8px";
                watchBtn.style.width = "100%";
                card.appendChild(watchBtn);
            }
            watchBtn.disabled = !hasVideoTrack;
            watchBtn.textContent = hasVideoTrack ? "Yayını İzle" : "Yükleniyor…";
            watchBtn.onclick = (e) => { e.stopPropagation(); openScreenOverlay(m.peer_id, m.username); };
        } else if (watchBtn) {
            watchBtn.remove();
        }

        // Drag and Drop Admin
        const isAdmin = server && (server.ownerId === state.peerId || server.peer_roles?.[state.peerId] === "admin");
        if (isAdmin && m.peer_id !== state.peerId) {
            card.draggable = true;
            card.ondragstart = (e) => { e.dataTransfer.setData("peerId", m.peer_id); };
        } else {
            card.draggable = false;
        }

        // Music Bot UI
        if (m.peer_id === "bot_music") {
            let botVol = card.querySelector('.bot-volume-container');
            if (!botVol) {
                botVol = document.createElement("div");
                botVol.className = "bot-volume-container";
                botVol.style.marginTop = "12px";
                botVol.style.width = "100%";
                botVol.innerHTML = `
                    <div style="font-size:10px; color:var(--text-muted); margin-bottom:4px; text-align:center;">Kişisel Ses Seviyesi</div>
                    <input type="range" min="0" max="100" class="bot-vol-slider" style="width:100%; accent-color:#ef4444;">
                `;
                card.appendChild(botVol);
                const slider = botVol.querySelector('.bot-vol-slider');
                slider.value = state.musicBot.volume;
                slider.oninput = (e) => {
                    state.musicBot.volume = parseInt(e.target.value);
                    if (state.musicBot.player && typeof state.musicBot.player.setVolume === "function") {
                        state.musicBot.player.setVolume(state.musicBot.volume);
                    }
                };
            }
            card.style.height = "auto";
        }

        // Context Menu
        if (m.peer_id !== state.peerId) {
            card.oncontextmenu = (e) => {
                e.preventDefault();
                showContextMenu(m.peer_id, m.username, e.clientX, e.clientY);
            };
        }

        if (card.parentNode !== container) container.appendChild(card);
    });
    updateVoiceSessionMeta();
}


function showVoiceStatusBar(serverId, channelId) {
    const server = state.servers.find(s => s.id === serverId);
    const channel = server?.channels.find(c => c.id === channelId);
    document.getElementById("vsb-channel-name").textContent = channel?.name || "Sesli Kanal";
    document.getElementById("voice-status-bar").classList.remove("hidden");
}

function hideVoiceStatusBar() {
    document.getElementById("voice-status-bar").classList.add("hidden");
}

function openScreenOverlay(peerId, username) {
    let video = state.remoteMedia?.[peerId];
    if (peerId === state.peerId) {
        video = state.localVideoEl || document.getElementById("self-share-video");
    }
    if (!video?.srcObject?.getVideoTracks?.()?.length) {
        return toast("Video akışı bulunamadı.", "error");
    }

    // Prevent duplicates
    const existing = document.getElementById("screen-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.className = "screen-overlay";
    overlay.id = "screen-overlay";
    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };

    const closeBtn = document.createElement("button");
    closeBtn.className = "screen-overlay-close";
    closeBtn.textContent = "Kapat";
    closeBtn.onclick = () => overlay.remove();

    const label = document.createElement("div");
    label.className = "screen-overlay-label";
    label.textContent = `${username || "Yayın"} — izle`;

    const bigVideo = document.createElement("video");
    bigVideo.autoplay = true;
    bigVideo.playsInline = true;
    bigVideo.srcObject = video.srcObject || null;
    bigVideo.className = "screen-overlay-video";
    bigVideo.onclick = (e) => e.stopPropagation();

    const closeOverlay = () => {
        if (overlay.isConnected) {
            overlay.remove();
        }
    };

    const syncSrc = () => {
        if (!overlay.isConnected) return;
        bigVideo.srcObject = video.srcObject || null;
        const currentStream = bigVideo.srcObject;
        if (!currentStream) {
            closeOverlay();
            return;
        }
        const tracks = currentStream.getVideoTracks();
        if (!tracks.length || tracks.every(track => track.readyState === "ended")) {
            closeOverlay();
            return;
        }
        tracks.forEach(track => {
            if (track._overlayEndBound) return;
            track._overlayEndBound = true;
            track.addEventListener("ended", closeOverlay);
        });
    };

    syncSrc();
    const interval = setInterval(syncSrc, SCORD_T().SCREEN_OVERLAY_SYNC_INTERVAL_MS ?? 750);
    const onKey = (e) => { if (e.key === "Escape") closeOverlay(); };
    window.addEventListener("keydown", onKey);

    const cleanup = () => {
        clearInterval(interval);
        window.removeEventListener("keydown", onKey);
    };
    const obs = new MutationObserver(() => {
        if (!overlay.isConnected) {
            cleanup();
            obs.disconnect();
        }
    });
    obs.observe(document.body, { childList: true });

    overlay.appendChild(closeBtn);
    overlay.appendChild(label);
    overlay.appendChild(bigVideo);
    document.body.appendChild(overlay);
}



/* ── Modals ───────────────────────────────────────────────── */
function openCreateServerModal() {
    showModal(
        "Sunucu Oluştur",
        `<label class="modal-label">Sunucu Adı</label>
     <input class="modal-input" id="new-server-name" placeholder="Sunucuma..." maxlength="50" />
     <p class="modal-info">Sunucun oluşturulduğunda diğer kullanıcılar ana sayfadan bulup katılabilir. Tüm iletişim P2P üzerinden gerçekleşir.</p>`,
        `<button class="btn-secondary" onclick="hideModal()">İptal</button>
     <button class="btn-primary" style="width:auto;padding:10px 24px" onclick="onCreateServer()">Oluştur</button>`
    );
    setTimeout(() => document.getElementById("new-server-name")?.focus(), 50);
}

async function onCreateServer() {
    const name = document.getElementById("new-server-name")?.value.trim();
    if (!name) { toast("Sunucu adı gir.", "error"); return; }
    hideModal();
    await createServer(name);
}

function openJoinServerModal() {
    showModal(
        "Sunucuya Katıl",
        `<label class="modal-label">Sunucu ID / Link</label>
     <input class="modal-input" id="join-server-id" placeholder="Sunucu kimliğini yapıştır..." />
     <p class="modal-info">Arkadaşından sunucu ID'sini al ve buraya yapıştır.</p>`,
        `<button class="btn-secondary" onclick="hideModal()">İptal</button>
     <button class="btn-primary" style="width:auto;padding:10px 24px" onclick="onJoinServer()">Katıl</button>`
    );
    setTimeout(() => document.getElementById("join-server-id")?.focus(), 50);
}

async function onJoinServer() {
    const id = document.getElementById("join-server-id")?.value.trim();
    if (!id) { toast("Sunucu ID'si gir.", "error"); return; }
    hideModal();
    await joinServer(id);
}

/* ── Emoji picker ─────────────────────────────────────────── */
function toggleEmojiPicker() {
    const existing = document.getElementById("emoji-picker");
    if (existing) { existing.remove(); state.emojiOpen = false; return; }

    const picker = document.createElement("div");
    picker.className = "emoji-picker";
    picker.id = "emoji-picker";

    EMOJIS.forEach(emoji => {
        const item = document.createElement("div");
        item.className = "emoji-item";
        item.textContent = emoji;
        item.onclick = () => {
            const input = document.getElementById("chat-input");
            input.value += emoji;
            input.focus();
            picker.remove();
            state.emojiOpen = false;
        };
        picker.appendChild(item);
    });

    document.getElementById("main-content").appendChild(picker);
    state.emojiOpen = true;

    // Close on outside click
    setTimeout(() => {
        document.addEventListener("click", function close(e) {
            if (!picker.contains(e.target) && e.target.id !== "emoji-btn") {
                picker.remove();
                state.emojiOpen = false;
                document.removeEventListener("click", close);
            }
        });
    }, 0);
}

/* ── Settings — 5-Tab Professional Layout ─────────────────── */
function openSettingsModal() {
    const vs = state.voiceSettings || {};
    const themeVal = state.theme || "";
    const tabHtml = `
    <div class="settings-two-col">
      <nav class="settings-tab-nav" id="stabs">
        <button class="active" data-tab="s-profil">👤 Profil</button>
        <button data-tab="s-gorunum">🎨 Görünüm</button>
        <button data-tab="s-ses">🎙️ Ses &amp; Video</button>
        <button data-tab="s-bildirim">🔔 Bildirimler</button>
        <button data-tab="s-hakkinda">ℹ️ Hakkında</button>
      </nav>
      <div class="settings-tab-content">
        <div id="s-profil" class="s-panel">
          <div class="form-group" style="margin-bottom:14px">
            <label class="modal-label">Kullanıcı Adı</label>
            <input class="modal-input" id="settings-username" value="${state.username}" maxlength="32" />
          </div>
          <div class="form-group">
            <label class="modal-label">Profil Fotoğrafı</label>
            <input type="file" id="settings-avatar-upload" accept="image/*" class="modal-input" style="padding:6px" />
            <p class="modal-info" style="margin-top:10px">Max ~500KB önerilir (P2P için).</p>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="modal-label">Avatar URL (dosya yerine)</label>
            <input class="modal-input" id="settings-avatar-url" type="url" placeholder="https://… doğrudan görsel" value="" />
          </div>
        </div>
        <div id="s-gorunum" class="s-panel" style="display:none">
          <div class="form-group" style="margin-bottom:14px">
            <label class="modal-label">Arayüz şablonu (layout)</label>
            <select class="modal-input" id="settings-theme">
              <option value="">SCORD — Glass</option>
              <option value="theme-neon">⚡ Neon grid</option>
              <option value="theme-discord">💬 Kompakt panel</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="modal-label">Renk paleti (modüler)</label>
            <select class="modal-input" id="settings-palette">
              <option value="glass">Cam — varsayılan</option>
              <option value="aurora">Aurora (mor–camgöbeği)</option>
              <option value="ember">Ember (sıcak kırmızı)</option>
              <option value="paper">Paper (açık, düşük kontrast)</option>
              <option value="forest">Forest (yeşil derin)</option>
              <option value="midnight">Midnight saf (OLED)</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="modal-label">Sohbet düzeni</label>
            <select class="modal-input" id="settings-chat-layout">
              <option value="bubbles">Balonlar (kendi / diğer renk)</option>
              <option value="classic">Klasik satır</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="modal-label">Kişisel Arka Plan Resmi</label>
            <input type="file" id="settings-bg-upload" accept="image/*" class="modal-input" style="padding:6px" />
            <p class="modal-info" style="margin-top:6px">Yalnızca senin ekranına hitap eden yerel bir görsel.</p>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="modal-label">Mesaj yoğunluğu</label>
            <select class="modal-input" id="settings-msg-density">
              <option value="comfortable" ${(localStorage.getItem("scord_msg_density") || "cozy") === "comfortable" ? "selected" : ""}>Rahat</option>
              <option value="cozy" ${(localStorage.getItem("scord_msg_density") || "cozy") === "cozy" ? "selected" : ""}>Normal</option>
              <option value="compact" ${(localStorage.getItem("scord_msg_density") || "") === "compact" ? "selected" : ""}>Sıkı</option>
            </select>
          </div>
          <div class="form-group">
            <label class="modal-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" id="settings-compact" ${state.compactMode ? 'checked' : ''}>
              Kompakt Görünüm
            </label>
          </div>
          <div class="form-group" style="margin-top:12px">
            <label class="modal-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" id="settings-high-contrast" ${localStorage.getItem("scord_high_contrast") === "1" ? "checked" : ""}>
              Yüksek kontrast (kenarlıklar)
            </label>
          </div>
          <p class="modal-info" style="margin-top:8px">Hızlı kanal: <kbd style="padding:2px 6px;border-radius:4px;background:var(--bg-mid)">Ctrl</kbd>+<kbd style="padding:2px 6px;border-radius:4px;background:var(--bg-mid)">K</kbd> · Odak modu: sohbet başlığındaki ⛶</p>
        </div>
        <div id="s-ses" class="s-panel" style="display:none">
          <div class="form-group" style="margin-bottom:12px">
            <label class="modal-label">Mikrofon</label>
            <select class="modal-input" id="settings-mic-select"><option value="default">Varsayılan</option></select>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="modal-label">Ses Filtresi</label>
            <select class="modal-input" id="settings-filter">
              <option value="none">Normal</option>
              <option value="bass">Bass Boost</option>
              <option value="radio">Lo-Fi Radio</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="modal-label">Giriş Sesi — <span id="vol-label">${Math.round((vs.volume || 1) * 100)}%</span></label>
            <input type="range" id="settings-volume" min="0" max="3" step="0.1" value="${vs.volume || 1}" style="width:100%" oninput="document.getElementById('vol-label').textContent=Math.round(this.value*100)+'%'" />
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label class="modal-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="settings-noise-suppress" ${vs.noiseSuppression !== false ? 'checked' : ''}>
              Gürültü Engelleme
            </label>
          </div>
          <div class="form-group" style="margin-bottom:10px">
            <label class="modal-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="settings-echo-cancel" ${vs.echoCancellation !== false ? 'checked' : ''}>
              Yankı Engelleme
            </label>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="modal-label">Giriş Modu</label>
            <select class="modal-input" id="settings-input-mode">
              <option value="voice" ${vs.inputMode !== 'ptt' ? 'selected' : ''}>Ses Aktivitesi</option>
              <option value="ptt" ${vs.inputMode === 'ptt' ? 'selected' : ''}>Bas-Konuş</option>
            </select>
          </div>
          <div id="ptt-key-container" class="form-group" style="margin-bottom:12px; display:${vs.inputMode === 'ptt' ? 'block' : 'none'}">
            <label class="modal-label">Kısayol Tuşu (PTT)</label>
            <input type="text" class="modal-input" id="settings-ptt-key" value="${vs.pttKey || 'Control'}" readonly style="cursor:pointer" placeholder="Tuş atamak için tıkla..." />
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="modal-label">Ekran Paylaşımı Kalitesi</label>
            <select class="modal-input" id="settings-screen-quality">
              <option value="4k" ${state.screenShareQuality === "4k" ? "selected" : ""}>4K (Ultra HD)</option>
              <option value="1080p" ${state.screenShareQuality === "1080p" ? "selected" : ""}>1080p (Full HD)</option>
              <option value="720p" ${state.screenShareQuality === "720p" ? "selected" : ""}>720p (HD) - Önerilen</option>
              <option value="480p" ${state.screenShareQuality === "480p" ? "selected" : ""}>480p (SD)</option>
              <option value="360p" ${state.screenShareQuality === "360p" ? "selected" : ""}>360p (Düşük)</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="modal-label">Kamera Kalitesi</label>
            <select class="modal-input" id="settings-camera-quality">
              <option value="4k" ${state.cameraQuality === "4k" ? "selected" : ""}>4K (Ultra HD)</option>
              <option value="1080p" ${state.cameraQuality === "1080p" ? "selected" : ""}>1080p (Full HD)</option>
              <option value="720p" ${state.cameraQuality === "720p" ? "selected" : ""}>720p (HD) - Önerilen</option>
              <option value="480p" ${state.cameraQuality === "480p" ? "selected" : ""}>480p (SD)</option>
              <option value="360p" ${state.cameraQuality === "360p" ? "selected" : ""}>360p (Düşük)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="modal-label">Kısayollar</label>
            <p class="modal-info" style="margin:2px 0">M — Mikrofon aç/kapat &nbsp;|&nbsp; D — Kulaklık</p>
          </div>
        </div>
        <div id="s-bildirim" class="s-panel" style="display:none">
          <div class="form-group" style="margin-bottom:12px">
            <label class="modal-label">Sohbet bildirimleri (arka planda)</label>
            <select class="modal-input" id="notif-chat-level">
              <option value="all" ${(state.notifSettings?.chatLevel || "all") === "all" ? "selected" : ""}>Tüm mesajlar</option>
              <option value="mentions" ${state.notifSettings?.chatLevel === "mentions" ? "selected" : ""}>Yalnız @${escapeHtml(state.username || "ben")} bahsetme</option>
              <option value="none" ${state.notifSettings?.chatLevel === "none" ? "selected" : ""}>Kapalı</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="modal-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="notif-dm" ${state.notifSettings?.dm !== false ? 'checked' : ''}>
              Özel mesaj (DM) bildirimi
            </label>
          </div>
          <div class="form-group">
            <label class="modal-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="notif-join" ${state.notifSettings?.join !== false ? 'checked' : ''}>
              Ses kanalına katılma bildirimi
            </label>
          </div>
        </div>
        <div id="s-hakkinda" class="s-panel" style="display:none">
          <p style="font-size:18px;font-weight:700;margin-bottom:6px;color:var(--text-primary)">SCORD</p>
          <p class="modal-info">Sürüm 4.0 — Hybrid P2P Mesh</p>
          <p class="modal-info" style="margin-top:8px;line-height:1.6">Tüm mesaj, ses ve dosya transferleri doğrudan WebRTC üzerinden gerçekleşir. Sunucu yalnızca eşleştirme için kullanılır — BitTorrent tracker gibi.</p>
          <label class="modal-label" style="margin-top:16px;margin-bottom:6px;display:block">Peer ID</label>
          <div class="peer-id-display">${state.peerId || 'Bilinmiyor'}</div>
        </div>
      </div>
    </div>`;

    showModal("Kullanıcı Ayarları", tabHtml,
        `<button class="btn-secondary" onclick="hideModal()">İptal</button>
         <button class="btn-primary" style="width:auto;padding:10px 24px" onclick="saveSettings()">Kaydet</button>`
    );

    const avUrlField = document.getElementById("settings-avatar-url");
    if (avUrlField && state.avatarImage && /^https?:\/\//i.test(String(state.avatarImage))) {
        avUrlField.value = state.avatarImage;
    }

    // Tab switching logic
    document.querySelectorAll("#stabs button").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll("#stabs button").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".s-panel").forEach(p => p.style.display = "none");
            btn.classList.add("active");
            document.getElementById(btn.dataset.tab).style.display = "block";
            if (btn.dataset.tab === "s-ses") {
                navigator.mediaDevices.enumerateDevices().then(devices => {
                    const sel = document.getElementById("settings-mic-select");
                    sel.innerHTML = '<option value="default">Varsayılan</option>';
                    devices.filter(d => d.kind === "audioinput").forEach(d => {
                        const o = document.createElement("option");
                        o.value = d.deviceId;
                        o.textContent = d.label || "Mikrofon " + sel.length;
                        if (d.deviceId === vs.micId) o.selected = true;
                        sel.appendChild(o);
                    });
                    document.getElementById("settings-filter").value = vs.filter || "none";
                });
            }
            if (btn.dataset.tab === "s-gorunum") {
                document.getElementById("settings-theme").value = themeVal;
                const pal = document.getElementById("settings-palette");
                if (pal) pal.value = localStorage.getItem("scord_palette") || "glass";
                const cl = document.getElementById("settings-chat-layout");
                if (cl) cl.value = localStorage.getItem("scord_chat_layout") || "bubbles";
            }
        };
    });

    const inputMode = document.getElementById("settings-input-mode");
    if (inputMode) {
        inputMode.onchange = () => {
            document.getElementById("ptt-key-container").style.display = inputMode.value === 'ptt' ? 'block' : 'none';
        }
    }
    const pttInput = document.getElementById("settings-ptt-key");
    if (pttInput) {
        pttInput.onclick = () => {
            pttInput.value = "...";
            const handler = (e) => {
                e.preventDefault();
                pttInput.value = e.key;
                window.removeEventListener("keydown", handler);
            };
            window.addEventListener("keydown", handler);
        };
    }

    document.getElementById("settings-avatar-upload").onchange = (e) => {
        fileToBase64(e.target.files[0], (b64) => { state._tempAvatarImage = b64; });
    };
    document.getElementById("settings-bg-upload").onchange = (e) => {
        fileToBase64(e.target.files[0], (b64) => { state._tempBgImage = b64; });
    };
}

/* ── Right-Click Context Menu ─────────────────────────────── */
function showContextMenu(peerId, username, x, y) {
    closeContextMenu();
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    const myRole = server.ownerId === state.peerId ? "owner"
        : server.peer_roles?.[state.peerId] === "admin" ? "admin"
            : server.peer_roles?.[state.peerId] === "mod" ? "mod" : "member";

    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.id = "ctx-menu";
    menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 300)}px`;

    const addSection = (label) => {
        const s = document.createElement("div");
        s.className = "ctx-section";
        s.textContent = label;
        menu.appendChild(s);
    };
    const addItem = (icon, label, action, danger = false) => {
        const item = document.createElement("div");
        item.className = "ctx-item" + (danger ? " danger" : "");
        item.innerHTML = `<span class="ctx-icon">${icon}</span>${label}`;
        item.onclick = () => { closeContextMenu(); action(); };
        menu.appendChild(item);
    };
    const addDivider = () => {
        const d = document.createElement("div");
        d.className = "ctx-divider";
        menu.appendChild(d);
    };

    addSection(username);
    addItem("💬", "Özel Mesaj (DM)", () => {
        const m = server.members?.find(mem => mem.peer_id === peerId);
        openDM(peerId, username, m?.avatar_color, m?.avatar_image);
    });

    const isFriend = state.friends?.find(f => f.peerId === peerId);
    if (!isFriend) {
        addItem("➕", "Arkadaş Ekle", () => addFriend(peerId, username));
    } else {
        addItem("❌", "Arkadaştan Çıkar", () => removeFriend(peerId), true);
    }

    addItem("👤", "Profili Görüntüle", () => showMemberProfile(peerId, username, server));

    const canAssignRoles = (myRole === "owner" || myRole === "admin") && peerId !== state.peerId;
    const canModerate = ["owner", "admin", "mod"].includes(myRole) && peerId !== state.peerId;

    if (canAssignRoles) {
        addDivider();
        addSection("Yetki");
        const cr = server.peer_roles?.[peerId];
        if (server.ownerId !== peerId) {
            if (cr !== "admin") addItem("🛡️", "Yönetici Yap", () => assignRole(peerId, "admin", server));
            if (cr !== "mod") addItem("🟢", "Moderatör Yap", () => assignRole(peerId, "mod", server));
            if (cr) addItem("👤", "Rolü Kaldır", () => assignRole(peerId, null, server));
        }
    }

    if (canModerate) {
        addDivider();
        addSection("Moderasyon");
        addItem("🔇", "Zorla Sessize Al", () => forceMutePeer(peerId, username));
        const sameVoice = state.voiceChannelId && server.voiceMembers?.[state.voiceChannelId]?.some(m => m.peer_id === peerId);
        if (sameVoice) {
            addItem("📴", "Ses Kanalından Çıkar", () => voiceDisconnectPeer(peerId, username), true);
        }
        if (server.ownerId !== peerId) {
            addItem("🚪", "Sunucudan At", () => kickPeer(peerId, username), true);
        }
    }

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener("click", closeContextMenu, { once: true });
    }, 10);
}

function closeContextMenu() { document.getElementById("ctx-menu")?.remove(); }

function showMsgContextMenu(msg, x, y) {
    closeContextMenu();
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    const myRole = getMyEffectiveRole(server);
    const canMod = ["owner", "admin", "mod"].includes(myRole);
    const isAuthor = msg.authorId === state.peerId;

    const menu = document.createElement("div");
    menu.className = "ctx-menu ctx-menu--chat";
    menu.id = "ctx-menu";
    menu.style.left = `${Math.min(x, window.innerWidth - 280)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 380)}px`;

    const addItem = (icon, label, action, danger = false) => {
        const item = document.createElement("div");
        item.className = "ctx-item" + (danger ? " danger" : "");
        item.innerHTML = `<span class="ctx-icon">${icon}</span>${label}`;
        item.onclick = () => { closeContextMenu(); action(); };
        menu.appendChild(item);
    };

    addItem("📋", "Metni Kopyala", () => {
        const t = msg.text || "";
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(t).then(() => toast("Panoya kopyalandı", "info")).catch(() => toast("Kopyalanamadı", "error"));
        }
    });

    addItem("↩️", "Yanıtla", () => setReplyTarget(msg));
    addItem("⤴️", "Mesaja git", () => scrollToChatMessage(msg.id));
    addItem("🆔", "Mesaj ID kopyala", () => {
        const id = msg.id || "";
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(id).then(() => toast("Mesaj ID kopyalandı", "info")).catch(() => toast("Kopyalanamadı", "error"));
        }
    });

    ["👍", "❤️", "😂", "🔥", "🎉"].forEach(emoji => {
        addItem(emoji, `Tepki ${emoji}`, () => {
            if (state.mesh) state.mesh.broadcast({ type: "reaction", msgId: msg.id, emoji, channelId: state.activeChannelId });
            handleReaction(msg.id, emoji, state.peerId);
        });
    });

    if (canMod) {
        const isPinned = !!(msg.isPinned || server.pinned_messages?.some(p => p.id === msg.id));
        addItem("📌", isPinned ? "Sabitlemeyi Kaldır" : "Mesajı Sabitle", () => {
            msg.isPinned = !isPinned;
            if (state.mesh) {
                state.mesh.broadcast({ type: "msg_pin_toggle", payload: { msgId: msg.id, isPinned: msg.isPinned, msg } });
            }
            if (!server.pinned_messages) server.pinned_messages = [];
            if (msg.isPinned) {
                if (!server.pinned_messages.find(m => m.id === msg.id)) server.pinned_messages.push(msg);
            } else {
                server.pinned_messages = server.pinned_messages.filter(m => m.id !== msg.id);
            }
            const live = server.messages?.[msg.channelId]?.find(m => m.id === msg.id);
            if (live) live.isPinned = msg.isPinned;
            renderMessages(state.activeServerId, state.activeChannelId);
            fetch(`${API_BASE}/rooms/${state.activeServerId}/pin`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: msg }),
            });
            toast("Sabitleme güncellendi.", "info");
        });
    }

    if (isAuthor || canMod) {
        addItem("🗑️", "Mesajı Sil", () => deleteChatMessage(msg), true);
    }

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener("click", closeContextMenu, { once: true });
    }, 10);
}

function deleteChatMessage(msg) {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server?.messages?.[msg.channelId]) return;
    server.messages[msg.channelId] = server.messages[msg.channelId].filter(m => m.id !== msg.id);
    server.pinned_messages = (server.pinned_messages || []).filter(m => m.id !== msg.id);
    meshBroadcastReliable({ type: "msg_delete", payload: { channelId: msg.channelId, msgId: msg.id } });
    renderMessages(state.activeServerId, state.activeChannelId);
    toast("Mesaj silindi.", "info");
}

function showMemberProfile(peerId, username, server) {
    const m = server.members?.find(m => m.peer_id === peerId);
    const pr = server.peer_roles?.[peerId];
    const role = server.ownerId === peerId ? "Kurucu 👑"
        : pr === "admin" ? "Yönetici 🛡️"
            : pr === "mod" ? "Moderatör 🟢"
                : "Üye";
    const cls = server.ownerId === peerId ? "owner" : pr || "";
    showModal(username, `
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:10px 0">
        <div style="width:72px;height:72px;border-radius:50%;font-size:28px;display:flex;align-items:center;justify-content:center;background:${m?.avatar_color || '#7c3aed'};font-weight:700;color:#fff">
          ${username.slice(0, 1).toUpperCase()}
        </div>
        <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${username}</div>
        <span class="role-badge ${cls}">${role}</span>
        <div class="peer-id-display" style="font-size:10px;width:100%;text-align:center">${peerId}</div>
      </div>`,
        `<button class="btn-secondary" onclick="hideModal()">Kapat</button>`);
}

/* ── Moderation Actions ───────────────────────────────────── */
function kickPeer(peerId, username) {
    if (!state.mesh) return;
    state.mesh.broadcast({ type: "force_kick", target: peerId });
    
    // Remove from local state
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (server) {
        server.members = server.members.filter(m => m.peer_id !== peerId);
        updateMembersPanel(state.activeServerId);
    }
    
    toast(`${username} sunucudan atıldı. 🚪`, "info");
}

function voiceDisconnectPeer(peerId, username) {
    if (!state.mesh) return;
    state.mesh.broadcast({ type: "voice_force_disconnect", target: peerId });
    toast(`${username} ses kanalından çıkarıldı.`, "info");
}

function forceMutePeer(peerId, username) {
    if (!state.mesh) return;
    state.mesh.broadcast({ type: "force_mute", target: peerId });
    toast(`${username} sessize alındı.`, "info");
}

function assignRole(peerId, role, server) {
    if (!server.peer_roles) server.peer_roles = {};
    if (role) server.peer_roles[peerId] = role;
    else delete server.peer_roles[peerId];
    if (state.mesh) {
        state.mesh.broadcast({
            type: "server_update",
            payload: {
                id: server.id,
                name: server.name,
                channels: server.channels,
                roles: server.roles,
                peer_roles: server.peer_roles,
                channel_backgrounds: server.channel_backgrounds || {},
                inviteCode: server.inviteCode,
                icon_url: server.icon_url,
            },
        });
    }
    updateMembersPanel(server.id);
    toast("Rol güncellendi.", "success");
}

function leaveServer(serverId) {
    const idx = state.servers.findIndex(s => s.id === serverId);
    if (idx === -1) return;
    if (state.mesh) { state.mesh.disconnect(); state.mesh = null; }
    state.servers.splice(idx, 1);
    state.activeServerId = null;
    renderServerRail();
    toast("Sunucudan ayrıldın.", "info");
}



function fileToBase64(file, cb) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => cb(reader.result);
    // Compress heavily if needed but for now this works locally
    reader.readAsDataURL(file);
}

function saveSettings() {
    const newName = document.getElementById("settings-username").value.trim();
    if (newName) {
        state.username = newName;
        localStorage.setItem("scord_username", newName);
    }

    const theme = document.getElementById("settings-theme")?.value;
    if (theme !== undefined) {
        state.theme = theme;
        localStorage.setItem("scord_theme", theme);
        document.documentElement.className = theme;
    }

    const palette = document.getElementById("settings-palette")?.value;
    if (palette) {
        localStorage.setItem("scord_palette", palette);
    }
    const chatLayout = document.getElementById("settings-chat-layout")?.value;
    if (chatLayout) {
        localStorage.setItem("scord_chat_layout", chatLayout);
    }
    applyScordAppearance();

    if (state._tempAvatarImage) {
        state.avatarImage = state._tempAvatarImage;
        localStorage.setItem("scord_avatar_image", state.avatarImage);
        state._tempAvatarImage = null;
    } else {
        const avUrl = document.getElementById("settings-avatar-url")?.value?.trim();
        if (avUrl && /^https?:\/\//i.test(avUrl)) {
            state.avatarImage = avUrl;
            localStorage.setItem("scord_avatar_image", avUrl);
        }
    }

    if (state._tempBgImage) {
        state.appBackground = state._tempBgImage;
        localStorage.setItem("scord_bg_image", state.appBackground);
        document.body.style.backgroundImage = `url(${state.appBackground})`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
        state._tempBgImage = null;
    }

    // Refresh user bar UI
    const avatar = document.getElementById("user-bar-avatar");
    applyAvatarToElement(avatar, state.avatarColor, state.avatarImage, state.username);
    document.getElementById("user-bar-name").textContent = state.username;

    // Save voice settings
    const micId = document.getElementById("settings-mic-select")?.value;
    const filter = document.getElementById("settings-filter")?.value;
    const volume = document.getElementById("settings-volume")?.value;
    const noiseSuppression = document.getElementById("settings-noise-suppress")?.checked ?? true;
    const echoCancellation = document.getElementById("settings-echo-cancel")?.checked ?? true;
    const inputMode = document.getElementById("settings-input-mode")?.value || "voice";
    const pttKey = document.getElementById("settings-ptt-key")?.value || "Control";

    if (micId !== undefined) {
        state.voiceSettings = {
            micId, filter, volume: parseFloat(volume),
            noiseSuppression, echoCancellation,
            inputMode, pttKey
        };
        localStorage.setItem("scord_voice_settings", JSON.stringify(state.voiceSettings));
    }

    // Apply PTT track state immediately if talking
    if (state.originalMicStream) {
        const track = state.originalMicStream.getAudioTracks()[0];
        if (track) {
            if (state.voiceSettings.inputMode === "ptt") {
                track.enabled = !!state._pttActive;
            } else {
                track.enabled = true;
            }
        }
    }

    // Broadcast nick/avatar change if in voice
    if (state.mesh) {
        state.mesh.broadcast({
            type: "broadcast",
            payload: { type: "profile_update", username: state.username, avatarImage: state.avatarImage }
        });
    }

    const dens = document.getElementById("settings-msg-density")?.value || "cozy";
    localStorage.setItem("scord_msg_density", dens);
    document.documentElement.setAttribute("data-msg-density", dens);

    const highContrast = document.getElementById("settings-high-contrast")?.checked ?? false;
    localStorage.setItem("scord_high_contrast", highContrast ? "1" : "0");
    document.documentElement.classList.toggle("scord-high-contrast", highContrast);

    // Save notification settings
    const chatLevel = document.getElementById("notif-chat-level")?.value || "all";
    const notifDm = document.getElementById("notif-dm")?.checked ?? true;
    const notifJoin = document.getElementById("notif-join")?.checked ?? true;
    state.notifSettings = {
        chat: chatLevel !== "none",
        dm: notifDm,
        join: notifJoin,
        chatLevel,
    };
    localStorage.setItem("scord_notif_settings", JSON.stringify(state.notifSettings));

    // Save compact mode
    const compact = document.getElementById("settings-compact")?.checked ?? false;
    state.compactMode = compact;
    localStorage.setItem("scord_compact_mode", compact ? "1" : "0");
    document.body.classList.toggle("compact-mode", compact);

    hideModal();
    toast("Ayarlar kaydedildi! ✅ Ses ayarları kanaldan çıkıp girinceye kadar aktif olmaz.", "success");
}

function openServerSettingsModal() {
    if (!state.activeServerId) return toast("Önce bir sunucu seç.", "info");
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    const isOwner = server.ownerId === state.peerId;
    const isAdmin = isOwner || server.peer_roles?.[state.peerId] === "admin";
    const isMember = isOwner || server.members?.some(m => m.peer_id === state.peerId);
    const canEdit = isAdmin;
    if (!isMember) return toast("Bu işlem için sunucu üyesi olman gerekir.", "error");

    const activeChMeta = server.channels?.find(c => c.id === state.activeChannelId);
    const chLabel = activeChMeta ? `#${activeChMeta.name}` : (state.activeChannelId || "kanal");
    const bgUrl = (server.channel_backgrounds || {})[state.activeChannelId] || "";
    const inv = server.inviteCode || server.invite_code || "";
    const voicePermissionMode = server.voicePermissionMode || "everyone";
    const permissionNotice = canEdit ? "" : `<div style="margin-bottom:14px;color:var(--text-muted);font-size:13px;">Bu sunucunun ayarlarını düzenleme yetkin yok. Yine de davet kodunu kopyalayıp paylaşabilirsin.</div>`;

    showModal(
        `Sunucu Ayarları: ${escapeHtml(server.name)}`,
        `${permissionNotice}
         <div class="settings-tabs" style="display:flex; gap:16px; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:8px;">
            <div id="stab-general" onclick="window._stabSwitch('general')" style="color:var(--accent-light); cursor:pointer; font-weight:600;">Genel</div>
            <div id="stab-roles" onclick="window._stabSwitch('roles')" style="color:var(--text-muted); cursor:pointer;">Üyeler &amp; Roller</div>
            <div id="stab-advanced" onclick="window._stabSwitch('advanced')" style="color:var(--text-muted); cursor:pointer;">Gelişmiş</div>
         </div>
         <div id="s-tab-general">
            <div class="form-group" style="margin-bottom: 12px">
                <label class="modal-label">Sunucu Adı</label>
                <input class="modal-input" id="sv-name" value="${escapeHtml(server.name)}" ${isOwner ? "" : "disabled"} />
            </div>
            <div class="form-group" style="margin-bottom: 12px">
                <label class="modal-label">Sunucu İkonu (URL)</label>
                <div style="display:flex; gap:8px">
                    <input class="modal-input" id="sv-icon" value="${escapeHtml(server.icon_url || "")}" placeholder="https://…" style="flex:1" ${canEdit ? "" : "disabled"} />
                    <button type="button" class="hero-btn tiny" onclick="updateServerIcon('${server.id}', document.getElementById('sv-icon').value)" ${canEdit ? "" : "disabled"}>Güncelle</button>
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 12px">
                <label class="modal-label">Kanal arka planı (${chLabel})</label>
                <p class="modal-info" style="margin-top:4px;font-size:11px">Seçili kanal: <code>${escapeHtml(state.activeChannelId || "")}</code> — boş bırakırsan sıfırlanır.</p>
                <div style="display:flex; gap:8px; margin-top:8px">
                    <input class="modal-input" id="sv-ch-bg" value="${escapeHtml(bgUrl)}" placeholder="https://… görsel URL" style="flex:1" ${canEdit ? "" : "disabled"} />
                    <button type="button" class="hero-btn tiny" onclick="window._applyChannelBg && window._applyChannelBg()" ${canEdit ? "" : "disabled"}>Uygula</button>
                </div>
            </div>
            <div class="form-group" style="margin-bottom: 12px">
                <label class="modal-label">Görünüm Teması</label>
                <select class="modal-input" onchange="updateTheme(this.value)">
                    <option value="sapphire" ${state.theme === "sapphire" ? "selected" : ""}>Safir (Varsayılan)</option>
                    <option value="emerald" ${state.theme === "emerald" ? "selected" : ""}>Zümrüt</option>
                    <option value="ruby" ${state.theme === "ruby" ? "selected" : ""}>Yakut</option>
                    <option value="gold" ${state.theme === "gold" ? "selected" : ""}>Altın</option>
                </select>
            </div>
         </div>
         <div id="s-tab-roles" style="display:none;">
            <div style="max-height:220px; overflow-y:auto;">
                <table style="width:100%; text-align:left; color:#fff;" id="sv-roles-list"></table>
            </div>
         </div>
         <div id="s-tab-advanced" style="display:none;">
            <div class="form-group">
                <label class="modal-label">Davet Kodu</label>
                <div class="peer-id-display" style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <span id="sv-invite-code-live" style="letter-spacing:3px;font-weight:700">${escapeHtml(inv || "—")}</span>
                    <button type="button" class="hero-btn tiny" onclick="navigator.clipboard.writeText(document.getElementById('sv-invite-code-live').textContent.trim()); toast('Kod kopyalandı!','info')">Kopyala</button>
                </div>
                <p class="modal-info">Ana sayfadaki «Katıl» kutusu ve ?invite= bağlantısı bu kodla senkron.</p>
                ${isOwner ? `<button type="button" class="btn-secondary" style="margin-top:10px" onclick="window._rotateInviteCode && window._rotateInviteCode()">Yeni kod üret</button>` : ""}
            </div>
            <div class="form-group" style="margin-top:24px">
                <label class="modal-label">Sesli kanal konuşma izni</label>
                <select id="sv-voice-permission" class="modal-input" ${canEdit ? "" : "disabled"}>
                    <option value="everyone" ${voicePermissionMode !== "mods_only" ? "selected" : ""}>Herkes konuşabilir</option>
                    <option value="mods_only" ${voicePermissionMode === "mods_only" ? "selected" : ""}>Sadece moderatör ve üstleri konuşabilir</option>
                </select>
                <p class="modal-info">Bu ayar, aynı anda çok sayıda konuşma olduğunda moderatör odaklı bir konuşma düzeni sağlar.</p>
            </div>
            ${isOwner ? `
            <div class="form-group" style="margin-top:24px">
                <button type="button" class="btn-primary" style="background:var(--red); border:none;" onclick="deleteServer('${server.id}')">Sunucuyu Kapat/Kaldır</button>
            </div>` : ""}
         </div>`,
        `<button type="button" class="btn-secondary" onclick="hideModal()">Kapat</button>
         ${canEdit ? `<button type="button" class="btn-primary" style="width:auto;padding:10px 24px" onclick="saveServerSettings()">Kaydet</button>` : ""}`
    );

    window._stabSwitch = (tab) => {
        ["general", "roles", "advanced"].forEach(t => {
            document.getElementById(`s-tab-${t}`).style.display = t === tab ? "block" : "none";
            const stab = document.getElementById(`stab-${t}`);
            if (stab) {
                stab.style.color = t === tab ? "var(--accent-light)" : "var(--text-muted)";
                stab.style.fontWeight = t === tab ? "600" : "400";
            }
        });
    };

    const tbody = document.getElementById("sv-roles-list");
    tbody.innerHTML = "<tr><th>Üye</th><th>Yetki</th></tr>";
    (server.members || []).forEach(m => {
        if (m.peer_id === server.ownerId) {
            tbody.innerHTML += `<tr><td>${escapeHtml(m.username)}</td><td>Kurucu 👑</td></tr>`;
        } else {
            const pr = server.peer_roles?.[m.peer_id] || "member";
            tbody.innerHTML += `<tr>
                <td>${escapeHtml(m.username)}</td>
                <td>
                   <select ${!isOwner ? "disabled" : ""} onchange="window._tmpSetPeerRole('${m.peer_id}', this.value)" class="modal-input" style="padding:2px; height:auto; background:var(--bg-active);">
                     <option value="member" ${pr === "member" ? "selected" : ""}>Üye</option>
                     <option value="mod" ${pr === "mod" ? "selected" : ""}>Moderatör</option>
                     <option value="admin" ${pr === "admin" ? "selected" : ""}>Yönetici</option>
                   </select>
                </td>
            </tr>`;
        }
    });

    window._tmpPendingPeerRoles = { ...(server.peer_roles || {}) };
    window._tmpSetPeerRole = (peerId, val) => {
        if (val === "member") delete window._tmpPendingPeerRoles[peerId];
        else window._tmpPendingPeerRoles[peerId] = val;
    };

    window._applyChannelBg = async () => {
        const srv = state.servers.find(s => s.id === state.activeServerId);
        const url = document.getElementById("sv-ch-bg")?.value?.trim() || "";
        if (!srv || !state.activeChannelId) return toast("Önce bir kanal seç.", "warn");
        if (!srv.channel_backgrounds) srv.channel_backgrounds = {};
        if (url) srv.channel_backgrounds[state.activeChannelId] = url;
        else delete srv.channel_backgrounds[state.activeChannelId];
        await persistChannelBackground(srv.id, state.activeChannelId, url);
        applyChannelBackground(srv.id, state.activeChannelId);
        if (state.mesh) {
            state.mesh.broadcast({
                type: "server_update",
                payload: { id: srv.id, channel_backgrounds: srv.channel_backgrounds },
            });
        }
        toast("Kanal arka planı güncellendi.", "success");
    };

    window._rotateInviteCode = async () => {
        const srv = state.servers.find(s => s.id === state.activeServerId);
        if (!srv || srv.ownerId !== state.peerId) return;
        try {
            const res = await fetch(`${API_BASE}/rooms/${srv.id}/invite_rotate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ owner_id: state.peerId }),
            });
            const data = await res.json();
            if (data.invite_code) {
                srv.inviteCode = data.invite_code;
                const el = document.getElementById("sv-invite-code-live");
                if (el) el.textContent = data.invite_code;
                toast("Yeni davet kodu oluşturuldu.", "success");
                if (state.mesh) {
                    state.mesh.broadcast({
                        type: "server_update",
                        payload: { id: srv.id, inviteCode: srv.inviteCode },
                    });
                }
            } else {
                toast(data.error || "Kod yenilenemedi.", "error");
            }
        } catch (e) {
            toast("Sunucu yanıt vermedi.", "error");
        }
    };
}

function saveServerSettings() {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    const isOwner = server.ownerId === state.peerId;
    const isAdmin = isOwner || server.peer_roles?.[state.peerId] === "admin";
    if (!isAdmin) {
        toast("Bu işlem için yönetici yetkisi gerekli.", "error");
        return;
    }

    if (isOwner) {
        const nname = document.getElementById("sv-name")?.value.trim();
        if (nname) server.name = nname;
    }

    if (isOwner && window._tmpPendingPeerRoles) {
        server.peer_roles = { ...window._tmpPendingPeerRoles };
    }

    server.voicePermissionMode = document.getElementById("sv-voice-permission")?.value || "everyone";

    document.getElementById("sidebar-server-name").textContent = server.name;

    if (state.mesh) {
        state.mesh.broadcast({
            type: "server_update",
            payload: {
                id: server.id,
                name: server.name,
                channels: server.channels,
                roles: server.roles,
                peer_roles: server.peer_roles,
                channel_backgrounds: server.channel_backgrounds || {},
                inviteCode: server.inviteCode,
                icon_url: server.icon_url,
                voicePermissionMode: server.voicePermissionMode,
            },
        });
    }
    renderServerRail();
    updateChannelSidebar(server.id);
    updateMembersPanel(server.id);
    hideModal();
    toast("Sunucu güncellendi.", "success");
}

/* ── Direct Messaging ─────────────────────────────────────── */
function openDM(peerId, name, avatarColor = null, avatarImage = null) {
    state.activeDM = peerId;
    document.getElementById("dm-target-name").textContent = "@" + name;
    const av = document.getElementById("dm-header-avatar");
    if (av) applyAvatarToElement(av, avatarColor, avatarImage, name);
    const ov = document.getElementById("dm-overlay");
    ov.classList.remove("hidden");
    ov.setAttribute("aria-hidden", "false");

    addToRecentDMs(peerId, name, avatarColor, avatarImage);
    renderDMMessages(peerId);
    setTimeout(() => document.getElementById("dm-input")?.focus(), 80);
}

function addToRecentDMs(peerId, name, avatarColor, avatarImage) {
    if (!state.recentDMs) state.recentDMs = [];
    const idx = state.recentDMs.findIndex(d => d.peerId === peerId);
    if (idx !== -1) state.recentDMs.splice(idx, 1);

    state.recentDMs.unshift({ peerId, name, avatarColor, avatarImage });
    if (state.recentDMs.length > 50) state.recentDMs.pop();

    localStorage.setItem("scord_recent_dms", JSON.stringify(state.recentDMs));
    if (!state.activeServerId) renderHomeSidebar();
}

function renderHomeSidebar() {
    const list = document.getElementById("channel-list");
    list.innerHTML = "";

    // 1. DMs Section
    const dmCat = document.createElement("div");
    dmCat.className = "channel-category";
    dmCat.textContent = "DİREKT MESAJLAR";
    list.appendChild(dmCat);

    (state.recentDMs || []).forEach(dm => {
        const item = createSidebarItem(dm.name, dm.avatarColor, dm.avatarImage, () => openDM(dm.peerId, dm.name, dm.avatarColor, dm.avatarImage));
        list.appendChild(item);
    });

    // 2. Friends Section
    const friendCat = document.createElement("div");
    friendCat.className = "channel-category";
    friendCat.style.marginTop = "20px";
    friendCat.textContent = "ARKADAŞLAR";
    list.appendChild(friendCat);

    if (!state.friends || state.friends.length === 0) {
        const empty = document.createElement("div");
        empty.style.padding = "10px 12px";
        empty.style.fontSize = "12px";
        empty.style.color = "var(--text-muted)";
        empty.textContent = "Henüz arkadaşın yok.";
        list.appendChild(empty);
    } else {
        state.friends.forEach(f => {
            const item = createSidebarItem(f.name, f.avatarColor, f.avatarImage, () => openUserProfile(f.peerId, f.name, f.avatarImage, f.avatarColor));
            list.appendChild(item);
        });
    }
}

function createSidebarItem(name, color, image, onclick) {
    const item = document.createElement("div");
    item.className = "channel-item dm-sidebar-item";
    item.style.padding = "6px 12px";
    item.style.display = "flex";
    item.style.alignItems = "center";
    item.style.gap = "8px";

    const av = document.createElement("div");
    av.style.width = "32px";
    av.style.height = "32px";
    av.style.borderRadius = "50%";
    av.style.flexShrink = "0";
    applyAvatarToElement(av, color, image, name);

    const nameText = document.createElement("span");
    nameText.textContent = name;
    nameText.style.flex = "1";
    nameText.style.whiteSpace = "nowrap";
    nameText.style.overflow = "hidden";
    nameText.style.textOverflow = "ellipsis";

    item.appendChild(av);
    item.appendChild(nameText);
    item.onclick = onclick;
    return item;
}

function addFriend(peerId, name) {
    const server = state.servers.find(s => s.id === state.activeServerId);
    const m = server?.members.find(mem => mem.peer_id === peerId);

    if (!state.friends) state.friends = [];
    if (state.friends.find(f => f.peerId === peerId)) return;

    state.friends.push({
        peerId,
        name,
        avatarColor: m?.avatar_color,
        avatarImage: m?.avatar_image
    });
    localStorage.setItem("scord_friends", JSON.stringify(state.friends));
    toast(`${name} arkadaş olarak eklendi! ✨`, "success");
}

function removeFriend(peerId) {
    state.friends = state.friends.filter(f => f.peerId !== peerId);
    localStorage.setItem("scord_friends", JSON.stringify(state.friends));
    if (!state.activeServerId) renderHomeSidebar();
    toast("Arkadaş listesinden çıkarıldı.", "info");
}

function renderDMMessages(peerId) {
    const area = document.getElementById("dm-messages-area");
    area.innerHTML = "";
    const messages = state.dms[peerId] || [];

    if (messages.length === 0) {
        const hint = document.createElement("div");
        hint.className = "dm-empty-hint";
        hint.innerHTML = "<p>Henüz mesaj yok.</p><p style=\"margin-top:8px;font-size:12px\">İlk mesajını yaz — uçtan uca P2P ile gider.</p>";
        area.appendChild(hint);
        return;
    }

    messages.forEach(msg => {
        const row = document.createElement("div");
        row.className = "dm-msg-row" + (msg.authorId === state.peerId ? " dm-msg-own" : "");

        const av = document.createElement("div");
        av.className = "msg-avatar dm-msg-avatar";
        applyAvatarToElement(av, msg.avatarColor, msg.avatarImage, msg.author);

        const bubble = document.createElement("div");
        bubble.className = "dm-bubble";
        const meta = document.createElement("div");
        meta.className = "dm-bubble-meta";
        meta.innerHTML = `<span class="dm-bubble-author">${escapeHtml(msg.author)}</span><span class="dm-bubble-time">${escapeHtml(msg.time || "")}</span>`;

        const text = document.createElement("div");
        text.className = "dm-bubble-text";
        text.innerHTML = parseMessageText(msg.text, null);

        bubble.appendChild(meta);
        bubble.appendChild(text);
        row.appendChild(av);
        row.appendChild(bubble);
        area.appendChild(row);
    });
    area.scrollTop = area.scrollHeight;
}

function sendDM() {
    const input = document.getElementById("dm-input");
    const text = input.value.trim();
    if (!text || !state.activeDM) return;

    const msg = {
        author: state.username,
        authorId: state.peerId,
        avatarColor: state.avatarColor,
        avatarImage: state.avatarImage,
        text,
        time: now()
    };
    if (!state.dms) state.dms = {};
    if (!state.dms[state.activeDM]) state.dms[state.activeDM] = [];
    state.dms[state.activeDM].push(msg);
    renderDMMessages(state.activeDM);

    if (state.mesh) {
        state.mesh.sendTo(state.activeDM, { type: "dm", payload: msg });
    }
    input.value = "";
}

let _qsActiveIdx = 0;
let _qsFiltered = [];

function closeQuickSwitcher() {
    const el = document.getElementById("quick-switcher");
    if (el) el.classList.add("hidden");
    state._qsOpen = false;
}

function openQuickSwitcher() {
    const el = document.getElementById("quick-switcher");
    const inp = document.getElementById("quick-switcher-input");
    if (!el || !inp) return;
    el.classList.remove("hidden");
    state._qsOpen = true;
    inp.value = "";
    _qsActiveIdx = 0;
    updateQuickSwitcherFilter("");
    setTimeout(() => inp.focus(), 30);
}

function toggleQuickSwitcher() {
    if (document.getElementById("quick-switcher")?.classList.contains("hidden")) openQuickSwitcher();
    else closeQuickSwitcher();
}

function updateQuickSwitcherFilter(q) {
    const res = document.getElementById("quick-switcher-results");
    if (!res) return;
    const qq = (q || "").trim().toLowerCase();
    const items = [];
    state.servers.forEach(srv => {
        (srv.channels || []).forEach(ch => {
            const label = `${srv.name} / ${ch.type === "voice" ? "🔊" : "#"}${ch.name}`;
            const hay = `${srv.name} ${ch.name} ${ch.id}`.toLowerCase();
            if (!qq || hay.includes(qq)) {
                items.push({ serverId: srv.id, channelId: ch.id, type: ch.type, title: ch.name, sub: srv.name });
            }
        });
    });
    _qsFiltered = items.slice(0, 40);
    res.innerHTML = "";
    _qsFiltered.forEach((it, i) => {
        const row = document.createElement("div");
        row.className = "qs-item" + (i === _qsActiveIdx ? " qs-item--active" : "");
        row.dataset.idx = String(i);
        row.innerHTML = `<span class="qs-item-title">${escapeHtml(it.title)}</span><span class="qs-item-sub">${escapeHtml(it.sub)} · ${it.type === "voice" ? "ses" : "metin"}</span>`;
        row.onclick = () => runQuickSwitcherIndex(i);
        res.appendChild(row);
    });
    if (_qsFiltered.length === 0) {
        res.innerHTML = `<div class="qs-item"><span class="qs-item-sub">Eşleşme yok</span></div>`;
    }
}

function runQuickSwitcherIndex(i) {
    const it = _qsFiltered[i];
    if (!it) return;
    closeQuickSwitcher();
    switchToServer(it.serverId);
    if (it.type === "voice") showVoiceView(it.serverId, it.channelId);
    else showChatView(it.serverId, it.channelId);
}

function fillLastOwnChatLine() {
    const input = document.getElementById("chat-input");
    if (!input || !state.activeServerId || !state.activeChannelId) return;
    const srv = state.servers.find(s => s.id === state.activeServerId);
    const msgs = srv?.messages?.[state.activeChannelId];
    if (!msgs?.length) return;
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].authorId === state.peerId) {
            input.value = msgs[i].text || "";
            input.style.height = "auto";
            input.style.height = Math.min(input.scrollHeight, 200) + "px";
            return;
        }
    }
}

/* ── Mention Autocomplete ─────────────────────────────────── */
let _mentionSuggestions = [];
let _mentionActiveIndex = 0;

function showMentionSuggestions(input) {
    const value = input.value;
    const cursorPos = input.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");
    
    if (lastAtIndex === -1 || (lastAtIndex > 0 && /\w/.test(textBeforeCursor[lastAtIndex - 1]))) {
        hideMentionSuggestions();
        return;
    }
    
    const mentionText = textBeforeCursor.substring(lastAtIndex + 1);
    if (mentionText.length < 1) {
        hideMentionSuggestions();
        return;
    }
    
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) {
        hideMentionSuggestions();
        return;
    }
    
    const members = server.members || [];
    _mentionSuggestions = members.filter(m => 
        m.username.toLowerCase().includes(mentionText.toLowerCase())
    ).slice(0, 5);
    
    if (_mentionSuggestions.length === 0) {
        hideMentionSuggestions();
        return;
    }
    
    _mentionActiveIndex = 0;
    renderMentionSuggestions(input, lastAtIndex, mentionText);
}

function renderMentionSuggestions(input, atIndex, mentionText) {
    let popup = document.getElementById("mention-popup");
    if (!popup) {
        popup = document.createElement("div");
        popup.id = "mention-popup";
        popup.className = "mention-popup";
        input.parentElement.insertBefore(popup, input.nextSibling);
    }
    
    popup.innerHTML = _mentionSuggestions.map((member, idx) => `
        <div class="mention-item ${idx === _mentionActiveIndex ? "active" : ""}" 
             data-member-id="${escapeHtml(member.peer_id)}"
             data-username="${escapeHtml(member.username)}">
            <div class="mention-avatar" style="background-color: ${escapeHtml(member.avatar_color)}">
                ${initials(member.username)}
            </div>
            <span class="mention-name">${escapeHtml(member.username)}</span>
        </div>
    `).join("");
    
    popup.classList.remove("hidden");
    popup.querySelectorAll(".mention-item").forEach((item, idx) => {
        item.onclick = () => insertMention(input, atIndex, member.username);
    });
}

function hideMentionSuggestions() {
    const popup = document.getElementById("mention-popup");
    if (popup) {
        popup.classList.add("hidden");
    }
}

function insertMention(input, atIndex, username) {
    const value = input.value;
    const cursorPos = input.selectionStart;
    const textBeforeCursor = value.substring(0, atIndex);
    const textAfterCursor = value.substring(cursorPos);
    
    input.value = textBeforeCursor + "@" + username + " " + textAfterCursor;
    input.selectionStart = input.selectionEnd = atIndex + username.length + 2;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 200) + "px";
    hideMentionSuggestions();
}

const debouncedPersistDraft = UI.debounce(() => {
    if (state.activeServerId && state.activeChannelId) persistChatDraftFor(state.activeServerId, state.activeChannelId);
}, 400);

function initMembersPanelResize() {
    const handle = document.getElementById("members-split-handle");
    const panel = document.getElementById("members-panel");
    if (!handle || !panel) return;
    const saved = parseInt(localStorage.getItem("scord_members_panel_w") || "", 10);
    if (!Number.isNaN(saved) && saved >= 200 && saved <= 560) {
        panel.style.width = `${saved}px`;
        panel.style.flexShrink = "0";
    }
    let startX = 0;
    let startW = 0;
    handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        startX = e.clientX;
        startW = panel.getBoundingClientRect().width;
        const onMove = (ev) => {
            const dx = startX - ev.clientX;
            const nw = Math.min(560, Math.max(180, startW + dx));
            panel.style.width = `${nw}px`;
            panel.style.flexShrink = "0";
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            localStorage.setItem("scord_members_panel_w", String(Math.round(panel.getBoundingClientRect().width)));
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });
}

/* ── Event listeners ──────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
    initSetup();
    initMembersPanelResize();
    document.getElementById("server-settings-btn").onclick = openServerSettingsModal;
    document.getElementById("server-invite-btn").onclick = () => showInviteModal(state.activeServerId);

    // Modal close
    document.getElementById("modal-close").onclick = hideModal;
    document.getElementById("modal-backdrop").onclick = (e) => {
        if (e.target === document.getElementById("modal-backdrop")) hideModal();
    };

    // Chat input
    const chatInput = document.getElementById("chat-input");
    chatInput.addEventListener("keydown", (e) => {
        // Handle mention popup navigation
        const mentionPopup = document.getElementById("mention-popup");
        if (mentionPopup && !mentionPopup.classList.contains("hidden") && _mentionSuggestions.length > 0) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                _mentionActiveIndex = (_mentionActiveIndex + 1) % _mentionSuggestions.length;
                renderMentionSuggestions(chatInput, chatInput.value.lastIndexOf("@"), "");
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                _mentionActiveIndex = (_mentionActiveIndex - 1 + _mentionSuggestions.length) % _mentionSuggestions.length;
                renderMentionSuggestions(chatInput, chatInput.value.lastIndexOf("@"), "");
                return;
            }
            if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                const member = _mentionSuggestions[_mentionActiveIndex];
                if (member) {
                    insertMention(chatInput, chatInput.value.lastIndexOf("@"), member.username);
                }
                return;
            }
            if (e.key === "Escape") {
                hideMentionSuggestions();
                return;
            }
        }
        
        if (e.key === "ArrowUp" && chatInput.selectionStart === 0 && !e.shiftKey && !chatInput.value.trim()) {
            e.preventDefault();
            fillLastOwnChatLine();
            return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    chatInput.addEventListener("input", () => {
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + "px";
        debouncedPersistDraft();
        
        // Send typing indicator
        if (state.activeServerId && state.activeChannelId && chatInput.value.trim()) {
            broadcastTypingIndicator();
        }
        
        // Show mention suggestions
        showMentionSuggestions(chatInput);
    });

    document.getElementById("send-btn").onclick = sendMessage;
    document.getElementById("reply-preview-close")?.addEventListener("click", () => clearReplyTarget());

    document.getElementById("focus-mode-toggle")?.addEventListener("click", () => {
        const app = document.getElementById("app");
        if (!app) return;
        const next = app.getAttribute("data-scord-focus") === "1" ? "0" : "1";
        app.setAttribute("data-scord-focus", next);
        localStorage.setItem("scord_focus_mode", next === "1" ? "1" : "0");
        applyFocusModeButton();
    });

    document.getElementById("new-msgs-chip")?.addEventListener("click", () => {
        const area = document.getElementById("messages-area");
        if (area) area.scrollTop = area.scrollHeight;
        hideNewMsgsChip();
    });

    const qsEl = document.getElementById("quick-switcher");
    const qsInp = document.getElementById("quick-switcher-input");
    if (qsEl && qsInp) {
        qsEl.addEventListener("click", (e) => {
            if (e.target === qsEl) closeQuickSwitcher();
        });
        qsInp.addEventListener("input", () => {
            _qsActiveIdx = 0;
            updateQuickSwitcherFilter(qsInp.value);
        });
        qsInp.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                closeQuickSwitcher();
                return;
            }
            if (e.key === "ArrowDown") {
                e.preventDefault();
                _qsActiveIdx = Math.min(Math.max(0, _qsFiltered.length - 1), _qsActiveIdx + 1);
                updateQuickSwitcherFilter(qsInp.value);
                return;
            }
            if (e.key === "ArrowUp") {
                e.preventDefault();
                _qsActiveIdx = Math.max(0, _qsActiveIdx - 1);
                updateQuickSwitcherFilter(qsInp.value);
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                runQuickSwitcherIndex(_qsActiveIdx);
            }
        });
    }

    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "k") {
            if (!document.getElementById("modal-backdrop")?.classList.contains("hidden")) return;
            e.preventDefault();
            toggleQuickSwitcher();
            return;
        }
        if (e.key === "Escape") {
            const dmOv = document.getElementById("dm-overlay");
            if (state.activeDM && dmOv && !dmOv.classList.contains("hidden")) {
                dmOv.classList.add("hidden");
                dmOv.setAttribute("aria-hidden", "true");
                state.activeDM = null;
                return;
            }
            if (state._qsOpen) {
                closeQuickSwitcher();
                return;
            }
            if (!document.getElementById("modal-backdrop")?.classList.contains("hidden")) {
                hideModal();
                return;
            }
            if (state.replyTo) {
                clearReplyTarget();
                return;
            }
            if (state.emojiOpen) {
                document.getElementById("emoji-picker")?.remove();
                state.emojiOpen = false;
            }
        }
    }, true);

    // Server create / join
    document.getElementById("add-server-btn").onclick = openCreateServerModal;
    document.getElementById("create-server-hero-btn").onclick = openCreateServerModal;
    document.getElementById("join-server-hero-btn").onclick = openJoinServerModal;

    // Home button
    document.getElementById("home-btn").onclick = showHomeView;

    // Join by Code
    document.getElementById("join-by-code-btn").onclick = joinByCode;

    // Discover button
    document.getElementById("discover-btn").onclick = () => { showHomeView(); refreshDiscovery(); };

    // Members toggle
    document.getElementById("members-toggle-btn").onclick = () => {
        state.membersOpen = !state.membersOpen;
        const panel = document.getElementById("members-panel");
        panel.classList.toggle("collapsed", !state.membersOpen);
    };

    // Voice controls
    document.getElementById("voice-join-btn").onclick = () => {
        if (state.activeChannelId) joinVoiceChannel(state.activeChannelId);
    };
    document.getElementById("voice-leave-btn").onclick = leaveVoiceChannel;
    document.getElementById("vsb-disconnect-btn").onclick = leaveVoiceChannel;

    // Mic toggle
    document.getElementById("mic-toggle-btn").onclick = () => {
        if (!state.mesh) return;
        const muted = state.mesh.toggleMic();
        document.getElementById("mic-toggle-btn").classList.toggle("muted", muted);
        toast(muted ? "Mikrofon kapatıldı 🔇" : "Mikrofon açıldı 🎙️", "info");
    };

    // Emoji picker
    document.getElementById("emoji-btn").onclick = toggleEmojiPicker;

    // GIF picker
    const gifBtn = document.getElementById("gif-btn");
    const gifPopover = document.getElementById("gif-search-popover");
    if (gifBtn && gifPopover) {
        gifBtn.onclick = () => {
            gifPopover.classList.toggle("hidden");
            if (!gifPopover.classList.contains("hidden")) {
                document.getElementById("gif-input").focus();
                searchGifs("trending");
            }
        };
        const gifInput = document.getElementById("gif-input");
        gifInput.addEventListener("input", UI.debounce((e) => searchGifs(e.target.value), SCORD_T().GIF_SEARCH_DEBOUNCE_MS ?? 500));
    }

    // Settings
    document.getElementById("settings-btn").onclick = openSettingsModal;
    document.getElementById("pins-toggle-btn").onclick = () => showPinnedMessages();
    const transBtn = document.getElementById("translate-toggle-btn");
    if (transBtn) {
        transBtn.onclick = () => {
            state.translationEnabled = !state.translationEnabled;
            transBtn.classList.toggle("active", state.translationEnabled);
            toast(state.translationEnabled ? "Yazarken Çeviri: AÇIK (TR/EN)" : "Yazarken Çeviri: KAPALI", "info");
        };
    }

    // DM overlay interactions
    document.getElementById("dm-close-btn").onclick = () => {
        const ov = document.getElementById("dm-overlay");
        ov.classList.add("hidden");
        ov.setAttribute("aria-hidden", "true");
        state.activeDM = null;
    };
    document.getElementById("dm-send-btn")?.addEventListener("click", sendDM);
    const dmInput = document.getElementById("dm-input");
    if (dmInput) {
        dmInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendDM();
            }
        });
    }

    // Attachments
    const attachBtn = document.getElementById("chat-attach-btn");
    const fileUpload = document.getElementById("chat-file-upload");
    if (attachBtn && fileUpload) {
        attachBtn.onclick = () => fileUpload.click();
        fileUpload.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 500000) { toast("Dosya çok büyük. En fazla ~500KB yüklenebilir.", "error"); return; }
            fileToBase64(file, (b64) => {
                const msg = {
                    type: "chat",
                    channelId: state.activeChannelId,
                    text: "Bir dosya paylaşıldı.",
                    attachment: b64,
                    author: state.username,
                    authorId: state.peerId,
                    avatarColor: state.avatarColor,
                    avatarImage: state.avatarImage,
                    time: now(),
                    id: genId(),
                };
                if (state.replyTo?.messageId) {
                    msg.replyTo = {
                        messageId: state.replyTo.messageId,
                        author: state.replyTo.author,
                        authorId: state.replyTo.authorId,
                        snippet: (state.replyTo.text || "").slice(0, 120),
                        text: (state.replyTo.text || "").slice(0, 200),
                    };
                }
                clearReplyTarget();
                saveMessage(state.activeServerId, msg);
                meshBroadcastReliable({ type: "chat", payload: msg });
            });
        };
    }

    // Screen Share & Camera
    const screenBtn = document.getElementById("voice-screen-btn");
    if (screenBtn) {
        screenBtn.onclick = async () => {
            if (!state.mesh) return;
            if (state.mesh.screenStream) {
                state.mesh.stopScreenShare();
                screenBtn.classList.remove("active");
                if (state.mesh) {
                    state.mesh.broadcast({
                        type: "screen_status",
                        sharing: false,
                        channelId: state.voiceChannelId || state.activeChannelId,
                    });
                }
                const preview = document.getElementById("local-screen-preview");
                if (preview && !state.cameraStream) preview.classList.add("hidden");
            } else {
                const success = await state.mesh.startScreenShare();
                if (success) {
                    state.screenStream = state.mesh.screenStream;
                    screenBtn.classList.add("active");
                    toast("Ekran paylaşımı başlatıldı.", "success");
                    if (state.mesh) {
                        state.mesh.broadcast({
                            type: "screen_status",
                            sharing: true,
                            channelId: state.voiceChannelId || state.activeChannelId,
                        });
                    }

                    // Local Preview
                    const preview = document.getElementById("local-screen-preview");
                    const video = document.getElementById("self-share-video");
                    const lbl = document.getElementById("local-preview-label");
                    if (preview && video) {
                        preview.classList.remove("hidden");
                        video.srcObject = state.mesh.screenStream;
                        if (lbl) lbl.textContent = "Yayındasın (Önizleme)";
                    }
                }
            }
        };
    }

    const cameraBtn = document.getElementById("voice-camera-btn");
    if (cameraBtn) {
        cameraBtn.onclick = async () => {
            if (!state.mesh) return;
            if (state.cameraStream) {
                stopCameraShare();
            } else {
                startCameraShare();
            }
        };
    }

    // PTT Global Listeners
    window.addEventListener("keydown", (e) => {
        if (state.voiceSettings?.inputMode === "ptt" && e.key === state.voiceSettings.pttKey) {
            if (state._pttActive) return;
            state._pttActive = true;
            if (state.originalMicStream) {
                const track = state.originalMicStream.getAudioTracks()[0];
                if (track) track.enabled = true;
                if (state.mesh) {
                    state.mesh.broadcast({
                        type: "voice_status",
                        speaking: true,
                        channelId: state.voiceChannelId,
                    });
                }
            }
        }
    });
    window.addEventListener("keyup", (e) => {
        if (state.voiceSettings?.inputMode === "ptt" && e.key === state.voiceSettings.pttKey) {
            state._pttActive = false;
            if (state.originalMicStream) {
                const track = state.originalMicStream.getAudioTracks()[0];
                if (track) track.enabled = false;
                if (state.mesh) {
                    state.mesh.broadcast({
                        type: "voice_status",
                        speaking: false,
                        channelId: state.voiceChannelId,
                    });
                }
            }
        }
    });

    // Load recent DMs
    state.recentDMs = JSON.parse(localStorage.getItem("scord_recent_dms") || "[]");
});

function showPinnedMessages() {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;
    const pins = (server.pinned_messages || []).filter(m => m.channelId === state.activeChannelId);

    const body = document.createElement("div");
    if (pins.length === 0) {
        body.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">Bu kanalda sabitlenmiş mesaj yok.</p>`;
    } else {
        pins.forEach(m => {
            const item = document.createElement("div");
            item.className = "pins-modal-item";
            item.innerHTML = `
                <div style="font-weight:bold; font-size:12px; margin-bottom:4px; color:var(--accent-light)">${m.author} • ${m.time}</div>
                <div style="font-size:14px;">${parseMessageText(m.text, state.activeServerId)}</div>
            `;
            body.appendChild(item);
        });
    }

    showModal("Sabitlenmiş Mesajlar", body);
}

function updateMuteStates() {
    if (!state.remoteMedia) return;
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    // Find who is in our exact voice channel
    const myChannel = state.voiceChannelId;
    let myChannelPeers = [];
    if (myChannel && server.voiceMembers?.[myChannel]) {
        myChannelPeers = server.voiceMembers[myChannel].map(m => m.peer_id);
    }

    // Mute everyone else
    Object.keys(state.remoteMedia).forEach(peerId => {
        const video = state.remoteMedia[peerId];
        if (!video) return;

        // Unmute only if they are in OUR channel, AND we are in a channel
        if (myChannel && myChannelPeers.includes(peerId) && peerId !== state.peerId) {
            video.muted = false;
        } else {
            video.muted = true;
        }
    });
}

/* ── Music Bot (YouTube IFrame API) ───────────────────────── */
state.musicBot = { active: false, videoId: null, player: null, volume: 30 };
state._musicBotPending = null;
let ytReady = false;

// Global callback for YouTube script
window.onYouTubeIframeAPIReady = function () {
    ytReady = true;
    if (state._musicBotPending && state.voiceChannelId) {
        const p = state._musicBotPending;
        state._musicBotPending = null;
        startMusicBot(p.videoId, p.startAt);
    }
};

function startMusicBot(videoId, startAt) {
    if (!state.voiceChannelId) return;

    state.musicBot.active = true;
    state.musicBot.videoId = videoId;

    const server = state.servers.find(s => s.id === state.activeServerId);
    if (server) {
        if (!server.voiceMembers) server.voiceMembers = {};
        if (!server.voiceMembers[state.voiceChannelId]) server.voiceMembers[state.voiceChannelId] = [];

        // Remove old bot if present
        server.voiceMembers[state.voiceChannelId] = server.voiceMembers[state.voiceChannelId].filter(m => m.peer_id !== "bot_music");

        server.voiceMembers[state.voiceChannelId].push({
            peer_id: "bot_music",
            username: "🎵 Müzik Botu",
            avatar_color: "#ef4444",
            avatar_image: null
        });

        renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
        updateChannelSidebar(state.activeServerId);
    }

    const offset = Math.max(0, (Date.now() - startAt) / 1000);

    if (!state.musicBot.player && !ytReady) {
        state._musicBotPending = { videoId, startAt };
        toast("YouTube oynatıcı yükleniyor… Hazır olunca çalacak.", "info");
        return;
    }

    if (!state.musicBot.player && ytReady) {
        state.musicBot.player = new YT.Player("yt-player", {
            height: "1",
            width: "1",
            videoId: videoId,
            playerVars: { autoplay: 1, controls: 0, showinfo: 0, start: Math.floor(offset) },
            events: {
                onReady: (e) => {
                    e.target.setVolume(state.musicBot.volume);
                    e.target.playVideo();
                }
            }
        });
    } else if (state.musicBot.player) {
        state.musicBot.player.loadVideoById(videoId, Math.floor(offset));
        state.musicBot.player.setVolume(state.musicBot.volume);
        try {
            state.musicBot.player.playVideo();
        } catch (e) { /* noop */ }
    }
}

function stopMusicBot() {
    state.musicBot.active = false;
    state.musicBot.videoId = null;
    state._musicBotPending = null;

    if (state.musicBot.player) {
        state.musicBot.player.stopVideo();
    }

    const server = state.servers.find(s => s.id === state.activeServerId);
    const ch = state.voiceChannelId;
    if (server && ch && server.voiceMembers?.[ch]) {
        server.voiceMembers[ch] = server.voiceMembers[ch].filter(m => m.peer_id !== "bot_music");
        if (state.activeChannelId === ch) {
            renderVoiceParticipants(state.activeServerId, ch);
        }
        updateChannelSidebar(state.activeServerId);
    }
}

/* ── User Profile & Screen Share Bindings ────────────────── */
function openUserProfile(peerId, username, avatarImage, avatarColor) {
    const isSelf = peerId === state.peerId;
    const userNote = getUserNote(peerId);
    const isFriend = state.friends.some(f => f.peerId === peerId);

    // Create Profile HTML
    const body = `
        <div class="profile-banner" style="height:60px; background:${avatarColor || '#7c3aed'}; border-radius: 8px 8px 0 0;"></div>
        <div class="profile-avatar" style="width:80px; height:80px; border-radius:50%; margin-top:-40px; margin-left:16px; border:4px solid var(--bg-elevated); background-color:${avatarColor || '#7c3aed'}; background-image:url(${avatarImage || ''}); background-size:cover; background-position:center; display:flex; align-items:center; justify-content:center; font-size:30px; color:#fff;">
            ${!avatarImage ? initials(username) : ""}
        </div>
        <div style="padding:16px;">
            <h2 style="margin:0 0 4px 0">${username}</h2>
            <p style="margin:0; font-family:monospace; color:var(--text-muted); font-size:12px;">ID: ${peerId}</p>
        </div>
        <div style="padding:0 16px 12px 16px; border-top: 1px solid var(--border); margin-top: 12px; gap: 8px; display: flex; gap: 8px;">
            ${!isSelf ? `
                <label style="display: flex; align-items: center; gap: 6px; flex: 1;">
                    <input type="checkbox" id="friend-checkbox-${peerId}" ${isFriend ? 'checked' : ''} style="cursor: pointer; width: 16px; height: 16px;">
                    <span style="font-size: 12px;">Arkadaş Ekle</span>
                </label>
            ` : ''}
        </div>
        ${!isSelf ? `
            <div style="padding:0 16px 12px 16px;">
                <label style="display: block; margin-bottom: 6px; font-size: 12px; font-weight: 600; color: var(--text-secondary);">Notlar</label>
                <textarea id="profile-note-input" placeholder="Bu kullanıcı hakkında notlar..." style="width: 100%; height: 60px; padding: 8px; border-radius: var(--r-sm); border: 1px solid var(--border-strong); background: var(--bg-highlight); color: var(--text-primary); resize: vertical; font-family: inherit; font-size: 12px;">${escapeHtml(userNote)}</textarea>
            </div>
        ` : ''}
    `;

    const footer = !isSelf ? `
        <button class="btn-secondary" onclick="saveProfileNote('${peerId}')">Notu Kaydet</button>
        <button class="btn-primary" onclick="openDM('${peerId}', '${username}', '${avatarColor || ''}', '${avatarImage || ''}'); hideModal();">Mesaj Gönder</button>
    ` : `<button class="btn-secondary" onclick="hideModal()">Kapat</button>`;

    showModal("Kullanıcı Profili", body, footer);
    
    // Add event listener for friend checkbox
    if (!isSelf) {
        setTimeout(() => {
            const checkbox = document.getElementById(`friend-checkbox-${peerId}`);
            if (checkbox) {
                checkbox.addEventListener("change", () => {
                    toggleFriendStatus(peerId, username, avatarColor, avatarImage);
                });
            }
        }, 100);
    }
}

function saveProfileNote(peerId) {
    const textarea = document.getElementById("profile-note-input");
    if (textarea) {
        const note = textarea.value;
        saveUserNote(peerId, note);
        toast("Not kaydedildi!", "success");
    }
}

function toggleFriendStatus(peerId, username, avatarColor, avatarImage) {
    const index = state.friends.findIndex(f => f.peerId === peerId);
    if (index >= 0) {
        state.friends.splice(index, 1);
    } else {
        state.friends.push({ peerId, username, avatarColor, avatarImage });
    }
    saveFriendsToStorage();
    toast(`${username} ${index >= 0 ? 'arkadaş listesinden çıkarıldı' : 'arkadaş listesine eklendi'}!`, "success");
}

function saveFriendsToStorage() {
    const friendsData = state.friends.map(f => ({
        peerId: f.peerId,
        username: f.username,
        avatarColor: f.avatarColor,
        avatarImage: f.avatarImage
    }));
    localStorage.setItem("scord_friends", JSON.stringify(friendsData));
}

function loadFriendsFromStorage() {
    try {
        const data = localStorage.getItem("scord_friends");
        if (data) {
            state.friends = JSON.parse(data);
        }
    } catch (e) {
        console.warn("Failed to load friends", e);
    }
}

// P2P Callback for when native browser screen sharing stops
window.onLocalScreenShareEnded = function () {
    const screenBtn = document.getElementById("voice-screen-btn");
    if (screenBtn) screenBtn.classList.remove("active");
    state.screenStream = null;
    if (state.mesh) {
        state.mesh.broadcast({
            type: "screen_status",
            sharing: false,
            channelId: state.voiceChannelId || state.activeChannelId,
        });
    }
    toast("Ekran paylaşımı durduruldu.", "info");

    const preview = document.getElementById("local-screen-preview");
    if (preview) preview.classList.add("hidden");
    if (state.activeServerId && state.voiceChannelId) {
        renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
    }
};

function updateRoomStats() {
    const statsEl = document.getElementById("channel-stats");
    if (!statsEl || !state.activeServerId || !state.activeChannelId) return;

    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    const count = server.members?.length ?? server.peer_count ?? 0;
    statsEl.textContent = `${count} üye`;
}

setInterval(() => {
    if (state.activeServerId) updateRoomStats();
}, SCORD_T().ROOM_STATS_POLL_MS ?? 10000);

async function joinByCode() {
    const code = document.getElementById("join-invite-input").value.trim().toUpperCase();
    if (!code) return;
    try {
        const res = await scordFetch(`${API_BASE}/rooms/join/${code}`);
        if (!res.ok) return;
        const room = await res.json();
        if (room.room_id) {
            joinServer(room.room_id);
            document.getElementById("join-invite-input").value = "";
        } else {
            toast("Davet kodu geçersiz.", "error");
        }
    } catch (e) {
        toast("Hata oluştu.", "error");
    }
}

function updateTheme(themeName) {
    state.theme = themeName;
    document.documentElement.className = themeName || "";
    localStorage.setItem("scord_theme", themeName || "");
    applyScordAppearance();
    toast(`Tema güncellendi.`, "success");
}

async function deleteServer(serverId) {
    if (!confirm("Bu sunucuyu kalıcı olarak silmek istediğine emin misin? Bu işlem geri alınamaz!")) return;
    try {
        const res = await fetch(`${API_BASE}/rooms/${serverId}?owner_id=${state.peerId}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
            toast("Sunucu başarıyla silindi.", "success");
            state.servers = state.servers.filter(s => s.id !== serverId);
            showHomeView();
            renderServerRail();
        } else {
            toast("Sunucu silinemedi: " + (data.error || "Bilinmeyen hata"), "error");
        }
    } catch (e) {
        toast("Bağlantı hatası.", "error");
    }
}

function updateServerIcon(serverId, url) {
    fetch(`${API_BASE}/rooms/${serverId}/icon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
    }).then(res => res.json()).then(data => {
        if (data.success) {
            toast("Sunucu ikonu güncellendi.", "success");
            const server = state.servers.find(s => s.id === serverId);
            if (server) server.icon_url = url;
            renderServerRail();
        }
    });
}
async function searchGifs(q) {
    const results = document.getElementById("gif-results");
    if (!results) return;
    results.innerHTML = "<p style='padding:10px; font-size:12px;'>Yükleniyor...</p>";
    try {
        const query = encodeURIComponent(q || "excited");
        const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${query}&key=LIVDTRZ9ORH6&limit=12`);
        const data = await res.json();
        results.innerHTML = "";
        data.results.forEach(g => {
            const img = document.createElement("img");
            img.src = g.media_formats.tinygif.url;
            img.onclick = () => {
                const chatInput = document.getElementById("chat-input");
                chatInput.value = g.itemurl;
                sendMessage();
                document.getElementById("gif-search-popover").classList.add("hidden");
            };
            results.appendChild(img);
        });
    } catch (e) {
        results.innerHTML = "<p style='padding:10px; color:var(--red);'>Arama hatası.</p>";
    }
}

// Emoji Picker Logic
function toggleEmojiPicker() {
    state.emojiOpen = !state.emojiOpen;
    let picker = document.getElementById("emoji-picker-popover");
    if (!picker) {
        picker = document.createElement("div");
        picker.id = "emoji-picker-popover";
        picker.className = "emoji-popover";
        EMOJIS.forEach(emoji => {
            const span = document.createElement("span");
            span.textContent = emoji;
            span.onclick = () => {
                const input = document.getElementById("chat-input");
                input.value += emoji;
                input.focus();
                toggleEmojiPicker();
            };
            picker.appendChild(span);
        });
        document.querySelector(".chat-input-wrapper").appendChild(picker);
    }
    picker.classList.toggle("hidden", !state.emojiOpen);
}

// Global initialization
document.addEventListener("DOMContentLoaded", () => {
    console.log("[App] DOM Loaded, initializing...");
    initSetup();
});
/* ═
   SHERCORD V18  DISCORD-LIKE FEATURE PACK
    */

/*  Unread badge tracking  */
if (!state.unread) state.unread = {};  // channelId  count

function markUnread(channelId) {
    if (channelId === state.activeChannelId) return;
    if (!state.unread) state.unread = {};
    state.unread[channelId] = (state.unread[channelId] || 0) + 1;
    updateUnreadBadges();
}

function clearUnread(channelId) {
    if (!state.unread) return;
    delete state.unread[channelId];
    updateUnreadBadges();
}

function updateUnreadBadges() {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;
    server.channels?.forEach(ch => {
        const el = document.querySelector(`.channel-item[data-ch="${ch.id}"] .unread-badge`);
        const count = state.unread?.[ch.id] || 0;
        if (el) {
            el.textContent = count > 9 ? "9+" : count;
            el.classList.toggle("hidden", count === 0);
        }
    });
}

/*  Typing indicator  */
if (!state.typingPeers) state.typingPeers = {};
let _typingTimer = null;
let _lastTypingSent = 0;

function onChatInputTyping() {
    const now = Date.now();
    const typingGap = SCORD_T().TYPING_SEND_MIN_GAP_MS ?? 2500;
    if (state.mesh && now - _lastTypingSent > typingGap) {
        _lastTypingSent = now;
        state.mesh.broadcast({ type: "typing", username: state.username, channelId: state.activeChannelId });
    }
    clearTimeout(_typingTimer);
    _typingTimer = setTimeout(clearTypingIndicator, SCORD_T().TYPING_INDICATOR_CLEAR_MS ?? 4000);
}

function clearTypingIndicator() {
    const el = document.getElementById("typing-indicator");
    if (el) el.textContent = "";
}

function handleTypingMessage(fromPeerId, username, channelId) {
    if (channelId !== state.activeChannelId) return;
    if (!state.typingPeers) state.typingPeers = {};
    state.typingPeers[fromPeerId] = username;
    const names = Object.values(state.typingPeers);
    const el = document.getElementById("typing-indicator");
    if (el && names.length > 0) {
        el.textContent = names.join(", ") + (names.length === 1 ? " yazıyor..." : " yazıyorlar...");
    }
    clearTimeout(state._typingTimers?.[fromPeerId]);
    if (!state._typingTimers) state._typingTimers = {};
    state._typingTimers[fromPeerId] = setTimeout(() => {
        delete state.typingPeers[fromPeerId];
        handleTypingMessage = () => {};  // avoid recursion
        const remaining = Object.values(state.typingPeers);
        const el2 = document.getElementById("typing-indicator");
        if (el2) el2.textContent = remaining.length ? remaining.join(", ") + " yazıyor..." : "";
    }, SCORD_T().TYPING_INDICATOR_CLEAR_MS ?? 4000);
}

/*  Message reactions  */
function handleReaction(msgId, emoji, fromPeerId) {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;
    const msgs = server.messages?.[state.activeChannelId] || [];
    const msg = msgs.find(m => m.id === msgId);
    if (!msg) return;
    if (!msg.reactions) msg.reactions = {};
    const norm = normalizeReactionsMap(msg.reactions);
    msg.reactions = norm;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const arr = msg.reactions[emoji];
    if (!arr.includes(fromPeerId)) arr.push(fromPeerId);
    updateReactionBar(msgId, msg.reactions);
}

function updateReactionBar(msgId, reactions) {
    const row = document.querySelector(`.message-bubble[data-msg-id="${msgId}"]`);
    if (!row) return;
    const bubble = row.querySelector(".msg-bubble") || row;
    let bar = bubble.querySelector(".reaction-bar");
    if (!bar) {
        bar = document.createElement("div");
        bar.className = "reaction-bar";
        bubble.appendChild(bar);
    }
    bar.innerHTML = "";
    const norm = normalizeReactionsMap(reactions);
    for (const [emoji, peers] of Object.entries(norm)) {
        const list = Array.isArray(peers) ? peers : [];
        if (list.length === 0) continue;
        const pill = document.createElement("span");
        pill.className = "reaction-pill";
        pill.textContent = `${emoji} ${list.length}`;
        pill.title = list.join(", ");
        pill.onclick = () => {
            if (state.mesh) {
                state.mesh.broadcast({ type: "reaction", msgId, emoji });
                handleReaction(msgId, emoji, state.peerId);
            }
        };
        bar.appendChild(pill);
    }
}

/*  User status  */
const USER_STATUSES = [
    { id: "online", label: "Çevrimiçi", color: "#22c55e" },
    { id: "idle", label: "Boşta", color: "#f59e0b" },
    { id: "dnd", label: "Rahatsız Etme", color: "#ef4444" },
    { id: "invisible", label: "Görünmez", color: "#6b7280" },
];

if (!state.userStatus) state.userStatus = "online";

function setUserStatus(statusId) {
    state.userStatus = statusId;
    localStorage.setItem("scord_status", statusId);
    updateStatusDisplay();
    if (state.mesh) state.mesh.broadcast({ type: "status_change", status: statusId });
}

function updateStatusDisplay() {
    const statusEl = document.querySelector(".user-bar-status");
    const info = USER_STATUSES.find(s => s.id === state.userStatus) || USER_STATUSES[0];
    if (statusEl) {
        statusEl.textContent = ` ${info.label}`;
        statusEl.style.color = info.color;
    }
}

function initStatusSelector() {
    const statusEl = document.querySelector(".user-bar-status");
    if (!statusEl) return;
    const saved = localStorage.getItem("scord_status") || "online";
    state.userStatus = saved;
    updateStatusDisplay();

    statusEl.style.cursor = "pointer";
    statusEl.onclick = (e) => {
        e.stopPropagation();
        let menu = document.getElementById("status-menu");
        if (menu) { menu.remove(); return; }
        menu = document.createElement("div");
        menu.id = "status-menu";
        menu.className = "context-menu";
        menu.style.cssText = "position:fixed;z-index:9999;min-width:180px;";
        const rect = statusEl.getBoundingClientRect();
        menu.style.bottom = (window.innerHeight - rect.top + 8) + "px";
        menu.style.left = rect.left + "px";
        USER_STATUSES.forEach(s => {
            const item = document.createElement("div");
            item.className = "ctx-item";
            item.innerHTML = `<span style="color:${s.color};margin-right:8px;"></span>${s.label}`;
            item.onclick = () => { setUserStatus(s.id); menu.remove(); };
            menu.appendChild(item);
        });
        document.body.appendChild(menu);
        setTimeout(() => document.addEventListener("click", () => menu.remove(), { once: true }), 0);
    };
}

/*  Invite code: copy & join  */
async function joinByInviteCode(code) {
    if (!code || code.trim().length < 4) return toast("Geçersiz davet kodu.", "error");
    code = code.trim().toUpperCase();
    try {
        const res = await scordFetch(`/api/rooms/join/${code}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.error || !data.room_id) {
            toast("Geçersiz veya süresi dolmuş davet kodu.", "error");
            return;
        }
        const peerList = (data.peers || []).map(p => ({
            peer_id: p.peer_id,
            username: p.username,
            avatar_color: p.avatar_color,
            avatar_image: p.avatar_image ?? null,
        }));
        if (!peerList.some(m => m.peer_id === state.peerId)) {
            peerList.push({
                peer_id: state.peerId,
                username: state.username,
                avatar_color: state.avatarColor,
                avatar_image: state.avatarImage,
            });
        }
        const server = {
            id: data.room_id,
            name: data.name,
            ownerId: data.owner_id,
            channels: data.channels || [],
            members: peerList,
            roles: data.roles || {},
            peer_roles: data.peer_roles || {},
            pinned_messages: data.pinned_messages || [],
            messages: data.messages || {},
            inviteCode: data.invite_code,
            icon_url: data.icon_url,
            voiceMembers: {},
            voiceSessionHost: {},
            unread: {},
            channel_backgrounds: data.channel_backgrounds || {},
        };
        const dupIdx = state.servers.findIndex(s => s.id === server.id);
        if (dupIdx !== -1) {
            const prev = state.servers[dupIdx];
            state.servers[dupIdx] = {
                ...prev,
                ...server,
                voiceMembers: prev.voiceMembers || {},
                voiceSessionHost: prev.voiceSessionHost || {},
            };
        } else {
            state.servers.push(server);
        }
        renderServerRail();
        switchToServer(server.id);
        toast(`"${server.name}" sunucusuna katıldın!`, "success");
    } catch (err) {
        console.error("Invite join failed", err);
        toast("Sunucuya bağlanırken hata oluştu.", "error");
    }
}

function showInviteModal(serverId) {
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return;
    const code = server.inviteCode || "";
    const link = `${location.origin}?invite=${code}`;
    showModal(
        "Arkadaşlarını Davet Et",
        `<p style="margin-bottom:12px;color:var(--text-secondary);">Bu kodu arkadaşlarınla paylaş:</p>
         <div style="display:flex;gap:8px;align-items:center;">
           <input readonly id="invite-code-display" value="${code}" style="flex:1;padding:10px;background:var(--bg-deep);border:1px solid var(--border);border-radius:8px;color:var(--text-primary);font-size:20px;letter-spacing:4px;text-align:center;font-weight:bold;" />
           <button onclick="navigator.clipboard.writeText('${code}').then(()=>toast('Kod kopyalandı!','success'))" class="btn-primary" style="padding:10px 16px;">Kopyala</button>
         </div>
         <p style="margin-top:12px;font-size:12px;color:var(--text-muted);">Veya bağlantı: <a href="${link}" style="color:var(--accent);">${link}</a></p>`,
        `<button class="btn-primary" onclick="hideModal()">Kapat</button>`
    );
}

/*  Server discovery: refresh  */
async function refreshDiscovery() {
    const grid = document.getElementById("room-list-home");
    if (!grid) return;
    try {
        grid.innerHTML = `<div class="room-grid-skeleton" aria-busy="true">
            <div class="room-skel-card"></div><div class="room-skel-card"></div><div class="room-skel-card"></div>
        </div>`;
        const res = await scordFetch("/api/rooms");
        const rooms = await res.json();
        grid.innerHTML = "";
        if (!rooms || rooms.length === 0) {
            grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">Henüz aktif sunucu yok. Bir tane oluştur!</p>';
            return;
        }
        rooms.forEach(room => {
            const card = document.createElement("div");
            card.className = "room-card";
            const icon = room.icon_url
                ? `<img src="${room.icon_url}" alt="" loading="lazy" decoding="async" style="width:48px;height:48px;border-radius:12px;object-fit:cover;" />`
                : `<div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;color:#fff;">${(room.name||"?")[0].toUpperCase()}</div>`;
            card.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                  ${icon}
                  <div>
                    <div style="font-weight:700;font-size:16px;">${room.name}</div>
                    <div style="font-size:12px;color:var(--text-muted);">${room.peer_count || 0} üye</div>
                  </div>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                  <span style="font-size:12px;color:var(--text-muted);flex:1;">Kod: <b style="letter-spacing:2px;color:var(--accent);">${room.invite_code || ""}</b></span>
                  <button class="btn-primary" style="padding:6px 14px;font-size:13px;" onclick="joinDiscoveryRoom('${room.room_id}', '${room.invite_code}')">Katıl</button>
                </div>`;
            grid.appendChild(card);
        });
    } catch (err) {
        console.error("[Discovery] Error:", err);
        grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;grid-column:1/-1;">Sunucu listesi yüklenemedi. Ağını kontrol edip yenile.</p>';
    }
}

async function joinDiscoveryRoom(roomId, inviteCode) {
    // If we already have it, just switch
    if (state.servers.find(s => s.id === roomId)) {
        switchToServer(roomId);
        return;
    }
    await joinByInviteCode(inviteCode);
}

function switchToServer(serverId) {
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return;

    if (serverId === state.activeServerId && state.mesh && state.mesh.roomId === serverId) {
        const firstText = server.channels?.find(c => c.type === "text");
        if (firstText) showChatView(serverId, firstText.id);
        updateChannelSidebar(serverId);
        renderServerRail();
        document.getElementById("home-btn")?.classList.remove("active");
        document.querySelectorAll("#server-icons [data-server-id]").forEach(el => {
            el.classList.toggle("active", el.dataset.serverId === serverId);
        });
        return;
    }

    if (state.voiceChannelId) {
        try { leaveVoiceChannel(); } catch (e) { /* noop */ }
    }

    state.activeServerId = serverId;
    connectMesh(serverId);
    const firstText = server.channels?.find(c => c.type === "text");
    if (firstText) {
        showChatView(serverId, firstText.id);
    }
    updateChannelSidebar(serverId);
    updateMembersPanel(serverId);
    updatePeerCountBadge(serverId);
    renderServerRail();
    document.getElementById("home-btn")?.classList.remove("active");
    document.querySelectorAll("#server-icons [data-server-id]").forEach(el => {
        el.classList.toggle("active", el.dataset.serverId === serverId);
    });
}

/*  Voice sidebar activity indicator  */
function updateVoiceActivityIcons(serverId) {
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return;
    const voiceChannels = server.channels?.filter(c => c.type === "voice") || [];
    voiceChannels.forEach(ch => {
        const el = document.querySelector(`.channel-item[data-ch="${ch.id}"] .voice-activity-icon`);
        const members = server.voiceMembers?.[ch.id] || [];
        if (el) {
            el.classList.toggle("active", members.length > 0);
            el.textContent = members.length > 0 ? ` ${members.length}` : "";
        }
    });
}

/*  Hook everything into existing init functions  */
// Invite join button
const _joinCodeBtn = document.getElementById("join-by-code-btn");
if (_joinCodeBtn) {
    _joinCodeBtn.onclick = () => {
        const input = document.getElementById("join-invite-input");
        if (input) joinByInviteCode(input.value);
    };
}
const _joinInput = document.getElementById("join-invite-input");
if (_joinInput) {
    _joinInput.addEventListener("keydown", e => {
        if (e.key === "Enter") joinByInviteCode(_joinInput.value);
    });
}

// Also handle ?invite= in URL (auto-join from shared link)
(function() {
    const params = new URLSearchParams(location.search);
    const code = params.get("invite");
    if (code) {
        // Wait for app to be ready
        const tryJoin = setInterval(() => {
            if (state.username) {
                clearInterval(tryJoin);
                joinByInviteCode(code);
                // Clean URL
                history.replaceState({}, "", location.pathname);
            }
        }, SCORD_T().INVITE_URL_POLL_MS ?? 500);
    }
})();

// Typing indicator hook (wire into existing chat input)
const _chatInput = document.getElementById("chat-input");
if (_chatInput) {
    _chatInput.addEventListener("input", onChatInputTyping);
}

// Hook typing & reaction P2P messages into existing handleIncomingP2P
const _origHandleP2P = handleIncomingP2P;
window.handleIncomingP2P = function(fromPeerId, data, roomId) {
    if (data.type === "typing") {
        handleTypingMessage(fromPeerId, data.username, data.channelId);
        return;
    }
    if (data.type === "reaction") {
        handleReaction(data.msgId, data.emoji, fromPeerId);
        return;
    }
    if (data.type === "status_change") {
        const server = state.servers.find(s => s.id === roomId);
        const member = server?.members?.find(m => m.peer_id === fromPeerId);
        if (member) member.status = data.status;
        updateMembersPanel(roomId);
        return;
    }
    _origHandleP2P(fromPeerId, data, roomId);
};

// Server invite button in server header (add to settings modal)
const _origOpenSettings = window.openServerSettingsModal;
window.openServerSettingsModal = function() {
    if (_origOpenSettings) _origOpenSettings();
    // inject invite button if not already present
    setTimeout(() => {
        const footer = document.getElementById("modal-footer");
        if (footer && !footer.querySelector(".invite-modal-btn")) {
            const btn = document.createElement("button");
            btn.className = "btn-primary invite-modal-btn";
            btn.textContent = " Davet Bağlantısı";
            btn.style.marginRight = "auto";
            btn.onclick = () => { hideModal(); showInviteModal(state.activeServerId); };
            footer.insertBefore(btn, footer.firstChild);
        }
    }, 100);
};

// Init status selector on load
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(initStatusSelector, 500);
    setTimeout(refreshDiscovery, 1000);
});

// Also hook into app start
const _origStartApp = window.startApp;
window.startApp = function() {
    if (_origStartApp) _origStartApp();
    setTimeout(initStatusSelector, 300);
    setTimeout(refreshDiscovery, 500);
};

/* ══════════════════════════════════════════════════════════════
   DISCORD-STYLE MENTION SYSTEM (@user, @everyone, @here)
══════════════════════════════════════════════════════════════ */

// Enhanced mention parsing in parseMessageText
const _origParseMessageText = window.parseMessageText;
window.parseMessageText = function(text, serverId) {
    if (!text) return "";
    const sid = serverId !== undefined ? serverId : state.activeServerId;
    
    // First handle @everyone and @here
    let result = String(text);
    const server = state.servers.find(s => s.id === sid);
    
    // @everyone mention
    result = result.replace(/@everyone/g, (match) => {
        return `<span class="mention mention-everyone" data-mention="everyone" title="Everyone" style="background:rgba(239,68,68,0.2);color:#fca5a5;">@everyone</span>`;
    });
    
    // @here mention
    result = result.replace(/@here/g, (match) => {
        return `<span class="mention mention-here" data-mention="here" title="Here" style="background:rgba(34,197,94,0.2);color:#86efac;">@here</span>`;
    });
    
    // @user mentions (handle usernames with spaces)
    if (server && server.members) {
        const members = server.members;
        // Sort by length descending to match longer names first
        const sortedNames = [...new Set(members.map(m => m.username).filter(Boolean))].sort((a, b) => b.length - a.length);
        
        sortedNames.forEach(name => {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`(^|\\s)@${escaped}(?!\\w)`, "g");
            result = result.replace(regex, (full, lead) => {
                const member = members.find(m => m.username === name);
                return `${lead}<span class="mention" data-peer="${member?.peer_id || ""}" style="background:rgba(99,102,241,0.2);color:#c7d2fe;cursor:pointer;">@${escapeHtml(name)}</span>`;
            });
        });
    }
    
    // Handle URLs and other formatting
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return result.split(urlRegex).map(part => {
        if (part.match(urlRegex)) {
            if (part.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)) {
                return `<a href="${part}" target="_blank" class="rich-link"><img src="${part}" class="chat-embed-img" alt="" loading="lazy" decoding="async" /></a>`;
            }
            const ytMatch = part.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (ytMatch) {
                return `<div class="chat-embed-video"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe></div>`;
            }
            return `<a href="${part}" target="_blank" class="chat-link">${part}</a>`;
        }
        return part;
    }).join("");
};

// Mention click handler
document.addEventListener("click", (e) => {
    const mention = e.target.closest(".mention");
    if (!mention) return;
    
    const peerId = mention.getAttribute("data-peer");
    const mentionType = mention.getAttribute("data-mention");
    
    if (peerId) {
        // Open user profile
        const server = state.servers.find(s => s.id === state.activeServerId);
        const member = server?.members.find(m => m.peer_id === peerId);
        if (member) {
            openUserProfile(peerId, member.username, member.avatar_image, member.avatar_color);
        }
    } else if (mentionType === "everyone") {
        toast("📢 @everyone - Tüm üyeler etiketlendi!", "info");
    } else if (mentionType === "here") {
        toast("📍 @here - Çevrimiçi üyeler etiketlendi!", "info");
    }
});

/* ══════════════════════════════════════════════════════════════
   IMPROVED MUSIC BOT - FIXES & FEATURES
══════════════════════════════════════════════════════════════ */

// Fix: Music bot should only play for users in the voice channel
const _origStartMusicBot = window.startMusicBot;
window.startMusicBot = function(videoId, startAt) {
    // Only play music if user is in a voice channel
    if (!state.voiceChannelId) {
        console.log("[Music Bot] Not in voice channel, skipping");
        return;
    }
    
    // Check if music bot is already in voice members
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (server && server.voiceMembers && server.voiceMembers[state.voiceChannelId]) {
        const botInChannel = server.voiceMembers[state.voiceChannelId].some(m => m.peer_id === "bot_music");
        if (!botInChannel) {
            // Add bot to voice channel
            server.voiceMembers[state.voiceChannelId].push({
                peer_id: "bot_music",
                username: "🎵 Müzik Botu",
                avatar_color: "#ef4444",
                avatar_image: null
            });
            renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
        }
    }
    
    // Call original function
    if (_origStartMusicBot) {
        _origStartMusicBot(videoId, startAt);
    }
};

// Fix: Stop music bot when kicked from voice channel
const _origStopMusicBot = window.stopMusicBot;
window.stopMusicBot = function() {
    // Remove bot from voice members
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (server && server.voiceMembers && state.voiceChannelId) {
        server.voiceMembers[state.voiceChannelId] = (server.voiceMembers[state.voiceChannelId] || []).filter(m => m.peer_id !== "bot_music");
        if (state.activeChannelId === state.voiceChannelId) {
            renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
        }
        updateChannelSidebar(state.activeServerId);
    }
    
    // Call original function
    if (_origStopMusicBot) {
        _origStopMusicBot();
    }
};

// Add !kickmusic command to kick music bot from voice channel
const _origHandleP2P_Music = window.handleIncomingP2P;
window.handleIncomingP2P = function(fromPeerId, data, roomId) {
    // Handle music bot kick command
    if (data.type === "kick_music_bot" && data.target === "bot_music") {
        const server = state.servers.find(s => s.id === roomId);
        if (server && server.voiceMembers && state.voiceChannelId) {
            server.voiceMembers[state.voiceChannelId] = (server.voiceMembers[state.voiceChannelId] || []).filter(m => m.peer_id !== "bot_music");
            if (state.activeChannelId === state.voiceChannelId) {
                renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
            }
            updateChannelSidebar(state.activeServerId);
            toast("🎵 Müzik botu sesli kanaldan çıkarıldı.", "info");
        }
        return;
    }
    
    if (_origHandleP2P_Music) {
        _origHandleP2P_Music(fromPeerId, data, roomId);
    }
};

// Enhanced !play command with Discord-style bot mention
const _origSendMessage = window.sendMessage;
window.sendMessage = function() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    
    // Check for Discord-style music commands
    if (text.startsWith("!p ") || text.startsWith("!play ")) {
        const query = text.startsWith("!p ") ? text.slice(3).trim() : text.slice(6).trim();
        if (!query) {
            toast("🎵 Kullanım: !play <şarkı adı veya YouTube linki>", "info");
            return;
        }
        
        // Show bot mention style message
        const botMention = `<span class="mention" style="background:rgba(239,68,68,0.2);color:#fca5a5;">🎵 Müzik Botu</span>`;
        addSystemMessage(`${botMention} Şarkı aranıyor: "${query}"...`);
    }
    
    // Check for kick music bot command
    if (text === "!kickmusic" || text === "!stopmusic") {
        if (!state.voiceChannelId) {
            toast("Sesli kanalda değilsin.", "warning");
            return;
        }
        
        // Broadcast kick command
        if (state.mesh) {
            state.mesh.broadcast({
                type: "kick_music_bot",
                target: "bot_music",
                voiceChannelId: state.voiceChannelId
            });
        }
        
        // Remove bot locally
        const server = state.servers.find(s => s.id === state.activeServerId);
        if (server && server.voiceMembers && state.voiceChannelId) {
            server.voiceMembers[state.voiceChannelId] = (server.voiceMembers[state.voiceChannelId] || []).filter(m => m.peer_id !== "bot_music");
            renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
            updateChannelSidebar(state.activeServerId);
        }
        
        stopMusicBot();
        toast("🎵 Müzik botu çıkarıldı.", "info");
        input.value = "";
        return;
    }
    
    if (_origSendMessage) {
        _origSendMessage();
    }
};

/* ══════════════════════════════════════════════════════════════
   CSS STYLES FOR NEW FEATURES
══════════════════════════════════════════════════════════════ */

// Add CSS for mention styles
const mentionStyles = document.createElement("style");
mentionStyles.textContent = `
    .mention {
        padding: 0 3px;
        border-radius: 3px;
        background: rgba(99, 102, 241, 0.25);
        color: #c9cdfb;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
    }
    
    .mention:hover {
        background: rgba(99, 102, 241, 0.45);
        color: #fff;
    }
    
    .mention-everyone {
        background: rgba(239, 68, 68, 0.2) !important;
        color: #fca5a5 !important;
    }
    
    .mention-everyone:hover {
        background: rgba(239, 68, 68, 0.4) !important;
    }
    
    .mention-here {
        background: rgba(34, 197, 94, 0.2) !important;
        color: #86efac !important;
    }
    
    .mention-here:hover {
        background: rgba(34, 197, 94, 0.4) !important;
    }
    
    /* Unread badge styles */
    .unread-badge {
        min-width: 20px;
        height: 20px;
        background: #ef4444;
        color: white;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0 6px;
        margin-left: auto;
    }
    
    .unread-badge.hidden {
        display: none !important;
    }
    
    /* Typing indicator styles */
    .typing-indicator {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 8px 12px;
        font-size: 12px;
        color: var(--text-muted);
        font-style: italic;
    }
    
    .typing-dots {
        display: flex;
        gap: 3px;
        margin-left: 6px;
    }
    
    .typing-dots span {
        width: 6px;
        height: 6px;
        background: var(--text-muted);
        border-radius: 50%;
        animation: typing-bounce 1.4s ease-in-out infinite;
    }
    
    .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    
    @keyframes typing-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-6px); }
    }
`;
document.head.appendChild(mentionStyles);

console.log("[Shercord V19] Discord-style mentions, improved music bot, and fixes loaded!");

/* ══════════════════════════════════════════════════════════════
   SERVER DATA PERSISTENCE (localStorage + GitHub-ready)
══════════════════════════════════════════════════════════════ */

// Save server data to localStorage
function saveServerData(serverId) {
    const server = state.servers.find(s => s.id === serverId);
    if (!server) return;
    
    // Create a lightweight copy (exclude volatile data)
    const saveData = {
        id: server.id,
        name: server.name,
        ownerId: server.ownerId,
        inviteCode: server.inviteCode,
        icon_url: server.icon_url,
        channels: server.channels,
        roles: server.roles,
        peer_roles: server.peer_roles,
        members: server.members,
        messages: server.messages,
        pinned_messages: server.pinned_messages,
        channel_backgrounds: server.channel_backgrounds,
        voicePermissionMode: server.voicePermissionMode,
        createdAt: server.createdAt || Date.now(),
        updatedAt: Date.now()
    };
    
    try {
        localStorage.setItem(`scord_server_${serverId}`, JSON.stringify(saveData));
        console.log(`[Save] Server ${serverId} saved to localStorage`);
    } catch (e) {
        console.warn('[Save] localStorage full, trimming old data...');
        // If storage is full, remove oldest server
        trimOldServerData();
        try {
            localStorage.setItem(`scord_server_${serverId}`, JSON.stringify(saveData));
        } catch (e2) {
            console.error('[Save] Failed to save:', e2);
        }
    }
}

// Load server data from localStorage
function loadServerData(serverId) {
    try {
        const data = localStorage.getItem(`scord_server_${serverId}`);
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('[Load] Failed to load server:', e);
    }
    return null;
}

// Trim old server data if storage is full
function trimOldServerData() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('scord_server_'));
    if (keys.length <= 3) return; // Keep at least 3 servers
    
    // Find oldest servers and remove them
    const servers = keys.map(key => {
        try {
            const data = JSON.parse(localStorage.getItem(key));
            return { key, updatedAt: data?.updatedAt || 0 };
        } catch { return { key, updatedAt: 0 }; }
    }).sort((a, b) => a.updatedAt - b.updatedAt);
    
    // Remove oldest servers until we have space
    for (let i = 0; i < servers.length - 2; i++) {
        localStorage.removeItem(servers[i].key);
    }
}

// Save all servers on page unload
window.addEventListener('beforeunload', () => {
    state.servers.forEach(server => saveServerData(server.id));
});

// Auto-save every 30 seconds
setInterval(() => {
    state.servers.forEach(server => saveServerData(server.id));
}, 30000);

// Load saved servers on startup
function loadSavedServers() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('scord_server_'));
    keys.forEach(key => {
        try {
            const data = JSON.parse(localStorage.getItem(key));
            if (data && data.id) {
                // Check if server is already in state
                if (!state.servers.find(s => s.id === data.id)) {
                    state.servers.push({
                        ...data,
                        voiceMembers: {},
                        voiceSessionHost: {},
                        unread: {}
                    });
                    console.log(`[Load] Loaded server: ${data.name}`);
                }
            }
        } catch (e) {
            console.error('[Load] Failed to parse server data:', e);
        }
    });
}

/* ══════════════════════════════════════════════════════════════
   DISCORD-STYLE EMBEDDED SETTINGS PANEL
══════════════════════════════════════════════════════════════ */

function openServerSettingsPanel() {
    if (!state.activeServerId) return toast("Önce bir sunucu seç.", "info");
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    const isOwner = server.ownerId === state.peerId;
    const isAdmin = isOwner || server.peer_roles?.[state.peerId] === "admin";
    if (!isAdmin) return toast("Bu işlem için yönetici yetkisi gerekli.", "error");

    // Create embedded settings panel
    let panel = document.getElementById("server-settings-panel");
    if (panel) {
        panel.classList.toggle("hidden");
        return;
    }

    panel = document.createElement("div");
    panel.id = "server-settings-panel";
    panel.className = "settings-panel-embedded";
    panel.innerHTML = `
        <div class="settings-panel-header">
            <h3>⚙️ Sunucu Ayarları</h3>
            <button class="settings-panel-close" onclick="closeServerSettingsPanel()">✕</button>
        </div>
        <div class="settings-panel-tabs">
            <button class="tab-btn active" data-tab="general">Genel</button>
            <button class="tab-btn" data-tab="roles">Roller</button>
            <button class="tab-btn" data-tab="members">Üyeler</button>
            <button class="tab-btn" data-tab="permissions">İzinler</button>
        </div>
        <div class="settings-panel-content">
            <div id="tab-general" class="tab-content active">
                ${renderGeneralSettings(server)}
            </div>
            <div id="tab-roles" class="tab-content">
                ${renderRolesSettings(server)}
            </div>
            <div id="tab-members" class="tab-content">
                ${renderMembersSettings(server)}
            </div>
            <div id="tab-permissions" class="tab-content">
                ${renderPermissionsSettings(server)}
            </div>
        </div>
    `;

    document.body.appendChild(panel);
    
    // Tab switching
    panel.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            panel.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            panel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
        };
    });

    // Add CSS for settings panel
    if (!document.getElementById('settings-panel-css')) {
        const style = document.createElement('style');
        style.id = 'settings-panel-css';
        style.textContent = `
            .settings-panel-embedded {
                position: fixed;
                right: 0;
                top: 0;
                bottom: 0;
                width: 480px;
                max-width: 90vw;
                background: var(--bg-deep);
                border-left: 1px solid var(--border-strong);
                z-index: 1000;
                display: flex;
                flex-direction: column;
                animation: slideInRight 0.3s ease;
                box-shadow: -8px 0 32px rgba(0,0,0,0.4);
            }
            
            @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
            }
            
            .settings-panel-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 16px 20px;
                border-bottom: 1px solid var(--border);
                background: var(--bg-mid);
            }
            
            .settings-panel-header h3 {
                font-size: 16px;
                font-weight: 700;
                color: var(--text-primary);
            }
            
            .settings-panel-close {
                width: 32px;
                height: 32px;
                border: none;
                background: none;
                color: var(--text-secondary);
                cursor: pointer;
                border-radius: var(--r-md);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
            }
            
            .settings-panel-close:hover {
                background: var(--bg-hover);
                color: var(--text-primary);
            }
            
            .settings-panel-tabs {
                display: flex;
                padding: 8px 16px;
                gap: 4px;
                border-bottom: 1px solid var(--border);
                background: var(--bg-base);
            }
            
            .tab-btn {
                flex: 1;
                padding: 8px 12px;
                border: none;
                background: none;
                color: var(--text-secondary);
                cursor: pointer;
                border-radius: var(--r-md);
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s;
            }
            
            .tab-btn:hover {
                background: var(--bg-hover);
                color: var(--text-primary);
            }
            
            .tab-btn.active {
                background: var(--bg-active);
                color: var(--accent-light);
                font-weight: 600;
            }
            
            .settings-panel-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px 20px;
            }
            
            .tab-content {
                display: none;
            }
            
            .tab-content.active {
                display: block;
            }
            
            .role-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                background: var(--bg-base);
                border-radius: var(--r-md);
                margin-bottom: 8px;
                border: 1px solid var(--border);
            }
            
            .role-color-picker {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                border: 2px solid var(--border-strong);
                cursor: pointer;
                padding: 0;
            }
            
            .role-name-input {
                flex: 1;
                background: var(--bg-deep);
                border: 1px solid var(--border);
                border-radius: var(--r-sm);
                padding: 6px 10px;
                color: var(--text-primary);
                font-size: 14px;
            }
            
            .permission-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
                margin-top: 12px;
            }
            
            .permission-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: var(--bg-base);
                border-radius: var(--r-sm);
                border: 1px solid var(--border);
            }
            
            .permission-item input[type="checkbox"] {
                width: 16px;
                height: 16px;
                accent-color: var(--accent);
            }
            
            .member-role-select {
                background: var(--bg-deep);
                border: 1px solid var(--border);
                border-radius: var(--r-sm);
                padding: 4px 8px;
                color: var(--text-primary);
                font-size: 12px;
            }
        `;
        document.head.appendChild(style);
    }
}

function closeServerSettingsPanel() {
    const panel = document.getElementById("server-settings-panel");
    if (panel) {
        panel.remove();
    }
}

function renderGeneralSettings(server) {
    return `
        <div class="form-group" style="margin-bottom:16px">
            <label class="modal-label">Sunucu Adı</label>
            <input class="modal-input" id="settings-sv-name" value="${escapeHtml(server.name)}" />
        </div>
        <div class="form-group" style="margin-bottom:16px">
            <label class="modal-label">Sunucu İkonu (URL)</label>
            <input class="modal-input" id="settings-sv-icon" value="${escapeHtml(server.icon_url || '')}" placeholder="https://..." />
        </div>
        <div class="form-group" style="margin-bottom:16px">
            <label class="modal-label">Davet Kodu</label>
            <div class="peer-id-display" style="display:flex;justify-content:space-between;align-items:center;">
                <span>${escapeHtml(server.inviteCode || '—')}</span>
                <button class="btn-secondary" style="padding:6px 12px;font-size:12px;" onclick="navigator.clipboard.writeText('${server.inviteCode || ''}');toast('Kopyalandı!','success')">Kopyala</button>
            </div>
        </div>
        <button class="btn-primary" onclick="saveGeneralSettings()" style="width:100%">Kaydet</button>
    `;
}

function renderRolesSettings(server) {
    const roles = server.roles || {};
    let html = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h4 style="color:var(--text-primary);font-size:14px;">Roller</h4>
            <button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="createNewRole()">+ Yeni Rol</button>
        </div>
    `;
    
    Object.entries(roles).forEach(([roleId, roleData]) => {
        const memberCount = Object.values(server.peer_roles || {}).filter(r => r === roleId).length;
        html += `
            <div class="role-item">
                <input type="color" class="role-color-picker" value="${roleData.color || '#7c3aed'}" 
                       onchange="updateRoleColor('${roleId}', this.value)" />
                <input type="text" class="role-name-input" value="${escapeHtml(roleData.name)}" 
                       onchange="updateRoleName('${roleId}', this.value)" />
                <span style="font-size:11px;color:var(--text-muted);">${memberCount} üye</span>
                ${server.ownerId !== state.peerId ? '' : `
                    <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;" 
                            onclick="deleteRole('${roleId}')">🗑️</button>
                `}
            </div>
        `;
    });
    
    return html;
}

function renderMembersSettings(server) {
    const members = server.members || [];
    let html = `
        <div style="margin-bottom:16px;">
            <h4 style="color:var(--text-primary);font-size:14px;">Üyeler (${members.length})</h4>
        </div>
    `;
    
    members.forEach(member => {
        const currentRole = server.peer_roles?.[member.peer_id] || 'member';
        const roles = server.roles || {};
        const roleOptions = Object.entries(roles).map(([roleId, roleData]) => 
            `<option value="${roleId}" ${currentRole === roleId ? 'selected' : ''}>${escapeHtml(roleData.name)}</option>`
        ).join('');
        
        html += `
            <div class="role-item">
                <div style="width:32px;height:32px;border-radius:50%;background:${member.avatar_color || '#7c3aed'};display:flex;align-items:center;justify-content:center;font-size:14px;color:#fff;font-weight:700;">
                    ${initials(member.username)}
                </div>
                <span style="flex:1;font-size:14px;color:var(--text-primary);">${escapeHtml(member.username)}</span>
                ${server.ownerId === state.peerId ? `
                    <select class="member-role-select" onchange="updateMemberRole('${member.peer_id}', this.value)">
                        <option value="member">Üye</option>
                        ${roleOptions}
                    </select>
                ` : `<span style="font-size:12px;color:var(--text-muted);">${roles[currentRole]?.name || 'Üye'}</span>`}
            </div>
        `;
    });
    
    return html;
}

function renderPermissionsSettings(server) {
    const permissions = [
        { id: 'send_messages', name: 'Mesaj Gönder', icon: '💬' },
        { id: 'delete_own_messages', name: 'Kendi Mesajını Sil', icon: '🗑️' },
        { id: 'delete_all_messages', name: 'Herkesin Mesajını Sil', icon: '🗑️' },
        { id: 'create_channels', name: 'Kanal Oluştur', icon: '📝' },
        { id: 'delete_channels', name: 'Kanal Sil', icon: '❌' },
        { id: 'join_voice', name: 'Sesli Kanala Katıl', icon: '🔊' },
        { id: 'kick_members', name: 'Üye At', icon: '🚪' },
        { id: 'mute_members', name: 'Sustur', icon: '🔇' },
        { id: 'manage_roles', name: 'Rol Yönetimi', icon: '🛡️' },
        { id: 'manage_server', name: 'Sunucu Yönetimi', icon: '⚙️' },
        { id: 'screen_share', name: 'Ekran Paylaşımı', icon: '🖥️' },
        { id: 'stream', name: 'Canlı Yayın', icon: '📹' },
    ];
    
    let html = `
        <div style="margin-bottom:16px;">
            <h4 style="color:var(--text-primary);font-size:14px;">Varsayılan İzinler</h4>
            <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">"Üye" rolü için varsayılan izinler</p>
        </div>
        <div class="permission-grid">
    `;
    
    permissions.forEach(perm => {
        const defaultEnabled = ['send_messages', 'join_voice', 'screen_share'].includes(perm.id);
        html += `
            <div class="permission-item">
                <input type="checkbox" id="perm_${perm.id}" ${defaultEnabled ? 'checked' : ''} 
                       onchange="updatePermission('${perm.id}', this.checked)" />
                <label for="perm_${perm.id}" style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;">
                    <span>${perm.icon}</span> ${perm.name}
                </label>
            </div>
        `;
    });
    
    html += `</div>`;
    return html;
}

// Settings save functions
function saveGeneralSettings() {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;
    
    const name = document.getElementById('settings-sv-name').value.trim();
    const icon = document.getElementById('settings-sv-icon').value.trim();
    
    if (name) server.name = name;
    if (icon) server.icon_url = icon;
    
    saveServerData(server.id);
    
    if (state.mesh) {
        state.mesh.broadcast({
            type: 'server_update',
            payload: { id: server.id, name: server.name, icon_url: server.icon_url }
        });
    }
    
    updateChannelSidebar(server.id);
    renderServerRail();
    toast('Ayarlar kaydedildi!', 'success');
}

function createNewRole() {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;
    
    const roleId = 'role_' + genId();
    if (!server.roles) server.roles = {};
    server.roles[roleId] = {
        name: 'Yeni Rol',
        color: '#7c3aed',
        hoist: false,
        permissions: {}
    };
    
    saveServerData(server.id);
    
    // Refresh roles tab
    const rolesTab = document.getElementById('tab-roles');
    if (rolesTab) {
        rolesTab.innerHTML = renderRolesSettings(server);
    }
    
    toast('Yeni rol oluşturuldu!', 'success');
}

function updateRoleColor(roleId, color) {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server || !server.roles?.[roleId]) return;
    
    server.roles[roleId].color = color;
    saveServerData(server.id);
    
    if (state.mesh) {
        state.mesh.broadcast({
            type: 'server_update',
            payload: { id: server.id, roles: server.roles }
        });
    }
    
    updateMembersPanel(server.id);
    toast('Rol rengi güncellendi!', 'success');
}

function updateRoleName(roleId, name) {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server || !server.roles?.[roleId]) return;
    
    server.roles[roleId].name = name.trim() || 'İsimsiz Rol';
    saveServerData(server.id);
    
    if (state.mesh) {
        state.mesh.broadcast({
            type: 'server_update',
            payload: { id: server.id, roles: server.roles }
        });
    }
    
    toast('Rol adı güncellendi!', 'success');
}

function deleteRole(roleId) {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server || !server.roles?.[roleId]) return;
    
    if (!confirm('Bu rolü silmek istediğine emin misin?')) return;
    
    delete server.roles[roleId];
    // Remove role from all members
    Object.keys(server.peer_roles || {}).forEach(peerId => {
        if (server.peer_roles[peerId] === roleId) {
            delete server.peer_roles[peerId];
        }
    });
    
    saveServerData(server.id);
    
    if (state.mesh) {
        state.mesh.broadcast({
            type: 'server_update',
            payload: { id: server.id, roles: server.roles, peer_roles: server.peer_roles }
        });
    }
    
    // Refresh
    const rolesTab = document.getElementById('tab-roles');
    if (rolesTab) {
        rolesTab.innerHTML = renderRolesSettings(server);
    }
    
    updateMembersPanel(server.id);
    toast('Rol silindi.', 'info');
}

function updateMemberRole(peerId, roleId) {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;
    
    if (!server.peer_roles) server.peer_roles = {};
    
    if (roleId === 'member') {
        delete server.peer_roles[peerId];
    } else {
        server.peer_roles[peerId] = roleId;
    }
    
    saveServerData(server.id);
    
    if (state.mesh) {
        state.mesh.broadcast({
            type: 'server_update',
            payload: { id: server.id, peer_roles: server.peer_roles }
        });
    }
    
    updateMembersPanel(server.id);
    toast('Üye rolü güncellendi!', 'success');
}

function updatePermission(permId, enabled) {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;
    
    // Update default member role permissions
    if (!server.roles) server.roles = {};
    if (!server.roles.member) server.roles.member = { name: 'Üye', color: '#94a3b8', hoist: false, permissions: {} };
    
    server.roles.member.permissions[permId] = enabled;
    saveServerData(server.id);
    
    toast('İzin güncellendi!', 'success');
}

// Load saved servers on startup
const _origStartApp_servers = window.startApp;
window.startApp = function() {
    loadSavedServers();
    if (_origStartApp_servers) _origStartApp_servers();
};

console.log("[Shercord V20] Server persistence, role management, and embedded settings panel loaded!");
