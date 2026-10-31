import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCompactTitle, compactMessage, smsBytes, parseSmsFormat } from "../sms-format.ts";
test("간편 SMS 고정 54바이트 + 한글 제목 18자까지 정확히 90바이트",()=>{
 assert.equal(smsBytes(compactMessage("")),54);
 assert.equal(checkCompactTitle("가".repeat(18)).ok,true);
 assert.equal(smsBytes(compactMessage("가".repeat(18))),90);
 assert.equal(checkCompactTitle("가".repeat(19)).ok,false);
 assert.equal(checkCompactTitle("A".repeat(36)).ok,true);
 assert.equal(checkCompactTitle("A".repeat(37)).ok,false);
});
test("간편 제목에서 줄바꿈/주소·전화·비지원 EUC-KR·이모지 차단",()=>{
 assert.deepEqual(checkCompactTitle("  정기   총회 "),{ok:true,value:"정기 총회",bytes:63});
 for(const title of ["","https://x.net","010-1234-5678","힣","🗳️"]) assert.equal(checkCompactTitle(title).ok,false,title);
 assert.equal(parseSmsFormat(undefined),"standard");assert.equal(parseSmsFormat("compact"),"compact");assert.equal(parseSmsFormat("arbitrary-template"),null);
 assert.equal(compactMessage("총회"),"[모아이투표] 총회\nhttps://vote.bluerdot.net/\n코드: ABC-012");
});
