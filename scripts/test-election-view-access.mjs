// 실제 공개 읽기 라우트와 열람 검사에 가짜 DB·인증을 주입한다. 운영 연결 없음.
import { build } from "esbuild";
import assert from "node:assert/strict";
import vm from "node:vm";
import {makeViewToken,viewCookieName} from "../src/lib/election-view-token.ts";
const id="11111111-1111-4111-8111-111111111111",secret="synthetic-view-cookie-secret-32-characters";
let restricted=true;
let descriptionPublic=true;
const rpcCalls=[];
class JsonResponse extends Response {
  cookies={set:(name,value)=>this.headers.append("set-cookie",`${name}=${value}`)};
  static json(data,init){return new JsonResponse(JSON.stringify(data),{...init,headers:{"content-type":"application/json",...init?.headers}});}
}
const row=()=>({id,name:"공개 이름",created_by:"owner",content_restricted:restricted,description_public:descriptionPublic,status:"closed",auth_mode:"sms_token",trashed_at:null,description:"비공개 설명",candidates:[{id:"a",name:"비공개 후보"}],starts_at:null,ends_at:null});
const db={from(){const chain={select(){return chain;},eq(){return chain;},is(){return chain;},single:async()=>({data:row()}),maybeSingle:async()=>({data:row()}),then(resolve){return Promise.resolve({count:1,data:[row()]}).then(resolve);}};return chain;},async rpc(name){rpcCalls.push(name);return {data:{success:true,progress:100,candidates:[{candidate_id:"a",votes:1}],ballots:[{selection:"a"}]}};}};
const paths=["src/app/api/elections/[id]/route.ts","src/app/api/elections/[id]/results/route.ts","src/app/api/elections/[id]/ledger/route.ts","src/app/api/elections/[id]/stats/route.ts","src/app/api/elections/[id]/audit/route.ts"];
for(const path of paths){
 const result=await build({entryPoints:[path],bundle:true,platform:"node",format:"cjs",write:false,plugins:[{name:"mocks",setup(b){
  b.onResolve({filter:/^(next\/server|@\/lib\/supabase\/(auth|server)|@\/lib\/vote-credential|@\/lib\/native-audit-server)$/},a=>({path:a.path,namespace:"mock"}));
  b.onLoad({filter:/.*/,namespace:"mock"},({path})=>({contents:path==="next/server"?"export const NextResponse=globalThis.JsonResponse;":path.endsWith("/server")?"export const getServiceDbSupabase=()=>globalThis.db;export const getServiceSupabase=getServiceDbSupabase;":path.endsWith("/auth")?"export const getRequestMember=async()=>null;export const requireVoteCreator=async()=>({ok:false});export const canManageElection=()=>false;":path.endsWith("vote-credential")?"export const resolveVoteCredential=async()=>null;":"export const publicAudit=async()=>({manifest:'비공개 규칙'});export const auditBundle=async()=>({});export const initializeAudit=async()=>({});"}));
 }}]});
 const loaded={exports:{}};vm.runInNewContext(result.outputFiles[0].text,{module:loaded,exports:loaded.exports,Response,JsonResponse,db,Buffer,process:{env:{OPENVOTE_CODE_PEPPER:secret}},require:await import("node:module").then(m=>m.createRequire(import.meta.url)),URL,Date,TextEncoder,setTimeout,clearTimeout});
 async function run(cookie=""){return loaded.exports.GET(new Request(`https://example.test/api/elections/${id}`,{headers:{cookie}}),{params:Promise.resolve({id})});}
 const isDetail=path.endsWith("[id]/route.ts");
 restricted=true;rpcCalls.length=0;
 let response=await run(); assert.equal(response.status,isDetail?200:403,path);
 const denied=await response.text();assert.ok(!denied.includes("비공개"),path);if(isDetail)assert.ok(JSON.parse(denied).restricted);
 assert.ok(!rpcCalls.some(n=>["get_election_results","get_public_ballot_ledger","get_election_stats"].includes(n)),path);
 response=await run(`${viewCookieName(id)}=${makeViewToken("other-election",secret)}`);assert.equal(response.status,isDetail?200:403,path);
 response=await run(`${viewCookieName(id)}=${makeViewToken(id,secret)}`);assert.equal(response.status,200,path);
 restricted=false;response=await run();assert.equal(response.status,200,path);
 if(isDetail)assert.equal(response.headers.get("set-cookie"),null,"공개 조회만으로 나중의 비공개 열람 권한을 발급하지 않는다");
 console.log(`PASS ${path}: no proof / cross-election / valid proof / explicit public`);
 descriptionPublic=false;
 response=await run();
 if(path.endsWith('/audit/route.ts'))assert.equal(response.status,403,'서명 자료에 포함된 비공개 설명도 보호한다');
 if(isDetail || path.endsWith('/results/route.ts'))assert.ok(!(await response.text()).includes('비공개 설명'));
 response=await run(`${viewCookieName(id)}=${makeViewToken(id,secret)}`);assert.equal(response.status,200);
 if(isDetail)assert.ok((await response.text()).includes('비공개 설명'),'참여자는 설명 열람 가능');
 descriptionPublic=true;
}
