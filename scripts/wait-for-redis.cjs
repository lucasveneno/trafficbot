const Redis = require('ioredis');
async function main() {
  const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 1, retryStrategy: () => null });
  redis.on('error', () => {});
  try { await redis.connect(); if (await redis.ping() !== 'PONG') throw new Error('Unexpected Redis response'); console.log('Redis ready'); }
  finally { redis.disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
