import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 공유 auth 프로젝트 가드 — 앱 간 파괴 행위의 부재를 고정한다.
 *
 * 이 Supabase 프로젝트(vvpmrzwjhzsjtieoweky)의 auth.users·세션·신원을
 * 노조링크·Cowork·OpenVote 가 공유한다. 한 앱의 호출이 다른 앱 사용자를
 * 즉시 쫓아내거나 계정을 파괴할 수 있다.
 *
 * SDK 메서드명만 검사하면 부족하다: 같은 행위를 admin REST 엔드포인트에
 * fetch 로 직접 호출하면 이름 검사를 그대로 통과한다(실제로 형제 앱에서
 * 그런 코드가 전수 grep 을 통과한 사례가 있다). 그래서 양쪽 형태를 다 막는다.
 *
 * 이 테스트가 실패하면 "규칙을 우회할 방법"이 아니라 "정말 필요한가"를 먼저
 * 검토하라. 필요하다면 3자 합의 후 여기 예외를 명시적으로 추가한다.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(HERE, "..", "..");
const SELF = path.resolve(HERE, "shared-auth-guard.test.ts");

type Rule = {
  label: string;
  pattern: RegExp;
  why: string;
};

const RULES: Rule[] = [
  {
    label: "인자 없는 signOut()",
    pattern: /\.signOut\s*\(\s*\)/g,
    why:
      "signOut() 의 기본 scope 는 'global' 이라 그 사용자의 노조링크·Cowork 세션까지 " +
      "전 기기에서 끊는다. 계정 전환이면 signOut({ scope: 'local' }) 을 쓸 것.",
  },
  {
    label: "signOut({ scope: 'global' })",
    pattern: /\.signOut\s*\(\s*\{[^}]*scope\s*:\s*["']global["']/g,
    why:
      "전역 로그아웃은 다른 앱 사용자를 즉시 쫓아낸다. 정말 필요하면 사용자 확인 " +
      "대화상자 뒤에 두고, 이 테스트에 예외를 명시할 것.",
  },
  {
    label: "파괴적 admin SDK 호출",
    pattern: /\b(unlinkIdentity|deleteUser|updateUserById)\s*\(/g,
    why:
      "계정 삭제·신원 해제·이메일/비밀번호 변경은 공유 auth.users 에 대한 앱 간 " +
      "파괴 행위다. OpenVote 에는 이런 경로가 없어야 한다.",
  },
  {
    label: "admin REST 엔드포인트 직접 호출",
    pattern: /\/auth\/v1\/admin\//g,
    why:
      "SDK 를 우회해 admin REST 를 직접 부르면 메서드명 검사를 통과한다. " +
      "OpenVote 는 admin API 를 SDK 로만 쓰므로 이 경로가 나타날 이유가 없다.",
  },
  {
    label: "logout REST 엔드포인트 직접 호출",
    pattern: /\/auth\/v1\/logout/g,
    why: "scope 파라미터 없이 부르면 전역 로그아웃이다. 위 signOut 규칙과 같은 이유로 금지.",
  },
];

/** src/ 아래 .ts/.tsx 를 모두 모은다(이 테스트 자신은 제외 — 규칙 문자열을 품고 있다). */
function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSources(full, out);
    } else if (/\.tsx?$/.test(entry.name) && path.resolve(full) !== SELF) {
      out.push(full);
    }
  }
  return out;
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

test("공유 auth 프로젝트에 대한 앱 간 파괴 행위가 없다", () => {
  const files = collectSources(SRC_ROOT);
  assert.ok(files.length > 0, "src/ 에서 소스 파일을 찾지 못했습니다");

  const violations: string[] = [];

  for (const file of files) {
    const content = readFileSync(file, "utf8");
    const rel = path.relative(SRC_ROOT, file).replace(/\\/g, "/");

    for (const rule of RULES) {
      for (const match of content.matchAll(rule.pattern)) {
        violations.push(
          `src/${rel}:${lineOf(content, match.index)} — ${rule.label}\n    ${rule.why}`,
        );
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `공유 auth 파괴 행위 ${violations.length}건:\n\n${violations.join("\n\n")}\n`,
  );
});

test("로그아웃 두 곳이 실제로 scope: local 을 넘긴다", () => {
  // 위 규칙은 "나쁜 형태의 부재"만 본다. 호출 자체가 사라져도 통과하므로,
  // 의도한 형태가 살아 있는지 양성으로 확인한다.
  const targets = [
    "components/admin-gate.tsx",
    "app/vote/[id]/auth/auth-client.tsx",
  ];

  for (const rel of targets) {
    const content = readFileSync(path.join(SRC_ROOT, rel), "utf8");
    assert.match(
      content,
      /\.signOut\s*\(\s*\{\s*scope:\s*["']local["']\s*\}\s*\)/,
      `src/${rel} 에 signOut({ scope: "local" }) 이 없습니다`,
    );
  }
});
