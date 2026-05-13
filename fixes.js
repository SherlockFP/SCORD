(function () {
  "use strict";
  var _API = typeof API_BASE !== "undefined" ? API_BASE : "/api";

  /* ── Safe localStorage helpers ──────────────────────── */
  function safeGet(key, def) {
    try { return localStorage.getItem(key); } catch (e) { return def !== undefined ? def : null; }
  }
  function safeSet(key, val) {
    try { localStorage.setItem(key, val); return true; } catch (e) { return false; }
  }
  function safeRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }
  function safeJSON(key, def) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function safeJSONset(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  }

  /* ── Global safe localStorage wrapper ─────────────── */
  (function () {
    var _origGet = Storage.prototype.getItem;
    var _origSet = Storage.prototype.setItem;
    var _origRemove = Storage.prototype.removeItem;
    if (!_origGet._patched) {
      Storage.prototype.getItem = function (key) {
        try { return _origGet.call(this, key); } catch (e) { return null; }
      };
      Storage.prototype.getItem._patched = true;
      Storage.prototype.setItem = function (key, val) {
        try { _origSet.call(this, key, val); } catch (e) {}
      };
      Storage.prototype.removeItem = function (key) {
        try { _origRemove.call(this, key); } catch (e) {}
      };
    }
  })();

  /* ── Global safeFetch wrapper ──────────────────────── */
  var _origFetch = window.fetch;
  window.fetch = function (url, opts) {
    return _origFetch.call(window, url, opts).catch(function (err) {
      console.warn("[fetch] Failed:", url, err);
      return new Response(JSON.stringify({ error: err.message, success: false }), {
        status: 503, headers: { "Content-Type": "application/json" }
      });
    });
  };

  /* ══════════════════════════════════════════════════════════
     PERFORMANS İYİLEŞTİRMELERİ — Genel Site Kasması Fix
  ══════════════════════════════════════════════════════════ */

  (function _perfOptimizations() {
    // Debounce utility
    window._debounce = function (fn, ms) {
      var tm = null;
      return function () {
        if (tm) clearTimeout(tm);
        tm = setTimeout(function () { fn.apply(this, arguments); }, ms || 16);
      };
    };

    // Throttle utility - for scroll, resize, mousemove
    var _scrollThrottle = null;
    var _resizeThrottle = null;
    var _mousemoveThrottle = null;

    // Patch scroll handler
    var _origScroll = null;
    document.addEventListener("scroll", function(e) {
      if (_scrollThrottle) return;
      _scrollThrottle = setTimeout(function() { _scrollThrottle = null; }, 50);
      if (typeof window.updateLastActive === "function") window.updateLastActive(e);
    }, { passive: true });

    // Patch resize handler
    window.addEventListener("resize", function(e) {
      if (_resizeThrottle) return;
      _resizeThrottle = setTimeout(function() { _resizeThrottle = null; }, 100);
    }, { passive: true });

    // Cache frequently accessed DOM elements
    window._domCache = {};
    window._getCachedEl = function (id) {
      var el = document.getElementById(id);
      if (el) window._domCache[id] = el;
      return el;
    };
    
    // HTML escape helper - özel karakterleri temizle
    window._escapeHtml = function (str) {
      if (!str && str !== 0) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    // CSS will-change optimization - GPU acceleration
    var perfStyle = document.createElement("style");
    perfStyle.id = "scord-perf-gpu";
    perfStyle.textContent = `
      /* GPU Acceleration for animations */
      .rail-icon, .server-rail-icon, .channel-icon, .member-avatar {
        will-change: transform;
        transform: translateZ(0);
        backface-visibility: hidden;
      }
      
      /* Smooth scrolling */
      .messages-area, .channel-list, .members-list, .dm-body {
        scroll-behavior: smooth;
        -webkit-overflow-scrolling: touch;
      }
      
      /* Optimize scrollbars */
      *::-webkit-scrollbar { width: 6px; height: 6px; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-thumb { 
        background: rgba(255,255,255,0.15); 
        border-radius: 3px; 
      }
      *::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.25); }
      
      /* Reduced motion support */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after {
          animation-duration: 0.01ms !important;
          transition-duration: 0.01ms !important;
        }
      }
    `;
    document.head.appendChild(perfStyle);

    console.log("[Fixes] Performans iyileştirmeleri yüklendi (v2.4)");
  })();

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
    var v = parseFloat(safeGet("scord_sfx_volume") ?? "0.35");
    return isNaN(v) ? 0.35 : Math.max(0, Math.min(1, v));
  }

  function sfxEn() { return safeGet("scord_sfx_enabled") !== "false"; }

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
    // Tüm persistence katmanlarını temizle
    if (typeof removeServerFromStorage === "function") removeServerFromStorage(serverId); // scord_saved_servers
    try { localStorage.removeItem("scord_server_" + serverId); } catch (e) {} // V20 per-server key
    // Left servers listesine ekle (reload'da tekrar gelmesin)
    try {
      var leftList = JSON.parse(localStorage.getItem("scord_left_servers") || "[]");
      if (leftList.indexOf(serverId) === -1) {
        leftList.push(serverId);
        localStorage.setItem("scord_left_servers", JSON.stringify(leftList));
      }
    } catch (e) {}
    // Identity'deki servers listesini güncelle
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
     14. MÜZİK BOTU FİX — Minize edilebilir player
  ══════════════════════════════════════════════════════════ */

  var _musicExpanded = false;

  var _currentVideoId = null;

  function _startMusicFix(videoId, startAt) {
    _stopMusicFix();
    _currentVideoId = videoId;
    _musicExpanded = false; // Başlangıçta KÜÇÜK

    var container = document.createElement("div");
    container.id = "music-player-dock";
    // Küçük dock - sağ alt köşe
    container.style.cssText = "position:fixed;bottom:80px;right:20px;width:360px;z-index:99999;border-radius:12px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.6);background:#18181b;font-family:Inter,sans-serif;border:1px solid #333;transition:all 0.3s ease;";

    // Mini bar (her zaman görünür)
    var bar = document.createElement("div");
    bar.id = "music-mini-bar";
    bar.style.cssText = "display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;height:48px;box-sizing:border-box;background:linear-gradient(90deg,#1a1a2e,#16213e);";
    bar.onclick = function () { _toggleMusicPlayer(); };

    var icon = document.createElement("span");
    icon.textContent = "🎵";
    icon.style.cssText = "font-size:20px;flex-shrink:0;";

    var info = document.createElement("div");
    info.style.cssText = "flex:1;min-width:0;";
    var title = document.createElement("div");
    title.style.cssText = "color:#fff;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    title.textContent = "Müzik";
    var subtitle = document.createElement("div");
    subtitle.style.cssText = "color:#a1a1aa;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    subtitle.textContent = videoId;
    info.appendChild(title);
    info.appendChild(subtitle);

    var barControls = document.createElement("div");
    barControls.style.cssText = "display:flex;gap:4px;align-items:center;flex-shrink:0;";

    var expandBtn = document.createElement("button");
    expandBtn.innerHTML = "⏏";
    expandBtn.title = "Genişlet";
    expandBtn.style.cssText = "width:28px;height:28px;border:none;border-radius:6px;background:rgba(255,255,255,0.1);color:#fff;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;";
    expandBtn.onclick = function (e) { e.stopPropagation(); _toggleMusicPlayer(); };

    var closeBtn = document.createElement("button");
    closeBtn.innerHTML = "✕";
    closeBtn.title = "Kapat";
    closeBtn.style.cssText = "width:28px;height:28px;border:none;border-radius:6px;background:rgba(255,255,255,0.1);color:#a1a1aa;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;";
    closeBtn.onclick = function (e) { e.stopPropagation(); _stopMusicFix(); };

    barControls.appendChild(expandBtn);
    barControls.appendChild(closeBtn);

    bar.appendChild(icon);
    bar.appendChild(info);
    bar.appendChild(barControls);
    container.appendChild(bar);

    // Player wrap (genişletince görünür)
    var playerWrap = document.createElement("div");
    playerWrap.id = "music-player-wrap";
    playerWrap.style.cssText = "display:none;background:#000;transition:all 0.3s ease;";
    
    var iframe = document.createElement("iframe");
    iframe.id = "yt-embed-fix";
    iframe.style.cssText = "width:100%;height:240px;border:none;display:block;";
    iframe.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.title = "YouTube Player";
    
    // mute=1 ile başlat (tarayıcı otoplay politikası)
    var embedUrl = "https://www.youtube.com/embed/" + videoId + "?autoplay=1&mute=1&controls=1&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&origin=" + encodeURIComponent(location.origin);
    iframe.src = embedUrl;
    
    playerWrap.appendChild(iframe);
    
    // Unmute butonu + volume slider
    var unmuteBar = document.createElement("div");
    unmuteBar.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 14px;background:rgba(99,102,241,0.15);border-top:1px solid #333;";
    var unmuteBtn = document.createElement("button");
    unmuteBtn.id = "yt-unmute-btn";
    unmuteBtn.innerHTML = "🔇 Sesi Aç";
    unmuteBtn.title = "Sesi açmak için tıkla";
    unmuteBtn.style.cssText = "padding:6px 12px;border:none;border-radius:6px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;cursor:pointer;font-size:11px;font-weight:600;white-space:nowrap;";
    unmuteBtn.onclick = function (e) {
      e.stopPropagation();
      var ifr = document.getElementById("yt-embed-fix");
      if (ifr) {
        var parent = ifr.parentNode;
        var newIfr = document.createElement("iframe");
        newIfr.id = "yt-embed-fix";
        newIfr.style.cssText = ifr.style.cssText;
        newIfr.allow = ifr.allow;
        newIfr.allowFullscreen = true;
        newIfr.title = "YouTube Player";
        newIfr.src = "https://www.youtube.com/embed/" + _currentVideoId + "?autoplay=1&mute=0&controls=1&modestbranding=1&rel=0&playsinline=1&enablejsapi=1&origin=" + encodeURIComponent(location.origin);
        ifr.remove();
        parent.appendChild(newIfr);
        unmuteBtn.innerHTML = "✅ Ses";
        unmuteBtn.style.background = "linear-gradient(135deg,#22c55e,#16a34a)";
        unmuteBtn.disabled = true;
        // Volume slider'ı enable et
        var vs = document.getElementById("yt-vol-slider");
        if (vs) { vs.disabled = false; vs.style.opacity = "1"; }
        if (typeof toast === "function") toast("🔊 Ses açıldı!", "success");
      }
    };
    unmuteBar.appendChild(unmuteBtn);
    
    // Volume slider
    var volLabel = document.createElement("span");
    volLabel.textContent = "🔊";
    volLabel.style.cssText = "font-size:14px;flex-shrink:0;";
    var volSlider = document.createElement("input");
    volSlider.type = "range";
    volSlider.id = "yt-vol-slider";
    volSlider.min = "0";
    volSlider.max = "100";
    volSlider.value = "50";
    volSlider.disabled = true;
    volSlider.style.cssText = "flex:1;min-width:60px;height:4px;accent-color:#6366f1;opacity:0.5;cursor:pointer;";
    volSlider.oninput = function (e) {
      e.stopPropagation();
      var val = parseInt(this.value);
      // YouTube iframe'e volume komutu gönder
      var ifr = document.getElementById("yt-embed-fix");
      if (ifr && ifr.contentWindow) {
        try {
          ifr.contentWindow.postMessage(JSON.stringify({
            event: "command",
            func: "setVolume",
            args: [val]
          }), "*");
        } catch (err) {}
      }
    };
    unmuteBar.appendChild(volLabel);
    unmuteBar.appendChild(volSlider);
    playerWrap.appendChild(unmuteBar);
    
    container.appendChild(playerWrap);

    document.body.appendChild(container);
    console.log("[Fixes] Music player started (compact), videoId:", videoId);
  }

  function _toggleMusicPlayer() {
    var pw = document.getElementById("music-player-wrap");
    var container = document.getElementById("music-player-dock");
    if (!pw || !container) return;
    
    if (_musicExpanded) {
      // Küçült
      pw.style.display = "none";
      container.style.width = "360px";
      _musicExpanded = false;
    } else {
      // Büyüt
      pw.style.display = "block";
      container.style.width = "480px";
      _musicExpanded = true;
    }
  }

  function _stopMusicFix() {
    var dock = document.getElementById("music-player-dock");
    var iframe = document.getElementById("yt-embed-fix");
    if (iframe) { iframe.src = ""; iframe.remove(); }
    if (dock) dock.remove();
    _musicExpanded = false;
    _currentVideoId = null;
  }

  function patchMusicBot() {
    // startMusicBot'u patch'le
    if (typeof window.startMusicBot === "function" && !window._musicBotPatched) {
      window._musicBotPatched = true;
      var _origSMB = window.startMusicBot;
      window.startMusicBot = function (videoId, startAt) {
        console.log("[Fixes] startMusicBot called with videoId:", videoId);
        try { _origSMB(videoId, startAt); } catch (e) { console.error("[Fixes] startMusicBot error:", e); }
        _startMusicFix(videoId, startAt);
      };
    }
    
    // P2P music_play dinle
    var _origP2P = window.handleIncomingP2P;
    if (_origP2P) {
      window.handleIncomingP2P = function (fromPeerId, data, roomId) {
        if (data?.type === "music_play" && data.videoId) {
          if (window.state?.voiceChannelId) _startMusicFix(data.videoId, data.startAt || 0);
          return;
        }
        if (data?.type === "music_stop") { _stopMusicFix(); return; }
        return _origP2P.apply(this, arguments);
      };
    }

    // handleServerMessage'dan music_play dinle
    if (typeof window.handleServerMessage === "function") {
      var _origHSM = window.handleServerMessage;
      window.handleServerMessage = function (data) {
        if (data?.type === "music_play" && data.videoId) {
          if (window.state?.voiceChannelId) _startMusicFix(data.videoId, data.startAt || 0);
          return;
        }
        if (data?.type === "music_stop") { _stopMusicFix(); return; }
        return _origHSM.apply(this, arguments);
      };
    }
    
    // leaveVoiceChannel'da müziği durdur
    var _origLVC = window.leaveVoiceChannel;
    if (_origLVC) {
      window.leaveVoiceChannel = function () {
        _stopMusicFix();
        return _origLVC.apply(this, arguments);
      };
    }

    window.stopMusicBot = function () { _stopMusicFix(); };
    window.pauseMusicBot = function () {
      var iframe = document.getElementById("yt-embed-fix");
      if (iframe) iframe.src = iframe.src.replace("autoplay=1", "autoplay=0");
    };
    window.resumeMusicBot = function () {
      var iframe = document.getElementById("yt-embed-fix");
      if (iframe) iframe.src = iframe.src.replace("autoplay=0", "autoplay=1");
    };
    
    console.log("[Fixes] Music bot patches applied");
  }
      
      // P2P music play mesajlarını dinle
      var _origP2P = window.handleIncomingP2P;
      if (_origP2P) {
        window.handleIncomingP2P = function (fromPeerId, data, roomId) {
          if (data?.type === "music_play" && data.videoId) {
            console.log("[Fixes] P2P music_play received:", data.videoId);
            if (window.state?.voiceChannelId) _startMusicFix(data.videoId, data.startAt || 0);
            return;
          }
          if (data?.type === "music_stop") { _stopMusicFix(); return; }
          return _origP2P.apply(this, arguments);
        };
      }
      
      // handleServerMessage'dan da music_play dinle
      var _origHSM = window.handleServerMessage;
      if (_origHSM) {
        window.handleServerMessage = function (data) {
          if (data?.type === "music_play" && data.videoId) {
            console.log("[Fixes] Server message music_play:", data.videoId);
            if (window.state?.voiceChannelId) _startMusicFix(data.videoId, data.startAt || 0);
            return;
          }
          if (data?.type === "music_stop") { _stopMusicFix(); return; }
          return _origHSM.apply(this, arguments);
        };
      }
      
      // leaveVoiceChannel'da müziği durdur
      var _origLVC = window.leaveVoiceChannel;
      if (_origLVC) {
        window.leaveVoiceChannel = function () {
          _stopMusicFix();
          return _origLVC.apply(this, arguments);
        };
      }
      
      console.log("[Fixes] Music bot patches applied");
    }, 500);

    var _origP2P = window.handleIncomingP2P;
    if (_origP2P) {
      window.handleIncomingP2P = function (fromPeerId, data, roomId) {
        if (data?.type === "music_play" && data.videoId) {
          if (window.state?.voiceChannelId) _startMusicFix(data.videoId, data.startAt || 0);
          return;
        }
        if (data?.type === "music_stop") { _stopMusicFix(); return; }
        return _origP2P.apply(this, arguments);
      };
    }

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

    window.stopMusicBot = function () { _stopMusicFix(); };
    window.pauseMusicBot = function () {
      var iframe = document.getElementById("yt-embed-fix");
      if (iframe) iframe.src = iframe.src.replace("autoplay=1", "autoplay=0");
    };
    window.resumeMusicBot = function () {
      var iframe = document.getElementById("yt-embed-fix");
      if (iframe) iframe.src = iframe.src.replace("autoplay=0", "autoplay=1");
    };
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

  function patchThreadBug() {
    var _origCT = window.createThread;
    if (!_origCT) return;
    window.createThread = function (serverId, channelId, parentMessageId) {
      var ctxMenu = document.getElementById("ctx-menu");
      if (ctxMenu) ctxMenu.remove();
      var otherMenus = document.querySelectorAll("[id*='ctx'], .ctx-menu, .dropdown-menu");
      otherMenus.forEach(function (el) { if (el.id !== "ctx-menu") el.remove(); });
      return _origCT.apply(this, arguments);
    };

    var _origOTV = window.openThreadView;
    if (_origOTV) {
      window.openThreadView = function (serverId, threadId) {
        document.querySelectorAll(".ctx-menu, [id*='ctx-menu'], .dropdown").forEach(function (el) { el.remove(); });
        return _origOTV.apply(this, arguments);
      };
    }
  }

  function patchDMContextMenu() {
    var _origRDM = window.renderDMMessages;
    if (!_origRDM) return;
    window.renderDMMessages = function (peerId) {
      var result = _origRDM.apply(this, arguments);
      setTimeout(function () {
        var rows = document.querySelectorAll(".dm-msg-row");
        rows.forEach(function (row) {
          if (row.dataset.dmCtxAdded) return;
          row.dataset.dmCtxAdded = "1";
          row.addEventListener("contextmenu", function (e) {
            e.preventDefault();
            var messages = window.state?.dms?.[peerId] || [];
            var idx = Array.from(row.parentElement.children).indexOf(row);
            var msg = messages[idx];
            if (!msg) return;
            showDMContextMenu(e.clientX, e.clientY, msg, peerId);
          });
        });
      }, 100);
      return result;
    };
  }

  function showDMContextMenu(x, y, msg, peerId) {
    document.querySelectorAll(".ctx-menu, .dm-ctx-menu").forEach(function (el) { el.remove(); });
    var isOwn = msg.authorId === window.state?.peerId;
    var username = msg.author || "Kullanici";
    var isBlocked = window.state?.blockedPeers?.includes(peerId);
    var dmMuted = JSON.parse(localStorage.getItem("scord_dm_muted") || "[]").includes(peerId);

    var menu = document.createElement("div");
    menu.className = "ctx-menu dm-ctx-menu";
    menu.id = "dm-ctx-menu";
    menu.style.cssText = "position:fixed;left:" + Math.min(x, window.innerWidth - 220) + "px;top:" + Math.min(y, window.innerHeight - 300) + "px;z-index:100000;min-width:180px;background:var(--bg-elevated);border:1px solid var(--border);border-radius:8px;padding:6px 0;box-shadow:0 4px 20px rgba(0,0,0,0.4);";

    function addItem(icon, label, action, danger) {
      var item = document.createElement("div");
      item.style.cssText = "padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-normal);" + (danger ? "color:#ed4245;" : "");
      item.innerHTML = '<span style="font-size:14px;">' + icon + '</span><span>' + label + '</span>';
      item.onclick = function () { menu.remove(); action(); };
      menu.appendChild(item);
    }

    addItem("✂️", "Metni Kopyala", function () {
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(msg.text || "");
    });

    if (isOwn) {
      addItem("🗑️", "Mesajı Sil", function () {
        var msgs = window.state.dms?.[peerId] || [];
        var idx = msgs.findIndex(function (m) { return m.id === msg.id; });
        if (idx !== -1) { msgs.splice(idx, 1); window.renderDMMessages(peerId); }
        var stored = JSON.parse(localStorage.getItem("scord_dms") || "{}");
        if (stored[peerId]) {
          stored[peerId] = stored[peerId].filter(function (m) { return m.id !== msg.id; });
          localStorage.setItem("scord_dms", JSON.stringify(stored));
        }
      }, true);
    }

    addItem(isBlocked ? "✅" : "🚫", isBlocked ? "Engeli Kaldır" : "Kişiyi Engelle", function () {
      if (!window.state.blockedPeers) window.state.blockedPeers = [];
      var idx = window.state.blockedPeers.indexOf(peerId);
      if (idx !== -1) { window.state.blockedPeers.splice(idx, 1); toast("@" + username + " engeli kaldırıldı.", "success"); }
      else { window.state.blockedPeers.push(peerId); toast("@" + username + " engellendi.", "info"); }
      localStorage.setItem("scord_blocked_peers", JSON.stringify(window.state.blockedPeers));
    }, !isBlocked);

    addItem(dmMuted ? "🔔" : "🔇", dmMuted ? "Bildirimleri Aç" : "Sessize Al", function () {
      var muted = JSON.parse(localStorage.getItem("scord_dm_muted") || "[]");
      var idx = muted.indexOf(peerId);
      if (idx !== -1) { muted.splice(idx, 1); toast("DM bildirimleri açıldı.", "success"); }
      else { muted.push(peerId); toast("DM sessize alındı.", "info"); }
      localStorage.setItem("scord_dm_muted", JSON.stringify(muted));
    });

    addItem("❌", "Konuşmayı Sil", function () {
      if (!confirm("@" + username + " ile olan tüm mesajları silmek istediğine emin misin?")) return;
      if (window.state?.dms) delete window.state.dms[peerId];
      var stored = JSON.parse(localStorage.getItem("scord_dms") || "{}");
      delete stored[peerId];
      localStorage.setItem("scord_dms", JSON.stringify(stored));
      if (window.state?.recentDMs) {
        window.state.recentDMs = window.state.recentDMs.filter(function (d) { return d.peerId !== peerId; });
        localStorage.setItem("scord_recent_dms", JSON.stringify(window.state.recentDMs));
      }
      window.state.activeDM = null;
      var ov = document.getElementById("dm-overlay");
      if (ov) ov.classList.add("hidden");
      var main = document.getElementById("dm-main-view");
      if (main) main.classList.add("hidden");
      if (typeof window.renderHomeSidebar === "function") window.renderHomeSidebar();
      toast("Konuşma silindi.", "info");
    }, true);

    document.body.appendChild(menu);
    setTimeout(function () {
      document.addEventListener("click", function handler(e) {
        menu.remove();
        document.removeEventListener("click", handler);
      });
    }, 0);
  }

  function fixChatDesign() {
    var style = document.createElement("style");
    style.id = "scord-chat-design-fix";
    style.textContent = `
      #chat-channel-name { display: none !important; }
      .chat-header .header-right { display: none !important; }
      #active-channel-name { font-size: 16px !important; font-weight: 600 !important; color: var(--text-normal) !important; }
      .channel-hash { color: var(--text-muted) !important; font-size: 18px !important; margin-right: 4px !important; }
      .chat-header { background: var(--bg-elevated) !important; border-bottom: 1px solid var(--border) !important; padding: 12px 16px !important; }
      .chat-header .header-left { display: flex !important; align-items: center !important; gap: 8px !important; }
    `;
    document.head.appendChild(style);
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

    var _gaObsTimer = null;
    var homeObs = new MutationObserver(function () {
      if (_gaObsTimer) return;
      _gaObsTimer = setTimeout(function () { _gaObsTimer = null; addGameBtn(); }, 300);
    });
    // Optimize: Sadece home-view'ı izle, tüm body'yi değil
    setTimeout(function () {
      var homeView = document.getElementById("home-view") || document.querySelector(".home-view");
      if (homeView) homeObs.observe(homeView, { childList: true, subtree: true });
      else homeObs.observe(document.body, { childList: true, subtree: true });
    }, 1000);

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

    // Şifre Sistemi Başlangıcı - Sadece state hazırsa çalış
    // NOT: Oto-giriş burada DEĞİL, startApp sonrasında patch'le

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

      // HER ZAMAN username'i set et, böylece _saveIdentity null kaydetmez
      window.state.username = nick;

      if (!stored) {
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
        // Mevcut identity'den username varsa onu kullan, yoksa nick kullan
        if (data.username) window.state.username = data.username;
        else window.state.username = nick;
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
        window.state.username = nick;
        isNew = true;
        if (typeof toast === "function") toast("Yeni kimlik: " + window._formatTag(nick, disc), "success");
      }

      // peerId yoksa oluştur
      if (!window.state.peerId) window.state.peerId = genId();

      window.state._savedNick = nick;
      window.state._savedPass = pass;
      safeSet("scord_username", nick);
      safeSet("scord_last_nick", nick);
      safeSet("scord_last_pass", pass);
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

    // Sadece user-bar-name elementini izle - document.body DEĞİL, performans
    setTimeout(function () {
      var nameParent = document.getElementById("user-bar-name")?.parentNode;
      if (nameParent) {
        var tagObs = new MutationObserver(updateUserBarTag);
        tagObs.observe(nameParent, { childList: true, subtree: true });
      }
    }, 1000);

    // Setup ekranına şifre alanı ekle
    var setupCheck = setInterval(function () {
      var setupOverlay = document.getElementById("setup-overlay");
      var setupCard = setupOverlay ? setupOverlay.querySelector(".setup-card") : null;
      
      // Henüz setup overlay görünmüyor, bekle
      if (!setupCard) return;
      
      // Şifre alanı zaten eklenmiş - işlem tamam, interval'i temizle
      if (setupCard.querySelector(".setup-pass-field")) {
        clearInterval(setupCheck);
        return;
      }
      clearInterval(setupCheck);

      var lastNick = localStorage.getItem("scord_last_nick");
      var lastPass = localStorage.getItem("scord_last_pass");

      // Otomatik giriş yap - ZATEN yapıldı, tekrar yapma
      if (lastNick && lastPass && window.state._autoLoginDone) {
        // Setup overlay'ü gizle - zaten giriş yapıldı
        if (setupOverlay) setupOverlay.style.display = "none";
        if (typeof startApp === "function") startApp();
        return;
      }

      // Normal giriş (henüz yapılmadıysa)
      if (lastNick && lastPass && !window.state._autoLoginDone) {
        var ok = window.loginWithPassword(lastNick, lastPass);
        if (ok) {
          window.state._autoLoginDone = true;
          if (typeof startApp === "function") {
            var nickInput = document.getElementById("username-input");
            if (nickInput) nickInput.value = lastNick;
            startApp();
          }
          return;
        }
      }

      // Şifre alanını ekle
      var formGroup = setupCard.querySelector(".form-group");
      var nickLabel = setupCard.querySelector("label[for]");
      var passHtml = '<div class="form-group setup-pass-field" style="margin-top:12px;"><label for="setup-password">Şifre</label><input id="setup-password" type="password" placeholder="Şifreni belirle veya mevcut hesabınla giriş yap..." maxlength="64" autocomplete="off" style="width:100%;padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:rgba(255,255,255,0.06);color:#fff;font-size:14px;outline:none;box-sizing:border-box;" /></div>';
      if (formGroup && formGroup.parentNode) {
        formGroup.insertAdjacentHTML("afterend", passHtml);
      }

      // Başlığı güncelle
      var setupTitle = setupCard.querySelector("h2") || setupCard.querySelector(".setup-title");
      if (setupTitle) setupTitle.textContent = "Scord\'a Hoş Geldin";

      // Enter butonunu patch'le - ORİJİNAL handler'ı KALDIR
      var enterBtn = setupCard.querySelector("#enter-btn");
      var nickInput = document.getElementById("username-input");
      if (enterBtn) {
        enterBtn.textContent = lastNick ? "Giriş Yap" : "Kayıt Ol";
        // Orijinal handler'ı kaldırmak için butonu klonla (cloneNode listener'ları kopyalamaz)
        var newBtn = enterBtn.cloneNode(true);
        if (enterBtn.parentNode) enterBtn.parentNode.replaceChild(newBtn, enterBtn);

        // Disabled state'ini yönet - nick + pass kontrolü
        function _updateDisabled() {
          var n = document.getElementById("username-input")?.value?.trim();
          var p = document.getElementById("setup-password")?.value || "";
          newBtn.disabled = !n || !p;
        }
        // İlk durumu ayarla
        var savedNick = document.getElementById("username-input")?.value?.trim();
        if (lastNick && savedNick) newBtn.disabled = false;
        else newBtn.disabled = true;
        // Input değişikliklerini dinle
        var _ni = document.getElementById("username-input");
        var _pi = document.getElementById("setup-password");
        if (_ni) _ni.addEventListener("input", _updateDisabled);
        if (_pi) _pi.addEventListener("input", _updateDisabled);
        
        // ORİJİNAL Enter handler'ını devre dışı bırak (çift startApp sorunu)
        // Capture phase ile Enter tuşunu engelle
        if (_ni) {
          _ni.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
              e.stopPropagation();
              e.preventDefault();
              if (!newBtn.disabled) newBtn.click();
            }
          }, true);
        }
        // Şifre input'unda da Enter handler'ı
        if (_pi) {
          _pi.addEventListener("keydown", function(e) {
            if (e.key === "Enter" && !newBtn.disabled) {
              newBtn.click();
            }
          });
        }

        newBtn.onclick = function (e) {
          var nick = document.getElementById("username-input")?.value?.trim();
          var pass = document.getElementById("setup-password")?.value || "";
          if (!nick) { if (typeof toast === "function") toast("Kullanıcı adı gerekli.", "error"); return; }
          if (!pass) { if (typeof toast === "function") toast("Şifre gerekli.", "error"); return; }
          
          // loginWithPassword çağır - state.username + localStorage ayarlanır
          var ok = window.loginWithPassword(nick, pass);
          if (ok) {
            // state.username zaten loginWithPassword tarafından ayarlandı
            // peerId yoksa oluştur
            if (!window.state.peerId) window.state.peerId = genId();
            
            // startApp'i çağır - flag'i startApp patch'inin KENDİSİ yönetir
            if (typeof startApp === "function") {
              try { 
                console.log("[Fixes] Calling startApp for:", nick);
                startApp(); 
              } catch (e) { 
                console.error("[Fixes] startApp error:", e);
                var overlay = document.getElementById("setup-overlay");
                if (overlay) { overlay.classList.remove("active"); overlay.style.display = "none"; }
                var appEl = document.getElementById("app");
                if (appEl) appEl.classList.remove("hidden");
              }
            } else {
              var overlay = document.getElementById("setup-overlay");
              if (overlay) { overlay.classList.remove("active"); overlay.style.display = "none"; }
              var appEl = document.getElementById("app");
              if (appEl) appEl.classList.remove("hidden");
            }
          }
        };
      }
    }, 200);

    // Kullanıcı barında discriminator güncelleme
    function _updateDiscTag() {
      var nameEl = document.getElementById("user-bar-name");
      if (!nameEl) return;
      var nick = window.state?._savedNick || window.state?.username;
      var disc = window.state?._discriminator;
      if (nick && disc) nameEl.textContent = nick + "#" + disc;
    }

    if (document.getElementById("setup-overlay") && !document.getElementById("setup-overlay").classList.contains("active")) {
      setTimeout(_updateDiscTag, 1000);
    }

    // startApp sonrasında "Anonim" sorununu düzelt - basit ve güvenli
    var _origSA = window.startApp;
    if (_origSA && !window._discTagFixed) {
      window._discTagFixed = true;
      window.startApp = function () {
        // Çift çağrı koruması
        if (window._startAppRunning) {
          console.log("[Fixes] startApp already running, skipping re-entry");
          return;
        }
        window._startAppRunning = true;
        
        // HEMEN username'i düzelt - app.js state'e bakmadan ÖNCE
        var savedNick = localStorage.getItem("scord_last_nick");
        if (savedNick && window.state) {
          window.state.username = savedNick;
          localStorage.setItem("scord_username", savedNick);
        }
        
        // Orijinal startApp'i çağır
        var result;
        try {
          result = _origSA.apply(this, arguments);
        } catch (e) {
          console.error("[Fixes] startApp error:", e);
        }
        
        // startApp bitti - flag'i temizle
        setTimeout(function () { window._startAppRunning = false; }, 100);
        
        // HEMEN username'i düzelt - app.js bitirdikten SONRA
        var nameEl = document.getElementById("user-bar-name");
        if (savedNick && nameEl) {
          localStorage.setItem("scord_username", savedNick);
          
          // discriminator'ı localStorage'dan al
          var storedId = localStorage.getItem("scord_id_" + savedNick.toLowerCase() + "_0001");
          var disc = "0001";
          if (storedId) {
            try {
              var idData = JSON.parse(storedId);
              disc = idData.discriminator || "0001";
              if (window.state && !window.state._discriminator) {
                window.state._discriminator = disc;
              }
            } catch (e) {}
          }
          
          // UI'ı güncelle
          nameEl.textContent = savedNick + "#" + disc;
          console.log("[Fixes] Fixed Anonim ->", savedNick + "#" + disc);
        } else {
          console.log("[Fixes] No savedNick found for Anonim fix, savedNick:", savedNick, "nameEl:", !!nameEl);
        }
        
        // 500ms sonra tekrar kontrol et (geç yüklenen elementler için)
        setTimeout(function () {
          var nameEl2 = document.getElementById("user-bar-name");
          var savedNick2 = localStorage.getItem("scord_last_nick");
          if (nameEl2 && savedNick2 && (nameEl2.textContent === "Anonim" || !nameEl2.textContent)) {
            // discriminator'ı localStorage'dan al
            var storedId2 = localStorage.getItem("scord_id_" + savedNick2.toLowerCase() + "_0001");
            var disc2 = "0001";
            if (storedId2) {
              try {
                var idData2 = JSON.parse(storedId2);
                disc2 = idData2.discriminator || "0001";
              } catch (e) {}
            }
            nameEl2.textContent = savedNick2 + "#" + disc2;
            if (window.state) window.state.username = savedNick2;
            localStorage.setItem("scord_username", savedNick2);
            console.log("[Fixes] Fixed Anonim (retry) ->", savedNick2 + "#" + disc2);
          }
        }, 500);
        
        return result;
      };
    }
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

    // Sunucu ayarlarına "Mesaj Geçmişini Temizle" butonu ekle - debounced
    var _cmObsTimer = null;
    var obs = new MutationObserver(function () {
      if (_cmObsTimer) return;
      _cmObsTimer = setTimeout(function () {
        _cmObsTimer = null;
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
      }, 300);
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
    // Sadece sidebar'ı izle, tüm body'yi değil
    setTimeout(function () {
      var sidebar = document.getElementById("channel-list") || document.getElementById("channel-sidebar");
      if (sidebar) { plusObs.observe(sidebar, { childList: true, subtree: true }); }
      else { plusObs.observe(document.body, { childList: true, subtree: true }); }
    }, 1000);

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

  function patchMemberStatus() {
    if (!window.state) window.state = {};
    if (!window.state.peerStatuses) window.state.peerStatuses = {};

    window.getMemberStatus = function (peerId) {
      if (peerId === window.state?.peerId) return window.state?.status || "online";
      return window.state?.peerStatuses?.[peerId]?.status || "offline";
    };

    window.getMemberStatusText = function (peerId) {
      var s = window.getMemberStatus(peerId);
      var icons = { online: "🟢", idle: "🟡", dnd: "🔴", offline: "⚫" };
      var labels = { online: "Çevrimiçi", idle: "Boşta", dnd: "Rahatsız Etmeyin", offline: "Çevrimdışı" };
      return (icons[s] || "⚫") + " " + (labels[s] || "Çevrimdışı");
    };

    var _origUpdateMembersPanel = window.updateMembersPanel;
    if (_origUpdateMembersPanel) {
      window.updateMembersPanel = function (serverId) {
        var r = _origUpdateMembersPanel.apply(this, arguments);
        var list = document.getElementById("members-list") || document.querySelector(".members-list");
        if (list) {
          list.querySelectorAll(".member-item").forEach(function (item) {
            var pid = item.dataset.peerId || item.dataset.memberId;
            if (!pid) return;
            var dot = item.querySelector(".member-status-dot, .status-dot");
            var txt = item.querySelector(".member-status-text, .status-text");
            if (dot) {
              var s = window.getMemberStatus(pid);
              var colors = { online: "#3ba55c", idle: "#faa61a", dnd: "#ed4245", offline: "#747f8d" };
              dot.style.background = colors[s] || "#747f8d";
            }
            if (txt) txt.textContent = window.getMemberStatusText(pid).slice(2);
          });
        }
        return r;
      };
    }

    var _origP2P = window.handleIncomingP2P;
    if (_origP2P) {
      window.handleIncomingP2P = function (fromPeerId, data, roomId) {
        if (data?.type === "status_update" || data?.type === "user_status") {
          if (!window.state.peerStatuses) window.state.peerStatuses = {};
          window.state.peerStatuses[fromPeerId] = {
            status: data.status || data.payload?.status || "online",
            customStatus: data.customStatus || data.payload?.customStatus || "",
            lastSeen: Date.now()
          };
          var list = document.getElementById("members-list") || document.querySelector(".members-list");
          if (list) {
            list.querySelectorAll(".member-item").forEach(function (item) {
              var pid = item.dataset.peerId || item.dataset.memberId;
              if (pid === fromPeerId) {
                var dot = item.querySelector(".member-status-dot, .status-dot");
                if (dot) {
                  var colors = { online: "#3ba55c", idle: "#faa61a", dnd: "#ed4245", offline: "#747f8d" };
                  dot.style.background = colors[window.state.peerStatuses[fromPeerId].status] || "#747f8d";
                }
              }
            });
          }
          return;
        }
        return _origP2P.apply(this, arguments);
      };
    }

    var _origHSP = window.handleServerMessage;
    if (_origHSP) {
      window.handleServerMessage = function (data) {
        if (data?.type === "status_update" || data?.type === "user_status") {
          var pid = data.from || data.peerId || data.userId;
          if (pid) {
            if (!window.state.peerStatuses) window.state.peerStatuses = {};
            window.state.peerStatuses[pid] = {
              status: data.status || data.payload?.status || "online",
              customStatus: data.customStatus || data.payload?.customStatus || "",
              lastSeen: Date.now()
            };
          }
          return;
        }
        return _origHSP.apply(this, arguments);
      };
    }

    // Kendi status'ümüzü periyodik olarak broadcast et
    function _broadcastMyStatus() {
      var mesh = window.state?.mesh;
      if (!mesh) return;
      var st = window.state?.status || "online";
      var cs = window.state?.customStatus || "";
      mesh.broadcast({ type: "user_status", status: st, customStatus: cs });
    }
    setInterval(_broadcastMyStatus, 30000);
    setTimeout(_broadcastMyStatus, 2000);
  }

  /* ══════════════════════════════════════════════════════════
     26. GENEL BUG FİXLERİ
  ══════════════════════════════════════════════════════════ */

  function patchGlobalBugs() {
    // 1) initSetup() double call fix
    var _origInitSetup = window.initSetup;
    if (typeof window.initSetup === "function") {
      var _setupCalled = false;
      window.initSetup = function () {
        if (_setupCalled) { console.warn("[fixes] initSetup blocked (double call)"); return; }
        _setupCalled = true;
        return _origInitSetup.apply(this, arguments);
      };
    }

    // 2) DM payload null check
    var _origSrvMsg = window.handleServerMessage;
    if (_origSrvMsg) {
      window.handleServerMessage = function (data) {
        if (data?.type === "dm" || data?.type === "text") {
          if (!data.payload) { console.warn("[fixes] DM with no payload, dropping"); return; }
        }
        return _origSrvMsg.apply(this, arguments);
      };
    }

    // 3) chatInput null check güvencesi
    var _safeChatInterval = setInterval(function () {
      var ci = document.getElementById("chat-input");
      if (!ci) return;
      clearInterval(_safeChatInterval);
      // Orijinal event listener'ların çalıştığından emin ol
      if (!ci.dataset._fixChecked) {
        ci.dataset._fixChecked = "1";
        ci.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && !e.shiftKey) {
            var sendBtn = document.getElementById("send-btn");
            if (sendBtn) sendBtn.click();
          }
        });
      }
    }, 500);

    // 4) handleIncomingP2P wrapper chain - app.js'deki local değişken fix
    // app.js'de onMessage callback'i bir local handleIncomingP2P değişkenini kullanır,
    // window.handleIncomingP2P'yi DEĞİL. fixes.js'deki wrapper'lar window sürümünü değiştirir
    // ama local değişken eski kalır. Bu nedenle en son window sürümünün 
    // local değişkene de atandığından emin olalım.
    // patchMusicBot ve patchMemberStatus zaten doğru chain yapıyor.
    // Burada sadece status handler'ların peerStatuses'e yazıldığını doğruluyoruz.
    if (window._p2pChainFixed) return; // sadece bir kere çalışsın
    window._p2pChainFixed = true;

    // 5) Ghost server temizliği - startApp'tan ÖNCE scord_left_servers'ı temizle
    // loadSavedServers() tüm scord_server_* anahtarlarını state.servers'a ekler.
    // Kullanıcının terk ettiği server'ları tekrar eklememek için "left list" kullan.
    if (!window._ghostCleanFixed) {
      window._ghostCleanFixed = true;
      try {
        var leftServers = JSON.parse(localStorage.getItem("scord_left_servers") || "[]");
        if (leftServers.length > 0) {
          leftServers.forEach(function (sid) {
            try { localStorage.removeItem("scord_server_" + sid); } catch (e) {}
          });
          // Ayrıca scord_saved_servers'dan da temizle
          try {
            var saved = JSON.parse(localStorage.getItem("scord_saved_servers") || "[]");
            var filtered = saved.filter(function (s) { return leftServers.indexOf(s.id) === -1; });
            if (saved.length !== filtered.length) {
              localStorage.setItem("scord_saved_servers", JSON.stringify(filtered));
            }
          } catch (e) {}
        }
      } catch (e) { console.warn("[fixes] Ghost pre-clean failed:", e); }
    }

    // 6) setStatus wrapper - çökme koruması + debounce
    if (typeof window.setStatus === "function" && !window._statusWrapFixed) {
      window._statusWrapFixed = true;
      var _origSetStatus = window.setStatus;
      var _statusTimer = null;
      window.setStatus = function (newStatus, customStatus, statusEmoji) {
        // Orijinal setStatus ZATEN updateMemberList() çağırıyor, ekstra çağırma
        try {
          _origSetStatus.apply(this, arguments);
        } catch (e) {
          console.error("[Fixes] setStatus error:", e);
          // Hata olursa state'i düzelt
          if (window.state) {
            window.state.status = newStatus || window.state.status || "online";
          }
        }
      };
    }
  }

  function patchStatusBar() {
    // Direkt showModal ile açılan status picker bazen çalışmıyor
    // Bunun yerine, kendi basit status picker'ımızı yapalım
    window._openStatusMenu = function () {
      var statusTypes = {
        online: { text: "Çevrimiçi", icon: "🟢", color: "#3ba55c" },
        idle: { text: "Boşta", icon: "🟡", color: "#faa61a" },
        dnd: { text: "Rahatsız Etmeyin", icon: "🔴", color: "#ed4245" },
        offline: { text: "Görünmez", icon: "⚫", color: "#747f8d" }
      };
      
      var menu = document.createElement("div");
      menu.id = "scord-status-menu";
      menu.style.cssText = "position:fixed;bottom:60px;left:10px;z-index:100000;background:#18181b;border:1px solid #333;border-radius:12px;padding:8px;box-shadow:0 8px 32px rgba(0,0,0,0.6);min-width:200px;";
      
      for (var key in statusTypes) {
        if (!statusTypes.hasOwnProperty(key)) continue;
        var s = statusTypes[key];
        var item = document.createElement("div");
        item.style.cssText = "padding:10px 14px;cursor:pointer;border-radius:8px;display:flex;align-items:center;gap:10px;font-size:14px;color:#ddd;transition:background 0.15s;";
        item.innerHTML = '<span style="font-size:18px;">' + s.icon + '</span><span>' + s.text + '</span>';
        item.onmouseover = function () { this.style.background = "rgba(255,255,255,0.08)"; };
        item.onmouseout = function () { this.style.background = "transparent"; };
        (function (k) {
          item.onclick = function () {
            if (typeof window.setStatus === "function") {
              window.setStatus(k, window.state?.customStatus || "", window.state?.statusEmoji || "");
            }
            var m = document.getElementById("scord-status-menu");
            if (m) m.remove();
          };
        })(key);
        menu.appendChild(item);
      }
      
      // Click outside to close
      document.addEventListener("click", function handler() {
        var m = document.getElementById("scord-status-menu");
        if (m) m.remove();
        document.removeEventListener("click", handler);
      }, { once: true });
      
      document.body.appendChild(menu);
    };
    
    // Status bar'a tıklanınca menüyü aç
    function setupStatusBar() {
      var bar = document.getElementById("status-bar");
      if (bar && !bar._scordStatusFixed) {
        bar._scordStatusFixed = true;
        bar.onclick = function (e) {
          e.stopPropagation();
          // Eğer showStatusPicker çalışıyorsa onu da dene, yoksa kendi menümüzü aç
          if (typeof window.showStatusPicker === "function") {
            window._openStatusMenu();
          } else {
            window._openStatusMenu();
          }
        };
        bar.style.cursor = "pointer";
      }
    }
    
    // setupStatusBar'ı sürekli kontrol et (DOM yeniden yüklenebilir)
    setInterval(setupStatusBar, 2000);
    setTimeout(setupStatusBar, 500);
    
    // updateStatusBar'ı HTML-güvenli patch'le - custom status özel karakterlerini escape et
    if (typeof window.STATUS_TYPES !== "undefined") {
      window.updateStatusBar = function () {
        var bar = document.getElementById("status-bar");
        if (!bar) return;

        var statusInfo = window.STATUS_TYPES[window.state?.status] || window.STATUS_TYPES?.online || { text: "Çevrimiçi", color: "#3ba55c" };
        var customStatus = window._escapeHtml(window.state?.customStatus || "");
        var statusEmoji = window.state?.statusEmoji || "";
        var gameActivity = window.state?.gameActivity;
        var activityHtml = "";
        
        if (gameActivity) {
          activityHtml = '<div class="status-activities">' + window._escapeHtml(gameActivity.name) + '</div>';
        }
        
        bar.innerHTML = 
          '<div class="status-indicator" style="--status-color:' + statusInfo.color + '" title="Durumu değiştirmek için tıkla">' +
            '<span class="status-dot"></span>' +
            '<span class="status-text">' + window._escapeHtml(statusInfo.text) + '</span>' +
          '</div>' +
          '<div class="status-custom">' +
            (statusEmoji ? '<span class="status-emoji">' + window._escapeHtml(statusEmoji) + '</span>' : "") +
            (customStatus ? '<span class="custom-status-text">' + customStatus + '</span>' : "") +
          '</div>' +
          activityHtml;
          
        setupStatusBar();
      };
    } else {
      // Fallback: eski patch
      var _origUSB = window.updateStatusBar;
      if (_origUSB) {
        window.updateStatusBar = function () {
          _origUSB.apply(this, arguments);
          setupStatusBar();
        };
      }
    }
    
    console.log("[Fixes] Status bar patched");
  }

  /* ══════════════════════════════════════════════════════════
     26. PROFİL — Nick tıklayınca kendi profil + avatar önizleme
  ══════════════════════════════════════════════════════════ */

  function patchProfileSystem() {
    // Nick'e tıklayınca kendi profili
    var _profileCheck = setInterval(function () {
      var nameEl = document.getElementById("user-bar-name");
      if (nameEl) {
        if (!nameEl.dataset.profilePatched) {
          nameEl.dataset.profilePatched = "1";
          nameEl.style.cursor = "pointer";
          nameEl.title = "Profilini Görüntüle (tıkla)";
          nameEl.onclick = function () {
            if (typeof openUserProfile === "function") {
              openUserProfile(window.state?.peerId, window.state?.username || window.state?.name, window.state?.avatarImage, window.state?.avatarColor);
            }
          };
        }
        clearInterval(_profileCheck);
      }
    }, 500);

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
    console.log("[Fixes] v2.4 - Starting...");
    applyPerf();
    applyChatStyle();
    patchThemeColors();

    function ready() {
      console.log("[Fixes] Ready, applying patches...");
      patchSaveServerSettings();
      patchWSHandler();
      hookSounds();
      enhanceDMOverlay();
      patchMusicBot();
      patchMessageDeletePermission();
      patchDMCloseButton();
      patchOpenDM();
      patchContextMenu();
      patchThreadBug();
      fixChatDesign();
      patchDMContextMenu();
      patchGameActivity();
      patchClearMessages();
      patchServerRail();
      patchMemberStatus();
      patchPasswordSystem();
      patchGlobalBugs();
      patchFriendRequestSystem();
      patchProfileSystem();
      patchStatusBar();
      patchPerformance();
      patchAnimatedEmojis();
      patchDiscordAnimations();
      patchServerIcons();
      patchScreenShare();

      var _obsTimer = null;
      var obs = new MutationObserver(function () {
        if (_obsTimer) return;
        _obsTimer = setTimeout(function () {
          _obsTimer = null;
          enhanceDMOverlay();
          enhanceDMSidebar();
        }, 300);
      });
      obs.observe(document.body, { childList: true, subtree: true });

      if (typeof window.applyChatCustomization === "function") window.applyChatCustomization();
      console.log("[Shercord Fixes] Tum duzeltmeler yuklendi.");
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
    else ready();
  }

  /* ══════════════════════════════════════════════════════════
     ANİMASYONLU EMOJİ DESTEĞİ - GIF/APNG
  ══════════════════════════════════════════════════════════ */

  function patchAnimatedEmojis() {
    // Animated emoji CSS
    var animStyle = document.createElement("style");
    animStyle.id = "scord-anim-emoji";
    animStyle.textContent = `
      /* Animated emoji support */
      .custom-emoji {
        image-rendering: auto;
        display: inline-block;
        vertical-align: middle;
      }
      .custom-emoji.animated {
        animation: emoji-bounce 0.3s ease;
      }
      .custom-emoji:hover {
        transform: scale(1.15);
      }
      @keyframes emoji-bounce {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.2); }
      }
      
      /* Reaction hover animation */
      .reaction-pill:hover {
        transform: scale(1.05);
        background: var(--bg-hover);
      }
      .reaction-pill {
        transition: transform 0.15s ease, background 0.15s ease;
      }
    `;
    document.head.appendChild(animStyle);

    // Intersection Observer for animated emojis (only animate when visible)
    if (typeof IntersectionObserver !== "undefined") {
      var emojiObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) {
            entry.target.play?.();
          } else {
            entry.target.pause?.();
          }
        });
      }, { threshold: 0.1 });
      window._emojiObserver = emojiObserver;
    }

    console.log("[Fixes] Animated emoji support enabled");
  }

  /* ══════════════════════════════════════════════════════════
     DISCORD TARZI UI ANİMASYONLARI
  ══════════════════════════════════════════════════════════ */

  function patchDiscordAnimations() {
    var animStyle = document.createElement("style");
    animStyle.id = "scord-discord-anim";
    animStyle.textContent = `
      /* Discord-style panel transitions */
      .panel, .modal, .ctx-menu {
        transition: opacity 0.2s ease, transform 0.2s ease;
      }
      
      /* Server icon hover animation - Discord style */
      .rail-icon, .server-rail-icon {
        transition: border-radius 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
      }
      .rail-icon:hover, .server-rail-icon:hover {
        border-radius: 16px !important;
        transform: scale(1.08);
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      }
      .rail-icon.active {
        border-radius: 16px !important;
      }
      
      /* Channel hover animation */
      .channel-item {
        transition: background 0.15s ease, transform 0.1s ease;
      }
      .channel-item:hover {
        background: var(--bg-hover);
        transform: translateX(2px);
      }
      
      /* Message hover */
      .msg-row {
        transition: background 0.1s ease;
      }
      .msg-row:hover {
        background: rgba(255,255,255,0.02);
      }
      
      /* Button hover effects */
      .btn, button {
        transition: all 0.15s ease;
      }
      .btn:hover, button:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
      .btn:active, button:active {
        transform: translateY(0);
        box-shadow: 0 2px 6px rgba(0,0,0,0.2);
      }
      
      /* Voice speaking animation */
      .voice-speaking {
        animation: voice-pulse 1.5s ease-in-out infinite;
      }
      @keyframes voice-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.4); }
        50% { box-shadow: 0 0 0 8px rgba(88, 166, 255, 0); }
      }
      
      /* Loading spinner */
      .loading-spinner {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      /* Toast animations */
      .toast {
        animation: toastSlideIn 0.3s ease;
      }
      @keyframes toastSlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      /* Modal fade in */
      .modal-overlay {
        animation: modalFadeIn 0.2s ease;
      }
      @keyframes modalFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      /* User mention highlight animation */
      .mention {
        animation: mention-flash 0.5s ease;
      }
      @keyframes mention-flash {
        0%, 100% { background: transparent; }
        50% { background: rgba(88, 166, 255, 0.3); }
      }
      
      /* Typing indicator bounce */
      .typing-dot {
        animation: typing-bounce 1.4s ease-in-out infinite;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typing-bounce {
        0%, 60%, 100% { transform: translateY(0); }
        30% { transform: translateY(-4px); }
      }
    `;
    document.head.appendChild(animStyle);

    // Add hover effects to server rail icons via JS (for dynamic elements)
    var serverRailObserver = new MutationObserver(function() {
      document.querySelectorAll(".rail-icon:not(.anim-patched), .server-rail-icon:not(.anim-patched)").forEach(function(icon) {
        icon.classList.add("anim-patched");
        icon.style.transition = "border-radius 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease";
      });
    });
    serverRailObserver.observe(document.body, { childList: true, subtree: true });

    console.log("[Fixes] Discord-style animations enabled");

    // Discord-style reaction burst effect (on reaction add)
    var burstStyle = document.createElement("style");
    burstStyle.id = "scord-burst-effect";
    burstStyle.textContent = `
      /* Reaction burst animation - Discord style */
      .reaction-pill.burst {
        animation: reaction-burst 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }
      @keyframes reaction-burst {
        0% { transform: scale(1); }
        30% { transform: scale(1.3); }
        50% { transform: scale(0.95); }
        70% { transform: scale(1.1); }
        100% { transform: scale(1); }
      }
      
      /* Message appear animation */
      .msg-row {
        animation: msg-appear 0.15s ease-out;
      }
      @keyframes msg-appear {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
      
      /* Status dot pulse animation */
      .status-dot.online {
        animation: status-pulse 2s ease-in-out infinite;
      }
      @keyframes status-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(59, 165, 92, 0.4); }
        50% { box-shadow: 0 0 0 4px rgba(59, 165, 92, 0); }
      }
      
      /* Channel unread indicator */
      .channel-unread {
        animation: unread-glow 2s ease-in-out infinite;
      }
      @keyframes unread-glow {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      
      /* Voice channel speaking ring */
      .voice-user.speaking .voice-user-avatar {
        animation: speak-ring 1.5s ease-in-out infinite;
      }
      @keyframes speak-ring {
        0%, 100% { box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.5); }
        50% { box-shadow: 0 0 0 6px rgba(88, 166, 255, 0); }
      }
      
      /* Friend request badge pulse */
      .badge.friend-request {
        animation: bad-pulse 1s ease-in-out infinite;
      }
      @keyframes bad-pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.15); }
      }
    `;
    document.head.appendChild(burstStyle);
  }
  }

  /* ══════════════════════════════════════════════════════════
     SERVER İCON MODERNİZE ET
  ══════════════════════════════════════════════════════════ */

  function patchServerIcons() {
    var iconStyle = document.createElement("style");
    iconStyle.id = "scord-server-icons";
    iconStyle.textContent = `
      /* Modern server icons */
      .rail-icon, .server-rail-icon {
        border-radius: 50% !important;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      }
      .rail-icon img, .server-rail-icon img {
        object-fit: cover;
        width: 100%;
        height: 100%;
      }
      .rail-icon:hover, .server-rail-icon:hover {
        box-shadow: 0 4px 16px rgba(0,0,0,0.5), 0 0 0 2px var(--accent);
      }
      .rail-icon.active {
        box-shadow: 0 4px 16px rgba(99, 102, 241, 0.5), 0 0 0 2px var(--accent);
      }
      /* Add button style */
      .add-server-btn, .rail-add-icon {
        border-radius: 50%;
        background: linear-gradient(135deg, #2c2c3a, #1e1e28);
        border: 2px dashed rgba(255,255,255,0.2);
      }
      .add-server-btn:hover, .rail-add-icon:hover {
        border-color: var(--accent);
        background: linear-gradient(135deg, #3c3c4a, #2e2e38);
      }
    `;
    document.head.appendChild(iconStyle);
  }

  /* ══════════════════════════════════════════════════════════
     EKRAN PAYLAŞIMI FİX - Remote video gösterimi
  ══════════════════════════════════════════════════════════ */

  function patchScreenShare() {
    // handleVoiceStream fonksiyonunu patch'le - video elementini DOM'a ekle
    if (typeof window.handleVoiceStream === "function") {
      var _origHVS = window.handleVoiceStream;
      window.handleVoiceStream = function (peerId, stream) {
        _origHVS(peerId, stream);
        
        // Video elementi DOM'da yoksa ekle
        var video = window.state?.remoteMedia?.[peerId];
        if (video && !video.parentNode) {
          video.style.cssText = "position:absolute;width:1px;height:1px;opacity:0.01;pointer-events:none;";
          document.body.appendChild(video);
        }
      };
    }
    
    // handleTrackAdded'i patch'le - screen share track'lerini de işle
    if (typeof window.handleTrackAdded === "function") {
      var _origHTA = window.handleTrackAdded;
      window.handleTrackAdded = function (peerId, track, stream) {
        // ÖNCE: state.remoteMedia[peerId] yoksa oluştur
        if (!window.state) window.state = {};
        if (!window.state.remoteMedia) window.state.remoteMedia = {};
        if (!window.state.remoteMedia[peerId]) {
          var video = document.createElement("video");
          video.autoplay = true;
          video.playsInline = true;
          video.muted = true;
          video.className = "voice-video";
          video.style.cssText = "position:absolute;width:1px;height:1px;opacity:0.01;pointer-events:none;";
          document.body.appendChild(video);
          window.state.remoteMedia[peerId] = video;
        }
        
        // SONRA: orijinal handler'ı çağır
        _origHTA(peerId, track, stream);
        
        // Force re-render voice panel after screen share track received
        if (track.kind === "video") {
          setTimeout(function () {
            if (window.state?.activeServerId && window.state?.voiceChannelId) {
              if (typeof window.renderVoiceParticipants === "function") {
                window.renderVoiceParticipants(window.state.activeServerId, window.state.voiceChannelId);
              }
            }
          }, 500);
        }
      };
    }
    
    // screen_status mesajlarını dinle - force re-render
    if (typeof window.handleServerMessage === "function") {
      var _origHSM2 = window.handleServerMessage;
      window.handleServerMessage = function (data) {
        var result = _origHSM2.apply(this, arguments);
        
        if (data?.type === "screen_status") {
          setTimeout(function () {
            if (window.state?.activeServerId && (window.state?.voiceChannelId || data.channelId)) {
              if (typeof window.renderVoiceParticipants === "function") {
                window.renderVoiceParticipants(window.state.activeServerId, data.channelId || window.state.voiceChannelId);
              }
            }
          }, 300);
        }
        
        return result;
      };
    }
    
    // İzle/Watch butonunu ekle - renderVoiceParticipants sonrası
    if (typeof window.renderVoiceParticipants === "function") {
      var _origRVP = window.renderVoiceParticipants;
      window.renderVoiceParticipants = function (serverId, channelId) {
        var result = _origRVP.apply(this, arguments);
        
        // Watch butonlarını kontrol et ve ekle
        setTimeout(function () {
          var cards = document.querySelectorAll(".vpc-card");
          cards.forEach(function (card) {
            if (card.querySelector(".scord-watch-btn")) return;
            var hasVideo = card.classList.contains("has-video");
            if (!hasVideo) return;
            
            var watchBtn = document.createElement("button");
            watchBtn.className = "scord-watch-btn";
            watchBtn.textContent = "🔍 İzle";
            watchBtn.style.cssText = "padding:6px 14px;border:none;border-radius:8px;background:var(--accent,#6366f1);color:#fff;cursor:pointer;font-size:12px;font-weight:600;margin-top:8px;display:block;width:100%;";
            
            // Peer ID'yi bul
            var peerId = card.dataset.peerId || card.dataset.memberId;
            if (!peerId) {
              var nameEl = card.querySelector(".vpc-name");
              if (nameEl) peerId = nameEl.textContent;
            }
            
            watchBtn.onclick = function (e) {
              e.stopPropagation();
              if (typeof window.openScreenOverlay === "function") {
                window.openScreenOverlay(peerId, peerId);
              }
            };
            
            card.appendChild(watchBtn);
          });
        }, 100);
        
        return result;
      };
    }
    
    console.log("[Fixes] Screen share + watch button patch applied");
  }

  init();
})();
