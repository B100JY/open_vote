/**
 * Local desktop-only administrator sign-in.
 * Uses the existing, already-authorized OpenVote admin; does not add a web auth bypass.
 *
 * Usage: npm run dev:admin-login
 *        npm run dev:admin-login -- --check
 *        npm run dev:admin-login -- --port 3200
 *
 * Do not deploy or run on shared/CI/production machines.
 */
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

function stop(message) {
  console.error(`로컬 관리자 로그인: ${message}`);
  process.exitCode = 1;
}
function options(args) {
  let port = 3100;
  let dryRun = false;
  let email = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--check") dryRun = true;
    else if (args[i] === "--port" && ["3100", "3200"].includes(args[i + 1])) port = Number(args[++i]);
    else if (args[i] === "--email" && /^[^\s@]+@[^\s@]+$/.test(args[i + 1] ?? "")) email = args[++i].toLowerCase();
    else throw new Error("사용법: npm run dev:admin-login -- [--check] [--port 3100|3200] [--email 관리자메일]");
  }
  return { port, dryRun, email };
}

async function openLocalBrowser(url) {
  if (process.platform !== "win32") throw new Error("이 명령은 Windows 로컬 PC에서만 사용할 수 있습니다.");
  // Auth token stays inside the browser URL fragment, not HTTP requests or terminal output.
  // URL is internally generated and contains only the hex magic-link token hash.
  return new Promise((resolve, reject) => {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", `start "" "${url}"`], {
      windowsHide: true, stdio: "ignore",
    });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error("기본 브라우저를 열지 못했습니다.")));
  });
}

async function main() {
  if (process.env.CI || process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error("운영·CI 환경에서는 사용할 수 없습니다.");
  }
  const { port, dryRun, email } = options(process.argv.slice(2));
  if (process.platform !== "win32") throw new Error("Windows PC에서만 실행할 수 있습니다.");
  const origin = `http://localhost:${port}`;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error(".env.local의 Supabase 서버/브라우저 설정을 확인해주세요.");
  }

  const response = await fetch(`${origin}/admin`, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error("로컬 개발 서버의 관리자 페이지가 응답하지 않습니다.");
  // Avoid sending credentials to an unrelated service accidentally bound to this port.
  const html = await response.text();
  if (!html.includes("모아이투표")) throw new Error("로컬 OpenVote 개발 서버가 아닙니다.");

  const client = createClient(url, key, {
    db: { schema: "app_open_vote" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: members, error } = await client.from("members")
    .select("auth_user_id,email,role")
    .eq("role", "admin")
    .limit(20);
  if (error || !members) throw new Error("관리자 명부 조회에 실패했습니다.");
  const matches = email ? members.filter(x => x.email?.toLowerCase() === email) : members;
  if (matches.length !== 1) {
    throw new Error(matches.length ? "관리자가 여러 명입니다. --email로 본인 계정을 지정하세요." : "일치하는 OpenVote 관리자가 없습니다.");
  }
  const { data, error: accountError } = await client.auth.admin.getUserById(matches[0].auth_user_id);
  if (accountError || !data?.user || data.user.app_metadata?.app !== "open_vote" || !data.user.email) {
    throw new Error("관리자 계정 인증 정보를 확인할 수 없습니다.");
  }

  if (dryRun) {
    console.log(`로컬 서버 및 관리자 계정 확인 성공 (포트 ${port}). 실제 로그인 토큰을 생성하지 않았습니다.`);
    return;
  }
  const { data: link, error: linkError } = await client.auth.admin.generateLink({
    type: "magiclink", email: data.user.email,
  });
  const token = link?.properties?.hashed_token;
  if (linkError || !token || !/^[A-Za-z0-9_-]{40,128}$/.test(token)) {
    throw new Error(`일회용 로그인 확인증을 만들지 못했습니다 (서버 오류: ${linkError?.code ?? linkError?.status ?? "없음"}, 응답 형식: ${typeof token}, 길이: ${typeof token === "string" ? token.length : 0}).`);
  }
  await openLocalBrowser(`${origin}/admin#gauth=${token}`);
  console.log(`기본 브라우저에서 ${origin}/admin 페이지를 열었습니다. 로그인 상태를 화면에서 확인해주세요.`);
  console.log("일회용 인증 값은 화면·터미널·파일에 출력하거나 저장하지 않았습니다.");
}

main().catch(error => stop(error instanceof Error ? error.message : "로그인 명령 실행 실패"));
