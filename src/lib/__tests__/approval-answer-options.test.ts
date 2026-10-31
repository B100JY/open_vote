import {test} from "node:test";
import assert from "node:assert/strict";
import {hasApprovalAnswerOptions,normalizeSelection} from "../ballot.ts";

test("응답 선택지를 안건별 찬반으로 잘못 넣은 경우만 안내",()=>{
  for(const names of [["찬성","반대"],["예","아니오"],["찬성","반대","보류"]]) assert.equal(hasApprovalAnswerOptions(names.map(name=>({name}))),true);
  for(const names of [[],["안건"],["홍길동","김모아"],["찬성","홍길동"]]) assert.equal(hasApprovalAnswerOptions(names.map(name=>({name}))),false);
});
test("기존 항목별 찬반 기표 정규화는 유지",()=>{
  const candidates=[{id:"a",name:"찬성"},{id:"b",name:"반대"}];
  const result=normalizeSelection(candidates,{ballot_type:"approve",min_choices:1,max_choices:1,allow_blank:false},{approvals:{a:"yes",b:"no"}});
  assert.deepEqual(result,{ok:true,canonical:"a:yes,b:no"});
});
