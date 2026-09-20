/* Small, code-native icon vocabulary. No font, image download, timer loop or subtree observer. */
(function (root) {
  'use strict';
  const paths = Object.freeze({
    settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3l.5 2-2 1.2-2-.6-2 3.4L5 10v2l-1.5 1 2 3.5 2-.5 2 1 .5 2h4l.5-2 2-1 2 .5 2-3.5-1.5-1v-2l1.5-1-2-3.4-2 .6-2-1.2L15 3Z',
    user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2',
    users:'M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M3 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2M18 4a4 4 0 0 1 0 7m1 3a6 6 0 0 1 3 5v2',
    shield:'M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6ZM8 12l3 3 5-6',
    bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
    volume:'M11 4 6 8H3v8h3l5 4ZM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
    headphones:'M3 14v-3a9 9 0 0 1 18 0v3M3 13h4v8H5a2 2 0 0 1-2-2Zm18 0h-4v8h2a2 2 0 0 0 2-2Z',
    mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-4 0h8',
    theme:'M12 3a9 9 0 1 0 0 18c2 0 3-1 2-3s0-3 2-3h2c3 0 4-3 3-6-1-4-5-6-9-6M7 10h.01M10 6h.01M15 6h.01M18 10h.01',
    search:'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0m-2 5 6 6',
    close:'M6 6l12 12M18 6 6 18',
    check:'m5 12 4 4L19 6',
    copy:'M8 8h13v13H8ZM16 4V2H2v14h2',
    chevron:'m9 5 7 7-7 7',
    plus:'M12 4v16M4 12h16',
    arrow:'M4 12h16m-6-6 6 6-6 6',
    logout:'M9 3H3v18h6m5-16 7 7-7 7M8 12h13',
    globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18',
    link:'m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
    calendar:'M4 5h16v16H4ZM4 10h16M8 3v4m8-4v4M8 14h2m4 0h2m-8 3h2',
    poll:'M4 21V11h4v10m2 0V3h4v18m2 0v-7h4v7M2 21h20',
    chat:'M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4M8 10h8m-8 4h5',
    menu:'M4 6h16M4 12h16M4 18h16',
    smile:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8 9h.01M16 9h.01M8 14a4 4 0 0 0 8 0',
    attach:'m8 12 7-7a4 4 0 0 1 6 6L11 21a6 6 0 0 1-8-8L13 3m-6 13 9-9',
    gif:'M4 4h16v16H4ZM4 8h16M8 4v4m8-4v4M10 11l5 3-5 3Z',
    focus:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M9 12h6',
    pin:'M8 3h8l-1 7 4 4H5l4-4ZM12 14v7',
    send:'m3 3 18 9-18 9 4-9Zm4 9h14',
    hash:'M9 3 7 21M17 3l-2 18M4 8h17M3 16h17'
  });
  function create(name, options = {}) {
    if (!root.document || !Object.prototype.hasOwnProperty.call(paths, name)) return null;
    const svg = root.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key,value] of Object.entries({viewBox:'0 0 24 24',width:20,height:20,fill:'none',stroke:'currentColor','stroke-width':1.7,'stroke-linecap':'round','stroke-linejoin':'round',focusable:'false','aria-hidden':'true',class:'scord-icon'})) svg.setAttribute(key,String(value));
    svg.dataset.icon = name;
    const path = root.document.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d',paths[name]); svg.append(path);
    if (options.label) { svg.removeAttribute('aria-hidden'); svg.setAttribute('role','img'); svg.setAttribute('aria-label',String(options.label)); }
    return svg;
  }
  function decorate(target, name, label, text) {
    if (!target || target.dataset.scordIcon === name) return;
    const icon = create(name); if (!icon) return;
    target.replaceChildren(icon);
    if (text) { const span = root.document.createElement('span'); span.textContent = text; target.append(span); }
    if (label) target.setAttribute('aria-label',label);
    target.dataset.scordIcon = name; target.classList.add('scord-icon-control');
  }
  const api = Object.freeze({create,decorate,names:Object.freeze(Object.keys(paths))});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  root.ScordIcons = api;
  function init() {
    const mappings = [
      ['emoji-btn','smile','Emoji seç'],['gif-btn','gif','GIF gönder'],['chat-attach-btn','attach','Dosya ekle'],
      ['translate-toggle-btn','globe','Yazarken çevir'],['focus-mode-toggle','focus',null],['cw-search-toggle','search','Mesajlarda ara'],
      ['settings-btn','settings','Kullanıcı ayarları'],['server-settings-btn','settings','Sunucu ayarları'],
      ['server-invite-btn','link','Sunucuya davet et'],['pins-toggle-btn','pin','Sabitlenmiş mesajlar'],['members-toggle-btn','users','Üyeler'],
      ['send-btn','send','Mesaj gönder'],['dm-close-btn','close','Kapat'],['modal-close','close','Pencereyi kapat']
    ];
    mappings.forEach(([id,name,label]) => decorate(root.document.getElementById(id),name,label));
    decorate(root.document.querySelector('.scord-theme-launch'),'theme','Görünüm ve temalar');
    decorate(root.document.getElementById('community-open'),'poll','Anketler ve etkinlikler','Anketler ve etkinlikler');
    const mobile = root.document.querySelector('.scord-design-mobile');
    if (mobile) { decorate(mobile.querySelector('button:first-child'),'menu','Menüyü aç veya kapat','Menü'); decorate(mobile.querySelector('button:last-child'),'theme','Görünüm ve temalar','Tema'); }
  }
  function ready() { init(); root.requestAnimationFrame(init); }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded',ready,{once:true}); else ready();
})(typeof window !== 'undefined' ? window : globalThis);
