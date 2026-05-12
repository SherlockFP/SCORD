(function () {
  "use strict";
  var _API = typeof API_BASE !== "undefined" ? API_BASE : "/api";

  /* ══════════════════════════════════════════════════════════
     1. DISCORD TARZI SES EFEKTLERİ (Web Audio API)
  ══════════════════════════════════════════════════════════ */

  const SFX_CTX = { ac: null };

  function gctx() {
    if (!SFX_CTX.ac || SFX_CTX.ac.state === "closed") {
      SFX_CTX.ac = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (SFX_CTX.ac.state === "suspended") SFX_CTX.ac.resume();
    return SFX_CTX.ac;
  }

  function sfxVol() {
    const v = parseFloat(localStorage.getItem("scord_sfx_volume") ?? "0.35");
    return isNaN(v) ? 0.35 : Math.max(0, Math.min(1, v));
  }

  function sfxEn() {
    return localStorage.getItem("scord_sfx_enabled") !== "false";
  }

  window.playDiscordSFX = function playDiscordSFX(name) {
    if (!sfxEn()) return;
    try {
      const ac = gctx();
      const vol = sfxVol();
      const t = ac.currentTime;
      const master = ac.createGain();
      master.connect(ac.destination);
      master.gain.setValueAtTime(vol, t);

      function osc(type, freq, start, dur, gv, freqEnd) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t + start);
        if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + start + dur);
        o.connect(g);
        g.connect(master);
        g.gain.setValueAtTime(gv, t + start);
        g.gain.exponentialRampToValueAtTime(0.001, t + start + dur);
        o.start(t + start);
        o.stop(t + start + dur + 0.01);
      }

      function noise(dur, gv) {
        const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        }
        const src = ac.createBufferSource();
        src.buffer = buf;
        const g = ac.createGain();
        src.connect(g);
        g.connect(master);
        g.gain.setValueAtTime(gv, t);
        src.start(t);
      }

      const s = {
        join: () => {
          // Discord join: ascending chirp with noise tail
          osc("sine", 523, 0, 0.15, 0.5);
          osc("sine", 659, 0.08, 0.2, 0.45);
          osc("sine", 784, 0.16, 0.25, 0.3);
          noise(0.1, 0.06);
        },
        leave: () => {
          // Discord leave: descending
          osc("sine", 659, 0, 0.18, 0.45);
          osc("sine", 494, 0.1, 0.2, 0.4);
          osc("sine", 392, 0.2, 0.22, 0.2);
          noise(0.08, 0.05);
        },
        message: () => {
          // Quick pip (Discord message)
          osc("sine", 880, 0, 0.06, 0.25);
          osc("sine", 1100, 0.04, 0.08, 0.15);
        },
        dm: () => {
          // Two-tone ascending
          osc("sine", 880, 0, 0.1, 0.3);
          osc("sine", 1100, 0.07, 0.12, 0.25);
        },
        mute: () => {
          osc("square", 200, 0, 0.12, 0.12, 100);
          noise(0.05, 0.04);
        },
        unmute: () => {
          osc("square", 100, 0, 0.1, 0.12, 200);
          noise(0.04, 0.04);
        },
        mention: () => {
          // Three-tone alert
          osc("sine", 660, 0, 0.1, 0.35);
          osc("sine", 880, 0.07, 0.1, 0.3);
          osc("sine", 1100, 0.14, 0.15, 0.28);
          noise(0.06, 0.05);
        },
        error: () => {
          osc("sawtooth", 220, 0, 0.2, 0.15, 110);
          noise(0.12, 0.06);
        },
        click: () => {
          noise(0.03, 0.06);
        },
        connect: () => {
          // Voice connect - subtle ascending
          osc("sine", 440, 0, 0.08, 0.15);
          osc("sine", 550, 0.06, 0.1, 0.12);
        },
        disconnect: () => {
          osc("sine", 440, 0, 0.1, 0.12, 330);
        },
      };

      const fn = s[name];
      if (fn) fn();
    } catch (e) {}
  };

  const _origPS = window.playSound;
  window.playSound = function (freq, duration, type) {
    if (freq === 523) return window.playDiscordSFX("join");
    if (freq === 330) return window.playDiscordSFX("leave");
    if (freq === 660 || freq === 880) return window.playDiscordSFX("message");
    _origPS && _origPS(freq, duration, type);
  };

  /* ══════════════════════════════════════════════════════════
     2. MESAJ SİLME FİXİ
  ══════════════════════════════════════════════════════════ */

  window.deleteChatMessage = function deleteChatMessage(msg) {
    const server = window.state?.servers?.find((s) => s.id === window.state.activeServerId);
    if (!server) return;
    const channelId = msg.channelId || window.state.activeChannelId;
    if (!channelId) return;
    if (!server.messages) server.messages = {};
    if (!server.messages[channelId]) server.messages[channelId] = [];
    server.messages[channelId] = server.messages[channelId].filter((m) => m.id !== msg.id);
    server.pinned_messages = (server.pinned_messages || []).filter((m) => m.id !== msg.id);
    if (typeof meshBroadcastReliable === "function") {
      meshBroadcastReliable({ type: "msg_delete", payload: { channelId, msgId: msg.id } });
    } else if (window.state?.mesh) {
      window.state.mesh.broadcast({ type: "msg_delete", payload: { channelId, msgId: msg.id } });
    }
    if (_API && window.state.activeServerId) {
      fetch(`${_API}/rooms/${window.state.activeServerId}/messages/${msg.id}?channel_id=${encodeURIComponent(channelId)}`, {
        method: "DELETE",
      }).catch(() => {});
    }
    if (typeof renderMessages === "function") {
      renderMessages(window.state.activeServerId, window.state.activeChannelId);
    }
    if (typeof toast === "function") toast("Mesaj silindi.", "info");
  };

  /* ══════════════════════════════════════════════════════════
     3. SESLİ ODADAN AYRILMA BUĞU
  ══════════════════════════════════════════════════════════ */

  const _origLS = window.leaveServer;
  window.leaveServer = function leaveServer(serverId) {
    if (window.state?.voiceChannelId) {
      try { window.leaveVoiceChannel && window.leaveVoiceChannel(); } catch (e) {}
    }
    window.state.activeChannelId = null;
    window.state.voiceChannelId = null;
    _origLS && _origLS(serverId);
    if (typeof showHomeView === "function") showHomeView();
    if (typeof renderServerRail === "function") renderServerRail();
  };

  /* ══════════════════════════════════════════════════════════
     4. SUNUCU LOGOSU FİXİ
  ══════════════════════════════════════════════════════════ */

  window.updateServerIcon = function updateServerIcon(serverId, url) {
    const trimmed = (url || "").trim();
    if (!trimmed) { typeof toast === "function" && toast("Geçerli bir URL girin.", "error"); return; }
    fetch(`${_API}/rooms/${serverId}/icon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmed }),
    }).then((r) => r.json()).then((data) => {
      if (data.success) {
        const server = window.state?.servers?.find((s) => s.id === serverId);
        if (server) server.icon_url = trimmed;
        typeof renderServerRail === "function" && renderServerRail();
        document.querySelectorAll(`[data-server-id="${serverId}"]`).forEach((el) => {
          if (trimmed) {
            el.innerHTML = `<img src="${trimmed}" alt="" class="rail-guild-img" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;"/>`;
          }
        });
        typeof toast === "function" && toast("Sunucu ikonu güncellendi.", "success");
      } else {
        typeof toast === "function" && toast("İkon güncellenemedi: " + (data.error || "hata"), "error");
      }
    }).catch(() => { typeof toast === "function" && toast("Bağlantı hatası.", "error"); });
  };

  /* ══════════════════════════════════════════════════════════
     5. KANAL SİLME FİXİ
  ══════════════════════════════════════════════════════════ */

  window.deleteChannel = async function deleteChannel(serverId, channelId) {
    const server = window.state?.servers?.find((s) => s.id === serverId);
    if (!server) return;
    const channel = server.channels?.find((c) => c.id === channelId);
    if (!channel) return;
    if (!confirm(`"#${channel.name}" kanalını silmek istediğine emin misin?`)) return;
    try {
      const res = await fetch(`${_API}/rooms/${serverId}/channels/${channelId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        server.channels = server.channels.filter((c) => c.id !== channelId);
        delete (server.messages || {})[channelId];
        delete (server.channel_backgrounds || {})[channelId];
        if (window.state?.mesh) {
          window.state.mesh.broadcast({ type: "channel_delete", payload: { serverId, channelId } });
        }
        if (window.state?.activeChannelId === channelId) {
          const firstText = server.channels.find((c) => c.type === "text");
          if (firstText && typeof showChatView === "function") showChatView(serverId, firstText.id);
          else typeof showHomeView === "function" && showHomeView();
        } else {
          typeof updateChannelSidebar === "function" && updateChannelSidebar(serverId);
        }
        typeof toast === "function" && toast("Kanal silindi.", "success");
      } else {
        typeof toast === "function" && toast("Kanal silinemedi: " + (data.error || "Hata"), "error");
      }
    } catch (e) {
      typeof toast === "function" && toast("Bağlantı hatası.", "error");
    }
  };

  /* ══════════════════════════════════════════════════════════
     6. KANAL ARKA PLANI
  ══════════════════════════════════════════════════════════ */

  function _applyChannelBgImg(channelId, url) {
    if (window.state?.activeChannelId !== channelId) return;
    const target = document.getElementById("messages-area") || document.getElementById("chat-view");
    if (!target) return;
    if (url) {
      target.style.backgroundImage = `linear-gradient(rgba(6,6,16,0.88),rgba(6,6,16,0.94)), url(${JSON.stringify(url)})`;
      target.style.backgroundSize = "cover";
      target.style.backgroundPosition = "center";
      target.style.backgroundAttachment = "local";
    } else {
      target.style.backgroundImage = "";
      target.style.backgroundSize = "";
      target.style.backgroundPosition = "";
      target.style.backgroundAttachment = "";
    }
  }

  window.setChannelBackground = async function setChannelBackground(serverId, channelId, url) {
    try {
      const res = await fetch(`${_API}/rooms/${serverId}/channel_background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, url: url || null }),
      });
      const data = await res.json();
      if (data.success) {
        const server = window.state?.servers?.find((s) => s.id === serverId);
        if (server) {
          if (!server.channel_backgrounds) server.channel_backgrounds = {};
          if (url) server.channel_backgrounds[channelId] = url;
          else delete server.channel_backgrounds[channelId];
        }
        _applyChannelBgImg(channelId, url || null);
        typeof toast === "function" && toast("Kanal arka planı güncellendi.", "success");
      }
    } catch (e) {
      typeof toast === "function" && toast("Bağlantı hatası.", "error");
    }
  };

  const _origSCV = window.showChatView;
  window.showChatView = function showChatView(serverId, channelId) {
    const result = _origSCV && _origSCV(serverId, channelId);
    try {
      const server = window.state?.servers?.find((s) => s.id === serverId);
      const bg = server?.channel_backgrounds?.[channelId];
      _applyChannelBgImg(channelId, bg || null);
    } catch (e) {}
    return result;
  };

  /* ══════════════════════════════════════════════════════════
     7. DM KAPATMA / SİLME
  ══════════════════════════════════════════════════════════ */

  window.closeDMConversation = function closeDMConversation(peerId) {
    const overlay = document.getElementById("dm-overlay");
    if (overlay) overlay.classList.add("hidden");
    if (window.state?.activeDM === peerId) window.state.activeDM = null;
  };

  window.deleteDMConversation = function deleteDMConversation(peerId, username) {
    if (!confirm(`@${username} ile olan DM geçmişini silmek istediğine emin misin?`)) return;
    if (!window.state) return;
    if (!window.state.dms) window.state.dms = {};
    delete window.state.dms[peerId];
    try {
      const stored = JSON.parse(localStorage.getItem("scord_dms") || "{}");
      delete stored[peerId];
      localStorage.setItem("scord_dms", JSON.stringify(stored));
    } catch (e) {}
    window.closeDMConversation(peerId);
    typeof toast === "function" && toast("DM sohbeti silindi.", "info");
  };

  /* Arkadaş silme */
  window.removeFriend = function removeFriend(peerId) {
    if (!window.state) return;
    window.state.friends = (window.state.friends || []).filter((f) => f.peerId !== peerId);
    localStorage.setItem("scord_friends", JSON.stringify(window.state.friends));
    if (!window.state.activeServerId && typeof renderHomeSidebar === "function") renderHomeSidebar();
    typeof toast === "function" && toast("Arkadaş silindi.", "info");
  };

  /* DM overlay'ine silme butonu ekle */
  function enhanceDMOverlay() {
    const header = document.querySelector(".dm-header");
    if (!header || header.querySelector(".dm-delete-btn")) return;
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "dm-close-btn dm-delete-btn";
    deleteBtn.title = "Sohbeti sil";
    deleteBtn.style.cssText = "margin-right:4px;color:var(--red,#ed4245);opacity:0.7;font-size:14px;padding:4px 8px;border-radius:4px;border:none;background:rgba(255,255,255,0.05);cursor:pointer;";
    deleteBtn.textContent = "🗑";
    deleteBtn.addEventListener("click", () => {
      const peerId = window.state?.activeDM;
      if (!peerId) return;
      window.deleteDMConversation(peerId, peerId);
    });
    const closeBtn = document.getElementById("dm-close-btn");
    if (closeBtn) header.insertBefore(deleteBtn, closeBtn);
    else header.appendChild(deleteBtn);
  }

  /* DM sidebar'ında close/delete ve arkadaş sil butonları */
  function enhanceDMSidebar() {
    document.querySelectorAll(".dm-sidebar-item").forEach((item) => {
      if (item.querySelector(".dm-item-actions")) return;
      const peerId = item.dataset.peerId;
      if (!peerId) return;
      const actions = document.createElement("div");
      actions.className = "dm-item-actions";
      actions.style.cssText = "display:none;gap:4px;margin-left:auto;flex-shrink:0;";
      const closeBtn = document.createElement("button");
      closeBtn.textContent = "✕";
      closeBtn.title = "DM'yi kapat";
      closeBtn.style.cssText = "width:20px;height:20px;border-radius:4px;border:none;background:rgba(255,255,255,0.08);color:var(--text-muted);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;";
      closeBtn.addEventListener("click", (e) => { e.stopPropagation(); window.closeDMConversation(peerId); });
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑";
      delBtn.title = "DM'yi sil";
      delBtn.style.cssText = "width:20px;height:20px;border-radius:4px;border:none;background:rgba(255,255,255,0.08);color:var(--red);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;";
      delBtn.addEventListener("click", (e) => { e.stopPropagation(); window.deleteDMConversation(peerId, peerId); });
      const rmFriendBtn = document.createElement("button");
      rmFriendBtn.textContent = "✕";
      rmFriendBtn.title = "Arkadaştan çıkar";
      rmFriendBtn.style.cssText = "width:20px;height:20px;border-radius:4px;border:none;background:rgba(237,66,69,0.15);color:var(--red);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;";
      rmFriendBtn.addEventListener("click", (e) => { e.stopPropagation(); window.removeFriend(peerId); });
      actions.appendChild(closeBtn);
      actions.appendChild(delBtn);
      actions.appendChild(rmFriendBtn);
      item.appendChild(actions);
      item.addEventListener("mouseenter", () => { actions.style.display = "flex"; });
      item.addEventListener("mouseleave", () => { actions.style.display = "none"; });
    });
  }

  /* ══════════════════════════════════════════════════════════
     8. SUNUCU İZİNLERİ KAYIT
  ══════════════════════════════════════════════════════════ */

  function patchSaveServerSettings() {
    const _orig = window.saveServerSettings;
    if (!_orig) return;
    window.saveServerSettings = function saveServerSettings(...args) {
      const result = _orig.apply(this, args);
      const server = window.state?.servers?.find((s) => s.id === window.state.activeServerId);
      if (server) {
        if (typeof sendServerEvent === "function") {
          sendServerEvent({ type: "role_update", roles: server.roles || {}, peer_roles: server.peer_roles || {} });
          sendServerEvent({ type: "permission_update", channel_permissions: server.channel_permissions || {} });
        }
        if (window.state?.mesh) {
          window.state.mesh.broadcast({
            type: "server_update",
            payload: {
              id: server.id, name: server.name, roles: server.roles,
              peer_roles: server.peer_roles, channel_permissions: server.channel_permissions || {},
              icon_url: server.icon_url, inviteCode: server.inviteCode,
            },
          });
        }
      }
      return result;
    };
  }

  /* ══════════════════════════════════════════════════════════
     9. WS MESAJ HANDLER PATCH
  ══════════════════════════════════════════════════════════ */

  function patchWSHandler() {
    const _orig = window.handleServerMessage;
    if (!_orig) return;
    window.handleServerMessage = function handleServerMessage(data, ...rest) {
      if (data?.type === "channel_background_update") {
        const server = window.state?.servers?.find((s) => s.id === window.state.activeServerId);
        if (server) {
          if (!server.channel_backgrounds) server.channel_backgrounds = {};
          if (data.url) server.channel_backgrounds[data.channelId] = data.url;
          else delete server.channel_backgrounds[data.channelId];
          if (data.channel_backgrounds) server.channel_backgrounds = data.channel_backgrounds;
          _applyChannelBgImg(data.channelId, data.url || null);
        }
        return;
      }
      return _orig.call(this, data, ...rest);
    };
  }

  /* ══════════════════════════════════════════════════════════
     10. PERFORMANS — GPU + 60FPS
  ══════════════════════════════════════════════════════════ */

  function applyPerf() {
    if (document.getElementById("scord-perf-fixes")) return;
    const style = document.createElement("style");
    style.id = "scord-perf-fixes";
    style.textContent = `
      html { scroll-behavior: smooth; }
      .msg-row, .channel-item, .member-item, .server-rail,
      .channel-sidebar, .main-content, .voice-participant-card,
      .modal, .dm-sheet, .toast, .ctx-menu {
        will-change: transform;
        transform: translateZ(0);
        backface-visibility: hidden;
      }
      .messages-area, .channel-list, .members-list, #members-list, .dm-body {
        scroll-behavior: smooth;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }
      *::-webkit-scrollbar { width: 4px; height: 4px; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 4px; }
      .toast, .ctx-menu, .modal-backdrop, .dm-overlay {
        transition: opacity 0.1s ease, transform 0.1s ease;
      }
      body {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }
      .server-rail { contain: layout style; }
      .channel-sidebar { contain: layout; }
    `;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════
     11. CHAT STİL CSS
  ══════════════════════════════════════════════════════════ */

  function applyChatStyle() {
    if (document.getElementById("scord-chat-style-fix")) return;
    const s = document.createElement("style");
    s.id = "scord-chat-style-fix";
    s.textContent = `
      html[data-scord-chat-style="comfortable"] .msg-row { margin-bottom: 12px !important; }
      html[data-scord-chat-style="comfortable"] .msg-bubble { padding: 14px 18px !important; border-radius: 18px !important; }
      html[data-scord-chat-style="cozy"] .msg-row { margin-bottom: 6px !important; }
      html[data-scord-chat-style="cozy"] .msg-bubble { padding: 10px 14px !important; border-radius: 12px !important; }
      html[data-scord-chat-style="compact"] .msg-row { margin-bottom: 1px !important; }
      html[data-scord-chat-style="compact"] .msg-bubble { padding: 4px 10px !important; border-radius: 6px !important; }
      html[data-scord-chat-style="compact"] .msg-avatar { width: 24px !important; height: 24px !important; }
      html[data-scord-chat-style="compact"] .msg-author { font-size: 11px !important; }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     13. SES TETİKLEYİCİLERİ
  ══════════════════════════════════════════════════════════ */

  function hookSounds() {
    const _oj = window.joinVoiceChannel;
    if (_oj) {
      window.joinVoiceChannel = function (...args) {
        const r = _oj.apply(this, args);
        setTimeout(() => window.playDiscordSFX("join"), 300);
        return r;
      };
    }
    const _ol = window.leaveVoiceChannel;
    if (_ol) {
      window.leaveVoiceChannel = function (...args) {
        window.playDiscordSFX("leave");
        return _ol.apply(this, args);
      };
    }
    const micBtn = document.getElementById("mic-toggle-btn");
    if (micBtn) {
      micBtn.addEventListener("click", () => {
        setTimeout(() => {
          window.playDiscordSFX(window.state?.muted ? "mute" : "unmute");
        }, 50);
      });
    }
    const sentinel = setInterval(() => {
      const sendBtn = document.getElementById("send-btn");
      const chatInput = document.getElementById("chat-input");
      const dmSendBtn = document.getElementById("dm-send-btn");
      const dmInput = document.getElementById("dm-input");
      if (sendBtn && chatInput && dmSendBtn && dmInput) {
        clearInterval(sentinel);
        sendBtn.addEventListener("click", () => window.playDiscordSFX("message"));
        chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) window.playDiscordSFX("message"); });
        dmSendBtn.addEventListener("click", () => window.playDiscordSFX("dm"));
        dmInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) window.playDiscordSFX("dm"); });
      }
    }, 500);
  }

  /* ══════════════════════════════════════════════════════════
     14. MÜZİK BOTU FİX — Herkese senkron + preview kapat
  ══════════════════════════════════════════════════════════ */

  function patchMusicBot() {
    // Sesli kanaldan çıkınca müziği durdur
    const _origLVC = window.leaveVoiceChannel;
    if (_origLVC) {
      window.leaveVoiceChannel = function (...args) {
        if (typeof stopMusicBot === "function") stopMusicBot();
        return _origLVC.apply(this, args);
      };
    }

    // Müzik başlatma broadcast'ini düzelt — herkese ulaşsın
    const _origPMBU = window.playMusicBotByUrl;
    if (_origPMBU) {
      window.playMusicBotByUrl = function (raw) {
        const result = _origPMBU.apply(this, arguments);
        // Broadcast'i tekrar gönder (güvence)
        var videoId = typeof extractYouTubeVideoId === "function" ? extractYouTubeVideoId(raw) : null;
        if (videoId && window.state?.mesh && window.state?.voiceChannelId) {
          window.state.mesh.broadcast({
            type: "music_play",
            videoId: videoId,
            startAt: 0,
            voiceChannelId: window.state.voiceChannelId,
          });
        }
        return result;
      };
    }

    // Müzik player'ına kapatma/küçültme butonu ekle
    function addMusicDockCloseBtn() {
      var dock = document.getElementById("music-player-dock");
      if (!dock || dock.querySelector(".mdock-close-btn")) return;
      var closeBtn = document.createElement("button");
      closeBtn.className = "mdock-close-btn";
      closeBtn.textContent = "✕";
      closeBtn.title = "Kapat";
      closeBtn.style.cssText = "position:absolute;top:2px;right:2px;z-index:999;width:22px;height:22px;border-radius:50%;border:none;background:rgba(0,0,0,0.6);color:#fff;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;";
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        dock.classList.remove("active");
        dock.setAttribute("aria-hidden", "true");
      });
      dock.style.position = "relative";
      dock.appendChild(closeBtn);
    }

    var dockObs = new MutationObserver(function () {
      var dock = document.getElementById("music-player-dock");
      if (dock && !dock.querySelector(".mdock-close-btn")) addMusicDockCloseBtn();
    });
    dockObs.observe(document.body, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════
     15. MESAJ SİLME İZNİ — Herkes kendi mesajını silebilsin
  ══════════════════════════════════════════════════════════ */

  function patchMessageDeletePermission() {
    // showMsgContextMenu içinde izin kontrolünü gevşet
    const _origSMC = window.showMsgContextMenu;
    if (!_origSMC) return;
    window.showMsgContextMenu = function (msg, x, y) {
      // Orijinal fonksiyonu çağır, ama "Mesajı Sil" butonu herkes için görünsün
      var server = window.state?.servers?.find(function (s) { return s.id === window.state.activeServerId; });
      if (!server) return _origSMC(msg, x, y);

      var myRole = "member";
      if (server.ownerId === window.state.peerId) myRole = "owner";
      else if (server.peer_roles?.[window.state.peerId] === "admin") myRole = "admin";
      else if (server.peer_roles?.[window.state.peerId] === "mod") myRole = "mod";

      var canMod = ["owner", "admin", "mod"].indexOf(myRole) !== -1;
      var isAuthor = msg.authorId === window.state.peerId;

      // Herkes kendi mesajını silebilir veya mod/herkesin mesajını silebilir
      if (!isAuthor && !canMod) {
        return _origSMC(msg, x, y);
      }

      _origSMC(msg, x, y);

      // Eğer menü zaten varsa ve silme butonu yoksa ekle
      var menu = document.getElementById("ctx-menu");
      if (!menu) return;

      // Silme butonu zaten varsa çık
      if (menu.querySelector('[data-action="delete-msg"]')) return;

      // Silme butonunu ekle
      var delItem = document.createElement("div");
      delItem.className = "ctx-item danger";
      delItem.dataset.action = "delete-msg";
      delItem.innerHTML = '<span class="ctx-icon">🗑️</span>Mesajı Sil';
      delItem.onclick = function () {
        document.getElementById("ctx-menu")?.remove();
        if (typeof window.deleteChatMessage === "function") window.deleteChatMessage(msg);
      };
      menu.appendChild(delItem);
    };
  }

  /* ══════════════════════════════════════════════════════════
     16. ARKADAŞI ARA (Doğrudan arama)
  ══════════════════════════════════════════════════════════ */

  function patchDirectCall() {
    var _origCMC = window.showContextMenu;
    if (!_origCMC) return;
    window.showContextMenu = function (peerId, username, x, y) {
      _origCMC.apply(this, arguments);

      // Menüye "Direkt Ara" butonunu ekle (sesli arama için)
      var menu = document.getElementById("ctx-menu");
      if (!menu) return;
      if (menu.querySelector('[data-action="direct-call"]')) return;

      var callItem = document.createElement("div");
      callItem.className = "ctx-item";
      callItem.dataset.action = "direct-call";
      callItem.innerHTML = '<span class="ctx-icon">📞</span>Direkt Ara (P2P)';
      callItem.onclick = function () {
        document.getElementById("ctx-menu")?.remove();
        if (typeof window.startDirectCall === "function") {
          window.startDirectCall(peerId);
        } else {
          // Fallback: DM'den sesli arama başlat
          var text = "/call " + peerId;
          var input = document.getElementById("chat-input") || document.getElementById("dm-input");
          if (input) { input.value = text; input.dispatchEvent(new Event("input")); }
          typeof toast === "function" && toast("@" + username + " aranıyor... (P2P çağrı)", "info");
        }
      };

      // İlk "Özel Mesaj" item'ından sonra ekle
      var firstItem = menu.querySelector(".ctx-item");
      if (firstItem && firstItem.parentNode) {
        firstItem.parentNode.insertBefore(callItem, firstItem.nextSibling);
      } else {
        menu.insertBefore(callItem, menu.firstChild);
      }
    };
  }

  /* ══════════════════════════════════════════════════════════
     17. PERFORMANS — renderMessages debounce
  ══════════════════════════════════════════════════════════ */

  function patchPerformance() {
    var _debounceTimers = {};

    // renderMessages'ı debounce ile sar
    var _origRM = window.renderMessages;
    if (_origRM) {
      window.renderMessages = function (serverId, channelId) {
        var key = serverId + "_" + channelId;
        if (_debounceTimers[key]) clearTimeout(_debounceTimers[key]);
        _debounceTimers[key] = setTimeout(function () {
          _origRM(serverId, channelId);
          delete _debounceTimers[key];
        }, 16); // ~60fps
      };
    }

    // updateChannelSidebar'ı da debounce yap
    var _origUCS = window.updateChannelSidebar;
    if (_origUCS) {
      window.updateChannelSidebar = function (serverId) {
        if (_debounceTimers["ucs_" + serverId]) clearTimeout(_debounceTimers["ucs_" + serverId]);
        _debounceTimers["ucs_" + serverId] = setTimeout(function () {
          _origUCS(serverId);
          delete _debounceTimers["ucs_" + serverId];
        }, 16);
      };
    }

    // updateMembersPanel'i debounce yap
    var _origUMP = window.updateMembersPanel;
    if (_origUMP) {
      window.updateMembersPanel = function (serverId) {
        if (_debounceTimers["ump_" + serverId]) clearTimeout(_debounceTimers["ump_" + serverId]);
        _debounceTimers["ump_" + serverId] = setTimeout(function () {
          _origUMP(serverId);
          delete _debounceTimers["ump_" + serverId];
        }, 16);
      };
    }

    // Content-visibility ile görünmeyen mesajları ertele (lazy render)
    var lazyStyle = document.createElement("style");
    lazyStyle.id = "scord-lazy-render";
    lazyStyle.textContent = `
      .msg-row { content-visibility: auto; contain-intrinsic-size: 60px; }
      .msg-row.msg-row--editing { content-visibility: visible; }
      .messages-area > div { contain: layout style; }
    `;
    document.head.appendChild(lazyStyle);
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */

  function init() {
    applyPerf();
    applyChatStyle();
    function ready() {
      patchSaveServerSettings();
      patchWSHandler();
      hookSounds();
      enhanceDMOverlay();
      patchMusicBot();
      patchMessageDeletePermission();
      patchDirectCall();
      patchPerformance();
      const obs = new MutationObserver(() => {
        enhanceDMOverlay();
        enhanceDMSidebar();
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setInterval(enhanceDMSidebar, 2000);
      if (typeof window.applyChatCustomization === "function") window.applyChatCustomization();
      console.log("[Shercord Fixes] Tum duzeltmeler yuklendi.");
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
    else ready();
  }

  init();
})();
