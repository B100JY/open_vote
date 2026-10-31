// 실제 발송·운영 DB 없이 알림 발송 경계와 관리자 인가를 검사한다.
import { build } from 'esbuild';
import vm from 'node:vm';
import assert from 'node:assert/strict';
async function bundle(path, globals) {
 const built=await build({entryPoints:[path],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'mock',setup(b){
  b.onResolve({filter:/^(next\/server|@\/lib\/supabase\/(server|auth))$/},a=>({path:a.path,namespace:'mock'}));
  b.onLoad({filter:/.*/,namespace:'mock'},({path})=>({contents:path==='next/server'?'export const after=fn=>globalThis.callbacks.push(fn);export const NextResponse={json:(d,i)=>Response.json(d,i)};':path.endsWith('/auth')?'export const requireAdmin=()=>globalThis.auth();':'export const getServiceDbSupabase=()=>globalThis.db;'}));
 }}]});
 const loaded={exports:{}};vm.runInNewContext(built.outputFiles[0].text,{module:loaded,exports:loaded.exports,URL,Response,AbortSignal,console,...globals});return loaded.exports;
}
let enabled=true, rpcError=false;
const calls=[],requests=[],callbacks=[];
const env={GOOGLE_CHAT_WEBHOOK_URL:'https://chat.googleapis.com/v1/spaces/synthetic/messages?key=fake&token=fake'};
const item={id:'event-1',kind:'vote_cast',title:'합성 선거\n제목',attempts:1,lease_token:'lease-1'};
const db={async rpc(name,args){calls.push([name,args]);return {data:name==='claim_admin_notifications'?[item]:null,error:rpcError?{}:null};},from(){const q={select(){return q;},eq(){return q;},update(value){calls.push(['update',value]);return q;},single:async()=>({data:{enabled,vote_enabled:enabled},error:null}),then(resolve){return Promise.resolve({error:null}).then(resolve);}};return q;}};
const notification=await bundle('src/lib/admin-notifications.ts',{db,callbacks,process:{env},fetch:async(url,options)=>{requests.push([url,JSON.parse(options.body)]);return new Response('',{status:200});}});
assert.ok(notification.notificationWebhook());
for(const url of ['http://chat.googleapis.com/v1/spaces/a/messages?key=x&token=y','https://evil.test/v1/spaces/a/messages?key=x&token=y','https://chat.googleapis.com/v1/spaces/a/messages']){env.GOOGLE_CHAT_WEBHOOK_URL=url;assert.equal(notification.notificationWebhook(),null);}
env.GOOGLE_CHAT_WEBHOOK_URL='https://chat.googleapis.com/v1/spaces/synthetic/messages?key=fake&token=fake';
await notification.deliverNotifications(1);assert.equal(requests.length,1);
const text=requests[0][1].text;assert.match(text,/투표 1건 접수/);assert.ok(!/phone|email|receipt|selection|token=|fake/.test(text));
assert.equal(calls.findLast(c=>c[0]==='finish_admin_notification')[1].p_success,true);
assert.equal(calls.at(-1)[0],'release_notification_dispatch');
enabled=false;await notification.deliverNotifications(1);assert.equal(requests.length,1);assert.equal(calls.findLast(c=>c[0]==='update')[1].state,'skipped');
enabled=true;rpcError=true;notification.scheduleNotifications();await callbacks.pop()(); // 응답 후 오류가 밖으로 전파되지 않는다.
const failed=await bundle('src/lib/admin-notifications.ts',{db:{...db,rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='claim_admin_notifications'?[item]:null,error:null};}},callbacks,process:{env},fetch:async()=>{throw new Error('sensitive webhook URL');}});
await failed.deliverNotifications(1);assert.equal(calls.findLast(c=>c[0]==='finish_admin_notification')[1].p_success,false);assert.equal(calls.findLast(c=>c[0]==='finish_admin_notification')[1].p_error,'DELIVERY_FAILED');
const api=await bundle('src/app/api/admin/notifications/route.ts',{db:{from(){throw new Error('unauthorized must not reach database');}},callbacks,process:{env},auth:async()=>({ok:false,status:403,message:'관리자 전용'})});
for(const method of ['GET','PATCH','POST'])assert.equal((await api[method](new Request('https://example.test/api/admin/notifications',{method,body:method==='GET'?undefined:'{}'}))).status,403);
console.log('PASS webhook allowlist / no private data / disabled / after failure isolated / delivery failure / admin-only GET PATCH POST');
