const test = require('node:test');
const assert = require('node:assert/strict');
const { writePreferences, normalizeTheme, validAvatarUrl, escapeHtml, validatePreferenceBackup, createPreferenceBackup } = require('../static/settings.js');

function storage(entries = {}, failKey) {
  const data = new Map(Object.entries(entries)); let failed = false;
  return {data, getItem:key => data.get(key) ?? null,
    setItem(key,value) { if (key === failKey && !failed) { failed = true; throw new Error('Quota exceeded'); } data.set(key,String(value)); },
    removeItem:key => data.delete(key)};
}

test('save persists zero volume, disabled notifications and empty avatar without defaulting them', () => {
  const store = storage({scord_avatar_image:'https://old.example/avatar.png'});
  const voice = {volume:0,echoCancellation:false,gateThreshold:8};
  assert.equal(writePreferences(store,{scord_voice_settings:JSON.stringify(voice),scord_notif_settings:JSON.stringify({dm:false,messageSound:false}),scord_avatar_image:''}),true);
  assert.deepEqual(JSON.parse(store.getItem('scord_voice_settings')),voice);
  assert.equal(JSON.parse(store.getItem('scord_notif_settings')).dm,false);
  assert.equal(store.getItem('scord_avatar_image'),'');
});

test('failed multi-setting save restores existing preferences and removes newly created keys', () => {
  const store = storage({scord_username:'Before',scord_studio_theme:'legacy'},'scord_voice_settings');
  assert.equal(writePreferences(store,{scord_username:'After',scord_reduce_motion:'1',scord_voice_settings:'{}',scord_studio_theme:'ocean'}),false);
  assert.deepEqual(Object.fromEntries(store.data),{scord_username:'Before',scord_studio_theme:'legacy'});
});

test('blocked storage reads cause no partial write', () => {
  let writes = 0;
  assert.equal(writePreferences({getItem(){throw Error('denied');},setItem(){writes++;},removeItem(){}},{scord_username:'Name'}),false);
  assert.equal(writes,0);
});

test('classic is default while every explicit supported optional theme is preserved', () => {
  for (const bad of [undefined,null,'','glass','unknown']) assert.equal(normalizeTheme(bad),'legacy');
  for (const chosen of ['legacy','midnight','ocean','forest','ember']) assert.equal(normalizeTheme(chosen),chosen);
});

test('avatar URL entry excludes executable schemes, local paths and malformed URL', () => {
  for (const invalid of ['javascript:alert(1)','data:image/svg+xml,test','file:///avatar.png','https://','blob:abc','/avatar.png']) assert.equal(validAvatarUrl(invalid),false,invalid);
  for (const valid of ['','https://example.com/avatar.png','http://localhost:8917/avatar.png']) assert.equal(validAvatarUrl(valid),true,valid);
});

test('profile HTML escapes quotes and markup before interpolation', () => {
  assert.equal(escapeHtml('" onload="alert(1)\' <img>&'), '&quot; onload=&quot;alert(1)&#39; &lt;img&gt;&amp;');
});

const backup = preferences => ({format:'scord-preferences',version:1,preferences});

test('portable backup has a strict allowlist and never contains profile, account or device data', () => {
  const store = storage({scord_username:'SECRET_NAME',scord_password:'SECRET_PASS',scord_avatar_image:'SECRET_AVATAR',scord_voice_settings:JSON.stringify({volume:0,micId:'SECRET_DEVICE',pttKey:'SECRET_KEY',noiseSuppression:false}),scord_notif_settings:JSON.stringify({dm:false,pushEmailAddress:'SECRET_EMAIL',pushDeviceId:'SECRET_PUSH'})});
  const exported = createPreferenceBackup(store);
  assert.ok(!JSON.stringify(exported).includes('SECRET'));
  assert.equal(exported.preferences.voice.volume,0);
  assert.equal(exported.preferences.voice.noiseSuppression,false);
  assert.equal(exported.preferences.notifications.dm,false);
  assert.deepEqual(validatePreferenceBackup(exported),exported.preferences);
});

test('import rejects other formats, future versions, arrays and empty preference backups', () => {
  for (const raw of [null,[],{format:'other',version:1,preferences:{}},{format:'scord-preferences',version:2,preferences:{voice:{volume:1}}},backup([]),backup({}),backup({voice:[]})]) assert.throws(() => validatePreferenceBackup(raw));
});

test('import cannot set account, identity, device or prototype fields', () => {
  for (const preferences of [{profile:{username:'X'}},{voice:{micId:'X'}},{notifications:{pushEmailAddress:'X'}},{appearance:{constructor:'X'}},JSON.parse('{"__proto__":{"polluted":true}}')]) assert.throws(() => validatePreferenceBackup(backup(preferences)));
  assert.equal({}.polluted,undefined);
});

test('import rejects out of range, coerced and invalid enum values', () => {
  for (const preferences of [{voice:{volume:-1}},{voice:{volume:3.1}},{voice:{volume:'1'}},{voice:{volume:NaN}},{voice:{gateThreshold:31}},{notifications:{dm:'false'}},{appearance:{theme:'<script>'}},{video:{screen:'8k'}}]) assert.throws(() => validatePreferenceBackup(backup(preferences)));
});

test('validated partial import preserves false and zero without mutating input', () => {
  const raw = backup({voice:{volume:0},notifications:{dm:false},appearance:{theme:'legacy'}});
  const before = JSON.stringify(raw), result = validatePreferenceBackup(raw);
  assert.deepEqual(result,raw.preferences); assert.notEqual(result,raw.preferences); assert.equal(JSON.stringify(raw),before);
});

test('export ignores corrupted saved settings and falls back to safe default theme', () => {
  const exported = createPreferenceBackup(storage({scord_voice_settings:'not-json',scord_notif_settings:'null',scord_studio_theme:'unsafe',scord_studio_density:'invalid'}));
  assert.equal(exported.preferences.appearance.theme,'legacy');
  assert.ok(!Object.hasOwn(exported.preferences.appearance,'density'));
  assert.doesNotThrow(() => validatePreferenceBackup(exported));
});
