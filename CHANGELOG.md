## [2.1.0] - 2026-10-30

- **Desktop Control Center:** Add Tauri + React desktop management application (`apps/desktop`) with authenticated loopback Control API, live WebSocket telemetry, and managed controller sidecar.
- **Durable Campaigns & Scheduling:** Add Redis-backed campaign execution, shared campaign/proxy capacity leases, circuit breakers, proxy pool allocator, and cron schedule runner.
- **Worker Session Timelines & Diagnostics:** Add structured session timelines, failure classification, bounded screenshot/DOM diagnostics, and real-time log streaming.
- **Fleet Enrollment & Signed Self-Updates:** Add worker enrollment tokens, ECDSA-signed release manifests, atomic binary replacement, and automatic rollback across Linux, Windows, and macOS.
- **CI & Packaging Hardening:** Add cross-platform Linux, Windows, and macOS verification workflows, desktop test gates, and clean npm package file filtering.

## [2.0.1] - 2026-09-26

- **Publishing & Metadata:** Scope package to `@lucasveneno/trafficbot`, add Github repository link, and set `files` to `dist` for public npm registry release.
- **Docker Apple Silicon support:** Relax `RuntimeProfile.ts` validation to correctly allow Linux ARM environments to use the `linux-chrome` device adapter under Docker.
- **Cleanup:** Remove legacy `useragent/` fingerprint folder, debug logs, leftover debugging scripts, and unused files.

- Honor disabled referral simulation: direct sessions no longer inject random external referrers, which caused headed Chrome to block local navigation during live verification.
- Force persistent Chrome profiles to start with a controlled blank tab while preserving other browser preferences, preventing restored tabs from requesting sites before identity and navigation policy initialization.
- Bound reading, scrolling and contextual navigation by the session deadline so short sessions do not substantially overrun their configured duration.

- Replace independently randomized fingerprints and stealth plugin overrides with validated BrowserProfile values derived from the installed Chrome and native hardware.
- Add typed device catalogs, coherent UA/client hints, explicit stable-version providers, locale/timezone policy, and optional browser-proxied location lookup.
- Persist identity alongside Chrome cookies/storage/cache, rejecting incompatible environments or changed proxy geography.
- Add profile consistency, persistence, proxy transport, rendering, and header tests plus opt-in external fingerprint audit reports. Document native-runtime limitations.

- Separate reproducible package installation from browser provisioning; run Docker as an unprivileged user with writable volumes and role readiness.
- Await bounded Redis readiness, preserve reconnection, validate queue payloads, retain failed jobs, and propagate session errors after cleanup.
- Share session settings across modes; resolve random duration once and lock persistent profiles against concurrent writers.
- Restore browser sandbox/web security/site isolation; enforce exact-origin navigation and inspect HTTP responses.
- Handle SIGINT/SIGTERM, bounded worker drain/cancellation, finite local/producer exit, and single-count metrics.
- Remove infrastructure host ports and default credentials; configure optional Tor explicitly without management listeners.
- Make host IP telemetry opt-in, bounded, cached, and correctly labeled; reject unsupported proxy geolocation matching.
- Untrack generated dependencies/profiles without deleting local data, retain lockfile, and add artifact and CI verification gates.
- Update compatible dependencies; add ESLint and production-schema, Redis, lifecycle, browser, telemetry, and profile-lock regression tests.

# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2026-03-02

### Added

- New Layered Architecture (Domain, Application, Infrastructure, Interface).
- TypeScript support with strict type checking.
- Zod-based configuration validation with environment variable support.
- Structured JSON logging using Winston.
- `PuppeteerStealthEngine` integration for advanced bot detection bypass.
- User-Agent rotation service.
- Multi-stage production-ready Dockerfile.
- `docker-compose.yml` with Tor proxy pool integration.
- `.env.example` for secure configuration management.
- Automated browser binary provisioning via `scripts/download-browsers.ts`.
- Bare-metal Linux system dependency automation via `scripts/setup-linux.sh`.
- **Advanced Fingerprinting**: Dynamic WebGL/Canvas randomization and hardware spoofing.
- **Human Behavior Simulation**: Smooth scrolling and randomized mouse movements.
- **Modern UA Module**: Curated Chrome 140+ database with auto-randomization.

### Changed

- Refactored entire codebase from monolithic `index.js` to modular TypeScript structure.
- Migrated browser automation engine from `nightmare` (obsolete) to `puppeteer`.
- Updated concurrency model to support scalable, independent browser sessions.
- Improved security by removing CLI-passed secrets and enabling non-privileged Docker users.
- Redesigned navigation logic to include stealth-focused behavioral patterns.

### Removed

- Legacy `index.js` monolithic script.
- Committed `node_modules` (anti-pattern).
- Obsolete `nightmare` and `minimist` dependencies.
- Insecure certificate error ignoring by default.
- Unstructured `log.txt` and `_config.yml`.
