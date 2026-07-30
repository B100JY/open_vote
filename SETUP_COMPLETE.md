# ✅ Open Vote 설정 완료!

## 설정 완료 항목

### 1. 데이터베이스
- ✅ 프로젝트 링크: `zxrwlwhbcivwpvmktuoj`
- ✅ 마이그레이션 적용: 001, 002, 003 (모두 applied)
- ✅ 테이블 생성 완료:
  - `elections` (선거 정보)
  - `voter_codes` (인증코드)
  - `ballots` (투표용지)
  - `rate_limits` (Rate Limiting)
- ✅ 함수 생성 완료:
  - `cast_anonymous_vote()` (익명 투표 처리)
  - `generate_voter_codes_batch()` (인증코드 생성)
  - `get_vote_results()` (결과 집계)
  - `get_election_stats()` (통계)
- ✅ RLS 정책 활성화
- ✅ Realtime 설정 완료

### 2. Edge Functions
- ✅ `cast_vote` 배포 완료
- ✅ `generate_voter_codes` 배포 완료
- ✅ 환경 변수 자동 설정

### 3. 데이터베이스 연결
- ✅ REST API 연결 확인
- ✅ 테이블 접근 가능 확인

---

## 🎉 테스트 시작하기

### 1. 앱 실행

```bash
npm run dev
```

`http://localhost:3100` 에서 열립니다.

### 2. 관리자 - 투표 생성

1. 우측 상단 **"관리자"** 버튼 클릭
2. 투표 정보 입력:
   - **투표명**: `테스트 선거`
   - **유권자 수**: `10`
   - **후보자**: `후보 1`, `후보 2` 추가
3. **"투표 생성 및 인증코드 발급"** 클릭
4. CSV 다운로드 (인증코드 확인)

### 3. 유권자 - 투표하기

1. 홈으로 돌아가서 **"투표하기"** 클릭
2. **"테스트 선거"** 선택
3. CSV 에서 인증코드와 전화번호 뒷자리 입력
4. 후보자 선택 후 **"투표하기"** 클릭
5. **"투표 완료"** 화면 확인

### 4. 결과 확인

1. **"대시보드"** - 실시간 투표 진행률 확인
2. **"결과"** - 후보자별 득표 현황 확인

---

## 🔗 빠른 링크

- **Supabase 대시보드**: https://supabase.com/dashboard/project/zxrwlwhbcivwpvmktuoj
- **Edge Functions**: https://supabase.com/dashboard/project/zxrwlwhbcivwpvmktuoj/functions
- **Table Editor**: https://supabase.com/dashboard/project/zxrwlwhbcivwpvmktuoj/editor
- **SQL Editor**: https://supabase.com/dashboard/project/zxrwlwhbcivwpvmktuoj/sql

---

## 📞 문제 발생 시

### "인증코드 또는 전화번호 뒷자리를 확인해주세요"

→ CSV 파일의 인증코드와 전화번호 뒷자리를 정확히 입력하세요.

### "이 선거는 현재 진행 중이 아닙니다"

→ 관리자 → 선거 관리에서 선거 상태를 "진행중"으로 변경하세요.

### Edge Function 오류

```bash
# 함수 재배포
supabase functions deploy cast_vote
supabase functions deploy generate_voter_codes
```

### 데이터베이스 초기화

```sql
-- 전체 초기화 (주의: 모든 데이터 삭제)
DROP TABLE IF EXISTS ballots, voter_codes, elections, rate_limits CASCADE;
DROP FUNCTION IF EXISTS cast_anonymous_vote, generate_voter_codes_batch, get_vote_results, get_election_stats;
```

그리고 `supabase/setup.sql` 을 다시 실행하세요.

---

**설정일**: 2026-05-07
**프로젝트**: zxrwlwhbcivwpvmktuoj
