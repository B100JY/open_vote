// 실제 lifecycle 라우트에 합성 인증·DB만 주입. 운영 연결과 상태 변경 없음.
import { build } from "esbuild";
import assert from "node:assert/strict";
import vm from "node:vm";
let allowed=true, owns=true, databaseError=false;
const writes=[];
const result=await build({entryPoints:["src/app/api/elections/[id]/lifecycle/route.ts"],bundle:true,platform:"node",format:"cjs",write:false,
 plugins:[{name:"mock",setup(b){
  b.onResolve({filter:/^(next\/server|@\/lib\/supabase\/auth|@\/lib\/supabase\/server)$/},a=>({path:a.path,namespace:"mock"}));
  b.onLoad({filter:/.*/,namespace:"mock"},({path})=>({contents:path==="next/server"?"export const NextResponse={json:(d,i)=>Response.json(d,i)};":path.endsWith("/auth")?"export const requireVoteCreator=()=>globalThis.auth(); export const canManageElection=()=>globalThis.owns();":"export const getServiceDbSupabase=()=>globalThis.db();"}));
 }}]});
const loaded={exports:{}};
vm.runInNewContext(result.outputFiles[0].text,{module:loaded,exports:loaded.exports,Response,
 auth:async()=>allowed?{ok:true,user:{user:{id:"owner"}}}:{ok:false,status:403,message:"권한 없음"},owns:()=>owns,
 db:()=>({from(table){assert.equal(table,"elections");return {
  select(){return {eq(){return {async maybeSingle(){return {data:{created_by:"owner"}};}};}};},
  update(value){writes.push(["update",JSON.parse(JSON.stringify(value))]);return {eq(key,value){writes.push([key,value]);return {is(key,value){writes.push([key,value]);return {select(){return {async maybeSingle(){return {data:databaseError?null:{id:"election"},error:databaseError?{}:null};}};}};}};}};}
 };}})
});
async function run(body){return loaded.exports.POST(new Request("https://example.test",{method:"POST",body:JSON.stringify(body)}),{params:Promise.resolve({id:"election"})});}
for(const days of [0,7,365]){
 writes.length=0; assert.equal((await run({action:"home_visibility",days})).status,200);
 assert.deepEqual(writes,[["update",{home_closed_days:days}],["id","election"],["trashed_at",null]]);
}
for(const days of [-1,366,1.5,"7",null]){writes.length=0;assert.equal((await run({action:"home_visibility",days})).status,400);assert.equal(writes.length,0);}
for(const contentRestricted of [true,false]){
 writes.length=0;assert.equal((await run({action:"home_visibility",days:7,contentRestricted})).status,200);
 assert.deepEqual(writes[0],["update",{home_closed_days:7,content_restricted:contentRestricted}]);
}
writes.length=0;assert.equal((await run({action:"home_visibility",days:7,contentRestricted:"false"})).status,400);assert.equal(writes.length,0);
owns=false;writes.length=0;assert.equal((await run({action:"home_visibility",days:7})).status,403);assert.equal(writes.length,0);
owns=true;allowed=false;assert.equal((await run({action:"home_visibility",days:7})).status,403);
allowed=true;databaseError=true;assert.equal((await run({action:"home_visibility",days:7})).status,409);
console.log("PASS home policy API: owner authorization / exact election / trash exclusion / integer range / DB failure");
