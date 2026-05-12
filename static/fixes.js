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

  window.leaveServer = function leaveServer(serverId) {
    if (!window.state) return;
    var idx = window.state.servers.findIndex(function (s) { return s.id === serverId; });
    if (idx === -1) { if (typeof toast === "function") toast("Sunucu bulunamadı.", "error"); return; }
    if (window.state.voiceChannelId) {
      try { if (window.leaveVoiceChannel) window.leaveVoiceChannel(); } catch (e) {}
    }
    window.state.activeChannelId = null;
    window.state.activeServerId = null;
    window.state.voiceChannelId = null;
    window.state.servers.splice(idx, 1);
    try { if (window.state.mesh) { window.state.mesh.disconnect(); window.state.mesh = null; } } catch (e) {}
    if (typeof removeServerFromStorage === "function") removeServerFromStorage(serverId);
    if (typeof renderServerRail === "function") renderServerRail();
    if (typeof showHomeView === "function") showHomeView();
    if (typeof toast === "function") toast("Sunucudan ayrıldın.", "info");
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
    if (!window.state) return;
    // Overlay'i kapat
    var overlay = document.getElementById("dm-overlay");
    if (overlay) overlay.classList.add("hidden");
    // DM'i recent listesinden kaldır
    if (window.state.recentDMs) {
      window.state.recentDMs = window.state.recentDMs.filter(function (d) { return d.peerId !== peerId; });
      localStorage.setItem("scord_recent_dms", JSON.stringify(window.state.recentDMs));
    }
    // Mesaj geçmişini temizle
    if (window.state.dms) delete window.state.dms[peerId];
    try {
      var stored = JSON.parse(localStorage.getItem("scord_dms") || "{}");
      delete stored[peerId];
      localStorage.setItem("scord_dms", JSON.stringify(stored));
    } catch (e) {}
    if (window.state.activeDM === peerId) window.state.activeDM = null;
    // Sidebar'ı yenile
    if (!window.state.activeServerId && typeof renderHomeSidebar === "function") renderHomeSidebar();
    if (typeof toast === "function") toast("DM kapatıldı.", "info");
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
    // Recent listesinden de kaldır
    if (window.state.recentDMs) {
      window.state.recentDMs = window.state.recentDMs.filter(function (d) { return d.peerId !== peerId; });
      localStorage.setItem("scord_recent_dms", JSON.stringify(window.state.recentDMs));
    }
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
      ".messages-area,.channel-list,.members-list,#members-list,.dm-body{scroll-behavior:smooth;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}",
      "*::-webkit-scrollbar{width:4px;height:4px}*::-webkit-scrollbar-track{background:transparent}*::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}",
      ".toast,.ctx-menu,.modal-backdrop,.dm-overlay{transition:opacity 0.1s ease,transform 0.1s ease}",
      "body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}",
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
     14. MÜZİK BOTU FİX — Sıfırdan temiz implementasyon
  ══════════════════════════════════════════════════════════ */

  // YouTube API yükle
  function _ensureYT() {
    if (window.YT && typeof YT.Player === "function") return true;
    if (!document.querySelector("script[data-scord-yt-fix]")) {
      var s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.dataset.scordYtFix = "1";
      document.head.appendChild(s);
    }
    return false;
  }

  var _ytReadyFix = false;
  var _pendingMusic = null;

  window.onYouTubeIframeAPIReady = function () {
    _ytReadyFix = true;
    // Varsa beklemedeki müziği çal
    if (_pendingMusic) {
      var p = _pendingMusic;
      _pendingMusic = null;
      _startMusicFix(p.videoId, p.startAt);
    }
  };

  function _startMusicFix(videoId, startAt) {
    var existingDock = document.getElementById("music-player-dock");
    if (existingDock) existingDock.remove();
    if (window._ytPlayerFix) {
      try { window._ytPlayerFix.destroy(); } catch (e) {}
      window._ytPlayerFix = null;
    }

    var d = document.createElement("div");
    d.id = "music-player-dock";
    d.style.cssText = "position:fixed;bottom:80px;right:20px;width:320px;height:200px;z-index:10000;background:#1a1a1a;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.5);";

    var inner = document.createElement("div");
    inner.id = "yt-player-fix";
    inner.style.cssText = "width:100%;height:100%;background:#000;";
    d.appendChild(inner);

    var closeBtn = document.createElement("button");
    closeBtn.innerHTML = "&#x2715;";
    closeBtn.style.cssText = "position:absolute;top:6px;right:6px;z-index:10;width:28px;height:28px;border-radius:50%;border:none;background:rgba(0,0,0,0.8);color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;";
    closeBtn.onclick = function () { _stopMusicFix(); };
    d.appendChild(closeBtn);

    var statusDiv = document.createElement("div");
    statusDiv.id = "music-player-status";
    statusDiv.style.cssText = "position:absolute;bottom:10px;left:10px;right:10px;color:#888;font-size:12px;text-align:center;";
    statusDiv.textContent = "Yükleniyor...";
    d.appendChild(statusDiv);

    document.body.appendChild(d);

    var checkYTMono = function () {
      if (window.YT && window.YT.Player) {
        _ytReadyFix = true;
        _createYTPlayer(videoId, startAt);
      } else {
        setTimeout(checkYTMono, 100);
      }
    };

    if (!window.YT || !window.YT.Player) {
      _ensureYT();
      toast("YouTube yükleniyor...", "info");
      checkYTMono();
      return;
    }

    _ytReadyFix = true;
    _createYTPlayer(videoId, startAt);
  }

  function _createYTPlayer(videoId, startAt) {
    try {
      var player = new YT.Player("yt-player-fix", {
        height: "200",
        width: "320",
        videoId: videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1
        },
        events: {
          onReady: function (e) {
            var status = document.getElementById("music-player-status");
            if (status) status.textContent = "Çalıyor";
            e.target.unMute();
            e.target.setVolume(40);
            e.target.playVideo();
          },
          onStateChange: function (e) {
            var status = document.getElementById("music-player-status");
            if (e.data === YT.PlayerState.PLAYING) {
              if (status) status.textContent = "Çalıyor";
            } else if (e.data === YT.PlayerState.PAUSED) {
              if (status) status.textContent = "Durduruldu";
            } else if (e.data === YT.PlayerState.ENDED) {
              if (status) status.textContent = "Bitti";
            }
          },
          onError: function (e) {
            var status = document.getElementById("music-player-status");
            if (status) status.textContent = "Hata: " + e.data;
            toast("Video yüklenemedi: " + e.data, "error");
          }
        }
      });
      window._ytPlayerFix = player;
    } catch (e) {
      var status = document.getElementById("music-player-status");
      if (status) status.textContent = "Hata: " + e.message;
      toast("Müzik oynatılamadı: " + e.message, "error");
    }
  }

  function _stopMusicFix() {
    try {
      if (window._ytPlayerFix && typeof window._ytPlayerFix.stopVideo === "function") {
        window._ytPlayerFix.stopVideo();
        window._ytPlayerFix.destroy();
        window._ytPlayerFix = null;
      }
    } catch (e) {}
    var dock = document.getElementById("music-player-dock");
    if (dock) dock.remove();
    _pendingMusic = null;
  }

  function patchMusicBot() {
    // Sesli kanaldan çıkınca müziği durdur
    var _origLVC = window.leaveVoiceChannel;
    if (_origLVC) {
      window.leaveVoiceChannel = function () {
        _stopMusicFix();
        return _origLVC.apply(this, arguments);
      };
    }

    // playMusicBotByUrl - temiz override
    var _origPMBU = window.playMusicByUrl || window.playMusicBotByUrl;
    window.playMusicBotByUrl = function (raw) {
      var videoId = (typeof extractYouTubeVideoId === "function" ? extractYouTubeVideoId(raw) : null) || (function () {
        var m = String(raw).match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
        return m ? m[1] : null;
      })() || (String(raw).length === 11 ? raw : null);
      if (!videoId) { if (typeof toast === "function") toast("Geçersiz YouTube linki.", "error"); return; }
      _startMusicFix(videoId, 0);
      // Broadcast to peers
      if (window.state?.mesh && window.state?.voiceChannelId) {
        window.state.mesh.broadcast({ type: "music_play", videoId: videoId, startAt: 0, voiceChannelId: window.state.voiceChannelId });
      }
      if (typeof toast === "function") toast("🎵 Müzik çalıyor!", "success");
    };

    // P2P music_play handler - diğer kullanıcılar için
    var _origP2P = window.handleIncomingP2P;
    if (_origP2P) {
      window.handleIncomingP2P = function (fromPeerId, data, roomId) {
        if (data?.type === "music_play" && data.videoId) {
          if (window.state?.voiceChannelId) {
            _startMusicFix(data.videoId, data.startAt || 0);
          }
          return;
        }
        if (data?.type === "music_stop") {
          _stopMusicFix();
          return;
        }
        return _origP2P.apply(this, arguments);
      };
    }

    // Ayrıca app.js'deki P2P handler'ı da patch'le (handleP2PMessage)
    var _origHPM = window.handleP2PMessage || window.handleServerMessage;
    if (_origHPM) {
      var savedOrig = _origHPM;
      window.handleServerMessage = function (data) {
        if (data?.type === "music_play" && data.videoId) {
          if (window.state?.voiceChannelId) _startMusicFix(data.videoId, data.startAt || 0);
          return;
        }
        if (data?.type === "music_stop") { _stopMusicFix(); return; }
        return savedOrig.apply(this, arguments);
      };
    }

    // YT API hazır değilse bekle
    _ensureYT();
    if (window.YT && typeof YT.Player === "function") {
      _ytReadyFix = true;
      if (_pendingMusic) {
        var p = _pendingMusic;
        _pendingMusic = null;
        _startMusicFix(p.videoId, p.startAt);
      }
    }
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
     15b. DM KAPAT BUTONU — Gerçekten kapatma
  ══════════════════════════════════════════════════════════ */

  function patchDMCloseButton() {
    var check = setInterval(function () {
      var btn = document.getElementById("dm-close-btn");
      if (btn) {
        clearInterval(check);
        btn.onclick = function (e) {
          var ov = document.getElementById("dm-overlay");
          if (ov) { ov.classList.add("hidden"); ov.setAttribute("aria-hidden", "true"); }
          if (typeof hideDMMainView === "function") hideDMMainView(true);
          var peerId = window.state?.activeDM;
          if (peerId) {
            if (window.state?.recentDMs) {
              window.state.recentDMs = window.state.recentDMs.filter(function (d) { return d.peerId !== peerId; });
              localStorage.setItem("scord_recent_dms", JSON.stringify(window.state.recentDMs));
            }
            if (window.state?.dms) delete window.state.dms[peerId];
            try {
              var stored = JSON.parse(localStorage.getItem("scord_dms") || "{}");
              delete stored[peerId];
              localStorage.setItem("scord_dms", JSON.stringify(stored));
            } catch (e) {}
            window.state.activeDM = null;
            if (!window.state.activeServerId && typeof renderHomeSidebar === "function") renderHomeSidebar();
            if (typeof renderDMMainView === "function") renderDMMainView();
          }
        };
      }
    }, 500);
  }

  function patchDMClickReposition() {
    var check2 = setInterval(function () {
      var dmMain = document.getElementById("dm-main-view");
      if (dmMain) {
        clearInterval(check2);
        dmMain.addEventListener("click", function (e) {
          var peerId = window.state?.activeDM;
          if (!peerId) return;
          var item = e.target.closest(".dm-main-item");
          if (item) return;
          var msgArea = document.getElementById("dm-messages");
          if (msgArea && e.target.closest(msgArea)) return;
        });
      }
    }, 500);
  }

  function patchOpenDM() {
    var _origODM = window.openDM;
    if (!_origODM) return;
    window.openDM = function (peerId, name, avatarColor, avatarImage) {
      var oldRecent = window.state?.recentDMs || [];
      var wasAlreadyRecent = oldRecent.some(function (d) { return d.peerId === peerId; });
      _origODM.call(this, peerId, name, avatarColor, avatarImage);
      if (wasAlreadyRecent && window.state?.recentDMs) {
        window.state.recentDMs = oldRecent;
        localStorage.setItem("scord_recent_dms", JSON.stringify(window.state.recentDMs));
      }
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
     20. ŞİFRE + DİSCRİMİNATOR (#0001) SİSTEMİ
  ══════════════════════════════════════════════════════════ */

  function patchPasswordSystem() {
    if (!window.state) return;

    // Discriminator sayaç (her nick için kaç kayıt var)
    window._getDiscriminator = function (nick) {
      var counterKey = "scord_disc_count_" + nick.toLowerCase().trim();
      var count = parseInt(localStorage.getItem(counterKey) || "0", 10);
      count++;
      localStorage.setItem(counterKey, count.toString());
      return String(count).padStart(4, "0");
    };

    window._formatTag = function (nick, disc) {
      return nick + "#" + disc;
    };

    // Discriminator'a göre identity key
    window._getIdentityKey = function (nick, disc) {
      return "scord_id_" + nick.toLowerCase().trim() + "_" + disc;
    };

    window._getPasswordHash = function (pass) {
      var h = 0;
      for (var i = 0; i < pass.length; i++) { h = ((h << 5) - h) + pass.charCodeAt(i); h |= 0; }
      return "p_" + Math.abs(h).toString(36);
    };

    window._findIdentityByFullTag = function (fullTag) {
      var parts = fullTag.split("#");
      if (parts.length !== 2) return null;
      var nick = parts[0].trim().toLowerCase();
      var disc = parts[1].trim();
      var key = "scord_id_" + nick + "_" + disc;
      var stored = localStorage.getItem(key);
      if (stored) {
        var data = JSON.parse(stored);
        data._fullTag = fullTag;
        return data;
      }
      return null;
    };

    window.loginWithPassword = function (nick, pass) {
      var disc = window.state._discriminator;
      var key = window._getIdentityKey(nick, disc);
      var stored = localStorage.getItem(key);
      var hash = window._getPasswordHash(pass);
      var isNew = false;

      if (!stored) {
        // Daha önce kayıt yoksa discriminator ata
        disc = window._getDiscriminator(nick);
        key = window._getIdentityKey(nick, disc);
        stored = localStorage.getItem(key);
      }

      if (stored) {
        var data = JSON.parse(stored);
        if (data.hash !== hash) {
          if (typeof toast === "function") toast("Hatalı şifre! Bu kimlik başkasına ait.", "error");
          return false;
        }
        disc = data.discriminator || disc;
        window.state._discriminator = disc;
        if (data.peerId) window.state.peerId = data.peerId;
        if (data.username) window.state.username = data.username;
        if (data.avatarColor) window.state.avatarColor = data.avatarColor;
        if (data.avatarImage) window.state.avatarImage = data.avatarImage;
        if (data.servers) window.state.servers = data.servers;
        if (data.friends) window.state.friends = data.friends;
        if (data.dms) window.state.dms = data.dms;
        if (data.recentDMs) window.state.recentDMs = data.recentDMs;
        if (typeof toast === "function") toast("Hoş geldin, " + window._formatTag(nick, disc) + "!", "success");
      } else {
        disc = window._getDiscriminator(nick);
        window.state._discriminator = disc;
        isNew = true;
        if (typeof toast === "function") toast("Yeni kimlik: " + window._formatTag(nick, disc), "success");
      }

      window.state._savedNick = nick;
      window.state._savedPass = pass;
      localStorage.setItem("scord_last_nick", nick);
      localStorage.setItem("scord_last_pass", pass);
      window._saveIdentity();
      return true;
    };

    window._saveIdentity = function () {
      var nick = window.state._savedNick;
      if (!nick) return;
      var disc = window.state._discriminator || "0001";
      var key = window._getIdentityKey(nick, disc);
      var stored = localStorage.getItem(key);
      var data = stored ? JSON.parse(stored) : {};
      data.hash = window._getPasswordHash(window.state._savedPass || "");
      data.discriminator = disc;
      data.peerId = window.state.peerId;
      data.username = window.state.username;
      data.avatarColor = window.state.avatarColor;
      data.avatarImage = window.state.avatarImage;
      data.servers = window.state.servers || [];
      data.friends = window.state.friends || [];
      data.dms = window.state.dms || {};
      data.recentDMs = window.state.recentDMs || [];
      localStorage.setItem(key, JSON.stringify(data));
    };

    window.showLoginModal = function () {
      var savedNick = localStorage.getItem("scord_last_nick") || "";
      var html = '<div class="form-group"><label class="modal-label">Kullanıcı Adı</label><input class="modal-input" id="login-nick" value="' + savedNick.replace(/"/g, "&quot;") + '" placeholder="Nickin..." maxlength="32" autocomplete="off" /></div><div class="form-group"><label class="modal-label">Şifre</label><input class="modal-input" id="login-pass" type="password" placeholder="Şifre..." maxlength="64" autocomplete="off" /></div><p class="modal-info">Aynı nick + şifre ile aynı profili kullanırsın. Etiketin: #0001, #0002... (sırayla).</p>';
      if (typeof showModal === "function") {
        showModal("Giriş / Kayıt", html, '<button class="btn-secondary" onclick="hideModal()">İptal</button><button class="btn-primary" onclick="window._doLogin()">Giriş Yap</button>');
        setTimeout(function () { var el = document.getElementById("login-nick"); if (el) el.focus(); }, 100);
      }
    };

    window._doLogin = function () {
      var nick = document.getElementById("login-nick")?.value?.trim();
      var pass = document.getElementById("login-pass")?.value;
      if (!nick || !pass) { if (typeof toast === "function") toast("Nick ve şifre gerekli.", "error"); return; }
      var ok = window.loginWithPassword(nick, pass);
      if (ok) {
        if (typeof hideModal === "function") hideModal();
        if (typeof renderServerRail === "function") renderServerRail();
      }
    };

    // Etiket değiştirme
    window.showEditTagModal = function () {
      var currentTag = window._formatTag(window.state._savedNick || window.state.username, window.state._discriminator || "0001");
      var html = '<div class="form-group"><label class="modal-label">Mevcut Etiketin</label><div class="peer-id-display" style="text-align:center;font-size:18px;letter-spacing:1px;">' + currentTag + '</div></div><div class="form-group"><label class="modal-label">Yeni Etiket (örn: 0005)</label><input class="modal-input" id="edit-tag-input" value="' + (window.state._discriminator || "0001") + '" placeholder="0001" maxlength="4" autocomplete="off" /></div><p class="modal-info">Not: Başkasının kullandığı bir etiketi alamazsın.</p>';
      if (typeof showModal === "function") {
        showModal("Etiket Değiştir", html, '<button class="btn-secondary" onclick="hideModal()">İptal</button><button class="btn-primary" onclick="window._saveEditedTag()">Kaydet</button>');
      }
    };

    window._saveEditedTag = function () {
      var newDisc = document.getElementById("edit-tag-input")?.value?.trim();
      if (!newDisc || !/^\d{4}$/.test(newDisc)) { if (typeof toast === "function") toast("Geçerli 4 haneli bir etiket gir (0001-9999).", "error"); return; }
      var nick = window.state._savedNick;
      if (!nick) return;
      // Başkası kullanıyor mu kontrol
      var testKey = window._getIdentityKey(nick, newDisc);
      var existing = localStorage.getItem(testKey);
      if (existing && window.state._discriminator !== newDisc) {
        if (typeof toast === "function") toast("Bu etiket dolu! Başka bir tane dene.", "error");
        return;
      }
      // Eski kaydı sil
      var oldKey = window._getIdentityKey(nick, window.state._discriminator);
      localStorage.removeItem(oldKey);
      // Yeni etiketi ata
      window.state._discriminator = newDisc;
      window._saveIdentity();
      if (typeof hideModal === "function") hideModal();
      if (typeof toast === "function") toast("Yeni etiketin: " + window._formatTag(nick, newDisc), "success");
    };

    // Arkadaşı etiketle ekle (#0001)
    window.showAddFriendByTagModal = function () {
      var html = '<div class="form-group"><label class="modal-label">Arkadaşının Etiketi</label><input class="modal-input" id="add-friend-tag-input" placeholder="örn: sherlock#0001" maxlength="64" autocomplete="off" /></div><p class="modal-info">Aynı nick + 4 haneli etiket. Örn: <b>ahmet#0241</b></p>';
      if (typeof showModal === "function") {
        showModal("Arkadaş Ekle (Etiket ile)", html, '<button class="btn-secondary" onclick="hideModal()">İptal</button><button class="btn-primary" onclick="window._doAddFriendByTag()">Ekle</button>');
        setTimeout(function () { var el = document.getElementById("add-friend-tag-input"); if (el) el.focus(); }, 100);
      }
    };

    window._doAddFriendByTag = function () {
      var fullTag = document.getElementById("add-friend-tag-input")?.value?.trim();
      if (!fullTag || !fullTag.includes("#")) { if (typeof toast === "function") toast("Geçerli bir etiket gir (nick#0001).", "error"); return; }
      var identity = window._findIdentityByFullTag(fullTag);
      if (identity) {
        // Yerel kayıtlı kullanıcı - doğrudan ekle
        if (!window.state.friends) window.state.friends = [];
        if (window.state.friends.some(function (f) { return f.peerId === identity.peerId; })) { if (typeof toast === "function") toast("Zaten arkadaşsın.", "info"); return; }
        window.state.friends.push({ peerId: identity.peerId, name: identity.username || fullTag.split("#")[0], avatarColor: identity.avatarColor, avatarImage: identity.avatarImage, tag: fullTag });
        localStorage.setItem("scord_friends", JSON.stringify(window.state.friends));
        window._saveIdentity();
        if (typeof hideModal === "function") hideModal();
        if (typeof toast === "function") toast(fullTag + " arkadaş olarak eklendi!", "success");
        if (!window.state.activeServerId && typeof renderHomeSidebar === "function") renderHomeSidebar();
        return;
      }
      // Çevrimiçi kullanıcıları ara (mesh üzerinden)
      if (window.state?.mesh) {
        var peers = window.state.mesh.peers || {};
        var foundPeer = null;
        for (var pid in peers) {
          var info = window.state.mesh.peerInfo?.[pid] || {};
          var ptag = info.tag || "";
          var pname = info.username || "";
          var checkTag = fullTag.toLowerCase().replace(/\s/g, "");
          var pFull = (pname + "#" + ptag).toLowerCase().replace(/\s/g, "");
          if (pFull === checkTag) { foundPeer = pid; break; }
        }
        if (foundPeer && typeof window.sendFriendRequest === "function") {
          window.sendFriendRequest(foundPeer, fullTag);
          if (typeof hideModal === "function") hideModal();
          return;
        }
      }
      if (typeof toast === "function") toast("Bu etikette kimse bulunamadı (çevrimdışı olabilir).", "error");
    };

    // Kullanıcı barına etiket göster
    function updateUserBarTag() {
      var nameEl = document.getElementById("user-bar-name");
      if (!nameEl) return;
      var nick = window.state._savedNick || window.state.username;
      var disc = window.state._discriminator;
      if (nick && disc) {
        var tagSpan = nameEl.querySelector(".user-tag");
        if (!tagSpan) {
          tagSpan = document.createElement("span");
          tagSpan.className = "user-tag";
          tagSpan.style.cssText = "font-size:10px;opacity:0.5;margin-left:4px;font-weight:400;";
          nameEl.appendChild(tagSpan);
        }
        tagSpan.textContent = "#" + disc;
      }
    }

    var tagObs = new MutationObserver(updateUserBarTag);
    tagObs.observe(document.body, { childList: true, subtree: true });
    setInterval(updateUserBarTag, 2000);

    // Otomatik giriş
    try {
      var lastNick = localStorage.getItem("scord_last_nick");
      var lastPass = localStorage.getItem("scord_last_pass");
      if (lastNick && lastPass) {
        setTimeout(function () { window.loginWithPassword(lastNick, lastPass); }, 500);
      }
    } catch (e) {}

    // Setup ekranına şifre alanı ekle
    var setupCheck = setInterval(function () {
      var setupOverlay = document.getElementById("setup-overlay");
      var setupCard = setupOverlay ? setupOverlay.querySelector(".setup-card") : null;
      if (setupCard && !setupCard.querySelector(".setup-pass-field")) {
        // Şifre alanını ekle (username input'tan sonra)
        var formGroup = setupCard.querySelector(".form-group");
        var passGroup = document.createElement("div");
        passGroup.className = "form-group setup-pass-field";
        passGroup.innerHTML = '<label for="setup-password">Şifre (isteğe bağlı)</label><input id="setup-password" type="password" placeholder="Profilini korumak için şifre..." maxlength="64" autocomplete="off" /><p style="font-size:11px;opacity:0.5;margin-top:4px;">Şifre koyarsan aynı nickle başkası giriş yapamaz.</p>';
        if (formGroup && formGroup.parentNode) {
          formGroup.parentNode.insertBefore(passGroup, formGroup.nextSibling);
        }

        // Enter butonunu patch'le (şifreyi de kaydet)
        var enterBtn = setupCard.querySelector("#enter-btn");
        if (enterBtn) {
          var origClick = enterBtn.onclick;
          enterBtn.onclick = function (e) {
            var pass = document.getElementById("setup-password")?.value || "";
            var nick = document.getElementById("username-input")?.value?.trim();
            if (nick && pass) {
              // Şifre varsa hemen kaydet
              window._setupPassword = pass;
              localStorage.setItem("scord_last_nick", nick);
              localStorage.setItem("scord_last_pass", pass);
              // Kimlik oluştur/giriş yap
              window.loginWithPassword(nick, pass);
            } else if (nick && !pass) {
              // Şifresiz giriş - sadece nick kaydet
              localStorage.setItem("scord_last_nick", nick);
              localStorage.removeItem("scord_last_pass");
            }
            if (origClick) origClick.call(this, e);
          };
        }
        clearInterval(setupCheck);
      }
    }, 500);
  }

  /* ══════════════════════════════════════════════════════════
     21. MESAJ GEÇMİŞİNİ TEMİZLE
  ══════════════════════════════════════════════════════════ */

  function patchClearMessages() {
    window.clearServerMessages = function (serverId) {
      if (!confirm("Tüm mesaj geçmişini silmek istediğine emin misin? Bu geri alınamaz.")) return;
      var server = window.state?.servers?.find(function (s) { return s.id === serverId; });
      if (!server) return;
      server.messages = {};
      server.pinned_messages = [];
      if (typeof toast === "function") toast("Mesaj geçmişi temizlendi.", "success");
      if (typeof renderMessages === "function" && window.state.activeServerId === serverId) renderMessages(serverId, window.state.activeChannelId);
    };

    // Sunucu ayarlarına "Mesaj Geçmişini Temizle" butonu ekle
    var obs = new MutationObserver(function () {
      var advancedTab = document.getElementById("s-tab-advanced");
      if (advancedTab && !advancedTab.querySelector(".clear-msgs-btn")) {
        var btn = document.createElement("button");
        btn.className = "clear-msgs-btn btn-secondary";
        btn.style.cssText = "margin-top:12px;background:var(--yellow,#f59e0b);border:none;color:#000;";
        btn.textContent = "🗑 Tüm Mesaj Geçmişini Sil";
        btn.onclick = function () {
          if (window.state?.activeServerId) window.clearServerMessages(window.state.activeServerId);
        };
        advancedTab.appendChild(btn);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  /* ══════════════════════════════════════════════════════════
     22. SUNUCU LİSTESİ İYİLEŞTİRME
  ══════════════════════════════════════════════════════════ */

  function patchServerRail() {
    var style = document.createElement("style");
    style.id = "scord-rail-fix";
    style.textContent = [
      ".server-rail{overflow-y:auto;overflow-x:hidden;scrollbar-width:thin}",
      ".server-rail::-webkit-scrollbar{width:3px}",
      ".server-rail::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:3px}",
      ".rail-icon{transition:border-radius 0.15s ease,transform 0.1s ease}",
      ".rail-icon:hover{border-radius:14px;transform:scale(1.05)}",
      ".rail-icon.active{border-radius:14px}",
      ".rail-icon img{width:100%;height:100%;object-fit:cover;border-radius:inherit}",
      ".screen-overlay-tools{display:flex;align-items:center;gap:12px;padding:10px 16px;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);border-radius:12px;margin-top:8px}",
      ".screen-overlay-tool{background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);color:#fff;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.15s ease}",
      ".screen-overlay-tool:hover{background:rgba(255,255,255,0.2);border-color:rgba(255,255,255,0.3);transform:scale(1.03)}",
      ".screen-overlay-tools label{display:flex;align-items:center;gap:6px;font-size:12px;color:rgba(255,255,255,0.7)}",
      ".screen-overlay-tools input[type=range]{width:80px;accent-color:var(--accent,#6366f1)}",
    ].join("");
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════════
     23. ARKADAŞ İSTEĞİ SİSTEMİ (P2P)
  ══════════════════════════════════════════════════════════ */

  function patchFriendRequestSystem() {
    // Arkadaş isteklerini yükle
    if (!window.state._friendRequests) {
      try { window.state._friendRequests = JSON.parse(localStorage.getItem("scord_friend_requests") || "[]"); } catch (e) { window.state._friendRequests = []; }
    }
    if (!window.state._pendingRequests) {
      try { window.state._pendingRequests = JSON.parse(localStorage.getItem("scord_pending_requests") || "[]"); } catch (e) { window.state._pendingRequests = []; }
    }

    // + butonu ekle (ARKADAŞLAR kategorisinin yanına)
    function addPlusButton() {
      var cats = document.querySelectorAll(".channel-category");
      cats.forEach(function (cat) {
        if (cat.textContent.trim() === "ARKADAŞLAR" && !cat.querySelector(".fr-add-btn")) {
          var btn = document.createElement("button");
          btn.className = "fr-add-btn";
          btn.textContent = "+";
          btn.title = "Arkadaş Ekle";
          btn.style.cssText = "float:right;background:var(--accent);color:#fff;border:none;width:22px;height:22px;border-radius:6px;cursor:pointer;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;transition:all 0.15s ease;";
          btn.onmouseover = function () { this.style.transform = "scale(1.15)"; };
          btn.onmouseout = function () { this.style.transform = "scale(1)"; };
          btn.onclick = function (e) { e.stopPropagation(); window.showAddFriendByTagModal(); };
          cat.style.position = "relative";
          cat.appendChild(btn);
        }
      });
    }

    var plusObs = new MutationObserver(addPlusButton);
    plusObs.observe(document.body, { childList: true, subtree: true });
    setInterval(addPlusButton, 2000);

    // Arkadaş isteği gönder
    window.sendFriendRequest = function (targetPeerId, targetTag) {
      if (!window.state?.mesh) { if (typeof toast === "function") toast("Bağlantı yok, istek gönderilemedi.", "error"); return; }
      var req = {
        type: "friend_request",
        from: window.state.peerId,
        username: window.state.username || "Anonim",
        tag: window.state._discriminator || "0000",
        targetTag: targetTag,
        timestamp: Date.now(),
      };
      window.state.mesh.broadcast(req);
      // Bekleyen istekleri kaydet
      if (!window.state._friendRequests) window.state._friendRequests = [];
      window.state._friendRequests.push({ peerId: targetPeerId, tag: targetTag, timestamp: Date.now() });
      localStorage.setItem("scord_friend_requests", JSON.stringify(window.state._friendRequests));
      if (typeof toast === "function") toast("Arkadaş isteği gönderildi!", "success");
    };

    // Gelen istekleri işle
    var _origP2P = window.handleIncomingP2P;
    if (_origP2P) {
      window.handleIncomingP2P = function (fromPeerId, data, roomId) {
        if (data?.type === "friend_request") {
          if (!window.state._pendingRequests) window.state._pendingRequests = [];
          // Aynı istek daha önce gelmiş mi?
          var exists = window.state._pendingRequests.some(function (r) { return r.from === data.from && r.username === data.username; });
          if (!exists) {
            window.state._pendingRequests.push({ from: data.from, username: data.username, tag: data.tag, timestamp: data.timestamp });
            localStorage.setItem("scord_pending_requests", JSON.stringify(window.state._pendingRequests));
            if (typeof toast === "function") toast("📩 Arkadaşlık isteği: @" + data.username + "#" + data.tag, "info");
            // Kabul/reddet butonlarıyla bildirim göster
            window._showFriendRequestNotification(data.from, data.username, data.tag);
          }
          return;
        }
        if (data?.type === "friend_request_accepted") {
          // Arkadaş eklendi
          var acceptedBy = data.from || data.peerId;
          var acceptedName = data.username || "Birisi";
          if (window.state) {
            if (!window.state.friends) window.state.friends = [];
            if (!window.state.friends.some(function (f) { return f.peerId === acceptedBy; })) {
              window.state.friends.push({ peerId: acceptedBy, name: acceptedName, avatarColor: data.avatarColor || "#5865f2", avatarImage: data.avatarImage || null, tag: data.tag || "" });
              localStorage.setItem("scord_friends", JSON.stringify(window.state.friends));
              // Bekleyen istekten kaldır
              if (window.state._friendRequests) {
                window.state._friendRequests = window.state._friendRequests.filter(function (r) { return r.peerId !== acceptedBy; });
                localStorage.setItem("scord_friend_requests", JSON.stringify(window.state._friendRequests));
              }
              if (typeof toast === "function") toast("✅ " + acceptedName + " arkadaşlık isteğini kabul etti!", "success");
              if (!window.state.activeServerId && typeof renderHomeSidebar === "function") renderHomeSidebar();
            }
          }
          return;
        }
        if (data?.type === "friend_request_rejected") {
          var rejectedBy = data.from || data.peerId;
          if (window.state._friendRequests) {
            window.state._friendRequests = window.state._friendRequests.filter(function (r) { return r.peerId !== rejectedBy; });
            localStorage.setItem("scord_friend_requests", JSON.stringify(window.state._friendRequests));
          }
          if (typeof toast === "function") toast("❌ Arkadaşlık isteği reddedildi.", "info");
          return;
        }
        return _origP2P.apply(this, arguments);
      };
    }

    // Bildirim göster
    window._showFriendRequestNotification = function (fromPeerId, username, tag) {
      var html = '<div style="text-align:center;padding:8px;"><div style="font-size:24px;margin-bottom:8px;">📩</div><div style="font-weight:600;margin-bottom:4px;">@' + username + '#' + tag + '</div><div style="font-size:13px;opacity:0.7;margin-bottom:12px;">size arkadaşlık isteği gönderdi</div><div style="display:flex;gap:8px;justify-content:center;"><button class="btn-primary" onclick="window._acceptFriendRequest(\'' + fromPeerId + '\',\'' + username.replace(/'/g, "\\'") + '\',\'' + (tag || "") + '\')">✅ Kabul Et</button><button class="btn-secondary" onclick="window._rejectFriendRequest(\'' + fromPeerId + '\')">❌ Reddet</button></div></div>';
      if (typeof showModal === "function") showModal("Arkadaşlık İsteği", html, '<button class="btn-secondary" onclick="hideModal()">Kapat</button>');
    };

    window._acceptFriendRequest = function (fromPeerId, username, tag) {
      if (window.state) {
        if (!window.state.friends) window.state.friends = [];
        if (!window.state.friends.some(function (f) { return f.peerId === fromPeerId; })) {
          window.state.friends.push({ peerId: fromPeerId, name: username, avatarColor: "#5865f2", avatarImage: null, tag: tag || "" });
          localStorage.setItem("scord_friends", JSON.stringify(window.state.friends));
        }
        // Bekleyen istekten kaldır
        if (window.state._pendingRequests) {
          window.state._pendingRequests = window.state._pendingRequests.filter(function (r) { return r.from !== fromPeerId; });
          localStorage.setItem("scord_pending_requests", JSON.stringify(window.state._pendingRequests));
        }
        // Kabul bildirimi gönder
        if (window.state.mesh) {
          window.state.mesh.broadcast({ type: "friend_request_accepted", from: window.state.peerId, username: window.state.username, avatarColor: window.state.avatarColor, avatarImage: window.state.avatarImage, tag: window.state._discriminator || "0000" });
        }
        if (typeof hideModal === "function") hideModal();
        if (typeof toast === "function") toast(username + " ile arkadaş oldunuz!", "success");
        if (!window.state.activeServerId && typeof renderHomeSidebar === "function") renderHomeSidebar();
      }
    };

    window._rejectFriendRequest = function (fromPeerId) {
      if (window.state._pendingRequests) {
        window.state._pendingRequests = window.state._pendingRequests.filter(function (r) { return r.from !== fromPeerId; });
        localStorage.setItem("scord_pending_requests", JSON.stringify(window.state._pendingRequests));
      }
      if (window.state?.mesh) {
        window.state.mesh.broadcast({ type: "friend_request_rejected", from: window.state.peerId });
      }
      if (typeof hideModal === "function") hideModal();
      if (typeof toast === "function") toast("İstek reddedildi.", "info");
    };

    // Bekleyen istek varsa otomatik bildirim göster
    if (window.state._pendingRequests && window.state._pendingRequests.length > 0) {
      var lastReq = window.state._pendingRequests[window.state._pendingRequests.length - 1];
      setTimeout(function () {
        window._showFriendRequestNotification(lastReq.from, lastReq.username, lastReq.tag);
      }, 2000);
    }
  }

  /* ══════════════════════════════════════════════════════════
     25. STATUS BAR FİX — innerHTML koruma
  ══════════════════════════════════════════════════════════ */

  function patchStatusBar() {
    var _origUSB = window.updateStatusBar;
    if (!_origUSB) return;
    window.updateStatusBar = function () {
      // Event listener'ı koru: öncekini sakla
      var bar = document.getElementById("status-bar");
      var hadClick = false;
      if (bar) {
        var clones = [];
        for (var ci = 0; ci < bar.children.length; ci++) {
          clones.push(bar.children[ci].cloneNode(true));
        }
        _origUSB.apply(this, arguments);
        // Click listener'ı yeniden ekle (showStatusPicker)
        if (bar && typeof window.showStatusPicker === "function") {
          bar.onclick = function (e) {
            // status-indicator veya status-text'e tıklandıysa
            if (e.target.closest(".status-indicator") || e.target.closest(".status-bar")) {
              window.showStatusPicker();
            }
          };
        }
      } else {
        _origUSB.apply(this, arguments);
      }
    };

    // İlk yüklemeden sonra onClick'i garantiye al
    setInterval(function () {
      var bar = document.getElementById("status-bar");
      if (bar && !bar._statusFixed) {
        bar._statusFixed = true;
        bar.onclick = function (e) {
          if (typeof window.showStatusPicker === "function") window.showStatusPicker();
        };
        bar.style.cursor = "pointer";
      }
    }, 2000);
  }

  /* ══════════════════════════════════════════════════════════
     26. PROFİL — Nick tıklayınca kendi profil + avatar önizleme
  ══════════════════════════════════════════════════════════ */

  function patchProfileSystem() {
    // Nick'e tıklayınca kendi profili
    var check = setInterval(function () {
      var nameEl = document.getElementById("user-bar-name");
      if (nameEl && !nameEl.dataset.profilePatched) {
        nameEl.dataset.profilePatched = "1";
        nameEl.style.cursor = "pointer";
        nameEl.title = "Profilini Görüntüle (tıkla)";
        nameEl.onclick = function () {
          if (typeof openUserProfile === "function") {
            openUserProfile(window.state?.peerId, window.state?.username || window.state?.name, window.state?.avatarImage, window.state?.avatarColor);
          }
        };
      }
    }, 1000);

    // Profil modalında avatar önizleme + değiştirme
    var _origOUP = window.openUserProfile;
    if (_origOUP) {
      window.openUserProfile = function (peerId, username, avatarImage, avatarColor) {
        var isSelf = peerId === window.state?.peerId;
        _origOUP.apply(this, arguments);

        if (!isSelf) return;
        var mc = document.querySelector(".modal-content");
        if (!mc || mc.querySelector(".pro-self-avatar")) return;

        // Profil kartını bul
        var proMain = mc.querySelector(".profile-pro-main");
        if (!proMain) return;

        // Avatar önizleme kısmı
        var selfSection = document.createElement("div");
        selfSection.className = "pro-self-avatar";
        selfSection.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px;background:rgba(255,255,255,0.03);border-radius:12px;margin:12px 0;";

        var preview = document.createElement("div");
        preview.style.cssText = "width:100px;height:100px;border-radius:50%;background-color:" + (avatarColor || "#5865f2") + ";background-image:url(" + (avatarImage || "") + ");background-size:cover;background-position:center;border:3px solid var(--accent);box-shadow:0 4px 16px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:40px;color:#fff;font-weight:700;transition:transform 0.2s ease;";
        if (!avatarImage) preview.textContent = (username ? username.charAt(0).toUpperCase() : "?");
        preview.onmouseover = function () { this.style.transform = "scale(1.05)"; };
        preview.onmouseout = function () { this.style.transform = "scale(1)"; };

        var btnRow = document.createElement("div");
        btnRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:center;";

        var uploadBtn = document.createElement("button");
        uploadBtn.textContent = "📷 Fotoğraf Yükle";
        uploadBtn.style.cssText = "background:var(--accent);color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:500;transition:all 0.15s ease;";
        uploadBtn.onmouseover = function () { this.style.opacity = "0.85"; };
        uploadBtn.onmouseout = function () { this.style.opacity = "1"; };
        uploadBtn.onclick = function () {
          var input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
              var b64 = ev.target.result;
              if (window.state) {
                window.state.avatarImage = b64;
                localStorage.setItem("scord_avatar_image", b64);
                preview.style.backgroundImage = "url(" + b64 + ")";
                preview.textContent = "";
                var ua = document.getElementById("user-bar-avatar");
                if (ua && typeof applyAvatarToElement === "function") applyAvatarToElement(ua, window.state.avatarColor, b64, window.state.username);
                if (window.state.mesh) window.state.mesh.broadcast({ type: "broadcast", payload: { type: "profile_update", username: window.state.username, avatarImage: b64 } });
                if (typeof toast === "function") toast("Profil fotoğrafı güncellendi!", "success");
              }
            };
            reader.readAsDataURL(file);
          };
          input.click();
        };

        var urlBtn = document.createElement("button");
        urlBtn.textContent = "🔗 URL ile";
        urlBtn.style.cssText = "background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15);padding:8px 18px;border-radius:8px;cursor:pointer;font-size:13px;transition:all 0.15s ease;";
        urlBtn.onclick = function () {
          var url = prompt("Avatar URL'sini girin (https://...):");
          if (url && url.trim()) {
            var trimmed = url.trim();
            if (window.state) {
              window.state.avatarImage = trimmed;
              localStorage.setItem("scord_avatar_image", trimmed);
              preview.style.backgroundImage = "url(" + trimmed + ")";
              preview.textContent = "";
              var ua = document.getElementById("user-bar-avatar");
              if (ua && typeof applyAvatarToElement === "function") applyAvatarToElement(ua, window.state.avatarColor, trimmed, window.state.username);
              if (window.state.mesh) window.state.mesh.broadcast({ type: "broadcast", payload: { type: "profile_update", username: window.state.username, avatarImage: trimmed } });
              if (typeof toast === "function") toast("Profil fotoğrafı güncellendi!", "success");
            }
          }
        };

        btnRow.appendChild(uploadBtn);
        btnRow.appendChild(urlBtn);
        selfSection.appendChild(preview);
        selfSection.appendChild(btnRow);

        // Profil kartının üstüne ekle
        proMain.parentNode.insertBefore(selfSection, proMain);

        // Profil kartı tasarım iyileştirme
        var ps = document.createElement("style");
        ps.textContent = ".modal-content{border-radius:16px!important;overflow:hidden!important;max-width:440px!important}.profile-pro-card{border:none!important}.profile-pro-banner{height:120px!important}";
        document.head.appendChild(ps);
      };
    }
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
      patchDMCloseButton();
      patchOpenDM();
      patchContextMenu();
      patchGameActivity();
      patchClearMessages();
      patchServerRail();
      patchPasswordSystem();
      patchFriendRequestSystem();
      patchProfileSystem();
      patchStatusBar();
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
