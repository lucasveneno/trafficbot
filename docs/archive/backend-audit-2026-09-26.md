# Trafficbot correctness and security audit — 2026-09-25

The initial checkout was exactly `2d47d9d738bfbd5a5ac026c72e5076dc3435de95`, the previously audited revision. All fourteen finding groups were applicable. No repository-specific AGENTS.md instructions were found. Existing local environment/profile data was preserved. Verification targeted controlled local HTTP fixtures, not third-party websites.

## Confirmed findings and repairs

| Area | Confirmed issue and implemented repair |
| --- | --- |
| Docker installation | Root postinstall invoked a missing TypeScript script and required dev-only ts-node. Removed postinstall, added explicit Puppeteer CLI provisioning, npm ci in both stages, a matching browser revision, .dockerignore, and an unprivileged runtime with writable directories. |
| Redis/roles | Availability was checked before Redis became ready and reconnection was disabled. Startup now awaits the ready event with a deadline, including initially refused connections. All distributed roles fail nonzero without Redis; explicit local mode and opt-in startup fallback are defined. Temporary outages reconnect without changing execution mode. |
| Job failures | The orchestrator swallowed exceptions. It now records metrics once after cleanup and propagates the original failure. Cleanup cannot replace an earlier failure. Three attempts, exponential backoff, and final failed-job retention were verified against Redis. |
| Browser security | Unconditional no-sandbox, disabled web security, and disabled site isolation were removed, including sandbox flags in helper scripts. Local and container browser tests ran with sandbox protections enabled. |
| Compose | Redis/proxy/management ports and admin/admin defaults were removed. The optional proxy now uses explicit Tor configuration without a management listener. Effective Compose and Tor configuration were inspected. |
| Generated data | 513 dependency files and 189 profile files were tracked. These 702 paths were removed from the index without deleting local profiles. Lockfile remains tracked; ignore rules and the artifact CI check prevent recurrence. |
| Validation | Duration accepted invalid/nonfinite values; proxy fields were unrelated; queue payloads used any. Production Zod schemas now validate URLs, positive finite duration, proxy host/scheme/port/paired credentials, profile keys, intensity, and payload shape. Tests import production schemas. |
| Lifecycle | Handlers were registered too late, workers were not retained, and local timers prevented exit. SIGINT/SIGTERM handlers precede startup; workers drain within a deadline, active browsers cancel while Redis is available to record failure, then queues/connections close. Local and producer batches terminate. |
| Settings | Queue sessions lost persistent profiles and intensity, and random durations differed by mode. A shared validated job factory supplies both modes; random duration is resolved once; atomic per-profile filesystem leases prevent concurrent writers. |
| Navigation | URL-prefix comparisons allowed misleading hostnames. Parsed origins are compared exactly; cross-origin main-frame redirects are blocked before the destination request. Contextual navigation awaits a real response. Organic search has a bounded origin exception until the target is reached. |
| Metrics | Completed action sequences counted as success regardless of HTTP response. HTTP errors and navigation timeouts now fail sessions; final status/destination and failure category are recorded, with one metrics finalization after cleanup. |
| IP checks | Direct host-network HTTP measurements were mislabeled as proxy measurements. Optional HTTPS host telemetry is disabled by default, uses a 3-second deadline and 5-minute cache, skips proxy sessions, and does not log proxy credentials. Unsupported proxy geolocation matching fails configuration validation. |
| Deployment | Configuration forwarding, persistent volumes, Redis startup readiness, and a loopback HTTP role-readiness healthcheck replace hardcoded settings and file-existence health. README and .env.example document the actual behavior. |
| Verification | Added ESLint, artifact gate, production-schema tests, real browser/Redis/process integration tests, and CI execution. Browser setup failures now fail an explicitly selected integration suite instead of silently passing. Compatible dependencies were updated and audited. |

## Verification results

- Clean dependency install: `npm ci --ignore-scripts` passed on the host. Both Docker stages also passed ordinary `npm ci` from a clean build, validating installation with lifecycle scripts enabled and no root postinstall browser dependency.
- TypeScript build and ESLint passed.
- Default unit run: **34 passed**; **23 integration tests explicitly skipped** in this run only.
- Redis integration: **5 passed** — delayed readiness, bounded unavailability, three attempts/final retention, invalid payload rejection, reconnect and active drain.
- Process lifecycle integration: **12 passed** — producer/worker/both with delayed Redis, all three with required Redis absent, producer completion, local and explicit-fallback batch completion, SIGINT, SIGTERM, and cancellation after real browser navigation.
- Real browser integration: **6 passed** — success, HTTP 500, same-origin redirect, cross-origin redirect blocked before destination, timeout, and cancellation.
- Profile lease tests passed: same-key exclusion, different-key separation, reuse after release, and traversal rejection.
- Docker clean build passed for Linux amd64. The final source was subsequently rebuilt using the already validated dependency layers.
- Container smoke test passed: non-root UID, writable profile/log directories, expected browser executable, sandboxed browser launch, and HTTP success against a server inside that container.
- Docker worker readiness was `healthy` with its dedicated Redis available and exited 0 after SIGTERM. When the earlier disposable Redis was stopped, readiness failed and the worker exited 1, as required.
- Optional Tor image built; `tor --verify-config` passed and effective `--dump-config short` reported `ControlPort 0` and only the configured private-network SOCKS listener/policy. No Tor network traffic was generated for this check.
- Effective default Compose configuration had no published ports, explicit Redis AOF, persistent volumes, and local fallback disabled. Artifact check and `git diff --check` passed.
- Host tests used Node 25.8.0; Docker build/runtime used Node 22. CI was configured but was not executed remotely by this task.

Local evidence logs from this run are under `/tmp/trafficbot-*-tests.log`, `/tmp/trafficbot-docker-final.log`, `/tmp/trafficbot-docker-refresh.log`, `/tmp/trafficbot-container-smoke.log`, and `/tmp/trafficbot-audit-*.json`. These temporary files are not repository artifacts.

## Dependency audit and remaining exposure

A fresh registry audit initially reported **16 findings** across all dependencies (1 critical, 11 high, 3 moderate, 1 low), with **11 runtime-tree findings** (9 high, 2 moderate). Compatible updates reduced both the full and runtime trees to **4 high findings**, all from the same Puppeteer/archive-extraction chain:

- `extract-zip`: [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) and [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3), involving malicious symlink entries during archive extraction.
- `@puppeteer/browsers`, `puppeteer-core`, and `puppeteer` inherit that dependency exposure.

These are production-installed packages, not development-only findings. The vulnerable path is browser archive provisioning; normal session execution does not extract arbitrary downloaded archives. Browser provisioning is now explicit and performed at image build time, but this does not eliminate the supply-chain exposure. `npm audit` still exits nonzero. Do not interpret the test results as a clean security audit.

The compatible Puppeteer release installed is 24.43.1. npm proposes Puppeteer 25.12.0 to remove this chain. An isolated installation confirmed that the current CommonJS/Jest 29 loader fails loading Puppeteer 25's ESM code (`Cannot use import statement outside a module`); its defaultArgs API is also asynchronous. That major migration was not applied blindly. It requires an ESM/test-loader and puppeteer-extra compatibility migration followed by the same browser and Docker checks. No `npm audit fix --force` was used.

## Sensitive data and operational limits

The tracked browser profile contained **one history URL row**. The inspected cookie and saved-login tables contained zero rows. No secret values or history destinations were printed. This confirms browsing-history exposure in repository content; it is not a comprehensive forensic assessment of every profile cache. Index removal does not remove historical commits or existing clones. History rewriting was not performed and requires separate explicit authorization if desired.

Persistent-profile locks are never stolen automatically. After a crash, an operator must confirm that no process still owns the profile before removing a stale lock. Profile continuity across hosts requires the same shared volume. Work remains at least once: a crash or a submission timeout can leave an uncertain outcome; inspect Redis before manually resubmitting.

Navigation policy controls the main frame, not every subresource or embedded frame. Search locale/consent redirects outside the explicit search origins fail closed. Proxy geolocation matching is deliberately rejected until a real proxy-routed measurement is implemented. External IP telemetry remains optional and is not a blacklist service.

Compose grants SYS_ADMIN for Chromium's sandbox as described by Puppeteer's Docker guidance. Operators who cannot accept that container capability need a compatible sandbox runtime. No protection was disabled to satisfy tests. Base OS tags and apt/apk package repositories are not immutable snapshots; npm dependencies and the browser revision are locked.

No publication, deployment, history rewrite, or deletion of user profiles was performed. The user's commits and concurrent workflow edits were preserved.

## Post-audit 2.0.1 fixes (2026-09-26)

Following the primary audit, the following fixes were applied and released in `2.0.1`:
- **Docker cross-platform validation:** `RuntimeProfile.ts` was rejecting Linux ARM (`Linux aarch64`) native platforms when running inside Docker on Apple Silicon Macs (M1/M2/M3) because the default `linux-chrome` profile expects `Linux x86_64`. The generator was relaxed to accept Linux ARM variants for the Linux x86_64 device adapter.
- **Repository cleanup:** Deleted the legacy `useragent/` fingerprint code folder, multiple temporary debugging scripts (`test-goto*.js`, `debug_google.js`, `stress_test.sh`), leftover screenshots, and unused alias scripts that were no longer wired to `package.json` scripts.
- **Publishing & Metadata:** Scoped the package name to `@lucasveneno/trafficbot` in `package.json`, specified the `files: ["dist"]` array, added GitHub `repository` links, and successfully published version `2.0.1` to the public npm registry.
