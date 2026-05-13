(function () {
    "use strict";
    console.log("[Fixes V2] Initializing comprehensive fixes...");

    // 1. MUSIC BOT FIX (Moved to fixes.js)

    // 2. DM CALL STABILITY & AUDIO
    function applyDMCallFix() {
        const origHandleP2P = window.handleIncomingP2P;
        if (origHandleP2P && !window._dmCallFixApplied) {
            window._dmCallFixApplied = true;
            window.handleIncomingP2P = function(fromPeerId, data, roomId) {
                if (data && data.type === "call_signal") {
                    console.log("[Fixes V2] Intercepted call signal from", fromPeerId);
                }
                return origHandleP2P.apply(this, arguments);
            };
        }
        
        // Ensure DM overlay doesn't block audio
        const checkOverlay = setInterval(() => {
            const audioElements = document.querySelectorAll("audio, video");
            audioElements.forEach(el => {
                if (el.muted && el.srcObject && el.classList.contains("voice-video")) {
                    el.muted = false; // Force unmute remote audio
                }
            });
        }, 2000);
    }

    // 3. OFFLINE STATUS DETECTION
    function applyStatusFix() {
        setInterval(() => {
            if (!window.state || !window.state.peerStatuses) return;
            const now = Date.now();
            let changed = false;
            Object.keys(window.state.peerStatuses).forEach(pid => {
                const p = window.state.peerStatuses[pid];
                // If no update for 45 seconds, mark offline
                if (p.status !== "offline" && (now - (p.lastSeen || 0)) > 45000) {
                    p.status = "offline";
                    changed = true;
                }
            });
            if (changed && window.state.activeServerId && typeof window.updateMembersPanel === "function") {
                window.updateMembersPanel(window.state.activeServerId);
            }
            
            // Re-broadcast queued friend requests when peers are online
            if (window.state && window.state.mesh && window.state.mesh.peers) {
                try {
                    let queued = JSON.parse(localStorage.getItem("scord_queued_friend_requests") || "[]");
                    if (queued.length > 0) {
                        let toKeep = [];
                        queued.forEach(req => {
                            if (Date.now() - req.timestamp > 7 * 24 * 60 * 60 * 1000) return; // drop after 7 days
                            // Broadcast if we have peers
                            if (Object.keys(window.state.mesh.peers).length > 0) {
                                window.state.mesh.broadcast(req.payload);
                                // remove from queue
                            } else {
                                toKeep.push(req);
                            }
                        });
                        localStorage.setItem("scord_queued_friend_requests", JSON.stringify(toKeep));
                    }
                } catch (e) {
                    console.error("[Fixes V2] Queue error", e);
                }
            }
        }, 10000);

        // Offline Friend Request hook
        setInterval(() => {
            if (!window._offlineFrHooked && typeof window.sendFriendRequest === "function") {
                window._offlineFrHooked = true;
                const origFr = window.sendFriendRequest;
                window.sendFriendRequest = function (targetPeerId, targetTag) {
                    if (!window.state || !window.state.mesh || Object.keys(window.state.mesh.peers || {}).length === 0) {
                        // Offline queue
                        const reqPayload = {
                            type: "friend_request",
                            from: window.state.peerId,
                            username: window.state.username || "Anonim",
                            tag: window.state._discriminator || "0000",
                            targetTag: targetTag,
                            timestamp: Date.now()
                        };
                        try {
                            let queued = JSON.parse(localStorage.getItem("scord_queued_friend_requests") || "[]");
                            queued.push({ timestamp: Date.now(), payload: reqPayload });
                            localStorage.setItem("scord_queued_friend_requests", JSON.stringify(queued));
                            if (typeof window.toast === "function") {
                                window.toast("Bağlantı zayıf, istek sıraya alındı. Çevrimiçi olunduğunda iletilecek.", "info");
                            }
                        } catch (e) {}
                        
                        if (!window.state._friendRequests) window.state._friendRequests = [];
                        window.state._friendRequests.push({ peerId: targetPeerId, tag: targetTag, timestamp: Date.now() });
                        localStorage.setItem("scord_friend_requests", JSON.stringify(window.state._friendRequests));
                        return;
                    }
                    return origFr.apply(this, arguments);
                };
            }
        }, 2000);

        // Status Update broadcasting hook
        setInterval(() => {
            if (!window._statusUpdateHooked && typeof window.setStatus === "function") {
                window._statusUpdateHooked = true;
                const origSetStatus = window.setStatus;
                window.setStatus = function (newStatus, customStatus, statusEmoji) {
                    origSetStatus.apply(this, arguments);
                    
                    if (window.state) {
                        window.state.status = newStatus || window.state.status || "online";
                        window.state.customStatus = customStatus || "";
                        window.state.statusEmoji = statusEmoji || "";
                        
                        if (typeof window.updateStatusBar === "function") {
                            window.updateStatusBar();
                        }
                        
                        if (window.state.mesh) {
                            window.state.mesh.broadcast({
                                type: "user_status",
                                status: window.state.status,
                                customStatus: window.state.customStatus
                            });
                        }
                    }
                };
            }
        }, 2000);
    }

    // 4. VOICE EFFECTS
    function applyVoiceEffects() {
        if (window._voiceEffectsApplied) return;
        window._voiceEffectsApplied = true;

        window.currentVoiceEffect = "normal";
        window.audioContext = null;

        function initAudioContext() {
            if (!window.audioContext) {
                window.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (window.audioContext.state === "suspended") {
                window.audioContext.resume();
            }
        }

        window.applyEffectToStream = function(stream) {
            initAudioContext();
            const ctx = window.audioContext;
            const source = ctx.createMediaStreamSource(stream);
            const dest = ctx.createMediaStreamDestination();

            if (window.currentVoiceEffect === "normal") {
                source.connect(dest);
                return dest.stream;
            }

            if (window.currentVoiceEffect === "robot") {
                const osc = ctx.createOscillator();
                osc.type = "sawtooth";
                osc.frequency.value = 50;
                const gain = ctx.createGain();
                source.connect(gain);
                osc.connect(gain.gain);
                gain.connect(dest);
                osc.start();
            } else if (window.currentVoiceEffect === "deep") {
                const filter = ctx.createBiquadFilter();
                filter.type = "lowshelf";
                filter.frequency.value = 400;
                filter.gain.value = 15;
                source.connect(filter);
                filter.connect(dest);
            } else if (window.currentVoiceEffect === "echo") {
                const delay = ctx.createDelay();
                delay.delayTime.value = 0.3;
                const feedback = ctx.createGain();
                feedback.gain.value = 0.4;
                source.connect(delay);
                delay.connect(feedback);
                feedback.connect(delay);
                source.connect(dest);
                delay.connect(dest);
            } else {
                source.connect(dest);
            }

            return dest.stream;
        };

        const obs = new MutationObserver(() => {
            const voiceControls = document.querySelector(".voice-controls");
            if (voiceControls && !document.getElementById("voice-effect-btn")) {
                const btn = document.createElement("button");
                btn.id = "voice-effect-btn";
                btn.className = "ctrl-btn";
                btn.innerHTML = "🎙️ Efekt";
                btn.title = "Ses Efekti Seç";
                btn.onclick = () => {
                    const effects = {
                        normal: "Normal",
                        robot: "Robot 🤖",
                        deep: "Kalın Ses 👹",
                        echo: "Eko ⛰️"
                    };
                    let html = '<div style="display:flex; flex-direction:column; gap:8px;">';
                    Object.keys(effects).forEach(k => {
                        const active = window.currentVoiceEffect === k ? 'background:var(--accent);' : 'background:rgba(255,255,255,0.1);';
                        html += \`<button style="padding:10px; border:none; border-radius:6px; color:#fff; cursor:pointer; font-weight:bold; transition:all 0.2s; \${active}" onclick="window.setVoiceEffect('\${k}')">\${effects[k]}</button>\`;
                    });
                    html += '</div>';
                    if (typeof window.showModal === "function") {
                        window.showModal("Ses Efektleri", html, '<button class="btn-secondary" onclick="window.hideModal()">Kapat</button>');
                    }
                };
                voiceControls.insertBefore(btn, voiceControls.firstChild);
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });

        window.setVoiceEffect = function(eff) {
            window.currentVoiceEffect = eff;
            if (typeof window.hideModal === "function") window.hideModal();
            if (typeof window.toast === "function") window.toast("Ses efekti uygulandı: " + eff, "success");
            if (window.state && window.state.localStream) {
                if (typeof window.toggleMicrophone === "function") {
                    window.toggleMicrophone();
                    setTimeout(() => window.toggleMicrophone(), 500);
                }
            }
        };

        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async function(constraints) {
                const stream = await origGetUserMedia(constraints);
                if (constraints.audio && window.currentVoiceEffect !== "normal") {
                    try {
                        const effectStream = window.applyEffectToStream(stream);
                        if (constraints.video) {
                            stream.getVideoTracks().forEach(t => effectStream.addTrack(t));
                        }
                        return effectStream;
                    } catch (e) {
                        console.error("[Fixes V2] Error applying voice effect:", e);
                        return stream;
                    }
                }
                return stream;
            };
        }
    }

    // 5. CHAT HEADER FIX & CSS
    function applyUIFixes() {
        const style = document.createElement("style");
        style.id = "scord-fixes-v2-css";
        style.textContent = `
            /* DM Search Dropdown */
            .dm-main-search {
                position: relative;
            }
            .dm-search-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                width: 100%;
                max-width: 320px;
                background: var(--bg-elevated, #2f3136);
                border: 1px solid var(--border, #202225);
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.5);
                z-index: 100;
                margin-top: 8px;
                max-height: 300px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                padding: 8px 0;
            }
            .dm-search-dropdown.hidden {
                display: none;
            }
            .dm-search-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 8px 12px;
                cursor: pointer;
                transition: background 0.1s;
            }
            .dm-search-item:hover {
                background: var(--bg-active, rgba(255,255,255,0.1));
            }
            .dm-search-item-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background-size: cover;
                background-position: center;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                color: #fff;
            }
            .dm-search-item-info {
                display: flex;
                flex-direction: column;
            }
            .dm-search-item-name {
                font-size: 14px;
                font-weight: 500;
                color: var(--text-normal, #dcddde);
            }
            .dm-search-item-label {
                font-size: 12px;
                color: var(--text-muted, #8e9297);
            }
            
            /* Hide the old chip container */
            #dm-main-top-actions {
                display: none !important;
            }

            /* Fix chat header duplication */
            #chat-channel-name, .header-right { display: none !important; }
            .chat-header {
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                background: var(--bg-elevated) !important;
                border-bottom: 1px solid var(--border) !important;
                padding: 12px 16px !important;
                box-shadow: 0 1px 2px rgba(0,0,0,0.2) !important;
            }
            .chat-header .header-left {
                display: flex !important;
                align-items: center !important;
                gap: 8px !important;
            }
            #active-channel-name {
                font-size: 16px !important;
                font-weight: 600 !important;
                color: var(--text-normal) !important;
            }
            
            /* Premium Setup Overlay */
            #setup-overlay {
                background: linear-gradient(135deg, rgba(10,10,20,0.95), rgba(20,20,40,0.95)) !important;
                backdrop-filter: blur(10px) !important;
            }
            .setup-card {
                background: rgba(30,30,45,0.7) !important;
                border: 1px solid rgba(255,255,255,0.1) !important;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1) !important;
                backdrop-filter: blur(20px) !important;
                border-radius: 16px !important;
            }
            #enter-btn {
                background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
                border: none !important;
                box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4) !important;
                transition: all 0.2s ease !important;
            }
            #enter-btn:hover:not(:disabled) {
                transform: translateY(-2px) !important;
                box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6) !important;
            }
            
            /* Premium Music Bot Dock */
            #music-player-dock {
                background: rgba(20,20,30,0.85) !important;
                backdrop-filter: blur(12px) !important;
                border: 1px solid rgba(255,255,255,0.1) !important;
                box-shadow: 0 8px 32px rgba(0,0,0,0.5) !important;
                border-radius: 12px !important;
                overflow: hidden !important;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
            }
            #music-player-dock.active {
                transform: translateY(0) scale(1) !important;
                opacity: 1 !important;
            }
            #music-ctrl-bar {
                background: rgba(0,0,0,0.5) !important;
                backdrop-filter: blur(5px) !important;
            }
            
            /* Server Logos Fix */
            .rail-icon {
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                font-weight: bold !important;
                overflow: hidden !important;
            }
            .rail-icon img {
                width: 100% !important;
                height: 100% !important;
                object-fit: cover !important;
            }

            /* Password field toggle button */
            .pass-toggle-btn {
                position: absolute;
                right: 10px;
                top: 50%;
                transform: translateY(-50%);
                background: none;
                border: none;
                color: var(--text-muted);
                cursor: pointer;
                font-size: 16px;
            }
            .pass-toggle-btn:hover {
                color: var(--text-normal);
            }
        `;
        document.head.appendChild(style);

        // Add password visibility toggle and fix sidebar server name
        setInterval(() => {
            // Fix: Dynamically update sidebar server name
            if (window.state && window.state.activeServerId && window.state.servers) {
                const server = window.state.servers.find(s => s.id === window.state.activeServerId);
                const sidebarName = document.getElementById("sidebar-server-name");
                if (server && sidebarName && sidebarName.textContent !== server.name) {
                    sidebarName.textContent = server.name;
                    sidebarName.style.cursor = "pointer";
                    sidebarName.title = "Sunucu Bilgilerini Görüntüle";
                    
                    // Add click listener if not added
                    if (!sidebarName.dataset.infoLinked) {
                        sidebarName.dataset.infoLinked = "true";
                        sidebarName.addEventListener("click", () => {
                            if (typeof window.showServerInfo === "function") {
                                window.showServerInfo();
                            }
                        });
                    }
                }
            } else if (!window.state || !window.state.activeServerId) {
                const sidebarName = document.getElementById("sidebar-server-name");
                if (sidebarName && sidebarName.textContent !== "SCORD") {
                    sidebarName.textContent = "SCORD";
                    delete sidebarName.dataset.infoLinked;
                }
            }

            // Hook DM search input to show dropdown
            const dmSearchInput = document.getElementById("dm-main-search-input");
            if (dmSearchInput && !dmSearchInput.dataset.dropdownHooked) {
                dmSearchInput.dataset.dropdownHooked = "true";
                
                let dropdown = document.getElementById("dm-search-dropdown");
                if (!dropdown) {
                    dropdown = document.createElement("div");
                    dropdown.id = "dm-search-dropdown";
                    dropdown.className = "dm-search-dropdown hidden";
                    dmSearchInput.parentNode.appendChild(dropdown);
                }

                // Override renderDMMainSearch to populate dropdown instead of chips
                window.renderDMMainSearch = function() {
                    const q = String(dmSearchInput.value || "").trim().toLowerCase();
                    const rows = [
                        ...(window.state.recentDMs || []).map(dm => ({ ...dm, label: "DM" })),
                        ...(window.state.friends || []).map(f => ({ peerId: f.peerId, name: f.name || f.username, avatarColor: f.avatarColor, avatarImage: f.avatarImage, label: "Arkadaş" })),
                    ];
                    const seen = new Set();
                    dropdown.innerHTML = "";
                    
                    const filtered = rows.filter(row => row.peerId && !seen.has(row.peerId) && (!q || String(row.name || "").toLowerCase().includes(q))).slice(0, 10);
                    
                    if (filtered.length === 0) {
                        dropdown.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-muted, #8e9297); font-size: 13px;">Kullanıcı bulunamadı</div>`;
                    } else {
                        filtered.forEach(row => {
                            seen.add(row.peerId);
                            const item = document.createElement("div");
                            item.className = "dm-search-item";
                            
                            const avatar = document.createElement("div");
                            avatar.className = "dm-search-item-avatar";
                            avatar.style.backgroundColor = row.avatarColor || "#5865f2";
                            if (row.avatarImage) {
                                avatar.style.backgroundImage = `url(${row.avatarImage})`;
                            } else {
                                avatar.textContent = window.initials ? window.initials(row.name || "?") : (row.name || "?").charAt(0).toUpperCase();
                            }
                            
                            const info = document.createElement("div");
                            info.className = "dm-search-item-info";
                            info.innerHTML = `<span class="dm-search-item-name">${window.escapeHtml ? window.escapeHtml(row.name || "Kullanıcı") : (row.name || "Kullanıcı")}</span>
                                              <span class="dm-search-item-label">${row.label}</span>`;
                                              
                            item.appendChild(avatar);
                            item.appendChild(info);
                            
                            item.onmousedown = (e) => {
                                e.preventDefault();
                                if (typeof window.openDM === "function") {
                                    window.openDM(row.peerId, row.name, row.avatarColor, row.avatarImage);
                                }
                                dropdown.classList.add("hidden");
                                dmSearchInput.value = "";
                            };
                            dropdown.appendChild(item);
                        });
                    }
                };

                dmSearchInput.addEventListener("focus", () => {
                    dropdown.classList.remove("hidden");
                    if (typeof window.renderDMMainSearch === "function") window.renderDMMainSearch();
                });

                dmSearchInput.addEventListener("blur", () => {
                    setTimeout(() => dropdown.classList.add("hidden"), 150);
                });
            }

            const passInput = document.getElementById("scord-pass-input");
            if (passInput && !passInput.dataset.toggleAdded) {
                passInput.dataset.toggleAdded = "true";
                const wrapper = document.createElement("div");
                wrapper.style.position = "relative";
                passInput.parentNode.insertBefore(wrapper, passInput);
                wrapper.appendChild(passInput);
                
                const btn = document.createElement("button");
                btn.className = "pass-toggle-btn";
                btn.innerHTML = "👁️";
                btn.onclick = (e) => {
                    e.preventDefault();
                    if (passInput.type === "password") {
                        passInput.type = "text";
                        btn.innerHTML = "🙈";
                    } else {
                        passInput.type = "password";
                        btn.innerHTML = "👁️";
                    }
                };
                wrapper.appendChild(btn);
            }
        }, 1000);
    }

    // INITIALIZATION
    function initV2() {
        console.log("[Fixes V2] Starting...");
        setTimeout(() => {
            applyDMCallFix();
            applyStatusFix();
            applyVoiceEffects();
            applyUIFixes();
            console.log("[Fixes V2] All patches applied successfully");
        }, 1500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initV2);
    } else {
        initV2();
    }
})();
