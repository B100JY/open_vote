/**
 * Local desktop-only administrator sign-in.
 * Uses the existing, already-authorized OpenVote admin; does not add a web auth bypass.
 *
 * Usage: npm run dev:admin-login
 *        npm run dev:admin-login -- --check
 *        npm run dev:admin-login -- --diagnose
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
  let diagnose = false;
  let email = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--check") dryRun = true;
    else if (args[i] === "--diagnose") diagnose = true;
    else if (args[i] === "--port" && ["3100", "3200"].includes(args[i + 1])) port = Number(args[++i]);
    else if (args[i] === "--email" && /^[^\s@]+@[^\s@]+$/.test(args[i + 1] ?? "")) email = args[++i].toLowerCase();
    else throw new Error("사용법: npm run dev:admin-login -- [--check] [--port 3100|3200] [--email 관리자메일]");
  }
  if (dryRun && diagnose) throw new Error("--check와 --diagnose는 동시에 사용할 수 없습니다.");
  return { port, dryRun, diagnose, email };
}

async function copyLoginLinkToClipboard(url) {
  // GUI browsers (including ChatGPT's in-app browser) do NOT share auth state.
  // Never force-open the default browser: the user must paste into the SAME browser they are using.
  // Send the token through stdin, not the command line / process list / terminal history.
  return new Promise((resolve, reject) => {
    const child = spawn("clip.exe", [], { windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(
      stderr ? "Windows 클립보드에 접근할 수 없습니다. 사용자 데스크톱 세션에서 실행해 주세요." : "로그인 주소를 클립보드에 복사하지 못했습니다."
    )));
    child.stdin.on("error", reject);
    child.stdin.end(url);
  });
}

async function main() {
  if (process.env.CI || process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error("운영·CI 환경에서는 사용할 수 없습니다.");
  }
  const { port, dryRun, diagnose, email } = options(process.argv.slice(2));
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
  if (diagnose) {
    // The same one-use exchange that AdminGate performs, without ever printing the token.
    const anonymous = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: session, error: verifyError } = await anonymous.auth.verifyOtp({
      token_hash: token, type: "magiclink",
    });
    if (verifyError || !session.session?.access_token) {
      throw new Error("일회용 코드 확인에 실패했습니다. Supabase 인증 설정을 확인해 주세요.");
    }
    const check = await fetch(`${origin}/api/auth/me`, {
      headers: { Authorization: `Bearer ${session.session.access_token}` },
      signal: AbortSignal.timeout(7000),
    });
    const member = await check.json().catch(() => null);
    if (!check.ok || member?.member?.role !== "admin") {
      throw new Error("로그인 코드로 관리자 권한을 확인하지 못했습니다.");
    }
    console.log("일회용 코드 발급 → Supabase 세션 생성 → 로컬 관리자 API 검사 성공.");
    console.log("검사에 사용한 일회용 코드는 소모됐으며 노출하거나 저장하지 않았습니다.");
    return;
  }

  await copyLoginLinkToClipboard(`${origin}/admin#gauth=${token}`);
  console.log("일회용 로컬 관리자 로그인 주소를 Windows 클립보드에 복사했습니다.");
  console.log(`지금 사용 중인 동일한 브라우저의 주소창에서 Ctrl+V → Enter를 눌러 주세요. (${origin}/admin)`);
  console.log("※ 다른 브라우저로 열면 로그인 상태가 그 브라우저에만 저장됩니다.");
  console.log("※ 클립보드의 링크는 일회용 인증 정보입니다. 다른 곳에 붙여넣거나 공유하지 마세요.");
}

main().catch(error => stop(error instanceof Error ? error.message : "로그인 명령 실행 실패"));
