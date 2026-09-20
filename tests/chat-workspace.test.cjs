const test = require('node:test');
const assert = require('node:assert/strict');
const {searchMessages,normalize,formatSelection,formatTokens,profileDetails,createBookmarks} = require('../static/chat-workspace.js');
const messages = [
  {id:'old',author:'İrem',authorId:'a',text:'Toplantı notları',time:'10:00'},
  {id:'file',author:'Ece',authorId:'b',text:'Tasarım dosyası',attachment:'image.png'},
  {id:'new',author:'İrem',authorId:'a',text:'Bugün toplantı',isPinned:true}
];
test('search folds Turkish letters, combines author and text, and orders newest first',()=>{
  assert.deepEqual(searchMessages(messages,'irem toplanti','all','a').map(m=>m.id),['new','old']);
  assert.equal(normalize('IŞIK İZMİR'),'isik izmir');
  assert.equal(messages[0].id,'old');
});
test('mine, attachment and pin filters combine with text and exclude blocked authors',()=>{
  assert.deepEqual(searchMessages(messages,'','mine','b').map(m=>m.id),['file']);
  assert.deepEqual(searchMessages(messages,'tasarim','files','a').map(m=>m.id),['file']);
  assert.deepEqual(searchMessages(messages,'','pins','a',[{id:'old'}]).map(m=>m.id),['new','old']);
  assert.deepEqual(searchMessages(messages,'','all','a',[],['a']).map(m=>m.id),['file']);
  assert.deepEqual(searchMessages(messages,'no match','all','a'),[]);
});
test('formatting preserves surrounding content and selection without sending',()=>{
  assert.deepEqual(formatSelection('Merhaba dünya',8,13,'**'),{value:'Merhaba **dünya**',start:10,end:15});
  assert.deepEqual(formatSelection('',0,0,'`'),{value:'`metin`',start:1,end:6});
});
test('inline formatting keeps literal user content as text and does not parse HTML',()=>{
  assert.deepEqual(formatTokens('Merhaba **dünya** ve `x < y`'),[{tag:null,text:'Merhaba '},{tag:'strong',text:'dünya'},{tag:null,text:' ve '},{tag:'code',text:'x < y'}]);
  assert.deepEqual(formatTokens('<img onerror=alert(1)>'),[{tag:null,text:'<img onerror=alert(1)>'}]);
  assert.deepEqual(formatTokens('*yarım'),[{tag:null,text:'*yarım'}]);
});
test('self and member profile actions resolve current real identity and avatar fields',()=>{
  const state={peerId:'self',username:'Ben',avatarImage:'mine.png',avatarColor:'#aabbcc',servers:[{members:[{peer_id:'bob',username:'Bob',avatar_image:'bob.png',avatar_color:'#123456'}]}]};
  assert.deepEqual(profileDetails(state,'self','eski isim'),{peerId:'self',name:'Ben',image:'mine.png',color:'#aabbcc'});
  assert.deepEqual(profileDetails(state,'bob','eski isim'),{peerId:'bob',name:'Bob',image:'bob.png',color:'#123456'});
  assert.equal(profileDetails(state,null,'isim'),null);
});
test('private saved messages persist only IDs and isolate identity, server, and channel',()=>{
  const memory = new Map(); const storage = {getItem:key=>memory.get(key),setItem:(key,value)=>memory.set(key,value)};
  const a = createBookmarks(storage,'alice'); assert.deepEqual(a.toggle('room','general','message'),{ok:true,saved:true});
  assert.deepEqual(createBookmarks(storage,'alice').ids('room','general'),['message']);
  assert.deepEqual(createBookmarks(storage,'bob').ids('room','general'),[]);
  assert.deepEqual(a.ids('other','general'),[]); assert.deepEqual(a.ids('room','other'),[]);
  assert.deepEqual(JSON.parse([...memory.values()][0]),[['room','general','message']]);
  assert.deepEqual(a.toggle('room','general','message'),{ok:true,saved:false}); assert.deepEqual(a.ids('room','general'),[]);
});
test('failed bookmark persistence never reports success or changes local saved state',()=>{
  const store=createBookmarks({getItem:()=>'{invalid',setItem:()=>{throw Error('full');}},'alice');
  assert.deepEqual(store.toggle('room','general','message'),{ok:false}); assert.deepEqual(store.ids('room','general'),[]);
});
test('author, links and saved filters compose without exposing blocked or deleted messages',()=>{
  const history=[...messages,{id:'link',author:'Ece',authorId:'b',text:'https://example.com kaynak'}];
  assert.deepEqual(searchMessages(history,'','links','a',[],[],{authorId:'b'}).map(m=>m.id),['link']);
  assert.deepEqual(searchMessages(history,'','links','a',[],[],{authorId:'a'}),[]);
  assert.deepEqual(searchMessages(history,'','saved','a',[],[],{savedIds:['old','deleted']}).map(m=>m.id),['old']);
  assert.deepEqual(searchMessages(history,'','saved','a',[],['a'],{savedIds:['old']}),[]);
});
