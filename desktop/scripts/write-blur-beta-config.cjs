const fs = require('node:fs');
const path = require('node:path');

function readBuildSettings(env = process.env) {
  const version = env.BATCH_BETA_VERSION;
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-beta\.(0|[1-9]\d*)$/.test(version || '')) {
    throw new Error('BATCH_BETA_VERSION must be a beta version, for example 1.0.6-beta.1.');
  }
  let url;
  try { url = new URL(env.BATCH_BLUR_AI_URL); } catch {
    throw new Error('BATCH_BLUR_AI_URL must be an HTTPS staging base URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BATCH_BLUR_AI_URL must be an HTTPS staging base URL without credentials, path, query, or fragment.');
  }
  return { version, manifest: { environment: 'staging', blurApiUrl: url.origin } };
}

if (require.main === module) {
  const { manifest } = readBuildSettings();
  fs.writeFileSync(path.join(__dirname, '..', 'blur-beta.json'), JSON.stringify(manifest, null, 2) + '\n');
}

module.exports = { readBuildSettings };
