const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');

// We need an ephemeral key for the test
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'prime256v1',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const isWin = process.platform === 'win32';
const ext = isWin ? '.exe' : '';
const binName = \`trafficbot-worker-\${process.platform}-\${process.arch}\${ext}\`;

const workDir = path.join(os.tmpdir(), 'Trafficbot Update Test');
fs.mkdirSync(workDir, { recursive: true });

const binAPath = path.join(workDir, 'worker-vA' + ext);
const binBPath = path.join(workDir, 'worker-vB' + ext);
const manifestPath = path.join(workDir, 'manifest-vB.json');

// Copy binary A and B
fs.copyFileSync(path.join(__dirname, '../dist/workers', binName), binAPath);
fs.copyFileSync(path.join(__dirname, '../dist/workers', binName), binBPath);

// Generate manifest B
const sha256 = crypto.createHash('sha256').update(fs.readFileSync(binBPath)).digest('hex');
const size = fs.statSync(binBPath).size;
const manifestB = {
  version: '2.0.2-test',
  protocolVersion: 1,
  compatibility: 'compatible',
  releasedAt: new Date().toISOString(),
  assets: {
    [\`\${process.platform}-\${process.arch}\`]: {
      file: 'worker-vB' + ext,
      size,
      sha256
    }
  }
};
fs.writeFileSync(manifestPath, JSON.stringify(manifestB, null, 2));

// Sign manifest B
const sign = crypto.createSign('SHA256');
sign.update(JSON.stringify(manifestB, null, 2));
sign.end();
const signature = sign.sign(privateKey, 'base64');
fs.writeFileSync(manifestPath + '.sig', signature);

const server = http.createServer((req, res) => {
  if (req.url === '/manifest.json') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.end(fs.readFileSync(manifestPath));
  } else if (req.url === '/manifest.json.sig') {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end(fs.readFileSync(manifestPath + '.sig'));
  } else if (req.url === '/' + manifestB.assets[\`\${process.platform}-\${process.arch}\`].file) {
    res.writeHead(200, {'Content-Type': 'application/octet-stream'});
    res.end(fs.readFileSync(binBPath));
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, '127.0.0.1', () => {
  const port = server.address().port;
  console.log(\`[test] Server listening on \${port}\`);
  
  const env = {
    ...process.env,
    TRAFFICBOT_UPDATE_BASE_URL: \`http://127.0.0.1:\${port}\`,
    TRAFFICBOT_ALLOW_HTTP_UPDATE: '1',
    RELEASE_PUBLIC_KEY: publicKey,
    REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
  };

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
        
        // Spawn redis-cli to send command (simple for now, assuming redis-cli is available or we can use fetch)
        // Wait, fetch to redis is not possible. We should use a small node script or just ioredis
        const Redis = require('ioredis');
        const redis = new Redis(env.REDIS_URL);
        
        redis.publish(\`traffic:worker:\${workerId}:commands\`, JSON.stringify({
          type: 'update',
          targetVersion: '2.0.2-test'
        })).then(() => redis.quit());
        
      }, 5000);
    }
  });
  
  worker.stderr.on('data', d => process.stderr.write(d));

  worker.on('exit', (code) => {
    console.log(\`[test] Worker A process exited with code \${code}\`);
    
    // In POSIX, replacer runs and starts the new binary.
    // In Windows, powershell script does the same.
    // Wait a few seconds for the new process to start and then trigger rollback.
    setTimeout(async () => {
      // Find new worker process.
      // We can just broadcast rollback to all workers for test purposes, or use ioredis to find keys.
      const Redis = require('ioredis');
      const redis = new Redis(env.REDIS_URL);
      const keys = await redis.keys('traffic:worker:*');
      const stateKeys = keys.filter(k => !k.includes('commands'));
      let newWorkerId = '';
      for (const k of stateKeys) {
         const data = await redis.get(k);
         if (data && data.includes('2.0.2-test')) {
            newWorkerId = k.split(':')[2];
            break;
         }
      }
      
      console.log(\`[test] Found new worker ID: \${newWorkerId}\`);
      if (!newWorkerId) {
         console.error('Failed to find new worker');
         process.exit(1);
      }
      
      const prevExists = fs.existsSync(binAPath + '.previous.json');
      console.log(\`[test] .previous exists: \${prevExists}\`);
      if (!prevExists) {
        console.error('Rollback metadata missing');
        process.exit(1);
      }
      
      console.log(\`[test] Sending rollback command\`);
      await redis.publish(\`traffic:worker:\${newWorkerId}:commands\`, JSON.stringify({ type: 'rollback' }));
      
      setTimeout(async () => {
         const finalKeys = await redis.keys('traffic:worker:*');
         const finalStateKeys = finalKeys.filter(k => !k.includes('commands'));
         let finalWorkerId = '';
         for (const k of finalStateKeys) {
            const data = await redis.get(k);
            // After rollback it should be 2.0.1 again
            if (data && data.includes('2.0.1')) {
               finalWorkerId = k.split(':')[2];
               break;
            }
         }
         console.log(\`[test] Rollback final worker ID: \${finalWorkerId}\`);
         if (!finalWorkerId) {
            console.error('Failed to find rolled-back worker');
            process.exit(1);
         }
         
         console.log('[test] SUCCESS');
         process.exit(0);
      }, 10000);
      
    }, 10000);
  });
});
