# KCM Freeze 전 UI·Release Hardening — 2026-10-06

기준 main `4808bc135c4efb6d3234afefbf273306ee4f594f`. 기존 polish commit `c1aaba00453a4101e5b94be6804980608f106f1e`와 변경 내용을 보존해 같은 `release/kcm-final-polish`에서 추가 작업했다. 시작 working tree는 clean이었다. main·RC 브랜치·Render·실제 환경변수·외부 데이터는 변경하지 않는다.

## 메뉴별 상태와 화면 밀도

| 메뉴 | 상태 | 변경 전 → 변경 후 | 남은 검증 |
| --- | --- | --- | --- |
| home | 완료 | 본문11px·큰 상하 간격 → 본문12px/이름13px, 제목·카드·행 간격 축소. 5행 카드 하단 1920 화면 약748→699px, 1366 화면 약742→695px | 실제 통화는 내일 |
| appointments | 완료 | 우측 상세 높이에 맞춘 목록 하단 빈 공간 → 목록 자체 높이로 배치. 1920/1366 목록 하단 약1015/1030→792px. 본문12px/고객13px/직원·시간12px | 없음(현재 프런트 범위) |
| customers | 외부 검증 필요 | 위험도와 ID의 강조가 유사 → 최신/개별 위험도13px, 보조 ID11px·긴 값 줄바꿈. 기록·위험도·전송 상태 우선 | customer_9999 반복 통화/실제 저장 |
| support | 완료 | 넓은 표·작은 글자 → 최소 표 폭980px, 이름13px/신호10px/행12px. 1366 모든 열·5행 표시, 가이드 간격 축소 | 실제 통화 데이터 확인 |
| products | 완료 | 작은 이름·요금/긴 여백 → 이름·월정액13px, 본문12px, 목록/선택 상세 간격 축소. 기존4탭·검색·비교 유지 | 없음(참고 조회 자료) |
| inventory | 스마트 재고 병합 필요 | 작은 품명·수량 안내 → 이름12px/보조10px만 조정. component/interface/data/route는 추가 변경 없음 | 팀원 코드 병합 |
| marketing | 완료 | 긴 메시지로 행 높이 증가 → 이름13px/본문12px, 요약·메시지2줄 preview, 상세에서 전체 조회. 최소 표 폭1040px | 실제 SMS는 범위 제외 |
| stores | 완료 | 작은 매장·직원 이름/리뷰 → 핵심13px/본문12px, 선택·리뷰 여백2~4px 축소. 긴 리뷰의 기존 내부 스크롤 유지 | 없음(참고 조회 자료) |
| retell-test | 외부 검증 필요 | 1366×768에서804px 높이 →768px, 중앙 전화 UI 유지. 390×844/320×720 핵심 UI가 한 화면에 표시 | 실제 음성·장치·Monitor |

화면 바깥의 가로 넘침은 없다. 1920/1366 데스크톱 표는 가로 스크롤 없이 표시되고 모바일 표는 내부 스크롤을 유지한다. 긴 상담·리뷰·제품 비교·전문은 필요한 스크롤을 허용한다. 홈의 하단 예약/기타 영역까지 한 화면에 강제로 압축하지 않는다.

## Typography 및 공통 간격

- 고객·직원·상품·매장 핵심 이름12~13px, 테이블 본문12px/헤더11px, 상태·위험 배지10~11px, 주요 버튼11~12px, 보조/ID10~11px.
- 1366px의 9개 화면에서 렌더된 사용자 글자를 확인했으며8px 이하 텍스트는 없었다. 전체 font-size 일괄 확대나 화면 배율 조정은 하지 않았다.
- topbar76→72px(좁은 화면65→62px), page heading 아래24→20px, card heading18/15→14/12px, 표 행64/59→56px 수준으로 조정했다. 이름을 키운 만큼 padding/gap을 줄였다.
- 모바일 주요 입력·버튼40px, 기존 전화 버튼 크기 유지. modal header는 내부 스크롤 중에도 고정되며 닫기/키보드 포커스가 가려지지 않는다. safe-area/reduced-motion을 유지했다.

## 문구 및 기능 보존

기존 polish의 ‘샘플/데모/개발 단계’ 노출 정리를 보존한다. 대표 변경은 ‘샘플 초기화→화면 초기화’, ‘데모 발송→안내 처리’, ‘발송 완료→처리 완료’, 고객 진단 정보 완전 숨김이다. 원본 고정 ID `DEMO-R...`, 내부 변수/테스트/정책 버전은 유지한다.

의도적으로 남긴 작은 안내는 초기화/보관 범위, 실제 문자·관리자 알림을 보내지 않음, 공식 상품정보가 아닌 참고 자료, n8n 응답과 DB 저장의 구분이다. 실제로 하지 않는 동작을 운영 기능처럼 표현하지 않는다.

추가 기능 변경은 오류 표시만이다. 서버 `call.error`/알 수 없는 최종화 사유를 그대로 노출하지 않으며 알려진 보류 사유는 구분한다. 고객의 서버 인증/일반 연결 실패를 마이크 권한 거부로 잘못 안내하던 표시 함수도 수정했다. 원본 오류·통화·분석·상태 함수는 변경하지 않았다.

Retell Web Call/Monitor/SSE/전문/5신호/RMS 임계값·상태 머신/위험도·위협 최소값·99상한/audio finalization/IDs/n8n payload·1회 전송/지원·예약·사후관리 상태 함수는 그대로다. 서버·환경설정·패키지/lockfile 수정은 없다.

## 실행 검증

- `npm.cmd run check`: **357/357 통과**, 실패/건너뜀0. 기존353 유지+오류 원문 차단3+고객 오류 구분1. 프런트 `tsc --noEmit`·백엔드 `tsc -p tsconfig.server.json`·Vite production build 성공.
- 기존 Retell SDK 약597kB 청크 경고와 Node MockTimers 경고만 남는다. 불필요한 라이브러리/청크 재구성은 하지 않았다.
- 실제 `.env`를 읽지 않는 격리 localhost5190에서 검증했다. SDK/마이크/Webhook은 대역이고 상태·분석·SSE는 기존 코드다. Production Retell/n8n/Supabase는 호출하지 않았다. 사용자 저장 데이터·실행 서버는 초기화하지 않았다.
- 9개 경로×1920×1080/1366×768/390×844/320×720의36개 조합을 측정·캡처했다. 로딩/직전 화면이 찍힌 캡처는 별도 브라우저 호출로 재촬영하고 시각 검토했다. 모든 route 직접 진입·새로고침·title 정상, 정상 검증 탭 콘솔 오류0.
- 홈: 12건 목록5/5/2행, 페이지 경계·6건 축소 보정, 필터/빈 결과/5건 이하 페이지 UI 숨김 확인.
- 상담지원: 전체/현재/종료/미완료 지원 필터, C-003 시작→지원 요청→확인→완료→재요청→초안 유지/완료 확인 취소→완료(기존 독립14점)→완료 후 남은 지원 처리. 최초 시작 시각·이전 지원 이력 유지.
- 마케팅: C-003 완료 기록→메시지 수정→확인→안내 처리→기록 재열기. 메뉴 이동 후 메시지/처리 시각 유지. 실제 SMS 없음.
- 예약: 김서연 예약 선택→시작→결과→완료→결과 수정→2건 이력. 최초 시작/완료 시각·완료 상태/집계 유지. 격리 자료만 사용.
- 고객: 동일 격리 고객의 최신0점/과거4·2점, 개별 call/consultation/customer/store ID·전문·전송 상태 확인.
- 상품: 검색/빈 결과/자사·타사 비교/4탭, 매장: 상단 링크·매장 선택·직원2탭·리뷰 확인. 재고: 기존 조회 유지.
- 고객 전화: 모의 연결 중→통화·시간→종료→다시 상담→페이지 이탈. 보조 track/AudioContext 시작1/1, 종료/이탈0/0 확인. 실제 음성 통화 성공으로 해석하지 않는다.
- 실패: 백엔드503, Retell 연결 오류, 마이크 권한 거부, SSE 강제 끊김 후 재연결, n8n failed 시 최종 점수/전문 보존, 빈 통화/예약·검색 결과. 오류 canary/Authorization/raw URL은 사용자 화면에 노출되지 않았다.
- 긴 브리핑320px dialog 폭271px/scrollWidth271px, 하단으로 이동해도 header 상단26px·닫기 접근 가능. 1366px 통화 기록과 상담 결과/메시지 modal도 확인.
- 독립 HTML 갱신 후 HTTP 직접 접속: 고객명13px·5행·상품 비교 확인, 오류0. file:// 및 독립 HTML 실제 통화는 미검증.

캡처와 명령 로그는 Git 제외 `.cache/final-polish/`에 보관한다.

## Secret scan / 병합 경계

추적 텍스트127개+신규3개, 총130개 검사에서 미해결 실제 비밀값 의심0건, 비밀 파일 추적0건. 검출 후보13건은 테스트 placeholder, 동적 참조/빈 값2건은 정상. 실제 `.env`/비밀 파일을 열거나 출력하지 않았다. 개인키·API키/JWT·자격증명 URL·Webhook 하드코딩/ignore 규칙을 확인했다. 자동 패턴 검사는 모든 형태의 비밀값 부재를 보증하지 않으며 Git 전체 이력/실제 키 대조는 이번 범위 밖이다.

스마트 재고 병합 시 기존 polish의 `InventoryPanel.tsx`/`SecondaryPages.tsx` 표시 문구와 공통 `src/styles.css`의 작은 typography 규칙을 확인한다. 이번 추가에서는 재고 JSX/interface/data를 변경하지 않았다. 팀원 기능을 우선 보존한다.

## 추가 변경 파일

`src/styles.css`, `src/components/AppointmentList.tsx`, `src/pages/SupportPage.tsx`, `MarketingPage.tsx`, `ProductsPage.tsx`, `src/live/LiveConsultations.tsx`, `LiveRiskSignals.tsx`, `live-calls.css`, 신규 `liveNotices.ts`, `src/dev/customerCopy.ts`, `retell-test.css`, `tests/domain.test.ts`, `uiText.test.ts`, 신규 `liveNotices.test.ts`, `00_KCM_미리보기.html`, `STATUS.md`, `docs/FINAL_POLISH.md`, 이 문서. 이전 commit의 변경 파일은 `FINAL_POLISH.md` 목록을 유지한다.

## 내일 사람이 할 작업

1. 실제 Retell 음성·보조 마이크·고성·Monitor·SSE 확인.
2. customer_9999 반복 E2E와 n8n 실행 확인.
3. Supabase consultations / risks / ai_transcription / ai_summary 연결·저장 확인.
4. 스마트 재고 코드 병합 후 전체 최종 회귀.
5. 승인된 최종 코드 main 반영·Render 최종 배포.
6. 시연 영상 촬영.

이번 브랜치만 commit/push하며 main/RC/Render 설정을 변경하거나 실제 외부 검증을 실행하지 않는다.
