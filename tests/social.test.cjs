const test = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../static/social.js');
const memory = () => { const m = new Map(); return { getItem: k => m.get(k), setItem: (k,v) => m.set(k,v) }; };
function pair() {
 const storage = memory(), packets = []; let connected = true;
 const a = create('alice', storage, (to,p) => { packets.push(p); if (connected) b.receive('alice',p); });
 const b = create('bob', storage, (to,p) => { packets.push(p); if (connected) a.receive('bob',p); });
 return {a,b,storage,packets,offline:()=>connected=false,online:()=>connected=true};
}
test('request requires consent and only intended receiver; acknowledgement marks delivery', () => {
 const {a,b,packets}=pair(); a.request('bob','Bob','Alice');
 assert.equal(Object.keys(a.data.friends).length,0); assert.equal(Object.keys(b.data.friends).length,0);
 assert.equal(b.data.incoming.alice.name,'Alice'); assert.equal(a.data.outgoing.bob.status,'delivered');
 b.act('accept','alice','Bob'); assert.ok(a.data.friends.bob); assert.ok(b.data.friends.alice);
 assert.ok(packets.every(p=>p.to && !p.friends));
});
test('offline requests persist and recover across reload without fake delivery', () => {
 const p=pair(); p.offline(); p.a.request('bob','Bob','Alice'); assert.equal(p.a.data.outgoing.bob.status,'queued');
 const restored=create('alice',p.storage,()=>{}); assert.ok(restored.data.outgoing.bob); assert.equal(Object.keys(restored.data.outbox).length,1);
 p.online(); p.a.flush(); assert.equal(p.a.data.outgoing.bob.status,'delivered'); assert.ok(p.b.data.incoming.alice);
});
test('spoofed, misaddressed and unsolicited acceptance packets cannot create friends',()=>{
 const {a}=pair(); const packet={type:'scord_social',version:1,id:'id',from:'bob',to:'alice',action:'accept',requestId:'fake'};
 a.receive('mallory',packet); a.receive('bob',{...packet,to:'eve'}); a.receive('bob',packet); assert.deepEqual(a.data.friends,{});
});
test('decline, cancel and remove synchronize',()=>{
 const {a,b}=pair(); a.request('bob','Bob','Alice'); b.act('decline','alice','Bob'); assert.equal(a.data.outgoing.bob,undefined);
 a.request('bob','Bob','Alice'); a.act('cancel','bob','Alice'); assert.equal(b.data.incoming.alice,undefined);
 a.request('bob','Bob','Alice'); b.act('accept','alice','Bob'); a.act('remove','bob','Alice'); assert.equal(b.data.friends.alice,undefined);
});
test('block ignores requests, unblock allows a new request; identity stores are isolated',()=>{
 const {a,b,storage}=pair(); b.act('block','alice','Alice'); a.request('bob','Bob','Alice'); assert.equal(b.data.incoming.alice,undefined);
 b.act('unblock','alice'); a.flush(); assert.ok(b.data.incoming.alice);
 const third=create('charlie',storage,()=>{}); assert.deepEqual(third.data.incoming,{}); assert.deepEqual(third.data.friends,{});
});
test('duplicate requests do not reappear after decline',()=>{
 const {a,b,packets}=pair(); a.request('bob','Bob','Alice'); const req=packets.find(p=>p.action==='request');
 b.act('decline','alice','Bob'); b.receive('alice',req); assert.equal(b.data.incoming.alice,undefined);
});
test('acceptance queued offline persists and retries until acknowledged',()=>{
 const p=pair(); p.a.request('bob','Bob','Alice'); p.offline(); p.b.act('accept','alice','Bob');
 assert.ok(p.b.data.friends.alice); assert.equal(p.a.data.friends.bob,undefined);
 assert.equal(Object.values(p.b.data.outbox)[0].action,'accept');
 const restored=create('bob',p.storage,()=>{}); assert.ok(restored.data.friends.alice);
 p.online(); p.b.flush(); assert.ok(p.a.data.friends.bob); assert.equal(Object.keys(p.b.data.outbox).length,0);
});
test('lost acknowledgement retries are idempotent and clears queued action',()=>{
 const storage=memory(); let dropAck=true, a,b;
 a=create('alice',storage,(to,p)=>b.receive('alice',p));
 b=create('bob',storage,(to,p)=>{if(!dropAck)a.receive('bob',p)});
 a.request('bob','Bob','Alice'); assert.equal(a.data.outgoing.bob.status,'queued');
 const original=b.data.incoming.alice; dropAck=false; a.flush();
 assert.equal(a.data.outgoing.bob.status,'delivered'); assert.equal(b.data.incoming.alice,original);
 assert.equal(Object.keys(a.data.outbox).length,0);
});
test('crossing cancel and accept converges without one-sided friendship',()=>{
 const p=pair(); p.a.request('bob','Bob','Alice'); p.offline();
 p.b.act('accept','alice','Bob'); p.a.act('cancel','bob','Alice');
 p.online(); p.b.flush(); p.a.flush();
 assert.equal(p.a.data.friends.bob,undefined); assert.equal(p.b.data.friends.alice,undefined);
 assert.equal(Object.keys(p.b.data.outbox).length,0);
});
test('remove discards older queued relation actions',()=>{
 const p=pair(); p.offline(); p.a.request('bob','Bob','Alice');
 p.a.receive('bob',{type:'scord_social',version:1,id:'remove-id',from:'bob',to:'alice',action:'remove'});
 assert.equal(p.a.data.outgoing.bob,undefined); assert.equal(Object.keys(p.a.data.outbox).length,0);
 p.online(); p.a.flush(); assert.equal(p.b.data.incoming.alice,undefined);
});

test('packet deduplication is scoped to the authenticated transport sender',()=>{
 const a=create('alice',memory(),()=>{});
 const packet={type:'scord_social',version:1,id:'same-id',to:'alice',action:'request',requestId:'request-id',name:'Peer'};
 a.receive('bob',{...packet,from:'bob'});
 a.receive('charlie',{...packet,from:'charlie'});
 assert.ok(a.data.incoming.bob); assert.ok(a.data.incoming.charlie);
});

test('malformed storage recovers and prototype names are rejected',()=>{
 const storage=memory();
 storage.setItem('scord_social_v1:alice',JSON.stringify({version:1,friends:null,incoming:[],outgoing:{bad:null},seen:42}));
 const a=create('alice',storage,()=>{});
 assert.deepEqual(a.data.friends,{}); assert.deepEqual(a.data.outgoing,{});
 assert.ok(a.request('toString','Peer','Alice'));
 a.receive('bob',{type:'scord_social',version:1,id:'',from:'bob',to:'alice',action:'request',requestId:'request'});
 assert.deepEqual(a.data.incoming,{});
 assert.equal(a.request('bob','Bob','Alice'),null);
});

test('crossing friend requests leave no stale outgoing request after acceptance',()=>{
 const p=pair(); p.offline(); p.a.request('bob','Bob','Alice'); p.b.request('alice','Alice','Bob');
 p.online(); p.a.flush(); p.b.flush();
 p.a.act('accept','bob','Alice');
 assert.ok(p.a.data.friends.bob); assert.ok(p.b.data.friends.alice);
 assert.deepEqual(p.a.data.outgoing,{}); assert.deepEqual(p.b.data.outgoing,{});
 assert.deepEqual(p.a.data.incoming,{}); assert.deepEqual(p.b.data.incoming,{});
});
