# v0.3 변경 내역

기준: 공유된 KCM v0.2 ZIP. 사용자 PC나 연결된 외부 서비스는 수정하지 않았습니다.

- `src/components/Layout.tsx`: 상단/좌측 문구·안내 정리, 고정 메뉴, 새 프로필 연결.
- `src/components/ProfileMenu.tsx`: 새 비모달 정보창·프로필 버튼·로그아웃 안내.
- `src/components/Icon.tsx`: 별/로그아웃 아이콘 추가.
- `src/App.tsx`: 날짜 앞 문구 삭제, 제거된 레이아웃 도움말 prop 정리.
- `src/data/workspaceMockData.ts`: 현재 매장/직원의 공통 UI 예시.
- `src/data/mockData.ts`: 현재 직원 객체와 예약 담당자 일치.
- `src/data/directoryMockData.ts`: 현재 매장/직원의 이름·직급·평점 일치.
- `src/lib/profile.ts`, `src/types.ts`: 이름/성별/평점 표시 모델과 함수.
- `src/styles.css`: 프로필·고정 사이드바의 반응형 스타일. 폰트 유지.
- `tests/domain.test.ts`: 프로필·외자·색상·평점·샘플 일관성 테스트 추가.
- `package.json`: 버전/설명만 수정. 의존성 변경 없음.
- 독립 HTML·안내·명세·작업 지침·Codex 요청문·QA 자료 갱신.

이번에 구현하지 않은 것: 실제 로그인/로그아웃, API/DB 연동, 상품·재고 업무 확장, 폰트 변경.
