import {test} from "node:test";
import assert from "node:assert/strict";
import {mobileSmsUri,phoneBatches} from "../mobile-sms.ts";
test("그룹 중복·일반전화 제외, 30명씩 묶음",()=>{
 const people=Array.from({length:61},(_,i)=>({phone:`010${String(i).padStart(8,"0")}`}));
 const batches=phoneBatches([...people,...people,{phone:"02-1234-5678"}]);
 assert.deepEqual(batches.map(b=>b.length),[30,30,1]);
 assert.equal(new Set(batches.flat()).size,61);
 assert.deepEqual(phoneBatches([{phone:"010-1234-5678"},{phone:"01012345678"}]),[["01012345678"]]);
});
test("문자 링크는 안전하게 본문 인코딩, 아이폰은 복사 대안",()=>{
 assert.equal(mobileSmsUri(["01012345678"],"안녕 & #\n다음"),"sms:01012345678?body="+encodeURIComponent("안녕 & #\n다음"));
 assert.equal(mobileSmsUri(["01012345678"],"본문",true),"sms:01012345678");
 assert.throws(()=>mobileSmsUri(["01012345678?body=other"],""));
 assert.throws(()=>phoneBatches([],31));
});
