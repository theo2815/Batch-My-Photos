const { safeStorage } = require('electron');
const SecureStore = require('./secureStore');

let store;
function getStore() {
  if (!store) store = new SecureStore({ name: 'blur-beta-key' });
  return store;
}

function get() {
  if (!safeStorage.isEncryptionAvailable()) return '';
  return getStore().get('apiKey', '');
}

function set(key) {
  if (typeof key !== 'string' || !/^[\x21-\x7e]{1,1024}$/.test(key)) {
    throw new Error('Enter a valid beta key without whitespace (maximum 1024 characters).');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption is unavailable. Restart the app before saving a beta key.');
  }
  getStore().set('apiKey', key);
}

module.exports = { get, set };
