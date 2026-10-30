# Audit fixes — 2026-10-30

## Implemented

- Native development and packaged launches use the dedicated long-running controller. Startup does not enqueue sessions. The working directory is the writable controller data directory rather than app resources.
- Scheduler startup timeout and recurring timer are both cancelled on stop. Worker command subscriptions and downloader failure timers are closed. Compiled-runtime WebSocket shutdown is bounded after all management connections are terminated.
- Onboarding hooks run unconditionally. Dismissal has a regression test. The test environment supplies a functioning Storage implementation.
- Settings use an explicit typed allowlist, reject newline/unknown-key injection, validate the resulting configuration, and atomically write a private next-launch configuration file. Runtime configuration stays unchanged until restart. UI sends changed fields only and explains restart requirements. Explicit environment variables retain precedence.
- Enrollment validates an independent cryptographic single-use capability at its dedicated loopback endpoint; other management routes still require installation authentication. Consumption is atomic and works with older Redis versions. Enrollment CLI no longer races normal worker startup, and saved worker configuration is read before initialization. Enrollment configuration is saved with private permissions. Unsupported Windows ARM64 download selection is disabled and Windows command naming is fixed. Remote use requires an authenticated tunnel for both the controller and Redis; the API remains loopback-only.
- Update reconciliation retries until Redis is ready and cancels its retry on shutdown.
- Proxy limits are persisted and enforced with atomic Redis reservations across allocator instances, with lease expiry and release. API counts use shared reservations. Explicit per-session proxies do not reserve unused pool proxies. Proxy editing and bounded endpoint-connectivity tests are available. Connectivity checks do not claim authenticated egress verification.
- Connection indicators use actual stream state rather than cached snapshots or connection-object presence.
- Sessions have confirmed Stop and Retry commands. Stop cancels the worker browser and suppresses automatic retries; manual retry is restricted to failed jobs. Session filters now include campaign/browser/worker/persistence, and details show lifecycle timestamps and link to a log search.
- Campaign forms derive browser/device choices from current worker capabilities, load existing profiles, lock their OS/browser/device bindings, explain unavailable workers and use native form validation. Backend campaign validation and profile-binding checks provide a second boundary.
- Profile deletion rejects unsafe path keys. Proxy update payloads are constrained to public editable fields.
- Tray campaign pause is functional. Safe controller restart and persisted minimize-to-tray preferences are available. Native notifications cover lost controller connections, offline workers and bursts of failures, with rate limiting.
- Packaging chooses the host architecture, signs generated macOS sidecars ad hoc for local validation, and includes only sidecar binaries in resources. Windows NSIS/MSI and Linux deb/AppImage configuration added. Release workflow installs desktop dependencies and includes Linux. Updater/process permissions and updater artifact generation are configured.

## Verification

| Check | Result |
|---|---|
| Backend build and ESLint | Pass |
| Full backend suite | 254 pass, 45 skipped; exits normally |
| Frontend build and tests | Pass; 18 tests |
| Control API integration | 8 pass; exits normally |
| Shared Redis proxy capacity | 6 pass, including competing allocator instances |
| Real local browser integration | Pass: session success, stop, manual retry, stop again, live events, safe shutdown |
| Compiled controller integration | Same lifecycle passes with compiled macOS sidecar; no automatic work on startup |
| Rust check | Pass on macOS ARM64 |
| macOS app/updater archive build | Pass, local unsigned release build |
| Native UI | Automatic owned-controller connection, live zero-work dashboard, close preference and idle quit verified |

Tests used a disposable Redis container on loopback port 26389 and controlled local HTTP fixtures. Other project containers were left alone. Screenshot: `/tmp/trafficbot-fixes-proof/native-dashboard.png`.

## Verification limits and remaining product scope

Windows/Linux installers and macOS x64 need execution on their native hosts; release signing, notarization and installation from the public updater feed were not performed. A local unsigned archive is not a signed distributable release. The public updater feed did not provide a valid release during native UI verification; the installed app was preserved.

Frontend lint has no error diagnostics but still reports advisory React/style warnings. Vite reports a roughly 748 kB main chunk; route splitting remains a performance improvement.

Multi-target campaigns, campaign-wide concurrency and selected proxy pools are now implemented; see [campaign execution](campaign-execution.md). The remaining product scope includes complete live navigation/page-visit telemetry, centralized remote-worker log ingestion, arbitrary remote-controller configuration and full accessibility verification. Existing log search only finds events available to the controller and is not a complete remote-worker log archive.

## Development

Use `npm run dev:desktop` to launch the native app; it builds and starts the dedicated controller. Start Redis and execution workers separately. Use `npm run build:desktop` to stage the platform-specific sidecar and create native bundles. Build macOS x64 on an x64 host so the sidecar and Tauri binary match.

Settings are stored in `$TRAFFICBOT_CONTROL_DIR/.env` or `~/.trafficbot/.env`. Default desktop data, logs and preferences are outside the installed application resources. Restart affected external workers separately after configuration changes.
