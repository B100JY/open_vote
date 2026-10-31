import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
export async function testSmsDispatch({sql,json,lit,owner,exe,args}) {
 sql(`alter table app_open_vote.voter_registry add column if not exists invited_at timestamptz;
 alter table app_open_vote.voter_registry add column if not exists admin_resend_count integer not null default 0;
 alter table app_open_vote.voter_registry add column if not exists self_resend_used boolean not null default false;
 alter table app_open_vote.credit_transactions add column if not exists created_at timestamptz default now();`);
 const migration=await readFile("supabase/migrations/20261029010000_sms_dispatch_billing.sql","utf8");sql(migration);sql(migration);
 const e=sql(`insert into app_open_vote.elections(name,created_by,status,total_voter_codes,candidates,ends_at) values('문자 합성 시험','${owner}','active',2,'[]',now()+interval '1 hour') returning id;`);
 const voters=json(`with ins as(insert into app_open_vote.voter_registry(election_id,phone) values('${e}','01000000001'),('${e}','01000000002') returning id) select json_agg(id) from ins;`);
 const ids=`array[${voters.map(v=>lit(v)+"::uuid").join(',')}]`;
 const reserve=(which=ids,kind="bulk",price=10)=>`select app_open_vote.sms_reserve('${e}',${which},'compact','${kind}',${price},'${owner}',false);`;
 const one=i=>`array['${voters[i]}'::uuid]`;
 const balance=()=>Number(sql(`select balance from app_open_vote.credit_accounts where user_id='${owner}';`));
 sql(`update app_open_vote.credit_accounts set balance=15 where user_id='${owner}';`);
 assert.equal(json(reserve()).error,"insufficient_credits");assert.equal(balance(),15);
 assert.equal(Number(sql(`select count(*) from app_open_vote.sms_dispatches where election_id='${e}';`)),0);
 sql(`update app_open_vote.credit_accounts set balance=100 where user_id='${owner}';`);
 const competing=await Promise.all([0,1].map(()=>new Promise((resolve,reject)=>{
 const child=spawn(exe('psql'),args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let out='',err='';
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out.trim())):reject(new Error(err)));child.stdin.end(reserve());
 })));
 assert.equal(competing.filter(r=>r.ok).length,1);assert.equal(balance(),80);
 const a=competing.find(r=>r.ok);assert.equal(json(reserve()).error,'dispatch_pending');
 const settle=(id,state)=>`select app_open_vote.sms_settle('${id}','${state}');`;
 const first=a.items.find(i=>i.id===voters[0]),second=a.items.find(i=>i.id===voters[1]);
 sql(settle(first.dispatch,'sent'));sql(settle(second.dispatch,'failed'));sql(settle(second.dispatch,'failed'));
 assert.equal(balance(),90);
 const self=json(reserve(one(0),'self',10));assert.equal(self.ok,true);sql(settle(self.items[0].dispatch,'sent'));
 assert.equal(json(reserve(one(0),'self',10)).error,'limit_reached');
 const unknown=json(reserve(one(1),'admin'));assert.equal(unknown.ok,true);
 sql(settle(unknown.items[0].dispatch,'unknown'));assert.equal(json(reserve(one(1))).error,'dispatch_pending');
 sql(settle(unknown.items[0].dispatch,'failed'));assert.equal(Number(sql(`select admin_resend_count from app_open_vote.voter_registry where id='${voters[1]}';`)),0);
 // 이전 선차감 30P의 첫 간편 문자(10P) 차액은 20P를 정확히 한 번 반환한다.
 sql(`insert into app_open_vote.credit_transactions(user_id,amount,balance_after,tx_type,election_id) values('${owner}',-60,0,'vote_creation','${e}');`);
 const before=balance();const legacy=json(reserve(one(1),'bulk',10));assert.equal(legacy.reserved,0);
 sql(settle(legacy.items[0].dispatch,'sent'));sql(settle(legacy.items[0].dispatch,'sent'));assert.equal(balance(),before+20);
 const quote=json(`select app_open_vote.sms_quote('${e}',${ids},30,10);`);assert.equal(quote.compact,20);assert.equal(quote.standard,60);assert.equal(quote.legacyCredit,0);
 // 생성 RPC는 0P로 정상 동작: 잔액이 없어도 새 선거를 만들 수 있다.
 sql(`update app_open_vote.credit_accounts set balance=0 where user_id='${owner}';`);
 const created=json(`select app_open_vote.create_billed_election('${owner}','생성 무료 시험',null,'[{"id":"a","name":"가"},{"id":"b","name":"나"}]','[{"phone":"01000000003"}]',0,now(),now()+interval '1 hour','single',1,1,false);`);
 assert.equal(created.success,true);assert.equal(created.cost,0);assert.equal(balance(),0);
 sql(`update app_open_vote.credit_accounts set balance=100000 where user_id='${owner}';`);
 console.log('PASS SMS billing: insufficient all-or-none / concurrent reservation / failure refund once / unknown hold / self limit / legacy credit / free creation');
}
