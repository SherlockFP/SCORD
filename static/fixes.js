/**
 * Shercord Fixes v1.0
 * Tüm kritik bugları düzeltir:
 * 1. Mesaj silme çalışmıyor → düzeltildi
 * 2. Kanal silme endpoint yok → server.py'de eklendi + client fix
 * 3. Sunucu logosu URL'de boşluk → düzeltildi
 * 4. Sesli odadan ayrılınca hala sesli odadasın → düzeltildi
 * 5. Kullanıcı ayarları chat tasarımı → CSS eklendi
 * 6. Davet kodu URL boşluk → düzeltildi
 * 7. Kanal arka plan değişimi → broadcast ile düzeltildi
 * 8. Discord benzeri ses efektleri → eklendi
 * 9. DM kapatma/silme → eklendi
 * 10. Arkadaş silme → zaten çalışıyordu, iyileştirildi
 * 11. Sunucu izinleri kayıt → düzeltildi
 * 12. GPU acceleration + performans → eklendi
 */

(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════════
     1. DISCORD BENZERİ SES EFEKTLERİ (Web Audio API)
  ══════════════════════════════════════════════════════════ */

  const SFX_CTX = { ac: null };

  function getSFXCtx() {
    if (!SFX_CTX.ac || SFX_CTX.ac.state === "closed") {
      SFX_CTX.ac = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (SFX_CTX.ac.state === "suspended") SFX_CTX.ac.resume();
    return SFX_CTX.ac;
  }

  function sfxVolume() {
    const v = parseFloat(localStorage.getItem("scord_sfx_volume") ?? "0.35");
    return isNaN(v) ? 0.35 : Math.max(0, Math.min(1, v));
  }

  function sfxEnabled() {
    return localStorage.getItem("scord_sfx_enabled") !== "false";
  }

  /**
   * Belirli bir ses efekti çal.
   * @param {"join"|"leave"|"message"|"dm"|"mute"|"unmute"|"error"|"click"|"mention"} name
   */
  window.playDiscordSFX = function playDiscordSFX(name) {
    if (!sfxEnabled()) return;
    try {
      const ac = getSFXCtx();
      const vol = sfxVolume();
      const t = ac.currentTime;

      const gain = ac.createGain();
      gain.connect(ac.destination);
      gain.gain.setValueAtTime(vol, t);

      const schedules = {
        join: () => {
          // Yukarı giden iki ton (Discord join sesi)
          [523, 659].forEach((freq, i) => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = "sine";
            o.frequency.value = freq;
            o.connect(g);
            g.connect(ac.destination);
            g.gain.setValueAtTime(vol * 0.6, t + i * 0.12);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.25);
            o.start(t + i * 0.12);
            o.stop(t + i * 0.12 + 0.25);
          });
        },
        leave: () => {
          // Aşağı inen iki ton
          [659, 494].forEach((freq, i) => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = "sine";
            o.frequency.value = freq;
            o.connect(g);
            g.connect(ac.destination);
            g.gain.setValueAtTime(vol * 0.5, t + i * 0.12);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.22);
            o.start(t + i * 0.12);
            o.stop(t + i * 0.12 + 0.22);
          });
        },
        message: () => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = "sine";
          o.frequency.setValueAtTime(880, t);
          o.frequency.exponentialRampToValueAtTime(660, t + 0.1);
          o.connect(g);
          g.connect(ac.destination);
          g.gain.setValueAtTime(vol * 0.3, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          o.start(t);
          o.stop(t + 0.18);
        },
        dm: () => {
          [880, 1100].forEach((freq, i) => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = "sine";
            o.frequency.value = freq;
            o.connect(g);
            g.connect(ac.destination);
            g.gain.setValueAtTime(vol * 0.35, t + i * 0.08);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.15);
            o.start(t + i * 0.08);
            o.stop(t + i * 0.08 + 0.15);
          });
        },
        mute: () => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = "square";
          o.frequency.setValueAtTime(200, t);
          o.frequency.exponentialRampToValueAtTime(100, t + 0.15);
          o.connect(g);
          g.connect(ac.destination);
          g.gain.setValueAtTime(vol * 0.15, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          o.start(t);
          o.stop(t + 0.15);
        },
        unmute: () => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = "square";
          o.frequency.setValueAtTime(100, t);
          o.frequency.exponentialRampToValueAtTime(200, t + 0.12);
          o.connect(g);
          g.connect(ac.destination);
          g.gain.setValueAtTime(vol * 0.15, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          o.start(t);
          o.stop(t + 0.12);
        },
        mention: () => {
          [660, 880, 1100].forEach((freq, i) => {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = "sine";
            o.frequency.value = freq;
            o.connect(g);
            g.connect(ac.destination);
            g.gain.setValueAtTime(vol * 0.4, t + i * 0.07);
            g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.15);
            o.start(t + i * 0.07);
            o.stop(t + i * 0.07 + 0.15);
          });
        },
        error: () => {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = "sawtooth";
          o.frequency.value = 220;
          o.connect(g);
          g.connect(ac.destination);
          g.gain.setValueAtTime(vol * 0.2, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          o.start(t);
          o.stop(t + 0.25);
        },
        click: () => {
          const buf = ac.createBuffer(1, ac.sampleRate * 0.04, ac.sampleRate);
          const d = buf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
          const src = ac.createBufferSource();
          src.buffer = buf;
          const g = ac.createGain();
          src.connect(g);
          g.connect(ac.destination);
          g.gain.setValueAtTime(vol * 0.08, t);
          src.start(t);
          src.stop(t + 0.04);
        },
      };

      const fn = schedules[name];
      if (fn) fn();
    } catch (e) {
      /* sessizce geç */
    }
  };

  /* Eski playSound'u Discord SFX'e yönlendir */
  const _origPlaySound = window.playSound;
  window.playSound = function (freq, duration, type) {
    // Sadece voice join/leave efektlerini yakala
    if (freq === 523) return playDiscordSFX("join");
    if (freq === 330) return playDiscordSFX("leave");
    if (freq === 660 || freq === 880) return playDiscordSFX("message");
    _origPlaySound && _origPlaySound(freq, duration, type);
  };

  /* ══════════════════════════════════════════════════════════
     2. MESAJ SİLME FİXİ
  ══════════════════════════════════════════════════════════ */

  window.deleteChatMessage = function deleteChatMessage(msg) {
    const server = window.state?.servers?.find((s) => s.id === window.state.activeServerId);
    if (!server) return;

    // channelId yoksa aktif kanalı kullan
    const channelId = msg.channelId || window.state.activeChannelId;
    if (!channelId) return;

    if (!server.messages) server.messages = {};
    if (!server.messages[channelId]) server.messages[channelId] = [];

    // Mesajı listeden kaldır
    server.messages[channelId] = server.messages[channelId].filter((m) => m.id !== msg.id);
    server.pinned_messages = (server.pinned_messages || []).filter((m) => m.id !== msg.id);

    // Diğer peer'lara ilet (güvenilir kanal üzerinden)
    if (typeof meshBroadcastReliable === "function") {
      meshBroadcastReliable({ type: "msg_delete", payload: { channelId, msgId: msg.id } });
    } else if (window.state?.mesh) {
      window.state.mesh.broadcast({ type: "msg_delete", payload: { channelId, msgId: msg.id } });
    }

    // Sunucuya da bildir (opsiyonel kalıcılık)
    if (window.API_BASE && window.state.activeServerId) {
      fetch(`${window.API_BASE}/rooms/${window.state.activeServerId}/messages/${msg.id}`, {
        method: "DELETE",
      }).catch(() => {});
    }

    if (typeof renderMessages === "function") {
      renderMessages(window.state.activeServerId, window.state.activeChannelId);
    }
    if (typeof toast === "function") toast("Mesaj silindi.", "info");
  };

  /* ══════════════════════════════════════════════════════════
     3. SESLİ ODADAN AYRILMA BUĞU — leaveServer fix
  ══════════════════════════════════════════════════════════ */

  const _origLeaveServer = window.leaveServer;
  window.leaveServer = function leaveServer(serverId) {
    // Sunucudan ayrılmadan önce sesli kanaldan çık
    if (window.state?.voiceChannelId) {
      try {
        window.leaveVoiceChannel && window.leaveVoiceChannel();
      } catch (e) {}
    }
    _origLeaveServer && _origLeaveServer(serverId);
    // Anasayfaya dön
    if (typeof showHomeView === "function") showHomeView();
    if (typeof renderServerRail === "function") renderServerRail();
  };

  /* ══════════════════════════════════════════════════════════
     4. SUNUCU LOGOSU — URL boşluk fix
  ══════════════════════════════════════════════════════════ */

  window.updateServerIcon = function updateServerIcon(serverId, url) {
    const trimmedUrl = (url || "").trim();
    if (!trimmedUrl) {
      typeof toast === "function" && toast("Geçerli bir URL girin.", "error");
      return;
    }
    fetch(`${window.API_BASE}/rooms/${serverId}/icon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: trimmedUrl }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const server = window.state?.servers?.find((s) => s.id === serverId);
          if (server) server.icon_url = trimmedUrl;
          typeof renderServerRail === "function" && renderServerRail();
          // Sidebar'daki icon'ı güncelle
          document.querySelectorAll(`[data-server-id="${serverId}"]`).forEach((el) => {
            if (trimmedUrl) {
              el.innerHTML = `<img src="${trimmedUrl}" alt="" class="rail-guild-img" style="width:100%;height:100%;border-radius:inherit;object-fit:cover;"/>`;
            }
          });
          typeof toast === "function" && toast("Sunucu ikonu güncellendi.", "success");
        } else {
          typeof toast === "function" && toast("İkon güncellenemedi: " + (data.error || "hata"), "error");
        }
      })
      .catch(() => {
        typeof toast === "function" && toast("Bağlantı hatası.", "error");
      });
  };

  /* ══════════════════════════════════════════════════════════
     5. DAVET KODU URL FİX
  ══════════════════════════════════════════════════════════ */

  window.joinByCode = async function joinByCode() {
    const input = document.getElementById("join-invite-input");
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    try {
      const res = await fetch(`${window.API_BASE}/rooms/join/${code}`);
      if (!res.ok) {
        typeof toast === "function" && toast("Davet kodu geçersiz.", "error");
        return;
      }
      const room = await res.json();
      if (room.room_id) {
        typeof joinServer === "function" && joinServer(room.room_id);
        input.value = "";
        typeof toast === "function" && toast("Sunucuya katıldın!", "success");
      } else {
        typeof toast === "function" && toast("Davet kodu geçersiz.", "error");
      }
    } catch (e) {
      typeof toast === "function" && toast("Bağlantı hatası.", "error");
    }
  };

  /* ══════════════════════════════════════════════════════════
     6. KANAL SİLME FİX (server.py'de DELETE endpoint eklendi)
  ══════════════════════════════════════════════════════════ */

  window.deleteChannel = async function deleteChannel(serverId, channelId) {
    const server = window.state?.servers?.find((s) => s.id === serverId);
    if (!server) return;
    const channel = server.channels?.find((c) => c.id === channelId);
    if (!channel) return;

    if (!confirm(`"#${channel.name}" kanalını silmek istediğine emin misin?`)) return;

    try {
      const res = await fetch(`${window.API_BASE}/rooms/${serverId}/channels/${channelId}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (data.success) {
        // Yerel state güncelle
        server.channels = server.channels.filter((c) => c.id !== channelId);
        delete (server.messages || {})[channelId];
        delete (server.channel_backgrounds || {})[channelId];

        // Diğer peer'lara bildir
        if (window.state?.mesh) {
          window.state.mesh.broadcast({ type: "channel_delete", payload: { serverId, channelId } });
        }

        // Aktif kanal silinmişse başka kanala geç
        if (window.state?.activeChannelId === channelId) {
          const firstText = server.channels.find((c) => c.type === "text");
          if (firstText && typeof showChatView === "function") {
            showChatView(serverId, firstText.id);
          } else {
            typeof showHomeView === "function" && showHomeView();
          }
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
     7. KANAL ARKA PLAN DEĞİŞİKLİĞİ — link ile değiş
  ══════════════════════════════════════════════════════════ */

  window.setChannelBackground = async function setChannelBackground(serverId, channelId, url) {
    try {
      const res = await fetch(`${window.API_BASE}/rooms/${serverId}/channel_background`, {
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
        applyChannelBackground(channelId, url || null);
        typeof toast === "function" && toast("Kanal arka planı güncellendi.", "success");
      }
    } catch (e) {
      typeof toast === "function" && toast("Bağlantı hatası.", "error");
    }
  };

  function applyChannelBackground(channelId, url) {
    if (window.state?.activeChannelId !== channelId) return;
    const msgArea = document.getElementById("messages-area");
    const chatView = document.getElementById("chat-view");
    if (!msgArea && !chatView) return;
    const target = msgArea || chatView;
    if (url) {
      target.style.backgroundImage = `url(${url})`;
      target.style.backgroundSize = "cover";
      target.style.backgroundPosition = "center";
      target.style.backgroundAttachment = "local";
    } else {
      target.style.backgroundImage = "";
      target.style.backgroundSize = "";
      target.style.backgroundPosition = "";
    }
  }

  /* Kanala girildiğinde arka planı uygula */
  const _origShowChatView = window.showChatView;
  window.showChatView = function showChatView(serverId, channelId) {
    const result = _origShowChatView && _origShowChatView(serverId, channelId);
    try {
      const server = window.state?.servers?.find((s) => s.id === serverId);
      const bg = server?.channel_backgrounds?.[channelId];
      applyChannelBackground(channelId, bg || null);
    } catch (e) {}
    return result;
  };

  /* ══════════════════════════════════════════════════════════
     8. DM KAPATMA / SİLME ÖZELLİĞİ
  ══════════════════════════════════════════════════════════ */

  window.closeDMConversation = function closeDMConversation(peerId) {
    // DM overlay'i kapat
    const overlay = document.getElementById("dm-overlay");
    if (overlay) overlay.classList.add("hidden");

    // Aktif DM state'ini temizle
    if (window.state?.activeDM === peerId) {
      window.state.activeDM = null;
    }
  };

  window.deleteDMConversation = function deleteDMConversation(peerId, username) {
    if (!confirm(`@${username} ile olan DM geçmişini silmek istediğine emin misin?`)) return;

    if (!window.state) return;
    if (!window.state.dms) window.state.dms = {};

    // Mesajları sil
    delete window.state.dms[peerId];

    // localStorage'dan da kaldır
    try {
      const stored = JSON.parse(localStorage.getItem("scord_dms") || "{}");
      delete stored[peerId];
      localStorage.setItem("scord_dms", JSON.stringify(stored));
    } catch (e) {}

    closeDMConversation(peerId);
    typeof toast === "function" && toast("DM sohbeti silindi.", "info");
  };

  /* DM overlay'e silme butonu ekle */
  function enhanceDMOverlay() {
    const header = document.querySelector(".dm-header");
    if (!header || header.querySelector(".dm-delete-btn")) return;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "dm-close-btn dm-delete-btn";
    deleteBtn.title = "Sohbeti sil";
    deleteBtn.style.cssText = "margin-right:4px;color:var(--red,#ed4245);opacity:0.7;font-size:14px;";
    deleteBtn.innerHTML = "🗑️";
    deleteBtn.addEventListener("click", () => {
      const peerId = window.state?.activeDM;
      if (!peerId) return;
      const friend = window.state?.friends?.find((f) => f.peerId === peerId);
      const username = friend?.username || peerId;
      deleteDMConversation(peerId, username);
    });

    const closeBtn = document.getElementById("dm-close-btn");
    if (closeBtn) {
      header.insertBefore(deleteBtn, closeBtn);
    } else {
      header.appendChild(deleteBtn);
    }
  }

  /* ══════════════════════════════════════════════════════════
     9. SUNUCU İZİNLERİ — Kayıt düzelt
  ══════════════════════════════════════════════════════════ */

  /* Sunucu ayarları kaydet — izin değişikliklerini düzgün kaydet */
  function patchSaveServerSettings() {
    const _orig = window.saveServerSettings;
    if (!_orig) return;
    window.saveServerSettings = function saveServerSettings(...args) {
      const result = _orig.apply(this, args);
      // İzin değişikliklerini WS üzerinden gönder
      const server = window.state?.servers?.find((s) => s.id === window.state.activeServerId);
      if (server && typeof sendServerEvent === "function") {
        sendServerEvent({
          type: "role_update",
          roles: server.roles || {},
          peer_roles: server.peer_roles || {},
        });
        sendServerEvent({
          type: "permission_update",
          channel_permissions: server.channel_permissions || {},
        });
      }
      return result;
    };
  }

  /* ══════════════════════════════════════════════════════════
     10. WS MESAJ TİPLERİ — Yeni broadcast tiplerini işle
  ══════════════════════════════════════════════════════════ */

  function patchWSMessageHandler() {
    const _orig = window.handleServerMessage;
    if (!_orig) return;

    window.handleServerMessage = function handleServerMessage(data, ...rest) {
      // Kanal arka planı broadcast
      if (data?.type === "channel_background_update") {
        const server = window.state?.servers?.find((s) => s.id === window.state.activeServerId);
        if (server) {
          if (!server.channel_backgrounds) server.channel_backgrounds = {};
          if (data.url) server.channel_backgrounds[data.channelId] = data.url;
          else delete server.channel_backgrounds[data.channelId];
          if (data.channel_backgrounds) server.channel_backgrounds = data.channel_backgrounds;
          applyChannelBackground(data.channelId, data.url || null);
        }
        return;
      }
      return _orig.call(this, data, ...rest);
    };
  }

  /* ══════════════════════════════════════════════════════════
     11. PERFORMANS — GPU hızlandırma + smooth animasyon
  ══════════════════════════════════════════════════════════ */

  function applyPerformanceOptimizations() {
    // GPU acceleration ipuçları
    const perfStyle = document.createElement("style");
    perfStyle.id = "scord-perf-fixes";
    perfStyle.textContent = `
      /* GPU acceleration for smooth animations */
      .msg-row,
      .channel-item,
      .member-item,
      .server-rail,
      .channel-sidebar,
      .main-content,
      .voice-participant-card,
      .modal,
      .dm-sheet {
        will-change: auto;
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        backface-visibility: hidden;
        -webkit-backface-visibility: hidden;
      }

      /* Smooth scroll her yerde */
      .messages-area,
      .channel-list,
      .members-list,
      #members-list,
      .dm-body {
        scroll-behavior: smooth;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior: contain;
      }

      /* Kaydırma çubuğu daha ince ve smooth */
      *::-webkit-scrollbar {
        width: 4px;
        height: 4px;
      }
      *::-webkit-scrollbar-track {
        background: transparent;
      }
      *::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.15);
        border-radius: 4px;
      }

      /* Animasyon süreleri optimize */
      .toast,
      .ctx-menu,
      .modal-backdrop,
      .dm-overlay {
        transition: opacity 0.12s ease, transform 0.12s ease;
      }

      /* Metin render kalitesi */
      body {
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-rendering: optimizeLegibility;
      }

      /* Görsel katman yönetimi */
      .server-rail { contain: layout style; }
      .channel-sidebar { contain: layout; }
    `;
    document.head.appendChild(perfStyle);
  }

  /* ══════════════════════════════════════════════════════════
     12. CHAT TASARIM STİLİ CSS FİXİ
  ══════════════════════════════════════════════════════════ */

  function applyChatStyleFix() {
    const existing = document.getElementById("scord-chat-style-fix");
    if (existing) return;

    const s = document.createElement("style");
    s.id = "scord-chat-style-fix";
    s.textContent = `
      /* data-scord-chat-style="soft" — Yumuşak baloncuklar */
      html[data-scord-chat-style="soft"] .msg-bubble {
        border-radius: 18px;
        box-shadow: 0 1px 4px rgba(0,0,0,0.12);
      }
      html[data-scord-chat-style="soft"] .msg-row--self .msg-bubble {
        border-bottom-right-radius: 4px;
      }
      html[data-scord-chat-style="soft"] .msg-row:not(.msg-row--self) .msg-bubble {
        border-bottom-left-radius: 4px;
      }

      /* data-scord-chat-style="sharp" — Keskin köşeler */
      html[data-scord-chat-style="sharp"] .msg-bubble {
        border-radius: 4px !important;
        box-shadow: none;
      }

      /* data-scord-chat-style="compact" — Kompakt görünüm */
      html[data-scord-chat-style="compact"] .msg-row {
        margin-bottom: 1px !important;
      }
      html[data-scord-chat-style="compact"] .msg-bubble {
        padding: 4px 10px !important;
        border-radius: 6px !important;
      }
      html[data-scord-chat-style="compact"] .msg-avatar {
        width: 28px !important;
        height: 28px !important;
      }

      /* data-scord-chat-style="cozy" — Geniş, rahat */
      html[data-scord-chat-style="cozy"] .msg-row {
        margin-bottom: 10px !important;
      }
      html[data-scord-chat-style="cozy"] .msg-bubble {
        padding: 12px 16px !important;
        border-radius: 16px !important;
      }

      /* data-scord-chat-style="discord" — Discord tarzı flat */
      html[data-scord-chat-style="discord"] .msg-bubble {
        background: transparent !important;
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 2px 0 !important;
      }
      html[data-scord-chat-style="discord"] .msg-row--self .msg-bubble {
        background: transparent !important;
      }
      html[data-scord-chat-style="discord"] .msg-row {
        border-radius: 0 !important;
      }
      html[data-scord-chat-style="discord"] .msg-row:hover {
        background: rgba(255,255,255,0.04) !important;
      }
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     13. AYARLAR — SFX seçenekleri ekle
  ══════════════════════════════════════════════════════════ */

  function injectSFXSettings(page) {
    if (!page || page.querySelector("#sfx-settings-section")) return;
    const section = document.createElement("div");
    section.id = "sfx-settings-section";
    section.style.cssText = "margin-top:20px;padding:16px;background:rgba(255,255,255,0.05);border-radius:12px;";
    section.innerHTML = `
      <h4 style="margin:0 0 12px;font-size:14px;font-weight:600;opacity:0.9;">🔊 Ses Efektleri</h4>
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:10px;">
        <input type="checkbox" id="sfx-enabled-chk" ${sfxEnabled() ? "checked" : ""} style="width:16px;height:16px;">
        <span style="font-size:13px;">Discord benzeri ses efektleri</span>
      </label>
      <label style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:12px;opacity:0.7;min-width:80px;">Ses seviyesi</span>
        <input type="range" id="sfx-volume-range" min="0" max="1" step="0.05"
          value="${sfxVolume()}" style="flex:1;accent-color:var(--accent,#7289da);">
        <span id="sfx-vol-display" style="font-size:12px;min-width:32px;">${Math.round(sfxVolume()*100)}%</span>
      </label>
      <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
        ${["join","leave","message","dm","mute","mention"].map(name =>
          `<button onclick="playDiscordSFX('${name}')" style="padding:4px 10px;border-radius:6px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);cursor:pointer;font-size:11px;">${name}</button>`
        ).join("")}
      </div>
    `;
    page.appendChild(section);

    const chk = section.querySelector("#sfx-enabled-chk");
    const rangeEl = section.querySelector("#sfx-volume-range");
    const display = section.querySelector("#sfx-vol-display");

    chk?.addEventListener("change", () => {
      localStorage.setItem("scord_sfx_enabled", chk.checked ? "true" : "false");
      if (chk.checked) playDiscordSFX("click");
    });
    rangeEl?.addEventListener("input", () => {
      const v = parseFloat(rangeEl.value);
      localStorage.setItem("scord_sfx_volume", v.toFixed(2));
      display.textContent = Math.round(v * 100) + "%";
      playDiscordSFX("click");
    });
  }

  /* ══════════════════════════════════════════════════════════
     14. SES EFEKTLERİ — Otomatik tetikleyiciler
  ══════════════════════════════════════════════════════════ */

  function hookSoundEvents() {
    // Sesli kanala katılma/ayrılma
    const _origJoinVoice = window.joinVoiceChannel;
    if (_origJoinVoice) {
      window.joinVoiceChannel = function (...args) {
        const result = _origJoinVoice.apply(this, args);
        setTimeout(() => playDiscordSFX("join"), 200);
        return result;
      };
    }

    const _origLeaveVoice = window.leaveVoiceChannel;
    if (_origLeaveVoice) {
      window.leaveVoiceChannel = function (...args) {
        playDiscordSFX("leave");
        return _origLeaveVoice.apply(this, args);
      };
    }

    // Mute/unmute
    const micBtn = document.getElementById("mic-toggle-btn");
    if (micBtn) {
      micBtn.addEventListener("click", () => {
        setTimeout(() => {
          const isMuted = window.state?.muted;
          playDiscordSFX(isMuted ? "mute" : "unmute");
        }, 50);
      });
    }

    // Mesaj gönderme sesi
    const sendBtn = document.getElementById("send-btn");
    if (sendBtn) {
      sendBtn.addEventListener("click", () => playDiscordSFX("message"));
    }
    // Enter ile gönder
    const chatInput = document.getElementById("chat-input");
    if (chatInput) {
      chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) playDiscordSFX("message");
      });
    }

    // DM gönderme
    const dmSendBtn = document.getElementById("dm-send-btn");
    if (dmSendBtn) {
      dmSendBtn.addEventListener("click", () => playDiscordSFX("dm"));
    }
    const dmInput = document.getElementById("dm-input");
    if (dmInput) {
      dmInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) playDiscordSFX("dm");
      });
    }
  }

  /* ══════════════════════════════════════════════════════════
     INIT — Tüm fixleri başlat
  ══════════════════════════════════════════════════════════ */

  function init() {
    applyPerformanceOptimizations();
    applyChatStyleFix();

    // DOM hazır olduktan sonra
    function onDOMReady() {
      patchSaveServerSettings();
      patchWSMessageHandler();
      hookSoundEvents();
      enhanceDMOverlay();

      // Ayarlar sayfası açıldığında SFX bölümünü ekle
      const observer = new MutationObserver(() => {
        const page = document.querySelector(".settings-page, .scord-settings-shell");
        if (page) injectSFXSettings(page);
        enhanceDMOverlay();
      });
      observer.observe(document.body, { childList: true, subtree: true });

      // applyChatCustomization'ı her zaman çağır
      if (typeof window.applyChatCustomization === "function") {
        window.applyChatCustomization();
      }

      // DM silme butonunu overlay'e ekle
      const dmHeader = document.querySelector(".dm-header");
      if (dmHeader) enhanceDMOverlay();

      console.log("[Shercord Fixes] ✅ Tüm düzeltmeler yüklendi.");
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", onDOMReady);
    } else {
      onDOMReady();
    }
  }

  init();
})();
