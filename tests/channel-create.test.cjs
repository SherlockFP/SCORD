const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'),'utf8');
const start = source.indexOf('async function submitAddChannel(');
const end = source.indexOf('\nasync function deleteChannel(',start);
const code = source.slice(start,end);
function setup(response, failure) {
  const input = {value:'  Oyun Gecesi  '};
  const server = {id:'room',channels:[]};
  const calls = {toasts:[],broadcasts:[],hidden:0,sidebar:0};
  const context = {document:{getElementById:()=>input}, state:{servers:[server],mesh:{broadcast:payload=>calls.broadcasts.push(payload)}},API_BASE:'/api',fetch:async()=>{if(failure) throw new Error('offline');return response;},toast:(message,kind)=>calls.toasts.push({message,kind}),hideModal:()=>calls.hidden++,updateChannelSidebar:()=>calls.sidebar++};
  vm.createContext(context); vm.runInContext(code,context);
  return {context,server,calls,input,submit:()=>context.submitAddChannel('room','text')};
}
test('channel HTTP errors never mutate local channels, broadcast, close the form, or report success', async () => {
  const h = setup({ok:false,json:async()=>({detail:'Yetki gerekli'})});
  assert.equal(await h.submit(),false); assert.equal(h.server.channels.length,0); assert.equal(h.calls.broadcasts.length,0); assert.equal(h.calls.hidden,0); assert.equal(h.calls.toasts[0].kind,'error');
});
test('non-JSON and malformed success responses are rejected', async () => {
  for (const response of [{ok:true,json:async()=>{throw new Error('bad json');}},{ok:true,json:async()=>({detail:'not a channel'})}]) {
    const h=setup(response); assert.equal(await h.submit(),false); assert.equal(h.server.channels.length,0); assert.equal(h.calls.hidden,0);
  }
});
test('network failure remains retryable without closing the channel form', async () => {
  const h=setup(null,true); assert.equal(await h.submit(),false); assert.equal(h.calls.hidden,0); assert.equal(h.calls.toasts[0].kind,'error');
});
test('confirmed creation updates actual channel state once and reports success', async () => {
  const h=setup({ok:true,json:async()=>({id:'channel',name:'oyun-gecesi',type:'text'})});
  assert.equal(await h.submit(),true); assert.equal(h.server.channels.length,1); assert.equal(h.calls.broadcasts.length,1); assert.equal(h.calls.hidden,1); assert.equal(h.calls.toasts[0].kind,'success');
});
test('a different modal opened during creation is not closed', async () => {
  const h=setup({ok:true,json:async()=>{h.context.document.getElementById=()=>({value:'another form'});return {id:'channel',name:'oyun-gecesi',type:'text'};}});
  assert.equal(await h.submit(),true); assert.equal(h.calls.hidden,0);
});
