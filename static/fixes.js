(function () {
  "use strict";
  var _API = typeof API_BASE !== "undefined" ? API_BASE : "/api";

  /* ══════════════════════════════════════════════════════════
     1. DISCORD TARZI SES EFEKTLERİ
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
    var v = parseFloat(localStorage.getItem("scord_sfx_volume") ?? "0.35");
    return isNaN(v) ? 0.35 : Math.max(0, Math.min(1, v));
  }

  function sfxEn() { return localStorage.getItem("scord_sfx_enabled") !== "false"; }

  window.playDiscordSFX = function playDiscordSFX(name) {
    if (!sfxEn()) return;
    try {
      var ac = gctx();
      var vol = sfxVol();
      var t = ac.currentTime;
      var master = ac.createGain();
      master.connect(ac.destination);
      master.gain.setValueAtTime(vol, t);

      function osc(type, freq, start, dur, gv, freqEnd) {
        var o = ac.createOscillator();
        var g = ac.createGain();
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
        var buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * dur), ac.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        var src = ac.createBufferSource();
        src.buffer = buf;
        var g = ac.createGain();
        src.connect(g);
        g.connect(master);
        g.gain.setValueAtTime(gv, t);
        src.start(t);
      }

      var s = {
        join: function () { osc("sine", 523, 0, 0.15, 0.5); osc("sine", 659, 0.08, 0.2, 0.45); osc("sine", 784, 0.16, 0.25, 0.3); noise(0.1, 0.06); },
        leave: function () { osc("sine", 659, 0, 0.18, 0.45); osc("sine", 494, 0.1, 0.2, 0.4); osc("sine", 392, 0.2, 0.22, 0.2); noise(0.08, 0.05); },
        message: function () { osc("sine", 880, 0, 0.06, 0.25); osc("sine", 1100, 0.04, 0.08, 0.15); },
        dm: function () { osc("sine", 880, 0, 0.1, 0.3); osc("sine", 1100, 0.07, 0.12, 0.25); },
        mute: function () { osc("square", 200, 0, 0.12, 0.12, 100); noise(0.05, 0.04); },
        unmute: function () { osc("square", 100, 0, 0.1, 0.12, 200); noise(0.04, 0.04); },
        mention: function () { osc("sine", 660, 0, 0.1, 0.35); osc("sine", 880, 0.07, 0.1, 0.3); osc("sine", 1100, 0.14, 0.15, 0.28); noise(0.06, 0.05); },
        error: function () { osc("sawtooth", 220, 0, 0.2, 0.15, 110); noise(0.12, 0.06); },
        click: function () { noise(0.03, 0.06); },
        connect: function () { osc("sine", 440, 0, 0.08, 0.15); osc("sine", 550, 0.06, 0.1, 0.12); },
        disconnect: function () { osc("sine", 440, 0, 0.1, 0.12, 330); },
      };
      var fn = s[name];
      if (fn) fn();
    } catch (e) {}
  };

  var _origPS = window.playSound;
  window.playSound = function (freq, duration, type) {
    if (freq === 523) return window.playDiscordSFX("join");
    if (freq === 330) return window.playDiscordSFX("leave");
    if (freq === 660 || freq === 880) return window.playDiscordSFX("message");
    if (_origPS) _origPS(freq, duration, type);
  };

  /* ══════════════════════════════════════════════════════════
     2. MESAJ SİLME FİXİ
  ══════════════════════════════════════════════════════════ */

  window.deleteChatMessage = function deleteChatMessage(msg) {
    var server = window.state?.servers?.find(function (s) { return s.id === window.state.activeServerId; });
    if (!server) return;
    var channelId = msg.channelId || window.state.activeChannelId;
    if (!channelId) return;
    if (!server.messages) server.messages = {};
    if (!server.messages[channelId]) server.messages[channelId] = [];
    server.messages[channelId] = server.messages[channelId].filter(function (m) { return m.id !== msg.id; });
    server.pinned_messages = (server.pinned_messages || []).filter(function (m) { return m.id !== msg.id; });
    if (typeof meshBroadcastReliable === "function") {
      meshBroadcastReliable({ type: "msg_delete", payload: { channelId: channelId, msgId: msg.id } });
    } else if (window.state?.mesh) {
      window.state.mesh.broadcast({ type: "msg_delete", payload: { channelId: channelId, msgId: msg.id } });
    }
    if (_API && window.state.activeServerId) {
      fetch(_API + "/rooms/" + window.state.activeServerId + "/messages/" + msg.id + "?channel_id=" + encodeURIComponent(channelId), { method: "DELETE" }).catch(function () {});
    }
    if (typeof renderMessages === "function") renderMessages(window.state.activeServerId, window.state.activeChannelId);
    if (typeof toast === "function") toast("Mesaj silindi.", "info");
  };

  /* ══════════════════════════════════════════════════════════
     3. SESLİ ODADAN AYRILMA BUĞU
  ══════════════════════════════════════════════════════════ */

  var _origLS = window.leaveServer;
  window.leaveServer = function leaveServer(serverId) {
    if (window.state?.voiceChannelId) {
      try { if (window.leaveVoiceChannel) window.leaveVoiceChannel(); } catch (e) {}
    }
    window.state.activeChannelId = null;
    window.state.voiceChannelId = null;
    if (_origLS) _origLS(serverId);
    if (typeof showHomeView === "function") showHomeView();
    if (typeof renderServerRail === "function") renderServerRail();
  };

  /* ══════════════════════════════════════════════════════════
     4. SUNUCU LOGOSU FİXİ
  ══════════════════════════════════════════════════════════ */

  window.updateServerIcon = function updateServerIcon(serverId, url) {
    var trimmed = (url || "").trim();
    if (!trimmed) { if (typeof toast === "function") toast("Geçerli bir URL girin.", "error"); return; }
    fetch(_API + "/rooms/" + serverId + "/icon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmed }),
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.success) {
        var server = window.state?.servers?.find(function (s) { return s.id === serverId; });
        if (server) server.icon_url = trimmed;
        if (typeof renderServerRail === "function") renderServerRail();
        if (typeof toast === "function") toast("Sunucu ikonu güncellendi.", "success");
      } else {
        if (typeof toast === "function") toast("İkon güncellenemedi: " + (data.error || "hata"), "error");
      }
    }).catch(function () { if (typeof toast === "function") toast("Bağlantı hatası.", "error"); });
  };

  /* ══════════════════════════════════════════════════════════
     5. KANAL SİLME FİXİ
  ══════════════════════════════════════════════════════════ */

  window.deleteChannel = async function deleteChannel(serverId, channelId) {
    var server = window.state?.servers?.find(function (s) { return s.id === serverId; });
    if (!server) return;
    var channel = server.channels?.find(function (c) { return c.id === channelId; });
    if (!channel) return;
    if (!confirm('"' + channel.name + '" kanalını silmek istediğine emin misin?')) return;
    try {
      var res = await fetch(_API + "/rooms/" + serverId + "/channels/" + channelId, { method: "DELETE" });
      var data = await res.json();
      if (data.success) {
        server.channels = server.channels.filter(function (c) { return c.id !== channelId; });
        delete (server.messages || {})[channelId];
        delete (server.channel_backgrounds || {})[channelId];
        if (window.state?.mesh) window.state.mesh.broadcast({ type: "channel_delete", payload: { serverId: serverId, channelId: channelId } });
        if (window.state?.activeChannelId === channelId) {
          var firstText = server.channels.find(function (c) { return c.type === "text"; });
          if (firstText && typeof showChatView === "function") showChatView(serverId, firstText.id);
          else if (typeof showHomeView === "function") showHomeView();
        } else {
          if (typeof updateChannelSidebar === "function") updateChannelSidebar(serverId);
        }
        if (typeof toast === "function") toast("Kanal silindi.", "success");
      } else {
        if (typeof toast === "function") toast("Kanal silinemedi: " + (data.error || "Hata"), "error");
      }
    } catch (e) {
      if (typeof toast === "function") toast("Bağlantı hatası.", "error");
    }
  };

  /* ══════════════════════════════════════════════════════════
     6. KANAL ARKA PLANI
  ══════════════════════════════════════════════════════════ */

  function _applyChannelBgImg(channelId, url) {
    if (window.state?.activeChannelId !== channelId) return;
    var target = document.getElementById("messages-area") || document.getElementById("chat-view");
    if (!target) return;
    if (url) {
      target.style.backgroundImage = "linear-gradient(rgba(6,6,16,0.88),rgba(6,6,16,0.94)), url(" + JSON.stringify(url) + ")";
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
      var res = await fetch(_API + "/rooms/" + serverId + "/channel_background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: channelId, url: url || null }),
      });
      var data = await res.json();
      if (data.success) {
        var server = window.state?.servers?.find(function (s) { return s.id === serverId; });
        if (server) {
          if (!server.channel_backgrounds) server.channel_backgrounds = {};
          if (url) server.channel_backgrounds[channelId] = url;
          else delete server.channel_backgrounds[channelId];
        }
        _applyChannelBgImg(channelId, url || null);
        if (typeof toast === "function") toast("Kanal arka planı güncellendi.", "success");
      }
    } catch (e) {
      if (typeof toast === "function") toast("Bağlantı hatası.", "error");
    }
  };

  var _origSCV = window.showChatView;
  if (_origSCV) {
    window.showChatView = function showChatView(serverId, channelId) {
      var result = _origSCV(serverId, channelId);
      try {
        var server = window.state?.servers?.find(function (s) { return s.id === serverId; });
        var bg = server?.channel_backgrounds?.[channelId];
        _applyChannelBgImg(channelId, bg || null);
      } catch (e) {}
      return result;
    };
  }

  /* ══════════════════════════════════════════════════════════
     7. DM KAPATMA / SİLME / ARKADAŞ SİLME
  ══════════════════════════════════════════════════════════ */

  window.closeDMConversation = function closeDMConversation(peerId) {
    var overlay = document.getElementById("dm-overlay");
    if (overlay) overlay.classList.add("hidden");
    if (window.state?.activeDM === peerId) window.state.activeDM = null;
  };

  window.deleteDMConversation = function deleteDMConversation(peerId, username) {
    if (!confirm("@" + username + " ile olan DM geçmişini silmek istediğine emin misin?")) return;
    if (!window.state) return;
    if (!window.state.dms) window.state.dms = {};
    delete window.state.dms[peerId];
    try {
      var stored = JSON.parse(localStorage.getItem("scord_dms") || "{}");
      delete stored[peerId];
      localStorage.setItem("scord_dms", JSON.stringify(stored));
    } catch (e) {}
    window.closeDMConversation(peerId);
    if (typeof toast === "function") toast("DM sohbeti silindi.", "info");
  };

  window.removeFriend = function removeFriend(peerId) {
    if (!window.state) return;
    window.state.friends = (window.state.friends || []).filter(function (f) { return f.peerId !== peerId; });
    localStorage.setItem("scord_friends", JSON.stringify(window.state.friends));
    if (!window.state.activeServerId && typeof renderHomeSidebar === "function") renderHomeSidebar();
    if (typeof toast === "function") toast("Arkadaş silindi.", "info");
  };

  function enhanceDMOverlay() {
    var header = document.querySelector(".dm-header");
    if (!header || header.querySelector(".dm-delete-btn")) return;
    var deleteBtn = document.createElement("button");
    deleteBtn.className = "dm-close-btn dm-delete-btn";
    deleteBtn.title = "Sohbeti sil";
    deleteBtn.style.cssText = "margin-right:4px;color:var(--red,#ed4245);opacity:0.7;font-size:14px;padding:4px 8px;border-radius:4px;border:none;background:rgba(255,255,255,0.05);cursor:pointer;";
    deleteBtn.textContent = "\uD83D\uDDD1";
    deleteBtn.addEventListener("click", function () {
      var peerId = window.state?.activeDM;
      if (!peerId) return;
      window.deleteDMConversation(peerId, peerId);
    });
    var closeBtn = document.getElementById("dm-close-btn");
    if (closeBtn) header.insertBefore(deleteBtn, closeBtn);
    else header.appendChild(deleteBtn);
  }

  function enhanceDMSidebar() {
    document.querySelectorAll(".dm-sidebar-item").forEach(function (item) {
      if (item.querySelector(".dm-item-actions")) return;
      var peerId = item.dataset.peerId;
      if (!peerId) return;
      var actions = document.createElement("div");
      actions.className = "dm-item-actions";
      actions.style.cssText = "display:none;gap:4px;margin-left:auto;flex-shrink:0;";
      var closeBtn = document.createElement("button");
      closeBtn.textContent = "\u2715";
      closeBtn.title = "DM'yi kapat";
      closeBtn.style.cssText = "width:20px;height:20px;border-radius:4px;border:none;background:rgba(255,255,255,0.08);color:var(--text-muted);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;";
      closeBtn.addEventListener("click", function (e) { e.stopPropagation(); window.closeDMConversation(peerId); });
      var delBtn = document.createElement("button");
      delBtn.textContent = "\uD83D\uDDD1";
      delBtn.title = "DM'yi sil";
      delBtn.style.cssText = "width:20px;height:20px;border-radius:4px;border:none;background:rgba(255,255,255,0.08);color:var(--red);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;";
      delBtn.addEventListener("click", function (e) { e.stopPropagation(); window.deleteDMConversation(peerId, peerId); });
      var rmFriendBtn = document.createElement("button");
      rmFriendBtn.textContent = "\u2715";
      rmFriendBtn.title = "Arkadaştan çıkar";
      rmFriendBtn.style.cssText = "width:20px;height:20px;border-radius:4px;border:none;background:rgba(237,66,69,0.15);color:var(--red);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;";
      rmFriendBtn.addEventListener("click", function (e) { e.stopPropagation(); window.removeFriend(peerId); });
      actions.appendChild(closeBtn);
      actions.appendChild(delBtn);
      actions.appendChild(rmFriendBtn);
      item.appendChild(actions);
      item.addEventListener("mouseenter", function () { actions.style.display = "flex"; });
      item.addEventListener("mouseleave", function () { actions.style.display = "none"; });
    });
  }

  /* ══════════════════════════════════════════════════════════
     8. SUNUCU İZİNLERİ KAYIT
  ══════════════════════════════════════════════════════════ */

  function patchSaveServerSettings() {
    var _orig = window.saveServerSettings;
    if (!_orig) return;
    window.saveServerSettings = function saveServerSettings() {
      var result = _orig.apply(this, arguments);
      var server = window.state?.servers?.find(function (s) { return s.id === window.state.activeServerId; });
      if (server) {
        if (typeof sendServerEvent === "function") {
          sendServerEvent({ type: "role_update", roles: server.roles || {}, peer_roles: server.peer_roles || {} });
          sendServerEvent({ type: "permission_update", channel_permissions: server.channel_permissions || {} });
        }
        if (window.state?.mesh) {
          window.state.mesh.broadcast({
            type: "server_update",
            payload: { id: server.id, name: server.name, roles: server.roles, peer_roles: server.peer_roles, channel_permissions: server.channel_permissions || {}, icon_url: server.icon_url, inviteCode: server.inviteCode },
          });
        }
      }
      return result;
    };
  }

  /* ══════════════════════════════════════════════════════════
     9. WS MESAJ HANDLER
  ══════════════════════════════════════════════════════════ */

  function patchWSHandler() {
    var _orig = window.handleServerMessage;
    if (!_orig) return;
    window.handleServerMessage = function handleServerMessage(data) {
      if (data?.type === "channel_background_update") {
        var server = window.state?.servers?.find(function (s) { return s.id === window.state.activeServerId; });
        if (server) {
          if (!server.channel_backgrounds) server.channel_backgrounds = {};
          if (data.url) server.channel_backgrounds[data.channelId] = data.url;
          else delete server.channel_backgrounds[data.channelId];
          if (data.channel_backgrounds) server.channel_backgrounds = data.channel_backgrounds;
          _applyChannelBgImg(data.channelId, data.url || null);
        }
        return;
      }
      return _orig.apply(this, arguments);
    };
  }

  /* ══════════════════════════════════════════════════════════
     10. PERFORMANS + GPU + 60FPS
  ══════════════════════════════════════════════════════════ */

  function applyPerf() {
    if (document.getElementById("scord-perf-fixes")) return;
    var style = document.createElement("style");
    style.id = "scord-perf-fixes";
    style.textContent = [
      "html{scroll-behavior:smooth}",
      ".msg-row,.channel-item,.member-item,.server-rail,.channel-sidebar,.main-content,.voice-participant-card,.modal,.dm-sheet,.toast,.ctx-menu{will-change:transform;transform:translateZ(0);backface-visibility:hidden}",
      ".messages-area,.channel-list,.members-list,#members-list,.dm-body{scroll-behavior:smooth;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}",
      "*::-webkit-scrollbar{width:4px;height:4px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}",
      ".toast,.ctx-menu,.modal-backdrop,.dm-overlay{transition:opacity 0.1s ease,transform 0.1s ease}",
      "body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}",
      ".server-rail{contain:layout style}.channel-sidebar{contain:layout}",
      ".msg-row{content-visibility:auto;contain-intrinsic-size:60px}",
    ].join("");
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════
     11. CHAT STİL CSS
  ══════════════════════════════════════════════════════════ */

  function applyChatStyle() {
    if (document.getElementById("scord-chat-style-fix")) return;
    var s = document.createElement("style");
    s.id = "scord-chat-style-fix";
    s.textContent = [
      'html[data-scord-chat-style="comfortable"] .msg-row{margin-bottom:12px!important}',
      'html[data-scord-chat-style="comfortable"] .msg-bubble{padding:14px 18px!important;border-radius:18px!important}',
      'html[data-scord-chat-style="cozy"] .msg-row{margin-bottom:6px!important}',
      'html[data-scord-chat-style="cozy"] .msg-bubble{padding:10px 14px!important;border-radius:12px!important}',
      'html[data-scord-chat-style="compact"] .msg-row{margin-bottom:1px!important}',
      'html[data-scord-chat-style="compact"] .msg-bubble{padding:4px 10px!important;border-radius:6px!important}',
      'html[data-scord-chat-style="compact"] .msg-avatar{width:24px!important;height:24px!important}',
      'html[data-scord-chat-style="compact"] .msg-author{font-size:11px!important}',
    ].join("");
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     12. VOICE LOOP PERFORMANCE — 150ms poll
  ══════════════════════════════════════════════════════════ */

  function patchVoiceLoop() {
    // Voice detection interval'ı 150ms'e çıkar (performans)
    if (window.SCORD_T && typeof window.SCORD_T === "function") {
      try {
        var t = window.SCORD_T();
        if (t) t.VOICE_SPEAKING_POLL_MS = 150;
      } catch (e) {}
    }
  }

  /* ══════════════════════════════════════════════════════════
     13. SES TETİKLEYİCİLERİ
  ══════════════════════════════════════════════════════════ */

  function hookSounds() {
    var _oj = window.joinVoiceChannel;
    if (_oj) {
      window.joinVoiceChannel = function () {
        var r = _oj.apply(this, arguments);
        setTimeout(function () { window.playDiscordSFX("join"); }, 300);
        return r;
      };
    }
    var _ol = window.leaveVoiceChannel;
    if (_ol) {
      window.leaveVoiceChannel = function () {
        window.playDiscordSFX("leave");
        return _ol.apply(this, arguments);
      };
    }
    var check = setInterval(function () {
      var micBtn = document.getElementById("mic-toggle-btn");
      var sendBtn = document.getElementById("send-btn");
      var chatInput = document.getElementById("chat-input");
      var dmSendBtn = document.getElementById("dm-send-btn");
      var dmInput = document.getElementById("dm-input");
      if (micBtn && sendBtn && chatInput && dmSendBtn && dmInput) {
        clearInterval(check);
        micBtn.addEventListener("click", function () {
          setTimeout(function () { window.playDiscordSFX(window.state?.muted ? "mute" : "unmute"); }, 50);
        });
        sendBtn.addEventListener("click", function () { window.playDiscordSFX("message"); });
        chatInput.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) window.playDiscordSFX("message"); });
        dmSendBtn.addEventListener("click", function () { window.playDiscordSFX("dm"); });
        dmInput.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) window.playDiscordSFX("dm"); });
      }
    }, 500);
  }

  /* ══════════════════════════════════════════════════════════
     14. MÜZİK BOTU FİX — Herkese senkron
  ══════════════════════════════════════════════════════════ */

  function patchMusicBot() {
    // Sesli kanaldan çıkınca müziği durdur
    var _origLVC = window.leaveVoiceChannel;
    if (_origLVC) {
      window.leaveVoiceChannel = function () {
        if (typeof stopMusicBot === "function") stopMusicBot();
        return _origLVC.apply(this, arguments);
      };
    }

    // startMusicBot sonrası player hazır olunca sesi aç
    var _origSMB = window.startMusicBot;
    if (_origSMB) {
      window.startMusicBot = function (videoId, startAt) {
        var result = _origSMB.apply(this, arguments);
        // Player oluştuktan sonra sesi açmak için poll
        var attempts = 0;
        var ensure = setInterval(function () {
          attempts++;
          try {
            var p = window.state?.musicBot?.player;
            if (p && typeof p.unMute === "function") {
              p.unMute();
              p.setVolume(Math.max(1, Number(window.state?.musicBot?.volume ?? 30)));
              p.playVideo();
              clearInterval(ensure);
            }
          } catch (e) {}
          if (attempts > 30) clearInterval(ensure); // 3sn timeout
        }, 100);
        return result;
      };
    }

    // playMusicBotByUrl broadcast'ini güçlendir
    var _origPMBU = window.playMusicBotByUrl;
    if (_origPMBU) {
      window.playMusicBotByUrl = function (raw) {
        var result = _origPMBU.apply(this, arguments);
        var videoId = typeof extractYouTubeVideoId === "function" ? extractYouTubeVideoId(raw) : null;
        if (videoId && window.state?.mesh && window.state?.voiceChannelId) {
          window.state.mesh.broadcast({ type: "music_play", videoId: videoId, startAt: 0, voiceChannelId: window.state.voiceChannelId });
        }
        return result;
      };
    }

    // Music dock kapatma butonu
    function addCloseBtn() {
      var dock = document.getElementById("music-player-dock");
      if (!dock || dock.querySelector(".mdock-close-btn")) return;
      var btn = document.createElement("button");
      btn.className = "mdock-close-btn";
      btn.textContent = "\u2715";
      btn.title = "Kapat";
      btn.style.cssText = "position:absolute;top:2px;right:2px;z-index:999;width:22px;height:22px;border-radius:50%;border:none;background:rgba(0,0,0,0.6);color:#fff;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;line-height:1;";
      btn.addEventListener("click", function (e) { e.stopPropagation(); dock.classList.remove("active"); dock.setAttribute("aria-hidden", "true"); });
      dock.style.position = "relative";
      dock.appendChild(btn);
    }

    var dockObs = new MutationObserver(function () {
      var dock = document.getElementById("music-player-dock");
      if (dock && !dock.querySelector(".mdock-close-btn")) addCloseBtn();
    });
    dockObs.observe(document.body, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════
     15. MESAJ SİLME İZNİ
  ══════════════════════════════════════════════════════════ */

  function patchMessageDeletePermission() {
    var _origSMC = window.showMsgContextMenu;
    if (!_origSMC) return;
    window.showMsgContextMenu = function (msg, x, y) {
      var server = window.state?.servers?.find(function (s) { return s.id === window.state.activeServerId; });
      if (!server) return _origSMC(msg, x, y);
      var isAuthor = msg.authorId === window.state.peerId;
      var myRole = server.ownerId === window.state.peerId ? "owner" : server.peer_roles?.[window.state.peerId] === "admin" ? "admin" : server.peer_roles?.[window.state.peerId] === "mod" ? "mod" : "member";
      var canMod = myRole === "owner" || myRole === "admin" || myRole === "mod";
      if (!isAuthor && !canMod) return _origSMC(msg, x, y);
      _origSMC(msg, x, y);
      var menu = document.getElementById("ctx-menu");
      if (!menu || menu.querySelector('[data-action="delete-msg"]')) return;
      var delItem = document.createElement("div");
      delItem.className = "ctx-item danger";
      delItem.dataset.action = "delete-msg";
      delItem.innerHTML = '<span class="ctx-icon">\uD83D\uDDD1\uFE0F</span>Mesaj\u0131 Sil';
      delItem.onclick = function () {
        var m = document.getElementById("ctx-menu");
        if (m) m.remove();
        if (typeof window.deleteChatMessage === "function") window.deleteChatMessage(msg);
      };
      menu.appendChild(delItem);
    };
  }

  /* ══════════════════════════════════════════════════════════
     16. SAĞ CLICK MENÜ ENTEGRASYONLARI
  ══════════════════════════════════════════════════════════ */

  function patchContextMenu() {
    var _origCMC = window.showContextMenu;
    if (!_origCMC) return;
    window.showContextMenu = function (peerId, username, x, y) {
      _origCMC.apply(this, arguments);
      var menu = document.getElementById("ctx-menu");
      if (!menu) return;

      // Direkt ara
      if (!menu.querySelector('[data-action="direct-call"]')) {
        var callItem = document.createElement("div");
        callItem.className = "ctx-item";
        callItem.dataset.action = "direct-call";
        callItem.innerHTML = '<span class="ctx-icon">📞</span>Direkt Ara (P2P)';
        callItem.onclick = function () { var m = document.getElementById("ctx-menu"); if (m) m.remove(); if (typeof window.startDirectCall === "function") window.startDirectCall(peerId); else if (typeof toast === "function") toast("@" + username + " aranıyor...", "info"); };
        var firstItem = menu.querySelector(".ctx-item");
        if (firstItem && firstItem.parentNode) firstItem.parentNode.insertBefore(callItem, firstItem.nextSibling);
        else menu.insertBefore(callItem, menu.firstChild);
      }

      // Not ekle / notu göster
      if (!menu.querySelector('[data-action="user-note"]')) {
        var noteItem = document.createElement("div");
        noteItem.className = "ctx-item";
        noteItem.dataset.action = "user-note";
        noteItem.innerHTML = '<span class="ctx-icon">📝</span>Not Ekle / Gör';
        noteItem.onclick = function () {
          var m = document.getElementById("ctx-menu"); if (m) m.remove();
          var existing = localStorage.getItem("scord_note_" + peerId);
          var note = prompt("@" + username + " için not:", existing || "");
          if (note !== null) { localStorage.setItem("scord_note_" + peerId, note); if (typeof toast === "function") toast("Not kaydedildi.", "info"); }
        };
        menu.appendChild(noteItem);
      }

      // Kullanıcı ID'sini kopyala
      if (!menu.querySelector('[data-action="copy-id"]')) {
        var idItem = document.createElement("div");
        idItem.className = "ctx-item";
        idItem.dataset.action = "copy-id";
        idItem.innerHTML = '<span class="ctx-icon">🆔</span>Kullanıcı ID Kopyala';
        idItem.onclick = function () {
          var m = document.getElementById("ctx-menu"); if (m) m.remove();
          if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(peerId).then(function () { if (typeof toast === "function") toast("ID kopyalandı: " + peerId, "info"); }).catch(function () {}); }
        };
        menu.appendChild(idItem);
      }
    };

    // Mesaj context menu - daha fazla seçenek
    var _origMSGC = window.showMsgContextMenu;
    if (_origMSGC) {
      window.showMsgContextMenu = function (msg, x, y) {
        _origMSGC.apply(this, arguments);
        var menu = document.getElementById("ctx-menu");
        if (!menu) return;

        // Mesaj ID kopyala (yoksa ekle)
        if (!menu.querySelector('[data-action="copy-msg-id"]')) {
          var idItem = document.createElement("div");
          idItem.className = "ctx-item";
          idItem.dataset.action = "copy-msg-id";
          idItem.innerHTML = '<span class="ctx-icon">🆔</span>Mesaj ID Kopyala';
          idItem.onclick = function () {
            var m = document.getElementById("ctx-menu"); if (m) m.remove();
            if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(msg.id || "").then(function () { if (typeof toast === "function") toast("Mesaj ID kopyalandı.", "info"); }).catch(function () {}); }
          };
          menu.appendChild(idItem);
        }
      };
    }
  }

  /* ══════════════════════════════════════════════════════════
     17. OYUN AKTİVİTESİ BÖLÜMÜ
  ══════════════════════════════════════════════════════════ */

  function patchGameActivity() {
    if (!window.state) return;
    if (!window.state.gameActivity) window.state.gameActivity = null;

    // Oyun aktivitesi modalı
    window.openGameActivityModal = function () {
      var current = window.state?.gameActivity;
      var name = current?.name || "";
      var details = current?.details || "";
      if (typeof showModal === "function") {
        var html = '<div class="form-group"><label class="modal-label">Oyun Adı</label><input class="modal-input" id="ga-name" value="' + name.replace(/"/g, "&quot;") + '" placeholder="Örn: Valorant, LoL, CS2..." maxlength="64" /></div><div class="form-group"><label class="modal-label">Durum (opsiyonel)</label><input class="modal-input" id="ga-details" value="' + details.replace(/"/g, "&quot;") + '" placeholder="Örn: Sıralı, Custom..." maxlength="64" /></div><p class="modal-info">Oyundayken profilinde ve üye listesinde görünür. Boş bırakıp kaydedersen sıfırlanır.</p>';
        showModal("Oyun Aktivitesi", html, '<button class="btn-secondary" onclick="hideModal()">İptal</button><button class="btn-primary" onclick="window.saveGameActivity()">Kaydet</button>');
      }
    };

    window.saveGameActivity = function () {
      var name = document.getElementById("ga-name")?.value?.trim() || "";
      var details = document.getElementById("ga-details")?.value?.trim() || "";
      if (!window.state) return;
      if (name) {
        window.state.gameActivity = { name: name, details: details, startTime: Date.now() };
        localStorage.setItem("scord_game_activity", JSON.stringify(window.state.gameActivity));
        if (typeof toast === "function") toast("Oyun aktivitesi: " + name, "success");
        // Broadcast to peers
        if (window.state?.mesh) {
          window.state.mesh.broadcast({ type: "game_activity", payload: window.state.gameActivity });
        }
        if (typeof sendServerEvent === "function") {
          sendServerEvent({ type: "game_activity", activity: window.state.gameActivity });
        }
      } else {
        window.state.gameActivity = null;
        localStorage.removeItem("scord_game_activity");
        if (typeof toast === "function") toast("Oyun aktivitesi kaldırıldı.", "info");
        if (window.state?.mesh) {
          window.state.mesh.broadcast({ type: "game_activity", payload: null });
        }
      }
      if (typeof hideModal === "function") hideModal();
      if (typeof updateMembersPanel === "function" && window.state.activeServerId) updateMembersPanel(window.state.activeServerId);
    };

    // Aktivite bildirimini işle
    var _origHSP = window.handleServerMessage;
    if (_origHSP) {
      var _prevHSP = window.handleServerMessage;
      window.handleServerMessage = function (data) {
        if (data?.type === "game_activity") {
          if (window.state) {
            var pid = data.from || data.peerId;
            if (pid && window.state._gameActivities) {
              window.state._gameActivities[pid] = data.activity;
              if (window.state.activeServerId && typeof updateMembersPanel === "function") updateMembersPanel(window.state.activeServerId);
            }
          }
          return;
        }
        return _prevHSP.apply(this, arguments);
      };
    }

    // P2P mesajları için oyun aktivitesi handler
    var _origP2P = window.handleIncomingP2P;
    if (_origP2P) {
      var _prevP2P = window.handleIncomingP2P;
      window.handleIncomingP2P = function (fromPeerId, data, roomId) {
        if (data?.type === "game_activity") {
          if (window.state) {
            if (!window.state._gameActivities) window.state._gameActivities = {};
            window.state._gameActivities[fromPeerId] = data.payload;
            if (window.state.activeServerId && typeof updateMembersPanel === "function") updateMembersPanel(window.state.activeServerId);
          }
          return;
        }
        return _prevP2P.apply(this, arguments);
      };
    }

    // Profil modalına oyun aktivitesi ekle
    var _origOUP = window.openUserProfile;
    if (_origOUP) {
      window.openUserProfile = function (peerId, username, avatarImage, avatarColor) {
        _origOUP.apply(this, arguments);
        // Oyun aktivitesini profile ekle
        var game = window.state?.gameActivity;
        if (game && peerId === window.state?.peerId) {
          var profileContent = document.querySelector(".modal-content");
          if (profileContent && !profileContent.querySelector(".user-game-activity")) {
            var el = document.createElement("div");
            el.className = "user-game-activity";
            el.style.cssText = "margin-top:12px;padding:10px;background:rgba(255,255,255,0.05);border-radius:8px;";
            el.innerHTML = '<div style="font-size:11px;opacity:0.6;margin-bottom:4px;">🎮 OYNUYOR</div><div style="font-weight:600;font-size:14px;">' + game.name + '</div>' + (game.details ? '<div style="font-size:12px;opacity:0.7;">' + game.details + '</div>' : '');
            profileContent.appendChild(el);
          }
        }
      };
    }

    // Ana sayfaya "Oyun Aktivitesi" butonu ekle
    function addGameBtn() {
      var homeView = document.getElementById("home-view");
      if (!homeView || homeView.querySelector(".ga-set-btn")) return;
      var btn = document.createElement("button");
      btn.className = "ga-set-btn hero-btn";
      btn.style.cssText = "margin-top:10px;padding:8px 18px;font-size:13px;";
      btn.innerHTML = "🎮 Oyun Aktivitesi Ayarla";
      btn.onclick = function () { if (typeof window.openGameActivityModal === "function") window.openGameActivityModal(); };
      var hero = homeView.querySelector(".home-hero");
      if (hero) hero.appendChild(btn);
    }

    var homeObs = new MutationObserver(function () { addGameBtn(); });
    homeObs.observe(document.body, { childList: true, subtree: true });

    // localStorage'dan geri yükle
    try {
      var saved = JSON.parse(localStorage.getItem("scord_game_activity"));
      if (saved && saved.name) window.state.gameActivity = saved;
    } catch (e) {}
  }

  /* ══════════════════════════════════════════════════════════
     18. CHAT ARKA PLANI DAHA AYDINLIK
  ══════════════════════════════════════════════════════════ */

  function patchThemeColors() {
    if (document.getElementById("scord-theme-fix")) return;
    var style = document.createElement("style");
    style.id = "scord-theme-fix";
    style.textContent = [
      ":root{",
      "--bg-deep:#12121e;",        // #0a0a14 → daha aydınlık
      "--bg-base:#19192b;",        // #11111f → daha aydınlık
      "--bg-elevated:#22223a;",    // #1a1a2e → daha aydınlık
      "--bg-active:#2c2c4a;",
      "--bg-hover:#343454;",
      "--border:#3d3d60;",
      "}",
      'html[data-scord-palette="paper"]{--bg-deep:#1e2330;--bg-base:#28303f;--bg-elevated:#2f3849;}',
      'html[data-scord-palette="forest"]{--bg-deep:#0c2018;--bg-base:#122a20;--bg-elevated:#183528;}',
      'html[data-scord-palette="midnight"]{--bg-deep:#0a0a12;--bg-base:#10101c;--bg-elevated:#161624;}',
      'html[data-scord-palette="oberon"]{--bg-deep:#141428;--bg-base:#1c1c34;--bg-elevated:#242444;--accent:#c084fc;--accent-light:#d8b4fe;}',
    ].join("");
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════
     19. PERFORMANS DEBOUNCE
  ══════════════════════════════════════════════════════════ */

  /* ══════════════════════════════════════════════════════════
     17. PERFORMANS DEBOUNCE
  ══════════════════════════════════════════════════════════ */

  function patchPerformance() {
    var _timers = {};

    function debounce(key, fn, ms) {
      if (_timers[key]) clearTimeout(_timers[key]);
      _timers[key] = setTimeout(function () { delete _timers[key]; fn(); }, ms || 16);
    }

    var _origRM = window.renderMessages;
    if (_origRM) {
      window.renderMessages = function (serverId, channelId) {
        debounce("rm_" + serverId + "_" + channelId, function () { _origRM(serverId, channelId); }, 16);
      };
    }

    var _origUCS = window.updateChannelSidebar;
    if (_origUCS) {
      window.updateChannelSidebar = function (serverId) {
        debounce("ucs_" + serverId, function () { _origUCS(serverId); }, 16);
      };
    }

    var _origUMP = window.updateMembersPanel;
    if (_origUMP) {
      window.updateMembersPanel = function (serverId) {
        debounce("ump_" + serverId, function () { _origUMP(serverId); }, 16);
      };
    }

    // All scrollable areas passive touch
    document.addEventListener("touchstart", function () {}, { passive: true });
    document.addEventListener("touchmove", function () {}, { passive: true });
    document.addEventListener("wheel", function () {}, { passive: true });
  }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */

  function init() {
    applyPerf();
    applyChatStyle();
    patchVoiceLoop();
    patchThemeColors();

    function ready() {
      patchSaveServerSettings();
      patchWSHandler();
      hookSounds();
      enhanceDMOverlay();
      patchMusicBot();
      patchMessageDeletePermission();
      patchContextMenu();
      patchGameActivity();
      patchPerformance();

      var obs = new MutationObserver(function () {
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
