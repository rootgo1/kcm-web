# 앱 최종 통화 결과 웹훅 인증

2026-10-07 — `fix/n8n-webhook-auth`

## 현재 상태와 적용 범위

앱 Node 서버가 최종 통화 결과를 보내는 `N8N_WEBHOOK_URL`과 n8n의 앱 저장용 **Start** Webhook에 같은 인증값을 적용하는 절차입니다. 인증 구현 단독 검사는 **978/978**, 재고 조회 보완과 추가 HTTP 회귀 검사를 포함한 통합 검사는 **981/981 테스트 통과**이며 프런트·서버 타입 검사와 production build도 통과했습니다. `npm run preview:standalone`과 `git diff --check`도 통과했습니다.

운영에는 사용자가 직접 저장한 인증 환경값·Header Auth와 앱 인증 버전 `6f1be81`이 적용되었습니다. 다른 작업에서 수행한 새 실제 통화의 저장 요청은 HTTP 403으로 거부되어, **양쪽 인증값의 일치 확인이 남아 있습니다.** 인증을 해제하지 않고 Render에는 접두어 없는 토큰, n8n에는 `Bearer `와 같은 토큰을 저장해야 합니다. 실제 값은 열람·출력하지 않았으며 이번 재고 조회 수정에서 인증 설정은 변경하지 않았습니다. 저장·요약 성공으로 보고하지 않습니다.

```text
앱 Node 서버
  → Authorization: Bearer <서버 인증값>
  → n8n Start: Header Auth 확인
  → KCM Normalize → KCM Payload Check → KCM Atomic Save
  → KCM Save Success ── HTTP 200, summary pending ──→ 앱
          ↓ n8n 실행은 계속 진행
     KCM Call Summary → KCM Summary Check → KCM Update Summary
```

현재 저장 흐름은 **원자 저장 후 먼저 HTTP 200과 요약 대기 상태를 응답**하고, 이어서 요약을 생성·검증·업데이트합니다. `sent`/HTTP 200은 후속 요약 저장 완료를 뜻하지 않습니다. 요약 완료는 `KCM Update Summary`와 실제 저장 결과로 확인합니다.

JSON 본문, 최종화 조건, 상담·통화 ID 연결, 통화당 최대 1회 시도, 재시도 없음과 기존 요약·원자 저장 흐름을 유지합니다. KCM 직원·고객 화면에는 이 인증값을 전달하지 않으며 웹훅 호출은 앱 서버가 수행합니다.

Retell의 `db_query` Webhook, 재고 Webhook, 사전 브리핑 Webhook은 각각 송신자가 다릅니다. 해당 송신자의 인증 헤더 지원과 설정을 확인하기 전에는 이 인증값을 일괄 적용하지 않습니다. 직원 고객 자료 조회 로그인과도 별도 인증입니다.

## 인증값과 설정 위치

| 위치 | 항목 | 저장 형식 |
| --- | --- | --- |
| 앱 서버/Render Environment | `N8N_WEBHOOK_AUTH_TOKEN` | 접두어 없는 원문 토큰 |
| n8n Header Auth Credential | Name | `Authorization` |
| n8n Header Auth Credential | Value | `Bearer ` 다음에 동일한 원문 토큰 |
| 앱 저장용 Start Webhook | Authentication | `Header Auth`와 위 Credential |

서버 토큰의 허용 형식은 `/^[A-Za-z0-9_-]{32,256}$/`이며 **전체 원문**이 일치해야 합니다. 영문 대소문자·숫자·밑줄·하이픈만 허용합니다. 앞뒤 공백·줄바꿈을 자동으로 제거하지 않습니다. 서버 환경값에 `Bearer ` 접두어나 따옴표를 포함하면 형식 오류입니다. n8n Value에는 대문자 B의 `Bearer`와 한 칸 공백을 포함합니다.

인증값은 충분히 무작위인 값으로 준비하고 사용자 또는 관리자가 비공개 관리합니다. 실제 값·키·비밀번호를 대화·소스·문서·Git·`VITE_*`·본문·브라우저 저장소에 넣지 않습니다. n8n Credential의 신규 입력·확인·저장 제출은 사용자가 직접 수행합니다. Render 환경값도 화면 공유나 문서에 실제 값을 노출하지 않습니다.

임의 사용자 정의 헤더 대신 `Authorization`을 사용합니다. 인증용 표준 헤더의 기존 민감 정보 보호를 활용하려는 선택이며, 설치 버전에서 인증값이 실행 기록에 남지 않는다는 보장은 아닙니다.

## 운영 적용 순서

1. **사용자가 사용되지 않는 n8n Credential을 생성합니다.**

   Header Auth Credential에 Name `Authorization`, Value `Bearer <동일 토큰>`을 직접 입력하고 확인·저장합니다. 아직 Start에 연결하거나 publish하지 않습니다. 기존 운영 Credential을 덮어쓰지 않습니다.

2. **사용자가 Render 환경값을 Save only로 저장합니다.**

   `N8N_WEBHOOK_AUTH_TOKEN`에 접두어 없는 원문 토큰을 저장합니다. 기존 URL·Retell·DB·직원 로그인 설정은 유지합니다. 이 단계에서는 재배포하지 않습니다.

3. **진행 중 통화와 최종 결과 전송이 없는 시점을 확인합니다.**

   연결 중·응대 중·종료 대기·최종 고성 수신 대기·전송 pending이 없는 시점에 전환합니다. 다음 두 단계가 끝날 때까지 새 테스트 통화를 시작하지 않습니다. 앱 배포 재시작은 서버 메모리 통화 기록을 지우므로 진행 중 통화가 있을 때 실행하지 않습니다.

4. **앱 저장용 Start에 Header Auth를 연결하고 publish합니다.**

   Start의 Authentication을 `Header Auth`로 선택하고 새 Credential을 연결합니다. HTTP POST·Production URL·응답 방식·입력 검증·요약·원자 저장 노드와 연결은 유지합니다. 운영에 적용되는 workflow 버전을 확인한 뒤 publish합니다. 다른 송신자의 Webhook은 함께 변경하지 않습니다.

5. **승인된 앱 인증 코드를 배포합니다.**

   `Authorization: Bearer <토큰>`을 보내는 검증된 앱 버전을 Render에 배포하고 Live 및 `/health` 상태를 확인합니다. n8n만 먼저 인증을 켠 전환 구간에는 기존 인증 없는 앱 전송이 거부될 수 있으므로 통화를 계속 중단한 상태로 유지합니다.

6. **비즈니스 쓰기 없는 인증 거부를 확인합니다.**

   앱 저장용 Production Webhook에 `Content-Type: application/json`과 빈 본문 `{}`로 두 요청을 확인합니다. 하나는 Authorization을 생략하고 다른 하나는 실제 토큰과 다른 인증값을 사용합니다. 실제 고객·상담 ID·신호·전문을 넣지 않습니다.

   두 요청 모두 **인증 단계에서 거부**되고 후속 요약·DB 저장 노드가 실행되지 않아야 합니다. 최신 master 소스의 Header Auth는 불일치 시 HTTP 403을 반환하지만 설치 버전의 실제 응답을 확인해야 합니다. 입력 검증의 HTTP 400만으로 인증 거부가 확인됐다고 판단하지 않습니다. 거부 확인만을 위해 유효한 인증값과 실제 저장 본문을 임의 제출하지 않습니다.

7. **사용자가 짧은 새 실제 통화를 수행합니다.**

   기존 보조 마이크·Web Call·종료 흐름을 사용합니다. 앱의 최종화 후 전송이 1회인지, n8n Start 인증이 통과했는지, 원자 저장과 HTTP 200/요약 대기 응답이 완료됐는지 확인합니다. 이어 `KCM Call Summary`→`KCM Summary Check`→`KCM Update Summary`와 실제 저장 요약을 별도로 확인합니다. 앱의 HTTP 2xx/sent 표시만으로 후속 요약 저장 완료를 단정하지 않습니다. 실제 비밀번호·토큰·고객 내용은 공유하지 않고 결과만 기록합니다.

## 차단과 실패 확인

| 상황 | 앱 처리 |
| --- | --- |
| `N8N_WEBHOOK_AUTH_TOKEN` 미설정 | `failed / N8N_WEBHOOK_AUTH_MISSING`, 외부 POST 없음 |
| 허용 형식에 맞지 않는 값 | `failed / N8N_WEBHOOK_AUTH_INVALID`, 외부 POST 없음 |
| n8n과 토큰 불일치·Header Auth 거부 | 기존 HTTP 실패 코드, 추가 POST/자동 재시도 없음 |
| n8n 2xx | HTTP 수신 성공. 현재 저장 흐름의 HTTP 200은 요약 대기 응답이며 후속 요약 저장 완료는 별도 확인 |

인증 누락·오류를 인증 없는 전송으로 우회하지 않습니다. 실패해도 확정 점수·상담 시각·기존 이력을 바꾸지 않습니다. 환경값 수정·서버 재시작 후에는 새 통화로 확인하며 과거 실패 통화를 자동 재전송하지 않습니다. 응답이 유실돼도 상대가 이미 저장했을 수 있으므로 임의 재전송하지 않습니다.

전환 중 문제가 생기면 새 통화를 중단하고 Start 인증 설정, 양쪽 저장 형식, 앱 배포 버전과 고정 실패 코드부터 확인합니다. 인증을 None으로 되돌려 공개 전송을 허용하는 방식으로 해결하지 않습니다. 인증값을 교체할 때도 같은 중단·양쪽 설정·검증 순서를 사용합니다.

## 실행 기록의 인증값 보관: 미검증

**현재 설치된 n8n 버전에서 Executions의 `headers`에 인증값이 저장되거나 표시되는지는 아직 확인하지 않았습니다.** 최신 master의 Webhook 구현에는 Header Auth 일치 후 `recordConsumedAuth(req, [headerName])`를 호출하는 코드가 있습니다. 이 코드만으로 현재 설치 버전의 출력 마스킹, 실행 데이터 저장·보관 정책, 기존 기록까지 동일하다고 단정하지 않습니다.

실제 설치 버전과 실행 저장 설정을 확인하고, 운영 검증 시 사용자 또는 관리자가 비공개로 해당 헤더의 제거·마스킹 여부를 확인해야 합니다. 실제 Authorization 값을 복사·출력하거나 캡처·실행 JSON·대화·문서에 포함하지 않습니다. 확인 결과는 ‘제거됨’, ‘마스킹됨’, ‘표시/보관됨’, ‘미확인’처럼 값 없이 기록합니다. 표시·보관이 확인되면 접근·보관 정책과 토큰 교체를 검토한 뒤 다음 운영 검증을 진행합니다.

## 공식 근거

- [n8n Webhook의 지원 인증 방식](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/#supported-authentication-methods): Header Auth를 지원하며 Production Webhook은 publish된 워크플로를 사용합니다.
- [n8n Webhook Credential의 Header Auth](https://docs.n8n.io/integrations/builtin/credentials/webhook/#using-header-auth): 인증 헤더의 Name과 Value를 지정합니다.
- [n8n 최신 master의 Webhook 인증 구현](https://github.com/n8n-io/n8n/blob/master/packages/nodes-base/nodes/Webhook/utils.ts): Header Auth의 값 비교·불일치 거부·소비된 인증 헤더 기록 처리를 확인했습니다. 설치 버전의 동작 확인을 대신하지 않습니다.
