/* Channel tools enhance the existing renderer; transport and send handlers stay authoritative. */
(function (root) {
  'use strict';
  const normalize = value => String(value || '').toLocaleLowerCase('tr-TR').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  function searchMessages(messages, query, filter, peerId, pins = [], blocked = [], options = {}) {
    const words = normalize(query).trim().split(/\s+/).filter(Boolean);
    const pinIds = new Set(pins.map(p => p.id));
    return messages.filter(m => m && !blocked.includes(m.authorId) &&
      (filter !== 'mine' || m.authorId === peerId) &&
      (filter !== 'files' || !!m.attachment) &&
      (filter !== 'pins' || m.isPinned || pinIds.has(m.id)) &&
      (filter !== 'links' || /https?:\/\/\S+/i.test(m.text || '')) &&
      (filter !== 'saved' || (options.savedIds || []).includes(m.id)) &&
      (!options.authorId || m.authorId === options.authorId) &&
      words.every(word => normalize(`${m.author || ''} ${m.text || ''}`).includes(word))).slice().reverse();
  }
  function createBookmarks(storage, identity) {
    const key = `scord_saved_messages_v1:${encodeURIComponent(identity)}`;
    let entries;
    try { entries = JSON.parse(storage.getItem(key)); } catch {}
    if (!Array.isArray(entries)) entries = [];
    entries = entries.filter(entry => Array.isArray(entry) && entry.length === 3 && entry.every(value => typeof value === 'string'));
    const matches = (entry, server, channel, id) => entry[0] === server && entry[1] === channel && (id === undefined || entry[2] === id);
    return {
      ids: (server, channel) => entries.filter(entry => matches(entry,server,channel)).map(entry => entry[2]),
      toggle(server, channel, id) {
        if (![identity,server,channel,id].every(value => typeof value === 'string' && value.length)) return {ok:false};
        const saved = !entries.some(entry => matches(entry,server,channel,id));
        const next = saved ? [...entries,[server,channel,id]] : entries.filter(entry => !matches(entry,server,channel,id));
        try { storage.setItem(key,JSON.stringify(next)); entries = next; return {ok:true,saved}; } catch { return {ok:false}; }
      }
    };
  }
  function formatSelection(value, start, end, marker) {
    const selected = value.slice(start, end) || 'metin';
    return { value: value.slice(0, start) + marker + selected + marker + value.slice(end), start: start + marker.length, end: start + marker.length + selected.length };
  }
  function formatTokens(value) {
    return String(value).split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g).filter(Boolean).map(text => {
      if (text.startsWith('**') && text.endsWith('**') && text.length > 4) return {tag:'strong',text:text.slice(2,-2)};
      if (text.startsWith('*') && text.endsWith('*') && text.length > 2) return {tag:'em',text:text.slice(1,-1)};
      if (text.startsWith('`') && text.endsWith('`') && text.length > 2) return {tag:'code',text:text.slice(1,-1)};
      return {tag:null,text};
    });
  }
  function profileDetails(state, peerId, fallbackName) {
    if (!peerId) return null;
    if (peerId === state?.peerId) return {peerId, name:state.username || fallbackName, image:state.avatarImage, color:state.avatarColor};
    const member = (state?.servers || []).flatMap(server => server.members || []).find(person => person.peer_id === peerId);
    return {peerId, name:member?.username || fallbackName || peerId, image:member?.avatar_image, color:member?.avatar_color};
  }
  const api = { normalize, searchMessages, formatSelection, formatTokens, profileDetails, createBookmarks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  root.ScordChatWorkspace = api;
  const el = (tag, cls, text) => { const n = document.createElement(tag); n.className = cls || ''; if (text) n.textContent = text; return n; };
  const button = (text, cls, fn) => { const n = el('button', cls, text); n.type = 'button'; n.addEventListener('click', fn); return n; };
  function context() {
    const s = root.state;
    const server = s?.servers?.find(item => item.id === s.activeServerId);
    const cid = server && typeof root.canonicalChannelIdForChat === 'function' ? root.canonicalChannelIdForChat(server, s.activeChannelId) : s?.activeChannelId;
    return { s, server, cid, messages: server?.messages?.[cid] || [] };
  }
  function init() {
    const chat = document.getElementById('chat-view');
    if (!chat || document.getElementById('cw-search-panel')) return;
    const header = chat.querySelector('.chat-header-right');
    const area = document.getElementById('messages-area');
    const input = document.getElementById('chat-input');
    let bookmarks, bookmarkIdentity;
    function savedIds() { const {s,server,cid} = context(); if (!s?.peerId || !server || !cid) return []; if (bookmarkIdentity !== s.peerId) { bookmarkIdentity = s.peerId; bookmarks = createBookmarks(localStorage,bookmarkIdentity); } return bookmarks.ids(server.id,cid); }
    function toggleSaved(id) { const {server,cid} = context(); savedIds(); if (!server || !cid) return; const result = bookmarks.toggle(server.id,cid,String(id)); if (!result.ok) root.toast?.('Mesaj kaydedilemedi. Tarayıcı depolamasını kontrol et.','error'); else root.toast?.(result.saved ? 'Mesaj yalnızca senin için kaydedildi.' : 'Mesaj kayıtlarından çıkarıldı.','info'); renderSearch(); enhanceSaved(); }
    const panel = el('section', 'cw-search-panel'); panel.id = 'cw-search-panel'; panel.hidden = true; panel.setAttribute('aria-label', 'Kanal mesajlarında ara');
    const top = el('div', 'cw-search-top');
    const query = el('input', 'cw-search-input'); query.type = 'search'; query.placeholder = 'Mesaj veya kişi ara…'; query.setAttribute('aria-label', 'Mesaj veya kişi ara');
    const close = button('✕', 'cw-icon-button', () => toggle(false)); close.setAttribute('aria-label', 'Aramayı kapat');
    top.append(query, close);
    const filters = el('div', 'cw-filter-row'); let filter = 'all';
    [['all','Tümü'], ['mine','Benden'], ['pins','Sabitlenen'], ['files','Ekler'], ['links','Bağlantılar'], ['saved','Kaydettiklerim']].forEach(([id,label]) => {
      const b = button(label, 'cw-filter', () => { filter = id; filters.querySelectorAll('button').forEach(n => n.setAttribute('aria-pressed', String(n === b))); renderSearch(); });
      b.setAttribute('aria-pressed', String(id === 'all')); filters.append(b);
    });
    const summary = el('p', 'cw-search-summary'); summary.setAttribute('role','status');
    const results = el('div', 'cw-search-results');
    const advanced = el('div','cw-search-advanced'); const authorFilter = el('select'); authorFilter.setAttribute('aria-label','Mesaj yazarı');
    authorFilter.append(new Option('Tüm kişiler','')); authorFilter.addEventListener('change',() => { displayLimit = 60; renderSearch(); });
    const clear = button('Temizle','cw-filter',() => { query.value = ''; authorFilter.value = ''; filter = 'all'; filters.querySelectorAll('button').forEach((b,index) => b.setAttribute('aria-pressed',String(index === 0))); displayLimit = 60; renderSearch(); query.focus(); });
    advanced.append(authorFilter,clear); panel.append(top, filters, advanced, summary, results);
    chat.querySelector('.chat-body').append(panel);
    const open = button('⌕', 'header-btn cw-search-toggle', () => toggle(panel.hidden));
    open.id = 'cw-search-toggle'; open.title = 'Mesajlarda ara (Ctrl+Shift+F)'; open.setAttribute('aria-label','Mesajlarda ara'); open.setAttribute('aria-controls',panel.id); open.setAttribute('aria-expanded','false'); header.prepend(open);
    function toggle(show) { panel.hidden = !show; open.setAttribute('aria-expanded', String(show)); if (show) { renderSearch(); query.focus(); } else open.focus(); }
    let displayLimit = 60, authorSignature = '';
    function renderSearch() {
      if (panel.hidden) return;
      const { s, server, messages } = context();
      const authors = Array.from(new Map(messages.filter(m => m?.authorId && !s?.blockedPeers?.includes(m.authorId)).map(m => [m.authorId,m.author || m.authorId])).entries());
      const signature = JSON.stringify(authors); if (signature !== authorSignature) { const value = authorFilter.value; authorSignature = signature; authorFilter.replaceChildren(new Option('Tüm kişiler',''),...authors.map(([id,name]) => new Option(name,id))); authorFilter.value = authors.some(([id]) => id === value) ? value : ''; }
      const saved = savedIds();
      const found = searchMessages(messages, query.value, filter, s?.peerId, server?.pinned_messages || [], s?.blockedPeers || [],{authorId:authorFilter.value,savedIds:saved});
      summary.textContent = `${found.length} sonuç · ${filter === 'saved' ? 'Bu kanalda yalnızca senin kaydettiklerin' : 'Bu cihazdaki kanal geçmişi'}`;
      const focusedId = document.activeElement?.closest('.cw-search-result')?.dataset.messageId;
      results.replaceChildren();
      if (!found.length) {
        const empty = el('div', 'cw-empty'); empty.append(el('strong', '', messages.length ? 'Eşleşen mesaj yok' : 'Sohbet henüz başlamadı'), el('p', '', messages.length ? 'Başka bir kelime veya filtre deneyebilirsin.' : 'İlk mesajınla bu kanalı başlat.')); results.append(empty); return;
      }
      found.slice(0,displayLimit).forEach(msg => {
        const row = button('', 'cw-search-result', () => jump(msg.id));
        row.dataset.messageId = String(msg.id);
        const meta = el('span','cw-result-meta'); meta.append(el('strong','',msg.author || 'Kullanıcı'),el('span','',msg.time || ''));
        row.append(meta, el('span','cw-result-text', msg.text || (msg.attachment ? 'Dosya eki' : 'Mesaj')),el('span','cw-result-jump',saved.includes(msg.id) ? '★ Kaydedildi · Mesaja git ↗' : 'Mesaja git ↗')); results.append(row);
      });
      if (found.length > displayLimit) results.append(button('Daha fazla sonuç göster', 'cw-filter cw-more', () => { displayLimit += 60; renderSearch(); }));
      if (focusedId) Array.from(results.querySelectorAll('.cw-search-result')).find(row => row.dataset.messageId === focusedId)?.focus({preventScroll:true});
    }
    const latest = button('En yeni mesajlara dön ↓','cw-latest',() => { area.scrollTo({top:area.scrollHeight,behavior:'smooth'}); latest.hidden = true; input.focus(); }); latest.hidden = true; chat.querySelector('.messages-column').append(latest);
    area.addEventListener('scroll',() => { if (area.scrollHeight - area.scrollTop - area.clientHeight < 40) latest.hidden = true; },{passive:true});
    function jump(id) {
      const { server, cid, messages } = context();
      const index = messages.findIndex(m => m.id === id); if (!server || index < 0) { renderSearch(); return; }
      const find = () => Array.from(area.querySelectorAll('[data-msg-id]')).find(n => n.dataset.msgId === String(id));
      const highlight = () => { const current = context(); if (current.server?.id !== server.id || current.cid !== cid) return; const row = find(); if (!row) return; row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('cw-message-highlight'); row.tabIndex = -1; row.focus({preventScroll:true}); latest.hidden = index >= messages.length - 1; setTimeout(() => row.classList.remove('cw-message-highlight'), 2500); };
      if (find()) highlight();
      else {
        server._msgListOffset ||= {}; server._msgListOffset[cid] = Math.max(0,index - 5);
        const observer = new MutationObserver(() => { if (find()) { observer.disconnect(); requestAnimationFrame(() => requestAnimationFrame(highlight)); } });
        observer.observe(area,{childList:true}); root.renderMessages?.(server.id,cid); setTimeout(() => observer.disconnect(),3000);
      }
      if (root.innerWidth < 760) { panel.hidden = true; open.setAttribute('aria-expanded','false'); }
    }
    query.addEventListener('input', () => { displayLimit = 60; renderSearch(); });
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); toggle(false); } const rows = Array.from(results.querySelectorAll('.cw-search-result')); if (event.target === query && ['ArrowDown','Enter'].includes(event.key) && rows.length) { event.preventDefault(); if (event.key === 'Enter') rows[0].click(); else rows[0].focus(); } else if (event.target.matches('.cw-search-result') && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); const index = rows.indexOf(event.target); const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : Math.max(0,Math.min(rows.length - 1,index + (event.key === 'ArrowDown' ? 1 : -1))); rows[next]?.focus(); } });
    const tools = el('div','cw-composer-tools');
    const formatting = el('div','cw-formatting'); formatting.setAttribute('role','group'); formatting.setAttribute('aria-label','Mesaj biçimlendirme');
    [['B','**','Kalın (Ctrl+B)'],['I','*','İtalik (Ctrl+I)'],['</>','`','Satır içi kod']].forEach(([text,marker,title]) => { const b = button(text,'cw-format-button', () => format(marker)); b.title = title; b.setAttribute('aria-label',title); formatting.append(b); });
    function format(marker) { const change = formatSelection(input.value,input.selectionStart,input.selectionEnd,marker); input.value = change.value; input.focus(); input.setSelectionRange(change.start,change.end); input.dispatchEvent(new Event('input',{bubbles:true})); }
    const hint = el('span','cw-composer-hint','Enter gönder · Shift+Enter yeni satır');
    const count = el('span','cw-character-count','0 karakter');
    const draft = el('span','cw-draft-status'); draft.setAttribute('role','status'); draft.setAttribute('aria-live','polite');
    tools.append(formatting,hint,draft,count); chat.querySelector('.chat-input-area').append(tools);
    let draftTimer;
    function refreshDraft() { if (!input.value.trim()) { draft.textContent = ''; return; } const {server,cid} = context(); if (!server || !cid) { draft.textContent = ''; return; } try { const key = typeof root.draftStorageKey === 'function' ? root.draftStorageKey(server.id,cid) : `scord_draft_${server.id}_${cid}`; draft.textContent = localStorage.getItem(key) === input.value ? 'Taslak bu cihazda kayıtlı' : 'Taslak henüz kaydedilmedi'; } catch { draft.textContent = 'Taslak depolamasına erişilemiyor'; } }
    input.addEventListener('input',() => { clearTimeout(draftTimer); draft.textContent = input.value.trim() ? 'Taslak…' : ''; draftTimer = setTimeout(refreshDraft,650); });
    const refreshCount = () => { count.textContent = `${Array.from(input.value).length.toLocaleString('tr-TR')} karakter`; };
    input.addEventListener('input',refreshCount); input.addEventListener('keyup',refreshCount); document.getElementById('send-btn')?.addEventListener('click', () => setTimeout(refreshCount,0));
    input.setAttribute('aria-label','Kanala mesaj yaz');
    input.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && !event.altKey && ['b','i'].includes(event.key.toLowerCase())) { event.preventDefault(); format(event.key.toLowerCase() === 'b' ? '**' : '*'); } });
    document.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f' && !chat.classList.contains('hidden')) { event.preventDefault(); toggle(true); } });
    const members = document.getElementById('members-list');
    if (members) {
      // The legacy chat view is transformed, trapping its fixed drawer below the
      // body-level blur mask. A native dialog places the existing member panel
      // in the top layer on mobile without cloning profiles or event handlers.
      const memberPanel = document.getElementById('members-panel');
      const drawer = el('dialog','cw-members-dialog'); drawer.id = 'cw-members-dialog'; drawer.setAttribute('aria-label','Sunucu üyeleri');
      const drawerHead = el('div','cw-members-drawer-head'); drawerHead.append(el('strong','','Sunucu üyeleri'),button('Kapat', 'cw-filter', () => drawer.close())); drawer.append(drawerHead); document.body.append(drawer);
      let homeMarker, wasCollapsed = false;
      function clearLegacyMask() { const mask = document.getElementById('mobile-nav-mask'); mask?.classList.add('hidden'); mask?.classList.remove('active'); }
      function openMembers() {
        if (!memberPanel || drawer.open) return;
        root.closeMobileNav?.(); clearLegacyMask();
        wasCollapsed = memberPanel.classList.contains('collapsed'); homeMarker = document.createComment('members-panel-home'); memberPanel.before(homeMarker);
        memberPanel.classList.remove('mobile-active','collapsed'); drawer.append(memberPanel); drawer.showModal();
        document.getElementById('members-toggle-btn')?.setAttribute('aria-expanded','true');
      }
      drawer.addEventListener('close',() => { if (homeMarker) { homeMarker.replaceWith(memberPanel); homeMarker = null; memberPanel.classList.toggle('collapsed',wasCollapsed); } clearLegacyMask(); document.getElementById('members-toggle-btn')?.setAttribute('aria-expanded','false'); });
      drawer.addEventListener('click',event => { if (event.target !== drawer) return; const rect = drawer.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) drawer.close(); });
      memberPanel?.addEventListener('click',event => { if (drawer.open && event.target.closest('.member-item')) drawer.close(); },true);
      document.addEventListener('click',event => { const trigger = event.target.closest?.('#members-toggle-btn,.mobile-nav-btn[data-tab="members"]'); if (!trigger || !root.matchMedia('(max-width: 768px)').matches) return; event.preventDefault(); event.stopImmediatePropagation(); if (drawer.open) drawer.close(); else openMembers(); },true);
      root.addEventListener('resize',() => { if (drawer.open && !root.matchMedia('(max-width: 768px)').matches) drawer.close(); });
      const search = el('input','cw-member-search'); search.type = 'search'; search.placeholder = 'Üye bul…'; search.setAttribute('aria-label','Sunucu üyelerinde ara'); members.before(search);
      const empty = el('p','cw-member-empty','Bu isimde bir üye bulunamadı.'); empty.hidden = true; members.after(empty);
      function updateMembers() {
        const term = normalize(search.value); const rows = Array.from(members.querySelectorAll('.member-item')); let visible = 0;
        rows.forEach(row => { row.hidden = !normalize(row.querySelector('.member-name')?.textContent || row.textContent).includes(term); if (!row.hidden) visible++;
          if (!row.onclick && row.dataset.peerId) row.onclick = () => { const person = profileDetails(root.state,row.dataset.peerId,row.querySelector('.member-name')?.textContent); if (person) root.openUserProfile?.(person.peerId,person.name,person.image,person.color); };
          if (row.onclick && !row.dataset.cwAccessible) { row.dataset.cwAccessible = '1'; row.tabIndex = 0; row.setAttribute('role','button'); row.setAttribute('aria-label', `${row.querySelector('.member-name')?.textContent || 'Kullanıcı'} profilini aç`); row.addEventListener('keydown', event => { if (event.target === row && ['Enter',' '].includes(event.key)) { event.preventDefault(); row.click(); } }); }
        });
        members.querySelectorAll('.member-role-cat').forEach(group => { let node = group.nextElementSibling; let any = false; while (node && !node.classList.contains('member-role-cat')) { if (node.classList.contains('member-item') && !node.hidden) any = true; node = node.nextElementSibling; } group.hidden = !any; });
        empty.hidden = !rows.length || visible > 0;
      }
      search.addEventListener('input',updateMembers); new MutationObserver(updateMembers).observe(members,{childList:true}); updateMembers();
    }
    let scheduled = false, lastChatContext = '';
    function enhanceSaved() {
      const ids = savedIds();
      area.querySelectorAll('[data-msg-id]').forEach(row => { const bubble = row.querySelector('.msg-bubble'); if (!bubble) return; let save = row.querySelector('.cw-save-message'); const selected = ids.includes(row.dataset.msgId); if (!save) { save = button('','cw-save-message',() => toggleSaved(row.dataset.msgId)); bubble.append(save); } const text = selected ? '★ Kaydedildi' : '☆ Kaydet'; if (save.textContent !== text) save.textContent = text; save.setAttribute('aria-pressed',String(selected)); save.setAttribute('aria-label',selected ? 'Mesajı kaydedilenlerden çıkar' : 'Mesajı kendin için kaydet'); });
    }
    function formatVisibleMessages() {
      area.querySelectorAll('.msg-text').forEach(content => {
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT); const nodes = []; let node;
        while ((node = walker.nextNode())) if (!node.parentElement.closest('a,code,strong,em,.mention,.spoiler,button,textarea')) nodes.push(node);
        nodes.forEach(textNode => { const tokens = formatTokens(textNode.textContent); if (!tokens.some(token => token.tag)) return; const fragment = document.createDocumentFragment(); tokens.forEach(token => fragment.append(token.tag ? el(token.tag,token.tag === 'code' ? 'cw-inline-code' : '',token.text) : document.createTextNode(token.text))); textNode.replaceWith(fragment); });
      });
    }
    new MutationObserver(() => { if (scheduled) return; scheduled = true; requestAnimationFrame(() => { scheduled = false; const current = context(); const key = JSON.stringify([current.s?.peerId,current.server?.id,current.cid]); if (key !== lastChatContext) { latest.hidden = true; lastChatContext = key; } renderSearch(); refreshCount(); refreshDraft(); formatVisibleMessages(); enhanceSaved(); area.querySelectorAll('.msg-author').forEach(author => {
      if (!author.onclick && author.classList.contains('is-you')) author.onclick = () => { const person = profileDetails(root.state,root.state?.peerId,author.textContent); if (person) root.openUserProfile?.(person.peerId,person.name,person.image,person.color); };
      if (author.onclick && !author.dataset.cwAccessible) { author.dataset.cwAccessible = '1'; author.tabIndex = 0; author.setAttribute('role','button'); author.setAttribute('aria-label',`${author.textContent} profilini aç`); author.addEventListener('keydown', event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); author.click(); } }); } }); }); }).observe(area,{childList:true,subtree:true});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
