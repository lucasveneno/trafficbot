const { spawnSync } = require('child_process');

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit' });
  if (res.error || res.status !== 0) {
    console.error(`Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(1);
  }
}

console.log('Generating worker binaries, manifest, and signing...');
run('node', ['scripts/build-workers.cjs']);
run('node', ['scripts/sign-release.cjs']);

console.log('Verifying...');
run('node', ['scripts/release-verify.cjs']);
console.log('Dry run completed successfully.');
