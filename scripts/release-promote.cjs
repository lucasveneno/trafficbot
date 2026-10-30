const { execSync } = require('child_process');
const fs = require('fs');

const version = require('../package.json').version;
console.log(`Promoting release ${version} from beta to stable...`);

// To promote a release without rebuilding, we just update the GitHub Release from prerelease to stable.
try {
  // Check if gh CLI is available
  execSync('gh --version', { stdio: 'ignore' });
} catch (e) {
  console.error('gh CLI is required to promote releases.');
  process.exit(1);
}

try {
  execSync(`gh release edit v${version} --prerelease=false --repo lucasveneno/trafficbot`, { stdio: 'inherit' });
  console.log(`Release v${version} promoted to stable successfully.`);
} catch (e) {
  console.error('Failed to promote release:', e);
  process.exit(1);
}
