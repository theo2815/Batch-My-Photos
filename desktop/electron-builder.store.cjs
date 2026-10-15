const { build } = require('./package.json');

// Microsoft Store package: the blur beta talks to production once the user saves a key.
module.exports = {
  ...build,
  publish: null,
  extraResources: [{ from: 'blur-store.json', to: 'blur-beta.json' }],
  win: { ...build.win, target: ['appx'] },
};
