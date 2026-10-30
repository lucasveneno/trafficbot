# Veneno Traffic Bot v2

Browser session automation with persistent, internally consistent browser profiles.

## Desktop campaign management

Install dependencies with `npm ci` and `npm ci --prefix apps/desktop`, then use `npm run dev:desktop` (requires Rust and the Tauri platform prerequisites). Start Redis and execution workers separately. Campaigns support multiple targets, shared concurrency limits, finite runs, pause/resume and selected proxy pools. See [campaign execution](docs/campaign-execution.md) for behavior, limits and verification commands.

## Quick Start (Docker)

Requires Docker with Compose support for optional `env_file` entries. Browser installation and system libraries are handled inside the image; you do not need to run `setup:linux` on the Docker host.

1. Clone the repository and enter its directory.
2. Copy `.env.example` to `.env` if you do not already have a configuration file.
3. Set `DEFAULT_URL` to an HTTP(S) target you control that is reachable from the container. The default `http://127.0.0.1:8080/` is a placeholder; no target web server is included. Container loopback refers to the container itself. Remove any conflicting `URL` setting, since that alias takes precedence over `DEFAULT_URL`.
4. Start the bot and Redis:

   ```bash
   docker compose up --build
   ```

The default `BOT_ROLE=both` enqueues one batch and keeps a worker running. No proxy is enabled by default. Stop the services with `docker compose down`; named volumes retain profiles, logs, and Redis data. Keep `HEADLESS=true` in the supplied container, which does not configure a graphical display.

## Manual Setup

Requires Node.js 22 or later and a supported Chrome environment. Run these commands from the repository directory:

```bash
npm ci
npm run download-browsers
npm run build
```

Copy `.env.example` to `.env` if needed, set your target URL, and choose an execution role. For a finite local batch without Redis:

```env
BOT_ROLE=local
DEFAULT_URL=http://127.0.0.1:8080/
MAX_SESSIONS=1
```

Start your own target server at that address, or replace it with your reachable target, then run:

```bash
npm start
```

For `producer`, `worker`, or `both`, start Redis separately and set `REDIS_URL`. Those roles require Redis unless `both` explicitly enables startup fallback. Package installation does not provision a browser; `download-browsers` installs the Chrome revision expected by the lockfile. Chromium sandbox, web security, and site isolation remain enabled.

On a Debian/Ubuntu host missing Chrome system libraries, the provided setup script installs them with elevated privileges:

```bash
sudo npm run setup:linux
```

### Windows Setup

Run installation, browser provisioning, and build commands above before `npm start`. Configure `.env` rather than using POSIX-style inline environment assignments. Ensure `SESSIONS_DATA_DIR` points to a writable directory. The interactive example script and dedicated integration-test npm scripts use POSIX shell syntax; run them in a compatible environment such as Git Bash or WSL.

Windows execution natively supports both Google Chrome and Microsoft Edge if they are installed on the host machine. The worker dynamically detects these installations upon startup and advertises them to the distributed queue. To start a native Windows worker, use:
```bash
npm run worker
```

### Advanced Worker Tooling (Zero-Dependency Binaries)

Trafficbot uses Bun's Single-Executable Application compiler to generate standalone binaries for workers. This allows you to distribute workers to external Windows, Linux, and macOS host machines *without* needing to install Node.js, NPM, or manage the repository on the remote machine.

1. Install `bun` locally.
2. Run the compilation script for your target platform:
   ```bash
   npm run build:worker:linux     # Generates dist/trafficbot-worker-linux
   npm run build:worker:windows   # Generates dist/trafficbot-worker-windows.exe
   npm run build:worker:macos     # Generates dist/trafficbot-worker-macos
   ```
3. Copy the generated binary and your `.env` file to the target machine.
4. Execute the binary directly. Puppeteer will automatically manage and download Chrome locally if it is missing.

### Interactive examples

```bash
npm run run:examples
```

The legacy examples select distributed roles and therefore need Redis. Some select external targets or search engines; inspect their settings before running them. Use the explicit `BOT_ROLE=local` configuration above for a finite local batch without Redis.

## Browser Seeding & Visibility

Persistent profiles retain browser state, including cookies and cache, across runs. They do not guarantee reputation, anonymity, or detection avoidance.

### 1. Seeding (Persistent Profiles)

Enable `PERSISTENT_SESSIONS` to save browser state to a local directory:

```env
PERSISTENT_SESSIONS=true
SESSIONS_DATA_DIR=./sessions
```

### 2. Visibility (Headed Mode)

Set `HEADLESS=false` to see the browser window while the bot is running (not recommended for large scales):

```env
HEADLESS=false
```

To run a guided seeding session immediately:

```bash
npm run run:examples # Select Option 6
```

### 3. macOS Stability (Apple Silicon)

If you encounter "crash info version 7" or "browser launch failed" on macOS:

1. Ensure you have the **native ARM64** browser: `npm run download-browsers`.
2. Browser downloads automatically select the host architecture.
3. If a persistent profile is locked, stop its owning browser and inspect the lock before manually removing it. Never delete profiles as an automatic recovery step.

## Proxy Configuration

The bot supports HTTP, HTTPS, and SOCKS5 browser proxies. Set `PROXY_URL` to a host, optionally prefixed with its scheme, and put the port separately in `PROXY_PORT` (1–65535). Do not embed credentials, a port, or a path in `PROXY_URL`. HTTP(S) authentication requires both `PROXY_USER` and `PROXY_PASS`; authenticated SOCKS5 is unsupported.

### 1. Optional Tor proxy (Docker)

`docker-compose.yml` provides a single optional SOCKS5 proxy, not an automatically rotating proxy pool. Add these settings to `.env`:

```env
PROXY_URL=socks5://tor-proxy
PROXY_PORT=9050
PROXY_USER=
PROXY_PASS=
```

Start Tor first and inspect its logs for completed bootstrap:

```bash
docker compose --profile tor up -d --build tor-proxy
docker compose logs -f tor-proxy
```

Once bootstrap completes, leave the log view and start the bot:

```bash
docker compose --profile tor up --build traffic-bot
```

Compose waits for Redis health but does not wait for Tor circuit readiness. The proxy has no published host ports, management listener, or default credentials. Stop this optional service with `docker compose --profile tor down`.

### 2. Using Local Tor (macOS - Manual Setup)

To use Tor directly on your Mac without Docker:

1. **Install Tor via Homebrew**:
   ```bash
   brew install tor
   ```
2. **Start the Tor service**:
   ```bash
   brew services start tor
   ```
3. **Configure `.env`**:
   ```env
   PROXY_URL=socks5://127.0.0.1
   PROXY_PORT=9050
   ```

_Note: The bot supports SOCKS5 natively. Ensure you use the `socks5://` prefix._

## Testing

The project includes a comprehensive test suite using Jest.

1. **Run Unit Tests (integration suites are explicitly skipped):**

   ```bash
   npm test
   ```

2. **Run Only Unit Tests (Configuration):**

   ```bash
   npx jest src/infrastructure/config/config.test.ts
   ```

3. **Run Browser Integration Tests:**
   ```bash
   npm run test:browser
   ```

_Browser integration tests require an installed browser and its system libraries; they do not install these dependencies. See the complete verification commands below for Redis and process-lifecycle tests._

## Configuration (.env)

| Variable              | Default                    | Description                                        |
| --------------------- | -------------------------- | -------------------------------------------------- |
| `DEFAULT_URL`         | `http://127.0.0.1:8080/` | Initial target URL.                                |
| `MAX_SESSIONS`        | `1`                        | Batch size for producers; worker concurrency; local batch size.              |
| `SESSION_TIME`        | `3`                        | Finite positive minutes, including fractions; `random` selects 1–5 whole minutes.     |
| `HEADLESS`            | `true`                     | Run without visible browser.                       |
| `HUMAN_BEHAVIOR`      | `true`                     | Enable mouse movement and scrolling simulation.    |
| `BEHAVIOR_INTENSITY`  | `medium`                   | Interaction frequency (`low`, `medium`, `high`).   |
| `PERSISTENT_SESSIONS` | `false`                    | Save browser profile, cookies, and cache.          |
| `SESSIONS_DATA_DIR`   | `./sessions`               | Directory to store persistent browser profiles.    |
| `PROXY_URL`           | -                          | Proxy server address (e.g., `socks5://127.0.0.1`). |
| `PROXY_PORT`          | -                          | Proxy server port (e.g., `9050`).                  |
| `BOT_ROLE`            | `both`                     | Execution role (`local`, `producer`, `worker`, `both`).     |
| `REDIS_URL`           | `redis://127.0.0.1:6379`   | Redis connection URL for distributed queue.        |
| `LOCAL_FALLBACK` | `false` | Allow only `both` to run locally if Redis is unavailable at startup; forced off by Compose. |
| `REDIS_READY_TIMEOUT_MS` | `15000` | Redis startup and queue-operation deadline in milliseconds. |
| `SHUTDOWN_TIMEOUT_MS` | `30000` | Overall graceful-shutdown deadline in milliseconds. |
| `HEALTH_PORT` | `3000` | Loopback readiness HTTP port; use distinct ports for multiple host processes. |
| `EXTERNAL_IP_CHECK` | `false` | Opt into direct host IP/country telemetry; skipped when using a proxy. |
| `ORGANIC_SEARCH`      | `false`                    | Enable search engine navigation before target.     |
| `SEARCH_KEYWORDS`     | -                          | Comma-separated list for organic search.           |
| `REFERRER_POOL`       | -                          | Comma-separated custom referrers.                  |
| `REFERRALS` | `no` | Set `yes` to use the built-in referrer pool. A nonempty custom pool also enables referral simulation. Direct sessions otherwise send no synthetic referrer. |
| `MATCH_GEOLOCATION`   | `false`                    | Align locale/timezone using a validated lookup through the configured browser proxy. |
| `BROWSER_PROFILE` | `native` | Chrome preset on the actual host OS; see browser profile documentation. |
| `PROXY_LOCATION_URL` | - | HTTPS JSON country/timezone endpoint, requested through the browser proxy when matching is enabled. |
| `GRANT_GEOLOCATION` | `false` | Grant only the configured target access to coordinates returned by the proxy lookup. Requires matching. |

## Distributed Architecture & Scaling

Distributed execution uses a centralized **Redis** task queue with separate producers and workers.

### Roles:

- **Producer**: Generates traffic sessions and pushes them to the queue. Does not launch browsers.
- **Worker**: Listens to the queue and executes browser sessions. Optimized for high-session nodes.
- **Both** (Default): Starts a worker, enqueues one batch, and remains a service.
- **Local**: Runs a finite sequential batch without Redis and exits after cleanup.

Producer exits after enqueueing; worker remains a service. All distributed roles wait up to `REDIS_READY_TIMEOUT_MS` (default 15000) for Redis. Required infrastructure failures exit nonzero. Only `both` with `LOCAL_FALLBACK=true` may select local execution at startup. A later Redis disconnect suspends readiness and reconnects; it never silently switches to local execution. Queue submissions have a deadline; if it expires, the enqueue outcome may be unknown, so inspect the queue before resubmitting.

### Deployment Scaling:

1. **Infrastructure**: Deploy one Redis instance (standard in `docker-compose.yml`).
2. **Producers**: Deploy one instance with `BOT_ROLE=producer`.
3. **Workers**: Deploy as many instances as needed with `BOT_ROLE=worker`. Each worker will pull tasks from the shared queue according to its `MAX_SESSIONS` capacity and its OS/Browser capabilities.
   - **Linux Workers**: Run in Docker, advertising bundled Chromium.
   - **Windows Native Workers**: Run on host machines, dynamically detecting installed Chrome or Edge executables.
   - Tasks are automatically routed to the correct platform queue (`traffic-sessions:linux`, `traffic-sessions:windows`) based on the requested `BROWSER_PROFILE`.

## Browser identity

Every session uses a validated `BrowserProfile`. UA and client hints describe the installed Chrome version and host OS. Viewport, screen, DPR, locale and timezone come from the same profile. Hardware and GPU are observed from Chrome; canvas, audio, fonts and permissions keep native behavior. Independent fingerprint randomness and stealth plugin patches have been removed.

Persistent sessions save `browser-profile.json` alongside Chrome state, preserving identity across launches. An incompatible host/device or changed proxy geography fails explicitly. Actual browser upgrades update the version fields without replacing user preferences.

The catalog models Chrome, Edge, Firefox, Safari and mobile devices, but the executable adapter currently runs **native desktop Chrome only**. Linux Chrome cannot become macOS Safari or an iPhone through headers. Other native adapters remain future work. Automation remains observable; consistency is not a promise of anonymity or an external detection score.

See [browser profile architecture and audit guide](docs/browser-profiles.md) for presets, proxy matching, signal coverage, limitations, and opt-in BrowserLeaks, AmIUnique, Pixelscan and FingerprintJS commands.

## Observability & Health

- **Real-time CLI Dashboard**: Live feedback on active sessions, success rates, and average durations directly in your terminal.
- **Optional host telemetry**: `EXTERNAL_IP_CHECK=true` requests host IP/country over HTTPS with a 3-second deadline and a 5-minute cache. Disabled by default and skipped for proxy sessions; it is not a proxy reputation or blacklist check.
- **Structured Logging**: JSON-ready logs via Winston for integration with cloud observability platforms.

## Architecture

The Veneno Traffic Bot follows a modular, decoupled architecture:

- **Orchestrator**: Manages the session lifecycle and delegates actions to the engine.
- **Engine**: Handles browser initialization and low-level interactions (Puppeteer-based).
- **Behavior Layer**: `BehaviorService` controls interaction timing and navigation.
- **Profile Layer**: `browser/profile/` validates browser identity, native capabilities, geography and persistent preferences.
- **Observability Layer**: `MetricsService` and `ReputationService` provide real-time monitoring.
- **Queue Layer**: `BullMQ` (Redis-backed) manages distributed tasks across nodes.

## Security Features

- **Browser protections**: Chromium sandbox, web security, and site isolation remain enabled.
- **Environment Validation**: Fail-fast configuration with Zod.
- **Resource Management**: Structured logging and graceful error handling.
- **Contextual Intelligence**: DOM-aware weighted link prioritization.


## Reliability and scope

`SIGTERM` and `SIGINT` stop readiness, stop intake, and allow worker drain for half of `SHUTDOWN_TIMEOUT_MS` (default 30 seconds). Remaining browser work is cancelled, then queue/Redis resources and monitoring timers are closed. A hard deadline exits nonzero; unfinished distributed jobs remain recoverable by BullMQ. Delivery is at least once, so a retry may repeat a partially executed session. Failed jobs retain their payload and error in Redis after three attempts with exponential 5-second backoff. Treat Redis as trusted infrastructure: queued jobs can choose targets and proxies.

Both local and queued sessions use the same runtime-validated contract, including intensity, proxy, persistent profile key, and duration. `random` resolves once to 1–5 minutes when the job is created, so retries retain the same duration. Profiles use `session-N` under the worker's `SESSIONS_DATA_DIR`; retries and later batches reuse them. Atomic lock directories reject concurrent use on the same filesystem, including shared volumes. Separate workers without a shared volume have separate profiles. Crash leftovers require manual inspection; locks are never stolen automatically.

Navigation compares parsed origins (scheme, hostname, effective port). Same-origin redirects are permitted; cross-origin main-frame requests are aborted before fetching the destination. Organic search explicitly permits Google/Bing/DuckDuckGo origins until the target origin is reached, then closes that exception. Locale/consent redirects outside those origins fail closed. Subresources and embedded frames may still load third-party assets: this is a top-level navigation policy, not a network firewall. Popups are closed. Contextual navigation awaits the response; HTTP 4xx/5xx and navigation timeouts fail the session. Metrics are finalized once, after cleanup, and classify HTTP/timeout/other failures.

## Deployment and verification

Compose forwards `.env` to the bot; fixed container settings override Redis address, profile directory, production mode, and disable local fallback. Use a recent Compose supporting optional `env_file` entries. Redis, proxy, and management ports are not published. Redis uses an AOF volume; profiles and logs have persistent volumes. The container runs as the unprivileged `node` user. Chrome's sandbox needs kernel/container support: Compose supplies `SYS_ADMIN` as described in [Puppeteer's Docker guidance](https://pptr.dev/guides/docker). If this capability is not acceptable, use a compatible sandbox runtime; do not add `--no-sandbox`. Docker targets Linux amd64 (emulated on Apple Silicon).

Readiness is HTTP on container loopback `HEALTH_PORT` (3000): 503 during startup or Redis outages, and 200 when the configured execution role is ready. The listener closes during shutdown, so probes may receive a connection failure. It checks service/queue readiness, not external website health. Producer and local modes exit normally on completion and are not restart loops. Worker/both can be restarted by an operator's service policy. Compose waits for Redis health before starting the bot. Optional management access must use an explicit loopback binding with operator-supplied authentication; no management UI ships by default.

```bash
npm ci
npm run download-browsers
npm run build
npm run lint
npm test -- --runInBand
npm run check:artifacts
npm run test:browser
# Dedicated disposable Redis only; tests clear their own queue.
docker run --rm -d --name trafficbot-test-redis -p 127.0.0.1:16389:6379 redis:7.4-alpine
npm run test:redis
npm run test:lifecycle
docker stop trafficbot-test-redis
docker build --no-cache --platform linux/amd64 -t trafficbot:test .
```

Browser tests use only a controlled local HTTP server. Browser/Redis/process suites are explicitly skipped in the default unit run; their dedicated commands fail on missing infrastructure, rather than converting setup failures to passes. CI runs all three integration suites; browser and process-lifecycle tests execute inside the built container as the `node` user with the browser sandbox enabled. Legacy fingerprint/search demo scripts may contact external sites and are not verification gates. Use them only intentionally against authorized targets.

Generated profiles, dependencies, logs, and environment files must not be committed; the lockfile must be tracked. `check:artifacts` runs in CI. Historical tracked profile data remains in Git history; removing it from the index does not erase prior exposure.

## Dependency audit

```bash
npm audit --omit=dev
```

The project audit on 2026-09-25 reported four high-severity package findings in the Puppeteer/archive-extraction dependency chain. This is a production dependency exposure during browser provisioning, even though ordinary sessions do not extract browser archives. Compatible updates were applied; the proposed Puppeteer 25 migration still requires CommonJS/Jest compatibility work. The browser profile update removes the unused stealth plugin dependencies.

CI saves the current report as the `runtime-dependency-audit` artifact. Its audit step uses `continue-on-error: true`: npm can return exit code 1 for vulnerabilities while the overall workflow passes. A green workflow therefore does not mean the dependency audit is clean. Inspect the uploaded report for the findings from that specific run; their number can change as advisories are updated.

## License

MIT
## Session visibility

The desktop session inspector shows worker execution timelines, attempt history, failure summaries, and on-demand failure screenshots. Session and campaign links open searchable worker events in Logs. See [session visibility](docs/session-visibility.md) for retention and troubleshooting.
