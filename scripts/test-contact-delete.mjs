// 실제 DELETE 핸들러에 가짜 인증·DB만 주입해 인가와 삭제 범위를 검증한다.
import { build } from "esbuild";
import assert from "node:assert/strict";
import vm from "node:vm";
let allowed = true, fail = false;
const calls = [];
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const other = "33333333-3333-4333-8333-333333333333";
const result = await build({ entryPoints: ["src/app/api/contacts/route.ts"], bundle: true, platform: "node", format: "cjs", write: false,
  plugins: [{ name: "mocks", setup(b) {
    b.onResolve({filter: /^(next\/server|@\/lib\/supabase\/auth|@\/lib\/supabase\/server)$/}, args => ({path: args.path, namespace: "mock"}));
    b.onLoad({filter: /.*/, namespace: "mock"}, ({path}) => ({contents:
      path === "next/server" ? "export const NextResponse = {json: (data,init)=>Response.json(data,init)};" :
      path.endsWith("/auth") ? "export const requireVoteCreator = (...args)=>globalThis.mockAuth(...args);" :
      "export const getServiceDbSupabase = ()=>globalThis.mockDb();" }));
  }}] });
const loaded = {exports: {}};
vm.runInNewContext(result.outputFiles[0].text, {module: loaded, exports: loaded.exports, Response,
  mockAuth: async () => allowed ? {ok:true,user:{user:{id:owner}}} : {ok:false,status:403,message:"권한 없음"},
  mockDb: () => ({from(table) { calls.push(["table",table]); return {delete() { calls.push(["delete"]); return {in(key, ids) {calls.push(["in",key,Array.from(ids)]); return {async eq(key,value) {calls.push(["eq",key,value]); return {error:fail ? {} : null};}};}};}};}})
});
async function run(body) { return loaded.exports.DELETE(new Request("https://example.test/api/contacts", {method:"DELETE",body:JSON.stringify(body)})); }
assert.equal((await run({kind:"contact",ids:[id,other,id]})).status,200);
assert.deepEqual(calls, [["table","contacts"],["delete"],["in","id",[id,other]],["eq","owner_id",owner]]);
calls.length = 0;
assert.equal((await run({kind:"group",id})).status,200);
assert.equal(calls[0][1],"contact_groups");
assert.deepEqual(calls.at(-1),["eq","owner_id",owner]);
for (const body of [null,{}, {kind:"other",ids:[id]}, {kind:"group",ids:[]}, {kind:"contact",ids:[id,"bad"]}, {kind:"contact",ids:Array(201).fill(id)}]) {
  calls.length = 0; assert.equal((await run(body)).status,400); assert.equal(calls.length,0);
}
allowed=false; calls.length=0;
assert.equal((await run({kind:"contact",ids:[id]})).status,403); assert.equal(calls.length,0);
allowed=true; fail=true;
assert.equal((await run({kind:"contact",ids:[id]})).status,409);
console.log("PASS contact DELETE: owner isolation / group scope / deduplication / malformed input / authorization / DB failure");
