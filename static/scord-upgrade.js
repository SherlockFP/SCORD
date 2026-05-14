"use strict";

(function () {
  if (window.__SCORD_UPGRADE_LOADED) return;
  window.__SCORD_UPGRADE_LOADED = true;

  console.log("[SCORD-UPGRADE] Loading v2.0");

  /* ═══════════════════════════════════════════════════════════════
     1. PERFORMANCE — GPU Acceleration + DOM Batching + RAF
  ═══════════════════════════════════════════════════════════════ */

  function injectPerfCSS() {
    if (document.getElementById("scord-perf-v2-css")) return;
    var s = document.createElement("style");
    s.id = "scord-perf-v2-css";
    s.textContent = [
      "/* Performance: GPU acceleration */",
      ".vpc-avatar,.msg-avatar,.rail-icon,.voice-participant-card,.user-ctrl-btn,.voice-ctrl-btn,.btn-primary,.btn-secondary,.hero-btn,.toast,.modal,.dm-overlay{will-change:transform,opacity;transform:translateZ(0);backface-visibility:hidden}",
      ".messages-area{content-visibility:auto;contain-intrinsic-size:200px}",
      ".msg-row{content-visibility:auto;contain:layout style paint;contain-intrinsic-size:60px}",
      ".voice-participants{contain:layout style;gap:12px}",
      ".channel-list{contain:strict;will-change:scroll-position}",
      ".members-list{contain:strict}",
      ".voice-participant-card{contain:layout style paint;border-radius:16px;backdrop-filter:blur(4px)}",
      ".vpc-thumb{width:100%;max-height:120px;object-fit:cover;border-radius:10px;background:#000;aspect-ratio:16/9}",
      ".screen-overlay-video{width:100%;height:100%;object-fit:contain;background:#000}",
      ".screen-overlay{position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(12px);animation:scordFadeIn 0.2s ease}",
      "@keyframes scordFadeIn{from{opacity:0}to{opacity:1}}",
      ".screen-overlay-close{position:absolute;top:20px;right:20px;padding:10px 22px;border:none;border-radius:10px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;cursor:pointer;font-size:14px;font-weight:600;z-index:20;box-shadow:0 4px 16px rgba(239,68,68,0.4);transition:all 0.2s ease}",
      ".screen-overlay-close:hover{transform:scale(1.05);box-shadow:0 6px 20px rgba(239,68,68,0.6)}",
      ".screen-overlay-label{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);padding:8px 24px;border-radius:10px;background:rgba(0,0,0,0.75);color:#fff;font-size:14px;backdrop-filter:blur(8px);z-index:10;white-space:nowrap}",
      /* Voice control buttons  */
      ".voice-scord-fs-btn{position:absolute;top:20px;right:80px;padding:10px 22px;border:none;border-radius:10px;background:linear-gradient(135deg,rgba(30,30,50,0.95),rgba(40,40,70,0.95));border:1px solid rgba(99,102,241,0.5);color:#fff;cursor:pointer;font-size:14px;font-weight:600;z-index:20;backdrop-filter:blur(12px);display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:all 0.25s cubic-bezier(0.4,0,0.2,1)}",
      ".voice-scord-fs-btn::before{content:'⛶';font-size:18px}",
      ".voice-scord-fs-btn:hover{background:linear-gradient(135deg,#6366f1,#8b5cf6);border-color:transparent;transform:translateY(-2px);box-shadow:0 6px 28px rgba(99,102,241,0.5)}",
      ".voice-vol-btn{background:linear-gradient(135deg,rgba(30,30,50,0.9),rgba(40,40,70,0.9));border:1px solid rgba(99,102,241,0.4);color:#fff;padding:8px 16px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 3px 12px rgba(0,0,0,0.3);transition:all 0.2s ease;width:auto;min-width:44px;justify-content:center}",
      ".voice-vol-btn:hover{background:linear-gradient(135deg,#6366f1,#8b5cf6);transform:translateY(-2px);box-shadow:0 5px 20px rgba(99,102,241,0.4)}",
      ".voice-vol-btn.active{background:linear-gradient(135deg,#ef4444,#dc2626);border-color:rgba(239,68,68,0.5)}",
      ".voice-vol-btn.active:hover{background:linear-gradient(135deg,#dc2626,#b91c1c)}",
      ".vpc-vol-slider{width:80px;height:4px;accent-color:#6366f1;cursor:pointer;background:rgba(255,255,255,0.1);border-radius:2px;-webkit-appearance:none;appearance:none;outline:none;transition:accent-color 0.2s}",
      ".vpc-vol-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:14px;height:14px;border-radius:50%;background:#6366f1;cursor:pointer;box-shadow:0 2px 6px rgba(99,102,241,0.4)}",
      ".vpc-vol-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#6366f1;cursor:pointer;border:none}",
      ".vpc-volume-wrap{display:flex;align-items:center;gap:6px;margin-top:8px;padding:6px 10px;background:rgba(255,255,255,0.04);border-radius:8px;width:100%;box-sizing:border-box}",
      ".vpc-volume-wrap .vol-icon{font-size:12px;flex-shrink:0}",
      ".vpc-volume-wrap .vol-label{font-size:10px;color:var(--text-muted);flex-shrink:0;min-width:28px;text-align:right}",
      ".vpc-volume-wrap input{flex:1}",
      ".vpc-peer-controls{display:flex;align-items:center;gap:4px;margin-top:6px;width:100%}",
      /* Discord-style voice card */
      ".voice-participant-card{background:var(--bg-elevated,rgba(255,255,255,0.04));padding:14px;transition:all 0.15s ease}",
      ".voice-participant-card.speaking{border-color:rgba(99,102,241,0.5);box-shadow:0 0 20px rgba(99,102,241,0.15)}",
      ".vpc-avatar.speaking{box-shadow:0 0 0 3px #6366f1,0 0 20px rgba(99,102,241,0.4)}",
      ".watch-btn-scord{background:linear-gradient(135deg,#6366f1,#8b5cf6);border:none;color:#fff;padding:6px 14px;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;transition:all 0.2s ease;margin-top:6px}",
      ".watch-btn-scord:hover{transform:scale(1.05);box-shadow:0 4px 12px rgba(99,102,241,0.4)}",
      ".live-badge{background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;animation:scordPulse 2s infinite}",
      "@keyframes scordPulse{0%,100%{opacity:1}50%{opacity:0.6}}",
      /* Friend list */
      ".friend-item{display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:10px;cursor:pointer;transition:background 0.15s ease;margin:2px 0}",
      ".friend-item:hover{background:rgba(255,255,255,0.06)}",
      ".friend-avatar{width:36px;height:36px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:600;position:relative}",
      ".friend-status-dot{position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;border:2px solid var(--bg-primary,#0e0e1a)}",
      ".friend-info{flex:1;min-width:0}",
      ".friend-name{font-size:14px;font-weight:500;color:var(--text-primary,#e4e4e7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".friend-status-text{font-size:11px;color:var(--text-muted,#71717a)}",
      ".friend-actions{display:flex;gap:4px;flex-shrink:0}",
      ".friend-action-btn{width:28px;height:28px;border:none;border-radius:6px;background:rgba(255,255,255,0.06);color:var(--text-muted);cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;transition:all 0.15s ease}",
      ".friend-action-btn:hover{background:rgba(99,102,241,0.2);color:#fff}",
      ".friend-online{color:#3ba55c}",
      ".friend-idle{color:#faa61a}",
      ".friend-dnd{color:#ed4245}",
      ".friend-offline{color:#747f8d}",
      ".friend-section-title{font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted,#71717a);padding:12px 12px 6px;letter-spacing:0.5px}",
      /* Home sidebar friend section */
      "#home-sidebar{display:flex;flex-direction:column;height:100%;overflow:hidden}",
      "#home-sidebar .friend-section{flex:1;overflow-y:auto;padding:4px 0}",
      "#home-friend-list .friend-item{padding:6px 12px}",
      "#home-friend-count{font-size:11px;color:var(--text-muted);padding:0 12px 8px}",
      ".screen-share-volume-wrap{display:flex;align-items:center;gap:8px;padding:6px 12px;background:rgba(255,255,255,0.03);border-radius:8px;margin:4px 0;width:100%;box-sizing:border-box}",
      /* Scrollbar performance */
      ".messages-area,.channel-list,.members-list,#members-list,.dm-body{scroll-behavior:smooth;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}",
      "*::-webkit-scrollbar{width:4px;height:4px}",
      "*::-webkit-scrollbar-track{background:transparent}",
      "*::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.12);border-radius:4px}",
    ].join("\n");
    document.head.appendChild(s);
  }

  /* DOM batch update scheduler — use RAF to coalesce writes */
  var _domBatchQueue = [];
  var _domBatchScheduled = false;
  function scheduleDOMBatch(fn) {
    _domBatchQueue.push(fn);
    if (!_domBatchScheduled) {
      _domBatchScheduled = true;
      requestAnimationFrame(function () {
        var batch = _domBatchQueue.slice();
        _domBatchQueue = [];
        _domBatchScheduled = false;
        for (var i = 0; i < batch.length; i++) {
          try { batch[i](); } catch (e) { console.warn("[Perf] DOM batch error", e); }
        }
      });
    }
  }

  /* Override renderVoiceParticipants with DOM batching */
  function patchRenderVoiceParticipants() {
    var _origRVP = window.renderVoiceParticipants;
    if (!_origRVP) return;
    window.renderVoiceParticipants = function (serverId, channelId) {
      var self = this;
      var args = arguments;
      scheduleDOMBatch(function () {
        _origRVP.apply(self, args);
        enhanceVoiceCards();
      });
    };
    console.log("[Perf] renderVoiceParticipants batched");
  }

  /* ═══════════════════════════════════════════════════════════════
     2. SOUND EFFECTS — Discord-style Web Audio API
  ═══════════════════════════════════════════════════════════════ */

  var _audioCtx = null;
  function getAudioCtx() {
    if (!_audioCtx) {
      try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    if (_audioCtx && _audioCtx.state === "suspended") {
      _audioCtx.resume();
    }
    return _audioCtx;
  }

  function playTone(freq, duration, type, volume) {
    if (volume === void 0) volume = 0.08;
    var ctx = getAudioCtx();
    if (!ctx) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playNoise(duration, volume) {
    if (volume === void 0) volume = 0.04;
    var ctx = getAudioCtx();
    if (!ctx) return;
    try {
      var bufferSize = ctx.sampleRate * duration;
      var buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      var data = buffer.getChannelData(0);
      for (var i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      var source = ctx.createBufferSource();
      source.buffer = buffer;
      var gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(ctx.currentTime);
    } catch (e) {}
  }

  /* Discord-style sound effects */
  var DISCORD_SFX = {
    join: function () {
      playTone(523, 0.1, "sine", 0.06);
      setTimeout(function () { playTone(659, 0.1, "sine", 0.06); }, 80);
      setTimeout(function () { playTone(784, 0.15, "sine", 0.06); }, 160);
    },
    leave: function () {
      playTone(784, 0.1, "sine", 0.05);
      setTimeout(function () { playTone(659, 0.1, "sine", 0.05); }, 80);
      setTimeout(function () { playTone(523, 0.15, "sine", 0.05); }, 160);
    },
    message: function () {
      playTone(660, 0.06, "sine", 0.05);
      playNoise(0.04, 0.02);
    },
    dm: function () {
      playTone(880, 0.08, "sine", 0.06);
      setTimeout(function () { playTone(1100, 0.1, "sine", 0.06); }, 70);
    },
    mute: function () {
      playTone(300, 0.1, "sawtooth", 0.04);
      playNoise(0.06, 0.03);
    },
    unmute: function () {
      playTone(600, 0.08, "sine", 0.05);
      setTimeout(function () { playTone(800, 0.1, "sine", 0.04); }, 60);
    },
    deafen: function () {
      playTone(150, 0.12, "sawtooth", 0.05);
      playNoise(0.08, 0.04);
    },
    undeafen: function () {
      playTone(75, 0.06, "sawtooth", 0.04);
      setTimeout(function () { playTone(150, 0.1, "sine", 0.04); }, 60);
    },
    incoming_call: function () {
      for (var i = 0; i < 3; i++) {
        (function (idx) {
          setTimeout(function () {
            playTone(440, 0.15, "sine", 0.08);
            setTimeout(function () { playTone(550, 0.15, "sine", 0.08); }, 100);
          }, idx * 500);
        })(i);
      }
    },
    call_join: function () {
      playTone(660, 0.1, "sine", 0.06);
      setTimeout(function () { playTone(880, 0.15, "sine", 0.06); }, 80);
    },
    call_leave: function () {
      playTone(440, 0.1, "sine", 0.05);
      setTimeout(function () { playTone(330, 0.15, "sine", 0.05); }, 80);
    },
    server_join: function () {
      playTone(392, 0.08, "sine", 0.05);
      setTimeout(function () { playTone(523, 0.08, "sine", 0.05); }, 60);
      setTimeout(function () { playTone(659, 0.12, "sine", 0.05); }, 120);
    },
    server_leave: function () {
      playTone(659, 0.08, "sine", 0.04);
      setTimeout(function () { playTone(523, 0.08, "sine", 0.04); }, 60);
      setTimeout(function () { playTone(392, 0.12, "sine", 0.04); }, 120);
    },
    screen_share: function () {
      playTone(880, 0.06, "square", 0.04);
      setTimeout(function () { playTone(1100, 0.08, "square", 0.04); }, 50);
      playNoise(0.04, 0.02);
    },
    screen_stop: function () {
      playTone(440, 0.06, "square", 0.04);
      setTimeout(function () { playTone(220, 0.08, "square", 0.04); }, 50);
      playNoise(0.04, 0.02);
    },
    friend_request: function () {
      playTone(523, 0.08, "sine", 0.05);
      setTimeout(function () { playTone(659, 0.08, "sine", 0.05); }, 70);
      setTimeout(function () { playTone(784, 0.12, "sine", 0.05); }, 140);
    },
    friend_accept: function () {
      playTone(784, 0.06, "sine", 0.06);
      setTimeout(function () { playTone(880, 0.06, "sine", 0.06); }, 50);
      setTimeout(function () { playTone(1047, 0.15, "sine", 0.06); }, 100);
    },
  };

  function playDiscordSFX(name) {
    var fn = DISCORD_SFX[name];
    if (fn) {
      try { fn(); } catch (e) {}
    }
  }

  /* Override playSound to use Discord effects */
  function patchPlaySound() {
    var _origPS = window.playSound;
    window.playSound = function (freq, duration, type) {
      if (freq === 523) return playDiscordSFX("join");
      if (freq === 330) return playDiscordSFX("leave");
      if (freq === 660) return playDiscordSFX("message");
      if (freq === 880) return playDiscordSFX("dm");
      if (_origPS) _origPS(freq, duration, type);
    };
    window.playDiscordSFX = playDiscordSFX;
    console.log("[Sound] Discord SFX installed");
  }

  /* Hook sound effects into UI */
  function hookSoundEffects() {
    var check = setInterval(function () {
      var micBtn = document.getElementById("mic-toggle-btn");
      var sendBtn = document.getElementById("send-btn");
      var dmSendBtn = document.getElementById("dm-send-btn");
      var chatInput = document.getElementById("chat-input");
      if (micBtn && sendBtn && dmSendBtn && chatInput) {
        clearInterval(check);
        micBtn.addEventListener("click", function () {
          setTimeout(function () {
            playDiscordSFX(window.state && window.state.micMuted ? "mute" : "unmute");
          }, 50);
        });
        sendBtn.addEventListener("click", function () { playDiscordSFX("message"); });
        chatInput.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && !e.shiftKey) playDiscordSFX("message");
        });
        dmSendBtn.addEventListener("click", function () { playDiscordSFX("dm"); });
      }
    }, 1000);

    var deafBtn = document.getElementById("deafen-toggle-btn");
    if (deafBtn) {
      deafBtn.addEventListener("click", function () {
        playDiscordSFX(window.state && window.state.deafened ? "deafen" : "undeafen");
      });
    }
  }

  /* ═══════════════════════════════════════════════════════════════
     3. FRIEND SYSTEM — P2P Sync + UI
  ═══════════════════════════════════════════════════════════════ */

  function broadcastFriendList() {
    if (!window.state || !window.state.mesh) return;
    var friendsData = (window.state.friends || []).map(function (f) {
      return { peerId: f.peerId, name: f.name, avatarColor: f.avatarColor, avatarImage: f.avatarImage };
    });
    window.state.mesh.broadcast({
      type: "friend_list_sync",
      friends: friendsData,
      fromName: window.state.username,
      fromColor: window.state.avatarColor,
    });
  }

  /* Fix addFriend to broadcast */
  function patchFriendSystem() {
    var _origAdd = window.addFriend;
    if (_origAdd) {
      window.addFriend = function (peerId, name) {
        var result = _origAdd.apply(this, arguments);
        broadcastFriendList();
        if (window.state && window.state.mesh) {
          window.state.mesh.broadcast({
            type: "friend_request",
            from: window.state.peerId,
            name: window.state.username,
            avatarColor: window.state.avatarColor,
            targetName: name,
          });
        }
        return result;
      };
    }

    var _origRemove = window.removeFriend;
    if (_origRemove) {
      window.removeFriend = function (peerId) {
        var result = _origRemove.apply(this, arguments);
        broadcastFriendList();
        return result;
      };
    }

    /* Add friend list sync handler to handleIncomingP2P */
    var _origHIP2P = window.handleIncomingP2P;
    if (_origHIP2P) {
      window.handleIncomingP2P = function (fromPeerId, data, roomId) {
        if (data && data.type === "friend_list_sync" && data.friends) {
          handleFriendListSync(fromPeerId, data);
          return;
        }
        if (data && data.type === "friend_request") {
          handleIncomingFriendRequest(fromPeerId, data);
          return;
        }
        return _origHIP2P.apply(this, arguments);
      };
    }

    console.log("[Friends] P2P sync installed");
  }

  function handleFriendListSync(fromPeerId, data) {
    var state = window.state;
    if (!state) return;
    /* Store remote peer's friend list for mutual detection */
    if (!state._remoteFriends) state._remoteFriends = {};
    state._remoteFriends[fromPeerId] = data.friends || [];
    /* If they have us in their friends, and we have them, mark as mutual */
    var isMutual = (data.friends || []).some(function (f) { return f.peerId === state.peerId; });
    var weHave = (state.friends || []).some(function (f) { return f.peerId === fromPeerId; });
    if (isMutual && weHave) {
      var friend = state.friends.find(function (f) { return f.peerId === fromPeerId; });
      if (friend) friend.isMutual = true;
    }
  }

  function handleIncomingFriendRequest(fromPeerId, data) {
    var state = window.state;
    if (!state) return;
    /* Show friend request toast */
    if (typeof toast === "function") {
      toast(data.name + " sana arkadaşlık isteği gönderdi! 💌", "info", 6000);
    }
    playDiscordSFX("friend_request");
    /* Auto-add to friends if they sent request */
    if (state.friends && !state.friends.some(function (f) { return f.peerId === fromPeerId; })) {
      state.friends.push({
        peerId: fromPeerId,
        name: data.name || data.targetName || "Bilinmeyen",
        avatarColor: data.avatarColor,
        avatarImage: data.avatarImage,
      });
      localStorage.setItem("scord_friends", JSON.stringify(state.friends));
    }
  }

  /* Enhanced friend sidebar rendering */
  function patchHomeSidebar() {
    var _origRHS = window.renderHomeSidebar;
    if (!_origRHS) return;
    window.renderHomeSidebar = function () {
      var result = _origRHS.apply(this, arguments);
      renderFriendSection();
      return result;
    };

    /* Also render friends when status changes */
    var _origUpdateML = window.updateMemberList;
    if (_origUpdateML) {
      window.updateMemberList = function () {
        var result = _origUpdateML.apply(this, arguments);
        renderFriendSection();
        return result;
      };
    }

    console.log("[Friends] Sidebar rendering patched");
  }

  function renderFriendSection() {
    var sidebar = document.getElementById("channel-sidebar");
    if (!sidebar) return;
    var channelList = document.getElementById("channel-list");
    if (!channelList) return;

    var friendSection = document.getElementById("scord-friend-section");
    if (!friendSection) {
      friendSection = document.createElement("div");
      friendSection.id = "scord-friend-section";
      channelList.parentNode.insertBefore(friendSection, channelList.nextSibling);
    }

    var state = window.state;
    if (!state) return;
    var friends = state.friends || [];
    var activeServerId = state.activeServerId;
    var activeDM = state.activeDM;

    /* Don't show friends section when in a server */
    if (activeServerId) {
      friendSection.classList.add("hidden");
      return;
    }
    friendSection.classList.remove("hidden");

    /* Determine online status for each friend */
    var onlineFriends = [];
    var offlineFriends = [];
    friends.forEach(function (f) {
      var isOnline = false;
      var statusColor = "#747f8d";
      var statusText = "Çevrimdışı";

      if (state._peerStatuses && state._peerStatuses[f.peerId]) {
        var s = state._peerStatuses[f.peerId];
        isOnline = s.status !== "invisible";
        if (s.status === "online") { statusColor = "#3ba55c"; statusText = "Çevrimiçi"; }
        else if (s.status === "idle") { statusColor = "#faa61a"; statusText = "Boşta"; }
        else if (s.status === "dnd") { statusColor = "#ed4245"; statusText = "Rahatsız Etmeyin"; }
        else { statusColor = "#747f8d"; statusText = "Çevrimdışı"; }
      } else {
        /* Check if friend is in any server members */
        for (var i = 0; i < (state.servers || []).length; i++) {
          var srv = state.servers[i];
          if (srv.members && srv.members.some(function (m) { return m.peer_id === f.peerId; })) {
            isOnline = true;
            statusColor = "#3ba55c";
            statusText = "Çevrimiçi";
            break;
          }
        }
      }

      var friendInfo = { friend: f, isOnline: isOnline, statusColor: statusColor, statusText: statusText };
      if (isOnline) onlineFriends.push(friendInfo);
      else offlineFriends.push(friendInfo);
    });

    var html = "";
    html += '<div class="friend-section-title">Çevrimiçi — ' + onlineFriends.length + '</div>';
    html += '<div id="home-friend-list">';

    if (onlineFriends.length === 0 && offlineFriends.length === 0) {
      html += '<div style="padding:12px;font-size:12px;color:var(--text-muted);text-align:center">Henüz arkadaşın yok.<br>Bir kullanıcının profiline girip "Arkadaş Ekle" butonuna tıkla.</div>';
    }

    function renderFriendItem(fi) {
      var f = fi.friend;
      var name = f.name || f.username || "Kullanıcı";
      var initial = (name || "?").slice(0, 2).toUpperCase();
      var isActiveDM = activeDM === f.peerId;
      var avatarStyle = "background-color:" + (f.avatarColor || "#7c3aed") + ";";
      if (f.avatarImage) avatarStyle += "background-image:url(" + JSON.stringify(f.avatarImage) + ");background-size:cover;background-position:center;";
      return '<div class="friend-item" data-peer-id="' + f.peerId + '" style="' + (isActiveDM ? 'background:rgba(99,102,241,0.12)' : '') + '">'
        + '<div class="friend-avatar" style="' + avatarStyle + '">'
        + (!f.avatarImage ? initial : "")
        + '<span class="friend-status-dot friend-' + (fi.isOnline ? (fi.statusColor === "#3ba55c" ? "online" : fi.statusColor === "#faa61a" ? "idle" : fi.statusColor === "#ed4245" ? "dnd" : "online") : "offline") + '" style="background:' + fi.statusColor + '"></span>'
        + '</div>'
        + '<div class="friend-info">'
        + '<div class="friend-name">' + escapeHtml(name) + '</div>'
        + '<div class="friend-status-text" style="color:' + fi.statusColor + '">' + fi.statusText + '</div>'
        + '</div>'
        + '<div class="friend-actions">'
        + '<button class="friend-action-btn" onclick="event.stopPropagation();window.openDM(\'' + f.peerId + '\',\'' + escapeHtml(name) + '\',\'' + (f.avatarColor || "#7c3aed") + '\',\'' + (f.avatarImage || "") + '\')" title="Mesaj Gönder">💬</button>'
        + '<button class="friend-action-btn" onclick="event.stopPropagation();window.removeFriend(\'' + f.peerId + '\')" title="Arkadaştan Çıkar">✕</button>'
        + '</div>'
        + '</div>';
    }

    onlineFriends.forEach(function (fi) { html += renderFriendItem(fi); });

    if (offlineFriends.length > 0) {
      html += '<div class="friend-section-title" style="margin-top:8px">Çevrimdışı — ' + offlineFriends.length + '</div>';
      offlineFriends.forEach(function (fi) { html += renderFriendItem(fi); });
    }

    html += '</div>';

    friendSection.innerHTML = html;

    /* Click handler to open DM */
    friendSection.querySelectorAll(".friend-item").forEach(function (item) {
      item.addEventListener("click", function () {
        var peerId = item.dataset.peerId;
        var friend = (state.friends || []).find(function (f) { return f.peerId === peerId; });
        if (friend && typeof window.openDM === "function") {
          window.openDM(peerId, friend.name || friend.username, friend.avatarColor, friend.avatarImage);
        }
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════
     4. ONLINE STATUS — Fix idle detection + broadcast
  ═══════════════════════════════════════════════════════════════ */

  function patchStatusSystem() {
    /* Track peer statuses globally */
    var state = window.state;
    if (!state) return;
    if (!state._peerStatuses) state._peerStatuses = {};

    /* Patch setStatus to update friend section */
    var _origSetStatus = window.setStatus;
    if (_origSetStatus) {
      window.setStatus = function (newStatus, customStatus, statusEmoji) {
        var result = _origSetStatus.apply(this, arguments);
        renderFriendSection();
        /* Broadcast to all servers */
        if (window.state && window.state.mesh) {
          window.state.mesh.broadcast({
            type: "status_update",
            status: newStatus,
            customStatus: customStatus || window.state.customStatus || "",
            statusEmoji: statusEmoji || window.state.statusEmoji || "",
            timestamp: Date.now(),
          });
        }
        return result;
      };
    }

    /* Patch handleIncomingP2P to track peer statuses */
    var _origHIP2PStatus = window.handleIncomingP2P;
    if (_origHIP2PStatus) {
      window.handleIncomingP2P = function (fromPeerId, data, roomId) {
        if (data && data.type === "status_update") {
          var st = window.state;
          if (st) {
            if (!st._peerStatuses) st._peerStatuses = {};
            st._peerStatuses[fromPeerId] = {
              status: data.status || "online",
              customStatus: data.customStatus || "",
              statusEmoji: data.statusEmoji || "",
              timestamp: data.timestamp || Date.now(),
            };
            /* Update UI */
            renderFriendSection();
            if (typeof updateMemberList === "function") updateMemberList();
          }
          return;
        }
        return _origHIP2PStatus.apply(this, arguments);
      };
    }

    /* Broadcast status on mesh connect */
    var _origHPC = window.handlePeerConnected;
    if (_origHPC) {
      window.handlePeerConnected = function (peerId, roomId) {
        var result = _origHPC.apply(this, arguments);
        /* Send our status to the newly connected peer */
        setTimeout(function () {
          if (window.state && window.state.mesh) {
            window.state.mesh.sendTo(peerId, {
              type: "status_update",
              status: window.state.status || "online",
              customStatus: window.state.customStatus || "",
              statusEmoji: window.state.statusEmoji || "",
              timestamp: Date.now(),
            });
            /* Also send friend list */
            var friendsData = (window.state.friends || []).map(function (f) {
              return { peerId: f.peerId, name: f.name, avatarColor: f.avatarColor, avatarImage: f.avatarImage };
            });
            if (friendsData.length > 0) {
              window.state.mesh.sendTo(peerId, {
                type: "friend_list_sync",
                friends: friendsData,
                fromName: window.state.username,
                fromColor: window.state.avatarColor,
              });
            }
          }
        }, 500);
        return result;
      };
    }

    /* Fix idle detection — use activity events */
    function setupIdleDetection() {
      var activityEvents = ["mousedown", "mousemove", "keydown", "touchstart", "scroll", "click"];
      function onActivity() {
        if (window.state) {
          window.state.lastActive = Date.now();
          if (window.state.status === "idle" && typeof window.setStatus === "function") {
            window.setStatus("online", window.state.customStatus, window.state.statusEmoji);
          }
        }
      }
      for (var i = 0; i < activityEvents.length; i++) {
        document.addEventListener(activityEvents[i], onActivity, { passive: true });
      }
      /* Check idle every 30s instead of 60s */
      if (window.state && window.state._idleTimer) {
        clearInterval(window.state._idleTimer);
      }
      if (window.state) {
        window.state._idleTimer = setInterval(function () {
          if (!window.state) return;
          var idleTime = Date.now() - (window.state.lastActive || Date.now());
          if (idleTime >= 5 * 60 * 1000 && window.state.status === "online") {
            if (typeof window.setStatus === "function") {
              window.setStatus("idle", window.state.customStatus, window.state.statusEmoji);
            }
          }
        }, 30000);
      }
    }

    setTimeout(setupIdleDetection, 2000);
    console.log("[Status] System patched");
  }

  /* ═══════════════════════════════════════════════════════════════
     5. PASSWORD SYSTEM — Fix login + identity
  ═══════════════════════════════════════════════════════════════ */

  function patchPasswordSystem() {
    var passInterval = setInterval(function () {
      var enterBtn = document.getElementById("enter-btn");
      var passInput = document.getElementById("scord-pass-input");
      var nameInput = document.getElementById("username-input");
      if (!enterBtn || !passInput || !nameInput) return;
      clearInterval(passInterval);

      /* Enable button when both fields have values */
      function updateBtnState() {
        var nick = (nameInput.value || "").trim();
        var pass = passInput.value;
        enterBtn.disabled = !nick || nick.length < 2 || !pass;
      }
      updateBtnState();
      passInput.addEventListener("input", updateBtnState);
      nameInput.addEventListener("input", updateBtnState);

      /* Only patch if not already patched by v2 */
      if (enterBtn.dataset.scordV2Patched) return;
      enterBtn.dataset.scordV2Patched = "1";

      /* Clone the button to remove all original event listeners */
      var newBtn = enterBtn.cloneNode(true);
      enterBtn.parentNode.replaceChild(newBtn, enterBtn);

      /* Override click to use password-based identity */
      newBtn.onclick = function () {
        var nick = (nameInput.value || "").trim();
        var pass = passInput.value;
        if (!nick || nick.length < 2 || !pass) {
          if (typeof toast === "function") toast("Kullanıcı adı (en az 2 karakter) ve şifre gerekli!", "error");
          return;
        }

        /* Generate deterministic peerId from nick+pass */
        var h = 0;
        var str = nick.toLowerCase().trim() + ":" + pass + ":scord-v2";
        for (var i = 0; i < str.length; i++) {
          h = ((h << 5) - h) + str.charCodeAt(i);
          h |= 0;
        }
        var identityId = "sc_" + Math.abs(h).toString(36) + "_" + Date.now().toString(36).slice(-4);

        /* Store identity */
        window.state.peerId = identityId;
        window.state.username = nick;
        localStorage.setItem("scord_username", nick);
        localStorage.setItem("scord_pass", btoa(pass));
        localStorage.setItem("scord_peer_id", identityId);
        localStorage.setItem("scord_identity_id", identityId);
        localStorage.setItem("scord_color", window.state.avatarColor || "#7c3aed");

        /* Update UI */
        var nameEl = document.getElementById("user-bar-name");
        if (nameEl) nameEl.textContent = nick;
        var avatar = document.getElementById("user-bar-avatar");
        if (avatar && typeof window.applyAvatarToElement === "function") {
          window.applyAvatarToElement(avatar, window.state.avatarColor, window.state.avatarImage, nick);
        }

        if (typeof window.startApp === "function") window.startApp();
      };

      /* Allow Enter key to submit */
      passInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !newBtn.disabled) newBtn.click();
      });

      console.log("[Password] Login system patched");
    }, 500);
  }

  /* ═══════════════════════════════════════════════════════════════
     6. VOICE VIEW — Fullscreen button + Volume controls CSS fix
  ═══════════════════════════════════════════════════════════════ */

  function enhanceVoiceCards() {
    var cards = document.querySelectorAll(".voice-participant-card");
    cards.forEach(function (card) {
      var peerId = card.getAttribute("data-peer-id");
      if (!peerId) return;

      /* Add volume control for each remote peer */
      if (peerId !== (window.state ? window.state.peerId : null)) {
        var existingVol = card.querySelector(".vpc-volume-wrap");
        if (!existingVol) {
          var volWrap = document.createElement("div");
          volWrap.className = "vpc-volume-wrap";

          var volIcon = document.createElement("span");
          volIcon.className = "vol-icon";
          volIcon.textContent = "🔊";

          var volSlider = document.createElement("input");
          volSlider.type = "range";
          volSlider.min = "0";
          volSlider.max = "200";
          volSlider.value = "100";
          volSlider.className = "vpc-vol-slider";
          volSlider.title = "Ses seviyesi";

          /* Load saved volume */
          var savedVol = window.state && window.state.userVolumes ? window.state.userVolumes[peerId] : null;
          if (savedVol !== null && savedVol !== undefined) {
            volSlider.value = String(Math.round(savedVol * 100));
          }

          var volLabel = document.createElement("span");
          volLabel.className = "vol-label";
          volLabel.textContent = volSlider.value + "%";

          volSlider.oninput = function () {
            var val = parseInt(this.value);
            volLabel.textContent = val + "%";
            /* Apply volume to remote audio */
            var remoteAudio = window.state ? window.state.remoteAudios[peerId] : null;
            if (remoteAudio) {
              remoteAudio.volume = val / 100;
            }
            /* Save volume */
            if (window.state) {
              if (!window.state.userVolumes) window.state.userVolumes = {};
              window.state.userVolumes[peerId] = val / 100;
              try { localStorage.setItem("scord_user_volumes", JSON.stringify(window.state.userVolumes)); } catch (e) {}
            }
          };

          volWrap.appendChild(volIcon);
          volWrap.appendChild(volSlider);
          volWrap.appendChild(volLabel);
          card.appendChild(volWrap);
        }
      }

      /* Add watch/fullscreen button if sharing */
      var hasVideo = card.classList.contains("has-video");
      var watchBtn = card.querySelector(".watch-btn-scord");
      if (hasVideo && !watchBtn) {
        var btn = document.createElement("button");
        btn.className = "watch-btn-scord";
        btn.textContent = "🔍 İzle";
        btn.onclick = function (e) {
          e.stopPropagation();
          if (typeof window.openScreenOverlay === "function") {
            window.openScreenOverlay(peerId, peerId);
          }
        };
        card.appendChild(btn);
      }

      /* Remove duplicate old watch buttons */
      var oldWatch = card.querySelector(".watch-btn");
      if (oldWatch && !watchBtn) oldWatch.remove();
    });
  }

  /* Patch openScreenOverlay to add fullscreen button */
  function patchScreenOverlay() {
    var _origOSO = window.openScreenOverlay;
    if (!_origOSO) return;
    window.openScreenOverlay = function (peerId, username) {
      var result = _origOSO.apply(this, arguments);

      /* Add fullscreen button after overlay appears */
      setTimeout(function () {
        var overlay = document.getElementById("screen-overlay");
        if (!overlay || overlay.querySelector(".voice-scord-fs-btn")) return;

        var video = overlay.querySelector(".screen-overlay-video");
        if (!video) return;

        var fsBtn = document.createElement("button");
        fsBtn.className = "voice-scord-fs-btn";
        fsBtn.innerHTML = '<span>Tam Ekran</span>';
        fsBtn.title = "Tam ekran yap";
        fsBtn.onclick = function (e) {
          e.stopPropagation();
          if (video.requestFullscreen) video.requestFullscreen();
          else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
          else if (video.msRequestFullscreen) video.msRequestFullscreen();
        };

        overlay.appendChild(fsBtn);
      }, 50);

      return result;
    };
    console.log("[Voice] Fullscreen button added to overlay");
  }

  /* Fix voice control buttons — add mute/deafen to voice view */
  function enhanceVoiceControls() {
    var check = setInterval(function () {
      var voiceControls = document.querySelector(".voice-controls");
      if (!voiceControls) return;
      clearInterval(check);

      /* Add mute button if not exists */
      if (!document.getElementById("scord-voice-mute-btn")) {
        var muteBtn = document.createElement("button");
        muteBtn.id = "scord-voice-mute-btn";
        muteBtn.className = "voice-vol-btn";
        muteBtn.title = "Mikrofon Aç/Kapat";
        muteBtn.innerHTML = window.state && window.state.micMuted ? "🔇" : "🎤";
        muteBtn.onclick = function () {
          if (typeof window.toggleMicrophone === "function") window.toggleMicrophone();
          else if (typeof window.toggleMic === "function") window.toggleMic();
        };
        voiceControls.insertBefore(muteBtn, voiceControls.firstChild);
      }

      /* Add deafen button if not exists */
      if (!document.getElementById("scord-voice-deafen-btn")) {
        var deafenBtn = document.createElement("button");
        deafenBtn.id = "scord-voice-deafen-btn";
        deafenBtn.className = "voice-vol-btn";
        deafenBtn.title = "Ses Aç/Kapat";
        deafenBtn.innerHTML = window.state && window.state.deafened ? "🔇" : "🔊";
        deafenBtn.onclick = function () {
          if (typeof window.toggleDeafen === "function") window.toggleDeafen();
        };
        voiceControls.insertBefore(deafenBtn, voiceControls.firstChild);
      }
    }, 1000);

    /* Update button states */
    setInterval(function () {
      var muteBtn = document.getElementById("scord-voice-mute-btn");
      var deafenBtn = document.getElementById("scord-voice-deafen-btn");
      var st = window.state;
      if (muteBtn) {
        var muted = st ? (st.micMuted || st.muted) : false;
        muteBtn.innerHTML = muted ? "🔇" : "🎤";
        muteBtn.className = "voice-vol-btn" + (muted ? " active" : "");
        muteBtn.title = muted ? "Mikrofon kapalı - açmak için tıkla" : "Mikrofon açık - kapatmak için tıkla";
      }
      if (deafenBtn) {
        var deaf = st ? st.deafened : false;
        deafenBtn.innerHTML = deaf ? "🔇" : "🔊";
        deafenBtn.className = "voice-vol-btn" + (deaf ? " active" : "");
        deafenBtn.title = deaf ? "Ses kapalı - açmak için tıkla" : "Ses açık - kapatmak için tıkla";
      }
    }, 500);
  }

  /* ═══════════════════════════════════════════════════════════════
     7. INIT — Apply all patches
  ═══════════════════════════════════════════════════════════════ */

  function init() {
    injectPerfCSS();
    patchPlaySound();
    patchRenderVoiceParticipants();

    /* Wait for app state to be ready */
    var readyCheck = setInterval(function () {
      if (!window.state || !window.state.peerId) return;
      clearInterval(readyCheck);

      patchFriendSystem();
      patchHomeSidebar();
      patchStatusSystem();
      patchPasswordSystem();
      patchScreenOverlay();
      enhanceVoiceControls();
      hookSoundEffects();

      /* Render friend section periodically */
      setInterval(renderFriendSection, 5000);

      console.log("[SCORD-UPGRADE] v2.0 fully loaded");
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
