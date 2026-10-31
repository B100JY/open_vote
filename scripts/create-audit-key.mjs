// 키 내용은 stdout에 출력하지 않는다. 운영 환경 등록은 별도 절차로 한다.
import { generateKeyPairSync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
const arg=process.argv[2];
if(!arg)throw new Error("사용법: node scripts/create-audit-key.mjs <저장소 밖의 새 비밀 파일 절대경로>");
const target=resolve(arg),rel=relative(process.cwd(),target);
if(!isAbsolute(arg)||(!rel.startsWith("..")&&!isAbsolute(rel)))throw new Error("키는 저장소 밖의 절대경로에 보관해주세요.");
const {privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
await writeFile(target,JSON.stringify(privateKey.export({format:"jwk"})),{encoding:"utf8",flag:"wx",mode:0o600});
console.log("감사 개인키 파일을 만들었습니다. 내용을 출력·커밋하지 말고 MOAI_AUDIT_PRIVATE_JWK 비밀 환경변수로 등록하세요. Windows에서는 파일 ACL도 확인하세요.");
