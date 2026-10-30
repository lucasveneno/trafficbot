const { execSync } = require('child_process')
const fs = require('fs')

try {
  execSync('npx @cyclonedx/cyclonedx-npm --output-format JSON --output-file dist/release-assets/trafficbot-node.cdx.json', { stdio: 'inherit' })
  console.log('Node SBOM generated.')
} catch (e) {
  console.error('Failed to generate Node SBOM:', e)
  process.exit(1)
}
