// 실제 Next API를 실행하되 데이터 경계는 합성 PostgreSQL REST 하네스로 대체한다.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { open } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { commitment, digest, hashObject, newSecret, verifyBundle, verifySignature } from "../src/lib/native-audit.ts";
const wait=ms=>new Promise(r=>setTimeout(r,ms));
export async function testHttp({sql,json,lit,pair,election,logPath}) {
  const tables=new Set(["elections","voter_registry","audit_elections","audit_events","audit_seals","rate_limits"]);
  const rpcs=new Set(["close_expired_elections","audit_cast","audit_save_seal","get_public_ballot_ledger","get_election_results"]);
  const rest=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,"http://localhost"),segments=url.pathname.split("/");
      let result;
      if(segments[3]==="rpc"&&req.method==="POST"){
        const name=segments[4];if(!rpcs.has(name))throw Error("rpc blocked");
        let text="";for await(const chunk of req)text+=chunk;
        const args=Object.entries(JSON.parse(text||"{}")).map(([k,v])=>{if(!/^p_[a-z_]+$/.test(k))throw Error();return `${k}=>${v===null?"null":typeof v==="object"?`${lit(JSON.stringify(v))}::jsonb`:lit(v)}`;}).join(",");
        result=json(`select to_jsonb(app_open_vote.${name}(${args}));`);
      }else if(req.method==="GET"){
        const table=segments[3];if(!tables.has(table))throw Error("table blocked");
        const columns=(url.searchParams.get("select")||"*").split(",");
        if(columns.some(c=>!/^([a-z_]+|\*)$/.test(c)))throw Error("column blocked");
        const filters=[];
        for(const [k,v] of url.searchParams)if(!["select","order","limit","offset"].includes(k)){
          if(!/^[a-z_]+$/.test(k)||!v.startsWith("eq."))throw Error("filter blocked");
          filters.push(`"${k}"=${lit(v.slice(3))}`);
        }
        const order=table==="audit_events"?' order by "index"':'';
        const limit=Math.min(Number(url.searchParams.get("limit")||100000),100000),offset=Number(url.searchParams.get("offset")||0);
        if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(offset)||limit<0||offset<0)throw Error("range blocked");
        const select=`select ${columns.map(c=>c==="*"?c:`"${c}"`).join(",")} from app_open_vote.${table}${filters.length?" where "+filters.join(" and "):""}${order} limit ${limit} offset ${offset}`;
        result=json(`select coalesce(json_agg(t),'[]') from (${select}) t;`);
        if(req.headers.accept?.includes("application/vnd.pgrst.object+json"))result=result[0]??null;
      }else throw Error("method blocked");
      res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(result));
    }catch{res.writeHead(500,{"content-type":"application/json"});res.end('{"message":"isolated REST harness rejected request"}');}
  });
  await new Promise(r=>rest.listen(0,"127.0.0.1",r));
  const reserve=createServer();await new Promise(r=>reserve.listen(0,"127.0.0.1",r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const log=await open(logPath,"w");
  const child=spawn(process.execPath,["node_modules/next/dist/bin/next","start","--hostname","127.0.0.1","--port",String(port)],{
    windowsHide:true,stdio:["ignore",log.fd,log.fd],env:{...process.env,
      SUPABASE_URL:`http://127.0.0.1:${rest.address().port}`,NEXT_PUBLIC_SUPABASE_URL:`http://127.0.0.1:${rest.address().port}`,
      SUPABASE_SERVICE_ROLE_KEY:"isolated-test-key",SUPABASE_SECRET_KEY:"isolated-test-key",NEXT_PUBLIC_SUPABASE_ANON_KEY:"isolated-test-key",
      MOAI_AUDIT_PRIVATE_JWK:JSON.stringify(pair.privateKey.export({format:"jwk"})),MOAI_OTP_SEND_ENABLED:"false",SIMPLY_NOTIFIER_BASE_URL:"http://127.0.0.1:1",SIMPLY_NOTIFIER_API_SECRET:"",NOZOLINK_INTEGRATION_ENABLED:"false"}});
  const base=`http://127.0.0.1:${port}`;
  try{
    let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+"/trust")).ok){ready=true;break;}}catch{}await wait(200);}
    assert.ok(ready,"isolated Next server ready");
    sql(`create table if not exists app_open_vote.rate_limits(id integer,ip_address text,endpoint text,attempt_count integer,blocked_until timestamptz,last_attempt_at timestamptz);`);
    const token="synthetic-http-test-token",tokenHash=createHash("sha256").update(token).digest("hex");
    sql(`update app_open_vote.voter_registry set token_hash='${tokenHash}' where id='${election.voters[0]}';`);
    const start=await fetch(base+`/api/elections/${election.id}/audit?manifest=1`);assert.equal(start.status,200);const manifest=await start.json();
    assert.equal(await verifySignature(manifest,manifest.payload),true);
    const secret=newSecret(),salt=newSecret(),rh=await digest(`${election.id}|a|${salt}`),mh=await hashObject(manifest.payload),c=await commitment(election.id,mh,rh,secret);
    const response=await fetch(base+"/api/vote/audit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,selection:{choices:["a"]},receiptHash:rh,commitment:c,manifestHash:mh})});
    assert.equal(response.status,200);const accepted=await response.json();assert.equal(accepted.success,true);assert.ok(accepted.audit?.witness);
    const witness=accepted.audit.witness;assert.equal(await verifySignature(witness,manifest.payload),true);
    const publicWitness=await (await fetch(base+`/api/elections/${election.id}/audit?commitment=${c}`)).json();assert.deepEqual(publicWitness.witness,witness);
    sql(`update app_open_vote.elections set status='closed' where id='${election.id}';`);
    const published=await fetch(base+`/api/elections/${election.id}/audit?bundle=1`);assert.equal(published.status,200);const bundle=await published.json();
    const receipt={electionId:election.id,receiptHash:rh,salt,audit:{secret,commitment:c,manifest,witness}};
    assert.deepEqual((await verifyBundle(bundle,receipt)).filter(c=>c.status==="FAIL"),[]);
    console.log("PASS actual Next HTTP → isolated REST → PostgreSQL → witness → final bundle verification");
  }finally{
    child.kill();await Promise.race([new Promise(r=>child.once("exit",r)),wait(5000)]);await log.close();rest.closeAllConnections();await new Promise(r=>rest.close(r));
  }
}
