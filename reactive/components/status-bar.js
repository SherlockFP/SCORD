// SCORD Status Bar — Reactive Component
// Kullanım: mount("#status-bar")

(function () {
    "use strict";

    var STATUS_ICONS = {
        online: { text: "Çevrimiçi", icon: "●", color: "#3ba55c" },
        idle: { text: "Boşta", icon: "●", color: "#faa61a" },
        dnd: { text: "Rahatsız Etmeyin", icon: "●", color: "#ed4245" },
        offline: { text: "Görünmez", icon: "○", color: "#747f8d" },
    };

    window.StatusBarComponent = window.createComponent("status-bar", function () {
        var auth = window.SCORD_STORES.auth || {};
        var server = window.SCORD_STORES.server || {};
        var status = server.status || "online";
        var customStatus = server.customStatus || "";
        var statusEmoji = server.statusEmoji || "";
        var game = server.gameActivity;

        var info = STATUS_ICONS[status] || STATUS_ICONS.online;

        var activityHtml = "";
        if (game && game.name) {
            activityHtml = '<div class="status-activities">' + _escape(game.name) + '</div>';
        }

        return window.html(
            ['<div class="status-indicator" style="--status-color:' + info.color + '" title="Durum">',
             '<span class="status-dot" style="background:' + info.color + '"></span>',
             '<span class="status-text">' + _escape(info.text) + '</span>',
             '</div>',
             '<div class="status-custom">',
             statusEmoji ? '<span class="status-emoji">' + _escape(statusEmoji) + '</span>' : "",
             customStatus ? '<span class="custom-status-text">' + _escape(customStatus) + '</span>' : "",
             '</div>',
             activityHtml].join("")
        );
    });

    function _escape(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    console.log("[Component] StatusBar registered");
})();
