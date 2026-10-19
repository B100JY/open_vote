import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  isNozolinkIntegrationEnabled,
  rejectDisabledNozolinkIntegration,
} from "../nozolink-integration.ts";

const KEY = "OPENVOTE_ENABLE_NOZOLINK_INTEGRATION";

test("노조링크 연동은 설정이 없거나 true 외의 값이면 비활성화", async () => {
  const previous = process.env[KEY];
  try {
    delete process.env[KEY];
    assert.equal(isNozolinkIntegrationEnabled(), false);
    const denied = rejectDisabledNozolinkIntegration();
    assert.ok(denied);
    assert.equal(denied.status, 410);
    assert.equal((await denied.json()).error, "integration_disabled");

    process.env[KEY] = "false";
    assert.equal(isNozolinkIntegrationEnabled(), false);
    process.env[KEY] = "TRUE";
    assert.equal(isNozolinkIntegrationEnabled(), false);

    process.env[KEY] = "true";
    assert.equal(isNozolinkIntegrationEnabled(), true);
    assert.equal(rejectDisabledNozolinkIntegration(), null);
  } finally {
    if (previous === undefined) delete process.env[KEY];
    else process.env[KEY] = previous;
  }
});

test("모든 외부 연동 API는 요청 인증·DB 접근 전에 중단 검사를 수행", () => {
  const root = path.join(process.cwd(), "src", "app", "api", "v1");
  const routes: string[] = [];
  function collect(dir: string) {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) collect(p);
      else if (ent.name === "route.ts") routes.push(p);
    }
  }
  collect(root);
  assert.equal(routes.length, 7, "새 연동 API가 생기면 보호 여부를 검토할 것");
  for (const file of routes) {
    const source = readFileSync(file, "utf8");
    const check = source.indexOf("rejectDisabledNozolinkIntegration()");
    const auth = source.indexOf("await authenticateApiClient(");
    assert.ok(check > 0, file);
    assert.ok(auth < 0 || check < auth, file);
  }
  const handoff = readFileSync(
    path.join(process.cwd(), "src", "app", "auth", "handoff", "page.tsx"),
    "utf8",
  );
  assert.match(handoff, /if \(!isNozolinkIntegrationEnabled\(\)\)/);
});
