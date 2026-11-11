const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

// Windows 下 cwd 的盘符大小写可能不一致（如 d: 与 D:），而 Metro 的文件图使用
// 真实大小写。Expo Router 的 require.context 用 path.relative 拼接路径，盘符大小写
// 不同会产生 d:\D:\... 这类非法路径，因此这里统一规范成大写盘符。
const projectRoot = __dirname.replace(/^([a-z]):/, (_, drive) => `${drive.toUpperCase()}:`);

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// RN 没有 WebAssembly，用 @noble/hashes 的纯 JS Argon2id 替掉 hash-wasm。
// 其余 WebCrypto 能力由 src/lib/polyfills.ts 在应用启动时注入。
//
// 不能用 extraNodeModules 做这件事：Metro 只有在常规 node_modules 解析失败后
// 才会查 extraNodeModules，而 hash-wasm 实际装在工作区里，会被正常解析到真包，
// 运行时报 "WebAssembly is not supported in this environment!"。必须用
// resolveRequest 直接改掉包名解析结果。
const hashWasmShim = path.resolve(projectRoot, 'src/lib/hash-wasm-shim.ts');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'hash-wasm') {
    return { type: 'sourceFile', filePath: hashWasmShim };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
