/* Durable, recipient-only direct messages. An ACK means stored, never read. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.ScordDM = api; api.mount(root); }
})(typeof window !== 'undefined' ? window : globalThis, function() {
  'use strict';
  const valid = x => typeof x === 'string' && /^[\w-]{1,128}$/.test(x) && !['__proto__','constructor','prototype'].includes(x);
  function create(identity, storage, send, changed = () => {}, blocked = () => false, clock = Date.now) {
    const key = 'scord_dm_v1:' + identity;
    let records = [];
    let seen = [];
    let removed = [];
    let lastStored = null;
    try {
      lastStored = storage.getItem(key);
      const saved = JSON.parse(lastStored);
      if (saved?.version === 1 && Array.isArray(saved.seen)) seen = saved.seen.filter(x => typeof x === 'string').slice(-4000);
      if (saved?.version === 1 && Array.isArray(saved.removed)) removed = saved.removed.filter(x => typeof x === 'string').slice(-8000);
      if (saved?.version === 1 && Array.isArray(saved.records)) records = saved.records.filter(r => valid(r.id) && valid(r.peer) && [identity,r.peer].includes(r.authorId) && typeof r.text === 'string' && r.text.length <= 2000 && ['queued','delivered','received','cancelled'].includes(r.delivery)).slice(-4000);
    } catch (_) {}
    const attempts = new Map();
    const recordKey = r => r.authorId+':'+r.id;
    function refresh() {
      let saved; try { const raw=storage.getItem(key); if(raw===lastStored)return; saved=JSON.parse(raw); lastStored=raw; } catch (_) { return; }
      if (saved?.version !== 1 || !Array.isArray(saved.records)) return;
      removed = [...new Set([...removed,...(Array.isArray(saved.removed) ? saved.removed.filter(x=>typeof x==='string') : [])])].slice(-8000);
      seen = [...new Set([...seen,...(Array.isArray(saved.seen) ? saved.seen.filter(x=>typeof x==='string') : [])])].slice(-4000);
      const map = new Map(records.map(r=>[recordKey(r),r]));
      const rank = {queued:0,cancelled:1,delivered:2,received:2};
      for (const r of saved.records) {
        if (!valid(r?.id) || !valid(r.peer) || ![identity,r.peer].includes(r.authorId) || typeof r.text !== 'string' || r.text.length > 2000 || !Object.hasOwn(rank,r.delivery)) continue;
        const prior = map.get(recordKey(r));
        if (!prior || rank[r.delivery] >= rank[prior.delivery]) map.set(recordKey(r),r);
      }
      records = [...map.values()].filter(r=>!removed.includes(recordKey(r)));
    }
    function commit(next, nextSeen = seen) {
      const serialized=JSON.stringify({version:1,records:next,seen:nextSeen,removed});
      storage.setItem(key,serialized); lastStored=serialized;
      records = next; seen = nextSeen;
      // Rendering failure must never turn a successful durable write into a failed send.
      try { changed(records); } catch (_) {}
    }
    function enqueue(peer, message) {
      refresh();
      if (!valid(peer) || peer === identity || blocked(peer)) return {error:'Bu kişiye mesaj gönderilemiyor.'};
      if (!message?.text?.trim() || message.text.length > 2000) return {error:'Mesaj 1–2000 karakter olmalı.'};
      if (records.filter(r => r.delivery === 'queued').length >= 100) return {error:'Bekleyen 100 mesaj var. Önce bağlantıyı kontrol et.'};
      // Never silently discard history to make storage space.
      if (records.length >= 4000) return {error:'Yerel mesaj arşivi dolu. Yeni mesaj kaydedilemedi.'};
      const id = globalThis.crypto.randomUUID();
      const r = {id,peer,authorId:identity,author:String(message.author || 'Kullanıcı').slice(0,80),text:message.text.trim(),time:String(message.time || '').slice(0,20),timestamp:clock(),delivery:'queued'};
      try { commit([...records,r]); } catch (_) { return {error:'Mesaj kaydedilemedi. Tarayıcı depolaması dolu veya kapalı olabilir; metnin korunuyor.'}; }
      flush(); return {id};
    }
    function flush(forcePeer) {
      refresh();
      for (const r of records.slice()) {
        if (r.delivery !== 'queued' || blocked(r.peer)) continue;
        const prior = attempts.get(r.id);
        if (forcePeer !== r.peer && prior && clock() < prior.next) continue;
        const count = (prior?.count || 0) + 1;
        attempts.set(r.id,{count,next:clock()+Math.min(30000,2000 * 2 ** Math.min(count-1,4))});
        try { send(r.peer,{type:'scord_dm',version:1,action:'message',id:r.id,from:identity,to:r.peer,payload:{author:r.author,text:r.text,time:r.time,timestamp:r.timestamp}}); } catch (_) {}
      }
    }
    function receive(sender, p) {
      if (p?.type !== 'scord_dm') return false;
      refresh();
      if (!valid(sender) || sender === identity || p.version !== 1 || p.from !== sender || p.to !== identity || !valid(p.id) || blocked(sender)) return true;
      if (p.action === 'ack') {
        const record = records.find(r => r.id === p.id && r.peer === sender && r.authorId === identity && r.delivery === 'queued');
        if (record) { try { commit(records.map(r => r === record ? {...r,delivery:'delivered'} : r)); attempts.delete(p.id); } catch (_) {} }
        return true;
      }
      if (p.action !== 'message' || typeof p.payload?.text !== 'string' || !p.payload.text.trim() || p.payload.text.length > 2000) return true;
      const duplicate = seen.includes(sender+':'+p.id) || records.some(r => r.id === p.id && r.peer === sender && r.authorId === sender);
      if (!duplicate) {
        if (records.length >= 4000) return true;
        const r = {id:p.id,peer:sender,authorId:sender,author:String(p.payload.author || 'Kullanıcı').slice(0,80),text:p.payload.text,time:String(p.payload.time || '').slice(0,20),timestamp:clock(),delivery:'received'};
        try { commit([...records,r],[...seen,sender+':'+p.id].slice(-4000)); } catch (_) { return true; }
      }
      try { send(sender,{type:'scord_dm',version:1,action:'ack',id:p.id,from:identity,to:sender}); } catch (_) {}
      return true;
    }
    function cancel(id) {
      refresh();
      const next = records.map(r => r.id === id && r.authorId === identity && r.delivery === 'queued' ? {...r,delivery:'cancelled'} : r);
      commit(next); attempts.delete(id);
    }
    function clear(peer) {
      refresh(); const old = removed;
      removed = [...new Set([...removed,...records.filter(r=>r.peer===peer).map(recordKey)])].slice(-8000);
      try { commit(records.filter(r => r.peer !== peer)); } catch (e) { removed = old; throw e; }
    }
    return {enqueue,receive,flush,cancel,clear,refresh,get records(){return records;}};
  }
  function mount(w) {
    let engine, identity, known = new Set();
    const notify = message => w.toast?.(message,'warning');
    function isBlocked(peer) { return !!w.ScordSocial?.getState?.()?.blocked?.[peer] || !!w.state?.blockedPeers?.includes(peer); }
    function transmit(peer, packet) {
      const dc = w.state?.mesh?.peers?.[peer]?.dc;
      if (dc?.readyState !== 'open' || dc.bufferedAmount > 262144) return false;
      dc.send(JSON.stringify(packet)); return true;
    }
    function sync(records, alert = true) {
      const s = w.state; if (!s) return;
      s.dms ||= {};
      const currentIds = new Set(records.map(r=>r.authorId+':'+r.id));
      for (const peer of Object.keys(s.dms)) s.dms[peer] = s.dms[peer].filter(m=>!m.delivery || currentIds.has(m.authorId+':'+m.id));
      const indexes = new Map(Object.entries(s.dms).map(([peer,list])=>[peer,new Map(list.map((m,i)=>[m.authorId+':'+m.id,i]))]));
      for (const r of records) {
        const list = s.dms[r.peer] ||= [];
        if (!indexes.has(r.peer)) indexes.set(r.peer,new Map());
        const index=indexes.get(r.peer), recordId=r.authorId+':'+r.id, i=index.get(recordId);
        if (i !== undefined) list[i] = {...list[i],...r}; else {index.set(recordId,list.length);list.push({...r});}
        const unique = r.authorId+':'+r.id;
        if (!known.has(unique) && alert && r.delivery === 'received') {
          w.addToRecentDMs?.(r.peer,r.author);
          let muted = false; try { muted = JSON.parse(w.localStorage.getItem('scord_dm_muted') || '[]').includes(r.peer); } catch (_) {}
          if (!muted && s.activeDM !== r.peer && s.notifSettings?.dm !== false) w.toast?.(`${r.author}: ${r.text.slice(0,60)}`,'info');
          if (!muted && s.notifSettings?.messageSound !== false) w.playSound?.(880,150);
        }
        known.add(unique);
      }
      if (s.activeDM) w.renderDMMessages?.(s.activeDM);
    }
    function ready() {
      if (!w.state?.peerId) return;
      if (identity !== w.state.peerId) {
        if (identity) { w.state.dms = {}; w.state.activeDM = null; }
        identity = w.state.peerId; known = new Set();
        engine = create(identity,w.localStorage,transmit,sync,isBlocked);
        sync(engine.records,false);
      }
      return engine;
    }
    api.send = (peer,message) => ready()?.enqueue(peer,message) || {error:'Önce profilini aç.'};
    api.receive = (peer,packet) => ready()?.receive(peer,packet) || false;
    api.restore = () => { const e = ready(); if (e) sync(e.records,false); };
    api.clearPeer = peer => { try { ready()?.clear(peer); return true; } catch (_) { notify('Mesaj geçmişi silinemedi; depolama erişimini kontrol et.'); return false; } };
    const draftKey = peer => 'scord_dm_draft:' + encodeURIComponent(w.state?.peerId || '') + ':' + encodeURIComponent(peer || '');
    api.captureDraft = () => {
      const input = document.getElementById('dm-main-input');
      if (!input || !w.state?.activeDM) return;
      try { w.localStorage.setItem(draftKey(w.state.activeDM),input.value); } catch (_) {}
    };
    api.restoreDraft = () => {
      const input = document.getElementById('dm-main-input');
      if (!input) return;
      try { input.value = w.localStorage.getItem(draftKey(w.state.activeDM)) || ''; } catch (_) { input.value = ''; }
      input.setAttribute('aria-label','Özel mesaj yaz');
      connection();
    };
    function connection() {
      const host = document.querySelector('.dm-main-chat-header'); if (!host) return;
      let status = document.getElementById('dm-connection-status');
      if (!status) { status = document.createElement('p'); status.id = 'dm-connection-status'; status.setAttribute('role','status'); host.after(status); }
      const peer = w.state?.activeDM;
      const connected = w.state?.mesh?.peers?.[peer]?.dc?.readyState === 'open';
      const count = engine?.records.filter(r => r.peer === peer && r.delivery === 'queued').length || 0;
      const message = isBlocked(peer) ? 'Bu kişi engellendi. Mesaj gönderilemez.' : connected ? 'Doğrudan bağlı · Teslim onayı alıcı cihazından gelir.' : 'Doğrudan bağlantı yok · Mesajlar bu cihazda bekler. Ortak sunucuya bağlanın.';
      const text = message + (count ? ` · ${count} mesaj bekliyor` : '');
      if (status.textContent !== text) status.textContent = text;
      status.dataset.connected = String(connected);
    }
    document.addEventListener('input',e => { if (e.target.id === 'dm-main-input') api.captureDraft(); });
    w.addEventListener('storage',e => { if (e.key === 'scord_dm_v1:'+identity) { engine?.refresh(); sync(engine?.records || [],false); } });
    api.statusText = status => ({queued:'Bağlantı / alındı onayı bekleniyor',delivered:'Alıcı cihazına teslim edildi',cancelled:'Yeniden gönderim durduruldu'}[status] || '');
    document.addEventListener('click',e => {
      const button = e.target.closest('[data-dm-action]'); if (!button) return;
      try { if (button.dataset.dmAction === 'retry') ready()?.flush(button.dataset.peer); else ready()?.cancel(button.dataset.messageId); }
      catch (_) { notify('Değişiklik kaydedilemedi.'); }
    });
    function start() { setTimeout(ready,250); setInterval(()=>{ready()?.flush(); connection();},2000); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start); else start();
  }
  const api = {create,mount}; return api;
});
