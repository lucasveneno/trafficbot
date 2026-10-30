# Trafficbot documentation

Start with the root [README](../README.md) for Docker, configuration and worker commands, or the [desktop guide](../apps/desktop/README.md) for native development and packaging.

## Current guides

- [Browser profiles](browser-profiles.md): coherent identity, persistence, supported engines and fingerprint audits.
- [Campaign execution](campaign-execution.md): targets, dispatch, scheduling, shared capacity and proxy pools.
- [Session visibility](session-visibility.md): timelines, linked logs, failure screenshots and retention.
- [Release signing](release-signing.md): separate desktop, worker and OS signing requirements.
- [Contributor instructions](../AGENTS.md): repository boundaries, validation and local-state handling.

## Layout and local state

`src/` holds the controller and execution backend; `apps/desktop/` holds the native UI; `scripts/` holds build/release/verification commands; colocated `*.test.ts` and `*.test.tsx` files cover behavior. Platform updater fixtures also live in `test/integration/`.

Generated outputs belong in `dist/` and the desktop's ignored build directories. Browser state belongs in `sessions/`, logs in `logs/`, and private local tooling/signing files in `.local/`. Keep `.env` private and use `.env.example` as the committed configuration template. Do not delete persisted user sessions or signing keys during routine cleanup.

## Historical reports

[Archived reports](archive/) record findings and implementation claims at the time they were written. Dates, versions, temporary screenshot paths and platform status there may no longer describe the current app. Current guides take precedence.

Release readiness still requires clean-install checks, platform smoke tests and configured signing; a successful macOS development build does not establish those results.
