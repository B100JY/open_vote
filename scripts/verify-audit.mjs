import { readFile } from "node:fs/promises";
import { verifyBundle } from "../src/lib/native-audit.ts";
import { parseSavedReceipt } from "../src/lib/vote-receipt.ts";
if(!process.argv[2]){console.error("사용법: node scripts/verify-audit.mjs 공개묶음.json [개인확인증.json] [시작규칙.json]");process.exit(2);}
const bundle=JSON.parse(await readFile(process.argv[2],"utf8"));
const receipt=process.argv[3]?parseSavedReceipt(await readFile(process.argv[3],"utf8")):undefined;
if(process.argv[3]&&!receipt)throw new Error("개인 확인증 형식 오류");
const anchor=process.argv[4]?JSON.parse(await readFile(process.argv[4],"utf8")):undefined;
const report=await verifyBundle(bundle,receipt??undefined,anchor);
console.log(JSON.stringify(report,null,2));
process.exitCode=report.some(c=>c.status==="FAIL")?1:0;
