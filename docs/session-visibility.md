# Session visibility

Open **Sessions**, select a URL, and inspect its execution timeline. Updated workers publish resource acquisition, browser launch, navigation, browsing, completion, failure, and cancellation events. The panel refreshes every two seconds, separately from queue snapshots. Each event records the session, worker, campaign (if assigned), and attempt number. Manual retries preserve the previous attempt history.

**Search related logs** opens Logs filtered to the canonical session ID. Campaign links search the campaign ID; typing a worker ID searches that worker's events. Search and severity filtering happen on the controller before the result limit. Exports include the displayed entries and their structured metadata as newline-delimited JSON.

Worker logs in this view are curated execution events, not an unrestricted copy of worker stdout. Raw exception text, target query strings, proxy credentials, and full job configurations are never added to these events. Local worker logs remain available for deeper debugging. Failure messages identify HTTP status, timeout, proxy, network, origin, and browser startup categories without exposing raw errors.

On execution failure, desktop and Android Chromium drivers attempt a viewport JPEG before cleanup. **Load failure screenshot** fetches it on demand through the authenticated loopback API. Launch failures, cancellation, capture errors, and oversized images may have no screenshot. The UI explains this rather than showing a broken image. Screenshots can contain page content; they remain in the project's private Redis, never an external upload.

Retention is bounded: 100 events per session, 2,000 aggregate worker log events, and 20 failure JPEGs up to 384 KB each. Event keys expire after 24 hours of inactivity. Each JPEG has an independent 24-hour expiration checked on read, in addition to the global eviction limit. Controller logs remain in its existing 2,000-entry in-memory buffer. Diagnostics survive controller restart while retained in Redis. Older workers and expired sessions show an explicit timeline fallback.

Telemetry writes have a 500 ms deadline and capture has a 1.5 second deadline. Diagnostics failure does not replace the session's execution outcome. An unavailable diagnostics API shows a reconnecting state while polling continues.

## Validation

```sh
npx jest --runInBand SessionTelemetry.test.ts
npm --prefix apps/desktop test
# Requires an empty, disposable Redis database and a local Chrome installation:
REDIS_TEST_URL=redis://127.0.0.1:26389/1 node scripts/test-desktop-integration.cjs
```

The integration test uses local HTTP and proxy fixtures, separate worker/controller storage, HTTP 500 failures with screenshots, cancellation and retry attempts, linked log filtering, campaign execution, and graceful shutdown. `CONTROLLER_BINARY` can point to the compiled sidecar for the same checks.
