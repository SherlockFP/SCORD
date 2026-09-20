/* Server menus: enhance the existing permission-aware settings and real room APIs. */
(() => {
    'use strict';
    function parseJoinTarget(value) {
        let target = String(value || '').trim();
        if (/^https?:\/\//i.test(target)) {
            try { const url = new URL(target); if (url.searchParams.getAll('invite').length !== 1) return null; target = (url.searchParams.get('invite') || '').trim(); } catch { return null; }
        }
        if (/^[a-z0-9]{6}$/i.test(target)) return { kind: 'code', value: target.toUpperCase() };
        if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(target)) return { kind: 'id', value: target.toLowerCase() };
        return null;
    }
    function menuPermissions(server, peerId) {
        const owner = !!peerId && server?.ownerId === peerId;
        const role = owner ? 'owner' : server?.peer_roles?.[peerId] || 'member';
        const member = owner || !!server?.members?.some(m => m.peer_id === peerId);
        return { member, manageChannels: member && (owner || role === 'admin'), manageRoles: owner, role };
    }
    function normalizeChannelName(value) { return String(value || '').trim().toLowerCase().replace(/\s+/g, '-'); }
    const api = { parseJoinTarget, menuPermissions, normalizeChannelName };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof document === 'undefined') return;
    window.ScordServerMenus = api;
    const $ = id => document.getElementById(id);
    const node = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
    const button = (text, action, cls = 'btn-secondary') => { const b = node('button', text, cls); b.type = 'button'; b.onclick = action; return b; };
    function intro(title, description) {
        const el = node('div', '', 'server-menu-intro'); el.append(node('span', 'SCORD / TOPLULUK', 'server-menu-eyebrow'), node('h3', title), node('p', description)); return el;
    }
    async function copy(value, target) {
        if (!value || value === '—') return toast('Henüz kullanılabilir davet kodu yok.', 'info');
        try { await navigator.clipboard.writeText(value); target.textContent = 'Kopyalandı'; target.setAttribute('aria-label', 'Panoya kopyalandı'); target.setAttribute('aria-live', 'polite'); setTimeout(() => { if (target.isConnected) { target.textContent = 'Kopyala'; target.setAttribute('aria-label', 'Kopyala'); } }, 2500); }
        catch { toast('Kopyalama izni verilmedi. Metni seçip elle kopyalayabilirsin.', 'error'); }
    }
    function searchRows(container) {
        if (!container || container.previousElementSibling?.classList.contains('server-member-search')) return;
        const search = node('input', '', 'modal-input server-member-search'); search.type = 'search'; search.placeholder = 'Üyelerde ara…'; search.setAttribute('aria-label', 'Sunucu üyelerinde ara');
        const status = node('p', '', 'server-menu-status'); status.setAttribute('role', 'status');
        search.oninput = () => { let count = 0; [...container.children].forEach(row => { const visible = row.textContent.toLocaleLowerCase('tr').includes(search.value.toLocaleLowerCase('tr')); row.hidden = !visible; if (visible) count++; }); status.textContent = `${count} üye gösteriliyor`; };
        container.before(search); container.after(status);
    }
    const originalSettings = window.openServerSettingsModal;
    window.openServerSettingsModal = function (...args) {
        originalSettings.apply(this, args);
        const general = $('s-tab-general'); if (!general || $('server-menu-summary')) return;
        const server = state.servers.find(s => s.id === state.activeServerId); if (!server) return;
        const body = $('modal-body'); body.classList.add('server-menu-settings');
        const summary = intro(server.name, 'Topluluğunun görünümünü, üyelerini ve erişimini tek yerden yönet.'); summary.id = 'server-menu-summary';
        const stats = node('div', '', 'server-menu-stats');
        [[(server.members || []).length, 'Üye'], [(server.channels || []).length, 'Kanal'], [server.ownerId === state.peerId ? 'Sahip' : (server.peer_roles?.[state.peerId] === 'admin' ? 'Yönetici' : 'Üye'), 'Yetkin']].forEach(([value, label]) => { const card = node('div'); card.append(node('strong', String(value)), node('span', label)); stats.append(card); });
        summary.append(stats); body.prepend(summary);
        const actions = node('div', '', 'server-menu-actions');
        actions.append(button('Davet bağlantısı', () => showInviteModal(server.id)));
        if (window.ScordCommunity) actions.append(button('Anketler ve etkinlikler', () => { hideModal(); window.ScordCommunity.open(); }));
        summary.append(actions);
        const permissions = menuPermissions(server, state.peerId);
        const channels = node('section'); channels.id = 's-tab-channels'; channels.style.display = 'none'; body.append(channels);
        const channelTab = button('Kanallar', () => window._stabSwitch('channels')); channelTab.id = 'stab-channels'; body.querySelector('.settings-tabs').append(channelTab);
        const tabNames = ['general', 'roles', 'bans', 'advanced', 'channels'];
        addChannelDirectory(channels, server, permissions);
        const rolesPanel = $('s-tab-roles');
        rolesPanel.prepend(node('p', permissions.manageRoles ? 'Üye rollerini değiştirebilirsin. Kurucu rolü korunur.' : 'Rolleri yalnızca sunucu sahibi değiştirebilir. Kullanılabilir moderasyon işlemleri üyenin yanında gösterilir.', 'server-menu-status'));
        rolesPanel.querySelectorAll('button[title]').forEach(b => b.setAttribute('aria-label', b.title));
        const tabs = body.querySelector('.settings-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Sunucu ayarları');
        const switchTab = window._stabSwitch;
        window._stabSwitch = tab => { switchTab(tab); channels.style.display = tab === 'channels' ? 'block' : 'none'; tabNames.forEach(name => { const t = $(`stab-${name}`); t.setAttribute('aria-selected', String(name === tab)); t.tabIndex = name === tab ? 0 : -1; }); };
        tabNames.forEach((name, index) => {
            const tab = $(`stab-${name}`), panel = $(`s-tab-${name}`);
            tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', panel.id); panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
            tab.onkeydown = e => {
                let next = index;
                if (e.key === 'ArrowRight') next = (index + 1) % tabNames.length;
                else if (e.key === 'ArrowLeft') next = (index + tabNames.length - 1) % tabNames.length;
                else if (e.key === 'Home') next = 0;
                else if (e.key === 'End') next = tabNames.length - 1;
                else if (!['Enter', ' '].includes(e.key)) return;
                e.preventDefault(); window._stabSwitch(tabNames[next]); $(`stab-${tabNames[next]}`).focus();
            };
        });
        window._stabSwitch('general'); searchRows($('sv-roles-list'));
        const theme = general.querySelector('select[onchange]');
        if (theme) { const group = theme.closest('.form-group'); group.replaceChildren(node('label', 'Kişisel görünüm', 'modal-label'), node('p', 'Tema seçimin bütün sunucularında geçerlidir.', 'modal-info'), button('Görünüm ayarlarını aç', () => openSettingsModal())); }
        const name = $('sv-name'); if (name) { name.maxLength = 50; name.required = true; name.setAttribute('aria-label', 'Sunucu adı'); }
        for (const id of ['sv-icon', 'sv-ch-bg']) { const input = $(id); if (input) { input.type = 'url'; input.setAttribute('aria-label', id === 'sv-icon' ? 'Sunucu ikonu bağlantısı' : 'Kanal arka planı bağlantısı'); } }
        const code = $('sv-invite-code-live'); if (code) { const b = code.parentElement.querySelector('button'); b.onclick = () => copy(code.textContent.trim(), b); }
        const bans = $('sv-bans-list'); if (bans && !bans.textContent.trim()) bans.append(node('p', 'Bu sunucuda yasaklanmış üye yok.', 'server-menu-status'));
    };
    // The shared modal body survives between screens; remove our scope on every opening.
    const originalShowModal = window.showModal;
    window.showModal = function (...args) { $('modal-body')?.classList.remove('server-menu-settings'); return originalShowModal.apply(this, args); };
    window.showInviteModal = function (serverId) {
        const server = state.servers.find(s => s.id === serverId); if (!server) return;
        const code = server.inviteCode || server.invite_code || '';
        const link = new URL(location.pathname, location.origin); link.searchParams.set('invite', code);
        const body = node('div', '', 'server-menu-flow'); body.append(intro(server.name, 'Birlikte sohbet etmek için arkadaşlarınla davetini paylaş.'));
        function copyField(label, value) { const wrap = node('div', '', 'server-copy-field'); const input = node('input', '', 'modal-input'); input.value = value; input.readOnly = true; input.setAttribute('aria-label', label); input.onclick = () => input.select(); const b = button('Kopyala', () => copy(value, b)); b.disabled = !code; wrap.append(input, b); body.append(node('label', label, 'modal-label'), wrap); }
        copyField('Davet kodu', code); copyField('Davet bağlantısı', code ? link.href : '');
        body.append(node('p', code ? 'Bu davete sahip kişiler sunucuya katılabilir. Sunucu sahibi gelişmiş ayarlardan kodu yenileyebilir.' : 'Bu sunucu için davet kodu bulunamadı.', 'modal-info'));
        showModal('Arkadaşlarını davet et', body, '<button type="button" class="btn-secondary" onclick="hideModal()">Kapat</button>');
    };
    function addChannelDirectory(panel, server, permissions) {
        panel.append(node('h3', 'Kanal rehberi'), node('p', permissions.manageChannels ? 'Kanallarını buradan açabilir, adlarını değiştirebilir veya yeni bir kanal oluşturabilirsin.' : 'Sohbet veya sesli kanal ekranını aç. Kanal düzenleme yetkisi sunucu sahibi ve yöneticilerindedir.', 'server-menu-status'));
        if (permissions.manageChannels) {
            const actions = node('div', '', 'server-menu-actions');
            actions.append(button('+ Metin kanalı', () => window.promptAddChannel(server.id, 'text')), button('+ Sesli kanal', () => window.promptAddChannel(server.id, 'voice'))); panel.append(actions);
        }
        const search = node('input', '', 'modal-input server-channel-search'); search.type = 'search'; search.placeholder = 'Kanal ara…'; search.setAttribute('aria-label', 'Kanallarda ara'); panel.append(search);
        const list = node('div', '', 'server-channel-directory'); const status = node('p', '', 'server-menu-status'); status.setAttribute('role', 'status'); panel.append(list, status);
        const render = () => {
            list.replaceChildren(); const query = search.value.trim().toLocaleLowerCase('tr');
            const found = (server.channels || []).filter(c => String(c.name).toLocaleLowerCase('tr').includes(query));
            for (const channel of found) {
                const row = node('div', '', 'server-channel-row'); const info = node('div'); info.append(node('strong', `${channel.type === 'voice' ? '◉' : '#'} ${channel.name}`), node('small', channel.type === 'voice' ? 'Sesli kanal' : 'Metin kanalı')); row.append(info);
                row.append(button('Aç', () => { hideModal(); if (channel.type === 'voice') showVoiceView(server.id, channel.id); else showChatView(server.id, channel.id); }));
                if (permissions.manageChannels) row.append(button('Adını değiştir', async () => { if (!menuPermissions(server, state.peerId).manageChannels) return toast('Kanal düzenleme yetkin yok.', 'error'); await renameChannel(server.id, channel.id); render(); }));
                list.append(row);
            }
            status.textContent = found.length ? `${found.length} kanal gösteriliyor` : 'Eşleşen kanal bulunamadı.';
        };
        search.oninput = render; render();
    }
    window.promptAddChannel = function (serverId, type) {
        const server = state.servers.find(s => s.id === serverId);
        if (!menuPermissions(server, state.peerId).manageChannels) return toast('Kanal oluşturmak için yönetici yetkisi gerekli.', 'error');
        if (!['text', 'voice'].includes(type)) return;
        const body = node('div', '', 'server-menu-flow'); body.append(intro(type === 'voice' ? 'Yeni bir buluşma alanı.' : 'Sohbete yeni bir konu.', server.name));
        const form = node('form'); form.id = 'server-channel-form'; const label = node('label', 'Kanal adı', 'modal-label'); label.htmlFor = 'new-ch-name';
        const input = node('input', '', 'modal-input'); input.id = 'new-ch-name'; input.required = true; input.maxLength = 50; input.placeholder = type === 'voice' ? 'oyun-odası' : 'genel-sohbet';
        const status = node('p', 'Boşluklar otomatik olarak kısa çizgiye dönüşür.', 'server-menu-status'); status.setAttribute('role', 'status');
        input.oninput = () => { input.setCustomValidity(''); status.textContent = normalizeChannelName(input.value) ? `Kanal adı: ${normalizeChannelName(input.value)}` : 'Bir kanal adı gir.'; };
        form.append(label, input, status); body.append(form);
        showModal('Kanal oluştur', body, '<button type="button" class="btn-secondary" onclick="openServerSettingsModal()">Geri</button><button type="submit" form="server-channel-form" id="server-channel-submit" class="btn-primary">Oluştur</button>');
        let busy = false;
        form.onsubmit = async event => {
            event.preventDefault(); if (busy) return;
            if (!menuPermissions(server, state.peerId).manageChannels) { status.textContent = 'Artık kanal oluşturma yetkin yok.'; return; }
            const name = normalizeChannelName(input.value);
            if (!name || name.length > 50 || (server.channels || []).some(c => normalizeChannelName(c.name) === name)) { input.setCustomValidity(!name ? 'Bir kanal adı gir.' : name.length > 50 ? 'Kanal adı en fazla 50 karakter olabilir.' : 'Bu isimde bir kanal zaten var.'); input.reportValidity(); return; }
            busy = true; const submit = $('server-channel-submit'); submit.disabled = true; status.textContent = 'Kanal oluşturuluyor…';
            try { await submitAddChannel(serverId, type); status.textContent = 'Oluşturulamadıysa bilgileri kontrol edip tekrar dene.'; }
            catch { status.textContent = 'Sunucuya ulaşılamadı. Tekrar deneyebilirsin.'; }
            finally { busy = false; submit.disabled = false; }
        };
        input.focus();
    };
    function setupFlow(kind) {
        const create = kind === 'create';
        const body = node('div', '', 'server-menu-flow');
        body.append(intro(create ? 'Burası sizin alanınız.' : 'Topluluğuna bir adım kaldı.', create ? 'Oyun geceleri, çalışma grupları veya arkadaşların için yeni bir sunucu oluştur.' : 'Bir davet kodu, SCORD davet bağlantısı veya sunucu kimliği kullan.'));
        const form = node('form'); form.id = 'server-menu-form';
        const label = node('label', create ? 'Sunucu adı' : 'Davet kodu veya bağlantısı', 'modal-label');
        const input = node('input', '', 'modal-input'); input.id = create ? 'new-server-name' : 'join-server-id'; label.htmlFor = input.id;
        input.required = true; input.maxLength = create ? 50 : 2048; input.placeholder = create ? 'Örn. Gece Ekibi' : 'ABC123 veya https://…?invite=ABC123'; input.autocomplete = 'off';
        const status = node('p', create ? '0 / 50 karakter' : 'Davet kodları 6 harflik veya rakamlık kodlardır.', 'server-menu-status'); status.id = 'server-flow-status'; status.setAttribute('role', 'status'); input.setAttribute('aria-describedby', status.id);
        input.oninput = () => { input.setCustomValidity(''); if (create) status.textContent = `${input.value.length} / 50 karakter`; };
        form.append(label, input, status); body.append(form);
        if (create) { const ideas = node('div', '', 'server-menu-actions'); ['Oyun Ekibi', 'Çalışma Odası', 'Arkadaşlar'].forEach(name => ideas.append(button(name, () => { input.value = name; input.oninput(); input.focus(); }))); body.append(ideas, node('p', 'Sunucu oluşturduktan sonra kanallarını ve davet kodunu sunucu ayarlarından yönetebilirsin.', 'modal-info')); }
        showModal(create ? 'Sunucu oluştur' : 'Sunucuya katıl', body, `<button type="button" class="btn-secondary" onclick="hideModal()">Vazgeç</button><button class="btn-primary" id="server-flow-submit" type="submit" form="server-menu-form">${create ? 'Sunucu oluştur' : 'Katıl'}</button>`);
        let busy = false;
        form.onsubmit = async e => {
            e.preventDefault(); if (busy) return; const value = input.value.trim(); if (!value) { input.setCustomValidity('Lütfen bu alanı doldur.'); input.reportValidity(); return; }
            const parsed = create ? null : parseJoinTarget(value);
            if (!create && !parsed) { input.setCustomValidity('Geçerli bir 6 karakterlik davet kodu, davet bağlantısı veya sunucu kimliği gir.'); input.reportValidity(); return; }
            const target = parsed?.value || value, isCode = parsed?.kind === 'code';
            const submit = $('server-flow-submit'); busy = true; submit.disabled = true; status.textContent = create ? 'Sunucun oluşturuluyor…' : 'Sunucuya bağlanılıyor…';
            try {
                if (create) { const before = new Set(state.servers.map(s => s.id)); await createServer(value); if (state.servers.some(s => !before.has(s.id) && s.name === value) && $('server-menu-form') === form) hideModal(); }
                else if (isCode) { const before = new Set(state.servers); await joinByInviteCode(target.toUpperCase()); if (state.servers.some(s => !before.has(s) && (s.inviteCode || s.invite_code || '').toUpperCase() === target.toUpperCase()) && $('server-menu-form') === form) hideModal(); }
                else { const existing = state.servers.find(s => s.id === target); if (existing) switchToServer(existing.id); else await joinServer(target); if (state.servers.some(s => s.id === target) && $('server-menu-form') === form) hideModal(); }
                status.textContent = 'İşlem tamamlanmadıysa bilgileri kontrol ederek tekrar deneyebilirsin.';
            } catch { status.textContent = 'Sunucuya ulaşılamadı. Bağlantını kontrol edip tekrar dene.'; }
            finally { busy = false; submit.disabled = false; }
        };
        input.focus();
    }
    window.openCreateServerModal = () => setupFlow('create');
    window.openJoinServerModal = () => setupFlow('join');
})();
