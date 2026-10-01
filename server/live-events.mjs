/**
 * Each connection gets a full snapshot, including after EventSource reconnect.
 * No event replay log or persistent store is required.
 * @param {ReturnType<import('./live-calls.mjs').createLiveCallStore>} store
 * @param {number} heartbeatMs
 */
export function createLiveEvents(store, heartbeatMs = 15_000) {
  /** @type {Set<() => void>} */
  const disconnects = new Set();
  return {
    /** @param {import('node:http').ServerResponse} response */
    connect(response) {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      response.setTimeout(0);
      response.flushHeaders();
      let closed = false;
      /** @type {ReturnType<typeof setInterval> | undefined} */
      let timer;
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let slowTimer;
      let blocked = false;
      let pendingSnapshot = false;
      let unsubscribe = () => {};
      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        clearTimeout(slowTimer);
        unsubscribe();
        disconnects.delete(disconnect);
        response.off('close', cleanup);
        response.off('error', cleanup);
        response.off('drain', drain);
      };
      const disconnect = () => { cleanup(); response.end(); };
      const write = (/** @type {string} */ frame) => {
        if (closed || response.destroyed) { cleanup(); return; }
        if (blocked) { pendingSnapshot = true; return; }
        // A single large snapshot can exceed the socket high-water mark. Let it drain;
        // coalesce subsequent events into ONE fresh full snapshot instead of queueing them.
        try {
          if (!response.write(frame)) {
            blocked = true;
            slowTimer = setTimeout(() => { cleanup(); response.destroy(); }, 30_000);
            slowTimer.unref();
          }
        }
        catch { cleanup(); response.destroy(); }
      };
      const send = (/** @type {import('../src/live/types.js').LiveCallsEvent} */ event) => write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const drain = () => {
        if (closed) return;
        blocked = false;
        clearTimeout(slowTimer);
        if (pendingSnapshot) { pendingSnapshot = false; send({ type: 'snapshot', calls: store.snapshot() }); }
      };
      response.once('close', cleanup);
      response.once('error', cleanup);
      response.on('drain', drain);
      disconnects.add(disconnect);
      unsubscribe = store.subscribe(send);
      write('retry: 2000\n\n');
      send({ type: 'snapshot', calls: store.snapshot() });
      if (!closed) { timer = setInterval(() => { if (!blocked) write(': keep-alive\n\n'); }, heartbeatMs); timer.unref(); }
    },
    close() { for (const disconnect of disconnects) disconnect(); },
  };
}
