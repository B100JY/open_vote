import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
/** 비밀번호 로그인은 종료했다. 기존 회원도 확인된 구글 계정으로 연결한다. */
export async function POST() {
  return NextResponse.json({error:"구글 계정으로 로그인해주세요."},{status:410,headers:{"Cache-Control":"no-store"}});
}
