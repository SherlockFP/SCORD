const test = require('node:test');
const assert = require('node:assert/strict');
const {safeAvatar,mutualServers,noteKey} = require('../static/profile-panel.js');
test('profile images allow web and bitmap sources, rejecting active/local markup',()=>{
  assert.equal(safeAvatar('javascript:alert(1)'),'');
  assert.equal(safeAvatar('data:image/svg+xml,<svg onload=alert(1)>'),'');
  assert.equal(safeAvatar('file:///secret.png'),'');
  assert.equal(safeAvatar('https://example.com/avatar.png'),'https://example.com/avatar.png');
  assert.equal(safeAvatar('data:image/png;base64,YQ=='),'data:image/png;base64,YQ==');
});
test('mutual servers derive only from real local memberships',()=>{
  const servers=[{id:'a',members:[{peer_id:'bob'}]},{id:'b',members:[{peer_id:'alice'}]},{id:'c'}];
  assert.deepEqual(mutualServers(servers,'bob').map(s=>s.id),['a']);
  assert.deepEqual(mutualServers(servers,'unknown'),[]);
});
test('private notes are scoped to viewer and contact without key collisions',()=>{
  assert.notEqual(noteKey('alice','bob'),noteKey('charlie','bob'));
  assert.notEqual(noteKey('a:b','c'),noteKey('a','b:c'));
});
