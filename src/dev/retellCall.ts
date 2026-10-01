import type { RetellClient, WebCallSession } from 'retell-client-js-sdk';

/** Rewrite REST only. Keep Retell's default media/signaling host. No browser API key. */
export const retellProxyFetch: typeof fetch = (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== 'https://api.retellai.com' ||
    !(url.pathname === '/v3/create-web-call' || /^\/v2\/stop-call\/[A-Za-z0-9_-]+$/.test(url.pathname))) {
    return Promise.reject(new Error('UNSUPPORTED_RETELL_OPERATION'));
  }
  const headers = new Headers(init?.headers);
  headers.delete('Authorization'); // SDK placeholder is not a credential and need not be transmitted.
  return fetch(`/retell${url.pathname}`, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
};

export interface CallView {
  status: 'idle' | 'connecting' | 'live' | 'ending' | 'ended';
  callId: string;
  error: string;
}

export function callErrorMessage(error: unknown): string {
  const message = error instanceof Error ? `${error.name} ${error.message}` : '';
  if (/NotAllowedError|PermissionDenied|permission denied|permission dismissed/i.test(message)) {
    return '마이크 사용 권한이 필요합니다. 브라우저 주소창의 사이트 권한에서 마이크를 허용한 뒤 다시 시작하세요.';
  }
  if (/NotFoundError|DevicesNotFound/i.test(message)) return '사용 가능한 마이크가 없습니다. 마이크를 연결한 뒤 다시 시작하세요.';
  if (/NotReadableError|TrackStartError/i.test(message)) return '마이크를 사용할 수 없습니다. 다른 앱의 마이크 사용 상태를 확인하세요.';
  if (message.includes('RETELL_API_KEY_MISSING')) return '백엔드의 RETELL_API_KEY가 없습니다. 프로젝트 .env를 작성하고 npm run server를 다시 실행하세요.';
  if (message.includes('RETELL_AGENT_ID_MISSING')) return '백엔드의 RETELL_AGENT_ID를 설정하고 서버를 다시 실행하세요.';
  if (message.includes('RETELL_AUTH_FAILED')) return 'Retell 인증에 실패했습니다. 백엔드의 API 키와 Agent 접근 권한을 확인하세요.';
  // Do not echo arbitrary SDK / upstream response bodies or tokens into the UI.
  return '통화를 연결하지 못했습니다. 백엔드 실행 상태, Retell 설정, 네트워크와 마이크 권한을 확인한 뒤 다시 시도하세요.';
}

/** A synchronous guard also prevents double clicks before React renders disabled buttons. */
export function createCallController(client: Pick<RetellClient, 'createWebCall' | 'stopCall'>, agentId: string, notify: (view: CallView) => void) {
  let session: WebCallSession | null = null;
  let generation = 0;
  let disposed = false;
  let view: CallView = { status: 'idle', callId: '', error: '' };
  const publish = (patch: Partial<CallView>) => { view = { ...view, ...patch }; if (!disposed) notify(view); };
  return {
    start() {
      if (disposed || session) return;
      const current = ++generation;
      publish({ status: 'connecting', callId: '', error: '' });
      try {
        session = client.createWebCall({
          agent_id: agentId,
          transcript: false, // Monitor is server-only; never open an authenticated browser Monitor.
          hooks: {
            onStatus: status => {
              if (current !== generation || disposed) return;
              if (status === 'live') publish({ status: 'live', callId: session?.callId ?? '' });
            },
            onError: error => {
              if (current !== generation || disposed) return;
              publish({ error: callErrorMessage(error) });
              // A mic/media failure after creation leaves a registered call. Clean up only our call.
              if (session?.callId) void client.stopCall(session.callId).catch(() => {});
            },
            onEnd: () => {
              if (current !== generation || disposed) return;
              const callId = session?.callId ?? '';
              session = null;
              publish({ status: 'ended', callId });
            },
          },
        });
      } catch (error) {
        session = null;
        publish({ status: 'ended', error: callErrorMessage(error) });
      }
    },
    async end() {
      if (!session || view.status === 'ending') return;
      publish({ status: 'ending' });
      try { await session.end(); } catch { publish({ error: '종료 처리에 실패했습니다. 이 테스트 탭을 닫아 마이크 연결을 해제하세요.' }); }
    },
    dispose() {
      disposed = true;
      generation++;
      void session?.end().catch(() => {});
      session = null;
    },
  };
}
