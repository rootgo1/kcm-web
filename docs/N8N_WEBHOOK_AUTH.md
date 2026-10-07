# 앱 최종 통화 결과 웹훅 인증

2026-10-07 — `fix/webhook-jwt-demo-name`

## 확인한 문제와 변경

기존 Header Auth의 재사용 가능한 Bearer 인증값이 n8n 실행 1791의 Start 출력 `headers.authorization`에 가려지지 않은 채 표시되는 것을 확인했습니다. 실제 값은 출력·복사·캡처·파일·Git에 남기지 않았습니다. 운영 버전은 n8n **2.43.0**이며 Production/Manual Redaction은 `Default - Do not redact`로 비활성화되어 있습니다.

설치 버전 공식 소스도 확인했습니다. Webhook은 원본 `req.headers`를 출력합니다. `recordConsumedAuth`는 인증 헤더 이름을 기록하며 원본 헤더를 제거하지 않습니다. 실행의 부분 필드 마스킹 전략은 이 버전에서 연결되지 않았습니다. 후속 Code 노드의 헤더 삭제로 앞선 Start의 저장 출력을 없앨 수 있다고 보장하지 않습니다.

앱은 **요청마다 생성하는 60초 HS256 JWT**로 전환합니다. 서명키는 앱 서버 환경변수와 n8n Credential에만 저장하고 요청에는 보내지 않습니다. JWT에는 `iat`, `exp`, 무작위 `jti`만 있으며 고객·상담·통화 식별자나 내용을 넣지 않습니다. 기존 JSON 본문·점수·시각·통화당 한 번 시도·재시도 없음 정책은 유지합니다.

코드 준비와 실제 운영 적용은 구분합니다. 새 Credential/환경값의 사용자 입력, n8n 발행, 앱 배포와 새 통화 검증까지 완료해야 운영 적용을 확인한 것으로 판단합니다. 적용 결과는 STATUS.md에 기록합니다. 기존 기록은 삭제하지 않습니다.

## 설정

| 위치 | 설정 | 값의 형식 |
| --- | --- | --- |
| Render Environment | `N8N_WEBHOOK_JWT_SECRET` | 새 무작위 서명키 원문, 영문·숫자·`_`·`-` 64~256자 |
| n8n JWT Auth Credential | Key Type | `Passphrase` |
| n8n JWT Auth Credential | Secret | Render와 동일한 서명키 원문 |
| n8n JWT Auth Credential | Algorithm | `HS256` |
| 앱 결과 저장용 Start Webhook | Authentication | `JWT Auth`와 위 Credential |

**새 키를 사용합니다.** 기존 기록에 노출된 `N8N_WEBHOOK_AUTH_TOKEN`을 서명키로 재사용하지 않습니다. 키에는 공백·줄바꿈·따옴표·`Bearer ` 접두어를 붙이지 않습니다. 앱은 공백을 보정하지 않으며 원문 64~256자 전체 일치가 아니면 외부 요청 없이 실패합니다. 이전 환경변수로 자동 우회하지 않습니다.

실제 키는 대화·소스·문서·Git·브라우저 저장소·`VITE_*`에 넣지 않습니다. 새 인증값의 UI 입력·확인·저장은 브라우저 작업 정책에 따라 사용자가 직접 수행합니다.

## 적용 순서

1. 사용자/관리자가 새 n8n JWT Credential에 위 설정과 새 키를 직접 입력·저장합니다. 기존 운영 Header Auth Credential을 덮어쓰지 않습니다.
2. 같은 새 키를 Render의 `N8N_WEBHOOK_JWT_SECRET`에 직접 입력하고 **Save only**로 저장합니다. 이 단계에서는 재배포하지 않습니다.
3. 진행 중·연결 중 통화, 최종 음성 대기와 전송 pending이 모두 0인지 확인하고 전환 완료까지 새 통화를 중단합니다.
4. 최신 발행본과 공유 draft를 비교합니다. 인증 외 미발행 팀원 변경이 있으면 내용을 검토하고 함께 발행할 범위가 승인되었는지 확인합니다. 팀원 노드를 임의 삭제·복구하지 않습니다.
5. 앱 저장용 Start만 `JWT Auth`와 새 Credential로 연결해 발행합니다. 다른 송신자 Webhook과 기존 응답·저장·요약 흐름은 유지합니다.
6. 검증된 앱 버전을 배포하고 Live, `/health`, 직원 조회 로그인 상태와 로그인 전 고객 자료 차단을 확인합니다. 구버전 앱과 새 인증이 다른 전환 구간에는 요청이 거부되므로 통화를 시작하지 않습니다.
7. 인증 없는 요청과 잘못된 JWT의 빈 JSON `{}`이 인증 단계에서 거부되는지 확인합니다. 실제 고객·상담 본문이나 키를 넣지 않고 응답 본문을 읽지 않습니다. HTTP 400 입력 검증을 인증 거부로 판단하지 않습니다.
8. 사용자가 새 짧은 통화를 진행합니다. 앱 최종화·전송, n8n 원자 저장과 HTTP 200/요약 대기 응답, 후속 요약 업데이트와 실제 DB 1건 저장을 각각 확인합니다.
9. 새 Start 출력에 재사용 서명키 대신 짧은 JWT만 있는지 비공개로 확인하고 만료된 JWT 거부를 검증합니다. 토큰 자체를 출력·복사·파일·캡처에 남기지 않습니다.

## 보호 범위와 기존 기록

서명키는 요청·JSON 본문·SSE·전송 상태·로그에 포함하지 않습니다. 응답/예외 원문도 기록하지 않습니다. 누락은 `N8N_WEBHOOK_AUTH_MISSING`, 형식 오류는 `N8N_WEBHOOK_AUTH_INVALID`로 기존 실패 계약을 유지합니다. 인증 없는 전송으로 우회하지 않습니다.

**JWT는 기록에 남을 수 있습니다.** 60초 뒤 만료되므로 오래된 기록으로 계속 인증할 수 없지만 만료 전에는 재사용할 수 있습니다. n8n 2.43.0 기본 검증은 서명 알고리즘과 `exp`를 검사하며 `jti` 중복을 저장/거부하지 않습니다. 완전한 1회 사용 인증이라고 표현하지 않습니다. 유효기간은 전체 요약 실행 시간이 아닌 Start 도착 때의 인증 유효기간입니다.

전환 뒤 기존 Header Auth는 Start에서 사용하지 않으므로 **이전 기록의 비밀번호를 현재 JWT 인증에 사용할 수 없습니다.** 실행 접근·보관 정책은 별도로 관리합니다. 기존 기록 영구 삭제는 별도 확인이 필요하며 이번 변경에는 포함하지 않습니다. Enterprise Redaction의 표시/API 마스킹은 원본 저장 삭제와 다릅니다.

## 기존 운영 검증

이전 Header Auth 코드 `6f1be81`은 978/978 검사·타입 검사·production build를 통과했습니다. 최초 13:54 통화는 HTTP403/DB0건이었고, 사용자 인증값 재입력 후 14:16:11 Live 배포를 확인했습니다. 14:18~14:19 새 통화는 앱 finalized/sent, 중복 없는 DB 상담1건과 목적·요약·전문·위험분석 저장을 확인했습니다. [실행1791](https://rootgo.app.n8n.cloud/workflow/GvZZqJGAAH9EpHuY/executions/1791)의 저장·요약7개 노드 성공도 DB와 일치했습니다.

당시 승인된 팀원 문자 연결도 함께 발행했습니다. 실제 SOLAPI 수신은 별도 미검증이며 JWT 변경을 위해 문자를 전송하지 않습니다. 과거 실패 통화도 재전송하지 않습니다.

## 공식 근거

- [n8n JWT Webhook 인증 설정](https://docs.n8n.io/integrations/builtin/credentials/webhook/#using-jwt-auth): Passphrase/Secret/Algorithm.
- [n8n 2.43.0 Webhook 인증 구현](https://github.com/n8n-io/n8n/blob/n8n@2.43.0/packages/nodes-base/nodes/Webhook/utils.ts): 지정 알고리즘 `jwt.verify`.
- [n8n 2.43.0 Webhook 출력](https://github.com/n8n-io/n8n/blob/n8n@2.43.0/packages/nodes-base/nodes/Webhook/Webhook.node.ts#L324): 원본 headers 포함.
- [n8n 2.43.0 Redaction 구현](https://github.com/n8n-io/n8n/blob/n8n@2.43.0/packages/cli/src/modules/redaction/executions/execution-redaction.service.ts#L265): 부분 마스킹 미연결.
