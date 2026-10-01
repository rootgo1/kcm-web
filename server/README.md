# KCM Retell Web Call·직원용 실시간 대화

## Render 배포 모드

`NODE_ENV=production` 또는 Render 실행 환경에서는 `dist/` 화면과 기존 API/SSE를 한 서버에서 제공합니다. HTTPS 주소와 팀 공용 인증을 요구하고 Render의 `PORT`로 `0.0.0.0`에 바인딩합니다. 실행은 `npm start`이며 설정·무료 요금제·사용자가 입력할 비밀 값은 [Render 안내](../docs/RENDER_DEPLOYMENT.md)에 정리했습니다. 로컬 두 서버 실행 방식은 그대로입니다.

## 현재 정책: 5개 신호와 통화별 독립 위험도

- 기존 Web Call → Monitor → KCM 메모리 → SSE → 직원 패널을 유지합니다. 텍스트는 USER만 분석하며 turn_id 정정·삭제·역할 변경은 교체 후 합산합니다. local-text-rules-v2의 욕설/위협/비난/선정 네 항목을 사용하고 불편감 항목은 제거했습니다.
- 비난은 직접적인 업무 능력·응대 방식의 책망 문구, 선정은 명시적인 성적 제안/신체 대상 요구/음란 요구를 보수적으로 탐지합니다. 단일 성 관련 단어·일반 불만·재설명 요청·기본 인용/부정은 탐지하지 않습니다. 은어·문맥·STT 오인식에서 오탐/미탐이 가능하며 검증된 모델이 아닙니다.
- 고성은 고객 테스트 페이지의 **독립 보조 마이크**로 측정합니다. src/dev/shouting.ts의 임시 기준: RMS **0.12 이상 350ms**, 해제는 **0.08 이하 300ms**. 큰 소리가 이어져도 구간당 한 번만 세며 400ms를 넘는 샘플 공백은 연속 측정으로 추정하지 않습니다. 디바이스·거리·소음에 민감하며 dB 기준이나 음성 의미 분석이 아닙니다.
- POST /api/live-calls/:call_id/audio-signals에 {sequence, shouting_count, is_shouting, available, coverage_complete, closed}만 보냅니다. 원본 음성과 RMS 샘플은 전송/저장하지 않습니다. localhost Origin·JSON 크기·통화 존재·필드·정수·단조 sequence/count를 검사하며 중복/지연 순서 수신은 누적하지 않습니다. 이는 인증된 실서비스 계측 체계가 아닌 로컬 개발용입니다.
- 직원 패널 순서: **욕설 / 위협 발언 / 비난 표현 / 선정적 표현 / 고성**. 고성은 말풍선에 억지로 연결하지 않습니다. 통화 중 수치 점수는 없고 명확한 위협만 ‘매우 위험 / 5단계’ 대응 경고를 표시합니다.
- 공통 정책은 src/lib/riskPolicy.js 한 곳에서 프런트 데모와 Node가 함께 사용합니다. 점수표는 욕설 최대 15, 위협 최대 40, 비난 최대 20, 선정 최대 15, 고성 최대 10점. 위협 2회는 합계 최소 40점, 3회 이상은 최소 60점으로 보정한 뒤 최종 99점 상한을 적용합니다. 등급은 0/20/40/60/80 경계의 정상·주의·경계·위험·매우 위험입니다.
- **모든 통화는 0점부터 독립 계산**합니다. 이전 고객 점수를 입력으로 받지 않고 감점도 하지 않습니다. 통화별 확정 기록을 덮어쓰지 않습니다. 데모 고객의 ‘최근 통화 위험도’는 완료 시각이 가장 늦은 통화의 확정값이며, 진행 중 값/평균으로 대체하지 않습니다. 최근 완료 통화가 미확정이면 대기로 표시합니다.
- Monitor의 실제 종료와 브라우저의 최종 고성 snapshot을 모두 확인하면 final_result를 한 번 생성합니다. 어느 것이 먼저 도착해도 됩니다. call_ended 또는 risk_finalized SSE로 전달하며 종료 시각은 최초 값을 보존합니다. 반복 종료/최종 snapshot/재연결은 기존 확정값을 바꾸지 않습니다.
- 마이크 거부·측정 중지·탭 비활성화에 따른 측정 공백·최종 snapshot 미수신은 누락을 0회로 만들지 않습니다. finalization_reason에 점수 보류 이유를 표시합니다. 전송 실패는 고객 페이지의 ‘전송 재시도’로 최신 snapshot을 재전송할 수 있습니다. 전체 측정을 위해 고객 테스트 페이지를 전경에 유지하고 직원 페이지는 다른 창에서 확인하세요.
- 최종 객체는 {call_id, customer_id, completed_at, signals:{...5 counts}, scores:{...5 scores}, raw_score, adjusted_score, threat_floor, risk_score, risk_level, rule_version}입니다. **n8n POST/DB 저장은 없습니다.** 현재 실행 중 메모리에서만 유지하고 서버 재시작 시 사라집니다.
- 실제 Retell 통화는 고객 ID 연동이 없으므로 customer_id: null입니다. 이름으로 고객을 합치거나 데모 고객 ID를 붙이지 않습니다. 서버의 고객별 이력 조회 구조는 ID가 주어진 테스트에서 검증하며, 실제 식별 연동은 후속 범위입니다. 기존 방문 예약 저장 데이터는 수정하지 않습니다.
- 적용: 통화가 없을 때 백엔드를 재시작합니다. 고객 #/retell-test → 보조 마이크 정상 확인 → 통화 시작 → 발화/고성 구간 확인 → 종료. 직원 #/home의 ‘실시간 상담 보기’에서 5개 신호와 종료 결과를 확인합니다. 직원용 기존 데모 통화는 별도 상태를 유지합니다.

## 2단계: 직원용 SSE 대화 표시

1단계 Web Call/Monitor의 실제 성공은 사용자가 확인했습니다. 이번 직원 화면 연동은 같은 Monitor를 재사용합니다. 고객 테스트 화면과 기존 KCM 데모 통화/위험 점수/집계는 서로 데이터를 합치지 않습니다.

- 고객: `http://127.0.0.1:5173/#/retell-test`에서 통화합니다.
- 직원: 별도 탭의 `http://127.0.0.1:5173/#/home`에서 **실시간 AI 상담 → 실시간 상담 보기**를 엽니다. 통화가 없으면 빈 패널을 표시하지 않습니다. 종료 후 마지막 대화는 서버 실행 중에 유지됩니다.
- 서버 변경 후 기존 `npm.cmd run server`를 Ctrl+C로 종료한 다음 다시 실행해야 합니다. Vite는 코드 변경을 자동 반영합니다. 연결 안내가 계속 표시되면 홈의 ‘다시 연결’을 누르거나 직원 탭을 새로고침합니다.
- `GET /api/live-calls/events`는 `text/event-stream`이며 Vite가 동일 경로를 Node로 전달합니다. API Key·access_token은 이 스트림에 포함하지 않습니다.
- 새 접속/재접속: `event: snapshot`, `data: {"type":"snapshot","calls":[...]}`. 서버 전체 상태를 즉시 보내므로 새로고침·다른 메뉴에서 홈 복귀도 복구됩니다. 서버 재시작 후 빈 snapshot이면 이전 통화 목록을 비웁니다.
- 변경 이벤트: `call_status`, `call_started`, `transcript`, `call_ended`, `call_error`, `audio_signal`, `risk_finalized`. payload는 `{type, call_id, status, started_at, ended_at, updated_at, messages, error}`이며 해당 통화의 현재 전체 상태입니다. transcript 이벤트마다 정규화된 전체 messages를 전달합니다.
- messages: `{turn_id, role, content, start_sec, end_sec}`. user/agent만 포함합니다. Retell 안정 ID를 사용하고, ID 없는 입력은 원본 snapshot 위치+role로 임시 ID를 구성합니다(이 경우 과거 목록 중간 삽입/재정렬까지 식별할 수 있다는 보장은 하지 않습니다). Monitor에는 발화 시작 시간만 있어 `end_sec`는 null입니다.
- SDK의 `onTranscript`는 raw WebSocket 부분 이벤트를 이미 ID별 병합한 전체 목록입니다. 이 전체 목록을 서버가 통화별로 **교체**하고, React도 messages를 교체하며 `turn_id`를 말풍선 key로 사용합니다. 짧아진 정정도 그대로 반영합니다. 원본 도구/node/DTMF 처리는 SDK에 남기고 채팅으로만 보내지 않습니다.
- SSE heartbeat는 15초 comment, 재연결 간격은 2초입니다. 클라이언트 종료/오류 시 subscriber·타이머를 해제합니다. 큰 snapshot은 전송 버퍼가 비워지기를 기다리고 그동안의 갱신은 최신 전체 snapshot 하나로 합칩니다. 30초 동안 전송이 진행되지 않는 연결만 닫습니다. EventSource의 자동 재연결을 사용하며 오류 때 별도 listener를 누적하지 않습니다. HTTP 404/503처럼 브라우저가 자동 재시도하지 않는 경우는 ‘다시 연결’ 버튼으로 복구합니다.
- `call_ended`는 마지막 대화를 보존하고 반복 종료는 무시합니다. Monitor 오류/로컬 해제는 실제 통화 종료 증거가 아니므로 error로 구분합니다. 서버가 시작된 뒤 생성한 통화만 추적하며 이전 서버 프로세스의 통화나 Retell 계정의 다른 통화를 임의로 가져오지 않습니다.
- 메모리 보관만 사용합니다. 콘솔의 ‘이어짐/정정’은 1단계 진단 출력이며 직원 화면은 이 로그를 파싱하지 않습니다. 직원 패널에는 위험 분석·상담 시작·지원·takeover를 연결하지 않습니다.

구현: `live-calls.mjs`(정규화/통화 상태), `live-events.mjs`(SSE), `src/live/`(직원 UI/구독). 표준 참고: [Retell Monitor](https://docs.retellai.com/api-references/monitor-call-websocket), [SSE 형식·재연결](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

2단계 검증: **190개 테스트·프런트/백엔드 타입 검사·빌드 통과**. Chrome의 격리된 모의 SSE로 정정·종료·재연결·메뉴 이동·새로고침·스크롤 및 1366×768/390px 배치를 확인했습니다. 실제 Retell 음성 → 직원 말풍선은 사용자 참여 통화를 이번에 진행하지 못해 **미검증**입니다. 실제 백엔드 재시작 후 SSE 200/빈 snapshot과 Vite 프록시 연결까지 확인했습니다.

아래는 1단계 실행 안내와 당시 검증 기록입니다. 최신 결과는 루트 `STATUS.md`를 확인하세요.

직원용 KCM과 별도로 `#/retell-test`에서 실제 마이크 통화를 시험합니다. 직원용 통화 샘플·상담 기록·위험 점수·저장 방식은 연결하지 않습니다. 별도 탭에서 테스트하세요.

## 실행

프로젝트 폴더는 `C:\Users\rmsgh\Documents\ChatGPT\kcm-web\KCM_web_starter_v0.3`입니다. Node.js 22.23.3 / npm 10.9.9에서 확인했습니다. 공식 React/Node 예제의 Node.js 22 이상 조건과 기존 KCM의 22.12 이상 조건을 충족하며 Node 설치는 변경하지 않았습니다.

1. 프로젝트 루트의 `.env.example`을 참고하여 **사용자가 직접 `.env`를 작성**합니다. 기존 `.env`가 있다면 덮어쓰지 말고 필요한 항목만 설정합니다.

   ```dotenv
   RETELL_API_KEY=여기에_본인의_Retell_API_Key_입력
   RETELL_AGENT_ID=agent_0cf2b1f09a8e52e6d2abc45b71
   PORT=8787
   ```

   API Key는 채팅·소스·`VITE_*` 변수에 입력하지 않습니다. `.env`는 기존 `.gitignore`에서 제외됩니다. Monitor에는 해당 Agent의 통화에 접근할 수 있는 **Call Edit 권한**이 필요합니다. 환경변수 변경 후 백엔드를 재시작합니다. PORT를 바꾸면 Vite도 재시작합니다.

2. 두 PowerShell 터미널을 같은 프로젝트 폴더에서 실행합니다.

   ```powershell
   # 터미널 1
   npm.cmd run dev
   ```

   ```powershell
   # 터미널 2 — 실제 transcript는 이 터미널에 출력됩니다.
   npm.cmd run server
   ```

3. [통화 테스트](http://127.0.0.1:5173/#/retell-test)를 열어 설정을 확인하고 **통화 시작 → 마이크 허용 → 대화 → 통화 종료**를 실행합니다. 설정 변경 후에는 화면의 ‘설정 다시 확인’을 누르세요. 종료 후 다시 시작하면 새 통화를 생성합니다.

   ```text
   call created: call_...
   monitor connected: call_...
   [call_...] [USER] 요금제 상담을 원합니다.
   [call_...] [AGENT] 상담을 도와드리겠습니다.
   monitor ended: call_...
   ```

   위 로그는 **기대 형식의 예시**이며 실제 통화 성공 기록이 아닙니다. 현재 구현 검증 환경에는 API 키가 없었습니다. 실제 call_id·마이크·음성 연결·실시간 대화·두 번째 실제 통화는 키 설정 후 확인해야 합니다.

## 구조

- `index.mjs`: Node 내장 `.env` 로딩, `127.0.0.1:8787` 서버 시작/종료.
- `app.mjs`: Node 내장 HTTP. Vite `/retell` 프록시 → 허용된 Retell REST 요청만 전달. `GET /retell/config`는 Agent ID와 설정 여부만 반환합니다.
- `retell-client-js-sdk` **3.0.2** 고정. 브라우저의 `RetellClient.createWebCall()` 요청을 `POST /v3/create-web-call`로 전달합니다. 생성 중 취소·마이크 연결 실패 정리를 위한 `POST /v2/stop-call/:callId`는 이 백엔드가 생성한 통화에만 허용합니다.
- API Key 인증은 서버에서만 수행합니다. SDK가 음성을 연결하기 위한 단기 `access_token`은 응답으로 브라우저에 전달되며, 콘솔·파일·브라우저 저장소에 기록하지 않습니다. 음성은 SDK가 Retell에 직접 연결합니다.
- `monitor.mjs`: 서버의 `RetellClient.monitorCall()` → `wss://api.retellai.com/v2/monitor-call/:callId`. SDK가 서버의 WebSocket 인증과 재연결을 처리합니다. 등록 직후 아직 live가 아닌 통화(4004)도 SDK의 제한된 지수형 재시도를 사용합니다. 인증/권한 오류는 반복 재시도하지 않습니다.
- 동일 call_id의 활성 Monitor는 하나입니다. 초기 snapshot과 후속 전체 목록은 발화 ID별로 비교합니다. 같은 목록은 다시 출력하지 않고, 진행 중 문장이 늘어나면 새 부분만 `이어짐`, 내용이 정정되면 같은 ID의 `정정`으로 표시합니다. 발화 확정 이벤트가 없는 프로토콜이므로 이를 새 발화로 무작정 누적하지 않습니다. 이전 통화 문맥·tool·node_transition은 대화 로그에서 제외합니다.
- 종료/오류/서버 종료 시 Monitor는 `disconnect()`로 정리합니다. Monitor의 `end()`·listen·takeover는 호출하지 않습니다. 취소용 통화 ID는 토큰 없이 메모리에 보관하며, 취소 권한은 10분 뒤 만료되고 만료 ID는 매분 정리합니다.
- 브라우저 허용 Origin은 `http://127.0.0.1:5173`, `http://localhost:5173`입니다. 외부 공개·터널은 없습니다.

## 검증과 한계

`npm.cmd run check`는 기존 159개 + 추가 16개 테스트, 프런트/백엔드 타입 검사, Vite 빌드를 실행합니다. 추가 테스트의 Retell 응답·WebSocket·마이크 오류는 **격리된 모의 입력**이며 외부 API를 호출하지 않습니다.

독립 HTML은 직원용 데모만 제공합니다. `npm.cmd run preview:standalone`으로 갱신하지만 Retell 테스트는 위 Vite 주소와 Node 백엔드에서 실행해야 합니다. 실제 키가 없으면 서버는 실행되되 통화 생성은 `503 RETELL_API_KEY_MISSING`으로 거부됩니다.

1단계 당시에는 SSE와 직원 화면 실시간 대화를 구현하지 않았으며 이번 2단계에서 추가했습니다. 위험 분석, DB, n8n, openSMILE, 통화 듣기·takeover는 계속 범위에서 제외합니다.

공식 근거(2026-10-01 확인): [Web Call](https://docs.retellai.com/deploy/web-call), [React/Node 예제](https://github.com/RetellAI/retell-frontend-reactjs-demo), [Monitor WebSocket](https://docs.retellai.com/api-references/monitor-call-websocket). REST 경로와 세션 인터페이스는 설치된 SDK 3.0.2 소스와 함께 확인했습니다.
