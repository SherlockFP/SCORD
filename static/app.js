/**
 * app.js — SCORD Main Application
 * =====================================
 * Orchestrates: identity, server management, chat, voice, UI.
 */

"use strict";

/* ── Constants ────────────────────────────────────────────── */
const WS_BASE = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
const API_BASE = "/api";

const AVATAR_COLORS = [
    "#7c3aed", "#4f46e5", "#0ea5e9", "#10b981", "#f59e0b",
    "#ef4444", "#ec4899", "#8b5cf6", "#06b6d4", "#84cc16",
];

const EMOJIS = ["😀", "😂", "😍", "🤔", "😎", "🥳", "😭", "🤯", "🔥", "❤️",
    "👍", "👏", "🎉", "💯", "🚀", "✨", "💀", "🤣", "😊", "😤",
    "🥺", "😴", "🤗", "😱", "🙏", "💪", "👋", "🎮", "🎧", "💬"];

/* ── Local state ──────────────────────────────────────────── */
let state = {
    peerId: null,
    username: "",
    avatarColor: "#7c3aed",
    avatarImage: null,
    appBackground: null,
    voiceSettings: { micId: "default", volume: 1, filter: "none" },
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
    theme: "sapphire"
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
}, 300);

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
    setTimeout(() => el.remove(), 4000);
}

function showModal(title, bodyHTML, footerHTML) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = bodyHTML;
    document.getElementById("modal-footer").innerHTML = footerHTML;
    document.getElementById("modal-backdrop").classList.remove("hidden");
}

function hideModal() {
    document.getElementById("modal-backdrop").classList.add("hidden");
}

/* ── Setup overlay ────────────────────────────────────────── */
function initSetup() {
    // Populate color swatches
    const container = document.getElementById("color-swatches");
    AVATAR_COLORS.forEach(color => {
        const swatch = document.createElement("div");
        swatch.className = "color-swatch" + (color === state.avatarColor ? " selected" : "");
        swatch.style.background = color;
        swatch.onclick = () => {
            state.avatarColor = color;
            container.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("selected"));
            swatch.classList.add("selected");
        };
        container.appendChild(swatch);
    });

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
    if (saved.bg) {
        state.appBackground = saved.bg;
        document.body.style.backgroundImage = `url(${saved.bg})`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
    }
    if (saved.voice) {
        try { state.voiceSettings = JSON.parse(saved.voice); } catch (e) { }
    }
    if (saved.image) state.avatarImage = saved.image;
    if (saved.username) {
        nameInput.value = saved.username;
        enterBtn.disabled = false;
        if (saved.color) {
            state.avatarColor = saved.color;
            container.querySelectorAll(".color-swatch").forEach(s => {
                s.classList.toggle("selected", s.style.background === saved.color || s.style.backgroundColor === saved.color);
            });
        }
        if (saved.peerId) state.peerId = saved.peerId;
    }
}

/* ── Start app after identity chosen ─────────────────────── */
function startApp() {
    document.getElementById("setup-overlay").classList.remove("active");
    document.getElementById("app").classList.remove("hidden");

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
    setInterval(refreshDiscovery, 15000);
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
    document.getElementById("home-view").classList.remove("hidden");
    document.getElementById("chat-view").classList.add("hidden");
    document.getElementById("voice-view").classList.add("hidden");
    state.activeChannelId = null;
    updateChannelSidebar(null);
    document.querySelectorAll(".rail-icon").forEach(el => el.classList.remove("active"));
    document.getElementById("home-btn").classList.add("active");
    document.getElementById("sidebar-server-name").textContent = "SCORD";
}

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

    state.activeServerId = serverId;
    state.activeChannelId = channelId;

    document.getElementById("home-view").classList.add("hidden");
    document.getElementById("chat-view").classList.remove("hidden");
    document.getElementById("voice-view").classList.add("hidden");

    // Fix: the HTML element ID for the channel title is 'active-channel-name' not 'server-name-label'
    const channelNameEl = document.getElementById("active-channel-name");
    if (channelNameEl) channelNameEl.textContent = `# ${channel.name}`;

    document.getElementById("chat-input").placeholder = `#${channel.name} kanalına mesaj gönder`;
    document.getElementById("sidebar-server-name").textContent = server.name;
    updateChannelSidebar(serverId);

    // V16: Render History
    const area = document.getElementById("messages-area");
    area.innerHTML = "";
    const history = server.messages ? server.messages[state.activeChannelId] : [];
    if (history) {
        history.forEach(m => appendMessageDOM(m));
    }

    updateMuteStates();
    updateMembersDebounced();
    updatePeerCountBadge(serverId);
}

function updateMuteStates() {
    if (!state.mesh) return;
    state.mesh.peers.forEach(peer => {
        if (peer.stream) {
            const pInfo = state.mesh.peerInfo[peer.peerId] || {};
            const sameChannel = (pInfo.voiceChannelId === state.voiceChannelId) && state.voiceChannelId !== null;
            // Strictly mute if not in same voice channel
            peer.stream.getTracks().forEach(t => t.enabled = sameChannel);
        }
    });
}

function showVoiceView(serverId, channelId) {
    closeMobileNav();
    const server = state.servers.find(s => s.id === serverId);
    const channel = server?.channels.find(c => c.id === channelId);
    if (!server || !channel) return;

    state.activeServerId = serverId;
    state.activeChannelId = channelId;

    document.getElementById("home-view").classList.add("hidden");
    document.getElementById("chat-view").classList.add("hidden");
    document.getElementById("voice-view").classList.remove("hidden");
    document.getElementById("voice-channel-name").textContent = channel.name;
    document.getElementById("sidebar-server-name").textContent = server.name;
    updateChannelSidebar(serverId);
    renderVoiceParticipants(serverId, channelId);
}

/* ── Server rail ──────────────────────────────────────────── */
function renderServerRail() {
    const container = document.getElementById("server-icons");
    container.innerHTML = "";
    state.servers.forEach(server => {
        const btn = document.createElement("button");
        btn.className = "rail-icon" + (server.id === state.activeServerId ? " active" : "");
        btn.title = server.name;

        if (server.icon_url) {
            btn.innerHTML = `<img src="${server.icon_url}" style="width:100%; height:100%; border-radius:inherit; object-fit:cover;" />`;
            btn.style.background = "var(--bg-deep)";
            btn.style.padding = "0";
            btn.textContent = "";
        } else {
            btn.textContent = initials(server.name);
            btn.style.background = server.color || "var(--accent-light)";
        }

        btn.onclick = () => {
            state.activeServerId = server.id;
            const defCh = server.channels.find(c => c.type === "text");
            if (defCh) showChatView(server.id, defCh.id);
            renderServerRail();
        };
        container.appendChild(btn);
    });
}

/* ── Channel sidebar ──────────────────────────────────────── */
/* ── Screen Sharing ───────────────────────────────────────── */
async function startScreenShare() {
    if (!state.mesh || !state.mesh.voiceActive) return toast("Önce sesli kanala katıl.", "error");

    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: true });
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

        // Stop automatically if user closes screen from browser UI
        stream.getVideoTracks()[0].onended = () => {
            stopScreenShare();
        };

        document.getElementById("voice-screen-btn").classList.add("active");
        toast("Ekran başarıyla paylaşıldı!", "success");
        // Force refresh UI
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
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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
        }

        state.mesh.broadcast({ type: "video_status", sharingCamera: true });

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

        if (state.mesh) state.mesh.broadcast({ type: "video_status", sharingCamera: false });

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
    const item = document.createElement("div");
    item.className = "channel-item" + (channel.id === state.activeChannelId ? " active" : "");
    item.id = `ch-${channel.id}`;

    const icon = document.createElement("span");
    icon.className = "ch-icon";
    icon.textContent = channel.type === "voice" ? "🔊" : "#";

    const name = document.createElement("span");
    name.className = "ch-name";
    name.textContent = channel.name;

    item.appendChild(icon);
    item.appendChild(name);

    // Unread badge
    const server = state.servers.find(s => s.id === serverId);
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
    const list = document.getElementById("members-list");
    const count = document.getElementById("member-count");
    list.innerHTML = "";
    if (!server) return;

    const members = server.members || [];
    const roles = server.roles || {};
    count.textContent = members.length;

    // Grouping by role
    const groups = {};
    // Ensure all roles exist as keys
    Object.keys(roles).forEach(rid => groups[rid] = []);
    groups["member"] = groups["member"] || []; // Fallback

    members.forEach(m => {
        const rid = server.peer_roles?.[m.peer_id] || "member";
        if (!groups[rid]) groups[rid] = [];
        groups[rid].push(m);
    });

    // Render roles in order (hoist first)
    const allRids = Array.from(new Set([...Object.keys(roles), ...Object.keys(groups)]));
    const sortedRids = allRids.sort((a, b) => {
        const ra = roles[a] || { name: ridToName(a), hoist: false };
        const rb = roles[b] || { name: ridToName(b), hoist: false };
        if (ra.hoist && !rb.hoist) return -1;
        if (!ra.hoist && rb.hoist) return 1;
        return 0;
    });

    function ridToName(rid) {
        return rid.charAt(0).toUpperCase() + rid.slice(1);
    }

    sortedRids.forEach(rid => {
        const groupMembers = groups[rid];
        if (groupMembers.length === 0) return;

        const cat = document.createElement("div");
        cat.className = "member-role-cat";
        const roleData = roles[rid] || { name: ridToName(rid), color: 'inherit' };
        cat.textContent = `${roleData.name} — ${groupMembers.length}`;
        cat.style.color = "var(--text-muted)";
        cat.style.fontSize = "11px";
        cat.style.fontWeight = "bold";
        cat.style.padding = "16px 12px 8px";
        cat.style.textTransform = "uppercase";
        list.appendChild(cat);

        groupMembers.forEach(m => {
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

    document.getElementById("member-count").textContent = members.length;
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
    area.innerHTML = `<div class="messages-welcome">
    <div class="messages-welcome-icon">💬</div>
    <h3># ${server?.channels.find(c => c.id === channelId)?.name || channelId}</h3>
    <p>Bu kanalın başlangıcı. Merhaba! 👋</p>
  </div>`;

    const messages = server?.messages?.[channelId] || [];
    let lastAuthor = null;

    const pins = server?.pinned_messages || [];
    messages.forEach(msg => {
        const grouped = msg.authorId === lastAuthor;
        if (pins.find(p => p.id === msg.id)) msg.isPinned = true;
        appendMessageDOM(msg, grouped);
        lastAuthor = msg.authorId;
    });

    // Clear unread
    if (server) {
        if (!server.unread) server.unread = {};
        server.unread[channelId] = 0;
        updateChannelSidebar(serverId);
    }
}

function appendMessageDOM(msg, grouped = false) {
    const area = document.getElementById("messages-area");
    const el = document.createElement("div");
    el.className = "message" + (grouped ? " grouped" : "");

    const avatarDiv = document.createElement("div");
    avatarDiv.className = "msg-avatar";
    applyAvatarToElement(avatarDiv, msg.avatarColor, msg.avatarImage, msg.author);

    const content = document.createElement("div");
    content.className = "msg-content";

    if (!grouped) {
        const header = document.createElement("div");
        header.className = "msg-header";
        const authorSpan = document.createElement("span");
        authorSpan.className = "msg-author" + (msg.authorId === state.peerId ? " is-you" : "");
        authorSpan.textContent = msg.author;
        if (msg.authorId !== state.peerId) {
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
        content.appendChild(header);
    }

    const textDiv = document.createElement("div");
    textDiv.className = "msg-text";
    textDiv.innerHTML = parseMessageText(msg.text); // Use innerHTML for embeds

    // Check if pinned
    if (msg.isPinned) {
        el.classList.add("pinned");
        const pinIcon = document.createElement("span");
        pinIcon.className = "pin-badge";
        pinIcon.innerHTML = "📌";
        pinIcon.title = "Sabitlenmiş Mesaj";
        el.appendChild(pinIcon);
    }

    textDiv.oncontextmenu = (e) => {
        e.preventDefault();
        showMsgContextMenu(msg, e.clientX, e.clientY);
    };

    if (msg.attachment) {
        const img = document.createElement("img");
        img.src = msg.attachment;
        img.style.maxWidth = "200px";
        img.style.borderRadius = "8px";
        img.style.marginTop = "8px";
        img.style.display = "block";
        textDiv.appendChild(img);
    }

    content.appendChild(textDiv);
    el.appendChild(avatarDiv);
    el.appendChild(content);
    area.appendChild(el);
    area.scrollTop = area.scrollHeight;
}

function addSystemMessage(text) {
    const area = document.getElementById("messages-area");
    const el = document.createElement("div");
    el.className = "system-message";
    el.textContent = text;
    area.appendChild(el);
    area.scrollTop = area.scrollHeight;
}

/* ── Send chat message ────────────────────────────────────── */
async function sendMessage() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text || !state.activeServerId || !state.activeChannelId) return;

    // Music Bot Intercepts
    if (text.startsWith("!play ")) {
        const query = text.slice(6).trim();
        addSystemMessage(`🎵 Müzik Botu YouTube'da arıyor: "${query}"...`);
        fetch(`${API_BASE}/ytsearch?q=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(data => {
                if (data.id) {
                    const startAt = Date.now();
                    if (state.mesh) state.mesh.broadcast({ type: "music_play", videoId: data.id, startAt });
                    startMusicBot(data.id, startAt);
                } else {
                    addSystemMessage("❌ Müzik bulunamadı.");
                }
            });
        input.value = "";
        input.style.height = "auto";
        return;
    } else if (text === "!stop" || text === "!skip") {
        if (state.mesh) state.mesh.broadcast({ type: "music_stop" });
        stopMusicBot();
        input.value = "";
        input.style.height = "auto";
        return;
    } else if (text === "!pause") {
        if (state.mesh) state.mesh.broadcast({ type: "music_pause" });
        if (state.musicBot && state.musicBot.player && typeof state.musicBot.player.pauseVideo === "function") {
            state.musicBot.player.pauseVideo();
        }
        input.value = "";
        input.style.height = "auto";
        return;
    } else if (text === "!resume") {
        if (state.mesh) state.mesh.broadcast({ type: "music_resume" });
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

    // V16: Server-side Persistence
    fetch(`${API_BASE}/rooms/${state.activeServerId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg })
    });

    input.value = "";
    input.style.height = "auto";

    saveMessage(state.activeServerId, msg);
    if (state.mesh) {
        state.mesh.broadcast({ type: "chat", payload: msg });
    }
}

function parseMessageText(text) {
    if (!text) return "";
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map(part => {
        if (part.match(urlRegex)) {
            // Check for images
            if (part.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i)) {
                return `<a href="${part}" target="_blank" class="rich-link"><img src="${part}" class="chat-embed-img" /></a>`;
            }
            // Check for YouTube
            const ytMatch = part.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
            if (ytMatch) {
                return `<div class="chat-embed-video"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0" allowfullscreen></iframe></div>`;
            }
            // Generic link
            return `<a href="${part}" target="_blank" class="chat-link">${part}</a>`;
        }
        return part;
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
    if (!server.messages) server.messages = {};
    if (!server.messages[msg.channelId]) server.messages[msg.channelId] = [];
    server.messages[msg.channelId].push(msg);

    // If this is the active channel, append to DOM
    if (msg.channelId === state.activeChannelId && serverId === state.activeServerId) {
        const msgs = server.messages[msg.channelId];
        const prev = msgs[msgs.length - 2];
        const grouped = prev && prev.authorId === msg.authorId;
        appendMessageDOM(msg, grouped);
    } else {
        // Mark unread
        if (!server.unread) server.unread = {};
        server.unread[msg.channelId] = (server.unread[msg.channelId] || 0) + 1;
        updateChannelSidebar(serverId);
    }
}

/* ── Server creation ──────────────────────────────────────── */
async function createServer(name) {
    // POST to signaling server to register the room
    const res = await fetch(`${API_BASE}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, owner_id: state.peerId }),
    });
    const { room_id } = await res.json();

    const server = {
        id: room_id,
        name: name,
        ownerId: state.peerId,
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
    const server = {
        id: roomId,
        name: room.name,
        color,
        ownerId: room.owner_id,
        channels: room.channels || [
            { id: "ch-genel", name: "genel", type: "text" },
            { id: "ch-duyurular", name: "duyurular", type: "text" },
            { id: "ch-sesli", name: "sesli-sohbet", type: "voice" },
            { id: "ch-muzik", name: "müzik", type: "voice" },
        ],
        roles: room.roles || {},
        peer_roles: room.peer_roles || {},
        members: [{
            peer_id: state.peerId,
            username: state.username,
            avatar_color: state.avatarColor,
            avatar_image: state.avatarImage,
        }],
        messages: {},
        unread: {},
        voiceMembers: {},
    };

    state.servers.push(server);
    renderServerRail();
    connectToRoom(roomId);
    showChatView(server.id, server.channels[0].id);
    toast(`"${room.name}" sunucusuna katıldın! 👋`, "success");
}

/* ── P2P Mesh connection management ──────────────────────── */
function connectToRoom(roomId) {
    // Disconnect old mesh if any
    if (state.mesh) {
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

    state.mesh.connect(state.username, state.avatarColor);
}

/* ── P2P event handlers ───────────────────────────────────── */
function handleIncomingP2P(fromPeerId, data, roomId) {
    if (data.type === "chat") {
        const msg = data.payload;
        saveMessage(roomId, msg);
        // Notification
        if (msg.channelId !== state.activeChannelId || roomId !== state.activeServerId) {
            toast(`${msg.author}: ${msg.text.slice(0, 60)}`, "info");
        }
    } else if (data.type === "dm") {
        if (!state.dms) state.dms = {};
        if (!state.dms[fromPeerId]) state.dms[fromPeerId] = [];
        state.dms[fromPeerId].push(data.payload);

        addToRecentDMs(fromPeerId, data.payload.author, data.payload.avatarColor, data.payload.avatarImage);

        if (state.activeDM === fromPeerId) {
            renderDMMessages(fromPeerId);
        } else {
            toast(`Özel Mesaj (DM) - ${data.payload.author}: ${data.payload.text.slice(0, 60)}`, "info");
        }
    } else if (data.type === "identity_announce" || data.type === "profile_update") {
        // Direct peer announcement (useful for large base64 avatar images that signaling skips)
        // or runtime profile updates
        const payload = data.type === "identity_announce" ? data : data.payload;
        const targetPeerId = payload.peerId || payload.authorId || payload.username; // fallback heuristics

        state.servers.forEach(server => {
            const memberIdx = server.members?.findIndex(m => m.peer_id === fromPeerId);
            if (memberIdx > -1) {
                if (payload.username) server.members[memberIdx].username = payload.username;
                if (payload.avatarColor) server.members[memberIdx].avatar_color = payload.avatarColor;
                if (payload.avatarImage) server.members[memberIdx].avatar_image = payload.avatarImage;
            }
        });

        if (state.activeServerId === roomId) {
            updateMembersPanel(roomId);
        }
    } else if (data.type === "voice_join" || data.type === "voice_state_sync") {
        const server = state.servers.find(s => s.id === roomId);
        if (server) {
            if (!server.voiceMembers) server.voiceMembers = {};
            if (!server.voiceMembers[data.channelId]) server.voiceMembers[data.channelId] = [];
            if (!server.voiceMembers[data.channelId].find(m => m.peer_id === fromPeerId)) {
                server.voiceMembers[data.channelId].push({
                    peer_id: fromPeerId,
                    username: data.username,
                    avatar_color: data.avatarColor,
                    avatar_image: data.avatarImage,
                    isSharingScreen: !!data.isSharingScreen
                });
            } else {
                // Update existing member info if needed
                const m = server.voiceMembers[data.channelId].find(m => m.peer_id === fromPeerId);
                if (m) {
                    m.isSharingScreen = !!data.isSharingScreen;
                }
            }
            // If we are already in this channel, reply to joining peer (or on connection)
            if (state.voiceChannelId === data.channelId && state.mesh) {
                state.mesh.sendTo(fromPeerId, {
                    type: "voice_state_sync",
                    channelId: data.channelId,
                    username: state.username,
                    avatarColor: state.avatarColor,
                    avatarImage: state.avatarImage,
                    isSharingScreen: !!state.screenStream
                });
            }
            updateChannelSidebar(roomId);
            if (state.activeChannelId === data.channelId) renderVoiceParticipants(roomId, data.channelId);
            updateMuteStates();
        }
    } else if (data.type === "voice_leave") {
        const server = state.servers.find(s => s.id === roomId);
        if (server?.voiceMembers?.[data.channelId]) {
            server.voiceMembers[data.channelId] = server.voiceMembers[data.channelId].filter(m => m.peer_id !== fromPeerId);
            updateChannelSidebar(roomId);
            if (state.activeChannelId === data.channelId) renderVoiceParticipants(roomId, data.channelId);
            updateMuteStates();
        }
    } else if (data.type === "msg_pin_toggle") {
        const server = state.servers.find(s => s.id === roomId);
        if (server) {
            const { msgId, isPinned, msg } = data.payload;
            if (!server.pinned_messages) server.pinned_messages = [];
            if (isPinned) {
                if (!server.pinned_messages.find(m => m.id === msgId)) server.pinned_messages.push(msg);
            } else {
                server.pinned_messages = server.pinned_messages.filter(m => m.id !== msgId);
            }
            renderMessages(roomId, state.activeChannelId);
        }
    } else if (data.type === "music_play") {
        if (state.voiceChannelId) {
            startMusicBot(data.videoId, data.startAt);
        }
    } else if (data.type === "music_stop") {
        if (state.voiceChannelId) {
            stopMusicBot();
        }
    } else if (data.type === "music_pause") {
        if (state.voiceChannelId && state.musicBot.player && typeof state.musicBot.player.pauseVideo === "function") {
            state.musicBot.player.pauseVideo();
        }
    } else if (data.type === "music_resume") {
        if (state.voiceChannelId && state.musicBot.player && typeof state.musicBot.player.playVideo === "function") {
            state.musicBot.player.playVideo();
        }
    } else if (data.type === "voice_status") {
        const server = state.servers.find(s => s.id === roomId);
        if (server && server.voiceMembers && server.voiceMembers[state.voiceChannelId]) {
            const member = server.voiceMembers[state.voiceChannelId].find(m => m.peer_id === fromPeerId);
            if (member) {
                member.isSpeaking = data.speaking;
                renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
            }
        }
    } else if (data.type === "screen_status") {
        const server = state.servers.find(s => s.id === roomId);
        if (server && server.voiceMembers && server.voiceMembers[state.voiceChannelId]) {
            const member = server.voiceMembers[state.voiceChannelId].find(m => m.peer_id === fromPeerId);
            if (member) {
                member.isSharingScreen = data.sharing;
                renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
            }
        }
    } else if (data.type === "server_update") {
        const payload = data.payload;
        const idx = state.servers.findIndex(s => s.id === payload.id);
        if (idx !== -1) {
            state.servers[idx].name = payload.name;
            state.servers[idx].channels = payload.channels;
            state.servers[idx].roles = payload.roles;
            if (state.activeServerId === payload.id) {
                document.getElementById("sidebar-server-name").textContent = payload.name;
                updateChannelSidebar(payload.id);
                updateMembersPanel(payload.id);
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
            // Merge messages — don't overwrite existing local messages
            const incoming = data.messages || {};
            if (!server.messages) server.messages = {};
            Object.keys(incoming).forEach(chId => {
                if (!server.messages[chId] || server.messages[chId].length === 0) {
                    server.messages[chId] = incoming[chId];
                }
            });
            // Merge roles
            if (data.roles) server.roles = { ...data.roles, ...(server.roles || {}) };
            // Re-render if we are viewing one of those channels
            if (state.activeServerId === roomId) {
                renderMessages(roomId, state.activeChannelId);
                updateMembersPanel(roomId);
            }
        }
    } else if (data.type === "force_kick" && data.target === state.peerId) {
        const server = state.servers.find(s => s.id === roomId);
        if (server && (server.ownerId === fromPeerId || server.roles?.[fromPeerId] === "admin")) {
            if (state.voiceChannelId) leaveVoiceChannel();
            if (state.mesh) { state.mesh.disconnect(); state.mesh = null; }
            toast("Bir yönetici tarafından sunucudan atıldın. 🚪", "error");
        }
    } else if (data.type === "force_mute" && data.target === state.peerId) {
        const server = state.servers.find(s => s.id === roomId);
        if (server && (server.ownerId === fromPeerId || server.roles?.[fromPeerId] === "admin" || server.roles?.[fromPeerId] === "mod")) {
            if (state.mesh?.localStream) {
                state.mesh.localStream.getAudioTracks().forEach(t => { t.enabled = false; });
                state.micMuted = true;
                document.getElementById("voice-mute-btn")?.classList.add("active");
            }
            toast("Bir yönetici tarafından sesin kapatıldı. \uD83D\uDD07", "warn");
        }
    } else if (data.type === "force_route" && data.target === state.peerId) {
        const server = state.servers.find(s => s.id === roomId);
        if (server && (server.ownerId === fromPeerId || server.roles?.[fromPeerId] === "admin" || server.roles?.[fromPeerId] === "mod")) {
            toast("Bir yetkili tarafından odan değiştirildi.", "warning");
            if (state.voiceChannelId) leaveVoiceChannel();
            setTimeout(() => joinVoiceChannel(data.targetChannel), 200);
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
        // Update existing info
        server.members[existingIdx].username = username;
        server.members[existingIdx].avatar_color = color;
        server.members[existingIdx].avatar_image = image;
    }

    if (state.activeServerId === roomId) {
        updateMembersPanel(roomId);
        updatePeerCountBadge(roomId);
        // Only show system message for NEW joins, not historical ones
        // (but since p2p.js now calls this for room_state, we might need a flag)
        // For now, keep it simple.
    }

    // Send history if we are the "boss" or have history
    if (state.mesh && server.messages && Object.keys(server.messages).length > 0) {
        state.mesh.sendTo(peerId, {
            type: "history_sync",
            messages: server.messages,
            roles: server.roles || {}
        });
    }

    renderServerRail();
}

function handlePeerLeft(peerId, roomId) {
    const server = state.servers.find(s => s.id === roomId);
    if (!server) return;

    server.members = (server.members || []).filter(m => m.peer_id !== peerId);

    // Remove from voice channels
    if (server.voiceMembers) {
        Object.keys(server.voiceMembers).forEach(chId => {
            server.voiceMembers[chId] = server.voiceMembers[chId].filter(m => m.peer_id !== peerId);
        });
    }

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
        video.muted = true;
        video.className = "voice-video";

        // Ensure UI updates when video actually starts
        video.onloadedmetadata = () => {
            if (state.activeServerId && state.activeChannelId) {
                renderVoiceParticipants(state.activeServerId, state.activeChannelId);
            }
        };

        state.remoteMedia[peerId] = video;

        // Let renderVoiceParticipants pick it up if UI is open
        setTimeout(() => {
            renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
            updateMuteStates(); // Apply channel isolation immediately
        }, 500);
    }
    state.remoteMedia[peerId].srcObject = stream;
    updateMuteStates(); // Re-check isolation whenever a stream is assigned
}

function updateConnectionStatus(status) {
    // Could display in UI — kept minimal for now
    console.log("[App] Connection status:", status);
}

// Consolidated above

function handlePeerConnected(peerId, roomId) {
    // When a peer connects, if we are in a voice channel, tell them immediately
    if (state.voiceChannelId && state.mesh) {
        state.mesh.sendTo(peerId, {
            type: "voice_state_sync",
            channelId: state.voiceChannelId,
            username: state.username,
            avatarColor: state.avatarColor,
            avatarImage: state.avatarImage,
            isSharingScreen: !!state.screenStream
        });
    }
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
        // Force re-render UI to pick up the new video track
        setTimeout(() => {
            if (state.activeServerId && state.activeChannelId) {
                renderVoiceParticipants(state.activeServerId, state.activeChannelId);
            }
        }, 1000);
    }
    updateMuteStates();
}

/* ── Voice channel ────────────────────────────────────────── */
async function joinVoiceChannel(channelId) {
    if (!state.mesh) return;

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

            const isSpeaking = (Date.now() - (state._lastSpeakTime || 0)) < 250;

            if (isSpeaking !== state.isSpeaking) {
                state.isSpeaking = isSpeaking;
                if (state.mesh) state.mesh.broadcast({ type: "voice_status", speaking: isSpeaking });
                renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
            }
        }, 100);
    } catch (err) {
        console.error("Audio error", err);
        toast("Mikrofon hatası: İzin verilmedi.", "error");
        return;
    }

    const ok = await state.mesh.startVoice(processedStream);
    if (!ok) { toast("Ses yayını başlatılamadı.", "error"); return; }

    state.voiceChannelId = channelId;

    // Notify peers
    state.mesh.broadcast({
        type: "voice_join",
        channelId,
        username: state.username,
        avatarColor: state.avatarColor,
        avatarImage: state.avatarImage,
    });

    // Add self to voiceMembers
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (server) {
        if (!server.voiceMembers) server.voiceMembers = {};
        if (!server.voiceMembers[channelId]) server.voiceMembers[channelId] = [];
        if (!server.voiceMembers[channelId].find(m => m.peer_id === state.peerId)) {
            server.voiceMembers[channelId].push({ peer_id: state.peerId, username: state.username, avatar_color: state.avatarColor, avatar_image: state.avatarImage });
        }
        updateChannelSidebar(state.activeServerId);
    }

    renderVoiceParticipants(state.activeServerId, channelId);
    showVoiceStatusBar(state.activeServerId, channelId);

    // Toggle buttons
    document.getElementById("voice-join-btn").classList.add("hidden");
    document.getElementById("voice-leave-btn").classList.remove("hidden");
    document.getElementById("voice-screen-btn")?.classList.remove("hidden");
    document.getElementById("voice-camera-btn")?.classList.remove("hidden");

    updateMuteStates();
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

    state.mesh.broadcast({ type: "voice_leave", channelId });

    const server = state.servers.find(s => s.id === state.activeServerId);
    if (server?.voiceMembers?.[channelId]) {
        server.voiceMembers[channelId] = server.voiceMembers[channelId].filter(m => m.peer_id !== state.peerId);
        updateChannelSidebar(state.activeServerId);
    }

    renderVoiceParticipants(state.activeServerId, channelId);
    hideVoiceStatusBar();

    document.getElementById("voice-join-btn").classList.remove("hidden");
    document.getElementById("voice-leave-btn").classList.add("hidden");
    document.getElementById("voice-screen-btn")?.classList.add("hidden");
    document.getElementById("voice-camera-btn")?.classList.add("hidden");

    if (state.screenStream) {
        state.screenStream.getTracks().forEach(t => t.stop());
        state.screenStream = null;
    }
    if (state.mesh) state.mesh.screenStream = null;

    if (state.cameraStream) stopCameraShare(); // Reset camera state

    updateMuteStates();
    toast("Sesli kanaldan ayrıldın.", "info");
}

function renderVoiceParticipants(serverId, channelId) {
    const server = state.servers.find(s => s.id === serverId);
    const container = document.getElementById("voice-participants");
    if (!container) return;
    const members = server?.voiceMembers?.[channelId] || [];
    if (members.length === 0) {
        container.innerHTML = '<p class="voice-empty">Sesli kanalda henüz kimse yok.</p>';
        return;
    }

    const emptyMsg = container.querySelector(".voice-empty");
    if (emptyMsg) emptyMsg.remove();

    // 1. Remove cards for peers who left
    const currentPeerIds = members.map(m => m.peer_id);
    const existingCards = container.querySelectorAll('.voice-participant-card');
    existingCards.forEach(card => {
        const pid = card.getAttribute('data-peer-id');
        if (!currentPeerIds.includes(pid)) card.remove();
    });

    // 2. Update or Create cards (differential render)
    members.forEach(m => {
        let card = container.querySelector(`.voice-participant-card[data-peer-id="${m.peer_id}"]`);
        if (!card) {
            card = document.createElement("div");
            card.className = "voice-participant-card";
            card.setAttribute('data-peer-id', m.peer_id);
            container.appendChild(card);
        }

        // Avatar
        let av = card.querySelector('.vpc-avatar');
        if (!av) {
            av = document.createElement("div");
            av.className = "vpc-avatar";
            card.appendChild(av);
        }
        applyAvatarToElement(av, m.avatar_color, m.avatar_image, m.username);

        // Speaking Glow
        const currentlySpeaking = m.isSpeaking || (m.peer_id === state.peerId && state.isSpeaking);
        if (currentlySpeaking) card.classList.add("speaking");
        else card.classList.remove("speaking");

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

        const isSharing = m.isSharingScreen || (m.peer_id === state.peerId && state.screenStream);
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
            const localStream = state.screenStream || state.cameraStream;
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

        if (videoEl && videoEl.srcObject?.getVideoTracks().length > 0) {
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

            if (!watchBtn && isSharing) {
                watchBtn = document.createElement("button");
                watchBtn.className = "btn-primary watch-btn";
                watchBtn.style.marginTop = "8px";
                watchBtn.style.width = "100%";
                watchBtn.textContent = "Yayını İzle";
                watchBtn.onclick = (e) => { e.stopPropagation(); openScreenOverlay(m.peer_id, m.username); };
                card.appendChild(watchBtn);
            }
        } else {
            card.classList.remove("has-video");
            if (videoEl && videoEl.parentNode === card) videoEl.remove();
            if (watchBtn) watchBtn.remove();
        }

        // Drag and Drop Admin
        const isAdmin = server && (server.ownerId === state.peerId || server.roles?.[state.peerId] === "admin");
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

/* ── Discovery (home screen room list) ───────────────────── */
async function refreshDiscovery() {
    try {
        const rooms = await fetch(`${API_BASE}/rooms`).then(r => r.json());
        const grid = document.getElementById("room-list-home");
        if (!grid) return;
        grid.innerHTML = "";

        if (rooms.length === 0) {
            grid.innerHTML = `<p style="color:var(--text-muted);font-size:13px;padding:20px;text-align:center;width:100%">Henüz aktif sunucu yok. İlk sunucuyu sen oluştur!</p>`;
            return;
        }

        rooms.forEach(room => {
            const isOwner = state.peerId === room.owner_id;
            const crown = isOwner ? '<span class="crown-icon" title="Sunucu Sahibi">👑</span>' : '';

            const card = document.createElement("div");
            card.className = "room-card";
            card.innerHTML = `
                <div class="room-card-icon" style="background: ${room.color || 'var(--accent)'}">
                    ${room.icon_url ? `<img src="${room.icon_url}" />` : initials(room.name)}
                </div>
                <div class="room-card-info">
                    <div class="room-card-name">${room.name} ${crown}</div>
                    <div class="room-card-meta">${room.peer_count || 0} kişi çevrimiçi</div>
                </div>
                <button class="btn-primary tiny">Katıl</button>
            `;
            card.onclick = () => joinServer(room.room_id);
            grid.appendChild(card);
        });
    } catch (err) {
        console.warn("[App] Discovery refresh failed", err);
    }
}

function openScreenOverlay(peerId, username) {
    const video = state.remoteMedia?.[peerId];
    if (!video) return toast("Video akışı bulunamadı.", "error");

    const overlay = document.createElement("div");
    overlay.className = "screen-overlay";
    overlay.id = "screen-overlay";

    const closeBtn = document.createElement("button");
    closeBtn.className = "screen-overlay-close";
    closeBtn.textContent = "Kapat";
    closeBtn.onclick = () => overlay.remove();

    const bigVideo = document.createElement("video");
    bigVideo.autoplay = true;
    bigVideo.playsInline = true;
    bigVideo.srcObject = video.srcObject;
    bigVideo.className = "screen-overlay-video";

    overlay.appendChild(closeBtn);
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
        </div>
        <div id="s-gorunum" class="s-panel" style="display:none">
          <div class="form-group" style="margin-bottom:14px">
            <label class="modal-label">Tema</label>
            <select class="modal-input" id="settings-theme">
              <option value="">SCORD — Glassmorphism</option>
              <option value="theme-neon">⚡ Neon Hacker</option>
              <option value="theme-discord">💬 Discord Klasik</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:14px">
            <label class="modal-label">Kişisel Arka Plan Resmi</label>
            <input type="file" id="settings-bg-upload" accept="image/*" class="modal-input" style="padding:6px" />
            <p class="modal-info" style="margin-top:6px">Yalnızca senin ekranına hitap eden yerel bir görsel.</p>
          </div>
          <div class="form-group">
            <label class="modal-label" style="display:flex;align-items:center;gap:10px;cursor:pointer;">
              <input type="checkbox" id="settings-compact" ${state.compactMode ? 'checked' : ''}>
              Kompakt Görünüm
            </label>
          </div>
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
          <div class="form-group">
            <label class="modal-label">Kısayollar</label>
            <p class="modal-info" style="margin:2px 0">M — Mikrofon aç/kapat &nbsp;|&nbsp; D — Kulaklık</p>
          </div>
        </div>
        <div id="s-bildirim" class="s-panel" style="display:none">
          <div class="form-group" style="margin-bottom:12px">
            <label class="modal-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="notif-chat" ${state.notifSettings?.chat !== false ? 'checked' : ''}>
              Sohbet bildirimleri
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
            <label class="modal-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="notif-dm" ${state.notifSettings?.dm !== false ? 'checked' : ''}>
              Özel mesaj (DM) bildirimi
            </label>
          </div>
          <div class="form-group">
            <label class="modal-label" style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="notif-join" ${state.notifSettings?.join !== false ? 'checked' : ''}>
              Giriş/çıkış bildirimi
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


    if ((myRole === "owner" || myRole === "admin") && peerId !== state.peerId) {
        addDivider();
        addSection("Yetki");
        const cr = server.roles?.[peerId];
        if (server.ownerId !== peerId) {
            if (cr !== "admin") addItem("🛡️", "Yönetici Yap", () => assignRole(peerId, "admin", server));
            if (cr !== "mod") addItem("🟢", "Moderatör Yap", () => assignRole(peerId, "mod", server));
            if (cr) addItem("👤", "Rolü Kaldır", () => assignRole(peerId, null, server));
        }
        addDivider();
        addItem("🚪", "Sunucudan At (Kick)", () => kickPeer(peerId, username), true);
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

    const myRole = server.ownerId === state.peerId ? "owner"
        : server.peer_roles?.[state.peerId] === "admin" ? "admin"
            : server.peer_roles?.[state.peerId] === "mod" ? "mod" : "member";

    const menu = document.createElement("div");
    menu.className = "ctx-menu";
    menu.id = "ctx-menu";
    menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 300)}px`;

    const addItem = (icon, label, action, danger = false) => {
        const item = document.createElement("div");
        item.className = "ctx-item" + (danger ? " danger" : "");
        item.innerHTML = `<span class="ctx-icon">${icon}</span>${label}`;
        item.onclick = () => { closeContextMenu(); action(); };
        menu.appendChild(item);
    };

    const isOwnerOrAdmin = myRole === "owner" || myRole === "admin" || myRole === "mod";
    // Pin message action
    if (isOwnerOrAdmin) {
        const isPinned = msg.isPinned;
        addItem("📌", isPinned ? "Mesajı Sabitlemeden Kaldır" : "Mesajı Sabitle", async () => {
            msg.isPinned = !isPinned;
            if (state.mesh) {
                state.mesh.broadcast({ type: "msg_pin_toggle", payload: { msgId: msg.id, isPinned: msg.isPinned, msg: msg } });
            }
            if (!server.pinned_messages) server.pinned_messages = [];
            if (msg.isPinned) {
                if (!server.pinned_messages.find(m => m.id === msg.id)) server.pinned_messages.push(msg);
            } else {
                server.pinned_messages = server.pinned_messages.filter(m => m.id !== msg.id);
            }

            // Re-render
            renderMessages(state.activeServerId, state.activeChannelId);

            // Notify server via REST
            fetch(`${API_BASE}/rooms/${state.activeServerId}/pin`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: msg })
            });

            toast("Mesaj sabitlemesi güncellendi.", "info");
        });
    }

    document.body.appendChild(menu);
    setTimeout(() => {
        document.addEventListener("click", closeContextMenu, { once: true });
    }, 10);
}

function showMemberProfile(peerId, username, server) {
    const m = server.members?.find(m => m.peer_id === peerId);
    const role = server.ownerId === peerId ? "Kurucu 👑"
        : server.roles?.[peerId] === "admin" ? "Yönetici 🛡️"
            : server.roles?.[peerId] === "mod" ? "Moderatör 🟢"
                : "Üye";
    const cls = server.ownerId === peerId ? "owner" : server.roles?.[peerId] || "";
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
    toast(`${username} sunucudan atıldı.`, "info");
}

function forceMutePeer(peerId, username) {
    if (!state.mesh) return;
    state.mesh.broadcast({ type: "force_mute", target: peerId });
    toast(`${username} sessize alındı.`, "info");
}

function assignRole(peerId, role, server) {
    if (!server.roles) server.roles = {};
    if (role) server.roles[peerId] = role;
    else delete server.roles[peerId];
    if (state.mesh) state.mesh.broadcast({ type: "server_update", payload: { id: server.id, name: server.name, channels: server.channels, roles: server.roles } });
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

    if (state._tempAvatarImage) {
        state.avatarImage = state._tempAvatarImage;
        localStorage.setItem("scord_avatar_image", state.avatarImage);
        state._tempAvatarImage = null;
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

    // Save notification settings
    const notifChat = document.getElementById("notif-chat")?.checked ?? true;
    const notifDm = document.getElementById("notif-dm")?.checked ?? true;
    const notifJoin = document.getElementById("notif-join")?.checked ?? true;
    state.notifSettings = { chat: notifChat, dm: notifDm, join: notifJoin };
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

    // Check privileges
    const isOwner = server.ownerId === state.peerId;
    const isAdmin = isOwner || server.roles?.[state.peerId] === "admin";
    if (!isAdmin) return toast("Bu işlem için yönetici yetkisi gerekli.", "error");

    showModal(
        `Sunucu Ayarları: ${server.name}`,
        `<div class="settings-tabs" style="display:flex; gap:16px; margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:8px;">
            <div id="stab-general" onclick="window._stabSwitch('general')" style="color:var(--accent-light); cursor:pointer; font-weight:600;">Genel</div>
            <div id="stab-roles" onclick="window._stabSwitch('roles')" style="color:var(--text-muted); cursor:pointer;">Üyeler & Rolller</div>
            <div id="stab-advanced" onclick="window._stabSwitch('advanced')" style="color:var(--text-muted); cursor:pointer;">Gelişmiş</div>
         </div>
         <div id="s-tab-general">
            <div class="form-group" style="margin-bottom: 12px">
                <label class="modal-label">Sunucu Adı</label>
                <input class="modal-input" id="sv-name" value="${server.name}" ${isOwner ? "" : "disabled"} />
            </div>
            <div class="form-group" style="margin-bottom: 12px">
                <label class="modal-label">Sunucu İkonu (URL)</label>
                <div style="display:flex; gap:8px">
                    <input class="modal-input" id="sv-icon" value="${server.icon_url || ""}" placeholder="https://imgur.com/..." style="flex:1" />
                    <button class="hero-btn tiny" onclick="updateServerIcon('${server.id}', document.getElementById('sv-icon').value)">Güncelle</button>
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
            <div style="max-height:200px; overflow-y:auto;">
                <table style="width:100%; text-align:left; color:#fff;" id="sv-roles-list">
                    <tr><th>Üye</th><th>Yetki</th></tr>
                </table>
            </div>
         </div>
         <div id="s-tab-advanced" style="display:none;">
            <div class="form-group">
                <label class="modal-label">Davet Kodu</label>
                <div class="peer-id-display" style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${server.invite_code || "YOK"}</span>
                    <button class="hero-btn tiny" onclick="navigator.clipboard.writeText('${server.invite_code}'); toast('Kod kopyalandı!','info')">Kopyala</button>
                </div>
                <p class="modal-info">Arkadaşların bu kodu ana sayfadaki 'Katıl' kutusuna yazarak gelebilirler.</p>
            </div>
            ${isOwner ? `
            <div class="form-group" style="margin-top:24px">
                <button class="btn-primary" style="background:var(--red); border:none;" onclick="deleteServer('${server.id}')">Sunucuyu Kapat/Kaldır</button>
            </div>` : ""}
         </div>`,
        `<button class="btn-secondary" onclick="hideModal()">Kapat</button>
         <button class="btn-primary" style="width:auto;padding:10px 24px" onclick="saveServerSettings()">Kaydet</button>`
    );

    window._stabSwitch = (tab) => {
        ["general", "roles", "advanced"].forEach(t => {
            document.getElementById(`s-tab-${t}`).style.display = t === tab ? "block" : "none";
            document.getElementById(`stab-${t}`).style.color = t === tab ? "var(--accent-light)" : "var(--text-muted)";
            document.getElementById(`stab-${t}`).style.fontWeight = t === tab ? "600" : "400";
        });
    };

    // Populate roles
    const tbody = document.getElementById("sv-roles-list");
    server.members.forEach(m => {
        if (m.peer_id === server.ownerId) {
            tbody.innerHTML += `< tr ><td>${m.username}</td><td>Kurucu 👑</td></tr > `;
        } else {
            const isAdm = server.roles?.[m.peer_id] === "admin";
            tbody.innerHTML += `< tr >
                <td>${m.username}</td>
                <td>
                   <select ${!isOwner ? 'disabled' : ''} onchange="window._tmpSetRole('${m.peer_id}', this.value)" class="modal-input" style="padding:2px; height:auto; background:var(--bg-active);">
                     <option value="member" ${!isAdm ? 'selected' : ''}>Üye</option>
                     <option value="admin" ${isAdm ? 'selected' : ''}>Yönetici</option>
                   </select>
                </td>
            </tr > `;
        }
    });

    window._tmpPendingRoles = { ...(server.roles || {}) };
    window._tmpSetRole = (peerId, val) => {
        if (val === "admin") window._tmpPendingRoles[peerId] = "admin";
        else delete window._tmpPendingRoles[peerId];
    };

    window._tmpAddChannel = () => {
        if (!isOwner) return;
        const cname = document.getElementById("sv-new-channel").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (!cname) return;
        server.channels.push({ id: genId(), name: cname, type: "text" });
        toast("Kanal eklendi. Uygula'ya basarak kaydedin.", "success");
        document.getElementById("sv-new-channel").value = "";
    };

    document.getElementById("stab-general").onclick = () => {
        document.getElementById("stab-general").style.color = "var(--accent-light)";
        document.getElementById("stab-roles").style.color = "var(--text-muted)";
        document.getElementById("s-tab-general").style.display = "block";
        document.getElementById("s-tab-roles").style.display = "none";
    };
    document.getElementById("stab-roles").onclick = () => {
        document.getElementById("stab-roles").style.color = "var(--accent-light)";
        document.getElementById("stab-general").style.color = "var(--text-muted)";
        document.getElementById("s-tab-general").style.display = "none";
        document.getElementById("s-tab-roles").style.display = "block";
    };
}

function saveServerSettings() {
    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    const isOwner = server.ownerId === state.peerId;
    const isAdmin = isOwner || server.roles?.[state.peerId] === "admin";
    if (!isAdmin) return;

    if (isOwner) {
        const nname = document.getElementById("sv-name").value.trim();
        if (nname) server.name = nname;
    }

    if (isAdmin) {
        server.roles = window._tmpPendingRoles;
        document.getElementById("sidebar-server-name").textContent = server.name;
    }

    // Broadcast changes
    if (state.mesh) {
        state.mesh.broadcast({ type: "server_update", payload: server });
    }
    renderServerRail();
    updateChannelSidebar(server.id);
    hideModal();
    toast("Sunucu güncellendi.", "success");
}

/* ── Direct Messaging ─────────────────────────────────────── */
function openDM(peerId, name, avatarColor = null, avatarImage = null) {
    state.activeDM = peerId;
    document.getElementById("dm-target-name").textContent = "@" + name;
    document.getElementById("dm-overlay").classList.remove("hidden");

    addToRecentDMs(peerId, name, avatarColor, avatarImage);
    renderDMMessages(peerId);
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

    messages.forEach(msg => {
        const el = document.createElement("div");
        el.className = "message";
        const av = document.createElement("div");
        av.className = "msg-avatar";
        applyAvatarToElement(av, msg.avatarColor, msg.avatarImage, msg.author);

        const content = document.createElement("div");
        content.className = "msg-content";
        const header = document.createElement("div");
        header.className = "msg-header";
        const authorSp = document.createElement("span");
        authorSp.className = "msg-author" + (msg.authorId === state.peerId ? " is-you" : "");
        authorSp.textContent = msg.author;
        header.appendChild(authorSp);

        const text = document.createElement("div");
        text.className = "msg-text";
        text.textContent = msg.text;

        content.appendChild(header);
        content.appendChild(text);
        el.appendChild(av);
        el.appendChild(content);
        area.appendChild(el);
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

/* ── Event listeners ──────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
    initSetup();
    document.getElementById("server-settings-btn").onclick = openServerSettingsModal;

    // Modal close
    document.getElementById("modal-close").onclick = hideModal;
    document.getElementById("modal-backdrop").onclick = (e) => {
        if (e.target === document.getElementById("modal-backdrop")) hideModal();
    };

    // Chat input
    const chatInput = document.getElementById("chat-input");
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    chatInput.addEventListener("input", () => {
        chatInput.style.height = "auto";
        chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + "px";
    });

    document.getElementById("send-btn").onclick = sendMessage;

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
        gifInput.addEventListener("input", UI.debounce((e) => searchGifs(e.target.value), 500));
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
        document.getElementById("dm-overlay").classList.add("hidden");
        state.activeDM = null;
    };
    const dmInput = document.getElementById("dm-input");
    if (dmInput) {
        dmInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
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
                saveMessage(state.activeServerId, msg);
                if (state.mesh) {
                    state.mesh.broadcast({ type: "chat", payload: msg });
                }
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
                if (state.mesh) state.mesh.broadcast({ type: "screen_status", sharing: false });
                const preview = document.getElementById("local-screen-preview");
                if (preview && !state.cameraStream) preview.classList.add("hidden");
            } else {
                const success = await state.mesh.startScreenShare();
                if (success) {
                    screenBtn.classList.add("active");
                    toast("Ekran paylaşımı başlatıldı.", "success");
                    if (state.mesh) state.mesh.broadcast({ type: "screen_status", sharing: true });

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
                if (state.mesh) state.mesh.broadcast({ type: "voice_status", speaking: true });
            }
        }
    });
    window.addEventListener("keyup", (e) => {
        if (state.voiceSettings?.inputMode === "ptt" && e.key === state.voiceSettings.pttKey) {
            state._pttActive = false;
            if (state.originalMicStream) {
                const track = state.originalMicStream.getAudioTracks()[0];
                if (track) track.enabled = false;
                if (state.mesh) state.mesh.broadcast({ type: "voice_status", speaking: false });
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
                <div style="font-size:14px;">${parseMessageText(m.text)}</div>
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
let ytReady = false;

// Global callback for YouTube script
window.onYouTubeIframeAPIReady = function () {
    ytReady = true;
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
    }
}

function stopMusicBot() {
    state.musicBot.active = false;
    state.musicBot.videoId = null;

    if (state.musicBot.player) {
        state.musicBot.player.stopVideo();
    }

    const server = state.servers.find(s => s.id === state.activeServerId);
    if (server && server.voiceMembers && server.voiceMembers[state.voiceChannelId]) {
        server.voiceMembers[state.voiceChannelId] = server.voiceMembers[state.voiceChannelId].filter(m => m.peer_id !== "bot_music");
        if (state.activeChannelId === state.voiceChannelId) {
            renderVoiceParticipants(state.activeServerId, state.voiceChannelId);
        }
        updateChannelSidebar(state.activeServerId);
    }
}

/* ── User Profile & Screen Share Bindings ────────────────── */
function openUserProfile(peerId, username, avatarImage, avatarColor) {
    const isSelf = peerId === state.peerId;

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
    `;

    const footer = !isSelf ? `<button class="btn-primary" onclick="openDM('${peerId}', '${username}', '${avatarColor || ''}', '${avatarImage || ''}'); hideModal();">Mesaj Gönder</button>` : `<button class="btn-secondary" onclick="hideModal()">Kapat</button>`;

    showModal("Kullanıcı Profili", body, footer);
}

// P2P Callback for when native browser screen sharing stops
window.onLocalScreenShareEnded = function () {
    const screenBtn = document.getElementById("voice-screen-btn");
    if (screenBtn) screenBtn.classList.remove("active");
    if (state.mesh) state.mesh.broadcast({ type: "screen_status", sharing: false });
    toast("Ekran paylaşımı durduruldu.", "info");

    // V16: Close Local Preview
    const preview = document.getElementById("local-screen-preview");
    if (preview) preview.classList.add("hidden");
};

function updateRoomStats() {
    const statsEl = document.getElementById("channel-stats");
    if (!statsEl || !state.activeServerId || !state.activeChannelId) return;

    const server = state.servers.find(s => s.id === state.activeServerId);
    if (!server) return;

    const count = server.peer_count || 0;
    statsEl.textContent = `${count} üye`;
}

// Update stats every 10 seconds
setInterval(() => {
    if (state.activeServerId) updateRoomStats();
}, 10000);
async function refreshDiscovery() {
    const grid = document.getElementById("room-list-home");
    if (!grid) return;
    try {
        const res = await fetch(`${API_BASE}/rooms`);
        const rooms = await res.json();
        grid.innerHTML = "";
        rooms.forEach(room => {
            const card = document.createElement("div");
            card.className = "room-card";
            const iconContent = room.icon_url
                ? `<img src="${room.icon_url}" class="room-card-img" />`
                : initials(room.name);

            card.innerHTML = `
                <div class="room-card-icon" style="background:${AVATAR_COLORS[Math.abs(room.room_id.charCodeAt(0)) % AVATAR_COLORS.length]}">
                    ${iconContent}
                </div>
                <div class="room-card-info">
                    <div class="room-card-name">${room.name}</div>
                    <div class="room-card-peers">${room.peer_count} üye</div>
                </div>
            `;
            card.onclick = () => joinServer(room.room_id);
            grid.appendChild(card);
        });
    } catch (e) {
        console.error("Discovery failed", e);
    }
}

async function joinByCode() {
    const code = document.getElementById("join-invite-input").value.trim().toUpperCase();
    if (!code) return;
    try {
        const res = await fetch(`${API_BASE}/rooms/join/${code}`);
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
    document.documentElement.setAttribute("data-theme", themeName);
    localStorage.setItem("scord_theme", themeName);
    toast(`Tema değiştirildi: ${themeName.toUpperCase()}`, "success");
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

// Message Parsing (Rich Media)
function parseMessageText(text) {
    if (!text) return "";

    // YouTube
    const ytRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\s]*)/;
    const ytMatch = text.match(ytRegex);
    if (ytMatch) {
        const id = ytMatch[1];
        return text.replace(ytRegex, `<div class="yt-embed"><iframe src="https://www.youtube.com/embed/${id}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`);
    }

    // Images (more permissive to handle Wikia/Thumbnails)
    const imgRegex = /(https?:\/\/[^\s]+(?:\.png|\.jpg|\.jpeg|\.gif|\.webp)(?:[^\s]*))/i;
    if (imgRegex.test(text)) {
        return text.replace(imgRegex, `<img src="$1" class="chat-img" onclick="window.open('$1', '_blank')" />`);
    }

    // Standard Links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, (url) => `<a href="${url}" target="_blank" class="chat-link">${url}</a>`);
}

// Global initialization
document.addEventListener("DOMContentLoaded", () => {
    console.log("[App] DOM Loaded, initializing...");
    initSetup();
});
