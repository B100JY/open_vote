// 실발송/DB 연결을 모두 대체한 서버 전송 서비스 검사.
import { build } from "esbuild";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const root=await mkdtemp(join(tmpdir(),"moai-sms-service-")),out=join(root,"service.mjs");
await build({entryPoints:[resolve('src/lib/sms-dispatch.ts')],outfile:out,bundle:true,platform:'node',format:'esm',plugins:[{name:'isolated-boundaries',setup(b){
 b.onResolve({filter:/^@\/lib\/(supabase\/server|simply-notifier)$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path.endsWith('server')?'export const getServiceDbSupabase=()=>globalThis.__sms.db;':`export class SimplyNotifierError extends Error{}; export const getNotifierConfig=()=>({template:'투표안내'}); export const sendNotifierBatch=(config,payload)=>globalThis.__sms.send(config,payload);`,loader:'js'}));
}}]});
const {sendVoteInviteSms}=await import(pathToFileURL(out));
process.env.OPENVOTE_CODE_PEPPER='synthetic-pepper-32-characters-for-tests';process.env.VOTE_CREDIT_PER_VOTER='30';
const actor='11111111-1111-4111-8111-111111111111';
function fixture(scenario){
 const calls=[],voter={id:'22222222-2222-4222-8222-222222222222',phone:'01000000001',voter_name:'합성',invited_at:null};
 const db={from(){const q={select(){return q},eq(){return q},not(){return q},is(){return q},in(){return q},order(){return q},range(){return q},insert(){return Promise.resolve({error:null})},maybeSingle(){return Promise.resolve({data:{id:'e',name:'총회',status:'active',sms_title:null,ends_at:null}})},then(ok){return Promise.resolve({data:[voter]}).then(ok)}};return q},async rpc(name,args){calls.push({name,args});if(name==='sms_reserve')return {data:scenario==='insufficient'?{ok:false,error:'insufficient_credits',required:10,balance:0}:{ok:true,items:[{id:voter.id,dispatch:'dispatch',resendCount:1}]}};if(name==='rotate_voter_tokens')return {data:[{id:voter.id,previous_hash:'old',previous_code_hash:'old-code'}]};return {data:{refund:0}}}};
 globalThis.__sms={db,async send(config,payload){calls.push({name:'provider',config,payload});if(scenario==='unknown')throw Error('network drop');const status=scenario==='failed'?'failed':'sent';return {requested:1,sent:status==='sent'?1:0,failed:status==='failed'?1:0,skipped:0,batch_id:'mock',results:[{ref:voter.id,status}]}}};
 return calls;
}
for(const scenario of ['sent','failed','unknown','insufficient']){
 const calls=fixture(scenario),result=await sendVoteInviteSms({electionId:'e',baseUrl:'https://vote.bluerdot.net',actorId:actor,format:'compact',smsTitle:'총회'});
 if(scenario==='insufficient'){assert.equal(result.ok,false);assert.equal(result.status,402);assert.equal(calls.some(c=>c.name==='provider'),false);assert.equal(calls.some(c=>c.name==='rotate_voter_tokens'),false);continue;}
 assert.equal(result.ok,true);const provider=calls.find(c=>c.name==='provider');assert.equal(provider.config.template,'moai_vote_compact_v1');assert.deepEqual(Object.keys(provider.payload.recipients[0].variables).sort(),['code','title']);
 const states=calls.filter(c=>c.name==='sms_settle_many').flatMap(c=>c.args.p_items.map(i=>i.state));assert.ok(states.includes(scenario==='sent'?'sent':scenario==='failed'?'failed':'unknown'));
 assert.equal(calls.some(c=>c.name==='restore_voter_tokens'),scenario==='failed');assert.equal(result.summary.uncertain,scenario==='unknown');
}
const calls=fixture('sent');const invalid=await sendVoteInviteSms({electionId:'e',baseUrl:'https://vote.bluerdot.net',actorId:actor,format:'compact',smsTitle:'가'.repeat(19)});assert.equal(invalid.ok,false);assert.equal(calls.length,0);
delete globalThis.__sms;
console.log('PASS SMS service: compact template/variables / over-limit preflight / no-funds no-send / definite failure restoration / unknown hold');
