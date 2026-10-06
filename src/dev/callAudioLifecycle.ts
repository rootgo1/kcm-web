/** Prepare our independent microphone before Retell can publish a live call. */
export function createMicReadyCallStart(prepare: () => Promise<boolean>,
  startCall: () => void | boolean, notify: (preparing: boolean) => void) {
  let generation = 0, preparing = false, disposed = false;
  return {
    async start(): Promise<boolean> {
      if (disposed || preparing) return false;
      const attempt = ++generation;
      preparing = true;
      notify(true);
      try {
        if (!await prepare() || disposed || generation !== attempt) return false;
        if (startCall() === false) return false;
        return true;
      } catch {
        // The microphone/controller displays its own safe error message.
        return false;
      } finally {
        if (!disposed && generation === attempt) { preparing = false; notify(false); }
      }
    },
    cancel() {
      generation++;
      if (preparing) { preparing = false; if (!disposed) notify(false); }
    },
    dispose() { disposed = true; generation++; preparing = false; },
  };
}

/** Drain measured samples before closing the report, for either hang-up path. */
export function createCallAudioFinish(flushMic: () => Promise<boolean>,
  finishReport: () => Promise<void>, stopMic: () => void,
  notify: (finishing: boolean) => void) {
  let completion: Promise<void> | null = null;
  let finishing = false, disposed = false;
  return {
    finish(): Promise<void> {
      if (completion) return completion;
      if (disposed) return Promise.resolve();
      finishing = true;
      notify(true);
      completion = (async () => {
        try {
          // An unsuccessful flush marks the microphone unavailable; never fill gaps.
          await flushMic();
          if (!disposed) await finishReport();
        } finally {
          stopMic();
        }
      })().finally(() => { finishing = false; if (!disposed) notify(false); });
      return completion;
    },
    reset(): boolean {
      if (disposed || finishing) return false;
      completion = null;
      return true;
    },
    dispose() { disposed = true; },
  };
}
