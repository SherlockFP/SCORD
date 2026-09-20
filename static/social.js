/* Targeted, consent-based social protocol. No friend graph is broadcast. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ScordSocial = api; api.mount(root); }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const valid = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id) && !Object.hasOwn(Object.prototype, id) && id !== 'prototype';
  const label = value => String(value || 'Kullanıcı').slice(0, 80);
  function create(identity, storage, send, changed = () => {}) {
    const key = 'scord_social_v1:' + identity;
    let data;
    try { data = JSON.parse(storage.getItem(key)); } catch (_) {}
    if (!data || data.version !== 1) data = { version: 1, friends: {}, incoming: {}, outgoing: {}, blocked: {}, outbox: {}, seen: [] };
    // Older or partially written storage must not prevent the social panel from opening.
    for (const field of ['friends', 'incoming', 'outgoing', 'blocked', 'outbox']) {
      const entries = data[field];
      data[field] = {};
      if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
        for (const [id, entry] of Object.entries(entries)) {
          if (!valid(id) || !entry || typeof entry !== 'object') continue;
          if (field === 'outbox') {
            if (entry.id !== id || entry.from !== identity || !valid(entry.to) || entry.type !== 'scord_social') continue;
          } else if (entry.peerId !== id) continue;
          data[field][id] = entry;
        }
      }
    }
    data.seen = Array.isArray(data.seen) ? data.seen.filter(id => typeof id === 'string').slice(-1000) : [];
    const save = () => { storage.setItem(key, JSON.stringify(data)); changed(data); };
    const uid = () => globalThis.crypto?.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2);
    function queue(to, action, requestId, name) {
      const packet = { type: 'scord_social', version: 1, id: uid(), from: identity, to, action, requestId, name: label(name) };
      data.outbox[packet.id] = packet;
      save();
      flush();
      return packet.id;
    }
    function flush() { Object.values(data.outbox).forEach(packet => { if (data.outbox[packet.id] !== packet) return; try { send(packet.to, packet); } catch (_) {} }); }
    function request(peerId, name, ownName) {
      if (!valid(peerId) || peerId === identity) return 'Geçerli bir arkadaş kimliği gir.';
      if (data.blocked[peerId]) return 'Önce bu kişinin engelini kaldır.';
      if (data.friends[peerId]) return 'Zaten arkadaşsınız.';
      if (data.outgoing[peerId]) return 'Bu kişiye gönderilmiş bir isteğin var.';
      if (data.incoming[peerId]) return 'Bu kişiden gelen isteği Bekleyenler sekmesinden yanıtla.';
      const requestId = uid();
      data.outgoing[peerId] = { peerId, name: label(name || peerId), requestId, status: 'queued', timestamp: Date.now() };
      queue(peerId, 'request', requestId, ownName);
      return null;
    }
    function act(action, peerId, ownName) {
      if (!valid(peerId) || peerId === identity) return;
      if (action === 'unblock') { delete data.blocked[peerId]; save(); return; }
      const incoming = data.incoming[peerId], outgoing = data.outgoing[peerId];
      const contactName = data.friends[peerId]?.name || incoming?.name || outgoing?.name || peerId;
      if (action === 'accept' && incoming) {
        data.friends[peerId] = { peerId, name: incoming.name, requestId: incoming.requestId, since: Date.now() };
        delete data.outgoing[peerId];
        Object.keys(data.outbox).forEach(id => { if (data.outbox[id].to === peerId && data.outbox[id].action === 'request') delete data.outbox[id]; });
        delete data.incoming[peerId]; queue(peerId, 'accept', incoming.requestId, ownName);
      } else if (action === 'decline' && incoming) {
        delete data.incoming[peerId]; queue(peerId, 'decline', incoming.requestId, ownName);
      } else if (action === 'cancel' && outgoing) {
        delete data.outgoing[peerId];
        Object.keys(data.outbox).forEach(id => { if (data.outbox[id].to === peerId && data.outbox[id].action === 'request') delete data.outbox[id]; });
        queue(peerId, 'cancel', outgoing.requestId, ownName);
      } else if (action === 'remove' || action === 'block') {
        delete data.friends[peerId]; delete data.incoming[peerId]; delete data.outgoing[peerId];
        Object.keys(data.outbox).forEach(id => { if (data.outbox[id].to === peerId) delete data.outbox[id]; });
        if (action === 'block') data.blocked[peerId] = { peerId, name: label(contactName) };
        queue(peerId, 'remove', null, ownName);
      }
    }
    function receive(sender, p) {
      if (!p || p.type !== 'scord_social') return false;
      if (!valid(sender) || sender === identity || p.version !== 1 || p.from !== sender || p.to !== identity || !valid(p.id)) return true;
      if (p.action === 'ack') {
        if (!valid(p.requestId)) return true;
        const pending = data.outbox[p.requestId];
        if (pending && pending.to === sender) {
          if (pending.action === 'request' && data.outgoing[sender]?.requestId === pending.requestId) data.outgoing[sender].status = 'delivered';
          delete data.outbox[p.requestId]; save();
        }
        return true;
      }
      if (data.blocked[sender]) return true;
      if (!['request', 'accept', 'decline', 'cancel', 'remove'].includes(p.action)) return true;
      if (p.action !== 'remove' && !valid(p.requestId)) return true;
      const ack = () => { try { send(sender, { type: 'scord_social', version: 1, id: uid(), from: identity, to: sender, action: 'ack', requestId: p.id }); } catch (_) {} };
      const seenId = sender + ':' + p.id;
      if (data.seen.includes(seenId)) { ack(); return true; }
      if (p.action === 'request' && !data.friends[sender]) data.incoming[sender] = { peerId: sender, name: label(p.name), requestId: p.requestId, timestamp: Date.now() };
      if (p.action === 'accept' && data.outgoing[sender]?.requestId === p.requestId) {
        data.friends[sender] = { peerId: sender, name: label(p.name), requestId: p.requestId, since: Date.now() };
        delete data.outgoing[sender]; delete data.incoming[sender];
      }
      if (p.action === 'decline' && data.outgoing[sender]?.requestId === p.requestId) delete data.outgoing[sender];
      if (p.action === 'cancel') {
        if (data.incoming[sender]?.requestId === p.requestId) delete data.incoming[sender];
        if (data.friends[sender]?.requestId === p.requestId) delete data.friends[sender];
        Object.keys(data.outbox).forEach(id => { if (data.outbox[id].to === sender && data.outbox[id].requestId === p.requestId) delete data.outbox[id]; });
      }
      if (p.action === 'remove') {
        delete data.friends[sender]; delete data.incoming[sender]; delete data.outgoing[sender];
        Object.keys(data.outbox).forEach(id => { if (data.outbox[id].to === sender) delete data.outbox[id]; });
      }
      data.seen.push(seenId); data.seen = data.seen.slice(-1000); save(); ack(); return true;
    }
    return { data, request, act, receive, flush, isBlocked: peer => !!data.blocked[peer] };
  }
  function mount(w) {
    let engine, identity, panel, tab = 'friends', query = '', installed = false;
    const notice = message => w.toast?.(message, 'info');
    function transmit(peer, packet) {
      const dc = w.state?.mesh?.peers?.[peer]?.dc;
      if (!dc || dc.readyState !== 'open' || dc.bufferedAmount > 262144) return false;
      dc.send(JSON.stringify(packet)); return true;
    }
    function update(data) {
      if (!w.state) return;
      w.state.friends = Object.values(data.friends);
      w.state._friendRequests = Object.values(data.outgoing);
      w.state._pendingRequests = Object.values(data.incoming);
      w.state.blockedPeers = Object.keys(data.blocked);
      w.updateMuteStates?.();
      if (!w.state.activeServerId) w.renderHomeSidebar?.();
      if (panel?.open) render();
      const b = w.document.getElementById('social-hub-button');
      if (b) b.textContent = 'Arkadaşlar' + (Object.keys(data.incoming).length ? ' · ' + Object.keys(data.incoming).length : '');
      w.dispatchEvent(new CustomEvent('scord:social-change'));
    }
    function bindMesh(mesh) {
      if (mesh?.cb && !mesh.cb._social) {
        const previous = mesh.cb.onMessage;
        mesh.cb.onMessage = function (sender, packet) {
          const data = packet?.type === 'broadcast' ? (packet.payload || packet.data) : packet;
          if (engine.receive(sender, data)) return;
          if (engine.isBlocked(sender)) return;
          if (data?.type?.startsWith('friend_')) return; // Ignore legacy broadcast/auto-accept protocol.
          return previous?.apply(this, arguments);
        };
        mesh.cb._social = true;
      }
    }
    function ready() {
      const s = w.state;
      if (!s?.peerId) return;
      if (identity !== s.peerId) {
        identity = s.peerId;
        engine = create(identity, w.localStorage, transmit, update);
        update(engine.data);
      }
      bindMesh(s.mesh);
      if (!installed) {
        installed = true;
        w.addFriend = w.sendFriendRequest = (peer, name) => {
          ready(); const error = engine.request(peer, name, w.state.username);
          notice(error || 'İstek sıraya alındı. Karşı tarafın alındı onayı Bekleyenler’de görünür.');
          if (panel?.open) render();
        };
        w.removeFriend = peer => { ready(); engine.act('remove', peer, w.state.username); w.renderHomeSidebar?.(); };
        w.toggleFriendStatus = (peer, name) => engine.data.friends[peer] ? w.removeFriend(peer) : w.addFriend(peer, name);
        w.toggleBlockStatus = peer => { ready(); engine.act(engine.isBlocked(peer) ? 'unblock' : 'block', peer, w.state.username); };
        w.showAddFriendByTagModal = () => open('add');
        w._acceptFriendRequest = peer => engine.act('accept', peer, w.state.username);
        w._rejectFriendRequest = peer => engine.act('decline', peer, w.state.username);
        w._showFriendRequestNotification = () => open('pending');
        w.loadFriendsFromStorage = () => update(engine.data);
        w.saveFriendsToStorage = () => update(engine.data);
      }
      const host = w.document.getElementById('channel-sidebar');
      if (host && !w.document.getElementById('social-hub-button')) {
        const button = w.document.createElement('button'); button.id = 'social-hub-button'; button.className = 'btn-secondary social-hub-button'; button.textContent = 'Arkadaşlar'; button.onclick = () => open('friends'); host.prepend(button);
      }
    }
    function el(tag, text, className) { const e = w.document.createElement(tag); if (text != null) e.textContent = text; if (className) e.className = className; return e; }
    function button(text, callback) { const b = el('button', text, 'btn-secondary'); b.type = 'button'; b.onclick = callback; return b; }
    function open(next = 'friends') {
      ready(); if (!engine) { notice('Önce bir profil oluştur.'); return; }
      tab = next; query = '';
      if (!panel) {
        panel = el('dialog', null, 'social-dialog'); panel.id = 'social-dialog'; panel.setAttribute('aria-label', 'Arkadaş merkezi'); w.document.body.append(panel);
        panel.addEventListener('click', e => { if (e.target === panel) { const r = panel.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) panel.close(); } });
      }
      render(); if (!panel.open) panel.showModal();
    }
    function render() {
      const focused = w.document.activeElement?.id; const selection = w.document.activeElement?.selectionStart;
      panel.replaceChildren();
      const header = el('div', null, 'social-heading'); header.append(el('div', 'Arkadaşlarınla bağlantıda kal', 'social-title'), button('Kapat', () => panel.close())); panel.append(header);
      panel.append(el('p', 'İstekler yalnızca alıcıya gider. Teslimat için aynı P2P odasında doğrudan bağlantı gerekir.', 'social-hint'));
      const tabs = el('nav', null, 'social-tabs'); tabs.setAttribute('aria-label', 'Arkadaş filtreleri');
      [['friends', 'Tümü'], ['online', 'Bağlı'], ['pending', 'Bekleyenler (' + (Object.keys(engine.data.incoming).length + Object.keys(engine.data.outgoing).length) + ')'], ['blocked', 'Engellenenler'], ['add', '+ Arkadaş ekle']].forEach(([key, title]) => { const b = button(title, () => { tab = key; query = ''; render(); }); b.setAttribute('aria-pressed', String(tab === key)); tabs.append(b); }); panel.append(tabs);
      if (tab === 'add') {
        panel.append(el('p', 'Kimliğini paylaş: ' + identity, 'social-identity'));
        panel.append(button('Kimliğimi kopyala', async () => { try { await w.navigator.clipboard.writeText(identity); notice('Kimlik kopyalandı.'); } catch (_) { notice('Kopyalanamadı. Yukarıdaki kimliği seçerek kopyalayabilirsin.'); } }));
        const form = el('form', null, 'social-add-form'); const input = el('input'); input.placeholder = 'Arkadaşının tam P2P kimliği'; input.setAttribute('aria-label', 'Arkadaşının P2P kimliği'); input.required = true; input.maxLength = 128;
        const submit = button('İstek gönder', () => {}); submit.type = 'submit';
        form.append(input, submit); form.onsubmit = e => { e.preventDefault(); const peer = input.value.trim(); const error = engine.request(peer, peer, w.state.username); if (error) notice(error); else { tab = 'pending'; render(); } }; panel.append(form); return;
      }
      const search = el('input'); search.id = 'social-search'; search.type = 'search'; search.placeholder = 'İsim veya kimlikle ara'; search.setAttribute('aria-label', 'Arkadaş ara'); search.value = query; search.oninput = () => { query = search.value; render(); }; panel.append(search);
      const rows = el('div', null, 'social-rows'); rows.setAttribute('aria-live', 'polite'); panel.append(rows);
      const groups = tab === 'pending' ? [['incoming', 'Gelen istekler'], ['outgoing', 'Gönderilen istekler']] : [[tab === 'blocked' ? 'blocked' : 'friends', '']];
      let count = 0;
      groups.forEach(([kind, title]) => {
        const people = Object.values(engine.data[kind]).filter(p => (p.name + p.peerId).toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')) && (tab !== 'online' || w.state.mesh?.peers?.[p.peerId]?.dc?.readyState === 'open'));
        if (title && people.length) rows.append(el('h3', title));
        people.forEach(p => {
          count++; const row = el('div', null, 'social-row'); const details = el('div', null, 'social-details'); details.append(el('strong', p.name), el('small', p.peerId));
          if (kind === 'outgoing') details.append(el('small', p.status === 'delivered' ? 'Alıcıya ulaştı · yanıt bekleniyor' : 'Teslim onayı bekleniyor · bağlantıda tekrar denenecek'));
          if (kind === 'friends') details.append(el('small', w.state.mesh?.peers?.[p.peerId]?.dc?.readyState === 'open' ? 'Doğrudan bağlı' : 'Doğrudan bağlantı yok'));
          row.append(details); const actions = el('div', null, 'social-actions'); row.append(actions);
          const act = (action, text) => actions.append(button(text, () => { engine.act(action, p.peerId, w.state.username); w.renderHomeSidebar?.(); }));
          if (kind === 'incoming') { act('accept', 'Kabul et'); act('decline', 'Reddet'); }
          if (kind === 'outgoing') act('cancel', 'İptal et');
          if (kind === 'friends') { actions.append(button('Mesaj', () => { panel.close(); w.openDM?.(p.peerId, p.name); })); act('remove', 'Çıkar'); }
          if (kind === 'blocked') act('unblock', 'Engeli kaldır'); else act('block', 'Engelle');
          rows.append(row);
        });
      });
      if (!count) rows.append(el('div', query ? 'Aramana uygun kişi bulunamadı.' : tab === 'pending' ? 'Bekleyen istek yok. Yeni bir bağlantı kurmaya hazırsın.' : 'Burası henüz boş. Bir arkadaş kimliğiyle başlayabilirsin.', 'social-empty'));
      const pending = Object.values(engine.data.outbox).filter(p => p.action !== 'request').length;
      if (pending) panel.append(el('p', pending + ' değişiklik karşı tarafla bağlantı kurulunca eşitlenecek.', 'social-hint'));
      if (focused === 'social-search') { search.focus(); if (selection != null) search.setSelectionRange?.(selection, selection); }
    }
    const css = el('style'); css.textContent = '.social-dialog{width:min(760px,94vw);max-height:86vh;overflow:auto;border:1px solid var(--border,#34394d);border-radius:20px;padding:26px;background:var(--bg-primary,#151925);color:var(--text-primary,#edf1ff);box-shadow:0 30px 100px #0009}.social-dialog::backdrop{background:#080b16b8;backdrop-filter:blur(7px)}.social-heading,.social-row,.social-actions,.social-tabs{display:flex;align-items:center;gap:10px}.social-heading{justify-content:space-between}.social-title{font-size:22px;font-weight:750}.social-hint,.social-details small{color:var(--text-muted,#99a4ba);font-size:12px;line-height:1.6}.social-tabs{flex-wrap:wrap;margin:22px 0}.social-tabs [aria-pressed=true]{background:var(--accent,#626bff);color:white}.social-dialog input{box-sizing:border-box;width:100%;border:1px solid var(--border,#34394d);border-radius:10px;padding:12px;background:var(--bg-secondary,#10141f);color:inherit}.social-row{padding:16px 0;border-bottom:1px solid var(--border,#34394d);flex-wrap:wrap}.social-details{flex:1;min-width:190px}.social-details strong,.social-details small{display:block;overflow-wrap:anywhere}.social-actions{flex-wrap:wrap}.social-actions button,.social-tabs button{font-size:12px}.social-empty{text-align:center;padding:45px 15px;color:var(--text-muted,#99a4ba)}.social-add-form{display:flex;gap:10px;margin-top:20px}.social-identity{overflow-wrap:anywhere}.social-hub-button{margin:12px;width:calc(100% - 24px);min-height:38px}.social-dialog button:focus-visible,.social-dialog input:focus-visible{outline:2px solid var(--accent,#929aff);outline-offset:3px}'; w.document.head.append(css);
    // Install before connect establishes any data channel; the interval also covers existing meshes.
    if (w.P2PMesh?.prototype?.connect) {
      const connect = w.P2PMesh.prototype.connect;
      w.P2PMesh.prototype.connect = function () { ready(); bindMesh(this); return connect.apply(this, arguments); };
    }
    function start() { setTimeout(ready, 100); setInterval(() => { ready(); engine?.flush(); }, 3000); }
    if (w.document.readyState === 'loading') w.document.addEventListener('DOMContentLoaded', start); else start();
    returnApi.open = open;
    returnApi.getState = () => { ready(); return engine?.data; };
  }
  const returnApi = { create, mount };
  return returnApi;
});
