// 실제 목록/상세/명부 라우트와 권한 함수를 합성 인증·DB로 실행한다. 운영 연결 없음.
import { build } from "esbuild";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join,resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const root=await mkdtemp(join(tmpdir(),"moai-access-"));
const fixture=[['a-draft','creator-a','draft'],['a-active','creator-a','active'],['b-closed','creator-b','closed'],['b-paused','creator-b','paused'],['admin-draft','admin','draft']].map(([id,created_by,status])=>({id,created_by,status,name:id,candidates:[],created_at:'2026-10-29T00:00:00Z'}));
let userId=null;
function table(name){
 let rows=name==='elections'?[...fixture]:name==='members'&&userId?[{id:`member-${userId}`,auth_user_id:userId,role:userId==='admin'?'admin':userId==='pending'?'pending':'creator'}]:[];
 const q={select(_columns,opts){q.countOnly=opts?.head;return q},is(k,v){rows=rows.filter(r=>(r[k]??null)===v);return q},not(k,_op,v){rows=rows.filter(r=>(r[k]??null)!==v);return q},eq(k,v){rows=rows.filter(r=>r[k]===v);return q},in(k,v){rows=rows.filter(r=>v.includes(r[k]));return q},order(){return q},or(){throw Error('mixed-public-owner query forbidden')},single(){return Promise.resolve({data:rows[0]??null,error:rows.length?null:{message:'not found'}})},maybeSingle(){return Promise.resolve({data:rows[0]??null,error:null})},then(ok){return Promise.resolve({data:q.countOnly?null:rows,count:rows.length,error:null}).then(ok)}};return q;
}
globalThis.__accessDb={from:table,rpc:async()=>({data:null,error:null}),auth:{getUser:async()=>({data:{user:userId?{id:userId,app_metadata:{app:userId==='foreign'?'other':'open_vote'}}:null},error:null})}};
const plugin={name:'boundaries',setup(b){
 b.onResolve({filter:/^@\/lib\/supabase\/server$/},a=>({path:a.path,namespace:'mock'}));
 b.onResolve({filter:/^next\/server$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='next/server'?'export const NextResponse={json:(body,options)=>Response.json(body,options)};':'export const getServiceSupabase=()=>globalThis.__accessDb; export const getServiceDbSupabase=getServiceSupabase;',loader:'js'}));
}};
const routes={list:'src/app/api/elections/route.ts',detail:'src/app/api/elections/[id]/route.ts',participants:'src/app/api/elections/[id]/participants/route.ts'};
const loaded={};
for(const [name,file] of Object.entries(routes)){
 const out=join(root,name+'.mjs');await build({entryPoints:[resolve(file)],outfile:out,bundle:true,platform:'node',format:'esm',plugins:[plugin]});loaded[name]=await import(pathToFileURL(out));
}
async function list(user,scope){userId=user;const headers=user?{authorization:'Bearer synthetic'}:{};const response=await loaded.list.GET(new Request('http://localhost/api/elections'+(scope?'?scope='+scope:''),{headers}));return {status:response.status,body:await response.json(),cache:response.headers.get('cache-control')};}
assert.deepEqual((await list('creator-a','mine')).body.elections.map(e=>e.id),['a-draft','a-active']);
assert.deepEqual((await list('creator-a')).body.elections.map(e=>e.id),['a-draft','a-active']);
assert.deepEqual((await list('creator-b','mine')).body.elections.map(e=>e.id),['b-closed','b-paused']);
assert.deepEqual((await list('admin','mine')).body.elections.map(e=>e.id),['admin-draft']);
assert.equal((await list('admin','all')).body.elections.length,5);
assert.equal((await list('creator-a','all')).status,403);
assert.equal((await list('pending','mine')).status,403);
assert.equal((await list(null,'mine')).status,401);
assert.equal((await list('foreign','mine')).status,401);
assert.deepEqual((await list(null)).body.elections.map(e=>e.id),['a-active','b-closed']);
assert.equal((await list('creator-a','mine')).cache,'private, no-store');
async function get(name,user,id){userId=user;const request=new Request('http://localhost/api/elections/'+id,{headers:user?{authorization:'Bearer synthetic'}:{}});return loaded[name].GET(request,{params:Promise.resolve({id})});}
assert.equal((await get('detail',null,'a-draft')).status,404);
assert.equal((await get('detail','creator-b','a-draft')).status,404);
assert.equal((await get('detail','creator-a','a-draft')).status,200);
assert.equal((await get('detail','admin','b-paused')).status,200);
assert.equal((await get('detail',null,'a-active')).status,200);
assert.equal((await get('participants','creator-b','a-active')).status,403);
assert.equal((await get('participants','creator-a','a-active')).status,200);
assert.equal((await get('participants',null,'a-active')).status,401);
userId='creator-b';
assert.equal((await loaded.detail.PATCH(new Request('http://localhost/api/elections/a-active',{method:'PATCH',headers:{authorization:'Bearer synthetic','content-type':'application/json'},body:JSON.stringify({status:'closed'})}),{params:Promise.resolve({id:'a-active'})})).status,403);
userId=null;
assert.equal((await loaded.detail.PATCH(new Request('http://localhost/api/elections/a-active',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'closed'})}),{params:Promise.resolve({id:'a-active'})})).status,401);
delete globalThis.__accessDb;
console.log('PASS actual route access: creator A/B isolation / admin mine vs all / anonymous-pending-foreign denial / public lists / private detail / roster ownership / no-store');
