/**
 * 准备 Android 原生构建所需的本机工具链：
 *
 * 1. 在 android/local.properties 写入 sdk.dir；
 * 2. 把 SDK 里的 CMake 3.22 复制到项目内 .android-cmake/，并补上新版 Ninja；
 * 3. 让 Gradle 通过 local.properties 的 cmake.dir 使用它。
 *
 * 为什么需要：Android SDK 自带的 Ninja 1.10.2 在部分 Windows 环境会让 CMake 陷入
 * “build.ninja still dirty after 100 tries”；新版 Ninja（>= 1.11）没有这个问题。
 * 直接把项目指向自己的 CMake 目录，避免修改共享的 SDK 安装。
 *
 * 用法：prebuild 之后、Gradle 构建之前运行（已接入 package.json 脚本）。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(appRoot, 'android');
const toolchainDir = path.join(appRoot, '.android-cmake');
const localPropertiesPath = path.join(androidDir, 'local.properties');
const CMAKE_SHARE_DIR = 'cmake-3.22';

function fail(message) {
  console.error(`[setup-android-toolchain] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`[setup-android-toolchain] ${message}`);
}

function normalizeToForwardSlashes(value) {
  return path.resolve(value).replace(/\\/g, '/');
}

function readLocalProperties() {
  if (!fs.existsSync(localPropertiesPath)) {
    return new Map();
  }
  const entries = new Map();
  for (const line of fs.readFileSync(localPropertiesPath, 'utf8').split(/\r?\n/)) {
    const match = /^([^#=:\s][^=]*)=(.*)$/.exec(line);
    if (match) {
      entries.set(match[1].trim(), match[2].trim());
    }
  }
  return entries;
}

function writeLocalProperties(entries) {
  const lines = ['# 由 apps/rn/scripts/setup-android-toolchain.mjs 生成/更新'];
  for (const [key, value] of entries) {
    lines.push(`${key}=${value}`);
  }
  fs.writeFileSync(localPropertiesPath, `${lines.join('\n')}\n`, 'utf8');
}

function resolveSdkDir(existing) {
  const fromEnv = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return path.resolve(fromEnv);
  }
  const fromProps = existing.get('sdk.dir');
  if (fromProps && fs.existsSync(fromProps)) {
    return path.resolve(fromProps);
  }
  return null;
}

/** 找一个带 cmake-3.22 的 SDK CMake 目录（优先 3.22.1）。 */
function findSdkCmake(sdkDir) {
  const cmakeRoot = path.join(sdkDir, 'cmake');
  if (!fs.existsSync(cmakeRoot)) {
    return null;
  }
  const versions = fs
    .readdirSync(cmakeRoot)
    .filter((name) => fs.existsSync(path.join(cmakeRoot, name, 'bin', 'cmake.exe')));
  const preferred = versions.find((name) => name.startsWith('3.22.')) ?? versions[0];
  if (!preferred) {
    return null;
  }
  const candidate = path.join(cmakeRoot, preferred);
  return fs.existsSync(path.join(candidate, 'share', CMAKE_SHARE_DIR)) ? candidate : null;
}

/** PATH 上的第一个 ninja.exe。 */
function findNinjaOnPath() {
  const pathEntries = (process.env.PATH ?? '').split(path.delimiter);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, 'ninja.exe');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function ninjaVersion(ninjaPath) {
  try {
    return execFileSync(ninjaPath, ['--version'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function isUsableNinja(ninjaPath) {
  const version = ninjaVersion(ninjaPath);
  if (!version) {
    return false;
  }
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > 1 || (major === 1 && minor >= 11);
}

function ensureToolchain(sdkCmakeDir) {
  const targetBin = path.join(toolchainDir, 'bin');
  const targetShare = path.join(toolchainDir, 'share', CMAKE_SHARE_DIR);
  const targetCmake = path.join(targetBin, 'cmake.exe');

  if (!fs.existsSync(targetCmake)) {
    fs.mkdirSync(targetBin, { recursive: true });
    fs.copyFileSync(path.join(sdkCmakeDir, 'bin', 'cmake.exe'), targetCmake);
    console.log('[setup-android-toolchain] 已复制 SDK 的 cmake.exe');
  }

  if (!fs.existsSync(targetShare)) {
    fs.cpSync(path.join(sdkCmakeDir, 'share', CMAKE_SHARE_DIR), targetShare, { recursive: true });
    console.log('[setup-android-toolchain] 已复制 SDK 的 CMake Modules');
  }

  const targetNinja = path.join(targetBin, 'ninja.exe');
  const override = process.env.COFFER_NINJA_PATH;
  const candidate = override && fs.existsSync(override) ? override : findNinjaOnPath();
  const currentOk = fs.existsSync(targetNinja) && isUsableNinja(targetNinja);

  if (candidate && isUsableNinja(candidate)) {
    if (!fs.existsSync(targetNinja) || !filesEqual(candidate, targetNinja)) {
      fs.copyFileSync(candidate, targetNinja);
      console.log(`[setup-android-toolchain] 已使用 Ninja ${ninjaVersion(candidate)}（${candidate}）`);
    }
  } else if (!currentOk) {
    warn(
      '没有找到 Ninja >= 1.11，CMake 构建可能反复失败。可执行 `winget install Ninja-build.Ninja`，' +
        '或用 COFFER_NINJA_PATH 指向新版 ninja.exe。',
    );
  }
}

function filesEqual(left, right) {
  try {
    const a = fs.statSync(left);
    const b = fs.statSync(right);
    if (a.size !== b.size) {
      return false;
    }
    return fs.readFileSync(left).equals(fs.readFileSync(right));
  } catch {
    return false;
  }
}

function main() {
  if (!fs.existsSync(androidDir)) {
    fail('未找到 android/ 目录，请先运行 `pnpm --filter @coffer/rn prebuild:android`。');
  }

  const properties = readLocalProperties();
  const sdkDir = resolveSdkDir(properties);
  if (!sdkDir) {
    fail('无法确定 Android SDK 路径，请设置 ANDROID_HOME，或在 android/local.properties 写入 sdk.dir。');
  }
  properties.set('sdk.dir', normalizeToForwardSlashes(sdkDir));

  const sdkCmakeDir = findSdkCmake(sdkDir);
  if (!sdkCmakeDir) {
    warn('Android SDK 中未找到带 cmake-3.22 的 CMake，将沿用 Gradle 自动选择。');
    writeLocalProperties(properties);
    return;
  }

  ensureToolchain(sdkCmakeDir);
  properties.set('cmake.dir', normalizeToForwardSlashes(toolchainDir));
  writeLocalProperties(properties);
  console.log(`[setup-android-toolchain] local.properties -> sdk.dir=${properties.get('sdk.dir')}, cmake.dir=${properties.get('cmake.dir')}`);
}

main();
