# Veneno Traffic Bot v2

Enterprise-grade stealth traffic generation framework.

## Quick Start (Docker)

1. Clone the repository.
2. Configure `.env` (use `.env.example` as template).
3. Run with Docker Compose:
   ```bash
   docker-compose up --build
   ```

```bash
sudo npm run setup:linux
```

### Windows Setup (CMD/PowerShell)

If running on Windows:

1. Ensure **Chrome for Testing** is installed: `npm run download-browsers`.
2. The bot uses `path.join` for cross-platform file paths.
3. If using persistent sessions, ensure the `SESSIONS_DATA_DIR` path is valid for Windows.
4. To run examples on Windows, use **Git Bash** (recommended) or manually set environment variables in CMD:
   ```cmd
   set NODE_ENV=production&& set MAX_SESSIONS=1&& npm start
   ```

## Manual Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the project:
   ```bash
   npm run build
   ```
3. Run in Production:
   ```bash
   npm start
   ```

To see the bot in action with different pre-set configurations (High Concurrency, Targeted URLs, Human Behavior Simulation, etc.), run the interactive example script:

```bash
npm run run:examples # Choice 7 for Behavior Simulation
```

_Note: In production mode, the bot uses the modern `headless: 'new'` engine and optimized flags for stability._

## Browser Seeding & Visibility

"Seeding" allows the bot to maintain a persistent reputation by saving cookies and cache across runs.

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
2. The bot is architecture-aware and will automatically use optimized stability flags for Apple Silicon.
3. If issues persist, try clearing old session data: `rm -rf sessions/*`.

## Proxy Configuration

The bot supports HTTP/SOCKS proxies for anonymity.

### 1. Using Tor (Docker - Recommended)

The `docker-compose.yml` includes a built-in Tor proxy pool. When running with Docker, the bot is automatically configured to use Tor with rotating IPs.

```bash
docker-compose up
```

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

1. **Run All Tests:**

   ```bash
   npm test
   ```

2. **Run Only Unit Tests (Configuration):**

   ```bash
   npx jest src/infrastructure/config/config.test.ts
   ```

3. **Run Browser Integration Tests:**
   ```bash
   npx jest src/infrastructure/browser/PuppeteerStealthEngine.test.ts
   ```

_Note: Integration tests satisfy system-level dependencies for running a real browser. If you encounter issues on Linux, ensure you've run `sudo npm run setup:linux` first._

## Configuration (.env)

| Variable             | Default                    | Description                                        |
| -------------------- | -------------------------- | -------------------------------------------------- |
| `DEFAULT_URL`        | `https://lucasveneno.com/` | Initial target URL.                                |
| `MAX_SESSIONS`       | `1`                        | Number of parallel browser instances.              |
| `SESSION_TIME`       | `3`                        | Duration per session in minutes (or `random`).     |
| `HEADLESS`           | `true`                     | Run without visible browser.                       |
| `HUMAN_BEHAVIOR`     | `true`                     | Enable mouse movement and scrolling simulation.    |
| `BEHAVIOR_INTENSITY` | `medium`                   | Interaction frequency (`low`, `medium`, `high`).   |
| `PROXY_URL`          | -                          | Proxy server address (e.g., `socks5://127.0.0.1`). |
| `PROXY_PORT`         | -                          | Proxy server port (e.g., `9050`).                  |

## Stealth & Anonymity

The bot implements multiple layers of protection to bypass advanced detection:

1.  **Canvas & WebGL Randomization**: Injects non-destructive noise into canvas data and spoofs GPU vendors/renderers (M1, NVIDIA, Intel).
2.  **Modern User-Agents**: Uses a curated pool of **Chrome 140+ (2025/2026)** strings with randomized build/patch versions.
3.  **Human Behavior Simulation**: Mimics real human interaction through randomized smooth scrolling and cursor movements.
4.  **Hardware Spoofing**: Randomizes `deviceMemory`, `hardwareConcurrency`, and `navigator.platform`.

## Architecture

## Security Features

- **Anti-Fingerprinting**: Integrated `puppeteer-extra-plugin-stealth`.
- **Environment Validation**: Fail-fast configuration with Zod.
- **Resource Management**: Structured logging and graceful error handling.

## License

MIT
