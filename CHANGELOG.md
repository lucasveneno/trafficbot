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
