import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * 本地 Expo 模块（modules/coffer-argon2）的原生 Argon2id。
 * Web 端用 hash-wasm、RN 端用这份原生实现，两边输出完全一致。
 */
export interface CofferArgon2Module {
  argon2id(
    password: string,
    saltHex: string,
    iterations: number,
    memoryKiB: number,
    parallelism: number,
    hashLength: number,
  ): Promise<string>;
}

/** 原生模块缺失时（如 Web 或旧安装包）返回 null，由调用方退回纯 JS 实现。 */
export const nativeArgon2 = requireOptionalNativeModule<CofferArgon2Module>('CofferArgon2');
