/* Isolated presentation layer. Existing chat, identity and transport APIs remain authoritative. */
(() => {
  'use strict';
  const THEMES = [
    {id:'legacy',name:'SCORD Klasik',note:'Özgün görünüm · varsayılan',bg:'#0b0b14',side:'#171725',panel:'#11111e',accent:'#7c3aed'},
    {id:'midnight',name:'Gece',note:'Yumuşak mor',bg:'#11121a',side:'#272a39',panel:'#1b1c27',accent:'#8b7cf8'},
    {id:'ocean',name:'Okyanus',note:'Serin mavi · sakin',bg:'#091820',side:'#213e4a',panel:'#142b36',accent:'#48c9cf'},
    {id:'forest',name:'Orman',note:'Adaçayı yeşili · doğal',bg:'#101b17',side:'#2c4235',panel:'#1c2e25',accent:'#8bd6a2'},
    {id:'ember',name:'Gün Batımı',note:'Sıcak bakır · rahat',bg:'#211516',side:'#493435',panel:'#322426',accent:'#f3ad83'}
  ];
  const root = document.documentElement;
  root.dataset.scordUi = '1';
  const read = (key, fallback) => {try {return localStorage.getItem(key) || fallback;} catch {return fallback;}};
  const save = (key, value) => {try {localStorage.setItem(key,value);} catch { /* Private browsing still supports this session. */ }};
  function applyTheme(id) {
    const theme = THEMES.some(t => t.id === id) ? id : 'legacy';
    if (theme === 'legacy') delete root.dataset.scordTheme;
    else root.dataset.scordTheme = theme;
    save('scord_studio_theme',theme);
    document.querySelectorAll('[data-studio-theme]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.studioTheme === theme)));
  }
  // Earlier releases auto-selected the new theme. Restore the requested original default once.
  if (read('scord_theme_choice_v2','') !== '1') {
    save('scord_studio_theme','legacy');
    save('scord_theme_choice_v2','1');
  }
  applyTheme(read('scord_studio_theme','legacy'));
  root.dataset.scordDensity = read('scord_studio_density','comfortable') === 'compact' ? 'compact' : 'comfortable';
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function init() {
    if (document.getElementById('scord-theme-dialog')) return;
    const overlay = document.getElementById('setup-overlay');
    if (overlay) {
      const intro = element('section','scord-intro');
      intro.innerHTML = '<div class="scord-wordmark"><span>S</span> SCORD</div><div class="scord-eyebrow">Birlikte olmanın yeni yolu</div><h2>Senin çevren.<br>Senin <em>alanın.</em></h2><p>Arkadaşlarınla buluş, topluluğunu kur ve sohbete katıl. Ses, ekran ve paylaşacak çok şey.</p><div class="scord-intro-foot"><span>◈ P2P bağlantı</span><span>♧ Topluluk sunucuları</span><span>↗ Ekran paylaşımı</span></div>';
      overlay.prepend(intro);
      const subtitle = overlay.querySelector('.setup-sub');
      if (subtitle) subtitle.textContent = 'Bir isim seç. Kendi sohbet alanına adım at.';
      const hint = overlay.querySelector('.setup-hint');
      if (hint) hint.textContent = 'Profilin bu tarayıcıda saklanır. Bağlantı kurmak ve arkadaşlarını bulmak için sinyal sunucusu kullanılır.';
      const enter = document.getElementById('enter-btn');
      if (enter) enter.textContent = 'SCORD’a katıl →';
    }
    const hero = document.querySelector('.home-hero');
    if (hero) {
      hero.prepend(element('div','scord-eyebrow','Senin alanın, senin topluluğun'));
      const h = hero.querySelector('h2');
      if (h) h.textContent = 'İyi sohbetler burada başlar.';
      const p = hero.querySelector(':scope > p');
      if (p) p.textContent = 'Arkadaşlarını bir araya getir. Kendine bir sunucu kur ya da bir davetle sohbete katıl.';
      const features = element('section','scord-features');
      features.setAttribute('aria-label','SCORD ile neler yapabilirsin');
      [
        ['♧','Çevreni bir araya getir','Arkadaş ekle, özel mesajlaş ve kaldığın yerden sohbete devam et.'],
        ['#','Topluluğuna yer aç','Konulara göre kanallar oluştur. Davet kodunla arkadaşlarını sunucuna çağır.'],
        ['◉','Aynı odadaymış gibi','Ses kanalına katıl, ekranını paylaş ve birlikte vakit geçir.']
      ].forEach(([icon,title,copy]) => {
        const card = element('article','scord-feature');
        const symbol = element('span','scord-feature-icon',icon); symbol.setAttribute('aria-hidden','true');
        card.append(symbol,element('h3','',title),element('p','',copy)); features.append(card);
      });
      const discovery = hero.querySelector('.discover-section');
      hero.insertBefore(features,discovery || null);
    }
    const dialog = element('div','scord-theme-dialog');
    dialog.id = 'scord-theme-dialog'; dialog.hidden = true;
    dialog.innerHTML = '<section class="scord-theme-panel" role="dialog" aria-modal="true" aria-labelledby="scord-theme-title"><header class="scord-theme-top"><div><h2 id="scord-theme-title">Kendine göre bir alan</h2><p>Temanı seç. Görünüm tercihlerin bu tarayıcıda saklanır.</p></div><button class="scord-theme-close" type="button" aria-label="Görünüm ayarlarını kapat">✕</button></header><div class="scord-theme-grid" role="group" aria-label="Renk teması"></div><label class="scord-density">Mesaj aralığı<select id="scord-density"><option value="comfortable">Rahat</option><option value="compact">Kompakt</option></select></label></section>';
    document.body.append(dialog);
    const grid = dialog.querySelector('.scord-theme-grid');
    THEMES.forEach(theme => {
      const button = element('button','scord-theme-option');button.type = 'button';button.dataset.studioTheme = theme.id;
      const swatch = element('span','scord-theme-swatch');swatch.setAttribute('aria-hidden','true');
      swatch.style.cssText = `--preview-bg:${theme.bg};--preview-side:${theme.side};--preview-panel:${theme.panel};--preview-accent:${theme.accent}`;
      swatch.append(element('i'),element('i'),element('i'));
      button.append(swatch,element('strong','',theme.name),element('small','',theme.note));
      button.addEventListener('click',() => applyTheme(theme.id));grid.append(button);
    });
    const density = dialog.querySelector('#scord-density'); density.value = root.dataset.scordDensity;
    density.addEventListener('change',() => {root.dataset.scordDensity = density.value;save('scord_studio_density',density.value);});
    let lastFocus;
    function close() {dialog.hidden = true;if (lastFocus?.isConnected) lastFocus.focus();}
    function open() {lastFocus = document.activeElement;dialog.hidden = false;applyTheme(root.dataset.scordTheme || 'legacy');dialog.querySelector('[aria-pressed="true"]').focus();}
    dialog.querySelector('.scord-theme-close').addEventListener('click',close);
    dialog.addEventListener('click',event => {if (event.target === dialog) close();});
    dialog.addEventListener('keydown',event => {
      if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();close();}
      if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button,select')];
        const first = controls[0], last = controls[controls.length-1];
        if (event.shiftKey && document.activeElement === first) {event.preventDefault();last.focus();}
        if (!event.shiftKey && document.activeElement === last) {event.preventDefault();first.focus();}
      }
    });
    const rail = document.getElementById('server-rail');
    if (rail) {
      const launch = element('button','rail-icon scord-theme-launch','◐');launch.type = 'button';launch.title = 'Görünüm ve temalar';launch.setAttribute('aria-label','Görünüm ve temalar');launch.addEventListener('click',open);rail.append(launch);
      rail.setAttribute('aria-label','Sunucular ve kısayollar');
    }
    const app = document.getElementById('app');
    if (app) {
      const mobile = element('nav','scord-design-mobile');mobile.setAttribute('aria-label','Mobil gezinme');
      const menu = element('button','','☰ Menü');menu.type = 'button';menu.setAttribute('aria-controls','channel-sidebar');menu.setAttribute('aria-expanded','false');
      const appearance = element('button','','◐ Tema');appearance.type = 'button';appearance.addEventListener('click',open);
      mobile.append(menu,element('strong','','SCORD'),appearance);app.prepend(mobile);
      const mask = element('button','scord-drawer-mask');mask.type = 'button';mask.setAttribute('aria-label','Menüyü kapat');app.append(mask);
      function syncDrawer() {
        const isOpen = document.body.classList.contains('nav-open');
        menu.setAttribute('aria-expanded',String(isOpen));
        const legacyMask = document.getElementById('mobile-nav-mask');
        const maskOpen = isOpen || document.getElementById('members-panel')?.classList.contains('mobile-active');
        legacyMask?.classList.toggle('hidden',!maskOpen);
        legacyMask?.classList.toggle('active',Boolean(maskOpen));
      }
      function drawer(open) {document.body.classList.toggle('nav-open',open);syncDrawer();}
      document.addEventListener('click',event => {
        if (event.target.closest('#mobile-menu-btn, #mobile-nav-mask, .mobile-nav-btn, #members-toggle-btn')) queueMicrotask(syncDrawer);
      });
      syncDrawer();
      new MutationObserver(syncDrawer).observe(document.body,{attributes:true,attributeFilter:['class']});
      menu.addEventListener('click',() => drawer(!document.body.classList.contains('nav-open')));
      mask.addEventListener('click',() => drawer(false));
      document.addEventListener('keydown',event => {if (event.key === 'Escape' && dialog.hidden) drawer(false);});
      document.getElementById('channel-list')?.addEventListener('click',event => {if (event.target.closest('.channel-item')) drawer(false);});
    }
    // Provide names for existing icon-only buttons without altering event handlers.
    document.querySelectorAll('button[title]:not([aria-label])').forEach(button => button.setAttribute('aria-label',button.title));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else init();
})();
