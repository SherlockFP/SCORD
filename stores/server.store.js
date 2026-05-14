// Server Store — sunucular, kanallar, roller, mesaj geçmişi

defineStore("server", function () {
    return {
        // Sunucu listesi
        servers: [],

        // Oda
        roomCreatedAt: {},

        // Roller & izinler
        peerRoles: {},
        pinnedMessages: [],

        // Geçmiş
        history: {},

        // P2P state
        _p2pOutbox: [],

        // Peer durum
        peerStatuses: {},

        // Aktivite
        gameActivity: null,
        spotifyActivity: null,
        _gameActivities: {},

        // Direct call
        directCall: null,

        // Mesaj arama
        userProfiles: {},
        userNotes: {},

        // Diğer
        _a11yAnnounceAt: 0,
        recentVoiceToasts: new Set(),
        userVolumes: {},
        peerLatencyMs: {},
        peerIngressMs: {},
        _rttPingTimer: null,
        _meshHealthTimer: null,
        _lastMeshStatus: "",
    };
});
