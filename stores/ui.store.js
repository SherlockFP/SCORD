// UI Store — tema, sidebar, modal, görünüm

defineStore("ui", function () {
    var savedTheme = null;
    try { savedTheme = localStorage.getItem("scord_theme"); } catch (e) {}
    var savedBg = null;
    try { savedBg = localStorage.getItem("scord_bg_image"); } catch (e) {}

    return {
        // Görünüm
        theme: savedTheme || "sapphire",
        appBackground: savedBg || null,
        _appliedTheme: null,

        // Sidebar
        membersOpen: true,
        searchOpen: false,
        searchQuery: "",
        searchResults: [],

        // Modal
        _qsOpen: false,

        // Chat stili
        settings: {
            theme: 'dark',
            messageDensity: 'cozy',
            emojiSize: 'medium',
            animations: true,
            soundEnabled: true,
            notificationSound: 'default',
            highContrast: false,
            fontSize: 14,
            fontFamily: 'Inter',
        },

        // Mobile
        mobileMenuOpen: false,

        // Focus modu
        focusMode: false,
    };
});
