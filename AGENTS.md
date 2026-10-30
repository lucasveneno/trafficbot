# Working on Trafficbot

## Repository map

- `src/controller.ts`: management process, authenticated loopback API and desktop control.
- `src/main.ts`: producer/worker entry point and lifecycle handling.
- `src/application/`: API, campaigns, scheduling, proxy allocation, fleet updates and session orchestration.
- `src/domain/`: typed contracts, entities and worker compatibility protocol. Desktop-importable contracts must remain free of runtime backend dependencies.
- `src/infrastructure/`: browser engines/profiles, Redis queues, telemetry, worker discovery and updates.
- `apps/desktop/`: React UI and Tauri shell; dependencies and lockfile are separate from the root project.
- `scripts/`: reproducible checks, integration fixtures, builds and release tooling.
- `docs/`: current guides; `docs/archive/` contains historical findings, not current release guarantees.

## Implementation rules

- Preserve unrelated local changes. Do not add generated binaries, browser profiles, logs or secrets to commits.
- Derive browser identity from one `BrowserProfile`. Persistent sessions reuse their stored profile; never independently randomize fingerprint signals.
- Respect worker/browser/platform compatibility, profile leases and shared campaign/proxy capacity. Capacity contention must defer jobs without consuming execution retries.
- Keep controller startup separate from worker execution. Never enqueue traffic merely by opening the desktop app.
- Keep management authenticated and bound to loopback. Public responses and worker telemetry must exclude credentials, raw job payloads and target query strings.
- Shutdown must respect pending sessions and ownership; leave externally managed controllers running.
- Failure diagnostics are best effort, bounded and authenticated. Do not replace execution errors with telemetry errors.
- Validate behavior against local HTTP/proxy fixtures. External fingerprint sites and production targets require explicit task scope.

## Development and validation

Use Node 22+; install with `npm ci` and `npm ci --prefix apps/desktop`. Native packaging also needs Bun, Rust and the host Tauri prerequisites.

```sh
npm run build
npm run lint
npm run check:artifacts
npm --prefix apps/desktop run build
npm --prefix apps/desktop test
```

Backend tests include Redis-dependent suites. Set `REDIS_URL` to a disposable Redis instance before `npm test -- --runInBand`. Do not use a production database. Opt-in suites include `test:control`, `test:browser`, `test:redis`, `test:campaigns`, `test:lifecycle` and `test:android`; inspect their environment requirements before running them. `scripts/test-desktop-integration.cjs` requires an **empty** dedicated `REDIS_TEST_URL` database and local Chrome, and performs destructive queue cleanup in that database.

Run checks appropriate to the change. Document unverified platforms and signing limitations; a local unsigned build is not evidence of a production-ready signed release. Keep runtime changes and documentation aligned.

## Local state and signing

`.env`, `sessions/`, `logs/`, `.local/`, build outputs and dependency directories are private/generated state. Local updater keys may be kept under `.local/signing/`; preserve them and never print their contents. CI receives signing material through secrets. The public updater key lives in `apps/desktop/src-tauri/tauri.conf.json`.

Do not push, tag or publish unless authorized by the user. Check staged paths before a commit and use `npm run check:artifacts` to catch generated or sensitive files.
