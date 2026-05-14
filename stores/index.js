// SCORD State Stores — index
// Her store kendi fragment'ını yönetir, global proxy otomatik bağlanır

window.SCORD_STORES = {};
window.__STATE_BRIDGE = {}; // fallback for non-store properties

function defineStore(name, factory) {
    var store = factory();
    window.SCORD_STORES[name] = store;
    return store;
}

// Store'ların hepsi yüklendikten sonra global state proxy'si oluşturulur
window._initStateProxy = function () {
    if (window._stateProxyReady) return;
    window._stateProxyReady = true;

    var stores = window.SCORD_STORES;
    var keys = {};
    Object.keys(stores).forEach(function (k) {
        var s = stores[k];
        Object.keys(s).forEach(function (prop) {
            keys[prop] = k; // property → store mapping
        });
    });

    // Eski state objesini Proxy ile sar (backward compat)
    // app.js'deki `state` değişkeni okumaları bu proxy'ye yönlendirilir
    var handler = {
        get: function (target, prop) {
            if (prop in target) return target[prop];
            var storeName = keys[prop];
            if (storeName) return stores[storeName][prop];
            return undefined;
        },
        set: function (target, prop, value) {
            var storeName = keys[prop];
            if (storeName) {
                stores[storeName][prop] = value;
                // Trigger reactivity
                if (window.__scheduleRender) window.__scheduleRender();
            } else {
                target[prop] = value;
            }
            return true;
        }
    };

    // state objesini Proxy ile değiştir
    if (window._appStateRef) {
        Object.keys(window._appStateRef).forEach(function (k) {
            window._appStateRef[k] = undefined; // cleanup
        });
    }

    console.log("[Stores] State proxy ready —", Object.keys(keys).length, "properties mapped across", Object.keys(stores).length, "stores");
};

// app.js'deki `let state = {...}` yerine kullanılacak fabrika
// Store'lardaki property'leri Proxy ile yönlendirir, olmayanlar fallback'e gider
window.__createStateProxy = function (fallback) {
    if (!fallback) fallback = window.__STATE_BRIDGE;
    window._appStateRef = fallback;

    var stores = window.SCORD_STORES;
    var keys = {};
    Object.keys(stores).forEach(function (k) {
        var s = stores[k];
        Object.keys(s).forEach(function (prop) {
            keys[prop] = k;
        });
    });

    var handler = {
        get: function (target, prop) {
            if (prop === "__isProxy") return true;
            var storeName = keys[prop];
            if (storeName) return stores[storeName][prop];
            return target[prop];
        },
        set: function (target, prop, value) {
            var storeName = keys[prop];
            if (storeName) {
                stores[storeName][prop] = value;
                if (window.__scheduleRender) window.__scheduleRender();
            } else {
                target[prop] = value;
            }
            return true;
        },
        has: function (target, prop) {
            return !!keys[prop] || prop in target;
        },
        ownKeys: function (target) {
            return Object.keys(keys).concat(Object.keys(target));
        },
        getOwnPropertyDescriptor: function (target, prop) {
            if (keys[prop] || prop in target) {
                return { configurable: true, enumerable: true };
            }
            return undefined;
        }
    };

    return new Proxy(fallback, handler);
};

// Render scheduler — tüm store değişikliklerinden sonra DOM güncellemesini batch'ler
window.__renderQueue = [];
window.__renderPending = false;
window.__scheduleRender = function () {
    if (window.__renderPending) return;
    window.__renderPending = true;
    Promise.resolve().then(function () {
        window.__renderPending = false;
        var q = window.__renderQueue.slice();
        window.__renderQueue = [];
        q.forEach(function (fn) { try { fn(); } catch (e) { console.warn("[Render] Error:", e); } });
    });
};
window.__onStoreChange = function (fn) {
    window.__renderQueue.push(fn);
    window.__scheduleRender();
};
