import test from "node:test";
import assert from "node:assert/strict";
import { validHomeClosedDays } from "../home-visibility.ts";
test("종료 후 노출 기간은 숨김 0일에서 365일 사이의 정수만 허용한다", () => {
  for (const value of [0,1,7,30,365]) assert.equal(validHomeClosedDays(value),true);
  for (const value of [null,undefined,"7",true,-1,366,1.5,NaN,Infinity]) assert.equal(validHomeClosedDays(value),false);
});
