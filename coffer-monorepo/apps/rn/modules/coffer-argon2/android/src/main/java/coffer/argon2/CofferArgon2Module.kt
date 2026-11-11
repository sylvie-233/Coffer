package coffer.argon2

import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.bouncycastle.crypto.generators.Argon2BytesGenerator
import org.bouncycastle.crypto.params.Argon2Parameters

/**
 * 原生 Argon2id 实现（BouncyCastle）。
 *
 * 共享加密层在 Web 端使用 hash-wasm（WebAssembly），RN/Hermes 无法运行 WASM，
 * 纯 JS 实现又要几十秒；这里用与 hash-wasm 完全相同的参数计算，结果跨端互通。
 */
class CofferArgon2Module : Module() {
  // 单次 Argon2 会占用 64 MiB 内存，串行执行避免并发解锁叠加内存占用。
  private val generatorLock = Any()

  override fun definition() = ModuleDefinition {
    Name("CofferArgon2")

    AsyncFunction("argon2id", this@CofferArgon2Module::derive)
  }

  private fun derive(
    password: String,
    saltHex: String,
    iterations: Int,
    memoryKiB: Int,
    parallelism: Int,
    hashLength: Int,
  ): String {
    if (iterations !in 1..16) {
      throw Exceptions.IllegalArgument("iterations 必须在 1 到 16 之间")
    }
    if (parallelism !in 1..8) {
      throw Exceptions.IllegalArgument("parallelism 必须在 1 到 8 之间")
    }
    if (memoryKiB < 8 * parallelism || memoryKiB > 256 * 1024) {
      throw Exceptions.IllegalArgument("memoryKiB 必须在 8 * parallelism 到 262144 之间")
    }
    if (hashLength !in 4..1024) {
      throw Exceptions.IllegalArgument("hashLength 必须在 4 到 1024 之间")
    }

    val salt = hexToBytes(saltHex)
    if (salt.size !in 8..1024) {
      throw Exceptions.IllegalArgument("盐值长度必须在 8 到 1024 字节之间")
    }

    val params = Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
      .withVersion(Argon2Parameters.ARGON2_VERSION_13)
      .withIterations(iterations)
      .withMemoryAsKB(memoryKiB)
      .withParallelism(parallelism)
      .withSalt(salt)
      .build()

    return synchronized(generatorLock) {
      val generator = Argon2BytesGenerator()
      generator.init(params)
      val output = ByteArray(hashLength)
      generator.generateBytes(password.toByteArray(Charsets.UTF_8), output)
      toHex(output)
    }
  }

  private fun hexToBytes(value: String): ByteArray {
    if (value.length % 2 != 0) {
      throw Exceptions.IllegalArgument("盐值必须是偶数长度的十六进制字符串")
    }
    val output = ByteArray(value.length / 2)
    for (index in output.indices) {
      val high = Character.digit(value[index * 2], 16)
      val low = Character.digit(value[index * 2 + 1], 16)
      if (high < 0 || low < 0) {
        throw Exceptions.IllegalArgument("盐值包含非十六进制字符")
      }
      output[index] = ((high shl 4) or low).toByte()
    }
    return output
  }

  private fun toHex(bytes: ByteArray): String {
    val alphabet = "0123456789abcdef"
    val chars = CharArray(bytes.size * 2)
    for (index in bytes.indices) {
      val byte = bytes[index].toInt() and 0xff
      chars[index * 2] = alphabet[byte ushr 4]
      chars[index * 2 + 1] = alphabet[byte and 0x0f]
    }
    return String(chars)
  }
}
