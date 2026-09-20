/* Shared community features use the room signaling connection, never local demo data. */
(() => {
    'use strict';
    let dialog, content, status, roomId, socket, snapshot;
    const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
    const button = (text, fn) => { const n = el('button', text); n.type = 'button'; n.addEventListener('click', fn); return n; };
    const send = (payload) => {
        if (!socket || socket.readyState !== WebSocket.OPEN || state.activeServerId !== roomId || state.mesh?.roomId !== roomId || socket !== state.mesh?.ws) {
            status.textContent = 'Sunucu bağlantısı hazır değil. Sunucuya bağlanıp yeniden deneyin.'; return false;
        }
        socket.send(JSON.stringify(payload)); return true;
    };
    const action = payload => send({ type: 'community_action', ...payload });
    function field(form, label, name, type = 'text', max = 160) {
        const wrap = el('label', label); const input = el(type === 'textarea' ? 'textarea' : 'input');
        input.name = name; if (type !== 'textarea') input.type = type; input.required = true; input.maxLength = max;
        wrap.append(input); form.append(wrap); return input;
    }
    function createForm(kind) {
        const details = el('details'); details.append(el('summary', kind === 'poll' ? '+ Anket oluştur' : '+ Etkinlik planla'));
        const form = el('form'); form.dataset.kind = kind; field(form, kind === 'poll' ? 'Soru' : 'Etkinlik adı', 'title');
        if (kind === 'poll') field(form, 'Seçenekler (her satıra bir seçenek, 2–6 seçenek)', 'options', 'textarea', 485);
        else { field(form, 'Açıklama', 'description', 'textarea', 600); field(form, 'Tarih ve saat (yerel saat)', 'starts_at', 'datetime-local'); }
        const submit = el('button', 'Yayınla'); submit.type = 'submit'; form.append(submit);
        form.addEventListener('submit', event => {
            event.preventDefault(); const data = Object.fromEntries(new FormData(form));
            const payload = kind === 'poll' ? {action:'create_poll', title:data.title, options:data.options.split('\n').filter(x=>x.trim())}
                : {action:'create_event', title:data.title, description:data.description, starts_at: new Date(data.starts_at).getTime()/1000};
            if (action(payload)) status.textContent = 'Sunucuya gönderiliyor…';
        });
        details.append(form); return details;
    }
    function render() {
        const drafts = [...content.querySelectorAll('form')].map(form => ({kind:form.dataset.kind, open:form.parentElement.open, values:Object.fromEntries(new FormData(form))}));
        content.replaceChildren(); status.textContent = 'Güncel • Bu sunucudaki üyelerle paylaşılıyor';
        const columns = el('div', '', 'community-columns');
        const polls = el('section'); polls.append(el('h3', 'Topluluğun sesi'), el('p', 'Bir seçenek seç; oyunu anket kapanana kadar değiştirebilirsin.'));
        if (snapshot.can_manage) polls.append(createForm('poll'));
        if (!snapshot.polls.length) polls.append(el('p', 'Henüz anket yok. Yöneticiler ilk anketi başlatabilir.', 'community-empty'));
        for (const poll of [...snapshot.polls].reverse()) {
            const card = el('article', '', 'community-card'); card.append(el('h4', poll.title));
            const total = poll.counts.reduce((a,b)=>a+b,0);
            poll.options.forEach((option, index) => {
                const count = poll.counts[index]; const b = button(`${poll.my_vote === index ? '✓ ' : ''}${option} · ${count} oy (${total ? Math.round(count/total*100) : 0}%)`, () => action({action:'vote',id:poll.id,option:index}));
                b.className = 'community-option'; b.disabled = poll.closed; b.setAttribute('aria-pressed', String(poll.my_vote === index)); card.append(b);
            });
            card.append(el('small', `${total} oy · ${poll.closed ? 'Oylama kapandı' : 'Oylama açık'}`));
            if (snapshot.can_manage) {
                if (!poll.closed) card.append(button('Oylamayı kapat', () => action({action:'close_poll',id:poll.id})));
                card.append(button('Sil', () => { if (confirm('Bu anket ve oyları silinsin mi?')) action({action:'delete_poll',id:poll.id}); }));
            }
            polls.append(card);
        }
        const events = el('section'); events.append(el('h3','Birlikte planlayın'),el('p','Etkinlikleri keşfet ve katılacağını bildir.'));
        if (snapshot.can_manage) events.append(createForm('event'));
        if (!snapshot.events.length) events.append(el('p','Henüz etkinlik planlanmadı. İlk buluşma için yer hazır.', 'community-empty'));
        for (const event of [...snapshot.events].sort((a,b)=>a.starts_at-b.starts_at)) {
            const card = el('article','','community-card'); card.append(el('h4',event.title),el('time',new Date(event.starts_at*1000).toLocaleString('tr-TR')),el('p',event.description),el('small',`${event.attendee_count} kişi katılıyor`));
            const past = event.starts_at * 1000 < Date.now();
            const rsvp = button(past ? 'Etkinlik başladı' : event.attending ? '✓ Katılıyorum · Vazgeç' : 'Katılacağım',()=>action({action:'rsvp',id:event.id,attending:!event.attending})); rsvp.disabled = past; card.append(rsvp);
            if (snapshot.can_manage) card.append(button('Sil',()=>{ if(confirm('Bu etkinlik silinsin mi?')) action({action:'delete_event',id:event.id}); }));
            events.append(card);
        }
        columns.append(polls,events); content.append(columns);
        for (const draft of drafts) { const form=content.querySelector('form[data-kind="'+draft.kind+'"]'); if(form){form.parentElement.open=draft.open; for(const [name,value] of Object.entries(draft.values)) form.elements.namedItem(name).value=value;} }
    }
    const onMessage = event => {
        let data; try { data=JSON.parse(event.data); } catch { return; }
        if (!dialog?.open) return;
        if(data.type==='community_error') { status.textContent=data.message; return; }
        if(data.type==='community_state' && data.room_id===roomId) { snapshot=data; render(); }
    };
    const onOpen = () => { if (dialog?.open) send({type:'community_get'}); };
    const onClose = () => { if (dialog?.open) status.textContent = 'Bağlantı kesildi. Yeniden bağlanınca liste güncellenecek.'; };
    function detach() { socket?.removeEventListener('message',onMessage); socket?.removeEventListener('open',onOpen); socket?.removeEventListener('close',onClose); }
    function connect() {
        const next = state.mesh?.ws;
        if (next !== socket) { detach(); socket=next; socket?.addEventListener('message',onMessage); socket?.addEventListener('open',onOpen); socket?.addEventListener('close',onClose); }
    }
    function open() {
        roomId = state.activeServerId;
        if (!roomId || roomId==='home') return;
        if (!dialog) {
            dialog=el('dialog','','scord-community'); const header=el('header');
            header.append(el('h2','Topluluk merkezi'),button('Kapat',()=>dialog.close())); content=el('div'); status=el('p','','community-status'); status.setAttribute('role','status');
            dialog.setAttribute('aria-label','Sunucu topluluk merkezi'); dialog.append(header,status,content); document.body.append(dialog);
            dialog.addEventListener('close',()=>{detach(); socket=null;});
        }
        content.replaceChildren(); status.textContent='Sunucudan yükleniyor…'; dialog.showModal(); connect(); send({type:'community_get'});
    }
    const style=el('style'); style.textContent=`
    .scord-community{width:min(980px,94vw);max-height:88vh;border:1px solid var(--border-color,#3a3d49);border-radius:20px;padding:26px;background:var(--bg-primary,#171a24);color:var(--text-primary,#eee);box-shadow:0 30px 100px #0008;margin:auto;overflow:auto}
    .scord-community::backdrop{background:#080b16bb;backdrop-filter:blur(5px)}
    .scord-community header{display:flex;align-items:center;justify-content:space-between;gap:20px}.scord-community h2{font-size:24px}.scord-community h3{font-size:18px;margin:16px 0 8px}.scord-community h4{font-size:16px;margin:0 0 12px;overflow-wrap:anywhere}.scord-community p{line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.community-status,.scord-community small{color:var(--text-secondary,#a8afc4);font-size:12px}.community-columns{display:grid;grid-template-columns:1fr 1fr;gap:22px}.community-columns section{min-width:0}.scord-community button{border:1px solid var(--border-color,#424557);border-radius:9px;background:var(--bg-secondary,#252938);color:inherit;padding:9px 12px;cursor:pointer;margin:5px 5px 5px 0;font:inherit}.scord-community button:hover{border-color:var(--accent,#8b78ff)}.scord-community button:disabled{opacity:.6;cursor:default}.scord-community button:focus-visible,.scord-community input:focus-visible,.scord-community textarea:focus-visible,.scord-community summary:focus-visible{outline:2px solid var(--accent,#8b78ff);outline-offset:3px}.community-card{padding:18px;margin:14px 0;border:1px solid var(--border-color,#383c4b);border-radius:14px;background:var(--bg-secondary,#202430)}.community-card small{display:block;margin:10px 0}.community-option{display:block;width:100%;text-align:left;overflow-wrap:anywhere}.community-option[aria-pressed=true]{border-color:var(--accent,#8b78ff);background:color-mix(in srgb,var(--accent,#8b78ff) 18%,transparent)}.scord-community details{margin:16px 0;padding:12px;border:1px solid var(--border-color,#383c4b);border-radius:10px}.scord-community summary{cursor:pointer}.scord-community label{display:block;font-size:13px;margin-top:12px}.scord-community input,.scord-community textarea{box-sizing:border-box;display:block;width:100%;margin:7px 0;padding:10px;border:1px solid var(--border-color,#45485a);border-radius:8px;background:var(--bg-primary,#171a24);color:inherit;font:inherit}.scord-community textarea{min-height:90px;resize:vertical}.community-empty{padding:25px 10px;color:var(--text-secondary,#a8afc4)}#community-open{width:calc(100% - 24px);margin:8px 12px;padding:10px;border:1px solid var(--border-color,#3a3d49);border-radius:9px;background:var(--bg-secondary,#252938);color:var(--text-primary,#eee);cursor:pointer;text-align:left;font:inherit}@media(max-width:650px){.community-columns{grid-template-columns:1fr}.scord-community{padding:18px}}
    `; document.head.append(style);
    function tick() {
        const header=document.getElementById('sidebar-header');
        let launch=document.getElementById('community-open');
        if(header && !launch){launch=button('Anketler ve etkinlikler',open);launch.id='community-open';header.after(launch);window.ScordIcons?.decorate(launch,'poll','Anketler ve etkinlikler','Anketler ve etkinlikler');}
        if(launch) launch.hidden=!state.activeServerId || state.activeServerId==='home';
        if(dialog?.open && state.activeServerId!==roomId) dialog.close();
        else if(dialog?.open && socket!==state.mesh?.ws){connect();send({type:'community_get'});}
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick);else tick();
    setInterval(tick,1000);
    window.ScordCommunity={open};
})();
