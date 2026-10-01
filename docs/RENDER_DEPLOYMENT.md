# Render 팀 테스트 배포

기존 KCM 화면과 Node 백엔드를 **무료 Web Service 한 개**에서 실행합니다. `npm run build`로 만든 `dist/`를 같은 Node 서버가 제공하므로 직원 화면, 고객 테스트, Retell 프록시와 SSE가 하나의 HTTPS 주소를 사용합니다. 기존 위험도·고성 기준·업무 로직과 메모리 보관 정책은 변경하지 않습니다.

## 저장소와 서비스 생성

1. 이 프로젝트 폴더(`KCM_web_starter_v0.3`)의 내용을 GitHub **비공개 저장소의 루트**에 올립니다. `package.json`, `src/`, `server/`, `render.yaml`이 저장소 루트에 있어야 합니다. 실제 `.env`, 로그, 로컬 통화 캡처, `node_modules/`, `dist/`, `.test-dist/`는 업로드하지 않습니다.
2. Render에서 해당 저장소만 연결하고 Blueprint로 루트 `render.yaml`을 적용합니다. 서비스명 `kcm-team-test`, Node, Singapore, **Free**, 인스턴스 한 개입니다. 생성 화면에서 무료 요금제를 다시 확인합니다.
3. 아래 비밀 값 두 개는 사용자가 Render 환경변수에 직접 입력합니다. 채팅이나 GitHub 파일에 넣지 않습니다.
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
| KCM_ACCESS_USER | `kcm` |
| KCM_ACCESS_PASSWORD | 사용자가 정한 고유한 16자 이상 팀 테스트 비밀번호 |

`PORT`와 `RENDER_EXTERNAL_URL`은 Render 자동 설정을 사용합니다. 별도 도메인을 사용하는 경우에만 `KCM_PUBLIC_ORIGIN`에 경로 없는 HTTPS 원본 주소를 설정합니다. 비밀 값·HTTPS 주소·빌드 화면이 누락되면 공개 서버를 실행하지 않습니다.

## 화면과 통화 확인

- 직원: `<Render HTTPS 주소>/#/home`
- 고객: `<Render HTTPS 주소>/#/retell-test`
- 브라우저 인증창에는 `kcm`과 사용자가 설정한 팀 비밀번호를 입력합니다. UI·Retell API·SSE 모두 같은 인증을 요구하며 `/health`만 비밀 정보 없는 상태 확인 응답을 제공합니다. 이 방식은 팀 테스트용 공용 접근 제한이며 개인별 로그인·권한 관리가 아닙니다.
- 고객 화면에서 보조 마이크 시작 → 정상 확인 → 통화 시작 → 실제 발화 → 종료합니다. 직원 화면에서 실시간 대화·다섯 신호·최종 결과를 확인합니다. 고객 화면을 전경에 유지해야 보조 마이크 측정 공백을 피할 수 있습니다.
- 공유한 링크로 접속, 잘못된 비밀번호 차단, 두 번째 통화, 서로 다른 브라우저/기기의 직원·고객 흐름도 확인합니다. 실제 Retell 통화는 기존 Retell 이용 요금이 적용되며 무료 Render 호스팅과 별개입니다.

## 보관과 제한

- 무료 Render는 일정 시간 접속이 없으면 중지되며 다음 접속 시 시작 대기가 생길 수 있습니다. 재시작·재배포·무료 서비스 중지 후 재가동 시 서버 메모리의 실시간 통화 기록은 사라집니다. 데모 데이터와 기존 예약 데이터의 저장 규칙은 그대로입니다.
- 실시간 통화는 단일 서버 메모리에만 있으므로 인스턴스 증가나 다중 서버 분산을 구성하지 않습니다. 중요한 실제 고객 자료를 보관하는 서비스로 사용하지 않습니다.
- API Key는 서버의 Retell 요청에만 사용됩니다. 팀 인증 정보와 Retell access_token을 로그에 남기지 않습니다. 소스·`.env`는 웹으로 제공하지 않습니다.
- 실제 배포 성공, HTTPS 마이크 권한, Render를 통한 Monitor·SSE·최종 고성 수신은 배포 후 별도 검증 대상입니다. 자동 테스트 통과만으로 실제 통화 성공을 의미하지 않습니다.

## 기존 로컬 실행

`NODE_ENV=production`과 Render 전용 환경변수를 로컬 `.env`에 추가할 필요가 없습니다. 기존 `npm.cmd run dev`(5173), `npm.cmd run server`(8787)를 별도 터미널에서 실행합니다. `npm.cmd run check`와 `npm.cmd run preview:standalone`도 유지합니다.

공식 참고: [Render Blueprint](https://render.com/docs/blueprint-spec), [환경변수](https://render.com/docs/environment-variables), [무료 서비스 제한](https://render.com/docs/free).
