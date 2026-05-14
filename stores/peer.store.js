// Peer Store — mesh, arkadaşlar, engellenenler

defineStore("peer", function () {
    var savedFriends = null;
    try { savedFriends = localStorage.getItem("scord_friends"); } catch (e) {}
    var savedDMs = null;
    try { savedDMs = localStorage.getItem("scord_recent_dms"); } catch (e) {}
    var savedBlocked = null;
    try { savedBlocked = localStorage.getItem("scord_blocked_peers"); } catch (e) {}

    return {
        // Mesh / P2P
        mesh: null,
        _lastMeshStatus: null,

        // Arkadaş listesi
        friends: savedFriends ? (function () { try { return JSON.parse(savedFriends); } catch (e) { return []; } })() : [],
        recentDMs: savedDMs ? (function () { try { return JSON.parse(savedDMs); } catch (e) { return []; } })() : [],
        blockedPeers: savedBlocked ? (function () { try { return JSON.parse(savedBlocked); } catch (e) { return []; } })() : [],

        // İstekler
        _friendRequests: [],
        _pendingRequests: [],

        // DM
        dms: {},
    };
});
