// SCORD Server Rail — Reactive Component
// Kullanım: mount("#server-icons")

(function () {
    "use strict";

    window.ServerRailComponent = window.createComponent("server-rail", function () {
        var serverStore = window.SCORD_STORES.server || {};
        var servers = serverStore.servers || [];
        var activeId = serverStore.activeServerId;

        var items = servers.map(function (s) {
            var isActive = s.id === activeId;
            var cls = "rail-icon rail-server-guild" + (isActive ? " active" : "") + (s._offline ? " offline" : "");

            if (s.icon_url) {
                var initials = window.initials ? window.initials(s.name) : (s.name ? s.name.charAt(0).toUpperCase() : "?");
                var color = s.color || "#6366f1";
                return '<button type="button" class="' + cls + '" data-server-id="' + s.id + '" title="' + _escape(s.name) + '" onclick="window.switchToServer(\'' + s.id + '\')" oncontextmenu="window.showServerContextMenu(event, {id:\'' + s.id + '\',name:\'' + _escape(s.name) + '\'})">' +
                    '<img src="' + _escape(s.icon_url) + '" alt="" class="rail-guild-img" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement._imgFailed=true;var p=this.parentElement;p.innerHTML=\'\';p.textContent=p._si||\'?\';p.style.background=p._sc||\'var(--accent-light)\';p.style.padding=\'\';" />' +
                    '</button>';
            }
            return '<button type="button" class="' + cls + '" data-server-id="' + s.id + '" title="' + _escape(s.name) + '" onclick="window.switchToServer(\'' + s.id + '\')" oncontextmenu="window.showServerContextMenu(event, {id:\'' + s.id + '\',name:\'' + _escape(s.name) + '\'})">' +
                window.initials ? window.initials(s.name) : (s.name ? s.name.charAt(0).toUpperCase() : "?") +
                '</button>';
        });

        return window.html(items);
    });

    function _escape(str) {
        if (!str) return "";
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    console.log("[Component] ServerRail registered");
})();
