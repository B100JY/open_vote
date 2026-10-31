import { NextResponse } from "next/server";
import { getServiceDbSupabase } from "@/lib/supabase/server";
import { canManageElection, getRequestMember } from "@/lib/supabase/auth";
import { resolveVoteCredential } from "@/lib/vote-credential";
import { getVoterCodePepper } from "@/lib/voter-code";
import { makeViewToken, validViewToken, viewCookieName, VIEW_TTL_SECONDS } from "@/lib/election-view-token";

type ViewElection = { id: string; created_by: string | null; content_restricted?: boolean; auth_mode?: string | null; trashed_at?: string | null };
export function hasElectionViewCookie(request: Request, id: string) {
  const secret = getVoterCodePepper();
  if (!secret) return false;
  const name = viewCookieName(id);
  const token = (request.headers.get("cookie") ?? "").split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
  return validViewToken(token, id, secret);
}
export async function canViewElection(request: Request, election: ViewElection) {
  return election.content_restricted === false || await canViewPrivateElection(request, election);
}
export async function canViewPrivateElection(request: Request, election: ViewElection) {
  if (hasElectionViewCookie(request, election.id)) return true;
  if (!request.headers.has("authorization")) return false;
  const member = await getRequestMember(request);
  if (member && ["admin", "creator"].includes(member.member.role) && canManageElection({user:member,isAdmin:member.member.role === "admin"}, election.created_by)) return true;
  // 기존 이메일/회원 투표 링크는 명부에 등록된 로그인 유권자에게만 허용한다.
  if (election.auth_mode !== "sms_token") return !!await resolveVoteCredential(request, {electionId:election.id}, {allowExpired:true});
  return false;
}
export function grantElectionView(response: NextResponse, id: string) {
  const secret = getVoterCodePepper();
  if (!secret) throw new Error("투표 열람 설정을 준비하지 못했습니다.");
  response.cookies.set(viewCookieName(id), makeViewToken(id, secret), {httpOnly:true,secure:process.env.NODE_ENV === "production",sameSite:"lax",path:"/",maxAge:VIEW_TTL_SECONDS});
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function requireElectionView(request: Request, id: string, includesDescription = false) {
  const {data,error} = await getServiceDbSupabase().from("elections").select("id,created_by,content_restricted,auth_mode,trashed_at,description_public").eq("id",id).maybeSingle();
  if (error) return NextResponse.json({message:"투표 정보를 확인하지 못했습니다."},{status:503,headers:{"Cache-Control":"private, no-store"}});
  if (!data || data.trashed_at) return NextResponse.json({message:"투표를 찾을 수 없습니다."},{status:404,headers:{"Cache-Control":"private, no-store"}});
  if (await canViewElection(request,data) && (!includesDescription || data.description_public === true || await canViewPrivateElection(request,data))) return null;
  return NextResponse.json({message:"문자로 받은 투표 링크를 열거나 투표 코드를 입력해주세요.",error:"vote_access_required"},{status:403,headers:{"Cache-Control":"private, no-store"}});
}
/** 비공개 설명이 목록·결과 응답으로 새지 않도록 서버에서 걸러낸다. */
export async function electionForViewer<T extends ViewElection & { description?: string | null; description_public?: boolean }>(request: Request, election: T) {
  return election.description_public === true || await canViewPrivateElection(request,election) ? election : {...election,description:null};
}
