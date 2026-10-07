# KCM 작업 상태 — v0.3 / 2026-10-06

## 실시간 통화 사전 브리핑 / 2026-10-06

- clean `integration/kcm-final-release` / `4d445ed59a42c674ec582213089be3e5320fc7bb`에서 `feature/live-call-briefing`을 생성했습니다. 기본 checkout의 사용자 STATUS 변경/deliverables는 보존했습니다. main/Render·실제 .env·외부 데이터는 변경하지 않습니다.
- `GET /api/live-briefing/:customerId?call_id=:callId`를 기존 SELECT 전용 provider로 추가했습니다. 현재 메모리 통화의 고객/매장/시작 시각과 상담 ID를 서버에서 검증하고, 현재 ID/시작 이후 상담을 제외한 최근 완료 상담1건과 해당 최신 AI risk(없으면 최신 PHONE/VISIT)를 선택합니다. 과거 점수/횟수를 합산·재계산하지 않습니다. 연결 중에는 이미 기록된 updated_at을 보수적인 cutoff로 사용하고 시작 시각을 생성하지 않습니다.
- 공개 환경은 서버 KCM_DEMO_CUSTOMER_ID와 정확히 일치하는 고객만 masked read-only 조회를 허용합니다. 다른 고객/설정 누락은 DB 조회 전에403 REAL_DATA_ACCESS_RESTRICTED입니다. 기존 일반 개인자료503/Host/Origin 보호는 유지합니다. 미동의면 상품/요금제/상담/위험 상세 조회를 중단하고 최소 안내만 반환합니다. 전화번호/생년월일/전문/키 SELECT 없이 기존 자유서술 마스킹을 재사용합니다.
- 기존 LiveConversation에 좌62% 현재 신호·대화/우38% 사전 브리핑을 추가했습니다. 900px 이하 세로 배치, viewport 안 모달·내부 스크롤·긴 요약3줄/펼치기·고정 닫기를 적용합니다. 고객 미확인/로딩/미동의/상담·요약·risk 부재/오류를 구분합니다. 통화/고객 선택과 수동 조회만 요청하며 transcript 갱신은 조회 조건이 아닙니다. 취소/늦은 응답/StrictMode 중복 요청을 차단합니다.
- 실제 Supabase 기존5테이블/컬럼/타입/nullable 조건을 read-only 재확인했습니다. customer_9999는 동의 true, 현재 상품/요금제 연결이 있으나 store_005의 종료 시각 있는 완료 상담은0건입니다. Render KCM_DEMO_CUSTOMER_ID도 customer_9999와 다르며 값을 변경하거나 다른 실제 ID/비밀값을 출력하지 않았습니다. 영상 전 실제 과거 완료 상담+ai_summary+risks와 시연 고객 설정 확인이 필요합니다.
- 전체 테스트 **762/762**, 실패/skip0(기존683 + 서버 데이터33/HTTP16/프런트30 신규79). 기존 테스트 삭제/약화0. 욕설 최소20·위협40/60/80·최신 위험탐지/ASR·Agent 제외와 기존 Retell/Monitor/SSE/RMS/n8n/재고/체감가 회귀를 유지했습니다. 프런트/백엔드 타입 검사와 production build 성공, 기존 SDK 청크 경고만 유지합니다.
- Chrome에서 격리 합성 데이터+production dist의 홈→실시간 상담 보기, **1920×1080/1366×768/390×844**를 확인했습니다. 대화·브리핑 스크롤/긴 요약/버튼 닫기·Escape/넘침 없음, 과거60점·위협2 유지/현재위협0→1 SSE 갱신, provider조회8→8 반복 조회 없음을 확인했습니다. 오류 시 transcript20개 유지/원문 비노출/미동의/고객 미확인/이력·요약 없음/수동 복구도 확인했고 검증 탭 console error/warn0입니다.
- 독립 HTML을 최신 src로 갱신했습니다. 직접 실행과 실제 DB REST·Retell 음성·Production 이력 재통화는 미검증이며 합성 브라우저 검증과 구분합니다. 실제 DB/환경/외부 workflow 변경·실제 전화는 하지 않았습니다. 격리 서버/검증 탭/viewport 임시 설정을 정상 정리했습니다. Git 대상164파일 비밀값 패턴 후보0/실제.env 추적0, 보호 기능 파일 diff0, git diff --check 통과입니다. 캡처/fixture는 Git 제외 .cache/live-briefing에 보관하며 상세 선택/접근 정책·남은 조건은 docs/LIVE_CALL_BRIEFING.md에 기록했습니다. 이 feature 브랜치만 commit/push합니다.
- 변경 파일: server/app.mjs, server/real-data.mjs, 새 server/live-briefing.mjs 및 서버 테스트2개, src/components/Modal.tsx, src/live/LiveConsultations.tsx/live-calls.css, 새 LiveCallBriefing.tsx/services/liveBriefingApi.ts/tests/liveBriefing.test.ts, tests/domain.test.ts, docs/LIVE_CALL_BRIEFING.md, STATUS.md, 00_KCM_미리보기.html.

## 최종 실제 데이터·위험탐지 통합 / 2026-10-06

- 기준 main/origin main은 `86508324e33a59e4a74e508bb354f9ef09c86a96`입니다. 기본 작업 폴더의 사용자 `STATUS.md` 변경·미추적 `deliverables/`를 그대로 두고 깨끗한 기존 worktree에서 `integration/kcm-final-release`을 생성했습니다. main·기존 feature/fix/release 브랜치·Render·실제 .env·외부 데이터는 변경하지 않았습니다.
- `feature/real-data-integration-v1`의 `e557081695502f7f5d8ee1298091402513345f96`을 fast-forward한 다음 `fix/risk-detection-test-feedback`의 `64507d9aec39fdbfe0561dc9b7266f8a6130d9de`를 병합했습니다. 충돌은 `STATUS.md` 한 파일의 작업 기록뿐이었으며 양쪽 기록을 모두 보존했습니다. 기능 코드 충돌은 없었습니다.
- 실제 데이터 기능은 원본 feature와 동일합니다. SELECT 전용 Supabase provider, 저장 예약·고객·상담 이력과 `GET /api/briefings/:reservationId`, DB 상품 catalog, `POST /api/effective-price` 서버 계산, 마스킹·동의·매장 범위·공개 사이트 접근 제한을 보존했습니다.
- 위험탐지 기능은 원본 fix와 동일합니다. `local-text-rules-v4`/`call-risk-v4`, 개판 욕설·시설/대인 위협·USER 분절 문맥·Agent 제외·ASR 정정/스냅샷 중복 방지·욕설 최소20·위협1/2/3회 최소40/60/80을 보존했습니다. Retell/Monitor/SSE/고성 RMS/최종화/n8n 전송/스마트재고/고객 전화/배포 설정·의존성 보호 파일은 main 대비 변경 없음입니다.
- 새 `server/tests/final-release-integration.test.mjs`에 통합 테스트11개를 추가했습니다. 같은 Backend에서 실제 읽기 provider의 주입된 REST GET→예약/고객/이력/브리핑, catalog/서버 체감가, 재고 read-only3action, 공식 Monitor 인터페이스를 사용하는 Fake WebSocket→store→HTTP SSE/최종 audio 수신을 함께 검증합니다. 동시 조회·SSE 재접속·ASR 정정·공급자 실패 격리·동의/매장 범위·입력/요청 보호도 검사합니다.
- 최종 `npm.cmd test`: **683/683 통과**, 실패·건너뜀0(양쪽 기존672 + 신규 통합11). 기존 테스트 삭제/약화0. `npm.cmd run build`에서 프런트 `tsc --noEmit`·백엔드 `tsc -p tsconfig.server.json` 및 Vite production build 모두 통과했습니다. 기존 Retell SDK 596.72kB 청크 경고만 유지합니다.
- 영상 기본 욕설2+위협1 → raw26/최종40·경계, 강한 욕설2+위협2 → raw36/최종60·위험, “너 찾아가서 팬다” → 위협1/최종40·경계, 정상 매장 방문 → 위협0/최종0·정상을 자동 테스트와 격리 브라우저 최종 기록에서 확인했습니다. 같은 합성 customer_9999의 네 통화를 각각 독립 기록으로 유지했습니다.
- 로컬 격리 production dist+Backend로 `#/home`, `#/appointments`, `#/customers`, `#/support`, `#/products`, `#/inventory`, `#/marketing`, `#/stores`, `#/retell-test` 직접 진입·기본 표시·직원/고객 title를 확인했습니다. 저장 예약/사전 브리핑·마스킹 고객·현재 상품/최근 이력과 기존 SSE 기록이 함께 보입니다. 체감가55,000−3,000=52,000원 소계/미확인 총부담, 재고 매장/목록/보낸 요청 조회를 확인했습니다. 이번 검증 탭 console error/warn0, 기본 viewport 바깥 가로 넘침 없음, 고객 avatar점0입니다. 모든 업무 버튼·모든 viewport의 전수 재검증은 이번 범위에서 수행하지 않았습니다.
- 브라우저/통합 테스트는 합성 데이터만 사용하며 실제 Retell·n8n·Supabase 요청과 DB 변경은 하지 않았습니다. 재고는 GET_STORES/GET_INVENTORY/GET_RENTALS만 모의 조회했습니다. 합성 통화의 n8n failed 표시는 실제 URL을 설정하지 않은 검증 환경의 예상 동작이며 실제 전송 장애 판단이 아닙니다. 임시 서버·브라우저 탭은 정상 정리했습니다.
- `npm.cmd run preview:standalone`으로 독립 HTML을 재생성했습니다. 직접 실행은 미검증이며 위 production dist 브라우저 검증과 구분합니다. 캡처/fixture/검증 로그는 Git 제외 `.cache/`에만 있습니다. 상세 통합 범위와 남은 검증은 `docs/FINAL_RELEASE_INTEGRATION.md`에 기록했습니다.
- 남은 blocker: 공개 배포의 직원 인증 부재로 개인자료 조회/고객 지정 체감가는 기존대로503 `REAL_DATA_ACCESS_RESTRICTED`입니다. 실제 서버 SUPABASE_URL/SUPABASE_READ_KEY 설정·읽기 권한/RLS·REST 조회 E2E, 실제 음성/STT·고성·n8n/Supabase 저장·Production 스마트재고 조회는 별도 확인이 필요합니다. 보호 조치를 해제하거나 키/환경값을 임의 입력하지 않았습니다. 이번 통합 브랜치만 commit/push하며 main 병합/Render 배포는 하지 않습니다.

## 실제 데이터 연동 1차 / 2026-10-06

- main/origin main `86508324e33a59e4a74e508bb354f9ef09c86a96`에서 `feature/real-data-integration-v1`을 생성했습니다. 기존 기본 작업 폴더의 사용자 STATUS 변경·deliverables를 보존하고 같은 저장소의 기존 worktree에서 작업했습니다. main·Render·실제 .env·비밀값·외부 데이터는 변경하지 않았습니다.
- 사용자가 지정한 KT Project의 실제 public 테이블/컬럼을 Supabase 도구로 read-only 조회했습니다. store_005의 예약 48건/상담 205건/고객 201명/요약 165건/위험 241건을 확인했습니다. ai_transcription/ai_summary는 consultations 컬럼이며 별도 테이블이 아닙니다. 실제 상태 문자열과 예약→상담→고객 관계를 사용합니다.
- 서버 SELECT 전용 provider, 저장 예약/고객/상담 이력/사전 브리핑 API를 추가했습니다. 매장 범위·연결 ID·날짜·상태·응답 구조를 검사하고 이름/연락처를 마스킹합니다. 개인정보 미동의의 자유서술/상세 이력을 제한하며 raw 전문을 반환하지 않습니다. 브리핑은 저장 요약·예약 요청·현재 상품/요금제·최근 이력을 조합하고 새로운 LLM 요약을 만들지 않습니다.
- 홈/예약은 저장 예약과 브리핑을 우선 표시하고, 고객관리는 DB 이력을 실시간 서버 메모리 이력과 별도 표시합니다. 상품 4탭은 DB catalog를 우선 사용합니다. 실패/미설정/빈 자료를 구분하고 기존 mock은 명시적 참고 영역/버튼에서만 열립니다. 기존 참고 상담 시작·완료·수정과 상태 함수는 유지했습니다.
- 체감가는 서버에서 DB 월정액−조건이 확인된 회선별 정액 결합 할인만 계산합니다. 할인 전 현재 요금제 차액·항목별 근거를 표시하며 단말 price는 일시 금액입니다. 할부·지원금·약정 비율·혜택 월환산·세금 기준은 확인 필요로 두고 임의 값이나 0원으로 보완하지 않습니다. 결합/단말 포함 총부담은 partial로 구분합니다.
- 공개 사이트의 직원 인증 부재를 확인하여 새 개인자료 API와 고객 ID를 포함한 가격 계산을 공개 deployment에서 503 REAL_DATA_ACCESS_RESTRICTED로 차단했습니다. 로컬 개발, 상태 조회, 개인정보 없는 catalog/가격 계산, 기존 Retell/SSE/재고는 유지합니다. 직원 접근 제어와 읽기 권한/RLS 설정 전에는 공개 고객 조회를 배포할 수 없습니다.
- `.env.example`에 빈 SUPABASE_URL/SUPABASE_READ_KEY만 추가했습니다. 실제 키 조회·요청/출력, 실제 .env 접근/변경, service_role 우회, RLS/GRANT/DB 명세·스키마 변경은 없습니다. 연결된 Supabase 도구 조회와 KCM 서버 REST 인증은 별개이며 실제 서버 DB REST E2E는 미검증입니다.
- 최종 전체 테스트 **465/465 통과**, 실패·건너뜀 0(기존392+신규73). 프런트·백엔드 타입 검사 및 Vite production build 통과. 기존 SDK 청크 크기 경고 유지. 독립 HTML을 최신 src로 갱신했으며 직접 실행은 미검증입니다.
- 실제 Chrome에서 합성 DB 응답만 사용하는 격리 서버로 home/appointments/customers/products × 1920×1080/1366×768/390×844/320×720을 확인했습니다. 바깥 가로 넘침 없음, 모바일 표 내부 스크롤만 허용. 로딩/오류/미설정/빈 결과·긴 마스킹 이름·5행 pagination/필터·미동의 제한·요약 누락·상품4탭/비교·가격52,000원 소계/단말 확인 필요를 검증했습니다. 기존 참고 예약 상담 완료/수정의 최초 완료 시각·이력도 보존됐습니다.
- 검증 탭에 확장 메시지 채널 오류 문구3건이 보였고 구체 발신자는 미확정입니다. KCM 런타임 오류/빈 화면은 관찰하지 않았으며 관련 코드를 임의 수정하지 않았습니다. 실제 음성·Production n8n/DB 저장·Render 배포는 실행하지 않았습니다.
- Git 대상152파일 비밀값 패턴 후보0/실제 .env 추적 후보0, 기존 보호 대상 기능 파일 diff0, git diff --check 통과를 확인했습니다. 원본 비밀값을 읽거나 출력하지 않았으며 Git 과거 전체 이력은 별도 검사 범위입니다.
- 상세 출처표·schema·API·가격 공식·운영 blocker는 `docs/REAL_DATA_INTEGRATION_V1.md`를 참조하세요. 검증 fixture/캡처는 Git 제외 `.cache/real-data/`에만 있습니다. 이 브랜치만 commit/push합니다.

변경 파일: `.env.example`, `server/app.mjs`, `server/index.mjs`, `server/real-data.mjs`, `server/effective-price.mjs`, 서버 테스트3개, `src/App.tsx`, `src/pages/SecondaryPages.tsx`, `src/pages/ProductsPage.tsx`, 새 컴포넌트3개·API 서비스2개, `src/styles.css`, 프런트 테스트2개/테스트 진입점, `vite.config.ts`, 위 문서, `STATUS.md`, `00_KCM_미리보기.html`.
## 추가 팀 통화 피드백 · USER 분절/폭행 위협/40·60·80 하한 / 2026-10-06

- 기존 `fix/risk-detection-test-feedback`의 1차 commit `e227a2c605be158cef25ca634b51873e1b451433`을 보존하고 같은 브랜치에서만 추가 보정합니다. 최신 main/origin main은 `86508324e33a59e4a74e508bb354f9ef09c86a96` 그대로입니다. 원본 checkout의 사용자 STATUS 변경/미추적 deliverables와 별도 실제 데이터 연동 브랜치를 보존하며 main·Render·환경변수·Production 데이터는 변경하지 않습니다.
- `server/text-risk.mjs`: `local-text-rules-v4`. 기존 v3 욕설/시설 규칙에 놓을 거야·거예요·거니까/부숴버릴 거야·거니까/난리칠 거야와 사람·방문 문맥의 팬다·팰 거야·패버린다·때린다·패준다/직원도 가만 안 둘 거야를 보완했습니다. 명시 부정·전언 guard는 profanity/threat에만 최소 확장하고 비난·선정 규칙은 유지합니다.
- 최근 USER 미완성 fragment 최대2개·각120자·알려진 start_sec 간격30초·현재 행동 앞160자만 연결합니다. Agent는 분석/대상 문맥에서 제외합니다. 독립 탐지와 연결 탐지 중복을 막고 근거는 현재 USER 행동 turn에 귀속합니다. 이전/current 제한 문맥 fingerprint로 부모 정정·삭제·role/time 변경에 따른 종속 결과를 재평가하며 외부 분석/SSE DTO는 유지합니다.
- `src/lib/riskPolicy.js`: `call-risk-v4`. 욕설≥1 최소20점 유지, 위협≥1/≥2/≥3 최소40/60/80점으로 변경했습니다. raw 표·5등급·99 상한·통화별 독립0점·최종화/audio gate·n8n 필드는 유지합니다. 진행 중 대응 경고와 종료 후 종합 최종 점수는 기존처럼 구분합니다.
- A~E는 욕설2/위협1/1/1/0, 반복 위협u1~u4는1→2→3→4, 영상 기본은 욕설2·위협1·최종40(raw26), 강한 버전은 욕설2·위협2·최종60(raw36), 추가 폭행 정확 원문은 위협1·최종40입니다. 정상 방문·반려견·시발점/시발역·판·명시 인용/신고/부정은 제외합니다.
- 변경 파일: `server/text-risk.mjs`, `src/lib/riskPolicy.js`, `server/tests/text-risk.test.mjs`, `server/tests/call-risk.test.mjs`, `server/tests/risk-feedback-pipeline.test.mjs`, `server/tests/n8n-delivery.test.mjs`, `tests/riskPolicy.test.ts`, `tests/liveCalls.test.ts`, `tests/callWorkflow.test.ts`, `server/README.md`, `docs/FINAL_PRODUCTION_E2E_CHECKLIST.md`, `docs/RISK_DETECTION_SEQUENCE_FEEDBACK.md`, `00_KCM_미리보기.html`, `STATUS.md`입니다. UI 소스/스타일·Retell·Monitor·SSE·n8n 구현·IDs·재고·RMS·audio 최종화·package/env 파일은 변경하지 않았습니다.
- 전체 `npm.cmd test` **599/599**, 실패/skip0. 직전507개+신규92개(텍스트72/정책3/서버점수2/프런트1/Monitor-SSE14), 기존 테스트 삭제/약화0. 첫 전체 실행에서 새 C-004 raw 기대값 오기40을 보존된 threat2 항목값30으로 수정하고 최종60을 검사했습니다. 텍스트221/221, 실제 SDK+FakeWS→Monitor→analyzer→SSE14/14, correction/삭제/10회반복/역할변경·최종 gate·n8n 계약을 확인했습니다.
- `npm.cmd run build`: 프런트·백엔드 타입 검사와 production build 성공. 초기 샌드박스 Vite 상위 경로 접근 제한은 동일 명령 승인 실행으로 해결했습니다. 기존 Retell SDK 596.72kB 청크 경고 유지. `npm.cmd run preview:standalone` 갱신, 독립 HTML 직접 실행은 이번에 미검증입니다.
- 격리된 production dist+기존 Backend/store/SSE 브라우저에서 욕설2, 위협1/2/3, 폭행1, 정상 방문0, USER 배지/Agent 배지0, 부모 정정 시UI0·복원/10반복1, 종료 후20/40/60/80/40/0을 확인했습니다. 1366×768·390×844 모달/근거/점수/닫기 및 바깥 overflow 없음,9경로 기본 표시 정상, console error/warn0. 외부 fetch를 차단하여 실제 통화/n8n/DB 호출이 없었고 fixture의 n8n failed는 URL 미설정 상태입니다. 임시 fixture는 정상 종료했습니다.
- 상세 결과는 `docs/RISK_DETECTION_SEQUENCE_FEEDBACK.md`, 캡처/로그는 Git 제외 `.cache/risk-feedback-v4/`에 기록했습니다. 실제 음성/STT/Production 수신은 미검증이며 main/Render에는 적용하지 않습니다. 수정 브랜치 commit/push와 clean 상태를 확인하고 멈춥니다. 아래 v3 항목은 이전 보정 당시 기록입니다.

## 실제 팀 통화 피드백 · 욕설/시설 위협 탐지 보정 / 2026-10-06

- 최신 main/origin main `86508324e33a59e4a74e508bb354f9ef09c86a96` 확인 후 clean worktree에서 `fix/risk-detection-test-feedback`을 생성했습니다. 원본 작업 폴더의 사용자 STATUS 변경·미추적 산출물과 별도 실제 데이터 연동 브랜치는 보존합니다. main·기존 브랜치·환경변수·Render·Production 데이터는 변경하지 않습니다.
- `server/text-risk.mjs`의 누락된 개판/개같/엿같/좆같 및 단순 ASR 띄어쓰기, 시설 파괴/뒤집기/난동 그룹을 추가했습니다. 정상 방문·시발점/시발역·강아지·인용/신고/부정은 제외합니다. USER만 분석, 같은 turn 정정 시 교체, snapshot 중복 및 중첩 규칙의 동일 발생 중복 방지, 기존 비난/선정 규칙은 보존합니다. 분석 버전은 `local-text-rules-v3`입니다.
- `src/lib/riskPolicy.js`: 기존 항목표/raw_score/위협 하한/99점 상한/통화별 독립 계산을 유지하고 욕설1회 이상 최종 최소20점만 추가했습니다(`call-risk-v3`, `RISK_RULE.profanityFloor=20`). `adjusted_score`에 반영하며 최종 객체/SSE/n8n 필드 구조는 그대로입니다. 욕설1회는 항목3점·최종20점/주의입니다. 두 결과 UI의 기존 설명 줄에 욕설 보정 근거만 추가하여 레이아웃/CSS는 유지했습니다.
- 변경: `server/text-risk.mjs`, `src/lib/riskPolicy.js`, `src/live/LiveRiskSignals.tsx`, `src/components/CallRiskDetails.tsx`, `server/tests/text-risk.test.mjs`, `server/tests/call-risk.test.mjs`, `tests/riskPolicy.test.ts`, `tests/liveCalls.test.ts`, `tests/callWorkflow.test.ts`, `server/README.md`, `docs/FINAL_PRODUCTION_E2E_CHECKLIST.md`, `docs/RISK_DETECTION_TEST_FEEDBACK.md`, `00_KCM_미리보기.html`, `STATUS.md`입니다. C-003의 항목 합계14점은 유지하고 새 하한에 해당하는 기존 최종 기대값8개만20점으로 갱신했습니다.
- 최종 전체 `npm.cmd test`: **507/507**, 실패/건너뜀0. 기존392개 + 신규115개(텍스트108/정책4/서버2/프런트1). 텍스트149/149, 기존 테스트 삭제·skip·검증 축소0. `npm.cmd run build`의 프런트 `tsc --noEmit`·백엔드 `tsc -p tsconfig.server.json`·production build 통과. 기존 Retell SDK 청크596.72kB 경고만 유지합니다.
- 실제 production dist와 기존 createBackend/liveCallStore/SSE를 사용하는 격리 브라우저에서4가지 USER 모의 발화 확인: 씨발→욕설1/20점·주의, 매장 뒤집어 놓는다→위협1, 매장 부숴버린다→위협1, 매장에 방문하겠습니다→위협0/0점. 근거 발화·배지, 진행 중 대응 경고와 종료 후 점수의 구분 정상. 같은u1 욕설/위협을 정상 문장으로 정정하면 횟수·배지·경고 제거, snapshot5회 반복에도 누적 없음, 종료 반복에도 최초 결과 유지입니다.
- 1366×768·390×844에서 신호/근거/점수/닫기 표시와 바깥 overflow 없음, 콘솔 error/warn0. 기존9경로 기본 표시 정상이며 재고는 격리 서버의 환경 미설정503/참고 화면입니다. 실제 .env·Retell·n8n·DB 요청 없이 검증했습니다. fixture의 n8n failed는 URL 미설정의 의도된 상태로 실제 전송 실패와 구분합니다.
- `npm.cmd run preview:standalone` 갱신 완료, 독립 HTML 직접 실행은 이번 작업에서 미검증입니다. 전체26개 팀 문장 결과표·오탐/정정/정책·검증 범위는 `docs/RISK_DETECTION_TEST_FEEDBACK.md`에 기록했습니다. 캡처/로그/모의 서버는 Git 제외 `.cache/risk-feedback/`에만 보관합니다.
- 수정 브랜치에만 commit/push하며 main 병합/Render 배포/실제 음성은 미실행입니다. 검토 후 별도 배포 및 실제 STT/음성 재검증이 필요합니다. 이미 확정된 과거 통화는 재산정하지 않으며 서버 v3 적용 시 직원 화면 새로고침이 필요합니다.

## Production 비파괴 진단 + 고객 avatar 점 제거 / 2026-10-06

- 최신 main/origin main `eef5648758d3358bb856bf11b43c7f714d3103da`를 확인했습니다. 기존 작업 폴더의 사용자 STATUS 변경·미추적 산출물을 보존하기 위해 동일 저장소의 별도 worktree `_worktrees/final-production-diagnostics`에서 `fix/final-production-diagnostics`를 생성했습니다. main·기존 브랜치·사용자 파일 초기화/이동은 없습니다.
- 제품 코드 변경은 `src/dev/RetellTestPage.tsx`의 avatar 점 요소 1개와 `src/dev/retell-test.css`의 점 규칙 2개 삭제뿐입니다. 별도 상태 텍스트/상태 점·아이콘·버튼·통화/오디오/위험/저장 handler는 그대로 유지합니다. 독립 HTML은 최신 src로 재생성했습니다.
- 허용된 Production GET5개와 n8n 읽기 POST3개를 각각1회 실행: **8/8 HTTP200**, 매장5/재고12/대여27, `{ok:true,data:배열}` 및 필수 행 계약 유효. 실제 통화·상담 저장 Webhook·DB 변경·알림은 실행하지 않았습니다. 원문/비밀값은 기록하지 않았습니다.
- Render runtime에서 이전 `GET_STORES`/`GET_RENTALS`의 **HTTP_404 18건**(10월6일 UI 표시12:53:37~13:24:36)을 확인했습니다. 과거502는 당시 Webhook 경로 등록·게시 문제(A)가 유력하며 정확한 세부 원인은 미확정입니다. 현재502는 재현되지 않았고 DB credential/query 오류 근거도 없습니다. Render·n8n workflow·환경값은 변경하지 않았습니다.
- 새 Production 탭의9경로 smoke는 모두 정상 표시, 스마트재고2표/18행·오류 안내0, 콘솔 error/warning0/0. 이전 메시지 채널 오류6건은 공식 Chromium 확장 메시지 오류 문구로 분류하며 구체 발신자·영향은 미확정입니다. 재현되지 않았다는 이유로 무시 가능 판정/로그 숨김은 하지 않습니다.
- `npm.cmd run check`: **392/392**, 실패·건너뜀0. 프런트/백엔드 타입 검사와 production build 성공. 기존 SDK 청크 크기 경고 유지. 기존 테스트 변경0.
- 격리된 로컬 SDK/오디오 fixture에서1920×1080/1366×768/390×844/320×720의 대기·연결·통화·종료·재상담: avatar점0, 별도 상태표시 유지, 중앙정렬/원형/버튼위치 유지, 바깥 overflow·세로스크롤 증가0, 종료후 track/AudioContext0/0. 실제 음성 통화 성공 검증과 구분합니다. 독립 HTML 직접 실행은 미검증입니다.
- 상세 원인/검증은 `docs/FINAL_PRODUCTION_DIAGNOSTICS.md`, 내일 사람이 따라 할 A~E 기대 결과·실패 위치는 `docs/FINAL_PRODUCTION_E2E_CHECKLIST.md`에 기록했습니다. 안전 요약/캡처/fixture는 Git 제외 `.cache/production-diagnostics/`에만 보관합니다.
- 이번 수정은 진단 브랜치에만 commit/push합니다. Render는 기존eef5648 그대로이며 **Production avatar 점은 아직 표시**됩니다. 실제 Retell/customer_9999/n8n 저장/Supabase 전문·요약/스마트재고 변경·역할별 처리/수정본 검토후 별도배포·촬영은 남은 범위입니다.

## 스마트재고 통합 검증 / 2026-10-06

- 시작 working tree는 clean이었고 main/origin main `bf84b62e13baa3c5c205773f70a87c9ed58b9f47`를 확인했습니다. `integration/smart-inventory-final`을 만든 뒤 feature `8484affa746b1e66c40b9b1711c9982175516bfa`(ahead 8 / behind 0)를 fast-forward 병합했습니다. 충돌은 없었으며 main·기존 release/feature 브랜치는 유지합니다. 이번 통합 브랜치만 commit/push합니다.
- Browser → `/api/inventory` → KCM Backend → n8n → DB 구조를 연결했습니다. 매장/재고 조회, 우리 매장 수량 수정, 대여 요청/승인/취소/배송 시작/도착 확인/반납 완료와 역할·상태별 버튼을 재사용합니다. 기존 `InventoryPanel`은 설정 미준비 시 읽기 전용 참고 화면으로 유지합니다.
- 재고에 한정한 보완: 서버 home 매장을 실제 변경 처리자로 고정하고 다른 actor 입력을 차단했습니다. 필수 응답 ID·정수 수량·상태·요청과의 일치를 검사하며 잘못된 성공 응답은 실패 처리하고 알림을 보내지 않습니다. 프런트도 응답 구조와 알려진 오류 코드만 사용합니다. 소수/음수 입력을 다른 숫자로 변환하지 않고 검증하며 매장 전환·해제 후 늦은 응답이 재고 화면을 덮어쓰지 않게 했습니다.
- main의 typography/spacing/문구 정리는 보존했습니다. 공통 CSS는 삭제 없이 재고 전용 31줄만 추가했고, 재고 본문12px/모델13px/보조10px/배지10px/버튼12px와 데스크톱32px·모바일40px 클릭 영역, 제목/매장 선택/대여 탭 줄바꿈을 적용했습니다. `InventoryPanel`, Retell/Monitor/SSE/위험/기존 상담 n8n·전화·예약·지원·마케팅·상품·고객 업무 파일, 의존성·lockfile·환경설정은 변경하지 않았습니다.
- 최종 `npm.cmd run check`: **392/392 통과**, 실패/건너뜀0, 프런트 `tsc --noEmit`·백엔드 `tsc -p tsconfig.server.json`·Vite production build 성공. 기존357 + 재고 백엔드21 + 프런트14입니다. feature의 프런트 재고 테스트를 전체 실행에 등록했습니다. 첫 Vite 실행의 샌드박스 상위 경로 접근 오류는 원인 확인 후 승인 실행으로 해결했습니다. 기존 SDK 큰 청크/MockTimers 경고만 남습니다.
- 실제 Chrome에서 격리 n8n 응답과 production dist를 사용해 `#/inventory`의 **1920×1080 / 1366×768 / 390×844**를 직접 확인했습니다. 데스크톱 표/제목은 가로 넘침 없고, 모바일은 표 영역 내부 가로 스크롤만 허용합니다. 매장 선택·대여 탭이 잘리거나 겹치지 않고 모바일 요청 모달/닫기·Escape·40px 버튼이 정상입니다. 정상 재고 화면의 브라우저 오류 로그는0입니다.
- 격리 화면에서 수량 수정 성공, 소수/예약·이동 수량 제한, 편집 Escape 취소, 저장 중 매장 전환 후 응답 분리, 타 매장 읽기 전용, 대여 요청·승인·배송·수령·취소·반납 완료, 확인 취소·완료 후 버튼 조건, 빈 재고·DB 오류·복구를 확인했습니다. 도착 확인에 사용한 첫 모의 응답의 반납 상태가 계약과 달라 거절되는 것을 확인한 후, 모의 응답을 `반납 전`으로 고쳐 정상 도착을 검증했습니다. 제품 코드는 이 응답 오류 때문에 변경하지 않았습니다.
- 직원8메뉴와 고객 전화의9개 route에 직접 진입하여 제목/직원·고객 title/빈 화면 없음을 확인했습니다. 기존 업무의 전체 자동 회귀와 보호 파일 diff0을 확인했으며, 실제 Retell 음성·기존 상담의 외부 저장은 이번에 실행하지 않았습니다. 사용자 저장 데이터 초기화·실제 외부 요청은 없습니다.
- `N8N_INVENTORY_BASE_URL` 미설정의 정상 재고 요청은 **503 `INVENTORY_NOT_CONFIGURED`**, home 미설정/잘못된 형식의 변경 요청은 **503 `HOME_STORE_NOT_CONFIGURED`**입니다. 브라우저에서 설정 없는 별도 서버의 안내·읽기 전용 참고 화면을 확인했습니다. 두 변수의 실제 값·`.env`·Render 환경·n8n workflow는 읽거나 변경하지 않았습니다. 상세 endpoint/action·알림·오류 계약은 `docs/SMART_INVENTORY_INTEGRATION.md`에 기록했습니다.
- `npm.cmd run preview:standalone`으로 독립 HTML을 갱신했습니다. 갱신 HTML의 HTTP 직접 진입은 브라우저의 `ERR_BLOCKED_BY_CLIENT`로 중단되어 **직접 실행 미검증**이며, 위 production dist 검증과 구분합니다. 로그/캡처/격리 fixture는 Git 제외 `.cache/inventory-integration/`에만 보관합니다.
- 남은 범위: 실제 Production n8n/DB CRUD·상태 전이·재고 수량 원자성·동시 승인·취소 반환 계약·알림 수신자/배달, 실제 통화 회귀, 검토 후 main 병합 및 Render 배포. 실제 비밀값/환경변수/서비스 설정을 변경하거나 main에 병합하지 않았습니다.

## 추가 UI Polish + Release Hardening / 2026-10-06

- 기존 `release/kcm-final-polish`/`c1aaba00453a4101e5b94be6804980608f106f1e`와 모든 변경을 보존하고 같은 브랜치에서 추가 작업했습니다. 시작 상태 clean, 기준 main `4808bc135c4efb6d3234afefbf273306ee4f594f`입니다. 브랜치 재생성/초기화·main·Render·환경변수·외부 데이터 변경은 없습니다.
- 고객/직원/상품/매장 이름12~13px, 테이블12px/헤더11px, 배지10~11px, 버튼11~12px, 보조10~11px로 정보 계층을 정리했습니다. 1366px 실제9화면에8px 이하 사용자 글자는 없었습니다. topbar/제목/카드/행 padding과 gap을2~6px 정도 줄이고 모바일40px 주요 클릭 영역을 유지했습니다.
- 홈5행 카드 하단은1920 약748→699px/1366 약742→695px, 예약 목록 하단은 약1015/1030→792px로 정리했습니다. 지원/마케팅 표는 데스크톱에서 모든 열이 보이고, 긴 요약/메시지는2줄 preview 후 상세에서 전체 조회합니다. 재고는 이름/보조 글자만 CSS로 조정하며 구조·interface·수량을 유지했습니다.
- 고객 전화는1366×768의804px 높이를768px로 줄였고390×844/320×720 핵심 UI는 한 화면에 표시됩니다. modal header/닫기는 내부 스크롤 중 고정됩니다. 서버 오류/알 수 없는 최종화 사유 원문 노출을 막고, 고객의 인증/일반 연결 오류를 마이크 권한 오류로 잘못 안내하던 표시만 수정했습니다.
- 최종 `npm.cmd run check`: **357/357 통과**, 실패/건너뜀0, 프런트·백엔드 타입 검사 및 production build 성공. 기존353 유지+안전 안내3+고객 오류 구분1. 기존 SDK청크/MockTimers 경고만 남습니다.
- 실제 .env/외부 호출 없는 격리 브라우저에서9경로×4크기(1920×1080/1366×768/390×844/320×720), 직접 진입/새로고침/title, 정상콘솔오류0, 주요 상담/지원/사후관리/상품/매장 흐름을 확인했습니다. 로딩/직전페이지 캡처는 재촬영·시각검토했습니다. 바깥 가로넘침 없음, 모바일 표 내부스크롤 유지입니다.
- C-003 지원 요청/확인/완료/재요청, 초안/확인취소 유지, 상담완료 후 남은 지원처리, 메시지 수정/안내처리/기록유지, 예약완료/수정/최초시각·집계·2건이력을 재확인했습니다. 모의 고객통화 시작/종료/재시작/이탈 후 track/AudioContext0/0입니다. 백엔드/Retell/마이크 실패·SSE재연결·n8n failed·빈 목록을 확인했고 오류 원문은 노출되지 않았습니다.
- 추적127개+신규3개, 총130개 secret scan: 미해결 실제값 의심0, 비밀파일 추적0. 실제 .env 내용은 열거나 출력하지 않았습니다. 후보는 fixture/placeholder이며 Git 전체 이력 검사는 별도 범위입니다.
- 독립 HTML을 갱신해 HTTP로 직접 열어13px 고객명·5행·상품 비교를 확인했습니다. file:// 실제 실행은 미검증입니다. 캡처/로그는 Git 제외 `.cache/final-polish/`에 보관합니다. 상세 검증/밀도 표·변경파일·내일 항목은 `docs/RELEASE_HARDENING.md`를 참조하세요.
- 핵심 Retell/Monitor/SSE/transcript/5신호/RMS·고성/위험정책/최종화/IDs/n8n payload·중복가드/기존 상태 함수/패키지·lockfile·환경설정은 변경하지 않았습니다. 실제 음성/customer_9999/n8n·Supabase/팀원 재고병합/최종회귀/Render/촬영만 사람의 후속 작업으로 남깁니다.

## Final Polish — Freeze 전 전체 화면 정돈 / 2026-10-05

- clean main `4808bc135c4efb6d3234afefbf273306ee4f594f`와 기존 **345개 테스트 통과**를 확인한 뒤 `release/kcm-final-polish`를 생성했습니다. 이번 브랜치만 commit/push하며 main·Render·실제 환경변수·외부 데이터를 변경하지 않습니다.
- 직원 8개 메뉴와 고객 `#/retell-test`를 코드/브라우저로 전수 확인했습니다. 홈·예약·상담지원·상품·사후관리·매장은 프런트 범위 완료, 고객관리/고객 전화는 실제 외부 검증 필요, 스마트 재고는 팀원 병합 필요입니다. 자세한 표·변경 파일·실행 기록은 `docs/FINAL_POLISH.md`에 기록했습니다.
- 상품관리 4탭을 목록·선택 상세·검색·자사/타사·최대3개 요금제 비교/제외로 보강했습니다. 중립적인 상담 참고 자료이며 제품은 기존 inventory 모델·용량·색상을 재사용합니다. 공식 상품이나 임의 제품 사양으로 표시하지 않습니다. 새 라이브러리·CRUD·서버 기능은 추가하지 않았습니다.
- 지원·상담·사후관리·매장·공통 modal/footer/profile/help/알림의 개발 문구와 큰 badge를 정리했습니다. ‘샘플 초기화’는 ‘화면 초기화’, ‘데모 발송’은 ‘안내 처리’로 표시합니다. 고정 자료 표시용 `uiText`는 원본/ID와 사용자 입력 결과·메모·실제 전문을 변경하지 않습니다.
- 고객 전화 진단 UI는 소스에 보존한 채 `hidden`/`aria-hidden`으로 숨겼습니다. 시작/종료·보조 마이크·reporter·최종 snapshot은 그대로이며 오류만 고객용 안내로 표시합니다. 고객·직원 title을 유지했습니다.
- 미준비 예약 브리핑의 기존 상세 모달 진입을 연결했습니다. 320/390px 상품 탭 2열과 긴 모달 버튼 줄바꿈을 적용했습니다. 스마트 재고는 기존 문구만 정리해 route/interface·수량·대여 구조를 보존했습니다.
- 최종 `npm.cmd run check`: **353/353 테스트 통과**, 실패/건너뜀0, 프런트/백엔드 타입 검사 및 production build 성공. 기존345 + 상품5 + 표시/오류3입니다. 기존 SDK 청크 약597kB 및 MockTimers 경고만 남습니다.
- 격리 localhost5190(실제 .env/외부 호출 없음)에서 9개 route × 1920×1080/1366×768/390×844/320×740 총36조합을 직접 확인했습니다. 바깥 가로 넘침/콘솔 오류 없음, 좁은 표 내부 스크롤·상품 탭·입력/확인창·사후관리 버튼/이력을 확인했습니다. 홈 제목·4카드·5행 통화 카드 하단은 각각 약748px/742px이며 첫 화면에 들어옵니다.
- C-003 시작 → 지원 요청/확인/완료/재요청 → 초안/확인 취소 유지 → 상담 완료/기존 최종14점 → 완료 후 남은 지원 처리, 마케팅 메시지 확인/수정/안내 처리/재조회와 메뉴 이동 유지, 예약 DEMO-R002 완료/수정의 최초 시각·상태·2건 이력 보존을 확인했습니다. 위험 정책은 변경하지 않았습니다.
- 12건 pagination 5/5/2행·필터page1·빈 결과·5건 이하숨김·목록 감소 보정을 확인했습니다. 같은 격리 고객의 3개 통화 최신0점/과거4·2점, ID·전문·n8n 수신 상태도 확인했습니다. 실제 customer_9999 반복 E2E는 미실행입니다.
- 모의 고객 통화 시작/종료/재시작/직원 이동에서 숨겨진 보조 마이크 track/AudioContext 시작1/1·정리0/0과 경과시간을 확인했습니다. 실제 음성·Production n8n/Supabase·ai_summary는 내일 사람이 검증합니다. 모의 성공을 실제 성공으로 간주하지 않습니다.
- `npm.cmd run preview:standalone`으로 `00_KCM_미리보기.html`을 갱신하고 생성 HTML을 HTTP로 직접 열어 홈·5행·상품 조회·자사/타사 비교를 확인했습니다. file:// 직접 실행과 독립 HTML의 실제 Retell은 미검증입니다. 로그/캡처는 Git 제외 `.cache/final-polish/`에 보관합니다.
- Retell/Monitor/SSE/전문/5신호/RMS·고성/통화별 위험·위협 보정/최종화/consultation·customer·store ID/n8n payload·중복 차단/기존 예약·지원·사후관리 상태 로직/패키지·lockfile·환경설정은 변경하지 않았습니다. 외부 알림/문자 없음·상품 참고 자료·초기화/조회 범위·수신과 저장 구분은 작은 안내로 유지합니다.
- 내일: 스마트 재고 병합 → 최종 회귀/검토 → 승인 코드 main/Render 최종 배포 → 실제 음성/고성/Monitor/SSE → customer_9999 반복 E2E → n8n/Supabase 저장·ai_summary 확인 → Freeze/촬영. 기존 아래 기록은 당시 결과이며 현재 변경 범위는 이 항목이 우선입니다.

## 최신 RC 보강 — 상담지원·상담 후 고객 사후관리 / 2026-10-05

- 시작 상태는 clean이며 main과 release/kcm-rc 모두 `7ab60279ed2838f2a1e0e73c625bcf7094578349`였습니다. `release/kcm-rc`로 전환해 이번 변경만 추가합니다. main 반영·Render 배포·환경변수 변경은 하지 않습니다.
- `src/pages/SupportPage.tsx`: 체크리스트를 현재·최근 통화 표로 교체했습니다. 고객 마스킹명·문의·상담/분석 상태·최종 위험도/위협 경고·5개 신호·관리자 지원 상태, 전체/현재/종료/미완료 지원 필터를 표시합니다. 선택 통화의 AI 권장 가이드와 기존 `CallSupportPanel`, `CallBriefing`을 재사용합니다.
- `src/App.tsx`, `src/pages/SecondaryPages.tsx`: 홈과 상담지원이 기존 App의 동일 통화 상태·시작/결과/완료/지원 변경 함수를 참조합니다. 상담지원에서 완료해도 최초 시각·위험 기록·미완료 지원은 기존 동작대로 유지합니다. 마케팅은 기존 완료 통화/방문 예약 결과의 읽기 전용 projection을 사용하고, 메시지 확인/발송 기록만 별도 앱 메모리에 보관합니다.
- `src/pages/MarketingPage.tsx`, `src/lib/aftercare.ts`: 완료 고객·상담 요약/결과·연락 동의·후속 필요·추천 메시지·대기/완료 표와 메시지 확인 → 발송 처리(데모) → 발송 기록 조회를 구현했습니다. 완료된 발송의 내용/최초 시각은 반복 클릭으로 덮어쓰지 않습니다. 예약 결과가 수정되면 확인 전 상태로 취급하고 재확인 없이 발송할 수 없습니다.
- `src/data/aftercareMockData.ts`: 연락·안내 동의는 고객 ID별 명시적인 가상 설정입니다. 이름/후속 메모/위험 점수에서 동의를 추측하지 않으며 미설정 고객은 미확인입니다. 기존 완료 샘플 DEMO-R001은 결과가 없어 그대로 결과 기록 없음으로 표시합니다. 미동의/미확인/결과 없음/후속 안내 필요 없음·미정은 발송을 막습니다. 실제 동의 조회·SMS·DB 저장은 연결하지 않습니다.
- 추천 메시지는 기존 문의 유형·후속 메모를 활용한 직원 검토용 템플릿이며 AI 요약·실제 처리 결과를 새로 만들지 않습니다. 통화/예약 ID를 별도 키로 관리해 사후관리 기록이 섞이지 않습니다. 기록은 메뉴·패널 이동 후 유지되며 새로고침/기존 샘플 초기화에서는 사라집니다.
- `src/styles.css`: 기존 card/table/status pill/badge/button/form 스타일을 사용하고 새 두 화면에 한정한 표·가이드/메시지 배치를 추가했습니다. 직원 메뉴·홈 배치·공통 상단·다른 기능 화면은 유지합니다.
- `tests/aftercare.test.ts`와 `tests/domain.test.ts`: 완료 데이터 투영/동의/후속 필요 구분, 필수·공백·길이 검증, 확인 전 발송 차단, 중복 처리/첫 시각 보존, 수정 후 재확인, 통화·예약 ID 분리, 원본 상담/위험/지원/이력 보존 등 12개 테스트를 추가했습니다.
- 최종 `npm.cmd run check`: **345/345 테스트 통과**, 프런트/백엔드 타입 검사 및 production build 성공. 첫 테스트 컴파일에서 새 파일의 `.js` 확장자와 테스트 지원 사유 enum을 수정했습니다. 샌드박스의 Vite 상위 경로 접근 제한은 동일 명령을 승인받아 실행해 해결했습니다. 기존 Retell SDK 약597kB 청크 경고와 Node MockTimers 경고만 남았습니다.
- 격리 localhost:5190 브라우저: C-003 상담 시작 → 지원 요청 → 결과/완료(기존 최종 14점) → 마케팅 목록 반영 → 메시지 확인/수정 시 재확인 → 데모 발송 완료/재조회 → 상담지원에서 남은 관리자 지원 확인/완료를 확인했습니다. 홈 집계와 양쪽 통화 상태가 일치했고 메뉴 이동 후 기록이 유지됐습니다. C-002 미동의 발송 차단, C-005 분석 중 신호 `—`/지원 제한, C-004 위협 경고/기존 요청도 확인했습니다.
- 예약 DEMO-R002 시작 → 결과/완료 → 마케팅 메시지 확인 → 완료 결과 수정에서 최초 시작/완료 시각 유지·수정 이력 2건·이전 확인으로 발송 불가를 확인했습니다. 직원 8개 메뉴와 기존 모의 SSE 통화/전문/위험 모달이 동작했습니다. 브라우저 오류 로그 0건, 1366×768 및 390×844에서 페이지 가로 넘침 없음·표 내부 가로 스크롤·모바일 메시지 입력/버튼/발송 기록을 확인했습니다.
- `npm.cmd run preview:standalone`으로 `00_KCM_미리보기.html`을 갱신했습니다. HTTP로 독립 HTML 자체를 직접 열어 상담지원 5행 → C-003 상담 완료 → 마케팅 메시지 확인/발송 완료까지 실행했습니다. file:// 직접 실행은 미검증입니다. 캡처는 Git 제외 `.cache/rc-audit/qa/*-mobile.jpg`, `marketing-desktop.jpg`에 보관합니다.
- 변경하지 않은 핵심: Retell/Monitor/SSE/보조 마이크/고성 상태 머신·임계값/위험 정책/최종화/n8n payload·중복 전송/DB 설정/기존 가상 통화 데이터/예약 상담 로직/패키지·lockfile. 실제 음성·Production n8n/DB 수신은 이번 UI 보강에서 재검증하지 않았습니다.
- 시연 경로: `#/support`에서 C-003 상세 → 상담 시작 → 결과/후속 메모 입력 → 상담 완료 후 `#/marketing`에서 C-003 메시지 확인 → 확인 완료 → 발송 처리(데모). 실제 문자 발송과 서버 저장 없이 동작합니다.

## Release Candidate — 개발 Freeze 준비 / 2026-10-05

- 기준 main/origin main `6c14697`에서 `release/kcm-rc`를 생성했습니다. 이전 미커밋 UI 11개 파일을 먼저 `.cache/rc-audit`에 보존한 뒤 작업했으며, 홈 배치·페이지네이션·고객 전화 화면·title 구현을 다시 작성하지 않았습니다. RC 브랜치만 커밋·push 대상이며 main 병합·Render 배포는 사용자 검토 후입니다.
- `src/live/livePresentation.ts` 신규: 고객 ID별 읽기 전용 이력과 최신 완료 통화를 선택합니다. 동일 시각은 나중에 수신한 통화를 우선하고, 미식별 고객 통화는 합치지 않으며 최신 점수 보류를 과거 점수로 대체하지 않습니다. n8n 수신 응답과 DB 저장 성공을 구분해 표시합니다.
- `src/live/LiveConsultations.tsx`, `src/live/live-calls.css`, `src/pages/SecondaryPages.tsx`: 고객관리에서 현재 서버 수신 고객 ID·최근 완료 위험도·통화별 독립 점수·상담/통화 이력을 확인하고 기존 실시간 모달을 재사용합니다. 모달에서 call/consultation/customer/store ID를 확인합니다. 가상 방문 예약 고객은 별도 표로 구분합니다. DB 이름·연락처·재시작 이전 이력 조회는 미구현입니다.
- `src/live/LiveRiskSignals.tsx`, `src/components/Layout.tsx`, `src/App.tsx`: 실제 연결과 모순되던 Retell 미연동/외부 API 없음/n8n 전송·DB 저장 없음 문구를 정리했습니다. 전송 보류·pending·sent·failed와 결과 보존을 표시하되 sent를 DB 저장 완료로 표현하지 않습니다. 유용한 테스트 정보는 유지합니다.
- `src/dev/retellCall.ts`: 종료 중/종료 후 늦은 SDK live 이벤트와 중복 onEnd/onError가 상태·call ID를 덮어쓰지 않도록 최소 가드를 추가했습니다. 기존 SDK create/stop, 보조 마이크 자동 시작·최종 snapshot·정리 순서와 인증은 유지합니다.
- `src/pages/ProductsPage.tsx`, `src/pages/StoreManagementPage.tsx`, `src/pages/SecondaryPages.tsx`: 상품 4개 탭을 명시적인 가상 조회 자료로 채우고 상담지원·마케팅은 현재 업무 확인 사항으로 정돈했습니다. 직원 소개 태그를 고객 성향 매칭으로 설명하던 문구를 수정했습니다. 스마트 재고 분기·메뉴·route·interface·InventoryPanel은 보존합니다.
- `tests/retell.test.ts`, `tests/livePresentation.test.ts`, `tests/liveCalls.test.ts`, `server/tests/rc-flow.test.mjs`: 8개 검증을 추가했습니다. 같은 고객의 3통화가 개별 ID·전문·독립 점수 4/2/0으로 SSE에 반영되고 통화당 1회 모의 POST되는 흐름, 원격 종료 뒤 지연 audio, 미측정 시 보류, 늦은 SDK 이벤트, 고객 묶음과 전송 표시를 검증합니다. 첫 통합 테스트의 비난 1회 기대값을 기존 점수표의 4점으로 수정했고 계산 로직은 변경하지 않았습니다.
- 최종 `npm.cmd run check`: **333/333 테스트 통과**, 프런트 `tsc --noEmit`·백엔드 `tsc -p tsconfig.server.json`·Vite production build 성공. 기존 Retell SDK 약597kB 청크 경고와 Node MockTimers 경고만 남았습니다. 패키지·lockfile·서버 환경설정·점수표·텍스트 분석·고성 상태 머신·Monitor·SSE·전문·최종화·n8n payload/중복 가드는 변경하지 않았습니다.
- 격리 localhost:5190 브라우저 검증: 홈 1920×1080 카드 하단 약748px/5행, 1366×768 하단 약742px/메뉴 하단624px/가로 넘침 없음. 직원 8메뉴, 상품4탭·매장2탭, 고객별 최신·과거 이력과 실시간 모달을 확인했습니다. 12건 목록 5/5/2행·필터 page=1·빈 결과·5건 이하 UI 숨김·6건 축소 시 page=2를 확인했습니다.
- 기존 예약 상담 시작→결과→완료→수정에서 최초 시작·완료 시각과 완료 집계 2건·수정 이력 2건을 보존했습니다. C-003 데모 시작→지원 요청→결과·완료(독립14점)→완료 후 관리자 확인·지원 완료를 확인했고 카드 최종1/2/1/1입니다. 사용자 기존 데이터는 초기화하지 않았습니다.
- 고객 화면 모의 SDK/오디오로 대기→연결→통화·경과시간→종료→두 번째 통화와 페이지 이탈, track/AudioContext 자동 시작 및 모두0으로 정리를 확인했습니다. 고객390×844·320×740 가로 넘침 없음, 직원390px 통화 기록 모달과 title 전환을 확인했습니다. 모의 환경의 측정 간격이 끊긴 통화는 기존 기준대로 최종 점수·전송이 보류됐습니다. 성공 최종화/SSE/POST는 자동 통합 테스트에서 검증했습니다. 이 검증은 실제 음성 통화를 대체하지 않습니다.
- `npm.cmd run preview:standalone` 실행 후 `00_KCM_미리보기.html`의 홈·5행·고객관리 빈 이력 안내를 브라우저로 확인했습니다. 독립 HTML은 직원 샘플용이며 Retell/DB 조회용이 아닙니다. 검증 화면 캡처는 Git 제외 대상 `docs/rc-*.png`에만 보관합니다.
- `docs/RELEASE_CANDIDATE.md`에 실행 경로·정책·제약과 10월6일 Freeze 전 체크리스트를 기록했습니다. 실제 Retell 음성 통화·Render 환경변수/RC 배포·n8n Publish/실제 저장·AI 요약 생성·Supabase 저장 확인·스마트 재고 팀원 병합은 사람이 확인할 외부 항목입니다. DB/schema/실제 서비스 데이터·실제 환경변수는 읽거나 변경하지 않았습니다.


## 최신 변경 — 홈 밀도·통화 페이지네이션·고객 전화 UI / 2026-10-02

- 기존 HEAD `6c14697` 및 팀 공유 지침/변경을 보존했습니다. 이번 범위는 UI·레이아웃·목록 표시 상태이며 사용자 요청에 따라 **커밋·push·Render 배포 전 검토 상태**로 남깁니다.
- `src/App.tsx`: 홈의 순서만 현황 카드 → 통화 현황 → 실시간 AI 상담으로 변경했습니다. 카드 수치/크기·기존 예약/상담 영역은 유지합니다.
- `src/components/CallOverview.tsx`, `src/styles.css`: 제목과 두 필터를 같은 card-heading에 배치하고 좁은 화면에서 줄바꿈합니다. 카드 제목·기준 안내의 세로 여백과 통화 표 행 높이만 정리했으며 8개 컬럼을 모두 유지합니다.
- `src/lib/callPagination.ts`: 필터 적용 결과를 5건씩 표시합니다. 두 필터 변경/초기화 시 첫 페이지로 돌아가며 목록 감소 시 범위를 보정합니다. 5건 이하에서는 페이지 UI를 숨깁니다. 이전/다음 아이콘 버튼에 이름·비활성 상태·키보드 포커스를 제공합니다. 열린 브리핑은 전체 통화 ID로 계속 조회합니다.
- `src/dev/RetellTestPage.tsx`, `src/dev/retell-test.css`: 고객용 매장명/KCM/AI 상담 도우미, 대기·연결 중·통화 중·종료, 시작/종료/다시 상담 버튼 및 표시 전용 경과시간을 구성했습니다. PC는 중앙 420px, 모바일은 전체 폭·100dvh 기준입니다. 320px·낮은 화면, safe-area, reduced-motion을 고려했습니다.
- 설정/call_id/보조 마이크/RMS/고성/직원 이동 링크는 기본 닫힌 ‘테스트 정보’에 보존합니다. 마이크 오류는 닫힌 상태에서도 표시합니다. 기존 시작·종료 핸들러, SDK/보조 마이크/고성 전송 컨트롤러와 자원 정리 코드는 그대로입니다. 경과시간은 UI 표시만 하며 통화 시각·분석·저장에 사용하지 않습니다.
- `src/EntryRouter.tsx`: 고객 경로 title은 ‘KCM · 고객용 AI 상담’, 직원 경로는 ‘KCM · 직원용 통합 대시보드’로 전환합니다.
- `tests/callPagination.test.ts` 신규 4개를 `tests/domain.test.ts`에서 실행합니다. 5건 분할/마지막 페이지/원본 보존/빈 목록/범위 보정/필터 적용 순서를 검증합니다. **전체 325개 테스트 통과, 프런트·백엔드 타입 검사 및 Vite production build 성공**입니다. Vite의 Windows 샌드박스 상위 경로 접근 실패는 원인을 확인한 뒤 권한 확장으로 해결했습니다. 기존 SDK 청크 크기/MockTimers 경고만 남아 있습니다.
- 격리 localhost5190 브라우저 검증: 1920×1080에서 제목·4개 카드·5행 통화 카드 하단이 약 748px로 첫 화면 안에 표시됩니다. 1366×768에서 통화 카드 하단 약742px, 사이드바 메뉴 하단624px이며 가로 넘침이 없습니다. stat-card 크기와 집계1/3/1/1은 유지합니다. 390px에서 필터 줄바꿈과 8개 컬럼 가로 스크롤, 직원 8개 메뉴 이동을 확인했습니다.
- 12건 모의 목록에서 5/5/2행, 이전·다음 비활성 경계, 두 필터의 page=1, 빈 결과, 7건으로 축소 시 page=2, 5건 이하 페이지 UI 숨김을 직접 확인했습니다. 모의 SSE snapshot을 기존 LiveConsultations로 수신하고 이동된 영역의 모달에서 고객/AI 대화 조회·닫기를 확인했습니다.
- 고객 브라우저 검증: 1920px에서 420px 중앙 컨테이너, 390×844 전체 화면, 320×568에서 잘리지 않고 세로 스크롤 가능한 배치를 확인했습니다. 격리 SDK·오디오 장치 대역으로 키보드 시작→연결 취소→재시작→경과시간→종료 및 통화 중 직원 화면 이동을 확인했습니다. 닫힌 테스트 정보에서도 RMS 측정/고성 표시가 진행되며 3회 시작 후 종료/이동 시 track 3개·AudioContext 3개가 모두 정리됐습니다. 모의 권한 거부 안내와 고객↔직원 title 전환도 확인했습니다. 이는 실제 Retell 음성 연결 검증이 아닙니다.
- `npm.cmd run preview:standalone`로 `00_KCM_미리보기.html`을 갱신했고, 브라우저에서 해당 HTML의 직원 홈·5행·제목 옆 필터를 직접 확인했습니다. 원래대로 독립 HTML은 직원 화면용이며 Retell 통화 검증용이 아닙니다. 확인한 브라우저 오류 로그는 0건입니다.
- 서버/Monitor/SSE/transcript/위험 정책/보조 마이크·고성 측정/n8n/ID 처리/예약·상담 업무 코드, 환경변수, 의존성을 변경하지 않았습니다. 기존 저장 데이터를 초기화하지 않았습니다. 임시 브라우저 검증은 실제 전화·마이크·외부 전송과 분리했습니다. 실제 음성 통화·실물 모바일·n8n Production 수신·Render 배포는 이번 작업에서 미검증입니다.
- 로컬 화면 확인: 기존 개발 서버의 `/#/home`, `/#/retell-test`. 검증 캡처 `docs/ui-customer-390.png` 등은 기존 Git 제외 정책에 따라 로컬에만 보관합니다.

## 팀 공유용 Git 보안 점검 / 2026-10-02

- 실제 프로젝트 루트는 `KCM_web_starter_v0.3`입니다. GitHub API로 기존 `rootgo1/kcm-web`이 Private이고, 원격 main과 로컬 HEAD가 `fc5c26f`로 같은 것을 확인했습니다. 이미 초기 커밋과 push가 있어 저장소 재생성·Git 재초기화·이력 변경은 하지 않습니다.
- `.git`를 제외한 파일 6,295개의 목록을 확인했습니다. 의존성 6,103개는 업로드 제외 대상이며, 프로젝트 텍스트 150개와 기존 8개 커밋의 고유 파일 내용 136개를 비밀값 패턴으로 검사했습니다. `.env`의 API 키와 다른 텍스트/이력의 일치 여부도 값 출력 없이 검사했습니다. 실제 키의 복사 흔적과 비밀 파일의 추적 이력은 발견하지 못했습니다. 테스트용 문자열과 빈 환경변수 예시는 별도로 확인했습니다. 자동 패턴 검사는 모든 형태의 비밀정보 부재를 보증하지 않습니다.
- `.gitignore`에 개인 키·인증서·자격증명 파일·n8n 실행 데이터와 자격증명 내보내기·로컬 DB/백업·네트워크 캡처·`docs/*.png` 제외를 추가했습니다. 화면 캡처 41개는 내용을 공유하지 않도록 모두 로컬에 보존하고 업로드에서 제외합니다. `.env.example`, 소스, lockfile, n8n 워크플로 소스와 SQL 마이그레이션은 공유 가능한 상태입니다.
- `git check-ignore --no-index --stdin`의 제외/포함 사례 32개를 모두 확인했고, 제외 규칙에 해당하는 기존 추적 파일은 0개입니다. `git ls-files` 기준 기존 98개와 미추적 안내/검증 문서 11개가 공유 대상이며, 문서 11개는 내용을 변경하지 않습니다.
- 이번 기존 파일 변경은 `.gitignore`와 이 작업 기록뿐입니다. `.env`, 앱/서버 소스, n8n 처리, 설정 값, 의존성 및 생성 HTML을 변경하지 않습니다. 소스 변경이 없어 앱 테스트·빌드·독립 HTML 생성은 재실행하지 않습니다.
- 이 기록은 로컬 공유 준비 시점의 결과입니다. GitHub 저장소 생성/설정 변경/push와 배포는 아직 수행하지 않았으며, 사용자 요청에 따라 외부 변경은 승인 후 진행합니다. 비밀값은 코드·로그·이 기록에 출력하지 않습니다.

## 최신 변경 — n8n payload에 상담 기본정보·최종 대화 추가 / 2026-10-02

- 기준 커밋 `2246c71`의 기존 call_id/consultation_id/customer_id/signals/scores/risk_score/risk_level을 그대로 유지하고 `consultation` 객체만 추가했습니다. 아래 이전 기록의 transcript 미전송 설명은 당시 계약이며 이번 절의 확장 계약으로 대체됩니다.
- `server/n8n-delivery.mjs`: `consultation`에는 store_id, status:"완료", used_ai:true, 원본 LiveCall.started_at/ended_at, 최종 messages의 transcript를 보냅니다. 시각은 기존 ISO UTC 형식·실제 날짜 유효성·시작≤종료를 검증하며 변환하거나 현재 시각으로 보충하지 않습니다. 누락/오류는 `CONSULTATION_TIMES_INVALID`로 failed 처리합니다.
- transcript는 각 발화의 turn_id/role/content/start_sec만 새 객체로 선택합니다. 순서·문자열·공백/줄바꿈·역할·null 시점을 유지하며 재분석·정렬·수정하지 않습니다. 빈 대화는 빈 배열입니다. 내부 분석/위험 배지/end_sec/API key/access token은 포함하지 않습니다. purpose/ai_summary는 만들지 않습니다.
- `KCM_DEMO_STORE_ID`를 고객 ID와 동일하게 서버 환경설정에서 읽어 `server/app.mjs` → `server/live-calls.mjs`의 통화 생성 시 store_id로 보관합니다. `src/live/types.ts`에 선택적 필드를 추가해 기존 snapshot과 호환합니다. 브라우저 입력은 허용하지 않고 재등록으로 매장 ID를 덮어쓰지 않습니다. 미설정은 `STORE_ID_MISSING`/failed이며 결과를 보존합니다.
- `.env.example`은 빈 값, `render.yaml`은 sync:false 선언만 추가했습니다. 실제 매장 ID는 코드·테스트·문서에 커밋하지 않았습니다. 사용자 .env와 Render 설정은 읽거나 변경하지 않았습니다. 기존 서비스 이름·배포 구조·다른 환경변수는 유지합니다.
- `server/tests/n8n-delivery.test.mjs`: 기존 20개 검증을 확장하고 15개를 추가해 관련 35개 통과. `npm.cmd run check`: **전체 321개 테스트 통과**, 프런트/백엔드 전체 타입 검사 및 Vite 빌드 성공. 기존 SDK 큰 청크/MockTimers 경고만 있습니다.
- 자동 검증은 기존 계약 필드 유지, 상담 객체/서버 매장 설정, 원본 시각, 최종 정정된 대화의 순서·역할·내용·null 유지, 원본 비변경·민감 필드 제외·가짜 요약 부재, 매장 미설정/잘못된 시각 실패 보존, 브라우저 매장 주입 차단, 통화별 1회 POST를 포함합니다. 기존 로컬 HTTP 수신기/모의 Monitor 통합 검증도 통과했습니다.
- `docs/N8N_DELIVERY.md`, `docs/RENDER_DEPLOYMENT.md`, `server/README.md`의 설정/계약 안내를 갱신했습니다. 변경 파일은 위 서버 3개·타입·테스트·환경 예시·Blueprint·문서 3개와 STATUS.md입니다.
- consultation_id 생성·고객 정책·위험 분석/점수/최종화·전송 상태 전이/실패 보존·Retell/Monitor/SSE·직원 화면 코드는 유지합니다. `npm.cmd run preview:standalone` 성공, 생성 HTML과 프런트 빌드 산출물 내용 변경 없음. 기존 사용자 저장 데이터·미추적 파일은 보존했습니다.
- GitHub main에 반영하는 범위입니다. 사용자 요청에 따라 실제 Render 환경변수 수정·재배포·Production Webhook 호출은 수행하지 않았습니다. 실제 음성/n8n 수신·브라우저/독립 HTML 직접 실행은 이번 작업에서 미검증입니다. DB 테이블 추정·직접 INSERT·요약 모델은 추가하지 않았습니다.

## 최신 변경 — 최종 통화 결과 n8n 자동 POST / 2026-10-02

- `server/call-identity.mjs`: Web Call 생성 요청에서 Retell REST 호출 전에 `consultation_<숫자>`를 한 번 생성합니다. 밀리초 기준이며 같은 밀리초/시계 역행은 직전 값+1로 단일 프로세스 내 중복을 방지합니다. 실제 Retell call_id가 반환되면 최초 consultation_id와 서버 설정 customer_id를 연결합니다. 재등록/재연결/중복 종료로 덮어쓰지 않습니다.
- `server/n8n-delivery.mjs`, `server/live-calls.mjs`, `server/app.mjs`, `server/index.mjs`, `src/live/types.ts`: 기존 Monitor 종료와 최종 고성 측정의 유효성 검사로 final_result가 처음 확정될 때만 서버 fetch로 전송합니다. 확정 전·미측정·불완전 측정·Monitor 오류는 전송하지 않습니다. 최종화 순서와 기존 위험 계산은 그대로입니다.
- POST는 `call_id`, `consultation_id`, `customer_id`, 5개 signals, 5개 scores, `risk_score`, `risk_level`만 선택한 객체입니다. body wrapper/배열/transcript/음성/키/내부 메타데이터를 추가하지 않습니다. 기존 threat_count/blame_count 필드명을 유지하고 DB 변환/저장은 n8n 담당입니다.
- call_id별 `webhook_delivery`를 요청 전에 pending으로 선점하고 sent/failed로 종결합니다. 중복 종료/최종화/복수 구독자가 있어도 한 번만 자동 시도합니다. HTTP 오류·네트워크·10초 시간 초과·서버 종료는 고정 원인 코드로 기록하며 최종 결과/시각/이력을 보존합니다. URL·키·응답 본문·예외 원문은 로그에 남기지 않습니다.
- 자동 재시도·수동 재전송 API·영구 큐·직접 DB 조회/INSERT는 추가하지 않았습니다. 응답 유실 시 이미 상대가 처리했을 가능성이 있으므로 자동 재전송하지 않습니다. 전송 상태는 기존 통화와 같은 서버 메모리 수명입니다. 서버 재시작 뒤 영구 중복 방지는 이번 범위가 아닙니다.
- `.env.example`, `render.yaml`에 `N8N_WEBHOOK_URL`, `KCM_DEMO_CUSTOMER_ID`를 값 없이 추가했습니다(Render는 sync:false). 실제 URL과 테스트 고객 ID는 커밋하지 않습니다. 사용자가 로컬 .env/Render Environment에 직접 설정합니다. 고객 ID 미설정은 null 유지/전송 failed이며 임의의 고객으로 보충하지 않습니다. 실제 .env는 읽거나 변경하지 않았습니다.
- `server/tests/n8n-delivery.test.mjs` 신규 20개 + 기존 286개 = **전체 306개 테스트 통과**. `npm.cmd run check`에서 프런트/백엔드 전체 타입 검사와 Vite 빌드 성공. 기존 SDK 큰 청크/MockTimers 경고만 있습니다.
- 실제 Node HTTP/fetch와 설치된 Monitor SDK를 격리된 모의 전송/로컬 수신기로 연결해 두 통화의 ID 분리·정확한 JSON·최종화 이후 각 1회 수신·200/sent·SSE 복구와 비밀값 미노출을 확인했습니다. 4xx/5xx/리디렉션/네트워크/시간 초과/종료 실패 보존과 다른 통화 정상 처리를 확인했습니다. Production Webhook을 사용한 검증은 아닙니다.
- 기존 직원 화면·브라우저 통화/마이크·Monitor·SSE 전송 구현·텍스트/고성/점수 정책·예약 업무·패키지는 수정하지 않았습니다. 변경된 src는 타입 선언만이며 Vite 산출물 이름/내용은 기존과 동일합니다. 생성 번들에서 새 환경변수명·Webhook 주소 노출이 없음을 확인했습니다. `npm.cmd run preview:standalone` 성공, 생성 HTML 내용 변경 없음.
- 안내: `docs/N8N_DELIVERY.md` 신규, `docs/RENDER_DEPLOYMENT.md`, `server/README.md` 갱신. 기존 설정/서비스 이름 kcm/autoDeployTrigger:off는 보존했습니다. GitHub main 반영 후 사용자가 Environment 두 값을 설정하고 Manual Deploy → Deploy latest commit으로 적용할 수 있습니다.
- 사용자 요청으로 이번에는 코드·자동 검증·GitHub 반영까지만 진행합니다. 실제 Render 환경변수 편집/배포·Production 활성 상태·Retell 음성·n8n Executions/DB 저장·브라우저/독립 HTML 직접 실행은 **미검증**입니다. 사용자 저장 데이터와 기존 미추적 파일을 유지했습니다.

## 최신 변경 — Render 서비스 이름 일치 / 2026-10-01

- 사용자가 Render에서 변경한 서비스 이름에 맞춰 `render.yaml`의 `services[0].name`만 `kcm-team-test`에서 `kcm`으로 변경했습니다. 다른 배포 설정·환경변수·기능은 변경하지 않았습니다. 아래 이전 서비스 이름과 접속 주소는 당시 검증 기록입니다.
- `npm.cmd run check`: 전체 286개 테스트와 프런트·백엔드 타입 검사 통과. Vite는 샌드박스 상위 폴더 접근 제한으로 중단됐으며, 권한 승인 후 `npm.cmd run build`로 타입 검사·Vite 빌드 성공을 확인했습니다. 기존 SDK 청크 크기 경고만 남아 있습니다.
- `npm.cmd run preview:standalone` 성공, 생성 HTML 내용 변경 없음. 실제 변경 파일은 `render.yaml`과 이 검증 기록 `STATUS.md`입니다. 기존 미추적 파일과 사용자 변경은 보존했습니다.
- 이번에는 GitHub 반영 범위만 진행하며 Render Blueprint 동기화·재배포·브라우저 및 실제 통화 검증은 수행하지 않습니다.

## 최신 변경 — 배포 서비스의 공용 로그인 제거 / 2026-10-01

- 사용자 요청에 따라 전역 Basic Auth 검사·파싱·비교·로그인용401·브라우저 인증창 헤더와 전용 계정/비밀번호 환경변수 필수 검증을 제거했습니다. 로그인용 환경변수는 render.yaml, .env.example, 테스트와 안내에서 제거했습니다. 실제 로컬 .env는 읽거나 수정하지 않았습니다.
- `server/deployment.mjs`, `server/app.mjs`: 공개 화면·정적 파일·Retell 프록시·SSE를 인증 없이 제공합니다. HTTPS·Host/Origin·CORS·본문 검증·소스/비밀 파일 미제공은 유지합니다. 서버의 RETELL_API_KEY와 Retell 인증 실패 처리는 별개이며 그대로입니다.
- `src/dev/retellCall.ts`, `src/dev/RetellTestPage.tsx`, `src/dev/liveAudioReporter.ts`는 credentials:omit으로 브라우저에 남은 인증정보를 전달하지 않습니다. 화면·위험 분석·Retell SDK·Monitor·SSE 상태 관리와 예약·상담 기능은 변경하지 않습니다.
- `server/tests/deployment.test.mjs`의 기존 로그인 요구 테스트를 익명 접근·인증창 헤더 부재·공개 모의 통화/Monitor 등록/고성 수신/종료/SSE 검증으로 교체했습니다. API Key가 config·통화 응답·SSE·로그로 노출되지 않는 검증과 CORS/Host/경로 탐색 방어를 유지합니다.
- `npm.cmd run check`: **전체286개 테스트 통과**, 프런트 및 백엔드 전체 타입 검사·Vite 빌드 성공. 기존 SDK 청크 크기 경고와 MockTimers 경고는 실패가 아닙니다. 실제 음성 연결은 자동 테스트 성공과 구분합니다.
- GitHub main의 공개 접근 코드 커밋 **3b2890a**를 Render에 재배포했습니다. 배포 ID dep-dav072ojo6nc73et0ee0, **Deploy succeeded / Live**를 확인했습니다. 기존 자동 코드 배포가 꺼져 있어 환경변수 저장·재빌드 배포를 사용했습니다. Render의 폐기된 로그인 변수 두 개도 삭제됐고 환경설정에는 NODE_ENV/NODE_VERSION/RETELL_AGENT_ID/RETELL_API_KEY만 남아 있습니다. 비밀 값 표시·복사·로그 출력은 하지 않았습니다.
- 실제 인증정보 없는 HTTP 확인: `/`, `/health`, `/retell/config`, 빌드 JS/CSS, `/api/live-calls/events` 모두 **200**, 브라우저 인증창 헤더 없음. SSE는 text/event-stream과 snapshot 수신, 비밀 필드 부재를 확인했습니다. config는 agent_id/configured만 반환하고 configured:true입니다. `/.env`, `/server/deployment.mjs`는404로 보호됩니다.
- 새 IAB 브라우저에서 `https://kcm-team-test.onrender.com/#/home` 및 `#/retell-test`를 직접 열어 로그인창 없이 화면 표시를 확인했습니다. 홈/예약·상담관리/고객관리/상담지원/상품관리/스마트 재고/마케팅/매장관리8개 메뉴 이동과 각 제목을 확인했습니다. 홈 카드1/3/1/1, 고객 화면 백엔드 설정 확인 및 통화 시작 버튼 활성화, 양쪽 브라우저 오류0건입니다. 기존 직원/사용자 탭·샘플 기록은 초기화하지 않았습니다.
- 독립 미리보기 갱신 성공. 직접 실행한 검증은 위 배포 HTTP/브라우저 확인이며 독립HTML 직접 실행과 실제 Retell 음성 통화/마이크/새 실제 Monitor 연결은 이번에 재수행하지 않았습니다. Web Call·Monitor·SSE·위험 분석·고성 상태 머신·예약/지원 코드와 의존성의 git diff가 없음을 확인했고 기존 자동 회귀 검증을 유지했습니다.
- 로컬 검증 캡처: docs/render-public-home.png, docs/render-public-retell.png, docs/render-public-live.png. 임시 HTTP 검사 스크립트/로그는 정리했습니다. 신규 DB/n8n 인증/영구 저장/점수 정책은 추가하지 않았습니다.

## Render 배포 구성 / 2026-10-01

- https://github.com/rootgo1/kcm-web 비공개 저장소의 main과 Render kcm-team-test 무료 단일 서비스가 연결돼 있습니다. 저장소 루트에서 빌드하며 Node 서버가 dist와 API/SSE를 같은 HTTPS 주소에서 제공합니다. Render PORT/0.0.0.0과 로컬5173/8787 실행 방식은 유지합니다.
- Render에 필요한 비밀 값은 서버 전용 Retell 키입니다. 서버 재시작 시 메모리 실시간 기록은 사라지며 기존 데모·예약 저장 정책은 유지합니다. 무료 호스팅과 Retell 통화 비용은 별개입니다.
- 초기 배포 커밋 faeeb39에는 선별한94개 파일을 업로드했습니다. 실제.env·로그·의존성/빌드 폴더·로컬 통화 캡처를 제외했고, 연결 권한은 KCM 저장소 한 곳으로 제한했습니다. Git 생성 시 새.git 폴더만 사용자 소유자로 맞췄고 전역 신뢰 설정은 변경하지 않았습니다.
- 최초 배포 준비 당시286개 테스트·타입 검사·빌드와 격리8789의 홈/모의SSE/고객 화면을 확인했습니다. 당시 임시 접근 제한은 위 최신 요청으로 제거하며 이전 로그인 설정 안내를 현재 문서에서 정리했습니다. 준비 단계의 실제 음성·독립HTML 직접 실행·다른 기기/장시간 통화 검증은 수행하지 않았습니다.


## 최신 변경 — 고성 지속시간 조정 / 2026-10-01

- `src/dev/shouting.ts`의 감지 지속시간을 **600→350ms**, 해제 지속시간을 **500→300ms**로 변경했습니다. 감지 임계값0.12/해제 임계값0.08/측정 공백 기준400ms와 상태 머신 코드는 그대로입니다. 아래 과거 검증의600/500ms는 당시 설정 기록입니다.
- `tests/shouting.test.ts`를 새 기준에 맞췄습니다. 349ms 미감지/350ms 감지, 299ms 해제 안 됨/300ms 해제, 연속 고성1회 유지, 해제 도중 재상승 시 중복 없음, 정상 해제 뒤 재상승2회를 검증했습니다. 다른 텍스트 신호·위험 점수·UI·업무 로직은 수정하지 않았습니다. 화면의 기준 안내는 기존 상수 참조에 따라 자동 반영됩니다.
- `npm.cmd run check`: **281개 테스트 전체 통과**, 프런트·백엔드 타입 검사 및 Vite 빌드 통과. 기존 SDK 청크 크기·MockTimers 경고는 동일하며 실패가 아닙니다.
- `server/README.md` 기준값과 이 기록을 갱신했습니다. 지침에 따라 `npm.cmd run preview:standalone` 성공, `00_KCM_미리보기.html` 갱신. 실제 Retell 음성 및 독립 HTML 직접 실행은 이번 변경 후 재검증하지 않았습니다.
- 재검증 시 통화가 종료된 상태에서 고객 `#/retell-test`를 새로 열거나 새로고침해350/300ms 안내를 확인한 뒤 시작합니다. 프런트 상수 변경이므로 백엔드 재시작은 필요하지 않습니다.

## 최신 구현·검증 — 5개 신호·통화별 독립 위험도 / 2026-10-01

이번 절이 현재 정책입니다. 아래 과거 절의 고객 누적점수·선형 가감·불편감 정책은 이번 요청으로 대체됐으며 과거 작업 기록으로만 보존합니다. 경로는 C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3, 프로젝트 kcm-web / 0.3.0, Node.js 22.23.3입니다.

### 구현과 정책
- 신호는 **욕설 / 위협 발언 / 비난 표현 / 선정적 표현 / 고성** 순서입니다. 텍스트 네 항목은 USER만 보수적 규칙으로 분석하고 같은 turn_id 정정·삭제는 교체 후 합산합니다. 불편감 신호는 제거했습니다. 일반 불만·재설명 요청·단일 성 관련 단어·기본 인용/부정은 공격으로 간주하지 않습니다.
- 독립 보조 마이크의 RMS **0.12 이상 600ms** 지속 시 고성 구간에 진입하며 1회만 증가합니다. **0.08 이하 500ms** 지속 후 해제되고 다음 구간에서 다시 증가합니다. src/dev/shouting.ts 상수로 관리합니다. 400ms 초과 측정 공백을 연속 고성으로 추정하지 않습니다.
- 고성은 call_id별 POST /api/live-calls/:id/audio-signals → 동일 메모리 저장소 → 기존 SSE로 전파합니다. 원본 음성·RMS 샘플은 전송/저장하지 않습니다. 순서 번호·단조 횟수·닫힘 상태로 중복/역순/종료 뒤 갱신을 차단하며 최신 snapshot 재시도를 제공합니다.
- src/lib/riskPolicy.js가 프런트 데모·Node의 공통 계산 원본입니다. 각 통화는 항상 0부터 독립 계산하며 이전 점수 합산·조용한 통화 감점은 없습니다. 잘못된 횟수를 0으로 보정하지 않습니다.

| 항목 | 횟수 → 항목 점수 |
| --- | --- |
| 욕설 | 0→0, 1→3, 2~3→6, 4~6→10, 7 이상→15 |
| 위협 | 0→0, 1→20, 2→30, 3 이상→40 |
| 비난 | 0→0, 1→4, 2~3→8, 4~6→14, 7 이상→20 |
| 선정 | 0→0, 1→5, 2→10, 3 이상→15 |
| 고성 | 0→0, 1→2, 2→5, 3~4→8, 5 이상→10 |

- 합계를 raw_score로 보존하고 위협 2회는 최소 40, 3회 이상은 최소 60으로 보정한 뒤 99점 상한을 적용합니다. 등급 경계 0/20/40/60/80: 정상/주의/경계/위험/매우 위험.
- 통화 중 종합 숫자 점수는 표시하지 않습니다. 명확한 위협은 즉시 매우 위험 / 5단계 대응 경고로 표시하며 최종 점수와 구분합니다. 고성은 통화 전체 신호이고 특정 STT 말풍선에 연결하지 않습니다.
- 실제 Monitor 종료와 최종 고성 snapshot을 모두 확인하면 최종 점수를 한 번 확정합니다. 수신 순서는 무관합니다. 미측정·중단·누락은 점수 보류 사유로 표시합니다. 종료/최종 결과 재수신으로 확정 기록을 덮어쓰지 않습니다.
- 최종 객체는 call_id, customer_id, completed_at, signals(5개 횟수), scores(5개 점수), raw_score, adjusted_score, threat_floor, risk_score, risk_level, rule_version입니다. 직원 패널에서 전송 전 JSON을 확인할 수 있으며 n8n 요청은 없습니다.
- 데모 고객 ID별 통화 이력을 목록으로 제공하고 가장 최근 완료 통화의 점수를 **최근 통화 위험도**로 표시합니다. 최신 완료 통화가 미확정이면 대기로 표시하며 오래된 확정값을 최신값으로 오인시키지 않습니다. 새 통화는 0부터 시작하고 과거 기록은 유지합니다.
- 실제 Retell은 고객 식별 연동이 없으므로 customer_id:null입니다. 이름으로 고객을 합치거나 가상 고객 ID를 붙이지 않습니다. 고객별 서버 이력 구조는 명시적인 ID를 사용한 격리 테스트로 검증했습니다.
- 기존 예약 상담의 시작/완료/수정/집계/저장/이력, 관리자 지원, 통화 결과 입력/완료/다음 통화, 8개 메뉴·레이아웃은 유지합니다. 실제 통화와 기존 데모 현황 카드는 합치지 않습니다. 현재 메모리 유지 정책도 동일합니다.

### 변경 파일
- 수정: `tsconfig.test.json`, `tsconfig.json`, `tests/retell.test.ts`, `tests/liveCalls.test.ts`, `tests/domain.test.ts`, `tests/callWorkflow.test.ts`, `tests/callPresentation.test.ts`, `src/types.ts`, `00_KCM_미리보기.html`, `src/live/types.ts`, `src/live/LiveRiskSignals.tsx`, `src/live/LiveConsultations.tsx`, `src/live/liveCalls.ts`, `src/live/live-calls.css`, `src/lib/riskScoring.ts`, `src/lib/callWorkflow.ts`, `src/lib/callRisk.ts`, `src/lib/callPresentation.ts`, `server/text-risk.mjs`, `src/dev/RetellTestPage.tsx`, `server/tests/text-risk.test.mjs`, `server/README.md`, `server/live-calls.mjs`, `server/app.mjs`, `scripts/generate-preview.mjs`, `src/data/callMockData.ts`, `src/components/CallRiskDetails.tsx`, `src/components/CallOverview.tsx`, `src/components/CallBriefing.tsx`, `src/App.tsx`.
- 추가: `tests/shouting.test.ts`, `tests/riskPolicy.test.ts`, `docs/qa-call-risk-history.png`, `docs/qa-call-risk-final.png`, `src/lib/riskPolicy.js`, `src/dev/shouting.ts`, `src/dev/liveAudioReporter.ts`, `server/tests/call-risk.test.mjs`.
- STATUS.md를 갱신했고 명령 실행에 따라 dist/.test-dist도 갱신했습니다. 작업 전 125개 파일 해시와 비교해 삭제 파일이 없으며 package.json/package-lock.json, Retell 컨트롤러·Monitor·API 설정, 독립 마이크 취득/정리 코드, 기존 예약 저장소·지침·DB/데이터 명세는 보존했습니다. 키/토큰 출력·사용자 저장 데이터 초기화·새 의존성·커밋/푸시는 없습니다.

### 자동·모의 검증
- 최종 npm.cmd run check: **281개 전체 통과**, 프런트 전체 TypeScript와 백엔드 JSDoc 타입 검사 통과, Vite 80 modules 빌드 성공. 기존 Retell SDK 약 597KB 청크 경고와 MockTimers 실험 경고는 실행 실패가 아닙니다.
- 자동: 다섯 점수표의 모든 요청 경계, 등급 경계, 부정/소수/NaN/Infinity/누락값, 예시 39점, 위협 2회 최소40/3회 최소60, 항목 최대 합계100→99, 무신호0, 고객별 47/80/26 독립 이력과 다음 통화 초기0을 확인했습니다.
- 자동: 고성 짧은 초과0/지속1/유지1/해제·재상승2/임계값 흔들림/샘플 공백/통화 분리, 전송 중 종료·순서·중복·재시도, 동일 turn 정정/캐시, 정상 문장 오탐, 네 텍스트 유형, 지원·상담 완료 회귀를 검증했습니다.
- 백엔드 실제 HTTP/SSE handler를 사용하는 격리 테스트에서 call_id 수신·검증·종료 전 점수 없음·어느 순서로 종료돼도 단 한 번 확정·미측정 보류·완료 이력 분리를 확인했습니다. 이 테스트는 실제 Retell 음성 검증과 다릅니다.
- Chrome 격리 모의 SSE: 통화 중 욕설2/위협1/비난3/선정0/고성2 및 위협 경고만 표시 → 종료 후 **39점 / 주의**와 항목6/20/8/0/5, 최종 객체 표시를 확인했습니다.
- Chrome 기존 데모 흐름: C-003 상담 시작→결과 기록→확인→완료 **14점**, 동일 고객 다음 C-006 초기0→완료 **0점**, 두 이력 유지 및 최근 위험도0, 중복 다음 통화 차단을 확인했습니다. 실제 고객 음성과 별개인 모의 검증입니다.
- 캡처 docs/qa-call-risk-final.png, docs/qa-call-risk-history.png는 모의 데이터입니다. 브라우저 콘솔 오류/경고 없음. 기존 예약 완료·수정 전체 수동 재수행은 이번에 반복하지 않았으며 자동 회귀로 확인했습니다.
- npm.cmd run preview:standalone 갱신 성공. 생성 HTML의 직접 실행 확인 결과는 아래 최종 검증 기록에 기재합니다.

### 최종 확인 기록
- 두 번째 실제 통화: call_de8e81ae5cde4dce6491e5dbb73, 14:49:46~14:50:18 KST. 실제 USER의 “일을 왜 이렇게 못 해요?”를 **비난1회**로 탐지했습니다. 통화 중 SSE는 비난1/고성0·최종 점수 없음, 종료 뒤 최종 **4점 / 정상**과 다섯 횟수·항목 점수 payload 생성을 확인했습니다. 기존 직원 패널에도 비난 배지·4점이 표시됐습니다.
- 실제 고성 snapshot은 두 통화 모두 정상 측정/구간 누락 없음/최종 닫힘으로 수신됐지만 **고성 증가(1회 이상)는 미검증**입니다. 자동·모의 고성 카운팅 성공과 구분합니다. 두 번째 종료 뒤 보조 마이크 대기·레벨0.00·재시작 가능 상태도 확인했습니다.
- 실제 비난 이외 욕설·위협·선정 음성 탐지는 이번에 재수행하지 않았습니다. 네 텍스트 규칙과 위협 보정은 자동·모의 검증입니다. 실제 고객 ID 매핑/장시간/탭 비활성 측정/다양한 마이크의 판정 정확도는 미검증입니다.
- 재시작 직전 열려 있던 직원 탭에 이전 종료 결과가 남는 현상을 관찰했습니다. 원인은 이번 작업에서 확정하지 않았습니다. 사용자 데이터 초기화 없이 예약·상담 메뉴→홈 이동으로 재구독해 최신4점 복구를 확인했습니다. 서버 재시작 뒤 자동 복구까지 성공했다고 보고하지 않습니다.
- 독립 HTML을 별도 로컬 HTTP에서 직접 열어 KCM 공통 상단·8개 메뉴·기본 카드1/3/1/1·진행 중 종합 점수 없음·C-004 위협 경고를 확인했습니다. file:// 실행은 미검증입니다. 별도 1366×768/390px 크기 지정 검사는 이번에 반복하지 않았습니다.
- 실제 검증 캡처 docs/qa-call-risk-actual.png를 추가했습니다. 모의 서버/관찰 프로세스/검증용 중복 탭은 정리하고 사용자 프런트·백엔드와 기존 탭을 유지합니다. 기존 직원 탭에는 최신 완료 결과를 열어두었습니다.
- 다음 제안: 실제 마이크·거리별 고성 지속 기준을 검증하고, 서버 재시작 후 직원 SSE 자동 복구를 점검한 다음 고객 ID 연결과 n8n/DB 범위를 별도로 결정합니다. 이번 작업에서 후속 연동은 진행하지 않았습니다.

### 실제 검증·임시 가정·남은 범위
- 사용자 백엔드 재시작 후 새 고성 endpoint 및 실제 SSE HTTP200을 확인했습니다. 첫 실제 통화에서 Web Call·Monitor·USER/AGENT 수신·고성 snapshot·종료·직원 패널 최종0점 표시까지 확인했습니다.
- 첫 실제 STT가 “일을 왜 이렇게 못 해요?”로 띄어 써 비난 규칙이 미탐했습니다. 못 뒤 공백을 허용하도록 최소 수정하고 실제 수신 문장·정정 중복 회귀 테스트를 추가해 281개가 통과했습니다. 첫 기록은 당시 결과이며 수정 후 비난 감지 성공을 의미하지 않습니다.
- 첫 실제 통화 고성은 0회였습니다. 음성 레벨0.14를 한 번 관찰했으나 600ms 지속 조건의 충족 증거가 없어 실제 고성 증가 성공으로 보고하지 않습니다.
- RMS 기준은 마이크 감도·거리·브라우저 음성 처리·소음 영향을 받는 임시 기준입니다. 고객 테스트 페이지를 전경에 유지해야 연속 측정이 가능하며, 비활성 탭 측정 중단을 감지하면 최종 점수를 보류합니다. 의미 기반 고성 판정이나 openSMILE 분석이 아닙니다.
- 텍스트 규칙은 제한된 표현을 대상으로 하며 문맥·STT 변형·은어의 오탐/미탐 가능성이 남습니다. 실제 고객 식별 연결과 영구 이력 저장은 이번 범위가 아닙니다.
- 제외: openSMILE/Python/정밀 모델/학습/n8n 전송/Supabase DB/실제 전화망/평균 위험도/실시간 종합 점수/테스트 화면 최종 디자인/배포/커밋·푸시.
- 확인: 고객 http://127.0.0.1:5173/#/retell-test → 보조 마이크 정상→통화→종료. 직원 http://127.0.0.1:5173/#/home → 실시간 상담 보기. 데모 이력은 기존 통화의 완료 기록에서 확인합니다. 서버 변경은 npm.cmd run server 재시작으로 반영합니다.

## 최신 구현·검증 — Retell 테스트 페이지의 독립 보조 마이크 레벨 / 2026-10-01

- 범위: 기존 `#/retell-test`에 임시 개발용 **보조 마이크 분석(대기/정상/오류), 현재 음성 레벨 0.00~1.00, 레벨 바, 시작/중지 버튼**만 추가했습니다. 작업 경로와 `kcm-web / 0.3.0`, Node.js 22.23.3을 확인했습니다.
- `src/dev/auxMic.ts`: 별도 `getUserMedia({ audio: true })` 스트림과 AudioContext → MediaStreamAudioSourceNode → AnalyserNode를 소유합니다. 파형의 RMS를 0~1로 제한해 약 100ms 간격으로 표시하며 출력 스피커에는 연결하지 않습니다. Retell 스트림/SDK 내부, 서버, SSE, 기존 텍스트 위험 분석, DB, API Key, 의존성은 변경하지 않았습니다. 녹음·서버 전송·고성 판정·openSMILE은 구현하지 않았습니다.
- 수동 중지, Retell 통화 종료 버튼/SDK 종료 알림, 페이지 unmount에서 보조 track·AudioContext·animation frame·이벤트 구독을 정리합니다. 중복 시작을 막고, 취소/페이지 이동 후 늦게 승인된 마이크도 즉시 해제합니다. 권한 거부·장치 없음/점유·오디오 중단을 별도 안내하며 보조 측정 실패가 Retell 통화를 종료하지 않습니다.
- 변경 파일: 추가 `src/dev/auxMic.ts`, `tests/auxMic.test.ts`; 수정 `src/dev/RetellTestPage.tsx`, `src/dev/retell-test.css`, `tests/retell.test.ts`(신규 테스트 등록), `STATUS.md`; 생성/갱신 `docs/retell-aux-mic.png`, `00_KCM_미리보기.html`, 명령 실행에 따른 dist/.test-dist.
- 작업 전 122개 파일 해시와 비교해 위 범위만 변경되고 삭제 파일은 없음을 확인했습니다. 기존 Retell 호출 제어(`retellCall.ts`), 서버/SSE/위험 분석, 직원용 소스, package.json/package-lock.json, 데이터 명세를 보존했습니다.
- `npm.cmd run check` 성공: **224개 테스트 통과(기존 213 + 신규 11)**, 프런트 전체/백엔드 타입 검사·Vite 빌드 성공(77 modules). 신규 테스트는 RMS, 통화 없는 측정 갱신, 중복 시작, 중지/unmount, 늦은 권한 승인, 재시작 격리, 권한/장치 오류, context 시작 실패·중단, 자원 해제를 검증했습니다. 기존 Retell SDK 약 597KB 청크 경고와 MockTimers 실험 기능 경고는 기존과 동일합니다. 초기 검증에서 테스트용 EventTarget 모형의 타입 오류를 수정한 뒤 전체 검증을 통과했습니다.
- **실제 Chrome + 실제 마이크, Retell 통화 없이 검증**: 상태 정상, 화면 레벨 0.01 → 0.03 및 레벨 바 갱신 확인. 중지하면 대기/0.00으로 돌아오고 재시작 가능. 측정 중 직원 홈 이동 후 테스트 페이지 복귀 시 대기 상태 확인. 검증 탭 콘솔 오류·경고 없음, 현재 브라우저 폭에서 가로 넘침 없음. 마이크는 검증 후 해제했습니다. 자원 해제의 track/context 호출은 자동 테스트에서도 확인했습니다.
- `npm.cmd run preview:standalone`으로 독립 HTML 갱신 성공. 독립 HTML 직접 실행은 이번 작업에서 재검증하지 않았으며 보조 마이크/Retell 검증은 Vite의 `#/retell-test`를 사용합니다.
- **미검증**: 실제 Retell 음성 통화와 보조 마이크의 동시 입력/실제 통화 종료 시 해제, 물리 장치 점유·권한 거부 재현, 다른 브라우저·장치. 이 항목들은 실제 동시 사용 성공으로 보고하지 않습니다. 기존 직원용 업무의 수동 전체 재검증은 하지 않았고 기존 자동 회귀 테스트는 유지·통과했습니다.
- 사용자 확인: `http://127.0.0.1:5173/#/retell-test` → **보조 마이크 시작** → 권한 허용 후 말하면서 값/막대 확인 → **통화 시작** → AI와 통화하면서 같은 값이 계속 바뀌는지 확인 → **통화 종료** 후 보조 상태 대기/0.00 확인. 통화 중 보조 마이크를 켜는 순서도 가능합니다. 매우 작은 입력은 두 자리 반올림으로 0.00처럼 보일 수 있습니다. 프런트 변경만 있으므로 백엔드 재시작은 필요하지 않습니다.

## 최신 구현·검증 — 실시간 USER 발화의 욕설·위협·불편감 표시 / 2026-10-01

이번 절이 현재 상태입니다. 사용자가 이전 단계의 **실제 Web Call → Monitor → SSE → 직원 대화·정정·종료 표시 성공**을 확인했습니다. 이번 변경은 그 구조를 유지하면서 서버의 고객 발화 텍스트 규칙 분석과 직원 패널 표시만 추가했습니다. 작업 경로 `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`, `kcm-web / 0.3.0`입니다.

### 구현·규칙·보존 범위
- `server/text-risk.mjs`: 독립 순수 함수 `analyzeRiskText` 및 통화 단위 `analyzeTranscriptRisk`. **local-text-rules-v1** 시험 규칙이며 외부 AI/네트워크 호출이 없습니다. USER만 분석하고 AGENT/도구/node/DTMF는 고객 신호에 포함하지 않습니다.
- 욕설/위협/불편감을 별도 occurrence로 셉니다. 동일 범위의 같은 항목은 중복 집계하지 않고 한 발화에 여러 종류가 있으면 각각 표시합니다. 위협은 상대방을 지목한 위협적 방문 의사 또는 명시적 보복/폭력 표현을 사용합니다. 단순 매장 방문·단독 주소 질문은 위협으로 단정하지 않습니다. 기본 부정·인용/전언 문맥도 제외합니다.
- ‘아 답답하네요.’ 및 ‘상담사분이 너무 답답하게 설명하시네요.’는 불편감 1회, ‘사람이 뭐라 하는 거야? 내가 너 찾아간다.’는 위협 1회, ‘내일 매장에 찾아가겠습니다.’는 위협 0회입니다. 이는 입력 텍스트 기준의 검증이며 이번 단계 실제 음성 성공 기록은 아닙니다.
- call_id별 `risk_analysis.analysisByTurn[turn_id]`를 현재 USER snapshot으로 재구성합니다. 정정·삭제·역할 변경은 이전 결과를 교체/제거한 뒤 합산합니다. 동일 USER 텍스트는 캐시해 AGENT 업데이트마다 재분석하지 않습니다. transcript와 결과를 같은 SSE payload에 원자적으로 반영합니다.
- 기존 `GET /api/live-calls/events`/이벤트 구조를 유지하고 통화 객체에 `risk_analysis`만 확장했습니다. ruleVersion/분석한 USER 수/세 횟수/위협 여부/발화별 signals를 포함합니다. 분석 실패·옛 백엔드·잘못된 분석 payload는 0으로 보정하지 않고 정보 대기로 표시하며 기존 대화는 계속 전달합니다.
- 기존 실시간 패널에 ‘현재 감지 신호’, USER 말풍선에 ‘욕설 감지/위협 발언/불편감 표현’ 배지를 추가했습니다. 분석 영역에서는 욕설 원문을 반복하지 않습니다. AGENT 말풍선에는 배지를 붙이지 않습니다. 위협이 하나라도 있으면 **현재 통화 대응 경고 · 매우 위험 / 5단계**를 표시하고 정정으로 근거가 사라지면 제거합니다. 위협 없는 경우 다른 종합 단계는 만들지 않습니다.
- 종료/Monitor 오류 뒤 마지막 감지 결과를 대화와 함께 서버 메모리에 보존합니다. 새 call_id는 별도 결과이며 메뉴 복귀·새로고침·재연결 시 snapshot으로 복원합니다. 서버 재시작 시 사라집니다.
- 고성 탐지, 고객 누적 risk_score, 욕설 +6/위협 +80 등의 실제 점수 반영은 **없습니다**. 기존 데모 점수/완료/지원/다음 통화/예약·상담/메뉴·집계·저장 방식을 변경하지 않았습니다. 실제 통화와 기존 데모 카드도 합치지 않았습니다.
- 한계: 제한된 한국어 구문 규칙으로 모든 문맥을 이해하지 않습니다. 은어·완곡한 위협·복합 부정·띄어쓰기/음성 인식 변형·발화 간 맥락에는 오탐/미탐 가능성이 있습니다. 위협 미감지는 안전 판정이 아닙니다. 검증된 AI 모델·KT 공식 정책으로 표현하지 않습니다.

### 변경 파일
- 추가: `server/text-risk.mjs`, `server/tests/text-risk.test.mjs`, `src/live/LiveRiskSignals.tsx`.
- 수정: `server/live-calls.mjs`, `src/live/types.ts`, `src/live/liveCalls.ts`, `src/live/LiveConsultations.tsx`, `src/live/live-calls.css`, `tests/liveCalls.test.ts`, `server/README.md`, `STATUS.md`.
- 갱신/생성: `00_KCM_미리보기.html`, **모의 검증 화면** `docs/qa-live-risk-1366.png`, `docs/qa-live-risk-390.png`. 명령 실행에 따라 dist/.test-dist도 갱신했습니다.
- 작업 전 117개 파일 해시와 비교했습니다. `server/monitor.mjs`, `app.mjs`, `index.mjs`, `live-events.mjs`, Vite 설정, `src/dev/`, 기존 업무 로직/데이터/화면/테스트, package.json/package-lock.json/.gitignore, 지침/데이터 명세/DB 문서는 보존됐고 삭제 파일은 없습니다. 사용자 .env를 수정하거나 키/토큰을 출력하지 않았으며 새 패키지도 추가하지 않았습니다.

### 자동·모의 검증 결과
- Node.js 22.23.3. `npm.cmd run check`: **213개 테스트 전체 통과(기존 190 보존 + 신규 23)**, 프런트 전체 타입 검사·백엔드 JSDoc 타입 검사·Vite 빌드 성공(76 modules). 기존 SDK 약 597KB 지연 청크와 MockTimers 실험 기능 경고는 남아 있으며 실행 실패는 아닙니다.
- 자동: 요청한 두 문장, 단순 방문 2종, 직접 폭력/보복, 단독 주소 질문과 명시적 위협 동반, 불편감 유형 5종, 같은 욕설 반복 occurrence, 비욕설 유사어, 기본 부정·인용/전언, 같은 turn 점진 수정/중복 snapshot/짧아진 정정/삭제, AGENT 제외, call 간 분리·종료 보존·재시작 초기화·특수 ID를 검증했습니다.
- 프런트 자동: 서버 결과와 대화 동시 교체, 위협 정정 제거, 누락/잘못된 분석에도 대화 보존, AGENT/없는 turn에 붙은 잘못된 결과 거부. 기존 예약·상담 완료/수정/점수/지원 등 회귀 테스트도 전체 통과했습니다.
- **설치된 실제 SDK + 가짜 WebSocket** → 실제 메모리 분석 → 실제 SSE handler 통합 테스트에서 USER 2개가 불편감 1/위협 1로 함께 전달되고 정정·종료까지 유지되는 것을 확인했습니다. 실제 Retell 외부 통화를 의미하지 않습니다.
- 캐시 테스트: AI transcript 500회 변경 동안 동일 USER 분석은 1회, 새 네트워크 호출은 0회. 이 환경의 해당 테스트 루프는 약 5.9ms였습니다. 실제 음성 통화 지연 측정이나 서비스 성능 보장은 아닙니다.
- **Chrome 격리 모의 SSE**: ‘아 답답하네요.’ → 불편감 1회/USER 배지, 같은 u2의 ‘내가 너’ → 완성 위협 문장 → 반복 전달 후에도 위협 1회·메시지 3개 유지·5단계 경고. u2를 단순 매장 방문으로 정정하면 경고/위협 배지가 제거됐습니다. AGENT의 폭력/불편 문장은 카운트·배지에 포함되지 않았습니다.
- 모의 욕설 2회+불편감 발화에서 복수 배지, 분석 영역에 원문 반복 없음 확인. 종료 후 욕설 2/위협 1/불편감 2 유지, 새 통화 0/0/0 분리, 메뉴 복귀·새로고침 후 종료 결과 복구 확인. 기존 네 카드 **1/3/1/1 유지**. Chrome 콘솔 오류·경고 없음.
- 실제 CSS **1366×768/390×844**에서 감지 신호와 대화가 자연스럽게 배치됐고 가로 넘침이 없었습니다. 위협 예시의 대화 영역은 각각 약 313px/301px로 유지됐습니다. 긴 패널은 기존 내부 세로 스크롤을 사용하며 닫기 버튼에 접근 가능합니다. 임시 viewport 설정은 해제했습니다.
- `npm.cmd run preview:standalone` 성공. 생성 HTML을 로컬 HTTP로 직접 실행해 홈·8개 메뉴 렌더링과 실시간 의존성 없이 동작함을 확인했습니다. file:// 실행은 이번에 미검증입니다.

### 실제 연결 검증 및 남은 항목
- 사용자가 백엔드 재시작을 완료했습니다. 이후 실제 8787 SSE의 **HTTP 200/빈 snapshot**과 직원 홈 렌더링을 확인했습니다. 실제 음성 테스트는 사용자가 나중에 진행하기로 하여 **이번 분석 추가 후 음성 → badge/집계/위협 경고는 미검증**입니다. ‘아 답답하네요.’와 ‘내가 너 찾아간다.’는 자동/모의 검증에서만 각각 기대 결과를 확인했습니다.
- 모의 서버와 별도 읽기 전용 관찰 프로세스는 정리했습니다. 사용자 프런트/백엔드는 유지했고 실제 통화를 대신 생성하거나 사용자 기록을 초기화하지 않았습니다.
- 제외: DB/Supabase/n8n/openSMILE/고성/최종 고객 점수/외부 AI API/관리자 자동 호출/Retell Agent prompt 변경/takeover/transfer/고객 테스트 디자인/커밋·푸시·배포. 기존 업무 전체 수동 재수행은 미검증이며 자동 회귀로 확인했습니다.
- 확인 경로: 고객 `http://127.0.0.1:5173/#/retell-test`에서 통화 → 직원 별도 탭 `http://127.0.0.1:5173/#/home` → **실시간 AI 상담 → 실시간 상담 보기**. 서버를 껐다면 같은 프로젝트 폴더에서 `npm.cmd run dev`와 `npm.cmd run server`를 각각 실행합니다.
- 다음 단계 후보: 우선 두 문장의 실제 음성 검증, 이후 별도 승인 범위에서 오탐/미탐 사례를 수집해 규칙 보완 또는 모델 교체를 검토합니다. 음성 분석·최종 점수 통합은 별도 후속 작업이며 이번에는 진행하지 않았습니다.

## 최신 구현·검증 — Retell Monitor → SSE → 직원용 실시간 대화 / 2026-10-01

이번 절이 현재 상태입니다. 사용자께서 1단계 실제 Web Call·Monitor·USER/AGENT 수신·종료 성공을 확인하셨습니다. 이번에는 그 연결 코드를 재사용해 직원 홈의 독립 실시간 대화 영역까지 구현했습니다. **이번 변경 후 실제 고객 음성 → 직원 말풍선 확인은 미검증**이며 아래의 모의 검증과 구분합니다. 경로 `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`, 프로젝트 `kcm-web / 0.3.0`입니다.

### 핵심 구현 및 데이터 처리
- `server/live-calls.mjs`: call_id별 connecting/live/ended/error와 최신 전체 transcript를 서버 메모리에 보관합니다. SDK `onTranscript`의 전체 목록을 정규화해 교체하며 append하지 않습니다. user/agent만 직원용으로 내보내고 원본 SDK의 도구/node/DTMF 처리는 유지합니다.
- Retell 발화 ID를 `turn_id`로 사용합니다. ID가 없을 때만 원본 snapshot 순서+role을 사용합니다. 같은 ID의 확장·짧아진 정정은 같은 메시지로 교체합니다. fallback은 원본 목록 중간 삽입/재정렬까지 동일 발화를 식별할 수 있다고 보장하지 않습니다. SDK가 제공하지 않는 발화 종료 시각은 `end_sec: null`이며 임의 생성하지 않습니다.
- `server/live-events.mjs`: `GET /api/live-calls/events`, 표준 text/event-stream. 새 연결마다 `{type:'snapshot', calls:[...]}`를 즉시 보냅니다. 변경 이벤트는 call_status/call_started/transcript/call_ended/call_error이며 해당 통화의 전체 상태와 messages를 포함합니다. API Key/access_token/raw 응답은 포함하지 않습니다.
- 15초 heartbeat·2초 EventSource 자동 재연결. 연결 종료/오류 때 구독·타이머를 해제합니다. 큰 snapshot은 버퍼 배출을 기다리고 그동안의 변경을 최신 전체 snapshot 하나로 합쳐 전송하며, 30초간 전송 불가 시 종료합니다. HTTP 404/503 등 자동 재시도가 중단되는 경우에는 ‘다시 연결’로 복구합니다.
- `server/monitor.mjs`/`index.mjs`/`app.mjs`가 같은 메모리 저장소를 사용합니다. 원격 call_ended만 종료로 기록하고, Monitor 오류·로컬 정리는 실제 전화 종료와 구분합니다. 반복 종료는 최초 시각과 대화를 덮어쓰지 않습니다. 기존 콘솔의 이어짐/정정 진단 출력은 유지하며 화면에서 그 로그를 파싱하지 않습니다.
- `src/live/`: 실제 통화가 있을 때 홈에 작은 인입 영역을 표시합니다. 고객명은 ‘고객 확인 전’, 기존 Modal에 고객/KCM AI 말풍선·상태·작은 통화 식별 정보를 제공합니다. 끝난 대화는 열린 패널에 유지하고 최근 종료 통화를 홈에서 다시 볼 수 있습니다. 다른 통화는 call_id별로 분리합니다.
- 과거 대화를 읽는 중에는 스크롤을 강제로 내리지 않고 ‘최신 대화 보기’를 제공합니다. 새로고침·메뉴 복귀·재연결은 서버 snapshot으로 복구합니다. 통화/대화는 서버 재시작 시 사라지며 영구 저장하지 않습니다. 서버 시작 후 생성된 통화만 추적합니다.
- 실제 통화는 기존 데모 통화·예약·위험 점수·관리자 지원·네 카드 집계와 합치지 않습니다. 기존 고객 테스트 페이지의 UI/음성 동작은 변경하지 않았습니다. 키/토큰 출력·저장, 새 의존성·DB·외부 공개는 추가하지 않았습니다.

### 변경 파일 및 보존
- 추가: `server/live-calls.mjs`, `server/live-events.mjs`, `server/tests/live-calls.test.mjs`, `src/live/types.ts`, `src/live/liveCalls.ts`, `src/live/LiveConsultations.tsx`, `src/live/live-calls.css`, `tests/liveCalls.test.ts`.
- 수정: `server/app.mjs`, `server/index.mjs`, `server/monitor.mjs`, `vite.config.ts`(SSE 프록시), `src/App.tsx`(홈 삽입), `src/components/Modal.tsx`(기존 기본값을 유지하는 선택적 상단 문구), `package.json`/`tsconfig.test.json`(테스트 등록), `scripts/generate-preview.mjs`(독립 HTML의 실시간 구독 비활성 표시), `README.md`, `server/README.md`, `STATUS.md`.
- 생성/갱신: `00_KCM_미리보기.html`, `docs/qa-live-sse-1366.png`, `docs/qa-live-sse-390.png`; 검사에 따른 dist/.test-dist. 캡처는 **모의 SSE 데이터 화면**입니다.
- 작업 전 107개 파일 해시와 비교해 요청 범위의 파일만 변경되고 삭제 파일은 없음을 확인했습니다. `src/dev/`, 기존 예약/통화/위험/지원 로직·샘플 데이터·저장소·기존 테스트, Layout/메뉴/전체 스타일, package-lock.json/.gitignore/환경설정 예시, 데이터 명세/DB 문서를 보존했습니다. 사용자 `.env` 값은 출력하거나 변경하지 않았습니다.

### 실행한 검증
- Node.js 22.23.3 / npm 10.9.9. 최종 `npm.cmd run check` **190개 전체 통과**(기존 175 보존 + 신규 15). 프런트 TS/TSX·백엔드 JSDoc 타입 검사 성공, Vite 빌드 성공(75 modules). MockTimers 실험 기능 경고와 기존 Retell SDK 지연 청크 약 597KB 경고가 있으나 실패는 아닙니다.
- 자동 테스트: 전체 snapshot 교체/짧아진 정정/중복 이벤트/역할 필터/fallback ID, 통화별 분리·복사 격리·최초 종료 시각·종료 후 보존·재시작 초기화, 비밀 필드 제외, 구독 정리/오류 격리/heartbeat/느린 전송. 실제 HTTP SSE의 초기 300KB 한국어 snapshot·이후 갱신·종료·재연결·CORS·정리를 확인했습니다.
- 실제 설치 SDK + 가짜 WebSocket 자동 테스트로 Monitor snapshot/update/종료/오류와 메모리 저장소 연결을 검증했습니다. 실제 Retell 외부 연결을 뜻하지 않습니다. 프런트 테스트는 전체 상태 교체·잘못된 payload 거부·EventSource 구독/해제 및 중복 방지·스크롤 기준을 확인합니다.
- **Chrome 모의 브라우저 검증**: 격리된 localhost QA 서버에서 실제 SSE handler/store와 빌드된 UI를 사용했습니다. 빈 상태에서 실시간 영역 없음 → 통화 인입 → 패널 열기 → 고객/AI 각 1개 말풍선 → 두 발화 정정 후에도 2개 유지. 긴 대화 50개 자동 하단 따라가기, 위로 읽는 중 새 51번째 발화 수신 시 scrollTop 0 유지, ‘최신 대화 보기’ 이동을 확인했습니다.
- 모의 종료를 두 번 보내도 열린 패널의 51개 대화·종료 시각 유지. 새 call_id의 1개 대화가 이전 것과 섞이지 않았습니다. 예약·상담 메뉴 이동/홈 복귀·새로고침 후 현재/종료 통화 복구, SSE 중단 시 안내+마지막 대화 보존, HTTP 오류 후 수동 재연결, 일시 끊김 후 자동 재연결을 확인했습니다. 기존 카드 **1/3/1/1 유지**. 키보드 Escape로 패널 닫기 확인.
- 실제 CSS 화면 크기 **1366×768 / 390×844**에서 말풍선·패널·버튼·좁은 화면 인입 배치를 확인했고 본문 가로 넘침이 없었습니다. 임시 크기 설정은 해제했습니다. Chrome 검증 탭 콘솔 경고/오류 없음.
- `npm.cmd run preview:standalone` 성공. 생성 HTML을 로컬 HTTP에서 직접 실행해 기존 홈·메뉴·기본 집계 렌더링을 확인했습니다. 독립 HTML은 직원용 데모만 제공하며 SSE/Retell 실행은 Vite+백엔드 주소를 사용합니다.
- 사용자가 백엔드를 재시작한 뒤 실제 8787 SSE **200 / text/event-stream / 빈 snapshot**, 5173 Vite 프록시의 같은 응답 및 Chrome 홈의 빈 상태를 확인했습니다. 사용자 강의 일정으로 실제 고객 음성 참여 테스트는 진행하지 않았습니다. 실제 통화를 새로 만들거나 음성 성공으로 기록하지 않았습니다.
- Codex 내장 브라우저에서는 재연결 안내가 남아 SSE 성공을 확인하지 못했습니다. 백엔드·프록시 HTTP와 Chrome 구독은 정상이며 내장 브라우저 원인은 확정하지 않았습니다. 검증용 모의 서버는 종료하고 사용자 프런트/백엔드 프로세스는 유지합니다. 사용자 기록을 초기화하지 않았습니다.

### 미검증 / 제외 / 확인 경로
- 미검증: 이번 변경 후 **실제 Retell 통화 중 고객·AI 말풍선/실제 정정/실제 종료 표시/두 번째 음성 통화**. 기존 1단계 성공은 사용자 확인 기록이며 2단계 실제 성공으로 대체하지 않습니다. 기존 예약 완료·수정 등 전체 수동 회귀는 이번에 반복하지 않았으며 기존 자동 테스트로 검증했습니다. file:// 독립 실행·다른 브라우저 조합도 미검증입니다.
- 제외: 위험 분석/점수 통합, 고객 DB, 영구 저장, n8n, openSMILE, 지원/상담 시작/takeover/전화 transfer, 고객 테스트 디자인 변경, 커밋·푸시·배포.
- 실행: 프로젝트 폴더에서 터미널 1 `npm.cmd run dev`, 터미널 2 `npm.cmd run server`. 이번 서버 변경은 사용자 재시작으로 반영됐습니다. 기존 사용자 `.env`를 그대로 사용합니다.
- 고객 `http://127.0.0.1:5173/#/retell-test`에서 통화 → 직원 `http://127.0.0.1:5173/#/home` → **실시간 AI 상담 → 실시간 상담 보기**. 이후 사용자가 통화 가능할 때 실제 음성 전달만 추가 확인하면 됩니다. 이번 범위를 넘어선 기능은 진행하지 않았습니다.

## 최신 구현·검증 — Retell Web Call·서버 Monitor 1단계 / 2026-10-01

이번 절이 현재 상태입니다. 기존 직원용 화면·통화/예약 업무 로직을 변경하지 않고 개발용 통화 경로와 로컬 백엔드만 추가했습니다. 프로젝트 경로 `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`, 이름/버전 `kcm-web / 0.3.0`을 확인했습니다.

### 구현 및 변경 파일
- 추가: `server/index.mjs`, `server/app.mjs`, `server/monitor.mjs`, `server/README.md`, `server/tests/retell.test.mjs`, `.env.example`, `tsconfig.server.json`.
- 추가: `src/EntryRouter.tsx`, `src/dev/RetellTestPage.tsx`, `src/dev/retellCall.ts`, `src/dev/retell-test.css`, `tests/retell.test.ts`.
- 수정: `src/main.tsx`(개발 경로 분기), `vite.config.ts`(로컬 `/retell` 프록시), `package.json`/`package-lock.json`(SDK 3.0.2 고정·server 명령·검사 확장), `tsconfig.test.json`, `scripts/generate-preview.mjs`(독립 HTML은 직원용 App 진입 유지), `README.md`, `STATUS.md`.
- 생성물: `00_KCM_미리보기.html`, 화면 캡처 `docs/qa-retell-test-1366.png`, `docs/qa-retell-test-390.png`. 검사 과정에서 dist/.test-dist 갱신.
- Node 내장 HTTP/WebSocket/env 로더와 Retell 공식 SDK를 사용합니다. Express·dotenv·별도 WebSocket 라이브러리는 추가하지 않았습니다. Node.js **22.23.3** / npm **10.9.9**, 공식 예제의 Node 22 이상 및 기존 KCM 22.12 이상 조건 충족. 시스템 Node/PATH/실행 정책 변경 없음.
- 공식 현재 `RetellClient.createWebCall()` 및 설치된 SDK의 `POST /v3/create-web-call`을 사용합니다. 프런트 custom fetch가 서버를 거치며 실제 API Key는 서버에만 있습니다. 브라우저 `transcript: false`, 서버 `monitorCall()`에서만 인증된 v2 Monitor를 엽니다. SDK 자체의 not-live 대기/네트워크 재연결을 사용합니다.
- 동일 call_id Monitor 중복 방지. snapshot/전체 목록을 발화 ID별 비교하여 USER/AGENT만 출력하고, 부분 발화 확장/정정은 같은 ID의 변경으로 표시합니다. 종료/오류/서버 종료 시 관찰 세션을 disconnect하며 실제 통화 종료용 Monitor.end/listen/takeover는 호출하지 않습니다.
- 생성 중 취소와 마이크 오류 후 정리를 위해 SDK stop-call 요청을 해당 백엔드가 생성한 통화에 한정해 전달합니다. API Key/단기 토큰/전체 Retell 응답은 로그에 남기지 않으며, upstream 오류 내용도 그대로 반사하지 않습니다. 서버는 127.0.0.1에만 바인딩하고 5173의 localhost/127.0.0.1 Origin만 허용합니다.
- 실제 `.env`는 생성하지 않았습니다. 기존 `.gitignore`의 `.env`, `.env.*`, `!.env.example` 규칙을 그대로 사용합니다. 사용자 키의 환경변수 존재 여부와 `.env` 파일 유무만 확인했으며 값은 출력하지 않았습니다.

### 실행한 검증
- `npm.cmd install --save-exact retell-client-js-sdk@3.0.2`: 성공, lockfile 보존·갱신. 설치 검사에서 취약점 0건 보고.
- `npm.cmd run check`: **175개 테스트 전체 통과(기존 159 + 신규 16)**. 프런트 TS/TSX와 백엔드 JS/JSDoc 전체 타입 검사 성공, Vite 빌드 성공(72 modules).
- 새 테스트: 환경변수 누락 503, 서버 인증 및 v3 요청 형식, 응답/로그의 비밀정보 차단, Origin/Host/허용 Agent/경로 제한, JSON 크기·구문, 생성 중 취소/소유권, 동시 클릭 방지·종료 후 새 세션·늦은 이벤트 무시·언마운트 정리·마이크 오류 안내.
- 실제 설치 SDK를 **가짜 WebSocket에 연결한 자동 테스트**로 v2 경로/인증·snapshot/update 병합·새 발화 출력·중복 Monitor 차단·call_ended/인증 오류 정리·4004/1011 재시도·재시도 중 종료 정리를 확인했습니다. 외부 Retell 연결 성공을 뜻하지 않습니다.
- 첫 검사에서 발견한 백엔드 Map 조회의 undefined 타입 오류는 명시적 누락 처리로 수정했습니다. Host 차단 테스트는 Node fetch가 Host를 교체하는 문제를 확인하여 원시 HTTP 요청으로 수정한 뒤 통과했습니다. 검증을 삭제하거나 조건을 낮추지 않았습니다.
- 남은 경고: 테스트의 Node MockTimers 실험 기능 경고, 빌드의 SDK 약 597 kB(gzip 약 157 kB) chunk 크기 경고. SDK는 개발용 테스트 route에서만 지연 로딩하며 직원용 첫 화면에는 로드하지 않습니다.
- `npm.cmd run dev`, `npm.cmd run server` 실제 시작: `http://127.0.0.1:5173`, `http://127.0.0.1:8787`. 키가 없는 서버의 설정 누락 안내 확인.
- 브라우저 `#/retell-test`: 직원용 사이드바 없는 독립 화면, 상태/시작/종료/설정 재확인/마이크 안내 렌더링 확인. 클릭·키보드로 시작 시 `RETELL_API_KEY` 누락 안내와 종료 상태, 시작 버튼 재활성화 확인. 설정 재확인 시 이전 오류 정리와 이후 시작 가능도 확인했습니다. 1366×768·390px에서 화면을 확인했고 390px 문서 가로 넘침 없음.
- 브라우저 직원용 홈 복귀: KCM 워크스페이스, 8개 메뉴, 고객 마스킹·기본 카드 **1/3/1/1** 유지 확인. 기존 업무 전체 흐름은 이번에 자동 회귀 테스트로 확인했고 수동 전체 재수행은 하지 않았습니다. 사용자 저장 데이터를 초기화하지 않았습니다.
- `npm.cmd run preview:standalone`: 성공. 생성 HTML을 로컬 HTTP로 직접 열어 홈·8개 메뉴·기본 집계가 표시됨을 확인했습니다. Retell 경로는 Node 백엔드가 필요한 개발 기능이므로 독립 직원용 HTML에는 포함하지 않습니다. file:// 직접 실행은 미검증.
- 작업 전 파일 해시와 비교: `src/App.tsx`, 기존 components/lib/data/services, `src/styles.css`, 기존 159개 테스트, 데이터 명세·DB 관련 파일과 작업 지침 변경 없음. 파일 삭제 없음.

### 실제 통화 검증 제한 및 사용자 실행
- 현재 `RETELL_API_KEY` 환경변수와 루트 `.env`가 없으므로 **실제 Web Call·마이크 허용·음성 송수신·실제 call_id·실제 Monitor 인증/연결·통화 중 USER/AGENT 출력·두 번째 실제 통화는 미검증**입니다. 모의 테스트를 실제 성공으로 보고하지 않습니다.
- 사용자가 루트 `.env`에 `RETELL_API_KEY`, `RETELL_AGENT_ID=agent_0cf2b1f09a8e52e6d2abc45b71`, `PORT=8787`을 작성해야 합니다. 기존 `.env`가 있다면 덮어쓰지 않습니다. Monitor에 필요한 Call Edit 권한을 확인합니다. 키는 프런트/VITE 변수/브라우저 저장소/채팅에 넣지 않습니다.
- 같은 프로젝트 폴더의 터미널 1에서 `npm.cmd run dev`, 터미널 2에서 `npm.cmd run server`. API 키 변경 시 백엔드 재시작, PORT 변경 시 양쪽 재시작. [통화 테스트](http://127.0.0.1:5173/#/retell-test)에서 ‘설정 다시 확인’ → ‘통화 시작’ → 마이크 허용 → 대화 → ‘통화 종료’. transcript는 터미널 2에 출력됩니다. 자세한 절차는 `server/README.md`.
- 미구현(범위 제외): SSE, 직원용 실시간 대화창, 위험 분석, DB, n8n, openSMILE, 관리자 개입/listen/takeover, 외부 공개/터널, 커밋·푸시·배포. 이번 단계에서 멈춥니다.

## 최신 구현·검증 — 홈 문구·고객 표시·매장 링크 정리 / 2026-09-30

현재 상태는 이 절과 바로 아래 누적 점수 구현 기록을 기준으로 확인합니다. 이번에는 UI 표시만 정리했으며 위험 점수·상담·지원·예약 업무 규칙은 변경하지 않았습니다. 작업 경로 `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`, 프로젝트 `kcm-web / 0.3.0`을 확인했습니다.

### 변경한 UI
- 홈 통화 현황의 흐름 안내, 메모리 초기화 안내, 데모 기준 배지, 필터 집계 설명, 가상 통화 설명 및 `표시 건수 / 전체 건수` 행을 DOM에서 제거했습니다. 사용처가 없어진 call-flow·필터 설명·통화 표 푸터 전용 스타일도 삭제해 빈 공간을 남기지 않습니다. 상담 입력·지원·다음 통화 영역의 초기화 안내는 유지했습니다.
- 위험·매우 위험 통화 카드의 보조 문구를 `직원 연결 대기·상담 중 기준`으로 변경했습니다. 카드/필터 계산 함수는 동일합니다.
- 상단 매장명을 기존 `#/stores`로 연결하는 링크로 변경했습니다. 기존 매장관리의 기본 `매장정보` 탭을 사용하며, 이미 직원정보 탭에 있는 경우에도 매장정보로 이동합니다. 기존 화면 이동 확인 절차를 거치고 클릭/Enter와 hover/focus 표시를 지원합니다. 새로운 route·페이지·메뉴는 만들지 않았습니다. 기존 좁은 화면에서 상단 매장명을 숨기는 반응형 규칙은 유지했습니다.
- 가상 원본 이름을 이도현/박민수/김서진/최지우/정유민으로 설정하고 목록·브리핑에서는 이*현/박*수/김*진/최*우/정*민으로 표시합니다. 고객/통화 ID와 분석·점수·지원 데이터는 유지했습니다. `maskCustomerName`은 화면에서만 호출하며 원본 필드를 덮어쓰지 않습니다. 2글자는 첫 글자+*, 긴 이름은 가운데 글자 수만큼 *, 한 글자는 *, 빈 이름은 이름 미확인으로 처리합니다. 다음 통화도 기존 원본 이름 승계 로직을 그대로 사용하고 화면에서 마스킹합니다.
- 지원 상태는 상담 상태 아래에서 별도 `관리자 지원` 열로 이동했습니다. 요청 기록이 있을 때만 기존 상태 배지를 표시하고 기록이 없으면 빈 셀로 둡니다. 관리자 지원 상세 영역의 요청 없음 안내와 상태 처리 기능은 유지합니다.
- 목록과 상세의 주요 대응 점수 배지에서 `예상 ` 접두어만 제거했습니다. 내부 callRisk의 점수/등급/표시 원본, 최종 확정 상태, 상세 계산 근거의 예상·확정 구분은 유지합니다.
- 목록의 신규 확인·식별된 고객·이전 점수 0·반영 전·현재 대응 점수 0 조합만 `0점`으로 표시합니다. C-005는 별도로 신규 이력이 확인돼 있어 0점이며 분석 상태 열은 분석 중을 유지합니다. 분석 중/실패라는 이유로 신규를 추정하지 않고, 기존 고객의 실제 0점은 등급을 유지합니다. 가점·위협 경고가 있으면 신규라도 0점으로 숨기지 않습니다.

### 변경 파일
- 신규: `src/lib/customerName.ts`, `src/lib/callPresentation.ts`, `tests/callPresentation.test.ts`.
- 수정: `src/components/CallOverview.tsx`, `CallBriefing.tsx`, `CallRiskDetails.tsx`, `Layout.tsx`, `src/App.tsx`, `src/data/callMockData.ts`, `src/types.ts`(원본 이름 설명 주석), `src/styles.css`, `tests/domain.test.ts`(테스트 등록).
- 갱신: `00_KCM_미리보기.html`, `STATUS.md`. 화면 캡처 `docs/qa-home-cleanup-1366.png`, `docs/qa-home-cleanup-390.png`. 검증 명령으로 dist/.test-dist도 갱신됐습니다.
- 작업 전 89개 파일의 해시와 비교했습니다. `riskScoring.ts`, `callRisk.ts`, `callWorkflow.ts`, `callConsultation.ts`, `callSupport.ts`와 기존 예약 로직/저장소/화면, 데이터 명세·작업 지침, package.json/package-lock.json은 변경하지 않았습니다. 삭제된 파일은 없습니다.

### 검증 결과
- Node.js 22.23.3 / npm 10.9.9. 최종 `npm.cmd run check` 성공: **159개 테스트 통과**, 전체 타입 검사와 Vite 빌드 성공(61 modules). 기존 151개 테스트를 보존하고 표시 관련 8개 테스트를 추가했습니다.
- 새 테스트: 2/3/긴/한 글자/빈/유니코드 이름, 원본·ID·점수·집계 불변, 예상 접두어 표시만 제거, 신규 0과 기존 0 구분, 분석 누락/실패/이력 불명에서 잘못된 0점 생성 방지, 신규 고객 가점/위협 보존, 실제 감점 2→0 후 확정 등급 유지.
- 실제 브라우저 홈: 제거 대상 안내·건수 행 없음, 카드 설명 일치, 마스킹 5명, C-001 `18점 / 정상 / 1단계`, C-005 `0점`/분석 중, C-004만 지원 요청 대기 배지 표시를 확인했습니다. 통화 안내/푸터 요소 수 0, 카드 제목 영역과 필터 사이에 제거된 안내의 빈 높이가 없음을 확인했습니다.
- 매장명 클릭 시 `#/stores`/매장정보 선택, 직원정보 탭에서 상단 링크 Enter 시 매장정보 복귀, 키보드 포커스 테두리 표시를 확인했습니다.
- 위험 필터로 C-004만 조회, 완료+매우 위험 필터의 빈 결과 안내와 필터 초기화를 확인했습니다. 필터를 변경해도 기본 카드 1/3/1/1을 유지했습니다.
- 검증용 별도 탭에서 C-003 시작→지원 요청→결과 입력·완료→17→47 확정→지원 확인/완료→같은 고객 다음 통화 C-006 생성→47 승계→완료 44점까지 실행했습니다. C-003 재조회 시 과거 17→47, 고객 최신 44를 구분했고 두 통화 이름은 모두 김*진입니다. 지원 요청/상담 완료 시 카드 1/2/1/2, 지원 완료 시 1/2/1/1로 기존 기준과 일치했습니다.
- 검증용 탭 새로고침 후 통화 5건·C-003 대기·기본 카드 1/3/1/1 복귀를 확인했습니다. 기존 사용자 탭에서 초기화 버튼이나 새로고침을 실행하지 않았습니다.
- 1366×768에서 통화 표 전체 1,061px이 가용 폭에 들어갔고 8개 사이드바 메뉴를 유지했습니다. 390×844에서는 필터가 정상 배치되고 표만 기존 방식으로 좌우 스크롤되며 본문 가로 넘침이 없었습니다. 좁은 화면에서 브리핑·입력·완료 흐름도 실행했습니다. 임시 크기 설정을 해제했습니다. 검증 탭의 콘솔 경고·오류는 없었습니다.
- `npm.cmd run preview:standalone` 성공. 생성 HTML을 로컬 HTTP에서 직접 실행해 홈 표시·초기 집계와 매장 링크 이동을 확인했습니다.

### 남은 검증 범위 / 확인 경로
- 기존 예약 완료·수정·저장·이력과 관리자 재요청의 회귀는 전체 자동 테스트로 확인했으며, 이번 UI 정리에서 해당 화면의 전체 수동 흐름을 다시 실행하지는 않았습니다. 기존 고객의 실제 0점·이력 불명 등 기본 홈 샘플에 없는 조합은 자동 테스트로 검증했습니다.
- 독립 HTML `file://` 직접 실행과 다른 브라우저 조합은 미검증입니다. 실제 외부 연동·DB·새 패키지·커밋·푸시·배포는 추가하지 않았습니다.
- 확인: `http://127.0.0.1:5173/#/home` → 통화 현황. 상단 `KT플라자 동성로점` → 기존 `#/stores` 매장정보 탭. 요청 범위 완료 후 다음 기능 개발은 진행하지 않았습니다.

## 최신 구현·검증 — 상담 결과·고객 누적 위험 점수·다음 통화 데모 / 2026-09-30

현재 상태는 이 절을 기준으로 확인합니다. 아래 기록의 과거 0~100점/4단계 기준·임의 통화 점수·미구현 범위는 이번 사용자 요청으로 대체됐습니다. 작업 경로는 `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`, 프로젝트는 `kcm-web / 0.3.0`입니다.

### 핵심 변경과 임시 가정
- 기존 통화 공통 상태를 `{ calls, customers }`로 확장했습니다. 예약 데이터와 별개인 데모 고객 ID로 연결하고, 이름으로 고객을 합치지 않습니다. 고객의 최신 확정 점수와 각 통화의 이전/반영 후 점수 기록을 구분합니다. 확정 후 과거 통화의 분석·계산 근거·규칙 버전·최초 반영 시각은 재계산하거나 덮어쓰지 않습니다.
- 팀 임시 규칙 `team-demo-v1`: 고성 문장당 +3, 욕설 회당 +6, 위협은 통화당 한 번 +80. 유효한 최종 분석에서 고성 0·욕설 0·위협 false인 경우에만 -3. 불편감 표현은 참고 정보이며 가점이 없습니다. 고성·욕설 항목별 상한은 미정으로 적용하지 않으며 계산 결과만 정수 0~99로 제한합니다. 규칙상 증감과 실제 증감/상·하한 조정을 별도로 표시합니다.
- 5단계는 0~19 정상, 20~39 주의, 40~59 경계, 60~79 위험, 80~99 매우 위험입니다. 관련 배지·필터·범례·위험 현황을 같은 판단 함수로 갱신했습니다. 현재 대응 등급은 이전 점수+확인된 가점을 사용하고 확정 전 감점으로 낮추지 않습니다. 분석이 없으면 알려진 이전 이력을 사용하며, 점수를 계산하지 못해도 확인된 위협은 숫자를 만들지 않고 매우 위험 경고로 표시합니다.
- 점수 확정은 통화 종료와 유효한 최종 분석이 모두 있어야 합니다. 상담 결과 완료, 종료 시뮬레이션, 분석 수신, 점수 반영을 별도 함수로 분리했습니다. 데모 완료 확정 시 종료 시뮬레이션을 호출합니다. 분석 실패/부분/누락 또는 이력 불명은 상담 기록만 완료하고 반영을 보류합니다. 늦은 최종 분석은 이후 한 번 반영할 수 있습니다. 고객 갱신과 통화 반영 기록을 같은 상태 변경에서 처리하고 통화 ID/기존 반영 기록으로 중복을 차단합니다. 직원 시작 시각 없이도 AI 단독 통화의 종료·최종 분석 함수는 사용할 수 있습니다.
- 음수·소수·NaN·Infinity·누락 횟수, 위협 여부 누락, 잘못된 이전 점수는 0/false로 보정하지 않습니다. 분석 근거가 제공되면 횟수와 일치하는지 확인하고 동일 신호의 같은 발생 ID를 중복 표시하지 않습니다. 신규 확인은 0점/이력 없음, 식별·이력 불가는 반영 보류로 구분합니다.
- `risk_score`의 의미는 해당 통화까지 반영한 최종 누적 점수입니다. 이번 계산 책임은 데모 함수에만 있습니다. 향후 서버 계산값을 표시하는 방식으로 교체할 때 가점을 다시 더하지 않아야 합니다. 고객/통화 ID, 이력 상태와 분석 단계 등은 화면용 가정이며 확정 DB 명세가 아닙니다. 외부 결과 수신 모드나 과거 이력 생성은 추가하지 않았습니다.
- 기존 패널에 결과 입력·최종 확인·완료 조회를 추가했습니다. 문의 처리 결과는 기본 미선택, 처리 내용은 필수/공백 금지/1,000자, 후속 조치는 300자이며 추가 확인 필요·미해결이면 필수입니다. 초안은 통화별 앱 메모리에 유지합니다. 취소는 상태/점수를 바꾸지 않습니다. 최초 시작 시각 누락은 완료를 차단합니다. 확정 시 해당 결과·작성자·최초 완료 시각과 상태를 함께 반영하며 완료 기록은 조회만 가능합니다.
- 상담 완료 후에도 미완료 관리자 지원은 유지되고 확인→지원 완료 처리가 가능합니다. 새 요청/재요청/동일 통화 재시작만 차단합니다. 지원 처리로 상담 결과·시각·점수를 바꾸지 않습니다. 현재 위험 현황에서 완료 상담은 제외하되 관리자 지원은 완료 상담도 미완료 요청을 집계합니다.
- 완료+점수 반영이 끝난 통화에서 동일 고객 다음 통화를 만들 수 있습니다. 새 고유 ID·현재 확정 점수·대기 상태·비어 있는 결과/지원 기록을 사용합니다. 같은 고객의 활성/미반영 통화가 있으면 중복 생성 대신 해당 통화를 안내합니다. 새 분석은 고성 0·욕설 0·위협 없음인 가상 최종 샘플이며 생성만으로 감점하지 않습니다.
- C-001~005의 이전 점수는 18/30/17/11/신규 0입니다. C-001~004의 최종 분석 샘플로 종료 후 예상은 15/45/47/91이며 실제 종료 전에는 확정되지 않습니다. C-003 고성 4·욕설 3·불편감 7과 근거를 맞췄고 C-004 위협 근거 2건도 +80 한 번만 반영합니다. C-004 최초 시작 13:20, 지원 요청 대기 13:22 고정 가상 시각은 보존했습니다.
- 새 초안·결과·고객 점수·통화 점수·지원 이력은 앱 메모리만 사용하며 새로고침하면 기본 샘플로 초기화됩니다. 화면에 안내했습니다. 기존 예약 저장 방식과 사용자 데이터는 변경/초기화하지 않았습니다.

### 변경 파일과 보존 범위
- 신규: `src/lib/riskScoring.ts`(계산/등급), `src/lib/callWorkflow.ts`(초안·완료·종료·분석 수신·점수 반영·다음 통화).
- 신규: `src/components/CallResultPanel.tsx`(결과 입력/확인/조회), `src/components/CallRiskDetails.tsx`(점수 근거), `tests/callWorkflow.test.ts`.
- 수정: `src/types.ts`, `src/data/callMockData.ts`, `src/lib/callRisk.ts`, `src/App.tsx`, `src/components/CallOverview.tsx`, `src/components/CallBriefing.tsx`, `src/components/CallSupportPanel.tsx`, `src/styles.css`, `tests/domain.test.ts`.
- 재생성: `00_KCM_미리보기.html`. 검증 명령으로 dist/.test-dist도 갱신됐습니다.
- 화면 증거: `docs/qa-cumulative-confirm-1366.png`, `docs/qa-cumulative-input-390.png`, `docs/qa-cumulative-confirm-390.png`, `docs/qa-cumulative-history-390.png`, `docs/qa-cumulative-history-1366.png`.
- 기록: `STATUS.md`. 작업 전 79개 파일의 해시와 비교해 요청 범위의 파일만 변경됐고 삭제 파일은 없습니다. 기존 통화 시작/관리자 지원 상태 함수, 예약 상담 로직·화면·저장소, 공통 Layout과 다른 기능 화면, package.json/package-lock.json, 작업 지침/데이터 명세 문서는 변경하지 않았습니다. 기존 8개 메뉴·상단 명칭·날짜 삭제·여백·폰트·대시보드 구조를 유지했습니다.

### 실행한 검증
- Node.js 22.23.3 / npm 10.9.9. `npm.cmd run check`: **151개 테스트 통과**, 전체 타입 검사 및 Vite 빌드 성공(59 modules). 기존 테스트를 유지하고 변경된 등급/집계 기대값을 갱신했습니다.
- 자동 테스트: 5단계 모든 경계값과 잘못된 점수/횟수/위협값, 0→30·17→47·위협 0→80/30→99·47→44·2→0(실제 -2)·98→99(실제 +1), 항목별 상한 없음, 불편감만 있는 경우 감점, 위협 여러 건 +80 한 번, 신호 중복·근거 불일치 검증.
- 자동 테스트: 부분/실패/누락/이력 불명 반영 보류, 통화 종료 전 확정 금지, 늦은 최종 분석 1회 반영, AI 단독 종료 조건, 반복 완료·종료·분석 수신의 최초 시각/결과 보존, 재분석 정정 차단, 고객 점수 불일치 보류, 다른 고객 불변, 같은 이름/다른 ID 분리, 다음 통화 이어받기·중복 생성 차단·과거 기록 유지, 새 앱 상태의 샘플 복귀.
- 자동 테스트: 결과 필수/공백/최대 길이/조건부 메모, 시작 전·시작 시각 누락·완료 후 재처리 차단, 통화별 초안 분리, 분석/지원 변경 시 초안 보존, 상담 완료 후 지원 처리 유지·신규 요청 차단, C-004 완료 시 위험 현황 제외/지원 유지, 기존 예약 완료/수정/집계/저장/이력 회귀.
- 실제 브라우저의 별도 검증 탭에서 C-003 시작→지원 요청→결과 입력→확인 취소→완료 확정→17→47 반영→완료 기록 재열기→관리자 확인→지원 완료를 확인했습니다. 시작·지원 요청·완료 확정·지원 확인/완료를 더블클릭해 중복과 최초 시각 변경이 없음을 확인했습니다. 결과 선택 누락, 조건부 후속 메모 누락을 차단했습니다. 패널 닫기·필터 변경·상품관리 왕복 후 초안을 유지했고 완료 시 현재 필터에서 빠져도 열린 완료 기록을 유지했습니다.
- 실제 브라우저 카드 순서 AI/대기/위험·매우 위험/지원: 기본 **1/3/1/1** → C-003 시작 **1/2/1/1** → 지원 요청 **1/2/1/2** → 상담 완료 **1/2/1/2** → 관리자 확인 **1/2/1/2** → 지원 완료 **1/2/1/1**.
- 실제 브라우저에서 다음 통화 생성 더블클릭으로 C-006 한 건만 생성, 이전 점수 47/예상 44/고객 현재 47 표시와 이전 지원 이력 미복사를 확인했습니다. C-006 시작·결과 입력·완료 후 47→44 반영. C-003을 다시 열면 통화 기록은 17→47, 고객 최신 점수는 44로 구분되고 기존 결과·최초 반영 시각을 유지합니다.
- C-004의 위협 경고·예상 91과 확정 고객 11 구분, 기존 지원 대기와 고정 시각을 확인했습니다. C-005 신규 0점/분석 중/횟수 — 표시를 확인했습니다.
- 별도 독립 미리보기 검증 탭에서 공백 처리 내용과 1,001자/301자 입력의 완료 차단을 확인했습니다. C-004 완료 후 11→91 한 번 반영, 카드 **1/3/0/1**, 미완료 지원 대기와 기존 시작 시각 보존을 확인했습니다.
- 기존 예약 회귀(검증 탭의 김서연 샘플): 시작→결과 완료→완료 요약 수정 성공. 최초 완료 `2026. 09. 30. 15:16:50` 유지, 이력 2건/완료 집계 2건 유지. 통화 집계와 고객 점수는 변하지 않았습니다. 기존 사용자 탭의 기록을 임의로 초기화하지 않았습니다.
- 1366×768과 390×844에서 결과 입력·최종 확인·점수 근거·과거 기록을 직접 확인했습니다. 모달/본문 가로 넘침 없이 줄바꿈하고 내부 스크롤로 긴 기록을 조회합니다. 임시 화면 크기 설정은 해제했습니다. 주 검증 탭과 독립 미리보기 탭의 콘솔 경고/오류는 없었습니다.
- `npm.cmd run preview:standalone` 성공. 생성 HTML을 로컬 HTTP에서 직접 열어 C-004 완료까지 실행했습니다. 파일 더블클릭(`file://`) 실행은 확인하지 않았습니다.

### 미구현·미검증 / 확인 경로
- 실제 전화·분석 모델·외부 API·DB·관리자 알림/인증, 신규 영구 저장, 확정 분석 재산정/수동 점수 조정, 새 통화 완료 기록 수정/삭제/재시작은 요청대로 구현하지 않았습니다. DB/팀 데이터 명세, 기존 예약 저장 방식, 패키지는 변경하지 않았고 커밋·푸시·배포는 하지 않았습니다.
- 늦은 분석 수신, 분석 없는 대기/상담 통화 완료, 이력 불명/잘못된 수치, AI 단독 종료는 자동 테스트로 검증했습니다. 해당 상태를 만드는 UI·타이머·실제 수신 기능은 없으므로 이 조합의 브라우저 직접 검증은 하지 않았습니다. 다른 브라우저 및 독립 HTML의 `file://` 실행은 미검증입니다.
- 확인: `http://127.0.0.1:5173/#/home` → C-003 브리핑 → 상담 시작 → 관리자 지원 요청 → 결과 입력 → 상담 완료(데모) → 완료 확정 → 완료 기록 보기 → 관리자 처리 → 동일 고객 다음 통화 생성(데모). 검증 결과 탭에는 C-003 17→47, C-006 47→44 완료 기록을 남겼습니다. 새로고침 시 통화 데모 기록/점수는 초기화됩니다.

## 최신 구현·검증 — 관리자 지원 요청·처리 데모 / 2026-09-30

현재 상태는 이 절을 기준으로 확인합니다. 작업 경로는 `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`, 프로젝트는 `kcm-web / 0.3.0`입니다. 이전 구현·검증 기록을 보존했습니다.

### 핵심 변경
- 기존 통화 배열에 `supportRequests` 기록 배열을 추가하고 과거 단일 `supportRequest` 플래그를 대체했습니다. 목록·패널·집계는 이 기록만 사용합니다. 요청 없음은 빈 배열이며 요청 대기 → 지원 중 → 지원 완료로만 전이합니다.
- 직원 연결 대기/직원 상담 중인 통화는 등급·분석 완료 여부와 관계없이 요청할 수 있습니다. 필수 사유 4종과 선택 메모(최대 300자)를 입력해 제출한 경우에만 요청을 생성합니다. 입력 영역 열기·입력 취소는 기록을 만들지 않습니다. C-005는 비활성 버튼과 `직원 연결 대기 이후 요청할 수 있습니다` 안내를 표시합니다.
- 요청 ID·통화 ID·최초 요청 시각·데모 요청자를 기록하며 `데모 지원 요청이 등록되었습니다`를 표시합니다. C-004의 기존 미처리 요청은 고정 가상 사유/메모/요청 시각 `2026-09-30T13:22:00+09:00`을 가진 요청 대기로 유지합니다.
- 기존 브리핑 안에 구분된 `관리자 처리 시뮬레이션` 영역을 추가했습니다. 관리자 확인(데모)은 최초 확인 시각을 기록하고, 지원 완료 처리(데모)는 필수 지원 내용(공백 금지·최대 300자)과 최초 완료 시각을 기록합니다. 실제 전송/관리자 계정/권한 검증이 없는 데모임을 안내합니다. 처리자는 `데모 관리자`, 요청자는 기존 샘플 사용자 `이소현 점장 (데모 직원)`으로 표시합니다.
- 미완료 요청은 통화당 최대 1건이며 UI와 상태 함수 모두 중복·건너뛰기·지난 요청 ID 처리를 막습니다. 확인·완료 반복 호출은 기존 시각/내용을 보존합니다. 완료 후 재요청은 새 ID·시각을 사용하며 이전 완료 기록은 접을 수 있는 이력으로 남깁니다.
- 목록의 기존 상담 상태 아래 작은 지원 상태 배지를 표시합니다. 지원 처리로 상담 상태·최초 상담 시작 시각·위험 분석·AI 브리핑·다른 통화를 바꾸지 않습니다. 문자열은 React 텍스트로 표시하며 HTML로 해석하지 않습니다.
- 관리자 지원 요청 카드는 전체 통화의 요청 대기 + 지원 중을 집계합니다. 확인만 하면 수치가 유지되고 완료 시 제외합니다. 나머지 세 카드의 기준은 유지했습니다.
- 앱 실행 중 저장된 요청·확인·완료 기록과 이력은 패널/필터/메뉴 이동 후 유지됩니다. 새로고침/명시적 샘플 초기화 시 초기화되는 기존 정책에 지원 기록도 포함되며 화면 안내를 갱신했습니다. 새 영구 저장 방식은 추가하지 않았습니다.
- 기존 8개 메뉴·대시보드·공통 상단·통화 시작/이어보기와 예약 상담 완료/수정/이력 로직을 유지했습니다.

### 변경 파일
- `src/types.ts`, `src/data/callMockData.ts`: 지원 요청 기록 타입과 C-004 고정 샘플.
- `src/lib/callSupport.ts` (신규): 입력 검증, 요청·확인·완료 상태 전이와 중복 방지, 공통 라벨.
- `src/lib/callRisk.ts`: 관리자 지원 미완료 집계만 새 기록 기준으로 갱신.
- `src/App.tsx`: 기존 공통 상태에 지원 이벤트 연결, 집계 보조 문구·프로토타입/초기화 안내.
- `src/components/CallSupportPanel.tsx` (신규): 요청 입력·기록 표시·관리자 처리·완료 이력.
- `src/components/CallOverview.tsx`, `src/components/CallBriefing.tsx`: 지원 상태 배지와 기존 패널 연결.
- `src/styles.css`: 지원 영역·입력/버튼 줄바꿈·이력 표시 스타일.
- `tests/domain.test.ts`: 기존 테스트 유지, 이전 지원 플래그 테스트를 기록 배열로 조정, 지원 처리 테스트 17개 추가.
- `00_KCM_미리보기.html`: 현재 src로 갱신.
- `docs/qa-support-history-1366.png`, `docs/qa-support-request-narrow.png`, `docs/qa-support-history-narrow.png`: 직접 브라우저 확인 화면.
- `STATUS.md`: 이 기록. dist/.test-dist는 검증 명령으로 갱신됐습니다.

### 실행한 검증
- `npm.cmd run check` 성공: **111개 테스트 통과**, 전체 타입 검사 및 Vite 빌드 성공(55 modules).
- 자동 테스트: 사유 누락/허용되지 않은 사유·301자 메모 거부, 사유 4종/빈 선택 메모 허용, 동일/다른 ID로 중복 요청 거부, 잘못된 전이·다른 요청 ID·다른 통화 ID 재사용 차단, 반복 확인·완료의 최초 시각/처리자 유지, 공백·301자 지원 내용 거부/300자 허용, 재요청 이력 보존, 일반/주의/분석 중/실패/미분석/점수 누락/오류에서도 대기·상담 중 요청 허용, C-005 제한, C-004 고정 요청, 상담·분석·다른 통화·예약 기록 불변.
- 실제 브라우저의 별도 검증 탭에서 C-003 시작 → 사유 미선택 제출 차단 → 입력 취소 시 기록 없음 → 요청 더블클릭 → 확인 더블클릭 → 공백/301자 지원 내용 차단 → 정상 완료 더블클릭 → 새 ID로 재요청을 확인했습니다.
- 카드 순서 AI/대기/경고·위험/지원: 시작 **1/2/2/1**, 요청 **1/2/2/2**, 확인 **1/2/2/2**, 완료 **1/2/2/1**, 재요청 **1/2/2/2**. C-004는 처리하지 않고 기존 요청 대기를 유지했습니다.
- 이전 완료 기록의 요청·확인·완료 시각/내용이 재요청 후에도 동일함을 확인했습니다. `<b>검증용 텍스트</b>`가 일반 문자열로 보이고 b 요소로 생성되지 않음을 확인했습니다. C-003 최초 상담 시작 시각·72점/경고·4/7/0 신호 횟수 유지.
- 패널 닫기/Enter 재열기/Escape 닫기, 상담 중+경고 필터, 상품관리 왕복 후 요청 기록·시각과 최초 상담 시작 시각 유지. 필터 중에도 전체 통화 집계 유지. C-004 고정 요청 시각 표시와 C-005 비활성/제한 문구 확인.
- 별도 임시 탭의 일반 18점 C-001 대기 통화에서 지원 요청/확인/완료 성공. 301자 메모 차단·빈 메모 허용 확인. 검증용 탭 새로고침 후 기본 1/3/2/1·요청 없음 복귀 확인. 사용자 탭에서 임의 초기화/새로고침을 수행하지 않았습니다.
- 기존 예약 회귀: 김서연 샘플 시작 → 결과 입력/완료 → 완료 요약 수정 성공. 최초 완료 시각 `2026. 09. 30. 14:41:54` 유지, 수정 이력 2건, 예약 완료 2건 유지. 통화/지원 집계 1/2/2/2와 분석 정보는 변하지 않았습니다.
- 1366×768에서 지원 처리/이력 확인. 390×844에서 요청 입력·관리자 지원 내용·완료 버튼·이력 확인, 모달/본문 가로 넘침 없음. 모달 내부 스크롤로 긴 기록을 확인할 수 있습니다. 임시 크기 설정 해제. 두 검증 탭의 콘솔 경고·오류 없음.
- `npm.cmd run preview:standalone` 성공. 새 패키지 추가, 커밋·푸시·배포는 하지 않았습니다.

### 미구현·미검증 / 확인 경로
- 실제 관리자 알림·메시지·전화·외부 API·DB·관리자 로그인/권한, 요청 취소/수정/이관, 새 통화 상담 결과/상담 완료는 범위 밖으로 구현하지 않았습니다.
- 분석 결과 없는 직원 연결 대기 통화는 자동 테스트로 검증했습니다. 기본 샘플에 해당 조합이 없어 브라우저 직접 검증은 하지 않았습니다. 독립 HTML 파일 직접 열기와 다른 브라우저 조합도 미검증입니다.
- 확인: `http://127.0.0.1:5173/#/home` → C-003 브리핑/상담 이어보기 → 관리자 지원 요청 → 사유 선택·등록 → 관리자 확인(데모) → 지원 내용 입력·지원 완료 처리(데모) → 다시 지원 요청. 검증용 결과 탭에는 C-003의 재요청 대기와 이전 완료 이력을 남겼습니다.

## 최신 구현·검증 — 통화 상담 시작·이어보기 / 2026-09-30

현재 상태는 이 절을 기준으로 확인합니다. 이전 구현·검증 기록과 예약 상담 기능을 보존했습니다.

### 구현 내용
- 기존 App의 통화 공통 상태를 갱신하도록 연결했습니다. 직원 연결 대기 통화만 상담을 시작하고 최초 시작 시각을 한 번 기록합니다. 함수형 상태 갱신과 상태 조건으로 더블클릭·반복 호출을 막습니다.
- 상담 중인 통화는 목록에서 `상담 이어보기`로 표시하며 기존 브리핑 모달에 상태·최초 시작 시각(한국 시간)을 함께 표시합니다. 필터가 시작한 통화를 제외하더라도 열린 패널은 같은 통화를 유지합니다. 패널 닫기·필터 변경·다른 메뉴 왕복으로 통화 상태가 사라지지 않습니다.
- 시작 조건은 상담 상태뿐입니다. 분석 중·실패·미분석·점수 누락·오류·위험 등급은 시작을 막지 않습니다. 분석 결과가 없으면 그 상태를 안내합니다. C-005는 AI 응대 상태를 유지하며 시작 버튼을 비활성화하고 이유를 표시합니다.
- C-004는 명시적인 가상 시작 시각 `2026-09-30T13:20:00+09:00`을 사용합니다. 패널을 열 때 현재 시각을 생성하지 않습니다.
- 위험도·신호 근거·횟수·지원 요청·기존 집계 함수는 변경하지 않았습니다. C-003 시작 후 현재 현황은 AI 1 / 연결 대기 2 / 경고·위험 2 / 미처리 관리자 지원 요청 1입니다.
- 통화 상태는 현재 앱 실행의 메모리에만 유지됩니다. 새로고침하면 기본 통화 샘플로 돌아간다는 안내를 목록·패널에 표시했습니다. 사용자가 명시적으로 확인하는 기존 `샘플 초기화`에도 통화 상태·시작 시각을 포함하고 확인 문구를 갱신했습니다. 자동 초기화·새 영구 저장 기능은 추가하지 않았습니다.
- 실제 전화가 연결되지 않는 데모임을 버튼 옆에 안내했습니다. 신규 통화의 관리자 지원 요청·결과 기록·완료는 후속 구현 예정 안내만 유지하며 활성 기능을 추가하지 않았습니다.
- 기존 예약 상담의 시작·결과·완료·수정 로직, 저장 방식, 8개 메뉴, 상단 이름·날짜 삭제·여백과 위험 기준은 그대로 유지했습니다.

### 변경 파일
- `src/types.ts`, `src/data/callMockData.ts`: 통화 최초 시작 시각과 고정 C-004 샘플 시각.
- `src/lib/callConsultation.ts` (신규): 선택한 대기 통화만 변경하는 중복 안전 시작 함수.
- `src/App.tsx`: 기존 공통 통화 상태 갱신·시작 이벤트 연결 및 안내/명시적 샘플 초기화 연동.
- `src/components/CallOverview.tsx`, `src/components/CallBriefing.tsx`: 시작·이어보기 버튼, 시각·상태·제한 이유·새로고침 안내.
- `src/styles.css`: 새 상담 시작 정보 영역에만 최소 스타일 추가.
- `tests/domain.test.ts`: 통화 시작 관련 테스트 12개 추가.
- `00_KCM_미리보기.html`: 현재 src 기준 재생성.
- `docs/qa-call-start-1366.png`, `docs/qa-call-start-dashboard.png`, `docs/qa-call-start-narrow.png`: 브라우저 검증 화면.
- `STATUS.md`: 이 기록. 검증 과정에서 dist/.test-dist도 갱신됐습니다.

### 검증 결과
- `npm.cmd run check` 성공: **94개 테스트 통과**, 전체 타입 검사 및 Vite 빌드 통과(53 modules).
- 추가 테스트: C-003 단독 변경·원본 불변·집계 1/2/2/1, 다른 통화와 분석 객체 보존, 연속 시작 10회에 최초 시각 유지, C-004 고정 시각, C-005/종료/없는 ID 거부, 분석 4개 상태의 점수 누락과 잘못된 점수에서도 대기 통화 시작, 필터·다른 통화 변경의 독립성, 새 샘플 초기화·예약 기록 독립성.
- 실제 브라우저(기존 `http://127.0.0.1:5173/#/home`, 별도 검증 탭): 대기 필터에서 C-003 더블클릭 시작 → 열린 패널 유지 → 집계 1/2/2/1 및 대기 목록에서 제외 확인. 상담 중 필터·Enter 이어보기·Escape 닫기·상품관리 왕복 후 최초 시각 동일 확인. C-003 72점/경고 유지.
- C-004 이어보기의 고정 시작 시각 표시, C-005 시작 비활성 및 AI 응대 이유 표시 확인. 새로고침 후 초기 집계 1/3/2/1·C-003 시작 시각 없음 확인. 다시 C-003만 시작한 시연 상태로 남겼습니다. 초기화 확인창 문구와 취소 시 상태 보존도 확인했습니다.
- 기존 예약 회귀: 검증용 김서연 샘플의 시작 → 결과 입력 → 완료 → 요약 수정 확인. 최초 완료 시각 `2026. 09. 30. 14:21:52` 유지, 이력 1→2건과 수정자/수정 시각 표시, 예약 완료 2건 유지. 이 과정에서도 통화 현황 1/2/2/1 유지. 기존 사용자 탭의 데이터는 초기화하지 않았습니다.
- 1366×768에서 홈 8개 메뉴가 화면 안에 있고 가로 넘침 없음, 상담 모달 상태·시각·브리핑 표시 확인. 390×844에서 모달·본문 가로 넘침 없음, 시작 시각·안내 정상 줄바꿈 확인. 임시 화면 크기 설정은 검증 후 해제했습니다. 브라우저 경고·오류 로그 없음.
- `npm.cmd run preview:standalone` 성공.

### 미구현·미검증 / 확인 경로
- 실제 전화·API·DB·분석 재실행·알림·관리자 지원 처리·새 통화 결과/완료 기능은 범위 밖으로 구현하지 않았습니다. 커밋·푸시·배포·새 패키지 설치 없음.
- 분석 결과 없는 **대기** 통화 시작은 자동 테스트로 확인했습니다. 기본 5건에 해당 조합이 없어 브라우저 직접 검증은 하지 않았으며 C-005나 사용자 데이터를 테스트 목적으로 변형하지 않았습니다.
- 독립 HTML의 파일 직접 열기와 다른 브라우저 조합은 이번 작업에서 미검증입니다.
- 확인: 홈 → C-003 `브리핑 보기` → `상담 시작` → 닫기 → `상담 이어보기`. 새로고침 시 데모 상태·시각은 초기화됩니다.

## 최신 구현·검증 — 공통 상단 정리와 통화 위험 브리핑 / 2026-09-30

현재 상태는 이 절을 기준으로 확인합니다. 아래의 이전 구현·검증 이력은 보존합니다. 이번 사용자 요청이 기존 AGENTS.md/SPEC.md의 장식 날짜 유지·상단 명칭 규칙을 대체하며, 그 외 기존 메뉴·디자인·예약 상담 처리 규칙은 유지했습니다.

### 구현 내용
- 작업 경로: `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`, 프로젝트 `kcm-web` / `0.3.0` 유지. 새 프로젝트·별도 사이트를 만들지 않았습니다.
- 공통 경로 표시를 `KCM 워크스페이스`로 변경했습니다. 현재 메뉴명·구분 아이콘·기존 홈/메뉴 이동 동작은 유지했습니다. 사이드바의 명칭과 내부 workspace 식별자는 변경하지 않았습니다.
- 홈 및 예약·상담관리 제목 위의 장식 날짜 행을 삭제했습니다. 다른 6개 화면에는 해당 날짜 행이 없었습니다. 기존 카테고리 문구는 제목 옆에 유지해 모든 화면의 제목 시작 위치를 맞췄습니다. 제목·설명·글꼴·크기·굵기·포인트 색상은 유지했습니다.
- 공통 상단 여백 토큰을 데스크톱 24px / 800px 이하 16px로 적용하고, 중복 제목 margin 및 이전 날짜 행 기준 버튼 padding을 정리했습니다. 제목–설명 8px, 제목 영역–첫 콘텐츠 24px. 본문 좌우·카드 내부·표 행 간격은 기존 기준을 유지했습니다. 좁은 화면에서 버튼은 라벨을 유지하며 줄바꿈합니다.
- 320px 화면에서는 기존 body 최소 너비와 세로 스크롤바 때문에 가로로 15px 넘치는 원인을 확인했습니다. 최소 너비가 실제 가용 폭을 넘지 않게 조정해 홈·예약 화면의 가로 넘침을 없앴습니다. 화면 배율·제목 글자 크기·음수 margin·transform으로 위치를 보정하지 않았습니다.
- 홈의 기존 카드 4개를 현재 통화 집계로 변경했습니다: AI 응대 중 1 / 직원 연결 대기 3 / 경고·위험 통화 2 / 관리자 지원 요청 미처리 1. 별도 고정 수치가 아니라 목록과 같은 통화 배열 전체에서 계산하며 필터와 무관합니다.
- 기존 카드/표 패턴으로 통화 현황 목록을 추가하고, 상담 상태·위험 등급 필터와 빈 결과/필터 초기화를 구현했습니다. 통화 상태와 분석 상태는 별도 값입니다. 기존 예약 목록·예약 브리핑·상담 처리, 재고·반납, 최근 업무 흐름 영역을 유지했습니다. 기존 예약 집계는 홈 예약·상담 현황에 별도 표시합니다.
- C-001~C-005는 기존 예약과 분리한 가상 KT 상담 전화 데이터입니다. 고객 성향·직원 매칭·교육청/교육부 데이터로 연결하지 않았습니다. C-003은 72점/경고, 근거 4회/7회/0회와 통화 시점, 지정된 AI 처리·권장 대응·첫 응대 문구를 포함합니다.
- 브리핑 보기에서만 기존 모달 패턴의 조회 화면을 엽니다. 통화별 요약·분석 상태·위험도·근거 발언·AI 처리·대응 예시·첫 문구를 제공하며 닫기 후 목록 필터를 유지합니다. 신호 횟수는 근거 배열 길이에서 계산합니다. 욕설은 가림 문구만 표시하고 불편감 표현과 위협을 구분합니다.
- 임시 등급 기준은 한 모듈에서 관리합니다. 유효한 0점은 일반으로, 분석 중/실패/미분석/점수 누락/유효하지 않은 점수는 `—` 및 상태 안내로 구분합니다. 미분석 신호도 0회로 만들지 않습니다. 점수 산식·확률·정확도·가짜 실시간 갱신은 추가하지 않았습니다.
- 모든 발언·점수의 가상 데이터/임시 기준 안내와 KT 공식 매뉴얼이 아닌 대응 예시임을 표시했습니다. 신규 통화 시작·지원 요청 제출·처리 저장·음성 재생 버튼은 추가하지 않았습니다.
- 예약 상담의 시작·임시 반영·완료·완료 결과 수정 로직은 보존했습니다. 완료 후 수정 시 최초 완료 시각·상태·집계·변경 이력을 유지합니다. 예약 날짜·시각, 상담/이력 시각, 상품의 기간/갱신일 필드, 재고 반납 시각은 삭제하지 않았습니다.
- 영구 저장 방식은 변경하지 않았습니다. 기존 예약 샘플의 새로고침 초기화 동작은 동일하며, 통화도 매번 동일한 예시를 읽습니다. 실제 로그인·전화·분석·DB·외부 API·알림은 연결하지 않았습니다.

### 변경 파일
- `src/App.tsx`: 날짜 행 제거, 통화 데이터/집계/목록 연결, 기존 예약 집계 유지, 안내/초기화 문구.
- `src/components/Layout.tsx`: 공통 상단 경로의 표시 명칭만 변경.
- `src/styles.css`: 공통 상단 간격·버튼 배치·좁은 화면 대응, 신규 통화 영역 스타일.
- `src/types.ts`: 기존 예약 타입을 보존하며 독립된 통화/분석/근거 타입 추가.
- `src/data/callMockData.ts` (신규): 기본 통화 5건과 가상 근거·브리핑.
- `src/lib/callRisk.ts` (신규): 공통 등급 기준, 유효성 판단, 통화 집계/필터, 신호/시간/가림 표시.
- `src/components/CallOverview.tsx`, `src/components/CallBriefing.tsx` (신규): 통화 목록/필터와 선택 시 조회 모달.
- `src/lib/domain.ts`: 다른 사용처가 없어진 장식 날짜용 displayDate만 제거. 기존 예약 집계·상태 함수는 유지.
- `tests/domain.test.ts`: 사용처가 제거된 날짜 표시 테스트 1개 제거, 통화 규칙 테스트 23개 추가. 기존 상담 처리 테스트 20개 포함 총 82개.
- `00_KCM_미리보기.html`: 현재 src 기준 독립 미리보기 재생성.
- `docs/qa-call-dashboard-desktop.png`, `docs/qa-call-briefing-desktop.png`, `docs/qa-call-dashboard-narrow.png`, `docs/qa-common-header-narrow.png` (신규): 실제 브라우저 화면 캡처.
- `STATUS.md`: 이 기록.
- 작업 전 파일 해시와 대조했습니다. 기존 상담 처리 모듈·Modal·예약 데이터·다른 메뉴 소스·라우트 정의·확정 상담 명세·package.json·package-lock.json·이전 캡처는 변경하지 않았습니다. 기존 파일 삭제, 패키지 추가, 커밋·푸시·배포는 하지 않았습니다. dist/.test-dist는 검증 명령으로 갱신됐습니다.

### 공통 적용 범위와 실제 화면 검증
실제 메뉴 정의에 있는 아래 8개 화면을 1280×720, 1600×900, 390×844에서 각각 이동하며 DOM으로 확인했습니다. 전 화면 경로 접두어 `KCM 워크스페이스`, 구분 아이콘 1개, 고유 제목·설명 유지, 장식 날짜 없음, 페이지 가로 넘침 0을 확인했습니다.

| 화면 | 경로 | 데스크톱 헤더 아래→제목 | 390px 헤더 아래→제목 |
|---|---|---|---|
| 홈 | `#/home` | 24px | 16px |
| 예약·상담관리 | `#/appointments` | 24px | 16px |
| 고객관리 | `#/customers` | 24px | 16px |
| 상담지원 | `#/support` | 24px | 16px |
| 상품관리 | `#/products` | 24px | 16px |
| 스마트 재고 | `#/inventory` | 24px | 16px |
| 마케팅 | `#/marketing` | 24px | 16px |
| 매장관리 | `#/stores` | 24px | 16px |

- 위 전 화면에서 제목–설명 8px, 제목 영역–첫 콘텐츠 24px를 측정했습니다. 홈 버튼은 좁은 화면에서 설명 아래로 줄바꿈하며 제목·설명과 겹치지 않습니다. 320×740 홈·예약 화면도 보정 후 가로 넘침 0을 확인했습니다.
- 1366×768에서는 좌측 메뉴 높이/scrollHeight 768, 마지막 메뉴 아래 624로 잘림과 내부 스크롤이 없습니다. 고정 헤더와 제목 겹침 없음.
- 넓은 홈, C-003 브리핑 근거, 좁은 홈과 매장관리 상단은 실제 캡처로도 확인했습니다. 브리핑은 화면 내 모달에서 내용 스크롤이 가능합니다. 이전 작업의 캡처 제약을 이번 성공의 근거로 재사용하지 않았습니다.

### 명령·기능 검증 결과
- `npm.cmd run check` **성공**: 단위 테스트 **82/82**, 전체 `tsc --noEmit`, Vite 빌드 **52개 모듈**. 마지막 좁은 화면 보정 이후 재실행해 통과했습니다.
- `npm.cmd run preview:standalone` **성공**. 현재 소스로 독립 HTML 갱신.
- 기존 개발 서버 `http://127.0.0.1:5173/#/home` 재사용. 새 서버나 타 프로세스 종료 없이 직접 접속해 검증했습니다.
- 경계값 0·29·30·59·60·79·80·100, 소수 경계, 누락/NaN/Infinity/범위 밖/문자열 점수, 분석 중/실패/미분석, 집계 대상 상태, 지원 요청 처리 여부, 근거 횟수·가림, 필터·빈 배열·예약 데이터 독립성을 단위 테스트로 확인했습니다.
- 브라우저에서 기본 집계 1·3·2·1, 상담 상태+경고 필터 C-003 한 건, 위험 필터와 연결 대기 조합의 빈 결과, 필터 초기화, C-001~C-005 선택 시 각각 올바른 브리핑을 확인했습니다.
- C-003 근거 4·7·0건과 mm:ss 시점, 가림 처리, AI 안내·권장 대응·첫 문구 확인. C-004 지원 요청 미처리 표시, C-005 점수·신호 횟수 `—`와 분석 중 안내 확인.
- 브리핑 버튼 마우스 클릭 및 Enter, 신호 펼치기, Tab으로 근거 접근, 닫기 버튼·Escape, 닫힌 뒤 선택 버튼 초점 복귀와 기존 목록 필터 유지 확인. native dialog 특성상 마지막 항목에서 Tab 시 문서 BODY/브라우저 영역을 거친 뒤 다시 모달로 진입하는 동작은 그대로 유지합니다.
- 상품 4개 탭·매장 2개 탭 선택 상태 유지, 모든 메뉴 이동 확인. 기존 예약 상담 시작→완료→수정에서 원래 완료 시각 및 상태 유지, 변경 전후·샘플 수정자·수정 시각 이력 확인. 홈 예약 집계 완료 2 유지, 별도 통화 집계 1·3·2·1 유지.
- 새 검증 탭에서 샘플 초기화 버튼을 실행해 예약 원래 상태 및 통화 필터 전체 복귀를 확인했습니다. 기존 저장 데이터나 사용자 탭을 임의 초기화하지 않았습니다. 브라우저 console warn/error 0건.

### 미구현·미검증 및 확인 경로
- 실제 통화 분석 모델, 점수 산식, 실제 연결/차단/종료, 관리자 지원 요청 제출, 처리 결과 저장, 음성 재생, 외부 서비스·DB·인증·알림 연결은 요청대로 미구현입니다.
- 분석 실패·미분석·점수 누락/오류/0점은 단위 테스트로 검증했습니다. 지정된 5건 샘플에 없는 이 상태들의 실제 브라우저 화면은 별도 미검증입니다.
- Chrome/Edge 등 별도 브라우저, 실제 휴대전화, 스크린리더는 미검증입니다. 내장 브라우저의 크기별 렌더링과 키보드 조작 결과로 구분합니다.
- 독립 HTML 생성은 성공했으나 파일 직접 실행은 이번에 검증하지 않았습니다. 이전에 확인된 도구의 file:// 접근 제한을 우회하지 않았습니다.
- 화면 확인: 홈 `#/home` → 통화 현황 → C-003 브리핑 보기. 기존 상담은 `#/appointments`. 개발 서버 종료 후에는 이 프로젝트 폴더에서 `npm.cmd run dev`로 실행합니다.

## 최신 구현·검증 — 1차 상담 처리 / 2026-09-30

이 절이 현재 구현 상태입니다. 아래의 명세 작성·결정 반영·이전 검증 기록은 작업 이력으로 보존합니다.

### 작업 범위와 구현
- 실제 경로: `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`. 프로젝트 `kcm-web` / `0.3.0` 유지.
- 확정된 `docs/APPOINTMENT_CONSULTATION_DRAFT.md`를 기준으로 기존 샘플 예약 선택 → 상담 시작 → 결과 임시 반영/기록 → 상담 완료 → 완료 결과 수정만 구현했습니다. 명세는 재작성하지 않았습니다.
- 수정 가능 값은 상담 요약, 결과 구분, 후속 연락 여부·메모입니다. 명세 세부안대로 결과 구분 4개(안내 완료/추가 확인 필요/고객 검토 중/기타), 요약 1,000자, 메모 500자 제한을 적용했습니다. 완료·완료 수정 시 요약과 결과 구분이 필수이며 임시 반영은 필수값 누락을 허용합니다.
- 처음 완료할 때 예약 상태·최초 완료 시각·홈 집계를 함께 반영합니다. 완료 결과 수정은 최초 완료 시각·완료 상태·집계를 유지하며 변경 전후 4개 값, 샘플 수정자(이소현 점장), 수정 시각을 함께 기록합니다. 변경 없는 반영은 이력을 추가하지 않습니다.
- 기존 완료 샘플에 결과·완료 시각이 없으면 `기록 없음`으로 표시합니다. 결과 입력 시 변경 전은 기록 없음으로 남기며 과거 완료 시각을 만들어 넣지 않습니다.
- 브리핑 준비 중·실패·미확인 여부와 상담 상태를 분리했습니다. 상담 완료로 브리핑을 자동 확인 처리하지 않습니다. 다른 예약과 홈의 기존 업무 흐름 샘플은 변경하지 않습니다.
- 필수값/길이 오류 시 입력·기존 기록을 유지합니다. 완료 중복 요청과 동일 수정 재반영을 도메인에서 막고, 입력창 제출 잠금 및 필터 변경 직후 상담 시작 버튼의 짧은 잠금으로 연속 조작을 처리합니다.
- 입력창 닫기·Escape·배경 클릭과 화면 이동 요청은 미반영 값이 있으면 계속 작성/변경 버리기로 처리합니다. 모달이 열려 있을 때 배경의 예약·필터·메뉴 직접 조작은 기본 dialog 동작으로 차단되며, 앱의 선택·필터·검색·메뉴 콜백과 브라우저 해시 이동에도 보호를 적용했습니다. 새로고침·탭 닫기에는 beforeunload 보호를 등록합니다.
- 상태 변경으로 필터에서 예약이 제외되면 결과 입력창을 닫고 첫 남은 예약 또는 빈 안내를 표시합니다. 홈과 예약·상담관리에서 같은 데이터를 사용합니다.
- **기록은 메모리에서만 유지됩니다. 같은 탭의 메뉴 이동에는 유지되지만 새로고침·탭 닫기·샘플 초기화 후에는 원래 예시로 돌아갑니다.** localStorage/DB/실제 계정·발송·외부 연동은 추가하지 않았습니다.

### 변경 파일
- `src/types.ts`: 상담 결과·기록·변경 이력 타입, 예약별 선택적 상담 기록.
- `src/lib/consultation.ts` (신규): 입력 검증, 시작·임시 반영·완료·수정, 중복 방지와 변경 이력.
- `src/components/ConsultationPanel.tsx` (신규): 상태별 상담 조작, 결과·시각·읽기 전용 이력 조회.
- `src/components/ConsultationEditor.tsx` (신규): 입력 폼, 오류 안내, 미반영 변경 보호, 제출 잠금.
- `src/App.tsx`: 공유 데이터·집계 반영, 상담 화면 연결, 경로 이동 보호, 상세/초기화 안내.
- `src/components/Layout.tsx`: 기존 메뉴와 홈 링크를 보호된 이동 콜백에 연결.
- `src/components/Modal.tsx`: 기존 초점 대상이 사라진 경우 본문으로 초점 복원.
- `src/styles.css`: 기존 색상·폰트·카드·버튼을 사용하는 상담 영역/입력 폼 스타일만 추가.
- `tests/domain.test.ts`: 상담 업무 규칙 테스트 20개 추가(기존 40개 보존).
- `00_KCM_미리보기.html`: `npm.cmd run preview:standalone`으로 재생성.
- `docs/qa-consultation-editor.png` (신규): 기본 브라우저 크기에서 실제 입력창 화면 캡처. 1366×768 캡처로 주장하지 않습니다.
- `STATUS.md`: 이 구현·검증 기록.
- 기존 파일 해시와 비교해 확정 명세, `package.json`, `package-lock.json`, 기존 데이터·다른 메뉴 소스·기존 캡처가 보존됐음을 확인했습니다. 별도 의존성 설치/패키지 추가는 하지 않았습니다. 빌드 산출물 `dist/`, 테스트 산출물 `.test-dist/`는 명령 실행으로 갱신됐습니다.

### 명령 검증
- 사용자 설치 Node.js 22.23.3 / npm 10.9.9의 기존 환경 사용. 명령 프로세스의 PATH 앞에만 `C:\Program Files\nodejs`를 추가했고 시스템 설정·실행 정책은 변경하지 않았습니다.
- 첫 `npm.cmd run check`는 새 도메인 파일의 NodeNext 타입 import 확장자 누락(TS2835)으로 중단됐습니다. `../types.js`로 원인을 수정한 뒤 재검사했습니다. 이후 단위 테스트 **60/60**, 전체 `tsc --noEmit`, Vite 빌드 **48개 모듈** 모두 통과했습니다.
- 소스 수정 후 `npm.cmd run preview:standalone` 성공. 독립 HTML이 현재 src에서 갱신됐습니다.
- `npm.cmd run dev` 성공. 현재 개발 서버 주소 `http://127.0.0.1:5173/`, exec 세션 `62854`. 이번 작업에서 시작한 서버를 유지합니다. 서버 종료 후 직접 실행: 이 작업 폴더에서 `npm.cmd run dev`.

### 실제 브라우저 검증
Codex 내장 브라우저에서 개발 서버에 직접 접속해 키보드/폼 조작과 DOM 관찰로 확인했습니다.
- 상담 시작 시 김서연만 상담 중으로 변경, 홈 `방문 예정 6→5 / 상담 중 1→2 / 완료 1` 반영.
- 요약·결과 누락 완료 시 오류 표시 및 상담 중 유지. 임시 반영한 요약이 홈↔예약 메뉴 이동 후 유지됨.
- 요약·결과·후속 연락·메모 입력 후 최초 완료, 완료 건수 2와 상담 중 1 반영. 두 번 정정 후 최초 완료 시각과 이 집계 유지, 반영 이력 3건(최초 완료 1+수정 2), 변경 전후 값·이소현 점장(샘플 사용자)·각 시각 표시 확인.
- 완료 수정 시 요약 삭제는 반영되지 않음. 변경 없는 수정은 이력 증가 없음. 닫기/Escape와 뒤로 이동 시 계속 작성은 입력 유지, 변경 버리기는 기존 반영 결과 유지 및 요청한 화면으로 이동.
- 기록 없는 기존 완료 예약 박지훈에 결과 최초 입력 후 완료 시각 `기록 없음` 유지.
- 최윤서(브리핑 준비 중), 윤서진(브리핑 실패) 상담 시작 가능. 윤서진을 상담 중 필터+검색 결과에서 완료하면 모달 종료 후 목록 0건·빈 브리핑 표시.
- 정상 새로고침과 샘플 초기화 후 원래 8건·방문 예정 6/상담 중 1/완료 1 및 상담 기록 없음으로 복원 확인. 미반영 입력이 있는 새로고침 시도 후에는 입력창·입력값이 남아 있었으나 브라우저 고유 확인창 자체는 자동화에 노출되지 않았습니다.
- 기존 8개 메뉴 URL/본문, 상품 4개 탭·매장 2개 탭의 선택 상태, 프로필 열기·예시 로그아웃 안내/닫기 확인. 브라우저 콘솔 warn/error 0건.
- 1366×768 렌더링에서 실제 DOM 크기 측정: 좌측 메뉴 높이/scrollHeight 768, 마지막 메뉴 아래쪽 624, overflow hidden. 메뉴 잘림/내부 스크롤 없음. 본문 scrollWidth=clientWidth=1351로 가로 넘침 없음. 결과 입력 모달은 높이 약677px, 위45px/아래723px로 화면 안에 배치됨.

### 도구 제약·미검증
- 내장 브라우저의 1366×768 크기 강제 설정 시 캡처가 축소·잘리고 마우스 좌표가 어긋났습니다. 전체 페이지 캡처도 실패했습니다. 반복 시도하지 않고 기본 크기로 복원한 뒤 입력창을 육안 확인·캡처했습니다. 따라서 **1366×768 전체 화면의 정확한 이미지 검수는 미검증**, 위 크기·잘림 판단은 실제 DOM 측정 근거입니다.
- 마우스 더블클릭/모달 배경 클릭, 작성 중 다른 예약·필터의 직접 클릭, 브라우저 자체 탭 닫기 확인창, 다른 브라우저/기기 조합은 직접 검증하지 못했습니다. 중복 시작·중복 완료·수정 재전송의 데이터 규칙은 단위 테스트로 검증했습니다.
- 독립 HTML의 `file://` 직접 실행은 브라우저 도구의 URL 보안 정책(http/https만 허용)으로 차단됐습니다. 우회하지 않았으며 **HTML 생성 성공과 로컬 파일 직접 실행 검증을 구분**합니다.
- 확인된 소스/타입/빌드 오류는 없습니다. 실제 로그인·저장·외부 연동은 요청 범위에서 제외됐습니다. 다음 기능 개발은 진행하지 않았습니다.

## 최신 결정 반영 — 상담 완료 후 결과 수정 허용 / 2026-09-29

- 사용자 답변 3개를 `docs/APPOINTMENT_CONSULTATION_DRAFT.md`에 반영했습니다: 1차는 기존 예약의 상담 처리 흐름부터 시작, 예약 접수는 통화 중 시스템 즉시 접수와 고객 직접 예약 즉시 접수의 혼합 방식, 상담 완료 후 결과 기록 수정 허용.
- 완료는 매장 상담을 마치고 결과를 기록한 상태입니다. 상담 요약·결과 구분·후속 연락 정보를 수정하되 상담 완료 상태·최초 완료 시각·홈 집계는 유지하고 변경 전후 내용·수정자·수정 시각을 남기는 규칙으로 정리했습니다.
- 이전 조회 전용 제안을 관련 범위·상태표·화면 동작·예외 처리·검수 기준에서 모두 교체했습니다. 입력 검증, 변경 없는 반영, 수정 취소, 기록 없는 완료 샘플, 시연 이력의 메모리 유지 범위도 정리했습니다.
- 변경 파일: `docs/APPOINTMENT_CONSULTATION_DRAFT.md`, `STATUS.md`. 이번에는 명세만 갱신했으며 앱 소스·기능은 변경하지 않았습니다.
- 검증: 문서 내 조회 전용·완료 후 수정 미결정 문구의 잔존 여부와 관련 규칙의 일관성을 확인했습니다. 문서 변경이므로 테스트·빌드·미리보기 생성은 재실행하지 않았습니다.

## 최신 문서 작업 — 예약·상담관리 기능 명세 초안 / 2026-09-29

- 사용자 요청에 따라 `docs/APPOINTMENT_CONSULTATION_DRAFT.md`를 작성했습니다. 상태는 검토용 초안이며 구현 범위·업무 정책은 미확정입니다.
- `src/`와 기존 `SPEC.md`를 근거로 현재 조회·검색·필터·브리핑 기능과 아직 없는 상담 상태 변경·결과 기록 기능을 구분했습니다.
- 1차 권장안은 기존 샘플 예약의 상담 시작·결과 기록·완료입니다. 등록·일정 변경·담당자 변경·취소·미방문은 2차 후보로 정리했습니다.
- 상태 전환, 입력 정보, 예외 처리, 홈 수치 반영, 시연 데이터 유지 범위, 구현 후 검수 시나리오, 사용자 결정 사항을 문서화했습니다.
- 변경 파일: 위 신규 문서와 `STATUS.md`. 소스·설정·의존성·기존 확정 명세·독립 미리보기는 변경하지 않았습니다.
- 검증: 현재 코드와 초안의 설명 대조, 참조 경로 및 미확정 정책 표시 확인. 문서만 변경했으므로 단위 테스트·타입 검사·빌드·독립 미리보기 생성은 재실행하지 않았습니다. 아래 실행·검증 완료 결과는 이전 작업의 결과입니다.
- 새 기능은 구현하지 않았습니다. 다음 단계는 초안의 우선 결정 사항 3개와 1차 세부안을 사용자와 확정하는 것입니다.

## 최신 결과 — npm 설치 후 Windows 실행·검증 완료 / 2026-09-29

아래의 배포본 제작 당시 미검증 기록과 npm 미설치로 중단했던 기록은 이력으로 보존합니다. 현재 상태는 이 절을 기준으로 확인합니다.

### 환경과 명령 결과
- 실제 작업 경로: `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`.
- `package.json`: `kcm-web` / `0.3.0` 일치. 기존 AGENTS.md·STATUS.md·02_CODEX_PROMPT.txt·SPEC.md 지침을 적용했습니다.
- 사용자가 설치한 `C:\Program Files\nodejs\node.exe`: Node.js `v22.23.3`, `npm.cmd`: npm `10.9.9`. Node.js `>=22.12.0` 및 `.nvmrc`의 22 계열 조건 충족.
- 기존 Codex 명령 환경은 내장 Node.js를 우선 찾고 npm을 찾지 못했으므로, 각 실행 명령의 프로세스 안에서만 `C:\Program Files\nodejs`를 PATH 앞에 추가했습니다. 시스템 PATH와 Windows 실행 정책은 변경하지 않았습니다.
- `npm.cmd install --no-fund`: 성공. 기존에 선언된 의존성 73개 설치, npm audit 결과 취약점 0건. 새 패키지 선언이나 npm 자체 업그레이드는 하지 않았습니다.
- 최초 `package-lock.json` 생성·보관. 기존 잠금 파일은 없었습니다.
- `npm.cmd run check`: 종료 코드 0. 단위 테스트 40/40 통과, 전체 `tsc --noEmit` 타입 검사 통과, Vite 빌드 통과(45개 모듈).
- `npm.cmd ls --depth=0`: 정상. React/React DOM 18.2.0, TypeScript 5.8.3, Vite 7.3.6 등 기존 선언 범위 안에서 설치됐습니다.
- `npm.cmd run dev`: 환경 검사 통과, Vite 개발 서버 시작 성공. `http://127.0.0.1:5173/` 실제 브라우저 접속 및 HTTP 200 확인. 작업 종료 시 서버를 실행 상태로 남겼습니다.

### 실제 브라우저 검증
생성 HTML 주입 방식이 아니라 위 Vite 개발 서버를 직접 열어 확인했습니다.
- 홈 포함 8개 메뉴: 마우스 클릭 및 Enter 이동, 해당 해시 URL·선택 상태·본문 제목 일치 확인.
- 상품관리: 요금제(자사/타사)·결합정보·혜택정보·제품정보 4개 탭 전환 및 내용 표시 확인. 자사/타사 전환도 확인.
- 매장관리: 매장정보·직원정보 2개 탭 전환 및 내용 표시 확인.
- 예약 선택: 김서연(기기변경) → 정도현(가족결합) → 최윤서(인터넷·TV/브리핑 준비 중)에 따라 고객명·상담 목적·브리핑 내용이 변경됨을 확인.
- 소현 프로필: 이소현 점장·KT플라자 동성로점·평점 4.7·전문분야·상담 스타일 표시, 열기, 닫기 버튼, Escape, 외부 클릭, 외부 초점 이동으로 닫기 확인.
- 예시 로그아웃: 예시 동작이며 실제 종료할 세션이 없다는 안내창 표시 및 확인 버튼으로 닫기 확인.
- 1366×768: 좌측 8개 메뉴 모두 화면 안에 표시. 사이드바 clientHeight/scrollHeight 모두 768px, overflow-y hidden, 마지막 메뉴 하단 624px. 페이지 가로 넘침 없음(scrollWidth/clientWidth 모두 1351px, 세로 스크롤바 제외).
- 확인한 브라우저 콘솔 경고·오류 0건. 홈으로 돌아와 샘플 초기 상태로 새로고침했습니다.
- 화면 크기 변경 직후 자동화 도구의 클릭 위치 불일치가 발생했으나, 크기 설정 복원·새로고침 후 마우스로 전체 메뉴·탭·예약·프로필·로그아웃을 재확인했습니다. 이 현상 때문에 애플리케이션 소스를 수정하지 않았습니다.
- 실제 화면 캡처: `docs/qa-local-home-1366x768.png`.

### 변경 파일·생성물·남은 범위
- 변경: `STATUS.md`에 이번 결과 추가. 기존 기록은 보존.
- 신규: `package-lock.json`, `docs/qa-local-home-1366x768.png`.
- 설치·검사·빌드 생성 폴더: `node_modules/`, `.test-dist/`, `dist/`(기존 .gitignore 대상).
- 소스·package.json·기존 설정·기존 미리보기 HTML 변경 없음. 실행을 막는 소스 오류가 없어 수정하지 않았습니다.
- 소스 변경이 없으므로 `npm run preview:standalone`은 재실행하지 않았습니다.
- 남은 실행 차단 오류 없음. 요청한 브라우저 항목은 모두 확인했습니다. 다른 브라우저·추가 화면 크기·독립 HTML 직접 실행은 이번에 별도 검증하지 않았습니다.
- 실제 로그인·외부 서비스 연동·배포·GitHub 업로드·다음 기능 개발은 진행하지 않았습니다.

서버가 종료된 뒤 직접 재실행할 때:

```powershell
Set-Location -LiteralPath 'C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3'
npm.cmd run dev
```

## 기준
사용자가 확인한 v0.2와 이번 홈/좌측 배너 수정 요청을 기준으로 작업했습니다.
사용자 PC 파일을 직접 변경하지 않았으며 본 ZIP을 적용해야 반영됩니다.

## 완료
- 상단 ‘직원’/샘플 모드/데모 프로필 제거, 홈 경로 `워크스페이스 >`.
- 매장명 ‘KT플라자 동성로점’, 현재 사용자 ‘이소현 점장’으로 일원화.
- 날짜만 유지, ‘오늘의 워크스페이스’ 삭제.
- 이름 ‘소현’ 원형 아바타, 여성 레드/남성 블랙, 별 아이콘과 4.7.
- givenName 분리 및 외자·복성·미설정 성별·유효하지 않은 평점 처리.
- 프로필 작은 정보창/로그아웃 안내 예시/키보드·외부 클릭 닫기.
- 사이드바 스크롤 제거/고정/낮은 화면 대응, 좌측 설명·안내 링크 삭제.
- 직원정보와 예약 담당자 샘플을 현재 사용자와 일치시킴.
- 기존 메뉴·탭·폰트·홈 카드/예약/브리핑 샘플 동작 유지.
- 소스/HTML/개발 문서/프롬프트/테스트/스크린샷 갱신.

## 실제 검증
- 설치된 TypeScript 5.8.3와 Node 타입으로 순수 로직을 검사/컴파일.
- Node 단위 테스트 40개 통과.
- TS/TSX 21개 모듈 문법 변환 오류 0건.
- Chromium DOM 주입 UI 테스트 41항목 통과.
- 12개 화면 크기에서 홈 전체 가로 넘침/사이드바 잘림/프로필 위치 확인.
- 페이지/콘솔 오류 0건, 네트워크 요청 0건.

## 미검증
npm 레지스트리 DNS EAI_AGAIN으로 전체 의존성 설치 실패.
전체 React 타입 검사, Vite 빌드/개발 서버, Windows PC 실행은 별도 확인이 필요합니다.
file:// 직접 열기는 브라우저 정책에 의해 제한되어 DOM 주입으로 UI를 검증했습니다.
새 HTML에는 이전 v0.2 MIT React 런타임을 재사용했습니다.
로그아웃은 실제 세션을 종료하지 않습니다. 계정/DB/API/권한은 연결 전입니다.

## 다음
사용자가 HTML을 열어 헤더·프로필·사이드바를 확인합니다.
승인 후 `02_CODEX_PROMPT.txt`로 실제 PC의 설치 → check → dev를 검증합니다.

## 로컬 실행·검증 시도 — 2026-09-29

이 기록은 위 배포본 제작 당시의 검증과 구분합니다. 이번 실행은 환경 확인 단계에서 중단했으며, 기존 검증 결과를 이번 실행의 성공으로 간주하지 않습니다.

### 작업 경로와 원본
- 실제 명령 실행 경로: `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`.
- `package.json` 존재, 프로젝트 이름 `kcm-web`, 버전 `0.3.0` 확인.
- `AGENTS.md`, `STATUS.md`, `02_CODEX_PROMPT.txt`와 관련 `SPEC.md` 확인.
- 문서에 적힌 이전 상위 경로 대신 사용자가 정정한 위 하위 폴더를 사용했습니다.
- `src/` 및 기존 파일을 보존했습니다. 프로젝트 이동·재생성은 하지 않았습니다.

### 환경 확인과 막힌 지점
- `node --version`: `v24.19.0`. `package.json`의 Node.js `>=22.12.0` 조건 충족.
- 실행된 Node.js: `C:\Users\rmsgh\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`.
- `Get-Command node,npm,npm.cmd -ErrorAction SilentlyContinue`: Node.js만 확인됨.
- `npm.cmd --version`: 명령을 찾을 수 없어 실패. npm 버전 미확인.
- 기본 Node.js 설치 위치와 사용자 npm 위치, Codex 내장 Node.js 폴더에서 npm 실행 파일을 찾지 못했습니다. PC의 모든 위치를 검색한 결과는 아닙니다.
- 프로젝트에 `node_modules`와 `package-lock.json`이 없습니다. 배포본 README에도 lockfile이 없다고 명시돼 있습니다.
- npm이 없어 의존성 설치를 시작하지 않았습니다. 시스템 설치·PATH·Windows 실행 정책을 변경하거나 다른 패키지 관리자로 대체하지 않았습니다.

### 이번 검증 결과
- 기존 의존성 설치: 미실행, npm 사용 불가로 차단됨. `package-lock.json` 생성·삭제·변경 없음.
- `npm run check`: 미실행. 40개 단위 테스트·전체 타입 검사·Vite 빌드 모두 이번 환경에서는 미검증.
- `npm run dev`: 미실행. 실제 접속 가능한 개발 서버 주소 없음.
- 브라우저 직접 검증: 미실행. 홈 및 전체 8개 메뉴 이동, 상품관리 4개 탭, 매장관리 2개 탭, 예약 선택에 따른 사전 브리핑 변경, 소현 프로필 열기·닫기와 예시 로그아웃, 1366×768 사이드바 잘림 여부 모두 미검증.
- 소스 변경이 없어 `npm run preview:standalone`은 실행하지 않았습니다. 기존 미리보기 HTML을 유지했습니다.
- 소스 오류 유무는 아직 판단할 수 없습니다. 확인된 실행 차단 원인은 현재 명령 환경에서 npm을 사용할 수 없다는 점입니다.

### 변경 파일과 재개 방법
- 변경 파일: `STATUS.md`만 추가 기록. 소스·설정·의존성 선언·생성 HTML 변경 없음.
- npm 사용이 가능한 터미널을 준비하거나 기존 `npm.cmd` 경로를 확인한 뒤, 아래 순서로 실행합니다. 생성되는 `package-lock.json`은 보관합니다.

```powershell
Set-Location -LiteralPath 'C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3'
node --version
npm.cmd --version
npm.cmd install
npm.cmd run check
npm.cmd run dev
```

각 명령이 성공한 뒤 다음 명령을 실행합니다. 개발 서버가 정상 시작되면 설정상 주소는 `http://127.0.0.1:5173`이며, 이번에는 접속을 확인하지 못했습니다. 포트 충돌 시 다른 프로세스를 강제 종료하지 않습니다. 이번 작업은 여기서 멈추며 다음 기능 개발은 진행하지 않습니다.

## 실제 통화 후 음성 측정·위협 탐지 보강 — 2026-10-06

### 기준과 변경 범위
- 기준: `origin/main`의 `21c834e19fd90ef242f92fb8afe911e995302b8b`.
- 수정 브랜치: `fix/live-audio-threat-followup`. 기존 별도 작업 폴더를 재사용하며 주 작업 폴더의 `STATUS.md`와 `deliverables/` 사용자 변경을 보존했습니다.
- Supabase 키 교체 뒤 사용자 화면에 고객·현재 상품·요금제가 표시됐습니다. 반면 실제 통화의 음성 coverage 불완전으로 최종 위험도와 n8n 전송이 보류되어 새 저장 이력이 없었습니다. 실제 탭 전환이 원인이었는지는 확인되지 않았습니다.
- 독립 마이크의 첫 실제 샘플을 확인한 뒤 Retell 통화를 시작합니다. 권한·장치·분석 준비 실패나 취소는 새 통화를 생성하지 않습니다.
- 화면 렌더링 기반 측정을 AudioWorklet의 기존 2048샘플 RMS 창으로 교체했습니다. 약 100ms의 오디오 시각을 전달하므로 화면/MessagePort 전달 지연을 실제 음성 공백으로 오인하지 않습니다.
- 실제 입력 누락·track mute/ended·오디오 컨텍스트 중단·processor/flush 오류는 정상 무음으로 채우지 않습니다. 처음 muted인 입력은 unmute 이후 새 샘플만 인정하며 준비 제한시간이 지나면 오류입니다.
- 수동 종료는 SDK에 먼저 요청하고 실제 onEnd 뒤 남은 오디오 샘플을 받아 기존 최종 snapshot을 전송한 다음 독립 마이크를 해제합니다. Agent 종료도 같은 경로이며 반복 종료·이전 통화의 지연 메시지는 중복 처리하지 않습니다.
- 텍스트 규칙 `local-text-rules-v5`: “내가 니 찾아간다고”, “당신 찾아가서 내가 엎어버릴 거야”를 각각 위협 1회로 탐지합니다. 정상 방문·인용·신고·부정과 Agent 제외, ASR 정정·snapshot 중복 방지를 유지합니다.
- 고성 임계값 0.12/350ms, 해제 0.08/300ms, 실제 샘플 공백 400ms, 점수 정책·floor·최종화·Retell SDK·SSE·n8n 계약은 변경하지 않았습니다. 새 패키지·환경변수·DB/workflow 변경은 없습니다.

### 촬영 시나리오 검증
- 제시된 고객 대사 전체: 욕설 2회(씨발, 개판이네), 위협 1회(매장 뒤집어 놓을 거니까), 비난·선정적 표현 0회.
- 제품 문의·예약 시각·“가서 얘기할게요”·“네네”는 위험 신호가 아닙니다. AI의 반복 발화도 count에서 제외합니다.
- USER 분절과 `뒤집어놓을거니까` 변형, 부분→전체 snapshot, 반복 snapshot, 띄어쓰기 정정, 정상 문장으로의 정정에 대해 회귀 검사를 추가했습니다.
- 전체 음성 측정과 종료가 정상인 격리 통합 검사에서 최종 40점/경계, 위협 floor 40, 모의 n8n POST 1회를 확인했습니다. 실제 Production 자동 대여·예약 생성·SMS 발송을 검증한 것은 아닙니다.

### 실제 실행한 검증
- `npm.cmd run check`: **818/818 테스트 통과**, 프런트 `tsc --noEmit`, 백엔드 `tsc -p tsconfig.server.json`, Vite production build 통과.
- 기존 SDK 500kB 초과 chunk 경고는 남아 있으며 빌드 오류는 없습니다.
- minify된 Worklet 모듈을 격리 실행해 등록·RMS·무음 출력·flush 정상과 외부 모듈 참조가 없음을 확인했습니다.
- Chrome의 격리 합성 스트림에서 실제 AudioContext/AudioWorklet 실행: 준비 후 시작, 음성 레벨 갱신, 연속 고성 1회·해제 후 재상승 2회, 종료 flush와 `coverage_complete:true`, `closed:true`를 확인했습니다. 실제 마이크·Retell·n8n/DB는 호출하지 않았습니다.
- 고객 route 렌더링과 안전한 백엔드 연결 실패 안내, 브라우저 경고/오류 로그 0건을 확인했습니다. 검증용 프런트는 사용자 서버와 충돌하지 않는 5180 포트를 사용했습니다.
- `npm.cmd run preview:standalone`: 최신 독립 HTML 생성 및 전체 inline JS 문법 파싱 통과. 독립 HTML 직접 실행은 이번에 확인하지 않았으며 실제 Retell은 통합 서버에서 사용합니다.

### 변경 파일
- `src/dev/auxMic.ts`, `src/dev/audioLevelWorklet.ts`, `src/dev/callAudioLifecycle.ts`, `src/dev/RetellTestPage.tsx`.
- `server/text-risk.mjs`, `server/tests/text-risk.test.mjs`, `server/tests/audio-worklet-flow.test.mjs`, `server/tests/final-release-integration.test.mjs`.
- `tests/auxMic.test.ts`, `tests/audioLevelWorklet.test.ts`, `tests/callAudioLifecycle.test.ts`, `tests/retell.test.ts`.
- `server/README.md`, `STATUS.md`, `00_KCM_미리보기.html`.

### 적용과 남은 검증
- 수정 브랜치만 반영하며 이번 작업에서 main 병합·Render 배포·환경변수 변경·Production 데이터 생성은 하지 않습니다.
- 배포된 수정 버전에서 고객 화면을 새로고침하고 새 통화로 실제 마이크 측정→종료→최종 점수→n8n 1회 수신→DB 저장→다음 통화의 이전 상담 브리핑을 재검증해야 합니다.
- 실제 물리 마이크·Retell 동시 사용, 백그라운드/최소화·장치 차이, Production n8n/Supabase 저장은 이번 수정의 실제 재검증 전입니다. 미측정인 과거 통화를 0회로 채우거나 임의로 재전송하지 않습니다.

## 위해 위협 1회 최소60점 보완 — 2026-10-06

### 승인된 정책과 구현
- 기존 `fix/live-audio-threat-followup`과 PR #2를 이어 작업했습니다. 앞선 AudioWorklet·측정 준비·종료 flush 보강과 주 작업 폴더의 사용자 변경을 보존했습니다.
- 사용자 승인: 명확한 매장 파괴·폭행·살해 의사는1회라도 최소60점/위험으로 반영합니다. 일반 위협 횟수 하한40/60/80, 욕설 하한20, 기존 항목 점수표와99점 상한은 유지합니다.
- `local-text-rules-v6`: 해당 USER 근거에만 `explicitHarm:true`를 추가합니다. 겹친 규칙은 같은 발생을 추가하지 않고 위해 표시만 보강합니다. 분절 문맥에서도 표시를 유지하며 인용·신고·부정·Agent 발화는 제외합니다. 정정·삭제·역할 변경 시 최신 근거로 교체하고 구버전 cache를 재분석합니다.
- `call-risk-v5`: 공통 계산 함수의 선택 문맥으로 위해 여부를 받으며 횟수 하한과 위해 하한 중 큰 값을 적용합니다. raw_score·각 항목 점수·위협 횟수를 늘리지 않습니다. 근거 형식 오류·위협0회와 위해true 조합은 거부합니다.
- Node 최종화와 프런트 최종값 검증이 동일한 USER 분석 근거를 사용합니다. SSE의 위해 표시는 분석 정보에만 존재하며 최종 결과/n8n payload 키는 추가하지 않습니다. 과거 확정 통화·DB 기록을 재산정하지 않습니다.
- 새 환경변수·패키지·UI 레이아웃·Retell SDK·마이크/고성 기준·n8n 계약·재고 업무 로직 변경은 없습니다.

### 촬영 시나리오와 회귀 검증
- 정확한 기본 대사: 욕설2회(씨발, 개판이네), 위협1회(매장 뒤집어 놓을 거니까), 고성0 기준 raw26 → 위협 하한60 → **최종60점/위험**. 앞선40점 기록은 당시 v4 결과입니다.
- “너 찾아가서 팬다”, “당신 찾아가서 내가 엎어버릴 거야”, 명시 살해 의사는 위해1회60점. “내가 니 찾아간다고”, “가만 안 둔다”는 위해 행동을 추정하지 않고 일반1회40점. 위협3회는 계속80점입니다.
- Agent 발화 제외, 정상 매장 방문0회, USER 분절·ASR 정정·반복 snapshot, 정정에 따른 위해 표시 제거, 최종 결과 불변을 검증했습니다. 격리된 모의 n8n POST는60점/위험을1회 보내고 기존 JSON 계약만 유지합니다.
- `npm.cmd run check`: **859/859 전체 테스트 통과**, 프런트 `tsc --noEmit`와 백엔드 `tsc -p tsconfig.server.json`, Vite production build 통과. 기존 SDK chunk500kB 경고만 남아 있습니다.
- `npm.cmd run preview:standalone`: 독립 HTML 갱신 및 전체 inline JavaScript 문법 파싱 통과. 독립 HTML 직접 실행·이번 정책의 실제 음성 통화는 미검증입니다.

### 변경 파일
- `server/text-risk.mjs`, `server/live-calls.mjs`, `src/lib/riskPolicy.js`, `src/live/types.ts`, `src/live/liveCalls.ts`.
- `server/tests/text-risk.test.mjs`, `server/tests/call-risk.test.mjs`, `server/tests/audio-worklet-flow.test.mjs`, `server/tests/risk-feedback-pipeline.test.mjs`, `server/tests/final-release-integration.test.mjs`, `tests/riskPolicy.test.ts`, `tests/liveCalls.test.ts`.
- `server/README.md`, `docs/FINAL_PRODUCTION_E2E_CHECKLIST.md`, `docs/RISK_DETECTION_SEQUENCE_FEEDBACK.md`, `STATUS.md`, `00_KCM_미리보기.html`.

### 적용 범위와 남은 확인
- 수정 브랜치/PR에만 반영합니다. 이번 승인으로 main 병합·Render 배포·환경변수·Production 데이터·n8n workflow는 변경하지 않습니다.
- 다음 적용 단계는 main 병합 및 프런트/백엔드 함께 배포 후 고객 화면 새로고침입니다. 이후 실제 새 통화의 음성 coverage·위해 탐지·60점 결과·n8n1회 수신·DB 저장·다음 통화 사전 브리핑을 확인해야 합니다. 실제 음성 인식 결과가 대사와 다르면 전사 문제와 규칙 문제를 구분합니다.

## 실제 통화 재검증과 ASR 끝형 보완 — 2026-10-06

### 배포 및 실제 확인
- 사용자 후속 승인에 따라 PR #2의 `a3d13c7b16cfbf28c9c68ee283073bdc3be5fd52`를 origin/main에 fast-forward push하고 기존 Render `kcm`에 배포했습니다. Render deploy `dep-db2g69ek1f9s73abfkfg`의 Succeeded/Live와 해당 SHA를 확인했습니다. 사용자 주 작업 폴더의 미커밋 STATUS·deliverables는 변경하지 않았습니다.
- Production 9개 route 기본 화면 표시 및 브라우저 콘솔 runtime 오류 0건을 확인했습니다. `/health`, `/retell/config`와 스마트재고 stores/stock/rentals 읽기 API는 모두 HTTP200이었습니다. 실제 Retell·재고 write를 자동 실행하지 않았습니다.
- 공개 배포의 일반 저장 예약·고객 API 접근 제한은 기존 의도된 동작으로 유지합니다. configured demo customer에 대한 실시간 사전 브리핑 읽기 경로는 별도 허용되어 있습니다.
- 사용자가 새 실제 통화 2건을 수행했습니다. 두 통화 모두 음성 `available:true`, `closed:true`, `coverage_complete:true`로 종료되어 최종 위험도 보류가 해소됐고 n8n delivery는 `sent`였습니다. 고성은 관측0회이며 큰 목소리 탐지 성공을 이 통화로 단정하지 않습니다.
- 첫 통화는 욕설1/위협0/최종20점, 두 번째는 욕설2/위협0/최종20점이었습니다. 두 번째 실시간 브리핑에는 같은 고객의 첫 번째 저장 상담과20점 위험도가 조회됐습니다. n8n HTTP 성공과 실제 이전 상담 조회를 구분하며, 전문·요약의 개별 저장 노드 성공은 따로 확인해야 합니다.

### 확인된 미탐과 최소 수정
- 두 번째 USER 실제 전사: “처리 진짜 개판이네. 그날도 없으면 매장 뒤집어 놓을 테니까 알아서 하세요.” 기존 미래형 `거야/거예요/거니까`에 `테니까`가 없어 위협0회가 된 원인을 확인했습니다.
- `server/text-risk.mjs`에서 미래형 끝형에 `테니까`만 추가하고 규칙 버전을 `local-text-rules-v7`로 갱신했습니다. 위해 표시·욕설/다른 신호·40/60/80 횟수 하한·명백한 위해1회60점·항목 점수·99점 상한은 변경하지 않았습니다.
- 실제 USER 두 발화가 욕설2·위협1로 분석되고 Agent 반복·10회 snapshot은 추가 count를 만들지 않습니다. 격리된 음성/최종화/n8n 통합 검사에서 최종60점/위험과1회 POST, 원문 전문 projection 보존을 확인했습니다.
- 과거20점 확정 기록은 변경하거나 재전송하지 않습니다. 새 규칙은 배포 후 새 통화에서 재검증합니다. 환경변수·Retell Agent·DB 데이터·n8n workflow·재고 업무 로직은 변경하지 않았습니다.

### 검증 및 변경 파일
- `npm.cmd run check`: **872/872 전체 테스트 통과**, frontend `tsc --noEmit`, backend `tsc -p tsconfig.server.json`, Vite production build 통과. 기존 SDK chunk500kB 경고는 남아 있습니다.
- 변경: `server/text-risk.mjs`, `server/tests/text-risk.test.mjs`(12개 추가), `server/tests/audio-worklet-flow.test.mjs`(실제 ASR 통합1개 추가), `server/tests/final-release-integration.test.mjs`(생성 규칙 버전 기대값 갱신), `server/README.md`, `docs/FINAL_PRODUCTION_E2E_CHECKLIST.md`, `STATUS.md`.
- `npm.cmd run preview:standalone` 재생성과 전체 inline JavaScript 문법 파싱이 통과했습니다. frontend source 변경이 없어 생성 HTML 내용은 기존과 같습니다. 독립 HTML 직접 실행과 v7 배포 후 실제 새 통화의60점/n8n/DB 저장은 이 기록 시점에는 미검증입니다.

## 실시간 사전 브리핑 최종 보강·시연 회귀 — 2026-10-07

### 기준과 변경 범위
- origin/main `7da9d5b0dbf82c6bcabb385fb57ba2d7adacca1a`를 fetch·확인하고 별도 `fix/live-briefing-readiness` 브랜치를 생성했습니다. 기존 작업 폴더의 미커밋 STATUS·deliverables는 보존하고, 깨끗한 기존 worktree에서 작업했습니다.
- 좌측 ‘이번 통화’, 우측 ‘통화 시작 전의 완료 상담 기준’·‘이전 완료 상담’·‘이전 상담 종료’와 이전 점수 설명만 최소 보완했습니다. 현재 결과와 과거 저장 기록은 합산하지 않습니다.
- 공통 표시 함수에서 확인된 고정 테스트 목적/요약 2개만 정확 일치로 제외합니다. DB 원문은 변경하지 않고 DTO/화면에서 null 및 확인 가능한 요약 없음으로 표시합니다. 정상 요약의 ‘테스트’ 언급·인용·유사 문구는 유지합니다. 가짜 요약을 생성하지 않습니다.
- 기존 상담 선택·지연 저장·실패·AbortController·통화 전환 격리 구현과 테스트를 재사용했습니다. Retell·Monitor·SSE·텍스트 위험 분석·RMS·점수·n8n·재고·기존 접근 제한은 변경하지 않았습니다.

### 실행한 검증
- 전체 **881/881 테스트 통과**(기존872개 + 회귀9개), 실패/skip0. frontend `tsc --noEmit`, backend `tsc -p tsconfig.server.json` 통과.
- `npm.cmd run check`의 Vite 단계는 sandbox 상위 디렉터리 읽기 권한으로 중단됐습니다. 원인 확인 후 승인된 `npm.cmd run build`에서 프런트/백엔드 타입 검사와 Vite production build가 통과했습니다. 기존 Retell 청크500kB 경고만 남았습니다.
- 격리 HTTP 통합 테스트: 현재 통화 욕설2·위해 위협1 → 최종60점, 현재 통화의 과거 브리핑20점 유지, 동일 고객 다음 통화에서 저장 완료된60점 조회, 이전 기록·DB fixture 불변. 실제 n8n POST나 DB 쓰기는 하지 않았습니다.
- 지연 저장은 최근 완료 상담과 연결된 risk가 없으면 위험 없음으로 표시하고 더 오래된 상담 점수로 대체하지 않습니다. 이후 해당 risk60점 저장 fixture → 수동 재조회와 다음 통화 조회를 확인했습니다.
- 신규/기존 테스트로 고정 문구 제외·정상 요약 보존·서버 응답 및 원본 fixture 불변·통화별 늦은 응답/조회 실패 격리를 확인했습니다.
- Chrome: 격리 합성 DB provider/Backend/production dist에서 1920×1080, 1366×768, 390×844, 320×720 확인. 현재60점/이전20점 분리, 다음 통화 이전60점, 고정 문구 제외, 조회 오류·이력 없음·risk 저장 지연·정상 복구, 긴 요약 펼치기·Escape 닫기, 모달 가로 넘침 없음과 닫기 버튼 접근을 확인했습니다.
- 홈/예약·상담/고객/상담지원/상품/스마트재고/마케팅/매장/고객전화 9개 route 기본 렌더링과 홈 로딩 완료를 확인했습니다. 홈 복귀 후 검증 탭의 브라우저 error 로그0건입니다. 이 검증은 실제 연동·각 업무 버튼의 전체 E2E 성공을 의미하지 않습니다.
- `npm.cmd run preview:standalone`로 독립 HTML을 갱신하고 전체 inline JavaScript 문법 파싱을 통과했습니다. 직접 실행은 이번에 확인하지 않았습니다.
- 합성 브라우저 fixture와 캡처는 Git 제외 `.cache/briefing-readiness/`에만 보관했고, 이번에 띄운 격리 서버·탭을 종료했습니다. 실제 사용자 저장 데이터와 기존 서버는 변경하지 않았습니다.

### 변경 파일
- `src/lib/briefingNarrative.js`, `server/live-briefing.mjs`, `src/services/liveBriefingApi.ts`.
- `src/live/LiveCallBriefing.tsx`, `src/live/LiveConsultations.tsx`, `src/live/live-calls.css`.
- `server/tests/live-briefing-http.test.mjs`, `tests/liveBriefing.test.ts`.
- `docs/LIVE_CALL_BRIEFING.md`, `docs/BRIEFING_FILMING_READINESS.md`, `STATUS.md`, `00_KCM_미리보기.html`.

### 촬영 준비와 남은 범위
- `docs/BRIEFING_FILMING_READINESS.md`에 인사·동의 → 재고/방문 문의 → 위험 표시 → 종료/저장 → 재고 요청 → 다음 통화 브리핑 → 약정 안내 장면의 기대 결과와 실패 확인 위치를 정리했습니다.
- 실제 재통화의 이전60점 조회, 정상 상담 요약 생성·저장, 실제 예약 생성, 자동 대여 요청 연결과 문자 발송은 외부 담당자/사람의 검증이 남아 있습니다. 기존 공개 예약 API 접근 제한을 풀거나 데이터를 만들어 촬영 결과를 꾸미지 않습니다.
- 이번 작업에서 main 병합·Render 배포·실제 통화·환경변수 변경·n8n workflow 변경·Supabase Production 데이터 변경은 수행하지 않았습니다.

## 상품관리 목록 페이지 이동·화면 밀도 개선 — 2026-10-07

### 기준과 변경
- origin/main `ac59875790a8f2536a5cbcec0f282c4c56f0fd8a`를 fetch·확인한 뒤 깨끗한 기존 worktree에 `fix/products-compact-pagination`을 생성했습니다. 주 작업 폴더의 미커밋 STATUS·deliverables는 보존했습니다.
- 상품관리의 필터된 목록을 5개씩 표시합니다. 검색·검색 초기화·자사/타사·탭 전환·자료 재조회 시 첫 페이지로 돌아가며, 목록 축소 시 유효한 범위로 제한합니다. 5개 이하는 페이지 이동 UI를 숨깁니다.
- 왼쪽 목록·오른쪽 상세 구성과 기존 4개 탭을 유지합니다. 상세는 현재 페이지의 선택 항목을 표시하고, 비교 선택은 전체 catalog 기준으로 유지합니다. 긴 목록 제목·요약은 목록에서만 말줄임하고 원문 title·상세·키보드 접근은 유지합니다.
- 상품관리 범위에서만 제목·탭·카드·행 여백과 상세 필드 배치를 조정했습니다. 핵심 이름 13px·상세 값 12px를 유지하고 페이지 높이를 억지로 고정하거나 overflow를 숨기지 않습니다. 좁은 화면은 목록과 상세를 세로 배치합니다.
- 요금제 비교와 체감가 계산을 기존 모달 디자인으로 열도록 배치했습니다. 비교 선택·최대3개 제한·계산기 자체/API/계산 정책은 유지합니다. 계산기는 계속 mount되어 닫기·재열기에도 선택/결과가 보존됩니다. Escape·닫기·초점 복귀를 확인했습니다.
- 변경 파일: `src/pages/ProductsPage.tsx`, `src/lib/productLookup.ts`, `src/styles.css`, `tests/productLookup.test.ts`, `00_KCM_미리보기.html`, `STATUS.md`.

### 실행한 검증
- 전체 **885/885 테스트 통과**(기존881개 + 상품 페이지 회귀4개), 실패/skip0. frontend `tsc --noEmit`, backend `tsc -p tsconfig.server.json`, Vite production build 통과. 기존 Retell SDK chunk500kB 경고만 남습니다.
- 최초 sandbox 실행은 로컬 HTTP 통합 테스트 접속 `EACCES`로 실패했습니다. 원인을 확인하고 승인된 환경에서 전체 `npm.cmd run check`를 통과했습니다. 테스트 삭제/약화는 하지 않았습니다.
- Production의 공개 상품 catalog를 GET으로 읽어 Git 제외 `.cache/products-layout/`의 격리 검증 서버에서 사용했습니다. 실제 고객 자료·키·.env·외부 write·통화는 사용하지 않았습니다.
- Chrome 실제 CSS viewport 1920×1080 및1366×768: 기본 목록/상세의 문서 높이와 너비가 viewport와 같고 스크롤 없음. 수정 전 Production 자사51개 전체 목록의1366×768 문서 높이는4335px였습니다.
- 자사51개/11페이지 전체 이동, 마지막1개·다음 disabled, 타사57개 첫 페이지, 검색 시 첫 페이지 및 빈 결과, 결합5개 페이지 UI 숨김, 혜택/제품 탭·제품2페이지, 비교2개 유지와 비교 창, 계산기 선택 후 닫기/재열기 유지 확인.
- 390×844 및320×720: 페이지 가로 넘침 없음, 버튼 줄바꿈·목록/상세 접근 정상. 좁은 화면의 세로 스크롤과 긴 모달 내부 스크롤은 정보 보존을 위해 허용하며, 모달 경계·닫기 버튼 접근을 확인했습니다.
- 독립 읽기 전용 코드 리뷰에서 중요한 범위/회귀/페이지/접근성 문제를 발견하지 못했습니다. 서버·Retell·Monitor·SSE·위험·고성·n8n·DB·재고 업무 파일은 변경하지 않았습니다.
- `npm.cmd run preview:standalone`으로 독립 HTML 갱신. inline JavaScript 문법 및 추가 diff의 고확신 비밀값 검사 통과. 독립 HTML 직접 실행과 실제 계산 API의 브라우저 호출은 이번에 미검증이며 기존 계산 자동 테스트는 유지·통과합니다.

### 적용 상태
- 이번 수정은 작업 브랜치에만 보관합니다. main/GitHub push·Render 배포·환경변수·외부 데이터 변경은 수행하지 않았습니다. 공개 `#/products` 화면은 아직 기존 버전입니다.

## 스마트재고 목록 페이지 이동·화면 배치 개선 — 2026-10-07

### 기준과 변경
- origin/main `3dcc7f044142600275e40953fb9f376287f94a25`를 fetch·확인한 뒤 깨끗한 기존 worktree에 `fix/inventory-compact-pagination`을 생성했습니다. 주 작업 폴더의 미커밋 STATUS·deliverables는 보존했습니다.
- 재고와 대여 목록을 각각 5건씩 표시합니다. 대여는 보낸 요청/받은 요청/빌려준 건으로 구분한 전체 목록을 기준으로 페이지를 계산하며, 5건 이하는 페이지 버튼을 숨깁니다. 매장·대여 구분 변경과 재조회 시 첫 페이지, 취소 등 목록 축소 시 유효한 마지막 페이지로 조정합니다.
- 1870px 이상에서는 두 표를 나란히 배치하고, 그보다 좁은 화면에서는 ‘재고 / 대여’ 버튼으로 전환합니다. 비활성 표도 mount를 유지하여 화면 전환만으로 입력·상태를 초기화하지 않습니다. 6개 재고 컬럼과 7개 대여 컬럼, 기존 글자 크기·버튼·매장 선택·수량 입력·모달을 유지합니다.
- 재고 수정 중에는 새 페이지/화면 전환을 막고 저장·취소 안내를 표시합니다. 대여 처리 중에는 페이지·구분·화면 전환을 막습니다. 좁은 재고 편집 셀의 버튼은 자연스럽게 줄바꿈하여 다른 컬럼과 겹치지 않습니다.
- 페이지 제목·카드·표의 세로 여백만 재고 화면 범위에서 줄였습니다. 표 최소 폭은 유지하고 좁은 화면에서 표 내부 좌우 스크롤을 허용합니다. 화면 높이 고정/내용 숨김은 사용하지 않았습니다.
- 변경 파일: `src/pages/SmartInventoryPage.tsx`, `src/lib/inventoryPagination.ts`, `src/styles.css`, `tests/inventory.test.ts`, `00_KCM_미리보기.html`, `STATUS.md`.

### 실행한 검증
- 전체 **890/890 테스트 통과**(기존885개 + 페이지 회귀5개), 실패/skip0. frontend `tsc --noEmit`, backend `tsc -p tsconfig.server.json`, Vite production build 통과. 기존 Retell SDK chunk500kB 경고만 남습니다.
- 첫 전체 검사에서 변경하지 않은 SSE HTTP 테스트의 초기 `fetch failed` 1건이 발생했습니다. 해당 검사만 따로 실행해 통과한 뒤 전체 검사를 한 번 재실행하여890개를 통과했습니다. 최초 접속 오류의 세부 원인은 확정하지 않았으며 테스트 삭제/약화·SSE 코드 수정은 하지 않았습니다.
- 자동 검사에서 페이지 경계5/6/12건, 잘못된 페이지 번호, 필터 후 목록, 삭제 후 범위 조정, 원본 배열·행 참조·기존 상태별 처리 조건 보존을 확인했습니다.
- Chrome의 격리 합성 재고12건/대여26건에서 1920×1080, 1366×768, 390×844, 320×720을 확인했습니다. 기본1920 화면은 두 표/푸터가 한 화면에 표시되고 문서 크기1920×1080, 기본1366 화면은 재고·대여를 각각 전환하여 문서 크기1366×768로 페이지 스크롤이 없습니다. 1870px 전환 경계에서도 각 표 scrollWidth와 clientWidth가767px로 같았습니다.
- 모바일은 페이지 가로 넘침 없이 표 안에서 좌우 스크롤하며, 긴 내용의 세로 스크롤은 허용합니다. 수량 편집 버튼 겹침 없음, 페이지/화면 잠금, Escape 취소, 요청/취소 확인창 경계와 닫기 접근을 확인했습니다. 처리 성공 안내나 긴 오류/편집 내용이 추가되면 필요한 세로 스크롤은 허용합니다.
- 격리 메모리 fixture에서 재고2페이지 모델 수량 저장, 요청 취소 후3→2페이지 제한, 구분 변경 후1페이지, 다른 매장3건/페이지 UI 숨김, 전체12개 모델 중 화면 밖 모델 대여 요청 후 첫 페이지 표시, 승인·배송·도착·반납 버튼과 기존 request body를 확인했습니다. 실제 API/DB write나 외부 n8n 호출은 하지 않았습니다.
- 빈 목록, 전체 조회 실패, 재고 조회만 실패해도 대여 목록 유지, 정상 복구를 확인했습니다. 별도 읽기 전용 코드 리뷰에서 업무/API 회귀와 추가 중요 문제를 발견하지 못했습니다.
- 격리 화면에서 기존9개 route 기본 렌더링·빈 화면 없음과 브라우저 error 로그0건을 확인했습니다. 저장 예약/고객은 기존 접근 제한 안내를 표시하며, 실제 외부 조회·음성통화·전 업무 E2E를 검증한 것은 아닙니다.
- `npm.cmd run preview:standalone`으로 독립 HTML을 갱신했고 inline JavaScript 문법 파싱·추가 diff 고확신 비밀값 검사를 통과했습니다. 독립 HTML 직접 실행은 이번에 미검증입니다. 합성 fixture·요청 로그·화면 캡처는 Git 제외 `.cache/inventory-layout/`에만 보관합니다.

### 적용 상태
- 이번 수정은 작업 브랜치의 로컬 커밋에만 보관합니다. main/GitHub push·Render 배포·환경변수·Production 데이터는 변경하지 않습니다. 공개 `#/inventory`는 아직 이전 화면입니다.
- 스마트재고 서비스/API/대여 전이·Retell/Monitor/SSE/위험/고성/n8n 상담 저장·DB 연동 로직과 다른 화면은 변경하지 않았습니다. 배포 후 실제 읽기 결과가 긴 경우의 표시와 실제 업무 처리는 별도 확인이 필요합니다.

## 상담지원·마케팅 목록 페이지 이동·화면 밀도 개선 — 2026-10-07

### 기준과 변경
- origin/main `9ce6a31c1c2754674b7d1ecb045249cea51de245`를 fetch·확인한 뒤 기존 worktree에 `fix/support-marketing-compact`를 생성했습니다. 주 작업 폴더의 기존 변경과 작업 중 발견된 별도 미추적 `docs/n8n-repair/`는 건드리지 않았습니다.
- 상담지원은 기존 통화 범위 필터를 적용한 목록을 5건씩 표시합니다. 필터 변경 시 첫 페이지, 목록 축소 시 유효한 마지막 페이지로 조정하며 5건 이하는 페이지 버튼을 숨깁니다. 선택 통화·상세는 전체 통화에서 조회하므로 페이지 변경으로 다른 통화가 선택되지 않습니다.
- 긴 대응 가이드·관리자 지원 영역은 기본 접힘 상태입니다. ‘지원 요청/지원 상태’는 해당 통화를 선택하고 영역을 펼쳐 초점을 이동합니다. 접기만으로 입력 컴포넌트를 unmount하지 않아 요청 사유·메모·지원 내용이 유지됩니다. 상담 상세와 기존 지원 전이는 그대로 사용합니다.
- 마케팅은 완료 상담 목록을 5건씩 표시합니다. 전체/처리 완료 집계와 선택한 상담·처리 기록은 전체 목록을 기준으로 유지하고, 동의 제한·메시지 확인·안내 처리·기록 조회 로직은 변경하지 않았습니다.
- 두 화면의 카드 제목·표 행·안내·페이지 버튼 영역 상하 여백만 줄였습니다. 컬럼·글자 크기·색상·기존 디자인은 유지하고 페이지 고정 높이/overflow 숨김은 추가하지 않았습니다.
- 변경 파일: `src/pages/SupportPage.tsx`, `src/pages/MarketingPage.tsx`, `src/styles.css`, `tests/aftercare.test.ts`, `00_KCM_미리보기.html`, `STATUS.md`.

### 실행한 검증
- 전체 **893/893 테스트 통과**(기존890개 + 사후관리 회귀3개), 실패/skip0. frontend `tsc --noEmit`, backend `tsc -p tsconfig.server.json`, Vite production build 통과. 마지막 scoped CSS 여백 조정 후 build/typecheck도 다시 통과했습니다. 기존 Retell SDK chunk500kB 경고만 남습니다.
- 첫 sandbox 전체 실행의 로컬 HTTP 검사 실패는 focused 검사에서 `connect EACCES 127.0.0.1`로 확인했습니다. 원인 확인 후 승인된 환경에서 전체 `npm.cmd run check`를 통과했습니다. 테스트 삭제/약화·업무 로직 수정은 하지 않았습니다.
- 추가 자동 검사: 완료12건 페이지 이동과 전체 집계/원본 보존, 목록6→5→0 범위 보정과 처리 기록 보존, 화면 밖 상담의 동의 제한과 메시지 변경 후 재확인 조건. 기존 공통 5건 페이지 helper 검사를 재사용했습니다.
- Chrome 격리 메모리 fixture: 상담19건·완료8건과 기본5건·빈 목록을 확인했습니다. 상담지원 요청 입력 → 접기 → 페이지/필터 변경 → 펼치기에서 사유·메모 유지, 관리자 확인·내용 입력·완료, 미완료 필터 목록6→5 시 페이지 UI 숨김, 선택한 완료 통화 유지와 올바른 통화 초점 이동을 확인했습니다.
- 마케팅2페이지에서 메시지 수정·확인·안내 처리, 첫 페이지에서도 전체8건/처리완료1건 집계 유지, 다시 열기와 메뉴 이동 후 기록 보존, 동의 거절 고객 처리 차단을 확인했습니다. 모든 처리 대상은 격리된 메모리 fixture입니다.
- 실제 CSS viewport1920×1080 및1366×768에서 두 화면의 기본5행/접힌 가이드는 문서 크기가 viewport와 같고 페이지 스크롤이 없습니다. 390×844에서 기본 목록 배치와320×720에서 페이지/버튼 접근, 확인창 경계·내부 스크롤·Escape 닫기·초점 복귀를 확인했습니다. 좁은 화면의 표 내부 좌우 스크롤과 필요한 세로 스크롤, 펼친 긴 가이드의 세로 스크롤은 허용합니다.
- production dist를 격리 localhost 서버로 제공하여 home/appointments/customers/support/products/inventory/marketing/stores/retell-test 9개 route 기본 렌더링·빈 화면 없음·브라우저 error 로그0건을 확인했습니다. 저장 자료/재고 API는 격리 서버의 접근 제한/조회 오류 UI로 확인했으며 실제 외부 조회·업무 E2E 성공을 의미하지 않습니다.
- 독립 읽기 전용 코드 리뷰에서 중요한 페이지/입력/집계/업무 회귀를 발견하지 못했습니다. Retell·Monitor·SSE·텍스트 위험·고성·점수·n8n·DB·스마트재고 업무 파일은 변경하지 않았습니다.
- `npm.cmd run preview:standalone`으로 독립 HTML을 갱신했고 inline JavaScript 문법 파싱·추가 diff 고확신 비밀값 검사를 통과했습니다. 독립 HTML 직접 실행은 이번에 미검증입니다. 브라우저 fixture·검사 로그·캡처는 Git 제외 `.cache/workflow-layout/`에만 보관합니다.

### 적용 상태와 남은 범위
- 수정은 `fix/support-marketing-compact` 작업 브랜치에만 보관합니다. main 병합·GitHub main push·Render 배포·환경변수 변경·실제 통화·외부 데이터 변경은 수행하지 않았습니다. 공개 상담지원/마케팅 화면은 아직 이전 버전입니다.
- 실제 Production 자료가 긴 경우의 화면 표시와 실제 외부 연동 검증은 배포 후 별도 확인이 필요합니다. 새로고침 시 데모 상태 초기화 정책과 실제 문자 미전송 안내를 유지합니다.

## 매장관리 화면 밀도·리뷰 접힘 개선 — 2026-10-07

### 기준과 변경
- origin/main `065f9342577e9c74986df76f4c9a8449e499ca75`를 fetch·확인한 뒤 기존 worktree에 `fix/stores-compact-layout`을 생성했습니다. 주 작업 폴더의 기존 변경과 별도 미추적 `docs/n8n-repair/`는 건드리지 않았습니다.
- 매장정보·직원정보의 제목·탭·카드·목록·상세 상하 여백을 매장관리 범위에서만 줄였습니다. 기존 글자 크기·색상·두 탭·5개 매장/3명 직원 목록·주소·영업시간·전문분야·소개·평점은 유지합니다.
- 리뷰는 기본 접힌 `details/summary`로 표시하고 ‘리뷰 보기/리뷰 접기’로 전체 작성자·점수·본문을 확인합니다. 매장/직원을 바꾸면 새 대상의 리뷰를 다시 접으며, 탭을 오갈 때 선택 ID는 기존대로 유지합니다. 등록된 리뷰가 없을 때의 안내도 추가했습니다.
- 화면 높이 고정이나 본문 overflow 숨김은 추가하지 않았습니다. 좁은 화면과 펼친 긴 리뷰에는 필요한 세로 스크롤을 허용합니다.
- 변경 파일: `src/pages/StoreManagementPage.tsx`, `src/styles.css`, `00_KCM_미리보기.html`, `STATUS.md`.

### 실행한 검증
- 전체 **893/893 테스트 통과**, 실패/skip0. frontend `tsc --noEmit`, backend `tsc -p tsconfig.server.json`, Vite production build 통과. 기존 Retell SDK chunk500kB 경고만 남습니다. 테스트 삭제·약화는 하지 않았습니다.
- Chrome에서 현재 production dist를 외부 접근 없는 격리 localhost 서버로 제공했습니다. 실제 CSS viewport1920×1080와1366×768에서 기본 매장정보/직원정보는 페이지 스크롤 없이 표시됩니다. 이전1366×768 Production 화면의 문서 높이 매장904px·직원1032px에서 각각768px로 줄었습니다.
- 기본5개 매장과3명 직원의 선택·주소/프로필·평점·리뷰 확인, 리뷰 마우스 펼치기/접기와 Enter/Space 조작, 대상 변경 시 리뷰 접힘·다른 리뷰 혼입 없음, 탭 왕복 후 선택 유지 확인. 390×844와320×720에서는 가로 넘침 없이 카드/평점/리뷰 제목·버튼이 표시되고 내용에 따라 세로 스크롤을 허용합니다.
- 독립 읽기 전용 코드 리뷰에서 중요한 기능·접근성 회귀를 발견하지 못했습니다. 변경 CSS는 `.stores-page`에만 적용합니다. 매장관리 검증 탭의 브라우저 error 로그0건입니다.
- `npm.cmd run preview:standalone`으로 독립 HTML을 갱신하고 inline JavaScript 문법 파싱·추가 diff 고확신 비밀값 검사를 통과했습니다. 갱신 HTML을 로컬 HTTP로 직접 열어 두 탭과 직원 리뷰 펼치기를 확인했습니다. 파일 더블클릭 방식은 별도 미검증입니다.
- 검증 로그·화면 캡처는 Git 제외 `.cache/stores-layout/`에만 보관합니다. 실제 사용자 저장 데이터·환경변수·외부 API/DB·기존 서버는 변경하지 않았습니다. Retell·Monitor·SSE·위험·고성·점수·n8n·스마트재고 업무 파일도 변경하지 않았습니다.

### 적용 상태
- 이번 수정은 작업 브랜치의 로컬 커밋에만 보관합니다. main 병합·GitHub push·Render 배포는 수행하지 않았습니다. 공개 `#/stores`는 아직 기존 버전이며 실제 외부 연동·통화 재검증은 이번 UI 작업 범위에서 수행하지 않았습니다.

## 홈 대시보드 핵심 통화 영역 정리 — 2026-10-07

### 기준과 변경
- origin/main `858cfd7b67544bbf9c1764719f661e4c00c37f0a`에서 `fix/home-focused-layout`을 생성하고 별도 worktree에서 작업했습니다. 기존 주 작업 폴더와 다른 worktree의 문서 변경·미추적 자료는 보존했습니다.
- 홈에서만 저장된 예약 카드, 별도 참고 예약·상담 영역, 재고·반납 확인 카드, 최근 업무 흐름을 제거했습니다. 홈은 제목 → 기존 4개 현황 카드 → 통화 현황 → 실시간 AI 상담 순서입니다.
- 예약·상담관리의 저장 예약/참고 예약/브리핑/상담 처리와 스마트 재고 전용 화면은 유지합니다. 통화 현황의 기존 5건 페이지 이동·필터·집계와 상담 상태 처리도 변경하지 않았습니다.
- 홈 범위의 제목·카드·표·푸터 여백을 정리했습니다. 데스크톱 실시간 상담은 제목과 현재/최근 통화를 가로 배치하며 한 건이면 남은 폭을 활용합니다. 여러 활성 통화는 추가 행으로 모두 표시하며 내용 숨김이나 고정 높이를 적용하지 않습니다. 글자 크기·색상·메뉴는 유지합니다.
- 화면 상담 집계와 실제 실시간 통화를 혼동하지 않도록 기존 구분 안내는 유지합니다. 제거한 홈 영역 때문에 저장 예약 조회가 홈에서 자동 실행되지 않습니다.
- 변경 파일: `src/App.tsx`, `src/styles.css`, `00_KCM_미리보기.html`, `STATUS.md`.

### 실행한 검증
- 전체 **893/893 테스트 통과**, 실패/skip0. frontend `tsc --noEmit`, backend `tsc -p tsconfig.server.json`, production build 통과. 마지막 scoped CSS 배치 보완 후 build/typecheck도 통과했습니다. 기존 Retell SDK chunk500kB 경고만 남습니다. 테스트 삭제·약화·의존성 변경은 하지 않았습니다.
- Chrome에서 production dist를 외부 접근 없는 격리 localhost 서버로 확인했습니다. 실제 CSS viewport1920×1080와1366×768에서 기본 통화5행 + 진행 통화1건/최근 종료1건은 문서 크기가 viewport와 같아 페이지 스크롤이 없습니다. 1366에서 실시간 통화0/1건과 연결 재시도 안내도 정상 표시합니다.
- 390×844, 320×720에서 제목·버튼·필터 줄바꿈과 페이지 가로 넘침 없음, 표 내부 좌우 스크롤, 실시간 상세/브리핑의 내부 스크롤과 닫기 접근을 확인했습니다. 좁은 화면·여러 동시 통화·펼친 긴 상세에는 필요한 세로 스크롤을 허용합니다. 1102px에서 활성5건을 추가 행으로 모두 표시하며 제목 겹침/페이지 가로 넘침 없음도 확인했습니다.
- 격리 화면에서 C-003 브리핑 → 상담 시작 → 카드1/2/1/1 → 상담 중 필터 → 메뉴 왕복 후 이어보기 유지, 완료 필터의 빈 결과 안내와 필터 초기화, 실시간 상담/사전 브리핑 상세 열기·닫기를 확인했습니다. 예약·상담 보기 버튼과 전용 화면의 참고 예약/상담 영역, 스마트 재고 route의 렌더링을 확인했습니다. 저장 자료 API는 격리 서버의 오류/접근 제한 안내로 확인했으며 실제 외부 조회 성공을 의미하지 않습니다. 브라우저 error/warn 로그0건입니다.
- `npm.cmd run preview:standalone`으로 HTML을 갱신하고 inline JavaScript 문법 검사 통과, 로컬 HTTP로 직접 열어 홈 영역 제거·5행 표·1366 화면 높이를 확인했습니다. 파일 더블클릭 실행은 별도 미검증입니다. 검증 서버/로그/캡처는 Git 제외 `.cache/home-layout/`에만 보관합니다.
- 읽기 전용 코드 리뷰에서 전용 예약/재고 메뉴 보존을 확인했습니다. Retell·Monitor·SSE·위험 분석·고성·점수·n8n·실제 데이터·재고 업무 파일은 변경하지 않았습니다. 실제 통화·외부 데이터 변경·환경변수 변경·기존 서버 종료는 수행하지 않았습니다.

### 적용 상태
- 수정은 작업 브랜치의 로컬 커밋에만 보관합니다. main/GitHub push·Render 배포는 수행하지 않았으며 공개 홈은 아직 이전 화면입니다. 고객관리 화면 조정은 이번 범위에서 진행하지 않았습니다.

## 고객관리 목록·이력 압축과 저장 자료 접근 진단 — 2026-10-07

### 기준과 변경
- fetch한 origin/main `0ef0e8e2aa2f4274553cc3dfabd8befa6bac3ff0`에서 `fix/customers-compact-history`를 생성했습니다. 기존 주 작업 폴더와 다른 worktree의 수정·미추적 문서는 보존했습니다.
- 고객관리의 수신 통화 이력과 저장 고객을 별도 탭으로 나눴습니다. 탭만 바꿀 때 컴포넌트를 유지하여 SSE 수신, 선택 고객, 검색·필터·페이지 상태가 유지됩니다.
- 수신 통화는 고객/상담 상태 필터 후 5건씩 표시합니다. 필터 변경은 첫 페이지, 기록 축소는 유효 범위로 보정하며 5건 이하는 페이지 버튼을 숨깁니다. 같은 고객의 최근 완료 위험도는 전체 수신 이력에서 선택하고, 각 통화의 독립 위험도·전송 상태는 행에서 구분합니다. 미식별 통화는 각각 별도 고객 선택 항목입니다.
- 저장 고객 목록과 조회된 상담 이력은 각각 5건씩 표시합니다. 최근 이력 5→최대20건 조회 정책과 개인정보 동의 제한을 유지합니다. 위험도는 ‘조회 이력 중 최근 완료 위험도’로 범위를 명시하고, 최신 기록의 점수 누락을 더 오래된 점수로 대체하지 않습니다. 위험도를 재계산하거나 합산하지 않습니다.
- 긴 상담 목적은 목록에서 한 줄 미리보기와 title로 표시하고, 저장 상담 요약·전체 ID·단계별 위험도는 기존 Modal과 그대로 보존한 StoredConsultationList에서 확인합니다. 연락처는 선택 고객 정보에 표시하고 상품·요금제는 펼쳐 볼 수 있습니다. 기존 방문 예약 참고 자료는 접힌 영역에 유지합니다.
- 고객관리 범위에서만 카드·표·제목·푸터 여백을 정리했습니다. 고객명13px/본문12px/보조정보11px를 유지하고 표 행은48px 기준입니다. 페이지 고정 높이·본문 overflow 숨김·글자 축소로 내용을 가리지 않았습니다. 모바일 표만 내부 가로 스크롤을 허용합니다.
- 변경 파일: `src/pages/SecondaryPages.tsx`, `src/components/StoredCustomers.tsx`, `src/live/LiveConsultations.tsx`, `src/live/CustomerCallHistory.tsx`, `src/live/customerHistory.ts`, `src/live/live-calls.css`, `src/lib/storedCustomerPresentation.ts`, `src/services/realDataApi.ts`, `src/styles.css`, 관련 테스트4개, `00_KCM_미리보기.html`, `STATUS.md`.

### 공개 저장 자료 조회 진단
- Production read-only GET: `/health`200, `/api/data/status`200(configured/scopeConfigured=true), `/api/data/customers`와 `/api/data/appointments`503 `REAL_DATA_ACCESS_RESTRICTED`를 확인했습니다. status 응답은 설정 형식/매장 범위 확인이며 DB SELECT 성공을 의미하지 않습니다.
- 원인은 `server/app.mjs`의 기존 공개 배포 접근 제한입니다. 배포 origin이 localhost가 아니면 저장 고객/예약·예약 브리핑 요청을 DB 조회 전에 차단합니다. Supabase key 변경으로 이 제한이 해제되지 않습니다. 직원 인증 구현이나 실제 인증 검증 경로는 현재 없습니다.
- 이번에는 서버 guard·권한·환경변수를 변경하지 않았습니다. 화면 안내를 직원 인증 전 공개 조회 제한으로 명확히 했으며 영구 제한 상태에서는 무의미한 재시도 버튼을 숨겼습니다. 일시 조회 실패의 재시도는 유지합니다. 실제 DB 자료를 공개 노출하는 우회는 하지 않았습니다.

### 실행한 검증
- 전체 **902/902 테스트 통과**(기존893개 + 고객 이력 회귀9개), 실패/skip0. frontend `tsc --noEmit`, backend `tsc -p tsconfig.server.json`, production build 통과. 기존 Retell SDK chunk500kB 경고만 남습니다. 테스트 삭제·약화·의존성 변경은 없습니다. 로컬 HTTP 검사를 포함한 최종 전체 검사는 승인 환경에서 실행했습니다.
- 자동 검사: 필터 후 페이지 이동/경계, 원본 보존, 전체 이력의 최신 위험도 유지, 최신 점수 미확정 시 과거 점수 대체 금지, 미식별 통화 분리, 저장 이력 고객별 분리·완료 상태·단계별60/0점 독립 보존, 빈 목록/범위 보정. 기존 공개 배포 guard 테스트도 유지·통과했습니다.
- production dist를 외부 연결 없는 localhost fixture로 제공했습니다. 합성 통화19건(동일 고객11건), 저장 고객12명, 고객별 상담12건에서 마지막 페이지/5건 이하 페이지 숨김, 필터 빈 결과, 최근 완료60점과 진행 통화 미확정 구분, 저장 이력 페이지를 바꿔도 최신60점 유지, 통화/저장 상담 상세 열기·Escape 닫기·초점 복귀, 탭 왕복 후 검색/필터 보존을 확인했습니다.
- 저장 자료 없음/고객 조회 실패/상담 조회 실패/이력 없음/공개 접근 제한을 확인했습니다. 지연된 첫 고객 응답 중 다른 고객으로 전환한 뒤 이전 기록이 섞이지 않았고, 목록12→3건 새로고침과 개인정보 미동의 고객의 조회 차단도 확인했습니다. HTML처럼 보이는 합성 요약은 텍스트로 표시되고 script 요소가 생성되지 않습니다.
- 실제 CSS viewport1920×1080와1366×768에서 두 탭의 기본5행은 문서 크기가 viewport와 같고 페이지 가로/세로 스크롤이 없습니다. 390×844와320×720에서는 페이지 가로 넘침 없이 표 내부 가로 스크롤·필터 줄바꿈을 확인했습니다. 긴 저장 상담 Modal과 기존 실시간 Modal은 viewport 안에 있고 닫기 접근이 가능합니다. 좁은 화면/펼친 상품·참고 자료/여러 단계 위험도에는 필요한 세로 스크롤을 허용합니다.
- 격리 화면에서 home/appointments/customers/support/products/inventory/marketing/stores/retell-test 9개 route의 기본 제목/본문 렌더링과 고객 화면 title을 확인했습니다. JS runtime 오류는 없었습니다. 브라우저 메시지 채널 오류3건은 별도 관측되었으며 원인은 미확정입니다. 격리 서버의 외부 API 오류 안내 확인은 실제 외부 업무 성공을 의미하지 않습니다.
- 읽기 전용 코드 리뷰에서 중요한 상태·페이지·위험도 표시·권한 회귀를 발견하지 못했습니다. Retell/Monitor/SSE 수신·브리핑 조회·고성/위험 점수/n8n/스마트재고 업무 로직은 변경하지 않았습니다. LiveConsultations는 고객 이력 표시 분기만 교체했습니다.
- `npm.cmd run preview:standalone`으로 HTML 갱신, inline JavaScript 문법 검사와 localhost HTTP 직접 실행으로 고객관리 탭/본문을 확인했습니다. 파일 더블클릭 실행은 별도 미검증입니다. 검증 fixture·로그·캡처는 Git 제외 `.cache/customers-layout/` 등에만 보관하며 실제 통화·사용자 저장 데이터 초기화·외부 DB write는 하지 않았습니다.

### 적용 상태와 남은 범위
- 이번 수정은 작업 브랜치 로컬 커밋에 보관하며 main 병합/GitHub push/Render 배포는 수행하지 않습니다. 공개 고객관리 화면은 아직 이전 버전입니다.
- 실제 직원 인증과 허가된 저장 자료 조회 연결은 별도 범위입니다. 공개 조회 제한은 유지하며 이번 UI 변경만으로 저장 고객·예약이 Production에서 조회된다고 보고하지 않습니다. 실제 음성 통화·n8n/DB 저장 E2E도 이번에 실행하지 않았습니다.
## 촬영 자료·마케팅·체감가 점검과 이름 표시 보완 — 2026-10-07

### 기준과 변경
- origin/main `25adc7de401f2dfd3cd393a5a309581532a7402b`를 확인한 뒤 `fix/filming-marketing-price-readiness`에서 작업합니다. 기존 다른 worktree의 사용자 변경은 건드리지 않습니다.
- 사용자가 승인한 기존 화면용 예시 자료에 한해, 원래 완료였던 `DEMO-R001`에 명시적인 가상 처리 결과·후속 메모·입력 기준일 10:30 시작/10:50 완료·직원 이지은의 완료 이력 1건을 준비합니다. 기존 예약 ID·상태·완료 집계·동의와 다른 예약은 유지합니다. 실제 DB/AI 요약을 생성한 기록이 아닙니다.
- 마케팅에서 확인한 수정 메시지가 목록에 반영되지 않던 표시 오류를 고칩니다. 유효한 확인 기록 또는 이미 처리된 기록의 문구를 표시하며, 미확인 입력·오래된 확인은 기존 동의/원본 일치 검사를 그대로 따릅니다. 화면용 예시·문자 미전송·새로고침 초기화 안내를 명시합니다.
- 실제 저장 표시명 중 확인된 `테***객`만 유효한 고객 ID에 따라 `고객 9999`처럼 중립 표시합니다. 실시간 브리핑·저장 고객·저장 예약·체감가 고객 선택에 적용하고, 화면 표시명으로도 검색할 수 있습니다. 원본 DTO·DB 이름·ID·조회/선택 값·기존 검색값·일반 마스킹·비공개 고객은 유지합니다.
- 기존 화면 고객·직원·매장명은 이미 자연스러운 가상 이름이므로 유지합니다. 공개 스마트재고의 매장 목록은 KT플라자 대구점/동대구점/칠곡점/서대구점/동성로점으로 표시됨을 확인했습니다. 실제 매장/직원/리뷰 원본은 수정하지 않습니다.
- `docs/BRIEFING_FILMING_READINESS.md`에 화면별 자료 출처·촬영 조건·마케팅/체감가 확인 범위·남은 실제 예약/자동 대여/문자 검증을 추가합니다.

### 실행한 검증
- 전체 **908/908 테스트 통과**(기존902 + 사후관리3 + 고객 표시3), 실패/skip0. frontend `tsc --noEmit`, backend `tsc -p tsconfig.server.json`, Vite production build 통과. 표시명 검색 보완 후 build/typecheck도 다시 통과했습니다. 기존 Retell SDK chunk500kB 경고만 남습니다.
- 결과 누락·동의 차단 테스트를 명시적인 누락 fixture로 유지하고, 기본 가상 결과·첫 완료 이력·집계·실행별 독립·원본 보존·초기화·고객 식별 분리를 추가 검증합니다. 기존 테스트 삭제/약화는 없습니다.
- 공개 서버의 상품 UI에서 고객 없는 계산을 실행: 저장 월정액90,000원, 결합 조건 미확정 시 할인/소계 보류, 확인된 정액 할인7,000원→통신요금 소계83,000원, 단말 일시 가격1,984,400원/월할부·최종 총부담 확인 필요. 선택 변경 후 이전 결과 제거, 계산 창 재열기에서 선택·결과 유지, 브라우저 error/warn 로그0건을 확인합니다. 이는 실제 저장 catalog의 계산 확인이며 최신 공식 가격 검증이 아닙니다.
- 공개 스마트재고에서 읽기만 수행하여 매장5곳·재고12건·대여25건의 정상 조회를 확인합니다. 수량/대여 변경은 실행하지 않습니다.
- 격리 localhost production 빌드에서 기본 마케팅 예시의 메시지 수정→확인→목록 반영→추가 수정 시 재확인→안내 처리→메뉴 이동/재열기에서 문구·최초 시각·처리자 보존을 확인합니다. 새로고침하면 기본 예시/처리 대기로 돌아옵니다. 실제 SMS·DB write·외부 전송은 없습니다.
- 1366×768에서 기본 마케팅 문서 크기1366×768로 페이지 스크롤 없음. 390×844 및320×720에서 페이지 가로 넘침 없음, 모달 경계/닫기/버튼 접근 정상. 320px의 긴 모달은 내부 스크롤을 허용합니다. 레이아웃/폰트/CSS는 수정하지 않습니다.
- 격리 저장 고객의 `고객 9999` 표시·같은 표시명 검색, 실제 브리핑과 같은 계약의 합성 응답에서 표시명·과거60점 분리 표시를 확인합니다. 합성 응답의 처음 안내2개 계약 누락은 검증 fixture에서 보완했으며 제품 코드는 바꾸지 않습니다.
- 격리9개 route(home/appointments/customers/support/products/inventory/marketing/stores/retell-test)의 기본 렌더링·제목·빈 화면 없음·브라우저 error 로그0건을 확인합니다. 실제 전 업무 E2E 성공을 의미하지 않습니다.
- 독립 읽기 전용 리뷰에서 저장/동의/시간/중복 처리/테스트 약화의 중요한 문제를 발견하지 못했습니다. 리뷰에서 지적한 표시명 검색 불일치는 기존 검색값을 유지하며 표시명만 더해 보완했습니다.
- `npm.cmd run preview:standalone` 갱신, inline JavaScript 문법 및 추가 diff의 고확신 비밀값 검사 통과. 독립 HTML을 브라우저에서 직접 열어 기본 마케팅 완료 자료·메시지 입력·확인창·error 로그0건을 확인합니다. 브라우저 fixture·로그·캡처는 Git 제외 `.cache/filming-readiness/`에만 보관합니다.

### 적용 범위와 남은 조건
- main 병합·Render 배포·환경변수·실제 통화·Production DB·n8n workflow·SMS·스마트재고 write는 변경/실행하지 않습니다. Retell·Monitor·SSE·위험 신호·점수·고성·전송/저장 업무 코드와 접근 제한은 그대로입니다.
- 마케팅은 화면용 완료 상담의 메모리 처리 기록이며 실제 문자 발송/실제 저장 상담 사후관리 연동이 아닙니다. 새로고침 시 사용자 처리 기록 초기화 정책을 유지합니다.
- 체감가의 고객 지정 비교는 공개 직원 조회 접근 제한이 유지됩니다. 미확인 할인·월할부·약정 조건의 최종 총부담을 계산한 것으로 표현하지 않습니다.
- 실제 수신 통화/고객/예약의 빈 이력은 가짜 자료로 채우지 않습니다. 실제 예약 생성→자동 대여 연결, 고정 테스트 요약의 실제 요약 생성, SOLAPI 배달, 실제 음성 리허설은 담당자 외부 검증이 필요합니다.
