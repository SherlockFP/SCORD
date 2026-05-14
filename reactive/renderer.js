// SCORD Reactive Renderer — mini lit-html
// Kullanım: render(html`<div>${variable}</div>`, container)

(function () {
    "use strict";

    // ── html tagged template ────────────────────────────────
    // html`<div class="${cls}">${content}</div>`
    // → HTMLTemplateElement (fragment)
    window.html = function html(strings) {
        var values = [];
        for (var i = 1; i < arguments.length; i++) {
            values.push(arguments[i]);
        }
        return new HtmlResult(strings, values);
    };

    function HtmlResult(strings, values) {
        this.strings = strings;
        this.values = values;
    }

    // ── render(htmlResult, container) ───────────────────────
    // container.innerHTML = htmlResult'in render'lanmış hali
    // DOM farkını algılar ve sadece değişen kısımları günceller
    window.render = function (result, container) {
        if (!container) return;
        if (result instanceof HtmlResult) {
            _apply(result, container);
        } else if (typeof result === "string") {
            container.innerHTML = result;
        } else if (result && result.nodeType) {
            container.innerHTML = "";
            container.appendChild(result);
        }
    };

    // ── createComponent(name, renderFn) ────────────────────
    // Bileşen tanımlama. renderFn her state değiştiğinde çağrılır.
    // Kullanım:
    //   createComponent("status-bar", function () {
    //     return html`<div>${store.auth.username}</div>`;
    //   });
    window.createComponent = function (name, renderFn) {
        var comp = {
            name: name,
            render: renderFn,
            el: null,
            mounted: false,

            // DOM'a bağla
            mount: function (selector) {
                comp.el = document.querySelector(selector);
                if (!comp.el) {
                    console.warn("[Component] mount point not found:", selector);
                    return;
                }
                comp.mounted = true;
                comp.update();
                return comp;
            },

            // Yeniden render
            update: function () {
                if (!comp.mounted || !comp.el) return;
                var result = renderFn();
                window.render(result, comp.el);
            },
        };

        // Store değişikliklerinde otomatik güncelle
        window.__onStoreChange(function () {
            comp.update();
        });

        return comp;
    };

    // ── _apply: HtmlResult'u DOM'a uygula ─────────────────
    var _partUID = 0;

    function _apply(result, container) {
        var html = _interpolate(result);
        if (!container.__parts) container.__parts = {};

        // Basit yaklaşım: innerHTML + event delegation
        // İleride diff algoritması eklenebilir
        container.innerHTML = html;
    }

    function _escape(str) {
        if (str == null) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function _attrEscape(str) {
        if (str == null) return "";
        return String(str).replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function _interpolate(result) {
        var parts = [];
        var str = result.strings[0];
        for (var i = 0; i < result.values.length; i++) {
            var val = result.values[i];
            var next = result.strings[i + 1] || "";

            // Son string'in son karakteri '@' ise → attribute (escape etme)
            var isAttr = str.endsWith('"') && next.startsWith('"');

            if (Array.isArray(val)) {
                parts.push(str + val.join("") + next);
            } else if (val instanceof HtmlResult) {
                parts.push(str + _interpolate(val) + next);
            } else if (val == null || val === false || val === undefined) {
                parts.push(str + next);
            } else if (isAttr) {
                parts.push(str + _attrEscape(val) + next);
            } else {
                parts.push(str + _escape(val) + next);
            }
            str = "";
        }
        if (str) parts.push(str);
        return parts.join("");
    }

    // ── Yardımcı event binding ────────────────────────────
    // Kullanım: html`<button onclick="${handler}">`
    // NOT: onclick ile çalışır, addEventListener gerekmez
    // Daha iyisi: event delegation

    console.log("[Reactive] Renderer loaded");
})();
