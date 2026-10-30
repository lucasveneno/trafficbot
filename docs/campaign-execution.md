# Campaign execution

The Campaigns editor supports up to 100 HTTP(S) targets, a shared concurrency limit from 1–100, a finite total session count, and a selected proxy pool. New campaigns default to direct connections. Existing campaigns retain the legacy automatic-proxy option until explicitly changed.

## Running a campaign

1. Save the target URLs, one per line. URLs must use HTTP(S) and cannot contain credentials.
2. Set concurrent sessions and, optionally, total sessions. Immediate campaigns default to one session per target. Targets rotate in the order entered until the total is reached. Interval and cron campaigns can repeat without a total, or stop at the configured total.
3. Choose direct, legacy automatic proxy selection, or a pool of existing proxies. A selected pool must contain at least one enabled, available proxy. An unavailable/exhausted selected pool never silently switches to a direct connection.
4. Select a compatible worker platform/browser/device or leave compatible automatic routing. Persistent profiles lock their binding and require concurrency one.
5. Start the saved campaign. Starting requires Redis and a compatible worker. Pause prevents future dispatch and holds queued campaign jobs; sessions already running finish normally. Resume keeps the same target position and submitted total. Starting a completed campaign creates a fresh run once previous jobs have drained.

The controller dispatches work every two seconds, keeping at most the campaign's configured outstanding count. Workers also enforce concurrency atomically through Redis across platform queues and processes. Jobs waiting for a campaign slot are delayed without consuming retry attempts. Reservations cover execution plus a five-minute cleanup margin; a crashed worker's reservation expires rather than allowing another worker to overlap it immediately.

Progress is stored in Redis. Deterministic dispatch IDs and a preserved routing decision allow an unacknowledged submission to be retried on the same queue after a controller restart. Pause/resume does not reset progress. Keep Redis persistence enabled if progress must survive Redis replacement or data loss.

Campaign scheduling metadata remains in the existing file store. Concurrent status/statistics writes are serialized so a metric update cannot undo a pause. Queue-side accounting counts submissions and terminal outcomes independently of whether a fast session appears between UI snapshots. Counters are cumulative for the campaign; starting a fresh run does not erase history. Explicit schedules and Run Now rotate through the same targets and use the same worker-side concurrency limit.

## Proxy and security behavior

Selected proxy endpoints and credentials are resolved by the controller when each job is dispatched, then passed through the existing private Redis job channel. Workers do not need the controller's proxy files or encryption key. The management API returns IDs, labels and configured/direct status; it does not return proxy passwords. Queued jobs retain the endpoint snapshot they were dispatched with; edits affect later dispatches.

Redis contains sensitive execution payloads and must remain private. Do not expose its job data as frontend state. Proxy capacity reservations remain shared across workers and are released during cleanup. When selected proxies are at capacity, jobs wait without consuming retry attempts; unavailable endpoints use the normal failure/retry policy. Neither condition falls back to a direct connection.

## Verification

- `npm test -- --runInBand` includes campaign validation, target rotation, persisted progress, pause/resume and completion tests.
- `npm --prefix apps/desktop test` includes editor serialization, URL validation and profile/device compatibility tests.
- `REDIS_TEST_URL=redis://127.0.0.1:26389/1 npm run test:campaigns` requires an empty disposable Redis database. It verifies a limit of two across two workers with eight execution slots, and idempotent dispatch after routing inputs change.
- `REDIS_TEST_URL=redis://127.0.0.1:26389/2 node scripts/test-desktop-integration.cjs` runs controlled local HTTP/proxy fixtures and real browsers. It verifies target visits, pause/resume, finite completion, authenticated pool use, accurate totals and shutdown. It uses separate controller/worker data directories and refuses a nonempty database.

Windows/Linux installer verification, centralized worker log ingestion and live page-visit telemetry remain separate workstreams.
