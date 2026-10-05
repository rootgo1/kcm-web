# KCM Release Candidate · 2026-10-05

## 최신 검토 후보: Final Polish

현재 검토 브랜치는 `release/kcm-final-polish`이며 기준 main은 `4808bc135c4efb6d3234afefbf273306ee4f594f`이다. 상품 조회/비교 보강·사용자 문구 정리·고객 진단 UI 숨김·좁은 화면 보정을 반영했다. **353개 테스트·프런트/백엔드 타입 검사·production build 통과**, 9개 화면의 4개 크기와 주요 업무 흐름을 격리 브라우저에서 확인했다.

상세 변경·메뉴 상태·유지한 제한·스마트 재고 병합 주의·내일 실제 검증 순서는 [FINAL_POLISH.md](FINAL_POLISH.md)를 따른다. 이번 작업에서 main 병합·Render·환경변수·실제 음성/외부 저장은 변경하거나 실행하지 않는다. 고객 화면의 ‘테스트 정보’는 현재 완전히 숨겨져 있으며 보조 마이크·reporter는 자동으로 유지된다. 마케팅의 기존 발송 버튼은 ‘안내 처리’로 표시하지만 처리 상태와 외부 문자 미전송은 동일하다.

아래는 최초 RC의 인수 기록이며 최신 UI와 검증 수치는 위 문서와 STATUS의 Final Polish 항목이 우선한다.

검토 브랜치: `release/kcm-rc`. 개발 Freeze 예정: 10월 6일, 영상·PT 제작: 10월 7일.
기존 main과 미커밋 UI를 보존한 검토 후보이며 main 병합·Render 배포는 사용자 검토 후 진행한다.

## 코드 상태

- 홈: 카드 → 통화 현황 → 실시간 상담. 필터 옆 배치, 5건 페이지네이션, 페이지 보정, 반응형 고객 통화 화면, 경로별 title을 보존.
- 고객관리: 서버가 수신한 실시간 통화를 고객 ID별로 묶어 최근 완료 위험도와 각 통화 기록을 조회. 미식별 통화는 서로 합치지 않는다. 최신 완료 통화의 점수가 보류이면 이전 점수를 대신 표시하지 않는다.
- 실시간 패널: consultation/customer/store/call ID, 전문, 5개 신호, 최종 위험도, n8n 전송 상태 확인.
- 고객 정보는 현재 서버 식별 ID까지 제공한다. 실제 고객 이름·전화번호·서버 재시작 이전 DB 이력 조회는 미구현이다.
- 상품 4개 탭은 명시적인 가상 조회 자료를 제공한다. 상담지원은 기존 통화 데모의 목록·가이드·상담 상세·관리자 지원 처리를 공유한다. 마케팅은 완료 통화/방문 예약 결과를 사용해 메시지 확인·데모 발송·완료 기록 조회를 제공한다. 연락 동의는 명시적인 가상 설정이며 실제 가입·구매·문자·DB CRUD를 실행하지 않는다.
- 예약 상담의 완료·수정·최초 완료 시각·집계·이력, 통화 데모의 관리자 지원·완료 기록·다음 통화는 기존 동작을 유지한다.
- SDK의 늦은 상태/종료 이벤트가 종료 화면을 다시 통화 중으로 바꾸거나 종료 정보를 덮어쓰지 않도록 차단한다.

## 유지한 연결 및 점수 정책

고객 클릭 → 보조 마이크 자동 시작 및 Retell Web Call → live 시 audio reporter 시작 → Monitor 전문 snapshot → SSE 직원 화면 → 최종 audio snapshot → 통화 종료 → 유효한 텍스트/음성 결과 확정 → n8n POST.

- `call-risk-v2`: 매 통화 0점에서 독립 계산, 0~99점·5단계, 기존 항목 점수표와 위협 최소점수 보정을 유지한다. 이전 상담 점수는 합산하지 않는다.
- 고성 기준 0.12/350ms, 해제 0.08/300ms 및 상태 머신을 유지한다.
- 미측정·중단 음성 구간은 정상 0회로 보정하지 않는다. 최종 위험도와 전송을 보류한다.
- consultation ID는 새 통화마다 숫자 형식으로 한 번 생성. 고객·매장 ID는 서버 설정에서만 받아 통화별로 보존한다.
- 최종 확정 전 POST 없음. call ID별로 먼저 pending을 등록한 후 sent/failed로 전환하여 한 서버 실행 중 중복 POST를 막는다. 실패 결과를 보존하며 자동 재시도 큐는 없다.
- 중복 방지는 메모리 기준이다. 서버 재시작을 넘는 영구 중복 방지는 n8n/DB의 기존 정책에서 확인해야 한다.
- 상담 전문은 최종 messages의 순서·내용을 유지한 projection이다. KCM이 목적·요약을 생성하거나 Supabase에 직접 INSERT하지 않는다.
- `sent`는 n8n HTTP 수신 응답 확인이다. consultations/risks의 실제 저장 성공을 뜻하지 않는다.

## 실행·확인 경로

프로젝트 폴더에서 터미널을 각각 열어 실행한다.

```powershell
npm.cmd run dev
npm.cmd run server
```

- 고객: `http://127.0.0.1:5173/#/retell-test`
- 직원: `http://127.0.0.1:5173/#/home`
- 고객별 현재 서버 이력: `http://127.0.0.1:5173/#/customers`
- 상담지원: `http://127.0.0.1:5173/#/support`에서 C-003 상세 → 상담 시작 → 결과·후속 메모 입력 → 완료. 기존 관리자 지원 요청·처리도 같은 화면에서 시연한다.
- 상담 후 고객 사후관리: `http://127.0.0.1:5173/#/marketing`에서 완료된 C-003의 메시지 확인 → 확인 완료 → 발송 처리(데모). 미동의/미확인·결과 없는 기록은 발송 불가이며, 발송 기록은 새로고침 시 초기화된다.
- 자동 검증: `npm.cmd run check`
- 독립 HTML 갱신: `npm.cmd run preview:standalone`

필수 설정은 `.env.example`을 참고해 로컬 또는 Render에 직접 입력한다: `RETELL_API_KEY`, `RETELL_AGENT_ID`, `N8N_WEBHOOK_URL`, `KCM_DEMO_CUSTOMER_ID`, `KCM_DEMO_STORE_ID`.
실제 값은 문서·Git에 넣지 않는다. 고객 반복 테스트는 사용자가 지정한 기존 테스트 고객 ID를 Render 설정에 입력한다.

## Freeze 전 사람의 최종 확인

1. RC diff를 검토하고 main 반영 여부를 결정한다. 승인한 커밋이 Render에 배포됐는지 확인한다.
2. Render 환경변수의 키·Agent·Webhook·테스트 고객·매장 설정을 확인한다. n8n Production workflow를 Publish/활성화한다.
3. 고객 화면에서 마이크 권한을 허용하고 테스트 정보의 보조 마이크가 정상인지 확인한다. 첫 권한 승인 지연/중단으로 일부 구간이 미측정이면 점수는 안전하게 보류될 수 있다. 고객 탭을 전면에 두고 통화한다.
4. 같은 테스트 고객으로 실제 음성 통화 3회를 순차 진행한다. 각 통화의 새로운 call/consultation ID, 동일 customer/store ID, SSE 고객·AI 전문과 5개 신호를 확인한다.
5. 통화 종료 후 최종 음성 snapshot·위험도 확정·n8n 수신 상태를 확인한다. 두 번째 통화가 이전 위험도를 합산하지 않는지 확인한다.
6. n8n Executions의 `$json.body`에서 기존 signals/scores/risk와 consultation의 시각·전문을 확인한다. 같은 call ID에 중복 실행이 없는지 확인한다.
7. n8n 담당자가 transcript → `ai_transcription`, 요약 생성 → `ai_summary` 및 consultations/risks 관계를 확인한다. 실제 DB 저장과 요약 연결은 이번 로컬 검증에서 확인하지 않았다.
8. Supabase에서 동일 고객의 서로 다른 상담·위험 기록 3건을 조회해 중복/덮어쓰기 여부를 확인한다. 스키마·운영 데이터를 임의 변경하지 않는다.
9. 스마트 재고 팀원 코드를 별도 검토·병합한 뒤 해당 화면과 전체 check를 확인한다. 이번 RC는 재고 route/interface/기능을 변경하지 않는다.
10. 녹화 전 홈·고객 화면·실시간 패널을 최종 확인한다. 브라우저 새로고침은 직원 샘플 상태를 초기화하고, 서버 재시작은 실시간 메모리 이력을 초기화한다. 외부 저장 데이터는 별개이다.

## 검증 기록

실행 결과와 미검증 구분은 `STATUS.md`의 2026-10-05 RC 항목을 따른다. 자동·격리된 모의 브라우저 검증은 실제 Retell 음성 및 Production n8n/DB 저장 성공을 대체하지 않는다.

상담지원·마케팅 보강은 최초 RC 커밋 7ab6027 이후 별도 RC 변경이다. 전체 테스트는 기존 333개 + 사후관리 12개 = 345개 통과, 프런트/백엔드 타입 검사와 build 성공. 격리 브라우저에서 두 메뉴·지원/상담 완료/메시지 확인·발송·예약 완료 수정·1366px/390px·독립 HTML을 확인했다. 핵심 통화/위험/n8n/DB 코드는 변경하지 않는다. 자세한 변경 파일과 가정은 최신 STATUS 항목을 따른다.

## main 대비 변경 파일

이전 완료 UI 11개 파일을 모두 포함한다. 아래 첫 행의 `App.tsx` 안내 문구와 STATUS/미리보기만 이번 RC 작업을 추가 반영했고, 나머지 이전 UI 원본 8개 파일은 시작 시점의 SHA256과 동일하다.

| 범위 | 파일 |
| --- | --- |
| 이전 UI 보존 | `src/App.tsx`, `src/EntryRouter.tsx`, `src/components/CallOverview.tsx`, `src/dev/RetellTestPage.tsx`, `src/dev/retell-test.css`, `src/styles.css`, `src/lib/callPagination.ts`, `tests/domain.test.ts`, `tests/callPagination.test.ts`, `00_KCM_미리보기.html`, `STATUS.md` |
| RC 표시·고객 이력 | `src/live/livePresentation.ts`, `src/live/LiveConsultations.tsx`, `src/live/LiveRiskSignals.tsx`, `src/live/live-calls.css`, `src/components/Layout.tsx` |
| 부가 메뉴 정돈 | `src/pages/SecondaryPages.tsx`, `src/pages/ProductsPage.tsx`, `src/pages/StoreManagementPage.tsx` |
| SDK 종료 가드·회귀 검사 | `src/dev/retellCall.ts`, `tests/retell.test.ts`, `tests/liveCalls.test.ts`, `tests/livePresentation.test.ts`, `server/tests/rc-flow.test.mjs` |
| Freeze 인수 안내 | `docs/RELEASE_CANDIDATE.md` |
