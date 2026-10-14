const fs=require('fs'),vm=require('vm'),assert=require('assert');
const root=__dirname+'/..';const html=fs.readFileSync(root+'/app/src/main/assets/index.html','utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
const rows={mjy_users:[{_id:'u1',uid:'user1',current_session_id:'session1'}],mjy_user_data:[]};
const match=(r,q)=>Object.entries(q).every(([k,v])=>v&&v.op==='exists'?(r[k]!==undefined)===v.value:r[k]===v);
const db={command:{exists:value=>({op:'exists',value}),set:value=>({op:'set',value})},collection(name){let q={},limit=Infinity;const api={where(v){q=v;return api},limit(n){limit=n;return api},async get(){return{data:clone((rows[name]||[]).filter(r=>match(r,q)).slice(0,limit))}},async add({data}){rows[name]||=[];if(rows[name].some(r=>r._id===data._id))throw Error('exists');rows[name].push(clone({...data,_id:data._id||'doc'+rows[name].length}));return{_id:data._id}},async update({data}){let updated=0;for(const r of rows[name]||[])if(match(r,q)){for(const[k,v]of Object.entries(data))r[k]=clone(v&&v.op==='set'?v.value:v);updated++}return{stats:{updated}}}};return api}};
const server={exports:{},Buffer,process:{env:{}},require:n=>n==='wx-server-sdk'?{init(){},DYNAMIC_CURRENT_ENV:'test',database:()=>db}:n==='nodemailer'?{}:require(n)};
vm.createContext(server);vm.runInContext(fs.readFileSync(root+'/cloud-index.js','utf8'),server);
let sent=[],lose=false,hook=null;
async function request(action,data){const body={action,...clone(data)};sent.push(body);const response=await server.exports.main({httpMethod:'POST',body:JSON.stringify(body)},{});const ret=JSON.parse(response.body);if(!ret.ok){let e=Error(ret.message);e.code=ret.code;throw e}if(action==='push_delta'&&hook){let h=hook;hook=null;h()}if(action==='push_delta'&&lose){lose=false;throw Error('Failed to fetch')}return ret}
const storage={removeItem(k){delete this[k]}};
const c={Blob,console,localStorage:storage,navigator:{onLine:true},window:{addEventListener(){}},mjyRawPost:request,getMjyAccount:()=>({uid:'user1',session_id:'session1'}),isMjyLoggedIn:()=>true,readJSON:(k,d)=>storage[k]?JSON.parse(storage[k]):d,updateMjySyncUI(){},toast(){},queueMjyCloudSync(){c.queued++},queued:0,setTimeout:()=>123,clearTimeout(){},mjySyncBusy:false,mjySyncState:'idle',mjySyncTimer:null,entries:[],cats:[['餐饮','🍜']],incomeCats:[['工资','💴']],budget:0,LS:{entries:'entries'}};
vm.createContext(c);
for(const n of ['mjyNowIso','mjyNewId','mjyHashText','mjyEntryForSync','ensureMjyEntryIds','cleanMjyCatListForSync','normalizeMjyBusinessData','makeMjySyncData','mjyCurrentDataHash']){let l=html.split('\n').find(l=>l.startsWith('function '+n+'('));assert(l,n);vm.runInContext(l,c)}
vm.runInContext(html.slice(html.indexOf('// Baselines contain acknowledged'),html.indexOf('async function handleMjySessionKicked')),c);
// Use the actual patched function, including account change protection.
const push=html.slice(html.indexOf('async function pushMjyCloudData('),html.indexOf('function mjyParseEntryTime('));
const end=push.indexOf('\nfunction mjyEntryNaturalKey');
vm.runInContext(push.slice(0,push.indexOf('\nfunction ',20)),c);
async function run(){
 c.entries=Array.from({length:900},(_,i)=>({id:'e'+i,amount:-i-1,date:'2026-10-14',time:'09:00',name:'早餐',icon:'🍞',note:'中文备注'.repeat(8),createdAt:'2026-10-14T01:00:00Z',updatedAt:'2026-10-14T01:00:00Z'}));
 storage.mjy_cloud_dirty='1';await c.pushMjyCloudData(true);
 assert.equal(rows.mjy_user_data[0].data.entries.length,900);assert.equal(rows.mjy_user_data[0].data.budget,0);assert(sent.filter(x=>x.action==='push_delta').length>3);assert(sent.filter(x=>x.action==='push_delta').every(x=>Buffer.byteLength(JSON.stringify(x))<49*1024));console.log('PASS 900 records: bounded initial batches, budget zero');
 sent=[];c.entries[0].note='修改';c.entries.splice(1,1);c.entries.push({...c.entries[0],id:'new',note:'新增'});storage.mjy_cloud_dirty='1';await c.pushMjyCloudData(true);
 let delta=sent.filter(x=>x.action==='push_delta');assert.equal(delta.length,1);assert.equal(delta[0].upserts.length,2);assert.deepEqual(delta[0].deletes,['e1']);assert(!rows.mjy_user_data[0].data.entries.some(e=>e.id==='e1'));console.log('PASS only added/edited records and deletion IDs uploaded');
 c.entries[0].note='响应丢失';storage.mjy_cloud_dirty='1';lose=true;await assert.rejects(()=>c.pushMjyCloudData(true));assert(storage.mjy_delta_pending_v1_user1);let rev=rows.mjy_user_data[0].sync_revision;await c.pushMjyCloudData(true);assert.equal(rows.mjy_user_data[0].sync_revision,rev);assert(!storage.mjy_delta_pending_v1_user1);console.log('PASS lost response retry is idempotent');
 c.entries[0].note='发送中';storage.mjy_cloud_dirty='1';hook=()=>{c.entries[0].note='发送期间继续修改'};await c.pushMjyCloudData(true);assert.equal(storage.mjy_cloud_dirty,'1');await c.pushMjyCloudData(true);assert.equal(rows.mjy_user_data[0].data.entries.find(e=>e.id==='e0').note,'发送期间继续修改');console.log('PASS edits during upload remain pending');
 const remote=await c.mjyReadPaged({uid:'user1',session_id:'session1'});assert.equal(remote.data.entries.length,900);assert.equal(remote.data.budget,0);console.log('PASS paged restore retrieves all entries');
 c.navigator.onLine=false;c.entries[0].note='离线';storage.mjy_cloud_dirty='1';let n=sent.length;await c.pushMjyCloudData(true);assert.equal(sent.length,n);assert.equal(storage.mjy_cloud_dirty,'1');c.navigator.onLine=true;await c.pushMjyCloudData(true);console.log('PASS offline changes retained and uploaded on reconnection');
 const stable=rows.mjy_user_data[0];const same={uid:'user1',session_id:'session1',batch_id:'parallel-test',revision:stable.sync_revision+'|'+stable.cloud_updated_at,upserts:[],deletes:[]};let concurrent=await Promise.all([request('push_delta',same),request('push_delta',same)]);assert.equal(concurrent[0].revision,concurrent[1].revision);console.log('PASS concurrent duplicate requests have one committed revision');
 c.mjySaveBase('user1',remote.data,concurrent[0].revision);
 const snapshot=clone(rows.mjy_user_data[0]);rows.mjy_user_data[0].sync_revision='other-device';c.entries[0].note='冲突';storage.mjy_cloud_dirty='1';await assert.rejects(()=>c.pushMjyCloudData(true),e=>e.code==='SYNC_CONFLICT');assert.equal(rows.mjy_user_data[0].data.entries[0].note,snapshot.data.entries[0].note);assert.equal(c.mjySyncState,'conflict');console.log('PASS stale revision cannot overwrite cloud');
 c.mjySaveBase('user1',remote.data,'other-device|'+rows.mjy_user_data[0].cloud_updated_at);c.entries=[];storage.mjy_cloud_dirty='1';await c.pushMjyCloudData(true);assert.equal(rows.mjy_user_data[0].data.entries.length,0);console.log('PASS clear-all synchronizes deletions');
 await assert.rejects(()=>request('push_data',{uid:'user1',session_id:'session1',data:{entries:[]}}),e=>e.code==='APP_UPGRADE_REQUIRED');await assert.rejects(()=>request('sync_pull',{uid:'user1',session_id:'bad'}),e=>e.code==='SESSION_KICKED');console.log('PASS old full uploads blocked and session authentication enforced');
 c.entries=[{id:'huge',note:'大'.repeat(20000)}];storage.mjy_cloud_dirty='1';await assert.rejects(()=>c.pushMjyCloudData(true),/单条账单过大/);assert.equal(rows.mjy_user_data[0].data.entries.length,0);console.log('PASS oversized individual record fails without losing pending data');
 rows.mjy_users.push({_id:'u2',uid:'user2',current_session_id:'session2'});
 rows.mjy_user_data.push({_id:'legacy-doc',uid:'user2',data:{entries:[{amount:-10,date:'2026-01-01',name:'旧账单'}],cats:[],incomeCats:[],budget:0},cloud_updated_at:'legacy-time'});
 const auth2={uid:'user2',session_id:'session2'},legacy=await request('sync_pull',auth2);assert(legacy.data.entries[0].id.startsWith('legacy_'));
 let edit={...legacy.data.entries[0],note:'迁移后修改'};let migrated=await request('push_delta',{...auth2,revision:legacy.revision,batch_id:'migrate',upserts:[edit],deletes:[]});
 assert.equal(rows.mjy_user_data.find(x=>x.uid==='user2').data.entries.length,1);assert.equal(rows.mjy_user_data.find(x=>x.uid==='user2').data.entries[0].note,'迁移后修改');console.log('PASS existing legacy document/records migrate in place');
 await assert.rejects(()=>request('sync_pull',{...auth2,offset:0,revision:legacy.revision}),e=>e.code==='SYNC_CONFLICT');console.log('PASS paged reads reject changed revisions');
}
run().catch(e=>{console.error(e);process.exit(1)});
