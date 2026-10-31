# 로그인 링크 위치 변경

- 하단 ‘운영자 로그인’ 링크를 제거하고 상단 ‘투표 생성’ 바로 앞에 LogIn 아이콘 링크를 배치했다.
- 기존과 같은 `/admin` 로그인 진입점을 사용한다. 인증·세션·권한 처리 변경 없음.
- 아이콘은 접근성 이름·툴팁 ‘로그인’을 제공하고, 모바일에서는 두 버튼을 한 묶음으로 우측 상단에 배치한다.
- ESLint·배포 프로덕션 빌드 통과. 운영 브라우저에서 로그인 링크 `/admin`, 하단 링크 0개 및 배치를 확인했다. 실제 로그인 제출은 수행하지 않았다.
- [화면](header-login-2026-10-30/home.png).

운영 배포 `dpl_AfQ2Dwu4mLtPrsHFrSyF9TK2H6qe`, https://open-vote-iz6zwoocj-bjy-space.vercel.app → https://vote.bluerdot.net 반영 완료. DB 변경·커밋·푸시 없음. 기존 미커밋 작업 보존.
