// Auth Store — identity, session, credentials

defineStore("auth", function () {
    var savedUsername = null;
    try { savedUsername = localStorage.getItem("scord_username"); } catch (e) {}
    var savedPeerId = null;
    try { savedPeerId = localStorage.getItem("scord_peer_id"); } catch (e) {}
    var savedAvatar = null;
    try { savedAvatar = localStorage.getItem("scord_avatar_image"); } catch (e) {}
    var savedColor = null;
    try { savedColor = localStorage.getItem("scord_color"); } catch (e) {}

    return {
        // Kimlik
        peerId: savedPeerId || null,
        username: savedUsername || "",
        avatarColor: savedColor || "#7c3aed",
        avatarImage: savedAvatar || null,

        // Session
        _savedNick: savedUsername || null,
        _savedPass: null,
        _discriminator: null,

        // Auth state
        _autoLoginDone: false,
        _startAppRunning: false,

        // Yardımcı
        get isLoggedIn: function () { return !!this.peerId; },
    };
});
