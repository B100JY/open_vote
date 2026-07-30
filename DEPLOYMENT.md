# Open Vote - 프로덕션 배포 가이드

이 문서는 Open Vote 시스템을 프로덕션 환경에 배포하는 방법을 안내합니다.

## 목차

1. [배포 전 확인사항](#1-배포-전-확인사항)
2. [Supabase 프로덕션 설정](#2-supabase-프로덕션-설정)
3. [Next.js 빌드](#3-nextjs-빌드)
4. [웹 호스팅 배포](#4-웹-호스팅-배포)
5. [모니터링 및 유지보수](#5-모니터링-및-유지보수)

---

## 1. 배포 전 확인사항

### 체크리스트

- [ ] Supabase 스키마가 프로덕션에 적용됨
- [ ] 환경 변수가 안전하게 관리됨
- [ ] RLS 정책이 테스트됨
- [ ] **`select app_open_vote.assert_permission_baseline();` 가 통과함**
      (anon/authenticated 의 권한이 `ballots` SELECT 하나뿐인지 확인 — 위반 시 예외)
- [ ] Rate Limiting 이 작동함
- [ ] CSV 다운로드가 작동함
- [ ] 실시간 투표율이 업데이트됨
- [ ] 모든 기능이 테스트됨

> 배포할 엣지 함수는 없습니다. 기표·발급·과금은 Next.js API 라우트가
> 서비스롤로 처리합니다.

### 테스트 항목

```bash
npm test
```

```bash
npm run lint
```

```bash
npm run build
```

---

## 2. Supabase 프로덕션 설정

### 2.1 프로덕션 프로젝트 생성

1. [Supabase](https://supabase.com) 에서 새 프로젝트 생성
2. 개발 환경과 별도의 프로덕션 프로젝트 사용 권장
3. 백업 정책 설정 (Daily backups 권장)

### 2.2 스키마 적용

```bash
# Supabase SQL Editor 에서 실행
# supabase/migrations/003_complete_schema.sql 내용 전체 복사
```

### 2.3 Edge Functions 배포

```bash
# Supabase CLI 로그인
supabase login

# 프로젝트 링크
supabase link --project-ref YOUR_PRODUCTION_PROJECT_REF

# 환경 변수 설정
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# Edge Functions 배포
supabase functions deploy cast_vote
supabase functions deploy generate_voter_codes
```

### 2.4 RLS 정책 검증

```sql
-- RLS 활성화 확인
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN ('elections', 'voter_codes', 'ballots', 'rate_limits', 'audit_logs');

-- 모든 테이블이 true 여야 함
```

---

## 3. Next.js 빌드

### 3.1 환경 변수 설정

Vercel 프로젝트 설정(또는 로컬 `.env.local`)에 등록합니다. `NEXT_PUBLIC_*` 은
브라우저 번들에 포함되므로 공개 정보만 담습니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

서버 전용 키(`SUPABASE_SERVICE_ROLE_KEY`, `OPENVOTE_API_KEY`,
`SIMPLY_NOTIFIER_*`)에는 `NEXT_PUBLIC_` 접두사를 붙이지 마십시오.
전체 목록은 `.env.example` 을 참고하세요.

### 3.2 프로덕션 빌드

```bash
npm ci
```

```bash
npm run build
```

---

## 4. 웹 호스팅 배포

### 옵션 1: Vercel (권장)

```bash
npm install -g vercel
```

```bash
vercel --prod
```

**vercel.json 설정:**
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### 옵션 2: 자체 Node 호스트

`next start` 를 프로세스 관리자(systemd, pm2 등)로 띄우고 Nginx 를 리버스
프록시로 둡니다. 서버 전용 환경 변수는 프로세스 환경에 주입합니다.

```bash
npm ci && npm run build
```

```bash
npm run start
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

`X-Forwarded-For` 를 넘기지 않으면 Rate Limiting 이 모든 요청을 프록시 IP
하나로 집계합니다(`getClientIp`).

> **정적 SPA 호스팅(Firebase Hosting 의 정적 모드, Netlify 정적 배포 등)은
> 쓸 수 없습니다.** 기표·발급·과금이 서버 라우트(`src/app/api/**`)에서
> 서비스롤로 실행되므로 Node 런타임이 필요합니다. 이 키를 브라우저로
> 내보내면 안 됩니다.
>
> 과거 이 문서에 있던 `build/web` 정적 배포 절차는 Flutter Web 시절의
> 것으로, 2026-07-30 에 제거했습니다.

---

## 5. 모니터링 및 유지보수

### 5.1 Supabase 모니터링

1. **Dashboard** → **Logs** 에서 실시간 로그 확인
2. **Database** → **Tables** 에서 데이터 확인
3. **Advisors** → **Security** 에서 권한/RLS 경고 확인
   (`app_open_vote` 항목이 늘어나면 락다운이 흔들린 신호입니다)

### 5.2 주요 메트릭

- **투표 진행률**: `get_election_stats()` 함수로 실시간 확인
- **참여율**: `voter_registry.has_voted` 비율
  (레거시 선거는 `voter_codes.is_used`)
- **권한 기준선**: `select app_open_vote.assert_permission_baseline();`
- **에러율**: 호스팅 로그(Vercel Functions 등)에서 4xx/5xx 응답 모니터링

### 5.3 백업 전략

```sql
-- 매일 백업 (Supabase 자동 백업 활용)
-- 추가 백업이 필요한 경우:

-- 선거 데이터 백업
COPY elections TO '/backups/elections_20240101.csv' WITH CSV HEADER;
COPY voter_codes TO '/backups/voter_codes_20240101.csv' WITH CSV HEADER;
COPY ballots TO '/backups/ballots_20240101.csv' WITH CSV HEADER;
```

### 5.4 장애 대응

#### 인증코드 오류가 많은 경우

```sql
-- Rate Limit 확인
SELECT ip_address, attempt_count, blocked_until
FROM rate_limits
WHERE endpoint = 'cast_vote'
ORDER BY last_attempt_at DESC
LIMIT 10;
```

#### 투표가 집계되지 않는 경우

```sql
-- Edge Function 로그 확인
-- Supabase Dashboard → Edge Functions → cast_vote → Logs

-- ballots 테이블 확인
SELECT COUNT(*) FROM ballots WHERE election_id = 'YOUR_ELECTION_ID';
```

### 5.5 성능 최적화

```sql
-- 인덱스 사용 확인
EXPLAIN ANALYZE
SELECT * FROM voter_codes
WHERE election_id = 'YOUR_ELECTION_ID'
AND is_used = FALSE;

-- 느린 쿼리 로그
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

---

## 6. 보안 체크리스트

### 6.1 환경 변수

- [ ] SUPABASE_URL 이 HTTPS 인가?
- [ ] SUPABASE_ANON_KEY 가 노출되지 않았는가?
- [ ] SUPABASE_SERVICE_ROLE_KEY 가 Git 에 커밋되지 않았는가?
- [ ] .env 파일이 .gitignore 에 추가되었는가?

### 6.2 데이터베이스

- [ ] RLS 가 모든 테이블에 활성화되었는가?
- [ ] voter_codes 에 직접 접근이 차단되었는가?
- [ ] ballots 수정/삭제가 차단되었는가?
- [ ] rate_limits 가 서비스 전용인가?

### 6.3 Edge Functions

- [ ] Rate Limiting 이 작동하는가?
- [ ] CORS 가 적절히 설정되었는가?
- [ ] 에러 핸들링이 적절한가?

### 6.4 프런트엔드

- [ ] HTTPS 만 사용하는가?
- [ ] 인증코드가 UI 에 노출되지 않는가?
- [ ] 에러 메시지가 민감 정보를 노출하지 않는가?

---

## 7. 선거 운영 가이드

### 7.1 선거 생성

1. 관리자 화면에서 새 선거 생성
2. 유권자 수 입력 및 인증코드 생성
3. CSV 다운로드 및 안전한 보관

### 7.2 선거 시작

1. 관리자 → 선거 관리에서 해당 선거 선택
2. "선거 시작" 버튼 클릭
3. 유권자에게 인증코드 배포

### 7.3 투표 모니터링

1. 대시보드에서 실시간 진행률 확인
2. 이상 징후 모니터링 (급격한 투표 증가 등)
3. 문제 발생 시 일시중단 고려

### 7.4 선거 종료

1. 관리자 → 선거 관리에서 "선거 종료" 클릭
2. 결과 화면에서 최종 결과 확인
3. 결과 CSV 다운로드 (필요시)

### 7.5 사후 처리

1. 감사 로그 확인 (`audit_logs` 테이블)
2. 백업 생성
3. 필요시 데이터 아카이브

---

## 8. 문제 해결

### 8.1 "too many attempts" 오류

**원인**: Rate Limiting 발동

**해결**:
```sql
-- Rate Limit 초기화 (신중하게 사용)
UPDATE rate_limits
SET blocked_until = NOW() - INTERVAL '1 hour'
WHERE ip_address = 'PROBLEM_IP';
```

### 8.2 "election not found" 오류

**원인**: 선거 ID 가 잘못되었거나 삭제됨

**해결**:
```sql
-- 선거 상태 확인
SELECT id, name, status FROM elections WHERE id = 'YOUR_ELECTION_ID';
```

### 8.3 실시간 업데이트가 안 됨

**원인**: Supabase Realtime 설정 누락

**해결**:
```sql
-- Realtime 활성화 확인
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- 누락된 테이블 추가
ALTER PUBLICATION supabase_realtime ADD TABLE elections;
ALTER PUBLICATION supabase_realtime ADD TABLE ballots;
ALTER PUBLICATION supabase_realtime ADD TABLE voter_codes;
```

---

## 9. 연락처 및 지원

- **GitHub Issues**: [이슈 제기](https://github.com/your-org/open-vote/issues)
- **문서**: [README.md](../README.md)
- **Supabase 문서**: https://supabase.com/docs

---

**마지막 업데이트**: 2024-01-01
**버전**: 1.0.0
