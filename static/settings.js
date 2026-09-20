/* Settings center: draft changes stay local until Save. */
(() => {
  'use strict';
  function writePreferences(storage, values) {
    const previous = {};
    try { Object.keys(values).forEach(key => { previous[key] = storage.getItem(key); }); Object.entries(values).forEach(([key,val]) => storage.setItem(key,val)); }
    catch (error) { Object.entries(previous).forEach(([key,val]) => { try { if (val == null) storage.removeItem(key); else storage.setItem(key,val); } catch {} }); return false; }
    return true;
  }
  const normalizeTheme = value => ['legacy','midnight','ocean','forest','ember'].includes(value) ? value : 'legacy';
  const validAvatarUrl = value => { if (!value) return true; try { return ['http:','https:'].includes(new URL(value).protocol); } catch { return false; } };
  const preferenceRules = {
    appearance: {theme:['legacy','midnight','ocean','forest','ember'],density:['comfortable','compact'],chatStyle:['soft','flat','outline'],contrast:'boolean',reduceMotion:'boolean'},
    voice: {volume:[0,3],filter:['none','bass','radio'],noiseSuppression:'boolean',echoCancellation:'boolean',autoGainControl:'boolean',gateThreshold:[3,30],inputMode:['voice','ptt']},
    notifications: {chatLevel:['all','mentions','none'],dm:'boolean',join:'boolean',messageSound:'boolean'},
    video: {screen:['360p','480p','720p','1080p','4k'],camera:['360p','480p','720p','1080p','4k']}
  };
  function validatePreferenceBackup(raw) {
    const plain = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!plain(raw) || raw.format !== 'scord-preferences' || raw.version !== 1 || !plain(raw.preferences)) throw Error('Bu dosya desteklenen bir SCORD tercih yedeği değil.');
    if (Object.keys(raw).some(key => !['format','version','preferences'].includes(key))) throw Error('Yedekte desteklenmeyen alanlar var.');
    const result = {};
    for (const [group, settings] of Object.entries(raw.preferences)) {
      if (!Object.hasOwn(preferenceRules,group) || !plain(settings)) throw Error('Yedekte bilinmeyen bir ayar bölümü var.');
      result[group] = {};
      for (const [key,value] of Object.entries(settings)) {
        const rule = preferenceRules[group][key];
        if (!Object.hasOwn(preferenceRules[group],key)) throw Error('Yedekte izin verilmeyen bir tercih var.');
        const valid = rule === 'boolean' ? typeof value === 'boolean' : typeof rule[0] === 'number' ? typeof value === 'number' && Number.isFinite(value) && value >= rule[0] && value <= rule[1] : rule.includes(value);
        if (!valid) throw Error('Yedekte geçersiz bir ayar değeri var.');
        result[group][key] = value;
      }
    }
    if (!Object.values(result).some(group => Object.keys(group).length)) throw Error('Yedekte aktarılabilecek bir tercih yok.');
    return result;
  }
  function createPreferenceBackup(storage) {
    const read = (key,fallback) => { try { return storage.getItem(key) ?? fallback; } catch { return fallback; } };
    const parse = key => { try { return JSON.parse(read(key,'{}')) || {}; } catch { return {}; } };
    const voice = parse('scord_voice_settings'), notif = parse('scord_notif_settings');
    const candidates = {
      appearance:{theme:normalizeTheme(read('scord_studio_theme','legacy')),density:read('scord_studio_density','comfortable'),chatStyle:read('scord_chat_style','soft'),contrast:read('scord_high_contrast','0') === '1',reduceMotion:read('scord_reduce_motion','0') === '1'},
      voice,notifications:notif,video:{screen:read('scord_screen_quality','720p'),camera:read('scord_camera_quality','720p')}
    };
    const preferences = {};
    for (const [group,rules] of Object.entries(preferenceRules)) {
      preferences[group] = {};
      for (const key of Object.keys(rules)) {
        const value = candidates[group][key];
        try { validatePreferenceBackup({format:'scord-preferences',version:1,preferences:{[group]:{[key]:value}}}); preferences[group][key] = value; } catch { /* Do not export malformed or unknown stored preferences. */ }
      }
    }
    return {format:'scord-preferences',version:1,preferences};
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  if (typeof module !== 'undefined' && module.exports) module.exports = { writePreferences, normalizeTheme, validAvatarUrl, escapeHtml: esc, validatePreferenceBackup, createPreferenceBackup };
  if (typeof document === 'undefined') return;
  const themes = [['legacy','SCORD Klasik','Orijinal görünüm · varsayılan'],['midnight','Gece','Yumuşak mor'],['ocean','Okyanus','Serin mavi'],['forest','Orman','Doğal yeşil'],['ember','Gün Batımı','Sıcak bakır']];
  const root = document.documentElement;
  const read = (key, fallback = '') => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  let legacyOpen;
  function open(initialPage = 'profile') {
    if (document.getElementById('scord-settings-center')) return;
    const s = state, vs = s.voiceSettings || {}, ns = s.notifSettings || {};
    let dirty = false, avatar = s.avatarImage || '', avatarReadId = 0, avatarPending = false, initialFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'scord-settings-center'; dialog.className = 'sc-settings'; dialog.setAttribute('aria-labelledby','sc-settings-title');
    const field = (id, title, control, hint = '') => `<label class="sc-setting-field" for="${id}"><span>${title}</span>${control}${hint ? `<small>${hint}</small>` : ''}</label>`;
    const input = (id, value, extra = '') => `<input id="${id}" value="${esc(value)}" ${extra}>`;
    const select = (id, value, options) => `<select id="${id}">${options.map(([v,l]) => `<option value="${esc(v)}" ${String(value) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const check = (id, title, value, hint) => `<label class="sc-setting-switch" for="${id}"><span><strong>${title}</strong><small>${hint}</small></span><input id="${id}" type="checkbox" ${value ? 'checked' : ''}></label>`;
    const range = (id, value, min, max, step) => `<div class="sc-setting-range"><input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output for="${id}">${value}</output></div>`;
    const sections = [
      ['profile','01','Profil','İsmin, avatarın ve kimliğin'],['appearance','02','Görünüm','Tema, yoğunluk ve erişilebilirlik'],['voice','03','Ses ve video','Mikrofon, bas-konuş ve yayın'],['notifications','04','Bildirimler','Sohbet, özel mesaj ve sesler'],['privacy','05','Gizlilik ve bağlantılar','Arkadaşların ve yerel verilerin'],['transfer','06','Tercihleri taşı','Yedekle, önizle ve içe aktar']
    ];
    dialog.innerHTML = `<header class="sc-settings-top"><div><span class="sc-settings-eyebrow">SCORD / KİŞİSEL ALANIN</span><h2 id="sc-settings-title">Ayarlar</h2></div><button type="button" data-close aria-label="Ayarları kapat">✕</button></header><div class="sc-settings-layout"><aside class="sc-settings-sidebar"><label class="sc-settings-search">Ayar ara<input type="search" id="sc-settings-search" placeholder="Tema, mikrofon, profil…"></label><nav aria-label="Ayar kategorileri">${sections.map(([id,num,title,hint],i) => `<button type="button" data-page="${id}" aria-current="${i === 0 ? 'page' : 'false'}"><span>${num}</span><div><strong>${title}</strong><small>${hint}</small></div></button>`).join('')}</nav><p class="sc-settings-local">Tercihlerin bu tarayıcıda saklanır.</p></aside><main class="sc-settings-body">
      <p id="sc-settings-empty" hidden>Aramana uygun ayar bulunamadı.</p>
      <section data-section="profile" aria-labelledby="sc-profile-heading"><h3 id="sc-profile-heading" tabindex="-1">Kendini tanıt</h3><p>Sohbetlerde arkadaşlarının göreceği profilini düzenle.</p><div class="sc-profile-preview"><div id="sc-profile-avatar"></div><div><strong id="sc-profile-name"></strong><small>Profil önizlemesi</small></div></div>${field('sc-name','Görünen ad',input('sc-name',s.username,'maxlength="32" autocomplete="nickname" required'),'1–32 karakter. Değişiklik bağlantıdaki kişilere iletilir.')}${field('sc-avatar-url','Avatar bağlantısı',input('sc-avatar-url',/^https?:/i.test(avatar) ? avatar : '', 'type="url" placeholder="https://…"'),'Harici resim bağlantıları, resmi sunan hizmete istek gönderir.')}${field('sc-avatar-file','Ya da bir görsel yükle','<input id="sc-avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">','PNG, JPEG, WebP veya GIF · en fazla 2 MB')}<button type="button" id="sc-avatar-reset" class="sc-secondary">Avatarı kaldır</button></section>
      <section data-section="appearance" aria-labelledby="sc-appearance-heading" hidden><h3 id="sc-appearance-heading" tabindex="-1">Sana ait bir görünüm</h3><p>Klasik SCORD görünümü varsayılandır. Yeni renkler isteğe bağlıdır.</p><fieldset class="sc-theme-choices"><legend>Renk teması</legend>${themes.map(([id,name,note]) => `<label class="sc-theme-choice" data-color="${id}"><input type="radio" name="sc-theme" value="${id}" ${normalizeTheme(read('scord_studio_theme','legacy')) === id ? 'checked' : ''}><span class="sc-theme-sample" aria-hidden="true"></span><strong>${name}</strong><small>${note}</small></label>`).join('')}</fieldset>${field('sc-density','Mesaj aralığı',select('sc-density',read('scord_studio_density','comfortable'),[['comfortable','Rahat'],['compact','Kompakt']]))}${field('sc-chat-style','Mesaj tasarımı',select('sc-chat-style',read('scord_chat_style','soft'),[['soft','Yumuşak balon'],['flat','Düz'],['outline','Çizgili']]))}${check('sc-contrast','Yüksek kontrast',read('scord_high_contrast') === '1','Metin ve kenarlıkların ayrımını güçlendir.')}${check('sc-motion','Hareketi azalt',read('scord_reduce_motion') === '1','Geçişleri ve dekoratif animasyonları azalt.')}</section>
      <section data-section="voice" aria-labelledby="sc-voice-heading" hidden><h3 id="sc-voice-heading" tabindex="-1">Sesin net duyulsun</h3><p>Ses ayarları sonraki ses kanalı girişinde; yayın kalitesi sonraki yayın başlangıcında uygulanır.</p>${field('sc-mic','Giriş aygıtı',select('sc-mic',vs.micId || 'default',[[vs.micId || 'default',vs.micId && vs.micId !== 'default' ? 'Kaydedilmiş mikrofon' : 'Sistem varsayılanı']]))}<button type="button" id="sc-devices" class="sc-secondary">Mikrofonları listele</button><small id="sc-device-status" role="status">Mikrofon izni otomatik istenmez.</small>${field('sc-volume','Mikrofon seviyesi',range('sc-volume',vs.volume ?? 1,0,3,0.1),'1 normal seviyedir. Yüksek seviyeler seste bozulmaya neden olabilir.')}${field('sc-filter','Ses filtresi',select('sc-filter',vs.filter || 'none',[['none','Doğal'],['bass','Bas güçlendirme'],['radio','Lo-fi radyo']]))}${check('sc-noise','Gürültü azaltma',vs.noiseSuppression !== false,'Arka plandaki sabit gürültüyü azalt.')}${check('sc-echo','Yankı engelleme',vs.echoCancellation === true,'Hoparlörden mikrofona dönen sesi azalt.')}${check('sc-gain','Otomatik seviye',vs.autoGainControl === true,'Mikrofon kazancını tarayıcı dengelesin.')}${field('sc-gate','Ses kapısı eşiği',range('sc-gate',vs.gateThreshold ?? 8,3,30,1),'Yükselttikçe yalnızca daha yüksek sesler iletilir.')}${field('sc-input-mode','Konuşma modu',select('sc-input-mode',vs.inputMode || 'voice',[['voice','Ses aktivitesi'],['ptt','Bas-konuş']]))}${field('sc-ptt','Bas-konuş tuşu',input('sc-ptt',vs.pttKey || 'Control','readonly aria-describedby="sc-ptt-hint"'),'<span id="sc-ptt-hint">Alana odaklanıp kullanmak istediğin tuşa bas. Tab ile çıkabilirsin.</span>')}<div class="sc-setting-columns">${field('sc-screen','Ekran paylaşımı',select('sc-screen',s.screenShareQuality || '720p',['360p','480p','720p','1080p','4k'].map(q => [q,q])))}${field('sc-camera','Kamera',select('sc-camera',s.cameraQuality || '720p',['360p','480p','720p','1080p','4k'].map(q => [q,q])))}</div><p class="sc-settings-note">Gerçek kalite; aygıt, tarayıcı ve bağlantının desteklediği çözünürlüğe bağlıdır.</p></section>
      <section data-section="notifications" aria-labelledby="sc-notifications-heading" hidden><h3 id="sc-notifications-heading" tabindex="-1">Dikkatinin kontrolü sende</h3><p>Hangi sohbetlerin sana ulaşacağını seç.</p>${field('sc-chat-notif','Kanal mesajları',select('sc-chat-notif',ns.chatLevel || (ns.chat === false ? 'none' : 'all'),[['all','Tüm mesajlar'],['mentions','Yalnızca bahsetmeler'],['none','Kapalı']]))}${check('sc-dm','Özel mesaj bildirimleri',ns.dm !== false,'Arkadaşların sana yazdığında bildirim göster.')}${check('sc-join','Ses kanalına katılım',ns.join !== false,'Birisi ses kanalına katıldığında bildirim göster.')}${check('sc-message-sound','Mesaj sesi',ns.messageSound !== false,'Yeni mesajlarda uygulama sesini çal.')}<div class="sc-settings-note"><strong>Tarayıcı bildirim izni</strong><p id="sc-notification-status"></p><button type="button" id="sc-notification-permission" class="sc-secondary">Bildirim izni iste</button></div></section>
      <section data-section="privacy" aria-labelledby="sc-privacy-heading" hidden><h3 id="sc-privacy-heading" tabindex="-1">Bağlantılarını yönet</h3><p>Arkadaş isteklerini ve engellediğin kişileri tek bir yerden yönet.</p><div class="sc-settings-note"><strong>Arkadaşlar ve engellenenler</strong><p>Gelen istekleri kabul et veya reddet; istemediğin kişileri engelle.</p><button type="button" id="sc-friends" class="sc-secondary">Arkadaş yönetimini aç →</button></div><div class="sc-settings-note"><strong>Bu tarayıcıdaki profil</strong><p>Adın, avatarın ve tercihlerinin bir kopyası bu tarayıcının yerel depolamasında tutulur. Tarayıcı verilerini temizlemek yerel tercihlerini silebilir.</p></div><div class="sc-settings-note"><strong>P2P bağlantı</strong><p>Doğrudan bağlantının kurulması için sinyal sunucusu kullanılır. Buradaki tercihler bir hesap güvenliği ya da uçtan uca şifreleme garantisi değildir.</p></div><button type="button" id="sc-advanced" class="sc-secondary">Diğer mevcut ayarları aç →</button></section>
      </main></div><footer class="sc-settings-footer"><span id="sc-save-status" role="status" aria-live="polite">Her şey güncel.</span><div><button type="button" data-close class="sc-secondary">Vazgeç</button><button type="button" id="sc-settings-save" class="sc-primary">Değişiklikleri kaydet</button></div></footer>`;
    dialog.querySelector('.sc-settings-body').insertAdjacentHTML('beforeend',`<section data-section="transfer" aria-labelledby="sc-transfer-heading" hidden><h3 id="sc-transfer-heading" tabindex="-1">Tercihlerini yanında götür</h3><p>Görünüm, ses, yayın kalitesi ve bildirim tercihlerini bir JSON dosyasıyla taşı.</p><div class="sc-settings-note"><strong>Yalnızca tercihler</strong><p>Bu dosyada kullanıcı adı, avatar, arkadaş listesi, mesaj, kimlik, parola veya mikrofon aygıt kimliği bulunmaz. Hesap yedeği değildir.</p></div><button type="button" id="sc-export-preferences" class="sc-secondary">Kaydedilmiş tercihleri indir</button><label class="sc-setting-field" for="sc-import-preferences"><span>Tercih yedeğini seç</span><input id="sc-import-preferences" type="file" accept="application/json,.json"><small>SCORD tercih yedeği · sürüm 1 · en fazla 32 KB. Dosya önce doğrulanır; seçim yapmak ayarlarını değiştirmez.</small></label><div id="sc-import-preview" class="sc-settings-note" hidden><strong>İçe aktarma önizlemesi</strong><ul id="sc-import-summary"></ul><p>Bu tercihler önce formuna aktarılır. Kalıcı olması için “Değişiklikleri kaydet” düğmesine basmalısın. Yedekte olmayan ayarlar korunur.</p><button type="button" id="sc-import-apply" class="sc-primary">Tercihleri düzenleme formuna aktar</button></div><p id="sc-transfer-status" role="status" aria-live="polite"></p></section>`);
    document.body.append(dialog);
    if (window.ScordIcons?.create) {
      const icons = {profile:'user',appearance:'theme',voice:'mic',notifications:'bell',privacy:'shield',transfer:'arrow'};
      dialog.querySelectorAll('[data-page]').forEach(button => { const icon = window.ScordIcons.create(icons[button.dataset.page]); if (icon) button.querySelector(':scope > span').replaceChildren(icon); });
      const closeIcon = window.ScordIcons.create('close'); if (closeIcon) dialog.querySelector('.sc-settings-top [data-close]').replaceChildren(closeIcon);
    }
    const $ = id => dialog.querySelector('#' + id);
    function updateRange(control) {
      const min = Number(control.min), max = Number(control.max), current = Number(control.value);
      control.style.setProperty('--range-progress',`${Math.max(0,Math.min(100,(current-min)/(max-min)*100))}%`);
      const text = control.id === 'sc-volume' ? `${Math.round(current*100)}%` : String(current);
      control.nextElementSibling.value = text;
      control.setAttribute('aria-valuetext',control.id === 'sc-volume' ? `Yüzde ${Math.round(current*100)}` : text);
    }
    dialog.querySelectorAll('input[type="range"]').forEach(updateRange);
    const value = id => $(id).value;
    const checked = id => $(id).checked;
    const mark = () => { dirty = true; $('sc-save-status').textContent = 'Kaydedilmemiş değişiklikler var.'; };
    function preview() {
      $('sc-profile-name').textContent = value('sc-name') || 'Senin profilin';
      const el = $('sc-profile-avatar'); el.replaceChildren();
      if (avatar) { const img = document.createElement('img'); img.alt = ''; img.src = avatar; el.append(img); } else el.textContent = (value('sc-name') || 'S').slice(0,2).toUpperCase();
    }
    let discardPanel = null;
    function close(afterClose) {
      const next = typeof afterClose === 'function' ? afterClose : null;
      if (!dirty) { dialog.close(); next?.(); return true; }
      if (discardPanel) return false;
      const previousFocus = document.activeElement;
      const siblings = [...dialog.children];
      siblings.forEach(el => { el.inert = true; });
      discardPanel = document.createElement('div');
      discardPanel.className = 'sc-settings-discard';
      discardPanel.setAttribute('role','alertdialog');
      discardPanel.setAttribute('aria-modal','true');
      discardPanel.setAttribute('aria-labelledby','sc-discard-title');
      discardPanel.setAttribute('aria-describedby','sc-discard-copy');
      discardPanel.innerHTML = '<div class="sc-discard-card"><h3 id="sc-discard-title">Değişikliklerin henüz kaydedilmedi</h3><p id="sc-discard-copy">Çıkarsan bu düzenlemeler silinir. Kaydetmek için düzenlemeye dönebilirsin.</p><div><button type="button" id="sc-keep-editing" class="sc-primary">Düzenlemeye devam et</button><button type="button" id="sc-discard-changes" class="sc-secondary">Değişiklikleri sil ve çık</button></div></div>';
      const resume = () => { discardPanel.remove(); discardPanel = null; siblings.forEach(el => { el.inert = false; }); previousFocus?.focus(); };
      discardPanel.addEventListener('keydown',event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); resume(); } });
      dialog.append(discardPanel);
      $('sc-keep-editing').onclick = resume;
      $('sc-discard-changes').onclick = () => { dirty = false; avatarReadId++; dialog.close(); next?.(); };
      $('sc-keep-editing').focus();
      return false;
    }
    dialog.addEventListener('close',() => { dialog.remove(); if (initialFocus?.isConnected) initialFocus.focus(); });
    dialog.addEventListener('cancel',event => { event.preventDefault(); close(); });
    dialog.querySelectorAll('[data-close]').forEach(btn => btn.onclick = close);
    dialog.addEventListener('input',event => { if (!['sc-settings-search','sc-import-preferences'].includes(event.target.id)) mark(); if (event.target.type === 'range') updateRange(event.target); });
    function page(id, focus = false) { dialog.querySelectorAll('[data-section]').forEach(el => { el.hidden = el.dataset.section !== id; }); dialog.querySelectorAll('[data-page]').forEach(el => el.setAttribute('aria-current',el.dataset.page === id ? 'page' : 'false')); if (focus) dialog.querySelector(`[data-section="${id}"] h3`).focus(); }
    dialog.querySelectorAll('[data-page]').forEach(btn => btn.onclick = () => page(btn.dataset.page,true));
    $('sc-settings-search').oninput = () => { const query = value('sc-settings-search').toLocaleLowerCase('tr'); const matches = sections.filter(([id,,name,hint]) => `${name} ${hint} ${dialog.querySelector(`[data-section="${id}"]`).textContent}`.toLocaleLowerCase('tr').includes(query)); dialog.querySelectorAll('[data-page]').forEach(btn => { btn.hidden = !matches.some(([id]) => id === btn.dataset.page); }); $('sc-settings-empty').hidden = matches.length > 0; if (matches.length) page(matches[0][0]); else dialog.querySelectorAll('[data-section]').forEach(el => { el.hidden = true; }); };
    $('sc-name').oninput = preview;
    $('sc-avatar-url').onchange = () => { const url = value('sc-avatar-url').trim(); avatarReadId++; avatarPending = false; if (!validAvatarUrl(url)) { $('sc-avatar-url').setCustomValidity('HTTP veya HTTPS resim bağlantısı kullan.'); return; } $('sc-avatar-url').setCustomValidity(''); avatar = url; preview(); };
    $('sc-avatar-file').onchange = async () => { const file = $('sc-avatar-file').files[0]; if (!file) return; if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type) || file.size > 2 * 1024 * 1024) { $('sc-save-status').textContent = 'En fazla 2 MB boyutunda PNG, JPEG, WebP veya GIF seç.'; $('sc-avatar-file').value = ''; return; } const requestId = ++avatarReadId; avatarPending = true; const reader = new FileReader(); reader.onload = () => { if (requestId !== avatarReadId || !dialog.isConnected) return; avatarPending = false; avatar = reader.result; $('sc-avatar-url').value = ''; $('sc-avatar-url').setCustomValidity(''); mark(); preview(); }; reader.onerror = () => { if (requestId !== avatarReadId) return; avatarPending = false; $('sc-save-status').textContent = 'Görsel okunamadı. Yeniden dene.'; }; reader.readAsDataURL(file); };
    $('sc-avatar-reset').onclick = () => { avatarReadId++; avatarPending = false; avatar = ''; $('sc-avatar-file').value = ''; $('sc-avatar-url').value = ''; $('sc-avatar-url').setCustomValidity(''); mark(); preview(); };
    $('sc-ptt').onkeydown = event => { if (event.key === 'Tab' || event.key === 'Escape') return; event.preventDefault(); event.stopPropagation(); $('sc-ptt').value = event.key; mark(); };
    $('sc-devices').onclick = async () => { try { if (!navigator.mediaDevices?.enumerateDevices) throw Error(); const devices = await navigator.mediaDevices.enumerateDevices(); const selected = value('sc-mic'); const options = [['default','Sistem varsayılanı'],...devices.filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default').map((d,i) => [d.deviceId,d.label || `Mikrofon ${i+1}`])]; if (!options.some(([id]) => id === selected)) options.push([selected,'Kaydedilmiş mikrofon (şu an bulunamadı)']); $('sc-mic').replaceChildren(...options.map(([id,title]) => new Option(title,id,false,id === selected))); $('sc-device-status').textContent = 'Liste güncellendi. Aygıt adları mikrofon izni verilene kadar gizli olabilir.'; } catch { $('sc-device-status').textContent = 'Mikrofon listesine erişilemedi. Tarayıcı ve aygıt izinlerini kontrol et.'; } };
    function permissionStatus() { const available = 'Notification' in window; $('sc-notification-status').textContent = !available ? 'Bu tarayıcı masaüstü bildirimlerini desteklemiyor.' : ({granted:'İzin verilmiş.',denied:'İzin engellenmiş. Tarayıcının site ayarlarından değiştirebilirsin.',default:'Henüz izin verilmedi.'}[Notification.permission]); $('sc-notification-permission').disabled = !available || Notification.permission !== 'default'; }
    $('sc-notification-permission').onclick = async () => { try { await Notification.requestPermission(); permissionStatus(); } catch { $('sc-notification-status').textContent = 'Bildirim izni alınamadı.'; } };
    $('sc-friends').onclick = () => close(() => document.getElementById('social-hub-button')?.click());
    $('sc-advanced').onclick = () => close(() => legacyOpen?.());
    let importDraft = null, importReadId = 0;
    $('sc-export-preferences').onclick = () => {
      try {
        const blob = new Blob([JSON.stringify(createPreferenceBackup(localStorage),null,2)],{type:'application/json'});
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = 'scord-tercihler.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
        $('sc-transfer-status').textContent = 'Kaydedilmiş tercihlerin indirme dosyası hazırlandı. Kaydedilmemiş düzenlemeler dahil edilmedi.';
      } catch { $('sc-transfer-status').textContent = 'Tercih dosyası hazırlanamadı. Tarayıcının depolama ve indirme izinlerini kontrol et.'; }
    };
    $('sc-import-preferences').onchange = async () => {
      const requestId = ++importReadId, file = $('sc-import-preferences').files[0]; importDraft = null; $('sc-import-preview').hidden = true;
      if (!file) return;
      if (file.size > 32768) { $('sc-transfer-status').textContent = 'En fazla 32 KB boyutunda bir tercih yedeği seç.'; return; }
      try {
        const text = await file.text(); if (requestId !== importReadId || !dialog.isConnected) return;
        importDraft = validatePreferenceBackup(JSON.parse(text));
        const names = {appearance:'Görünüm',voice:'Ses',notifications:'Bildirimler',video:'Yayın kalitesi'};
        const labels = {theme:'Tema',density:'Mesaj aralığı',chatStyle:'Mesaj tasarımı',contrast:'Yüksek kontrast',reduceMotion:'Hareketi azalt',volume:'Mikrofon seviyesi',filter:'Ses filtresi',noiseSuppression:'Gürültü azaltma',echoCancellation:'Yankı engelleme',autoGainControl:'Otomatik seviye',gateThreshold:'Ses kapısı eşiği',inputMode:'Konuşma modu',chatLevel:'Kanal bildirimleri',dm:'Özel mesaj bildirimi',join:'Katılım bildirimi',messageSound:'Mesaj sesi',screen:'Ekran kalitesi',camera:'Kamera kalitesi'};
        const words = {comfortable:'Rahat',compact:'Kompakt',soft:'Yumuşak balon',flat:'Düz',outline:'Çizgili',none:'Kapalı / doğal',bass:'Bas güçlendirme',radio:'Lo-fi radyo',voice:'Ses aktivitesi',ptt:'Bas-konuş',all:'Tüm mesajlar',mentions:'Yalnızca bahsetmeler'};
        $('sc-import-summary').replaceChildren(...Object.entries(importDraft).filter(([,values]) => Object.keys(values).length).map(([group,values]) => {
          const item = document.createElement('li'), title = document.createElement('strong'); title.textContent = names[group]; item.append(title);
          const details = document.createElement('ul');
          for (const [key,val] of Object.entries(values)) { const detail = document.createElement('li'); const display = key === 'theme' ? themes.find(([id]) => id === val)[1] : typeof val === 'boolean' ? (val ? 'Açık' : 'Kapalı') : (words[val] || String(val)); detail.textContent = labels[key] + ': ' + display; details.append(detail); }
          item.append(details); return item;
        }));
        $('sc-import-preview').hidden = false; $('sc-import-apply').disabled = false; $('sc-transfer-status').textContent = 'Dosya doğrulandı. Henüz hiçbir ayar değiştirilmedi.';
      } catch (error) { if (requestId !== importReadId) return; $('sc-transfer-status').textContent = error instanceof SyntaxError ? 'Dosya geçerli JSON içermiyor.' : (error.message || 'Dosya okunamadı.'); }
    };
    $('sc-import-apply').onclick = () => {
      if (!importDraft) return;
      const mapping = {appearance:{density:'sc-density',chatStyle:'sc-chat-style',contrast:'sc-contrast',reduceMotion:'sc-motion'},voice:{volume:'sc-volume',filter:'sc-filter',noiseSuppression:'sc-noise',echoCancellation:'sc-echo',autoGainControl:'sc-gain',gateThreshold:'sc-gate',inputMode:'sc-input-mode'},notifications:{chatLevel:'sc-chat-notif',dm:'sc-dm',join:'sc-join',messageSound:'sc-message-sound'},video:{screen:'sc-screen',camera:'sc-camera'}};
      for (const [group,values] of Object.entries(importDraft)) for (const [key,val] of Object.entries(values)) {
        if (group === 'appearance' && key === 'theme') { dialog.querySelector(`[name="sc-theme"][value="${val}"]`).checked = true; continue; }
        const control = $(mapping[group][key]); if (typeof val === 'boolean') control.checked = val; else control.value = val;
        if (control.type === 'range') updateRange(control);
      }
      mark(); $('sc-import-apply').disabled = true; $('sc-transfer-status').textContent = 'Tercihler düzenleme formuna aktarıldı. Bölümlerden kontrol edip kaydedebilirsin.';
    };
    $('sc-settings-save').onclick = () => {
      if (avatarPending) { $('sc-save-status').textContent = 'Görsel hazırlanıyor. Biraz sonra tekrar kaydet.'; return; }
      const name = value('sc-name').trim();
      if (!name) { page('profile'); $('sc-name').focus(); $('sc-save-status').textContent = 'Görünen ad boş bırakılamaz.'; return; }
      if (!$('sc-avatar-url').checkValidity()) { page('profile'); $('sc-avatar-url').reportValidity(); return; }
      const theme = normalizeTheme(dialog.querySelector('[name="sc-theme"]:checked')?.value);
      const voice = {...vs,micId:value('sc-mic'),volume:Number(value('sc-volume')),filter:value('sc-filter'),noiseSuppression:checked('sc-noise'),echoCancellation:checked('sc-echo'),autoGainControl:checked('sc-gain'),gateThreshold:Number(value('sc-gate')),inputMode:value('sc-input-mode'),pttKey:value('sc-ptt')};
      const notif = {...ns,chat:value('sc-chat-notif') !== 'none',chatLevel:value('sc-chat-notif'),dm:checked('sc-dm'),join:checked('sc-join'),messageSound:checked('sc-message-sound')};
      const values = {scord_username:name,scord_avatar_image:avatar,scord_voice_settings:JSON.stringify(voice),scord_notif_settings:JSON.stringify(notif),scord_studio_theme:theme,scord_studio_density:value('sc-density'),scord_msg_density:value('sc-density') === 'compact' ? 'compact' : 'comfortable',scord_chat_style:value('sc-chat-style'),scord_high_contrast:checked('sc-contrast') ? '1' : '0',scord_reduce_motion:checked('sc-motion') ? '1' : '0',scord_screen_quality:value('sc-screen'),scord_camera_quality:value('sc-camera')};
      if (!writePreferences(localStorage,values)) { $('sc-save-status').textContent = 'Ayarlar kaydedilemedi. Depolama dolu olabilir; daha küçük bir avatar dene.'; return; }
      s.username = name; s.avatarImage = avatar; s.voiceSettings = voice; s.notifSettings = notif; s.screenShareQuality = value('sc-screen'); s.cameraQuality = value('sc-camera');
      if (theme === 'legacy') delete root.dataset.scordTheme; else root.dataset.scordTheme = theme;
      root.dataset.scordDensity = value('sc-density'); root.dataset.msgDensity = values.scord_msg_density; root.classList.toggle('scord-high-contrast',checked('sc-contrast')); root.classList.toggle('scord-reduce-motion',checked('sc-motion'));
      if (typeof applyChatCustomization === 'function') applyChatCustomization();
      const nameEl = document.getElementById('user-bar-name'); if (nameEl) nameEl.textContent = name;
      const avatarEl = document.getElementById('user-bar-avatar');
      if (avatarEl && typeof applyAvatarToElement === 'function') applyAvatarToElement(avatarEl,s.avatarColor,avatar,name);
      try { s.mesh?.broadcast({type:'broadcast',payload:{type:'profile_update',username:name,avatarImage:avatar}}); } catch { /* Profile is still saved when transport is offline. */ }
      dirty = false; $('sc-save-status').textContent = 'Kaydedildi. Ses değişiklikleri sonraki kanal girişinde uygulanır.';
    };
    preview(); permissionStatus(); if (sections.some(([id]) => id === initialPage)) page(initialPage); dialog.showModal();
  }
  function init() {
    legacyOpen = window.openSettingsModal;
    window.openSettingsModal = open;
    window.openProfileSettings = () => open('profile');
    window.showProfileSettingsModal = () => open('profile');
    window.showUserSettings = () => open('profile');
    window.showUserSettingsModal = () => open('profile');
    // Global function bindings and older event handlers both route to the center.
    if (typeof openSettingsModal !== 'undefined') openSettingsModal = open;
    document.addEventListener('click',event => { const trigger = event.target.closest?.('#settings-btn,#notif-toggle-btn'); if (trigger) { event.preventDefault(); event.stopImmediatePropagation(); open(trigger.id === 'notif-toggle-btn' ? 'notifications' : 'profile'); } },true);
    document.addEventListener('keydown',event => { if ((event.ctrlKey || event.metaKey) && (event.code === 'Comma' || (event.shiftKey && ['KeyP','KeyU'].includes(event.code)))) { event.preventDefault(); event.stopImmediatePropagation(); open(); } },true);
    root.classList.toggle('scord-reduce-motion',read('scord_reduce_motion') === '1');
    if (typeof state !== 'undefined') { state.screenShareQuality = read('scord_screen_quality',state.screenShareQuality || '720p'); state.cameraQuality = read('scord_camera_quality',state.cameraQuality || '720p'); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
