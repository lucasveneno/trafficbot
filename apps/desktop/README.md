# Trafficbot desktop

React/TypeScript UI with a Tauri shell. It manages an authenticated local controller; separate workers execute browser sessions. Opening `index.html` directly does not run the application.

## Development

From the repository root:

```sh
npm ci
npm ci --prefix apps/desktop
npm run dev:desktop
```

Use Node 22+, Rust and your host's Tauri prerequisites. Start Redis and workers separately; the controller does not start a worker or enqueue sessions automatically. `npm --prefix apps/desktop run dev` runs only the frontend preview, without the native engine bridge.

## Checks and packaging

```sh
npm --prefix apps/desktop run build
npm --prefix apps/desktop test
npm --prefix apps/desktop run lint
npm run build:desktop
```

Packaging requires Bun to compile the controller sidecar. Bundles are written under `src-tauri/target/release/bundle/`, which is ignored. Production updates require signing configuration; local unsigned builds do not verify notarization or Windows/Linux behavior.

## Features and architecture

- Dashboard and worker/queue health.
- Campaign targets, shared concurrency, proxy selection, pause/resume and finite runs.
- Session timelines, attempt history, linked worker events and failure screenshots.
- Profiles, proxies, schedules, settings and fleet update controls.
- Rust lifecycle/ownership handling in `src-tauri/src/engine.rs`; frontend API adapter in `src/services/api.ts`.

See the [documentation index](../../docs/README.md), [campaign guide](../../docs/campaign-execution.md), [session diagnostics](../../docs/session-visibility.md) and [release signing](../../docs/release-signing.md).
