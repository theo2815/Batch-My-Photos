const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { app, net } = require('electron');
const config = require('./config');
const authService = require('./authService');
const { isPathAllowedAsync } = require('./securityManager');
const blurDetectionService = require('./blurDetectionService');
const { BLUR_AI_TIMEOUT_MS } = require('./constants');

function sessionOwner(token) {
  try {
    const { sub } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(sub)) return sub;
  } catch (_error) { /* Invalid or missing session. */ }
  throw new Error('Sign in before submitting an example.');
}

async function submitBlurExample({ folderPath, fileName, label } = {}) {
  if (!config.features.BLUR_BETA_ENABLED) throw new Error('Blur beta feedback is unavailable.');
  if (!['sharp', 'blurry'].includes(label)) throw new Error('Choose a sharp or blurry label.');
  if (typeof folderPath !== 'string' || !path.isAbsolute(folderPath) ||
      typeof fileName !== 'string' || !fileName || /[\\/:\0]/.test(fileName) ||
      fileName === '.' || fileName === '..' || path.basename(fileName) !== fileName) {
    throw new Error('Choose a selected image.');
  }
  let realFile;
  try {
    const selectedFile = path.join(folderPath, fileName);
    const realFolder = await fs.realpath(folderPath);
    realFile = await fs.realpath(selectedFile);
    if (path.dirname(realFile) !== realFolder || (await fs.lstat(selectedFile)).isSymbolicLink() ||
        !(await isPathAllowedAsync(realFile)) || !(await fs.stat(realFile)).isFile()) {
      throw new Error('Invalid selection');
    }
  } catch (_error) {
    throw new Error('Choose a selected image from a registered folder.');
  }
  if (!blurDetectionService.getCachedBlurResult(folderPath, fileName)) {
    throw new Error('Select an analyzed image.');
  }
  let token = authService.getStoredSession();
  const owner = sessionOwner(token);
  const jpeg = await blurDetectionService.prepareImageForUpload(realFile);
  if (!jpeg) throw new Error('The selected image could not be prepared.');
  if (jpeg.length > 2097152) throw new Error('The prepared image exceeds 2 MB.');
  const result = blurDetectionService.getCachedBlurResult(folderPath, fileName, jpeg);
  if (!result) throw new Error('Select an analyzed image. Run analysis again if it changed.');

  // The parsed sub only names the object; Supabase verifies the JWT and enforces ownership via RLS.
  const objectName = `${owner}/${crypto.randomUUID()}.jpg`;
  const storagePath = '/storage/v1/object/blur-beta-feedback';
  let refreshed = false;
  async function request(endpoint, method, body, contentType = 'application/json') {
    const send = () => net.fetch(`${config.urls.SUPABASE_URL}${endpoint}`, {
      method,
      headers: { apikey: config.urls.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`,
        'Content-Type': contentType },
      body,
      signal: AbortSignal.timeout(BLUR_AI_TIMEOUT_MS),
    });
    let response = await send();
    if (response.status === 401 && !refreshed) {
      refreshed = true;
      const refresh = await authService.refreshAccessToken();
      if (refresh.refreshed && sessionOwner(refresh.accessToken) === owner) {
        token = refresh.accessToken;
        response = await send();
      }
    }
    return response;
  }

  try {
    const uploaded = await request(`${storagePath}/${objectName}`, 'POST', jpeg, 'image/jpeg');
    if (!uploaded.ok) throw new Error('Upload failed');
    const saved = await request('/rest/v1/blur_beta_feedback', 'POST', JSON.stringify({
      object_name: objectName, predicted_class: result.predictedClass, score: result.score,
      human_label: label, beta_version: app.getVersion(), source_environment: 'staging',
    }));
    if (!saved.ok) throw new Error('Metadata save failed');
  } catch (_error) {
    // Also clean up an upload whose response was lost after the server stored it.
    try {
      const removed = await request(storagePath, 'DELETE', JSON.stringify({ prefixes: [objectName] }));
      if (!removed.ok) throw new Error('Cleanup failed');
    } catch (_cleanupError) {
      throw new Error('Could not save this example or confirm its upload was removed. Contact the beta coordinator.');
    }
    throw new Error('Could not save this example. Please sign in and try again.');
  }
  return { success: true };
}

module.exports = { submitBlurExample };
