const test = require('node:test');
const assert = require('node:assert/strict');
const {create} = require('../static/reliable-dm.js');
const store = () => {const data=new Map();return {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};};
test('render failures after persistence never report a failed send or suppress transmission',()=>{
 let sends=0; const storage=store();const a=create('alice',storage,()=>sends++,()=>{throw Error('UI failed')});
 assert.ok(a.enqueue('bob',{text:'saved'}).id);assert.equal(sends,1);assert.equal(create('alice',storage,()=>{}).records.length,1);
});
test('offline message survives reload and only matching recipient ACK marks delivered',()=>{
 const storage=store(), packets=[]; let sender=create('alice',storage,(p,m)=>packets.push(m));
 const {id}=sender.enqueue('bob',{text:'merhaba',author:'Alice'});
 assert.equal(sender.records[0].delivery,'queued');
 sender=create('alice',storage,(p,m)=>packets.push(m));sender.flush();
 assert.equal(packets.length,2);assert.equal(packets[0].id,id);
 sender.receive('eve',{type:'scord_dm',version:1,action:'ack',id,from:'eve',to:'alice'});
 assert.equal(sender.records[0].delivery,'queued');
 sender.receive('bob',{type:'scord_dm',version:1,action:'ack',id,from:'bob',to:'alice'});
 assert.equal(sender.records[0].delivery,'delivered');
});
test('lost ACK retry stores one message and acknowledges duplicate',()=>{
 const sent=[],acks=[];const alice=create('alice',store(),(p,m)=>sent.push(m));
 const bob=create('bob',store(),(p,m)=>acks.push(m));alice.enqueue('bob',{text:'hello'});
 bob.receive('alice',sent[0]);bob.receive('alice',sent[0]);
 assert.equal(bob.records.length,1);assert.equal(acks.length,2);
 alice.receive('bob',acks[1]);assert.equal(alice.records[0].delivery,'delivered');
});
test('spoofed, wrong-target, blocked and oversized messages are not stored or acknowledged',()=>{
 let acks=0;const bob=create('bob',store(),()=>acks++,()=>{},p=>p==='blocked');
 const p={type:'scord_dm',version:1,action:'message',id:'one',from:'alice',to:'bob',payload:{text:'hello'}};
 bob.receive('eve',p);bob.receive('alice',{...p,to:'eve'});bob.receive('blocked',{...p,from:'blocked'});bob.receive('alice',{...p,payload:{text:'x'.repeat(2001)}});
 assert.equal(bob.records.length,0);assert.equal(acks,0);
});
test('storage failure never sends or claims receipt and leaves state unchanged',()=>{
 let sends=0;const bad={getItem(){return null},setItem(){throw Error('quota')}};
 const alice=create('alice',bad,()=>sends++);assert.ok(alice.enqueue('bob',{text:'keep my draft'}).error);
 assert.equal(sends,0);assert.equal(alice.records.length,0);
 alice.receive('bob',{type:'scord_dm',version:1,action:'message',id:'one',from:'bob',to:'alice',payload:{text:'hello'}});
 assert.equal(sends,0);assert.equal(alice.records.length,0);
});
test('retries back off and cancelling stops future sends',()=>{
 let time=0,sends=0;const a=create('alice',store(),()=>sends++,()=>{},()=>false,()=>time);
 const {id}=a.enqueue('bob',{text:'hello'});a.flush();assert.equal(sends,1);
 time=2000;a.flush();assert.equal(sends,2);time=3000;a.flush();assert.equal(sends,2);
 a.cancel(id);time=100000;a.flush();assert.equal(sends,2);assert.equal(a.records[0].delivery,'cancelled');
});
test('histories remain separated by local identity and duplicate ids by sender',()=>{
 const storage=store();const bob=create('bob',storage,()=>{});
 for(const from of ['alice','eve'])bob.receive(from,{type:'scord_dm',version:1,action:'message',id:'same',from,to:'bob',payload:{text:from}});
 assert.equal(bob.records.length,2);assert.equal(create('other',storage,()=>{}).records.length,0);
});
test('cleared incoming messages do not return when a lost acknowledgement is retried',()=>{
 const storage=store(),acks=[];let bob=create('bob',storage,(p,m)=>acks.push(m));
 const packet={type:'scord_dm',version:1,action:'message',id:'one',from:'alice',to:'bob',payload:{text:'hello'}};
 bob.receive('alice',packet);bob.clear('alice');bob=create('bob',storage,(p,m)=>acks.push(m));bob.receive('alice',packet);
 assert.equal(bob.records.length,0);assert.equal(acks.length,2);
});
test('two instances refresh persisted history, ACK and cancellation before later writes or retry',()=>{
 const storage=store(),sent=[];const a=create('alice',storage,()=>{}),b=create('alice',storage,(p,m)=>sent.push(m));
 const first=a.enqueue('bob',{text:'first'});b.enqueue('bob',{text:'second'});
 a.receive('bob',{type:'scord_dm',version:1,action:'ack',id:first.id,from:'bob',to:'alice'});
 assert.equal(a.records.length,2);b.refresh();assert.equal(b.records[0].delivery,'delivered');
 a.clear('bob');b.flush();assert.equal(b.records.length,0);
 b.enqueue('bob',{text:'third'});assert.equal(create('alice',storage,()=>{}).records.length,1);
});
