# Render 팀 테스트 배포

기존 KCM 화면과 Node 백엔드를 **무료 Web Service 한 개**에서 실행합니다. `npm run build`로 만든 `dist/`를 같은 Node 서버가 제공하므로 직원 화면, 고객 테스트, Retell 프록시와 SSE가 하나의 HTTPS 주소를 사용합니다. 기존 위험도·고성 기준·업무 로직과 메모리 보관 정책은 변경하지 않습니다.

## 저장소와 서비스 생성

1. 이 프로젝트 폴더(`KCM_web_starter_v0.3`)의 내용을 GitHub **비공개 저장소의 루트**에 올립니다. `package.json`, `src/`, `server/`, `render.yaml`이 저장소 루트에 있어야 합니다. 실제 `.env`, 로그, 로컬 통화 캡처, `node_modules/`, `dist/`, `.test-dist/`는 업로드하지 않습니다.
2. Render에서 해당 저장소만 연결하고 Blueprint로 루트 `render.yaml`을 적용합니다. 현재 서비스명 `kcm`, Node, Singapore, **Free**, 인스턴스 한 개입니다. 생성 화면에서 무료 요금제를 다시 확인합니다.
3. Retell API Key는 사용자가 Render 환경변수에 직접 입력합니다. 채팅이나 GitHub 파일에 넣지 않습니다.
4. 빌드 성공과 서비스 Live 상태를 확인한 후 Render가 표시하는 실제 HTTPS 주소를 사용합니다. 자동 배포는 꺼 두었으며 다음 변경은 필요할 때 수동 배포합니다.

| 항목 | 설정 |
| --- | --- |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| NODE_VERSION | `22.23.3` |
| NODE_ENV | `production` |
| RETELL_AGENT_ID | `agent_0cf2b1f09a8e52e6d2abc45b71` |
| RETELL_API_KEY | 사용자가 직접 입력하는 실제 Retell 키 |
| N8N_WEBHOOK_URL | 사용자가 Environment에 직접 입력하는 HTTPS Production Webhook URL |
| KCM_DEMO_CUSTOMER_ID | 사용자가 Environment에 직접 입력하는 E2E 테스트 고객 ID |
| KCM_DEMO_STORE_ID | 사용자가 Environment에 직접 입력하는 E2E 테스트 매장 ID |
| SUPABASE_AUTH_PUBLISHABLE_KEY | 관리자 승인을 받은 같은 Supabase 프로젝트의 Auth 공개 키, 실제 값은 문서/Git에 기록하지 않음 |
| STAFF_READ_ACCOUNTS_JSON | 관리자 승인을 받은 계정·매장 조회 매핑, 실제 계정 식별정보는 문서/Git에 기록하지 않음 |

Webhook/고객/매장 변수는 `sync: false`이며 실제 값은 Git에 포함하지 않습니다. 기존 서비스에서는 **Environment**에서 직접 추가한 뒤 **Manual Deploy → Deploy latest commit**으로 main의 최신 코드를 적용합니다. 자동 배포 설정은 변경하지 않습니다. 전송 조건·계약·실패 처리·실제 검증 절차는 [n8n 전송 안내](N8N_DELIVERY.md)를 확인하세요.

`PORT`와 `RENDER_EXTERNAL_URL`은 Render 자동 설정을 사용합니다. 별도 도메인을 사용하는 경우에만 `KCM_PUBLIC_ORIGIN`에 경로 없는 HTTPS 원본 주소를 설정합니다. 비밀 값·HTTPS 주소·빌드 화면이 누락되면 공개 서버를 실행하지 않습니다.

## 화면과 통화 확인

- 직원: https://kcm-team-test.onrender.com/#/home
- 고객: https://kcm-team-test.onrender.com/#/retell-test
- 화면·정적 파일·기존 공개 API·SSE의 접근 범위는 유지합니다. 저장 고객 목록·고객별 상담 요약 조회는 승인된 조회 계정 로그인이 필요하며, 다른 개인자료 경로의 기존 공개 제한은 유지합니다. HTTPS·Host/Origin 검사·CORS와 서버의 Retell 인증은 유지합니다. `/health`는 비밀 정보 없는 상태 확인 응답을 제공합니다. 별도 n8n 인증은 구현하지 않습니다.
- 고객 화면에서 보조 마이크 시작 → 정상 확인 → 통화 시작 → 실제 발화 → 종료합니다. 직원 화면에서 실시간 대화·다섯 신호·최종 결과를 확인합니다. 고객 화면을 전경에 유지해야 보조 마이크 측정 공백을 피할 수 있습니다.
- 공유한 링크의 바로 접속, 두 번째 통화, 서로 다른 브라우저/기기의 직원·고객 흐름도 확인합니다. 실제 Retell 통화는 기존 Retell 이용 요금이 적용되며 무료 Render 호스팅과 별개입니다.

## 저장 고객 조회 로그인 운영 적용 / 2026-10-07

- 사용자 승인 후 Auth 공개 키와 승인된 조회 계정 매핑을 위한 환경값 두 개를 저장했습니다. 기존 환경값과 DB 스키마/RLS/테이블 권한은 변경하지 않았습니다.
- 검증 버전 `f39a438`, Render 배포 `dep-db2s8dgm7kps73c4jea0`의 **Live** 상태를 확인했습니다. 이후 문서의 적용 상태 갱신은 실행 코드 변경을 포함하지 않습니다.
- 운영 `/health` HTTP 200, `/api/staff-read/session` HTTP 200(`required/configured: true`, `authenticated: false`, `STAFF_LOGIN_REQUIRED`), 로그인 전 `/api/data/customers` HTTP 401 `STAFF_LOGIN_REQUIRED` 및 `Cache-Control: no-store`를 확인했습니다.
- 사용자 직접 로그인 후 운영 화면에서 조회 전용 계정 표시, 실제 저장 고객 20명(5행·4페이지), 당일 테스트 상담의 저장 상세·요약 및 AI 응대 정상 0점 표시를 확인했습니다. **실제 로그인→저장 고객 목록→해당 상담 요약 표시 확인을 완료했습니다.** 비밀번호·토큰·원문을 읽지 않았으며 실제 계정·고객·상담·통화 식별번호와 상세 고객 내용은 문서에 기록하지 않습니다.

계정·매장 검증 범위와 후속 확인 절차는 [저장 고객 조회 로그인 안내](STAFF_CUSTOMER_READ.md)를 참조하세요. 실제 이메일·UUID·키·비밀번호는 배포 문서에 기록하지 않습니다.

## 보관과 제한

- 무료 Render는 일정 시간 접속이 없으면 중지되며 다음 접속 시 시작 대기가 생길 수 있습니다. 재시작·재배포·무료 서비스 중지 후 재가동 시 서버 메모리의 실시간 통화 기록은 사라집니다. 데모 데이터와 기존 예약 데이터의 저장 규칙은 그대로입니다.
- 실시간 통화는 단일 서버 메모리에만 있으므로 인스턴스 증가나 다중 서버 분산을 구성하지 않습니다. 중요한 실제 고객 자료를 보관하는 서비스로 사용하지 않습니다.
- API Key는 서버의 Retell 요청에만 사용됩니다. API Key와 Retell access_token을 로그에 남기지 않습니다. 소스·`.env`는 웹으로 제공하지 않습니다.
- 이번 배포의 Live 및 저장 고객 조회 확인 결과는 위 운영 적용 기록과 같습니다. HTTPS 마이크 권한, Render를 통한 Monitor·SSE·최종 고성 수신의 새 배포 회귀 확인은 별도 검증 대상입니다. 자동 테스트나 고객 자료 조회 성공만으로 실제 통화 성공을 의미하지 않습니다.

## 기존 로컬 실행

`NODE_ENV=production`과 Render 전용 환경변수를 로컬 `.env`에 추가할 필요가 없습니다. 기존 `npm.cmd run dev`(5173), `npm.cmd run server`(8787)를 별도 터미널에서 실행합니다. `npm.cmd run check`와 `npm.cmd run preview:standalone`도 유지합니다.

공식 참고: [Render Blueprint](https://render.com/docs/blueprint-spec), [환경변수](https://render.com/docs/environment-variables), [무료 서비스 제한](https://render.com/docs/free).
