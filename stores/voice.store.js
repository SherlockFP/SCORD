// Voice Store — mic, stream, volume, voice settings

defineStore("voice", function () {
    var savedVoiceSettings = null;
    try { savedVoiceSettings = JSON.parse(localStorage.getItem("scord_voice_settings") || "null"); } catch (e) {}

    return {
        // Mikrofon & ses
        micMuted: false,
        deafened: false,
        localStream: null,
        screenStream: null,
        cameraStream: null,
        remoteAudios: {},
        remoteMedia: {},

        // Voice kanal
        voiceChannelId: null,
        voiceSessionHost: {},
        voiceMembers: {},

        // Ayarlar
        voiceSettings: savedVoiceSettings || {
            micId: "default", volume: 1, filter: "none",
            noiseSuppression: true, echoCancellation: false,
            autoGainControl: false, gateThreshold: 8,
            gateAttack: 0.008, gateRelease: 0.05
        },
        screenShareQuality: "720p",
        cameraQuality: "720p",

        // Stream yönetimi (1→N)
        _activeScreenSharePeer: null,

        // Ses efekti
        currentVoiceEffect: "normal",
        audioContext: null,
    };
});
