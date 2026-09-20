const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
function runtime(names, state) {
  const saved = new Map();
  const element = {classList:{toggle(){}},setAttribute(){}};
  const context = vm.createContext({state, document:{getElementById:()=>element,body:element,documentElement:element},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},toast(){},updateMuteStates(){}});
  for (const name of names) {
    const match = source.match(new RegExp('^function '+name+'\\([^]*?^}', 'm'));
    assert.ok(match, name);
    vm.runInContext(match[0], context);
  }
  return {context,saved};
}
test('notification sound preference survives reload', () => {
  const {context,saved} = runtime(['loadUserPrefs'], {});
  saved.set('scord_notif_settings',JSON.stringify({messageSound:false,chatLevel:'mentions',dm:false}));
  context.loadUserPrefs();
  assert.equal(context.state.notifSettings.messageSound,false);
  assert.equal(context.state.notifSettings.chatLevel,'mentions');
  assert.equal(context.state.notifSettings.dm,false);
});
test('microphone toggle keeps both microphone streams muted and respects push-to-talk', () => {
  const tracks = [{enabled:true},{enabled:true}];
  const state = {voiceSettings:{inputMode:'ptt'},originalMicStream:{getAudioTracks:()=>[tracks[0]]},mesh:{voiceActive:true,localStream:{getAudioTracks:()=>[tracks[1]]},toggleMic(){this.micMuted=!this.micMuted;return this.micMuted},broadcast(){}}};
  const {context} = runtime(['toggleMicrophone'],state);
  context.toggleMicrophone();
  assert.equal(state.micMuted,true); assert.ok(tracks.every(t=>!t.enabled));
  context.toggleMicrophone();
  assert.equal(state.micMuted,false); assert.ok(tracks.every(t=>!t.enabled));
  state._pttActive=true; context.toggleMicrophone(); context.toggleMicrophone();
  assert.ok(tracks.every(t=>t.enabled));
});
test('deafen toggles without recursion and retains blocked peer mute', () => {
  const state={remoteAudios:{friend:{muted:false},blocked:{muted:true}},blockedPeers:['blocked']};
  const {context} = runtime(['toggleDeafen'],state);
  context.toggleDeafen(); assert.equal(state.remoteAudios.friend.muted,true);
  context.toggleDeafen(); assert.equal(state.remoteAudios.friend.muted,false);
  assert.equal(state.remoteAudios.blocked.muted,true);
});
test('chat renders HTML as text and escapes quotes in URL attributes', () => {
  const {context} = runtime(['escapeHtml','applyMentionsThenEscape','renderPlainChatSegment','parseMessageText'], {servers:[],activeServerId:null});
  const html = context.parseMessageText('<img src=x onerror=alert(1)> @everyone');
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('data-mention="everyone"'));
  const link = context.parseMessageText('https://example.test/\"onclick=alert(1)');
  assert.ok(link.includes('&quot;onclick='));
  assert.ok(!link.includes('href="https://example.test/"onclick='));
  assert.ok(link.includes('rel="noopener noreferrer"'));
});
test('channel navigation isolates drafts and handles missing channel fallback', () => {
  const state={servers:[{id:'room',channels:[{id:'a',name:'A',type:'text'},{id:'b',name:'B',type:'text'}]}],activeServerId:'room',activeChannelId:'a'};
  const {context,saved}=runtime(['draftStorageKey','persistChatDraftFor','showChatView'],state);
  const composer={value:'draft A',style:{},dispatchEvent(){},focus(){}};
  const element={classList:{add(){},remove(){}},textContent:''};
  context.document.getElementById=id=>id==='chat-input'?composer:element;
  for(const name of ['closeMobileNav','hideDMMainView','clearReplyTarget','updateChannelSidebar','renderMessages','updateMembersPanel','applyChannelBackground'])context[name]=()=>{};
  context.setTimeout=()=>{};context.Event=function(){};
  context.showChatView('room','b');
  assert.equal(saved.get('scord_draft_room_a'),'draft A');assert.equal(composer.value,'');
  composer.value='draft B'; context.showChatView('room','a');
  assert.equal(composer.value,'draft A');assert.equal(saved.get('scord_draft_room_b'),'draft B');
  context.showChatView('room','missing');
  assert.equal(state.activeChannelId,'a');
});
