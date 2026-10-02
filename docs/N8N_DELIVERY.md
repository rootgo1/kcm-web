# 통화 최종 결과 → n8n

기존 Retell Web Call·Monitor·SSE·신호 분석·점수 정책을 유지합니다. 전송은 Node 백엔드만 수행하며 직원 화면과 브라우저는 Webhook을 호출하지 않습니다. KCM은 DB에 직접 저장하지 않습니다.

## 사용자 설정과 적용

로컬 `.env` 또는 Render 서비스 `kcm`의 **Environment**에 아래 항목을 직접 추가합니다. 실제 값은 GitHub나 `VITE_*` 변수에 넣지 않습니다. 기존 Retell 환경변수는 유지합니다.

```dotenv
N8N_WEBHOOK_URL=
KCM_DEMO_CUSTOMER_ID=
KCM_DEMO_STORE_ID=
```

- `N8N_WEBHOOK_URL`: 사용자가 확인한 HTTPS Production Webhook URL입니다. 코드·문서·로그에는 실제 URL을 기록하지 않습니다.
- `KCM_DEMO_CUSTOMER_ID`: 첫 E2E 검증에서 사용하기로 한 DB의 테스트 고객 ID입니다. 값을 지정하면 이 서버가 새로 만드는 테스트 Web Call에 공통 적용됩니다. 실제 고객을 식별하거나 DB를 조회하는 기능은 아닙니다. 미설정 시 `null`을 유지하며 임의의 고객을 대입하지 않습니다.
- `KCM_DEMO_STORE_ID`: 사용자가 지정하는 데모 매장 ID입니다. 고객 ID와 같이 새 통화 생성 시 서버 설정에서 보관합니다. 브라우저가 지정할 수 없으며 재등록으로 덮어쓰지 않습니다. 미설정 시 임의 값을 만들지 않고 전송을 `failed / STORE_ID_MISSING`으로 처리합니다.
- 로컬: 통화가 없을 때 백엔드를 재시작합니다(`npm.cmd run server`). 실제 `.env`는 이 작업에서 읽거나 변경하지 않습니다.
- Render: 현재 자동 배포는 꺼져 있습니다. 위 값을 직접 저장하고 **Manual Deploy → Deploy latest commit**으로 GitHub main의 새 코드를 적용합니다. 진행 중 통화가 없는 시점에 배포하세요. Blueprint의 `sync: false`는 기존 서비스에 새 값을 자동 입력하지 않으므로 Environment에 직접 추가해야 합니다. [Render 공식 안내](https://render.com/docs/blueprint-spec#prompting-for-secret-values)

URL/고객 ID/매장 ID 미설정 또는 잘못된 URL은 최종 결과 전송을 `failed`로 남깁니다. KCM 화면·Retell 통화·위험 결과 계산은 계속 사용할 수 있습니다. 설정 변경 후에는 새 통화로 검증합니다. 과거 실패 결과의 자동 재전송은 없습니다.

## ID와 전송 시점

1. 정상적인 Web Call 생성 요청을 받으면 Retell REST 호출 **전에** `consultation_<밀리초 숫자>`를 생성합니다. 같은 프로세스에서 같은 밀리초의 요청·시계 역행은 직전 숫자+1로 중복을 피합니다. 단일 서버의 메모리 데모용이며 영구 DB 시퀀스나 다중 서버 ID 정책은 아닙니다.
2. Retell 응답의 실제 `call_id`에 최초 `consultation_id`와 환경설정의 `customer_id`를 연결합니다. Monitor의 재등록·SSE 재접속·중복 종료로 ID를 덮어쓰지 않습니다. 브라우저가 ID를 지정할 수 없습니다.
3. **Monitor 종료 + 최종 고성 측정 수신 + 전체 측정 확인 + 유효한 위험 계산**으로 `final_result`가 처음 생길 때만 전송을 시작합니다. raw `call_ended`만으로는 보내지 않으며, 최종 고성 결과가 먼저 도착하거나 늦게 도착하는 경우를 모두 지원합니다.
4. 기존 확정 결과에서 전송 계약 필드만 선택합니다. 신호나 점수를 재계산하지 않습니다.
5. `consultation`에 서버 설정 매장 ID, 고정값 `status:완료`, `used_ai:true`, LiveCall의 최초 시작/종료 시각과 최종 대화 snapshot을 추가합니다. 시각은 현재 서버의 ISO UTC 문자열 형식과 실제 날짜 유효성·시작≤종료를 검증한 후 **원본 그대로** 사용합니다. 누락/잘못된 시각은 `CONSULTATION_TIMES_INVALID`로 실패하며 새 시각을 만들지 않습니다.

## POST 계약

`POST N8N_WEBHOOK_URL`, `Content-Type: application/json`. 아래는 **가상의 계약 예시**이며 실제 전송 이력이 아닙니다. `body`나 배열로 감싸지 않습니다.

```json
{
  "call_id": "call_example",
  "consultation_id": "consultation_1760000000000",
  "customer_id": "customer_example",
  "signals": {
    "profanity_count": 2,
    "threat_count": 1,
    "blame_count": 3,
    "sexual_count": 0,
    "shouting_count": 2
  },
  "scores": {
    "profanity_score": 6,
    "threat_score": 20,
    "blame_score": 8,
    "sexual_score": 0,
    "shouting_score": 5
  },
  "risk_score": 39,
  "risk_level": "주의",
  "consultation": {
    "store_id": "store_example",
    "status": "완료",
    "used_ai": true,
    "started_at": "2026-10-02T01:00:00.000Z",
    "ended_at": "2026-10-02T01:01:00.000Z",
    "transcript": [
      {"turn_id": "u1", "role": "user", "content": "씨발 씨발. 내가 너 찾아간다. 일을 왜 이렇게 못해요? 말이 안 통하네. 이것도 제대로 못해요?", "start_sec": 1},
      {"turn_id": "a1", "role": "agent", "content": "문의 내용을 확인하겠습니다.", "start_sec": null}
    ]
  }
}
```

`threat_count`, `blame_count` 등 기존 계약 필드는 그대로 유지합니다. `consultation.transcript`는 최종 `LiveCall.messages`에서 `turn_id`, `role`, `content`, `start_sec` 네 필드만 선택합니다. 발화 순서·내용·공백·줄바꿈·user/agent 역할·null 시점을 그대로 유지하며 재분석/정렬/내용 수정은 하지 않습니다. 빈 대화는 빈 배열입니다. 음성·토큰·Webhook URL·내부 규칙 메타데이터·end_sec·위험 배지는 보내지 않습니다.

`purpose`, `ai_summary`는 생성하거나 전송하지 않습니다. DB 컬럼 변환/저장, 향후 요약과 통화 전문 테이블 매핑은 n8n이 담당합니다. KCM은 테이블명·컬럼 구조를 가정하거나 DB에 직접 접근하지 않습니다.

## 전송 상태와 실패

- 각 live call의 `webhook_delivery`는 미전송 `null` → `pending` → `sent` 또는 `failed`입니다. `attempted_at`, `completed_at`, 고정 오류 코드만 기록합니다. 기존 SSE snapshot에도 포함되지만 UI는 변경하지 않습니다.
- 네트워크 요청 전에 원자적으로 `pending`을 선점합니다. 중복 종료·중복 최종화·전송 중 호출·완료 뒤 호출은 모두 추가 POST를 막습니다.
- 2xx는 `sent`, 4xx/5xx/리디렉션·네트워크 실패·10초 시간 초과는 `failed`입니다. 서버 종료 시 진행 중 요청을 취소합니다. 확정 결과·상담 시각·이력은 유지합니다.
- 로그: `[n8n] delivered call result: <call_id>` 또는 `[n8n] delivery failed: <call_id> (HTTP_500 등)`만 남깁니다. 응답 본문·예외 원문·전체 URL·키는 출력하지 않습니다. 성공은 HTTP 수신 확인이며 후속 DB 저장 성공을 뜻하지 않습니다.
- 자동 재시도·수동 재전송 API·영구 큐는 없습니다. 응답 유실 시 상대가 이미 처리했을 수 있으므로 재전송하지 않습니다. 실패 시 n8n Executions를 먼저 확인합니다. 서버 재시작 후 메모리와 전송 상태는 사라집니다. 재시작을 포함한 영구 exactly-once 저장은 이번 범위가 아닙니다.

## 검증 방법

- `npm.cmd run check`: 기존 전체 테스트와 n8n 테스트, 프런트·백엔드 타입 검사 및 빌드.
- 자동 검증은 실제 Production URL/키/고객/매장 대신 격리된 모의 Retell 전송과 로컬 HTTP 수신기를 사용합니다. 두 통화의 ID 연결, 최종화 순서, 기존 JSON 계약 보존과 consultation 추가, 최종 대화 투영/시각 검증/매장 설정 누락, 1회 POST, 실패 보존, SSE/키 보호를 확인합니다.
- 실제 검증: Production 워크플로 활성 확인 → 고객 `#/retell-test`에서 보조 마이크 시작 → Web Call → 발화 → 종료 → 서버 성공 로그 확인 → n8n **Executions**에서 해당 `call_id`와 `body.consultation_id`, `body.customer_id`, `body.signals`, `body.scores`, `body.risk_score`, `body.risk_level` 확인. [n8n 공식 Webhook 안내](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/)
- 사용자가 이번에는 코드·자동 검증·GitHub 반영까지만 요청했으므로 실제 Production POST·새 음성 통화·n8n Executions 확인은 수행하지 않습니다.
