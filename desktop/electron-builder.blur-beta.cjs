const { build } = require('./package.json');
const { readBuildSettings } = require('./scripts/write-blur-beta-config.cjs');
const { version } = readBuildSettings();

module.exports = {
  ...build,
  publish: null,
  extraMetadata: { version },
  directories: { ...build.directories, output: 'release/blur-beta' },
  extraResources: [{ from: 'blur-beta.json', to: 'blur-beta.json' }],
  win: { ...build.win, target: ['nsis'] },
};
