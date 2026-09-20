const test = require('node:test');
const assert = require('node:assert/strict');
const {parseJoinTarget, menuPermissions, normalizeChannelName} = require('../static/server-menus.js');
test('join parser accepts shared links, raw codes and UUIDs with consistent casing', () => {
  assert.deepEqual(parseJoinTarget(' abc123 '), {kind:'code',value:'ABC123'});
  assert.deepEqual(parseJoinTarget('https://scord.example/?invite=abc123&source=friend'), {kind:'code',value:'ABC123'});
  assert.deepEqual(parseJoinTarget('F123ABCD-1234-4321-9876-123456789ABC'), {kind:'id',value:'f123abcd-1234-4321-9876-123456789abc'});
});
test('join parser rejects ambiguous links, scripts, missing codes and malformed identities', () => {
  for (const input of ['', 'abc', 'abc1234', 'javascript:alert(1)', 'https://scord.example/?invite=ABC123&invite=DEF456', 'https://scord.example/', '<img src=x>', '12345678-1234-1234-1234-bad']) assert.equal(parseJoinTarget(input),null,input);
});
test('channel and role controls require actual membership and the appropriate server role', () => {
  const server = {ownerId:'owner',members:[{peer_id:'admin'},{peer_id:'mod'},{peer_id:'member'}],peer_roles:{admin:'admin',mod:'mod',outsider:'admin'}};
  assert.equal(menuPermissions(server,'owner').manageRoles,true);
  assert.equal(menuPermissions(server,'owner').manageChannels,true);
  assert.equal(menuPermissions(server,'admin').manageChannels,true);
  assert.equal(menuPermissions(server,'admin').manageRoles,false);
  for (const id of ['mod','member','outsider','']) assert.equal(menuPermissions(server,id).manageChannels,false,id);
  assert.equal(menuPermissions(undefined,'owner').manageChannels,false);
});
test('channel preview uses the same normalization as the existing creation API', () => {
  assert.equal(normalizeChannelName('  Oyun   Gecesi  '),'oyun-gecesi');
  assert.equal(normalizeChannelName('   '),'');
  assert.equal(normalizeChannelName('müzik-odası'),'müzik-odası');
});
