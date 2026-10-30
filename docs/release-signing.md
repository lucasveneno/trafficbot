# Trafficbot Release Signing & Key Inventory

Trafficbot leverages multiple cryptographic keys to ensure artifact authenticity and supply chain provenance across the Desktop shell, the Control Server sidecar, and the distributed Worker fleet.

## 1. Tauri Desktop Updater Keys

The Desktop client verifies updates using a Minisign Ed25519 key pair embedded in `tauri.conf.json`.

- **Public Key:** `dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDY2NzRDNzBCMjhFQ0ExMzEKUldBNkVSYnpDa3hFQW0wd055aU5GMDkyOUpwWkY0V2R6eFltWUd2QkloYnZqZEo3aTZsN1pSUWUK` (found in `tauri.conf.json`)
- **Private Key (`TAURI_SIGNING_PRIVATE_KEY`):** Must be provided securely to GitHub Actions.
- **Password (`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`):** Unlocks the private key for signing during CI `tauri build`.

This key is **only** responsible for signing the `.tar.gz` and `.zip` archives of the Desktop application itself, preventing man-in-the-middle attacks on the Desktop update channel.

## 2. Worker Fleet ECDSA Keys

The Worker fleet verifies its own updates (Control Server to Worker, and GitHub Release to Worker) using an ECDSA `prime256v1` key pair.

- **Public Key (`RELEASE_PUBLIC_KEY`):** Bundled into the worker binary or passed via environment to `ReleaseManager`.
- **Private Key (`RELEASE_PRIVATE_KEY`):** Provided securely to GitHub Actions to run `scripts/sign-release.cjs` when publishing `manifest.json.sig`.

This key is **strictly** responsible for verifying `manifest.json` signatures, ensuring that the worker only downloads and executes SHA-256 artifacts cryptographically signed by the Trafficbot publisher. Do not mix this up with the Tauri Minisign key.

## 3. Desktop Application Code Signing & Notarization

To operate without SmartScreen and Gatekeeper warnings:

### macOS
- `APPLE_CERTIFICATE` (p12 base64) / `APPLE_SIGNING_IDENTITY` (Developer ID Application)
- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` (For notarization via `altool` or `notarytool`)

### Windows
- `WINDOWS_SIGNING_CERT` (pfx base64 or path)
- `WINDOWS_SIGNING_PASSWORD`

These keys sign the actual OS executables (the `.app` bundle, `.exe`, and `trafficbot-sidecar`), asserting developer identity to the operating system itself.

## 4. GitHub Artifact Attestations

We utilize `actions/attest-build-provenance` to issue cryptographically signed SLSA provenance attestations tied to the GitHub Actions OIDC identity. These attestations prove that the release artifacts were actually built by the `.github/workflows/release-desktop.yml` workflow and have not been tampered with post-build.
