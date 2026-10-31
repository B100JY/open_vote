import { createServer } from "node:net";
// 운영 환경변수/연결을 읽지 않는 합성 PostgreSQL 시험. 종료 때 자신이 만든 서버만 중지한다.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import { generateKeyPairSync, createHash, sign } from "node:crypto";
import assert from "node:assert/strict";
import { canonical, hashObject, eventHead, verifyBundle, recount } from "../src/lib/native-audit.ts";
const run=promisify(execFile);
const bin=process.env.PG_TEST_BIN ?? "C:/Program Files/PostgreSQL/17/bin";
const root=await mkdtemp(join(tmpdir(),"moai-audit-")), port=await new Promise((resolve,reject)=>{const server=createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const p=server.address().port;server.close(()=>resolve(String(p)));});});
const exe=n=>join(bin,n+(process.platform==="win32"?".exe":""));
const args=["-X","-h","127.0.0.1","-p",port,"-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-qAt"];
const sql=s=>execFileSync(exe("psql"),args,{input:s,encoding:"utf8",stdio:["pipe","pipe","pipe"]}).trim();
const json=s=>JSON.parse(sql(s));
const lit=x=>"'"+String(x).replaceAll("'","''")+"'";
let started=false;
try{
 execFileSync(exe("initdb"),["-D",join(root,"data"),"-U","postgres","--auth=trust","--encoding=UTF8","--locale=C"],{stdio:"pipe"});
 execFileSync(exe("pg_ctl"),["-D",join(root,"data"),"-l",join(root,"postgres.log"),"-o",`-p ${port} -h 127.0.0.1`,"-w","start"],{stdio:"ignore"});started=true;
 const fixture=`create role anon;create role authenticated;create role service_role bypassrls;create schema extensions;create extension pgcrypto with schema extensions;create schema app_open_vote;set search_path=app_open_vote,extensions;
 create table elections(id uuid primary key default gen_random_uuid(),name text not null,description text,candidates jsonb,status text default 'draft',total_voter_codes integer default 0,created_by uuid,starts_at timestamptz,ends_at timestamptz,auth_mode text default 'sms_token',ballot_type text default 'single',min_choices integer default 1,max_choices integer default 1,allow_blank boolean default false,updated_at timestamptz);
 create table voter_registry(id uuid primary key default gen_random_uuid(),election_id uuid references elections,phone text,email text,voter_name text,user_id uuid,auth_user_id uuid,token_hash text,code_hash text,token_expires_at timestamptz,has_voted boolean default false);
 create table ballots(id uuid primary key default gen_random_uuid(),election_id uuid references elections,selected_candidate text,selections jsonb,receipt_hash text unique);
 create table credit_accounts(user_id uuid primary key,balance bigint default 0,updated_at timestamptz);
 create table credit_transactions(id uuid default gen_random_uuid(),user_id uuid,amount bigint,balance_after bigint,tx_type text,election_id uuid,memo text,created_by uuid);
 alter table elections enable row level security;alter table voter_registry enable row level security;alter table ballots enable row level security;alter table credit_accounts enable row level security;alter table credit_transactions enable row level security;
 grant usage on schema app_open_vote,extensions to service_role;grant all on all tables in schema app_open_vote to service_role;
 `;
 sql(fixture);
 const source=await readFile("supabase/migrations/20261010000000_ballot_types_and_secrecy.sql","utf8");
 const names=["normalize_ballot_selection","cast_ballot_internal","cast_link_ballot","get_election_results","get_public_ballot_ledger","create_billed_election","close_expired_elections","guard_election_status","permission_baseline_violations"];
 for(const name of names){const re=new RegExp(`create or replace function app_open_vote\\.${name}\\([\\s\\S]*?\\$\\$;`);const m=source.match(re);assert.ok(m,name);sql(m[0]);}
 sql(`create trigger guard_election_status before update on app_open_vote.elections for each row execute function app_open_vote.guard_election_status();
 create function app_open_vote.assert_permission_baseline() returns void language plpgsql set search_path=app_open_vote as $$begin if exists(select 1 from permission_baseline_violations()) then raise exception 'permission baseline failure';end if;end$$;
 do $$declare r record;begin for r in select oid::regprocedure s from pg_proc where pronamespace='app_open_vote'::regnamespace loop execute format('revoke execute on function %s from public,anon,authenticated',r.s);execute format('grant execute on function %s to service_role',r.s);end loop;end$$;`);
 const migration=await readFile("supabase/migrations/20261028081621_native_audit.sql","utf8");sql(migration);sql(migration);
 console.log("PASS migration twice / permission baseline");
 const pair=generateKeyPairSync("ec",{namedCurve:"prime256v1"}),pk=pair.publicKey.export({format:"jwk"}),keyId=await hashObject(pk);
 const seal=payload=>({payload,keyId,signature:sign("sha256",Buffer.from(canonical(payload)),{key:pair.privateKey,dsaEncoding:"ieee-p1363"}).toString("hex")});
 const owner="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
 sql(`insert into app_open_vote.credit_accounts values('${owner}',1000,null);`);
 const create=async(sms=false,number=4,type="single")=>{
  const a={p_creator:owner,p_name:"합성 투표",p_description:"비밀 없는 시험",p_candidates:[{id:"a",name:"가"},{id:"b",name:"나"},{id:"c",name:"다"}],p_voters:Array.from({length:number},(_,i)=>({phone:`0100000${String(i).padStart(4,"0")}`})),p_unit_price:1,p_starts_at:new Date(Date.now()-60000).toISOString(),p_ends_at:new Date(Date.now()+3600000).toISOString(),p_ballot_type:type,p_min_choices:1,p_max_choices:type==="rank"||type==="multi"?2:1,p_allow_blank:true};
  const r=json(`select app_open_vote.audit_create_billed(${lit(JSON.stringify(a))},${lit(JSON.stringify(pk))},${lit(keyId)},${sms});`);assert.equal(r.success,true);
  const id=r.election_id;sql(`update app_open_vote.elections set status='active' where id='${id}';`);
  return {id,manifest:json(`select manifest from app_open_vote.audit_elections where election_id='${id}';`),voters:json(`select json_agg(id) from app_open_vote.voter_registry where election_id='${id}';`)};
 };
 const cast=(e,v,c,h,selection={choices:["a"]},grant=null)=>`select app_open_vote.audit_cast('${v}',${lit(JSON.stringify(selection))},'${h}','${c}',(select manifest_hash from app_open_vote.audit_elections where election_id='${e.id}'),${grant?lit(grant):"null"});`;
 const e=await create();
 assert.equal(json(cast(e,e.voters[0],"1".repeat(64),"2".repeat(64))).success,true);
 assert.equal(json(cast(e,e.voters[0],"1".repeat(64),"2".repeat(64))).error,"public_event_exists");
 assert.equal(json(cast(e,e.voters[0],"3".repeat(64),"4".repeat(64))).error,"already_voted");
 assert.throws(()=>sql(`select app_open_vote.cast_ballot_internal('${e.id}','${e.voters[1]}',null,'{"choices":["a"]}','${"f".repeat(64)}');`));
 assert.throws(()=>sql(`update app_open_vote.elections set name='변경' where id='${e.id}';`));
 assert.throws(()=>sql(`update app_open_vote.voter_registry set phone='01099999999' where id='${e.voters[0]}';`));
 const results=await Promise.all(Array.from({length:8},()=>run(exe("psql"),[...args,"-c",cast(e,e.voters[1],"5".repeat(64),"6".repeat(64))],{encoding:"utf8"})));
 assert.equal(results.map(x=>JSON.parse(x.stdout)).filter(x=>x.success).length,1);
 assert.equal(Number(sql(`select count(*) from app_open_vote.ballots where election_id='${e.id}';`)),2);
 console.log("PASS atomic duplicate/retry/concurrent cast / bypass and frozen rules");
 sql(`update app_open_vote.elections set status='closed' where id='${e.id}';`);
 assert.equal(json(cast(e,e.voters[2],"7".repeat(64),"8".repeat(64))).error,"election_not_active");
 const a=json(`select row_to_json(a) from app_open_vote.audit_elections a where election_id='${e.id}';`);
 const events=json(`select json_agg(event order by index) from app_open_vote.audit_events where election_id='${e.id}';`);
 for(const ev of events)assert.equal(ev.head,await eventHead(ev));
 const ledger=json(`select app_open_vote.get_public_ballot_ledger('${e.id}');`);delete ledger.success;
 const tally=json(`select app_open_vote.get_election_results('${e.id}');`);delete tally.success;
 const bundle={format:"moai-audit-bundle-v1",manifest:seal(a.manifest),events,ledger,results:tally,final:seal(a.final_event)};
 const report=await verifyBundle(bundle,undefined,bundle.manifest);assert.deepEqual(report.filter(c=>c.status==="FAIL"),[]);
 assert.throws(()=>sql(`delete from app_open_vote.ballots where election_id='${e.id}';`));
 const saved=json(`select app_open_vote.audit_save_seal('${e.id}',0,${lit(JSON.stringify(bundle.manifest))});`);assert.deepEqual(saved,bundle.manifest);
 assert.throws(()=>sql(`select app_open_vote.audit_save_seal('${e.id}',99,${lit(JSON.stringify(bundle.final))});`));
 console.log("PASS SQL/JS canonical hashes / final bundle / signatures / independent recount");
 const o=await create(true,2);const challenge="11111111-1111-4111-8111-111111111111",codeHash="a".repeat(64),grant="b".repeat(64);
 assert.equal(json(cast(o,o.voters[0],"9".repeat(64),"a".repeat(64))).error,"sms_auth_required");
 const issue=()=>`select app_open_vote.audit_otp_issue('${o.voters[0]}','${challenge}','${codeHash}',1);`;
 assert.equal(json(issue()).ok,true);assert.equal(json(issue()).error,"otp_limited");
 sql(`select app_open_vote.audit_otp_settle('${challenge}',true);`);
 assert.equal(sql(`select app_open_vote.audit_otp_confirm('${o.voters[0]}','${challenge}','${"f".repeat(64)}','${grant}');`),"f");
 const confirm=`select app_open_vote.audit_otp_confirm('${o.voters[0]}','${challenge}','${codeHash}','${grant}');`;
 assert.equal(sql(confirm),"t");assert.equal(sql(confirm),"t");
 assert.equal(json(cast(o,o.voters[0],"9".repeat(64),"a".repeat(64),{choices:["a"]},grant)).success,true);
 assert.equal(json(cast(o,o.voters[1],"c".repeat(64),"d".repeat(64),{choices:["a"]},grant)).error,"sms_auth_required");
 console.log("PASS OTP requirement / cooldown / idempotent approval / cross-voter rejection");
 const failedChallenge="22222222-2222-4222-8222-222222222222";
 const before=Number(sql(`select balance from app_open_vote.credit_accounts where user_id='${owner}';`));
 assert.equal(json(`select app_open_vote.audit_otp_issue('${o.voters[1]}','${failedChallenge}','${codeHash}',1);`).ok,true);
 sql(`select app_open_vote.audit_otp_settle('${failedChallenge}',false);select app_open_vote.audit_otp_settle('${failedChallenge}',false);`);
 assert.equal(Number(sql(`select balance from app_open_vote.credit_accounts where user_id='${owner}';`)),before);
 console.log("PASS definite SMS failure refunded exactly once (mock provider result)");

 for(const type of ["multi","rank","approve"]){const f=await create(false,2,type);const sel=type==="approve"?{approvals:{a:"yes",b:"no",c:"yes"}}:{choices:["b","a"]};assert.equal(json(cast(f,f.voters[0],"a".repeat(64),createHash("sha256").update(type).digest("hex"),sel)).success,true);sql(`update app_open_vote.elections set status='closed' where id='${f.id}';`);const l=json(`select app_open_vote.get_public_ballot_ledger('${f.id}');`);const t=json(`select app_open_vote.get_election_results('${f.id}');`);delete t.success;assert.deepEqual(recount(f.manifest,l.ballots),t);}
 console.log("PASS multi / Borda rank / approve independent DB cross-check");
 await (await import("./test-sms-dispatch.mjs")).testSmsDispatch({sql,json,lit,owner,run,exe,args});
 await (await import("./test-workspace.mjs")).testWorkspace({sql,json,lit,owner,create,cast});
 await (await import("./test-admin-notifications-db.mjs")).testAdminNotifications({sql,json,create,cast});
 await (await import("./test-election-description-db.mjs")).testElectionDescription({sql,json,lit,owner,create});
 if(process.env.MOAI_TEST_HTTP==="1"){
  const {testHttp}=await import("./native-audit-http-test.mjs");
  await testHttp({sql,json,lit,pair,election:await create(false,2),logPath:join(root,"next-test.log")});
 }
 await writeFile(join(root,"synthetic-bundle.json"),JSON.stringify(bundle));
 console.log("All isolated database tests passed. Production connection and SMS were not used.");
}catch(e){console.error(e.stderr?.toString()??e.message);process.exitCode=1;}
finally{if(started)execFileSync(exe("pg_ctl"),["-D",join(root,"data"),"-m","fast","-w","stop"],{stdio:"pipe"});}
