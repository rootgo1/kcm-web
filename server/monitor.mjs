import { RetellClient } from 'retell-client-js-sdk';

/** Remove terminal control characters; transcript is text, never a command. */
const clean = (/** @type {string} */ text) => text.replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim();

/** The SDK merges snapshots/updates by utterance ID. Keep a second cursor for logging. */
export function createTranscriptPrinter(/** @type {(line: string) => void} */ log) {
  /** @type {Map<string, string>} */
  const printed = new Map();
  return (/** @type {import('retell-client-js-sdk').LiveCallUtterance[]} */ transcript) => {
    for (const item of transcript) {
      if (item.role !== 'user' && item.role !== 'agent') continue;
      const content = clean(item.content);
      if (!content) continue;
      const previous = printed.get(item.id);
      // Repeated full lists and stale/shorter snapshots must not repeat speech.
      if (previous === content || (previous && previous.startsWith(content))) continue;
      const role = item.role === 'user' ? 'USER' : 'AGENT';
      if (!previous) log(`[${role}] ${content}`);
      else if (content.startsWith(previous)) {
        log(`[${role}] (이어짐 ${clean(item.id)}) ${content.slice(previous.length).trim()}`);
      } else {
        // ASR corrections are revisions of this ID, not an additional utterance.
        log(`[${role}] (정정 ${clean(item.id)}) ${content}`);
      }
      printed.set(item.id, content);
    }
  };
}

/**
 * Server-only SDK: authentication stays in this process. Never call listen/takeOver/end.
 * 3.0.2 retries not-yet-live (4004) and transport interruptions with bounded backoff.
 * @param {{ key: string, log?: (line: string) => void, client?: Pick<RetellClient, 'monitorCall'>,
 * liveCalls?: ReturnType<import('./live-calls.mjs').createLiveCallStore> }} options
 */
export function createMonitorRegistry({ key, log = console.log, client = new RetellClient({ key }), liveCalls }) {
  /** @type {Map<string, import('retell-client-js-sdk').MonitorSession | null>} */
  const sessions = new Map();
  const release = (/** @type {string} */ callId) => {
    if (!sessions.has(callId)) return;
    const session = sessions.get(callId);
    // A local cancellation/shutdown is not proof of a remote call_ended event.
    liveCalls?.error(callId);
    sessions.delete(callId);
    // disconnect only closes this observer; end() would stop the actual call.
    session?.disconnect();
  };
  return {
    get size() { return sessions.size; },
    has: (/** @type {string} */ callId) => sessions.has(callId),
    start(/** @type {string} */ callId) {
      if (sessions.has(callId)) return;
      sessions.set(callId, null);
      liveCalls?.connecting(callId);
      const print = createTranscriptPrinter(line => log(`[${callId}] ${line}`));
      try {
        const session = client.monitorCall({
          call_id: callId,
          transcript: true,
          hooks: {
            onStatus: status => {
              if (status === 'monitoring' && sessions.has(callId)) {
                liveCalls?.live(callId);
                log(`monitor connected: ${callId}`);
              }
            },
            // Pre-session transcripts belong to earlier context, not this call.
            onTranscript: transcript => {
              if (!sessions.has(callId)) return;
              liveCalls?.transcript(callId, transcript);
              print(transcript);
            },
            onError: () => {
              // SDK errors can contain upstream response details. Do not log them.
              log(`monitor error: ${callId} (인증·Call Edit 권한·통화 상태·네트워크를 확인하세요)`);
              liveCalls?.error(callId);
              release(callId);
            },
            onEnd: () => {
              // Local disconnect (cleanup/error) also fires onEnd in the SDK.
              // Only the still-registered observer's remote end marks the call ended.
              if (sessions.has(callId)) liveCalls?.ended(callId);
              log(`monitor ended: ${callId}`);
              release(callId);
            },
          },
        });
        if (sessions.has(callId)) sessions.set(callId, session);
        else session.disconnect();
      } catch {
        log(`monitor error: ${callId} (연결을 시작하지 못했습니다)`);
        liveCalls?.error(callId);
        release(callId);
      }
    },
    release,
    close() { for (const callId of sessions.keys()) release(callId); },
  };
}
