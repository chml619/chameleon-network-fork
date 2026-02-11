const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Add support for .cjs and .mjs files (needed for Polkadot.js)
config.resolver.sourceExts = [...config.resolver.sourceExts, 'cjs', 'mjs'];

// Node polyfills for Polkadot.js
// Use path.resolve to normalize Windows paths (C:\ -> file:// safe)
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  stream: path.resolve(require.resolve('readable-stream')),
  buffer: path.resolve(require.resolve('buffer')),
  process: path.resolve(require.resolve('process/browser')),
  crypto: path.resolve(require.resolve('react-native-get-random-values')),
};

module.exports = withNativeWind(config, { input: './global.css', configPath: './tailwind.config.js' });
