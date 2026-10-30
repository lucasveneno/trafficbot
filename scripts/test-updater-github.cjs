const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

// Usage: node scripts/test-updater-github.cjs <path-to-public-key>

const isWin = process.platform === 'win32';
const ext = isWin ? '.exe' : '';
const binName = \`trafficbot-worker-\${process.platform}-\${process.arch}\${ext}\`;

const workDir = path.join(os.tmpdir(), 'Trafficbot Update GitHub Test');
fs.mkdirSync(workDir, { recursive: true });

const binAPath = path.join(workDir, 'worker-vA' + ext);
fs.copyFileSync(path.join(__dirname, '../dist/workers', binName), binAPath);

const publicKeyPath = process.argv[2];
let publicKey = '';
if (publicKeyPath && fs.existsSync(publicKeyPath)) {
  publicKey = fs.readFileSync(publicKeyPath, 'utf8');
} else {
  console.log('[test] Warning: No public key provided. Will rely on the one compiled in or will fail.');
}

// In this test, we DO NOT start a local server.
// We force the worker to fetch from the actual GitHub URL.
const env = {
  ...process.env,
  // We explicitly set this to use the real GitHub releases URL, ignoring any local fallback
  TRAFFICBOT_UPDATE_BASE_URL: 'https://github.com/lucasveneno/trafficbot/releases/download/v2.0.1',
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
};

if (publicKey) {
  env.RELEASE_PUBLIC_KEY = publicKey;
}

const worker = spawn(binAPath, [], { env, stdio: 'pipe' });
let workerId = '';

worker.stdout.on('data', (d) => {
  const s = d.toString();
  process.stdout.write(s);
  const m = s.match(/"workerId":"([^"]+)"/);
  if (m && !workerId) {
    workerId = m[1];
    console.log(\`[test] Worker started, PID: \${worker.pid} Worker ID: \${workerId}\`);
    
    setTimeout(() => {
      console.log(\`[test] Sending update command to worker A (\${workerId})\`);
      const Redis = require('ioredis');
      const redis = new Redis(env.REDIS_URL);
      
      redis.publish(\`traffic:worker:\${workerId}:commands\`, JSON.stringify({
        type: 'update',
        targetVersion: '2.0.1' // Should re-download or apply 2.0.1
      })).then(() => redis.quit());
      
    }, 5000);
  }
  
  if (s.includes('Update installed successfully') || s.includes('up to date')) {
    console.log('[test] Update routine finished (or already up to date).');
    setTimeout(() => process.exit(0), 2000);
  }
});
worker.stderr.on('data', d => process.stderr.write(d));

worker.on('exit', (code) => {
  console.log(\`[test] Worker process exited with code \${code}\`);
  setTimeout(() => process.exit(0), 5000); // Give time for new process if it restarts
});
