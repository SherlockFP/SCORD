const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const helper = source.match(/function uniqueDMContacts\(rows, query = ""\) \{[\s\S]*?\n\}/)[0];
const uniqueDMContacts = vm.runInNewContext(`(${helper})`);
const ids = rows => Array.from(rows, row => row.peerId);
test('a friend already in recent conversations appears only once, retaining recent metadata', () => {
  const rows = uniqueDMContacts([{peerId:'a',name:'Deniz',avatarColor:'red'},{peerId:'a',name:'Deniz',avatarColor:'blue'},{peerId:'b',name:'Ada'},{peerId:'b',name:'Ada'}]);
  assert.deepEqual(ids(rows), ['a','b']);
  assert.equal(rows[0].avatarColor,'red');
});
test('search rejects missing identities and still finds matching fallback contact names', () => {
  assert.deepEqual(ids(uniqueDMContacts([{name:'İpek'},{peerId:'a',name:'Old name'},{peerId:'a',name:'İpek'},{peerId:'b',name:'İpek'}], 'ipek')), ['a','b']);
});
test('deduplication precedes the six-person chip limit', () => {
  const rows = Array.from({length:8},(_,i)=>({peerId:String(i),name:'Kişi'}));
  assert.equal(uniqueDMContacts([...rows.slice(0,3),...rows]).slice(0,6).length,6);
  assert.deepEqual(ids(uniqueDMContacts([...rows.slice(0,3),...rows]).slice(0,6)),['0','1','2','3','4','5']);
});
