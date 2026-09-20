/* A single profile surface backed by current membership and the consent-based social engine. */
(function (root) {
  'use strict';
  function safeAvatar(value) {
    const src = String(value || '').trim();
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(src)) return src;
    try { const url = new URL(src); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; } catch { return ''; }
  }
  function mutualServers(servers, peer) { return (servers || []).filter(server => server.members?.some(member => member.peer_id === peer)); }
  function noteKey(identity, peer) { return `scord_profile_note_v2:${encodeURIComponent(identity)}:${encodeURIComponent(peer)}`; }
  const api = { safeAvatar, mutualServers, noteKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  root.ScordProfile = api;
  const el = (tag, className, text) => { const n = document.createElement(tag); n.className = className || ''; if (text != null) n.textContent = text; return n; };
  const paths = {close:'M6 6l12 12M18 6 6 18',copy:'M9 9h11v11H9zM5 15H3V3h12v2',message:'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 2 2-6a8.5 8.5 0 1 1 18-4.5Z',edit:'m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5',person:'M15 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21v-2a6 6 0 0 1 12 0v2M20 8v6M17 11h6',check:'m5 12 4 4L19 6',block:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM6 6l12 12',server:'M4 3h16v7H4zM4 14h16v7H4zM7 6h.01M7 17h.01M11 6h6M11 17h6',lock:'M6 10h12v11H6zM8 10V7a4 4 0 0 1 8 0v3',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z'};
  function icon(name, className = '') { const sharedName = {close:'close',copy:'copy',message:'chat',edit:'settings',person:'user',check:'check',block:'shield',server:'globe',shield:'shield'}[name]; if (sharedName && root.ScordIcons?.create) { const shared = root.ScordIcons.create(sharedName); shared.classList.add('sp-icon'); if (className) shared.classList.add(className); return shared; } const svg = document.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none'); svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.6'); svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round'); svg.setAttribute('aria-hidden','true'); svg.setAttribute('class',`sp-icon ${className}`); const p = document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d',paths[name] || paths.spark); svg.append(p); return svg; }
  const button = (text, fn, kind = '') => { const b = el('button',`sp-button ${kind}`); const name = text === '✕' ? 'close' : /Kopyala/.test(text) ? 'copy' : /Mesaj/.test(text) ? 'message' : /düzenle/.test(text) ? 'edit' : /kabul|kaydet/.test(text) ? 'check' : /Engel|engeli/i.test(text) ? 'block' : /Arkadaş ekle/.test(text) ? 'person' : ''; if (name) b.append(icon(name)); if (text !== '✕') b.append(el('span','',text)); b.type = 'button'; b.onclick = fn; return b; };
  let dialog, active, renderSocial;
  function open(peerId, username, avatarImage, avatarColor) {
    const state = root.state; if (!peerId || !state?.peerId) return;
    const member = (state.servers || []).flatMap(server => server.members || []).find(person => person.peer_id === peerId);
    const self = peerId === state.peerId;
    const name = self ? state.username : (member?.username || username || peerId);
    const image = safeAvatar(self ? state.avatarImage : (avatarImage || member?.avatar_image));
    const color = self ? state.avatarColor : (avatarColor || member?.avatar_color);
    if (!dialog) {
      dialog = el('dialog','sp-dialog'); dialog.id = 'scord-profile-dialog'; dialog.setAttribute('aria-labelledby','sp-profile-name'); document.body.append(dialog);
      dialog.addEventListener('click',event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
      dialog.addEventListener('close', () => { active = null; });
    }
    active = {peerId,identity:state.peerId}; dialog.replaceChildren();
    const banner = el('header','sp-banner'); const wordmark = el('div','sp-wordmark'); wordmark.append(icon('spark'),el('span','','SCORD')); banner.append(wordmark,el('span','sp-eyebrow',self ? 'SENİN PROFİLİN' : 'TOPLULUK PROFİLİ'));
    const close = button('✕', () => dialog.close(),'sp-close'); close.setAttribute('aria-label','Profili kapat'); banner.append(close);
    const body = el('div','sp-body');
    const avatar = el('div','sp-avatar',String(name || '?').slice(0,2).toLocaleUpperCase('tr-TR'));
    dialog.style.removeProperty('--sp-user-color');
    if (/^#[0-9a-f]{3,8}$/i.test(color || '')) { avatar.style.backgroundColor = color; dialog.style.setProperty('--sp-user-color', color); }
    if (image) { const img = el('img'); img.src = image; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove(); avatar.append(img); }
    const heading = el('div','sp-heading'); const title = el('h2','',name); title.id = 'sp-profile-name'; heading.append(title); if (self) heading.append(el('span','sp-tag','Sen'));
    const status = el('p','sp-presence');
    function refreshPresence() {
      const connected = self || root.state?.mesh?.peers?.[peerId]?.dc?.readyState === 'open';
      status.dataset.connected = String(connected);
      const statusLabels = {online:'Çevrimiçi',idle:'Boşta',dnd:'Rahatsız etmeyin',invisible:'Görünmez',offline:'Çevrimdışı'};
      const stateText = self ? statusLabels[root.state.status] || 'Çevrimiçi' : connected ? 'Doğrudan bağlı' : 'Doğrudan bağlantı yok';
      status.textContent = stateText;
    }
    refreshPresence();
    const hero = el('div','sp-hero'); hero.append(avatar,status); body.append(hero,heading);
    const activeServer = state.servers?.find(server => server.id === state.activeServerId && server.members?.some(person => person.peer_id === peerId));
    if (activeServer) { const badges = el('div','sp-badges'); const role = activeServer.ownerId === peerId ? 'Kurucu' : ({admin:'Yönetici',mod:'Moderatör'}[activeServer.peer_roles?.[peerId]] || 'Üye'); const badge = el('span','sp-role-tag'); badge.append(icon(role === 'Üye' ? 'person' : 'shield'),el('span','',role)); badges.append(badge,el('span','sp-context-name',activeServer.name)); body.append(badges); }
    const customStatus = self ? state.customStatus : member?.customStatus;
    if (customStatus) body.append(el('p','sp-custom-status',customStatus));
    const identity = el('div','sp-identity'); const identityText = el('div','sp-identity-text'); identityText.append(el('span','sp-field-eyebrow','BAĞLANTI KİMLİĞİ'),el('code','',peerId)); identity.append(identityText);
    const copyStatus = el('span','sp-copy-status'); copyStatus.setAttribute('role','status');
    identity.append(button('Kopyala',async () => { try { await navigator.clipboard.writeText(peerId); copyStatus.textContent = 'Kimlik kopyalandı'; } catch { copyStatus.textContent = 'Kimliği seçerek kopyalayabilirsin'; } })); body.append(identity,copyStatus);
    const social = el('section','sp-social'); social.setAttribute('aria-label','Bağlantı ve arkadaşlık'); body.append(social);
    function act(fn) { if (root.state?.peerId !== active?.identity) { dialog.close(); return; } try { fn(); } catch { root.toast?.('İşlem tamamlanamadı. Tekrar deneyebilirsin.','error'); } renderSocial(); }
    renderSocial = () => {
      if (!dialog.open && !active) return;
      const data = root.ScordSocial?.getState?.() || {}; const blocked = !!data.blocked?.[peerId]; const friend = !!data.friends?.[peerId]; const incoming = data.incoming?.[peerId]; const outgoing = data.outgoing?.[peerId];
      social.replaceChildren(); refreshPresence();
      if (self) { social.append(button('Profilini düzenle', () => { dialog.close(); if (root.openProfileSettings) root.openProfileSettings(); else root.openSettingsModal?.('profile'); },'sp-primary')); return; }
      social.append(el('p','sp-relation',blocked ? 'Bu kişi engellendi' : friend ? 'Arkadaşsınız' : incoming ? 'Sana arkadaşlık isteği gönderdi' : outgoing ? (outgoing.status === 'delivered' ? 'İsteğin ulaştı · Yanıt bekleniyor' : 'İstek sırada · Bağlantı bekleniyor') : 'Sohbeti bir arkadaşlıkla devam ettir.'));
      const actions = el('div','sp-actions');
      const dm = button('Mesaj gönder', () => { dialog.close(); root.openDM?.(peerId,name,color,image); },'sp-primary'); dm.disabled = blocked; actions.append(dm);
      if (blocked) actions.append(button('Engeli kaldır', () => act(() => root.toggleBlockStatus?.(peerId))));
      else if (incoming) { actions.append(button('İsteği kabul et',() => act(() => root._acceptFriendRequest?.(peerId)))); actions.append(button('Reddet',() => act(() => root._rejectFriendRequest?.(peerId)))); }
      else if (outgoing) actions.append(button('İsteği yönet',() => { dialog.close(); root.ScordSocial?.open('pending'); }));
      else if (!friend) actions.append(button('Arkadaş ekle',() => act(() => root.addFriend?.(peerId,name))));
      social.append(actions);
      if (!blocked) {
        const more = el('details','sp-more'); more.append(el('summary','','Diğer işlemler'));
        if (friend) more.append(button('Arkadaşlıktan çıkar',() => act(() => root.removeFriend?.(peerId)),'sp-danger'));
        more.append(button('Engelle',() => act(() => root.toggleBlockStatus?.(peerId)),'sp-danger')); social.append(more);
      }
    };
    renderSocial();
    const servers = mutualServers(state.servers,peerId); const shared = el('section','sp-section'); const sharedTitle = el('h3'); sharedTitle.append(icon('server'),el('span','',self ? 'Sunucuların' : 'Ortak sunucular'),el('span','sp-section-count',String(servers.length))); shared.append(sharedTitle);
    if (!servers.length) shared.append(el('p','sp-muted','Bu cihazdaki üye listelerinde ortak bir sunucu görünmüyor.'));
    const serverList = el('div','sp-server-list');
    servers.forEach(server => { const row = el('div','sp-server'); const mark = el('span','sp-server-icon',String(server.name || '?').slice(0,1).toLocaleUpperCase('tr-TR')); const detail = el('div','sp-server-detail'); detail.append(el('strong','',server.name || 'Sunucu')); const role = server.ownerId === peerId ? 'Kurucu' : ({admin:'Yönetici',mod:'Moderatör'}[server.peer_roles?.[peerId]] || 'Üye'); detail.append(el('small','',`${server.members?.length || 0} üye`)); row.append(mark,detail,el('span','sp-server-role',role)); serverList.append(row); }); shared.append(serverList); body.append(shared);
    const notes = el('section','sp-section sp-notes'); const label = el('label'); label.append(icon('lock'),el('span','','Özel notun')); label.htmlFor = 'sp-note';
    notes.append(label,el('p','sp-muted','Yalnızca bu tarayıcıdaki mevcut profilin görebilir.'));
    const note = el('textarea'); note.id = 'sp-note'; note.maxLength = 2000; note.rows = 3; note.placeholder = 'Nasıl tanıştınız, birlikte ne yapacaksınız?';
    const key = noteKey(state.peerId,peerId); try { note.value = localStorage.getItem(key) || ''; } catch { /* Unavailable storage is reported on save. */ }
    const noteStatus = el('span','sp-note-status'); noteStatus.setAttribute('role','status');
    let savedNote = note.value;
    const noteCount = el('span','sp-note-count',`${note.value.length} / 2000`);
    const saveNote = button('Notu kaydet',() => { if (root.state?.peerId !== active?.identity) { dialog.close(); return; } try { localStorage.setItem(key,note.value); savedNote = note.value; saveNote.disabled = true; noteStatus.textContent = 'Not kaydedildi'; } catch { noteStatus.textContent = 'Kaydedilemedi. Tarayıcı depolamasını kontrol et.'; } }); saveNote.disabled = true;
    note.addEventListener('input',() => { const dirty = note.value !== savedNote; noteStatus.textContent = dirty ? 'Kaydedilmemiş değişiklik' : ''; saveNote.disabled = !dirty; noteCount.textContent = `${note.value.length} / 2000`; });
    const noteActions = el('div','sp-note-actions'); const noteInfo = el('div','sp-note-info'); noteInfo.append(noteCount,noteStatus); noteActions.append(noteInfo,saveNote); notes.append(note,noteActions); body.append(notes);
    dialog.append(banner,body); if (!dialog.open) dialog.showModal();
  }
  api.open = open;
  root.addEventListener('scord:social-change',() => { if (!dialog?.open) return; if (root.state?.peerId !== active?.identity) { dialog.close(); return; } renderSocial?.(); });
  function init() { setTimeout(() => { root.openUserProfile = open; },150); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
