// Chat Store — mesajlar, typing, DM, emoji

defineStore("chat", function () {
    return {
        // Aktif kanal
        activeChannelId: null,
        activeServerId: null,
        activeDM: null,

        // Mesajlar
        dms: {},
        recentDMs: [],
        replyTo: null,
        _queuedBroadcastToastAt: 0,

        // Typing
        typingIndicators: {},
        _typingTimeout: null,

        // Emoji & GIF
        emojiOpen: false,

        // Çeviri
        translationEnabled: false,
        targetLang: "tr",

        // Sohbet ayarları
        notifSettings: { chat: true, dm: true, join: true, chatLevel: "all" },
        compactMode: false,
    };
});
