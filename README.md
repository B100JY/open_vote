# Open Vote (오픈 보트)

> 노동조합을 위한 투명하고 공정한 오픈소스 투표 시스템

[![Flutter](https://img.shields.io/badge/Flutter-3.10+-02569B?logo=flutter)](https://flutter.dev)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🗳️ 소개

Open Vote 는 노동조합의 민주적 의사결정을 지원하기 위해 설계된 **투명하고 공정한 오픈소스 투표 시스템**입니다.

### 핵심 원칙

- ✅ **직접 투표**: 각 유권자가 직접 인증하여 투표
- ✅ **비밀 투표**: 누구도 어떤 후보에게 투표했는지 알 수 없음
- ✅ **무기명 투표**: 인증코드와 투표용지는 완전히 분리됨
- ✅ **투명성**: 실시간 투표 진행률 공개

---

## 🚀 주요 기능

### 유권자
- [x] 6 자리 인증코드 + 전화번호 뒷자리로 본인인증
- [x] 간편한 후보자 선택 인터페이스
- [x] 투표 전 최종 확인 다이얼로그
- [x] 실시간 투표 진행률 확인

### 관리자
- [x] 쉬운 투표 생성 (선거명, 후보자, 유권자 수)
- [x] 인증코드 일괄 생성 및 CSV 다운로드
- [x] 실시간 투표 현황 모니터링
- [x] 자동 개표 및 결과 집계

### 보안
- [x] Rate Limiting (5 회 실패 시 15 분 잠금)
- [x] Row Level Security (RLS) 로 데이터 보호
- [x] Edge Function 에서 원자적 투표 처리
- [x] 감사 로그 (Audit Log) 기록

---

## 🏗️ 기술 아키텍처

```
┌─────────────────┐     ┌──────────────────────────┐
│   Flutter Web   │────▶│   Supabase Backend       │
│   (Frontend)    │     │                          │
└─────────────────┘     │  ┌────────────────────┐  │
                        │  │ Edge Functions     │  │
                        │  │ - cast_vote        │  │
                        │  │ - generate_codes   │  │
                        │  └────────────────────┘  │
                        │                          │
                        │  ┌────────────────────┐  │
                        │  │ PostgreSQL DB      │  │
                        │  │ - elections        │  │
                        │  │ - voter_codes      │  │
                        │  │ - ballots (익명)   │  │
                        │  └────────────────────┘  │
                        └──────────────────────────┘
```

### 기술 스택

| 영역 | 기술 |
|------|------|
| **Frontend** | Flutter 3.10+, Dart |
| **Backend** | Supabase (PostgreSQL, Edge Functions) |
| **State Management** | Riverpod |
| **Routing** | GoRouter |
| **Dependency Injection** | GetIt |
| **Realtime** | Supabase Realtime |

---

## 📦 빠른 시작

### 1. Supabase 프로젝트 설정

```bash
# 1. https://supabase.com 에서 새 프로젝트 생성
# 2. SQL Editor 에서 스키마 실행
# supabase/migrations/003_complete_schema.sql 내용 붙여넣기
```

### 2. Edge Functions 배포

```bash
# Supabase CLI 설치
npm install -g supabase

# 로그인 및 프로젝트 링크
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Edge Functions 배포
supabase functions deploy cast_vote
supabase functions deploy generate_voter_codes

# 환경 변수 설정
supabase secrets set SUPABASE_URL=https://YOUR_PROJECT.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

### 3. Flutter 앱 실행

```bash
# 의존성 설치
flutter pub get

# 개발 서버 실행 (환경 변수 교체 필요)
flutter run -d chrome \
  --dart-define=SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

---

## 📁 프로젝트 구조

```
lib/
├── main.dart                     # 앱 진입점
├── core/                         # 공통 모듈
│   ├── constants/                # 상수 정의
│   ├── theme/                    # 테마 설정
│   └── utils/                    # 유틸리티
├── data/                         # 데이터 계층
│   ├── models/                   # 데이터 모델
│   ├── repositories/             # 리포지토리
│   └── services/                 # 서비스
├── features/                     # 기능별 모듈
│   ├── admin/                    # 관리자 기능
│   ├── auth/                     # 인증 기능
│   ├── dashboard/                # 대시보드
│   ├── results/                  # 결과 조회
│   └── vote/                     # 투표 기능
└── injection/                    # DI 설정

supabase/
├── edge-functions/               # Supabase Edge Functions
│   ├── cast_vote/                # 투표 처리
│   └── generate_voter_codes/     # 인증코드 생성
├── migrations/                   # DB 스키마
│   ├── 001_initial_schema.sql
│   ├── 002_functions.sql
│   └── 003_complete_schema.sql
└── README.md                     # Supabase 설정 가이드
```

---

## 🔐 무기명성 보장 설계

Open Vote 의 가장 중요한 설계 원칙은 **무기명 투표**입니다.

### 데이터베이스 설계

```sql
-- voter_codes 테이블 (인증코드)
CREATE TABLE voter_codes (
    id UUID,
    election_id UUID,      -- 선거 ID
    code TEXT,             -- 6 자리 인증코드
    phone_suffix TEXT,     -- 전화번호 뒷자리
    is_used BOOLEAN        -- 사용 여부
    -- ❌ ballots 와의 FK 없음
);

-- ballots 테이블 (투표용지)
CREATE TABLE ballots (
    id UUID,
    election_id UUID,      -- 선거 ID
    selected_candidate TEXT  -- 선택한 후보자
    -- ❌ voter_codes 와의 FK 없음
);
```

### 원자적 투표 처리

```typescript
// Edge Function (cast_vote) 에서 단일 트랜잭션으로 처리
const result = await supabase.rpc('cast_anonymous_vote', {
  p_election_id: election_id,
  p_code: code,
  p_phone_suffix: phone_suffix,
  p_selected_candidate: selected_candidate
});

// DB 함수 내부:
// 1. 인증코드 검증 (존재 + 미사용 + 선거 활성)
// 2. 인증코드 사용 완료 처리 (UPDATE voter_codes SET is_used = TRUE)
// 3. 투표용지 삽입 (INSERT INTO ballots)
// ❌ 2 번과 3 번 사이에 어떤 연결 고리도 없음
```

### 검증

```sql
-- voter_codes 와 ballots 간의 FK 관계 확인 (없어야 함!)
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND tc.table_name IN ('voter_codes', 'ballots');

-- 결과: ballots.election_id 만 elections.id 를 참조해야 함
```

---

## 📸 스크린샷

### 관리자 화면
```
[투표 생성]
- 선거명: 2024 년 정기 국회의원 선거
- 유권자 수: 100
- 후보자: 홍길동, 김철수, 이영희
[투표 생성 및 인증코드 발급]
```

### 유권자 인증 화면
```
[본인 확인]
인증코드: [______]
전화번호 뒷자리: [____]
[인증하기]
```

### 투표 화면
```
[후보자 선택]
◯ 홍길동
◯ 김철수
◯ 이영희
[투표하기]
```

---

## 🧪 테스트

### 단위 테스트

```bash
flutter test
```

### 통합 테스트

1. Supabase 로컬 인스턴스 실행
2. 테스트용 선거 생성
3. 인증코드로 투표 테스트
4. 익명성 검증

---

## 📋 체크리스트

### 배포 전 확인사항

- [ ] Supabase 스키마가 적용됨
- [ ] Edge Functions 이 배포됨
- [ ] 환경 변수가 설정됨
- [ ] RLS 정책이 테스트됨
- [ ] Rate Limiting 이 작동함
- [ ] CSV 다운로드가 작동함
- [ ] 실시간 투표율이 업데이트됨

### 보안 체크리스트

- [ ] service_role 키가 노출되지 않음
- [ ] voter_codes 에 직접 접근 불가
- [ ] ballots 수정/삭제 불가
- [ ] HTTPS 만 사용
- [ ] 인증코드가 안전하게 배포됨

---

## 🤝 기여하기

이슈 및 PR 은 언제나 환영입니다!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

## 🙏 감사의 말

- [Flutter](https://flutter.dev) - 크로스플랫폼 UI 프레임워크
- [Supabase](https://supabase.com) - 오픈소스 Firebase 대안
- [Riverpod](https://riverpod.dev) - 상태 관리

---

## 📞 문의

- GitHub Issues: [이슈 제기](https://github.com/your-org/open-vote/issues)
- Email: your-email@example.com

---

**Made with ❤️ for Labor Unions**
