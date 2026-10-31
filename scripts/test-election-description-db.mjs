import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
export async function testElectionDescription({sql,json,lit,owner,create}) {
 const migration=await readFile('supabase/migrations/20261031012208_election_description_organization.sql','utf8');sql(migration);sql(migration);
 assert.equal(sql('select count(*) from app_open_vote.elections where description_public;'),'0');
 const a={p_creator:owner,p_name:'합성 제목',p_description:'참여자 내부 설명',p_candidates:[{id:'a',name:'가'}],p_voters:[{phone:'01000000111'}],p_unit_price:0,p_starts_at:new Date().toISOString(),p_ends_at:new Date(Date.now()+3600000).toISOString(),p_ballot_type:'single',p_min_choices:1,p_max_choices:1,p_allow_blank:false};
 const make=(args,key=null,keyId=null)=>json(`select app_open_vote.workspace_create_billed(${lit(JSON.stringify(args))},${key?lit(JSON.stringify(key)):'null'},${keyId?lit(keyId):'null'},false,false);`);
 const initial=make(a);assert.equal(initial.success,true);
 assert.equal(sql(`select description_public=false and organization_name='' from app_open_vote.elections where id='${initial.election_id}';`),'t');
 const e=await create(false,1);
 const published=make({...a,p_organization_name:'합성 단체',p_description_public:true},e.manifest.publicKey,e.manifest.keyId);
 assert.equal(published.success,true);
 assert.equal(sql(`select description_public and organization_name='합성 단체' and audit_version=1 from app_open_vote.elections where id='${published.election_id}';`),'t');
 assert.equal(sql(`select manifest->'election'->>'description' from app_open_vote.audit_elections where election_id='${published.election_id}';`),'참여자 내부 설명');
 const before=sql('select count(*) from app_open_vote.elections;');
 for(const bad of [{...a,p_organization_name:'x'.repeat(121)},{...a,p_description_public:'true'},{...a,p_organization_name:[]}]) assert.throws(()=>make(bad));
 assert.equal(sql('select count(*) from app_open_vote.elections;'),before);
 assert.equal(sql('select count(*) from app_open_vote.permission_baseline_violations();'),'0');
 console.log('PASS description private default / organization / audited creation / invalid metadata rolls back / permissions');
}
