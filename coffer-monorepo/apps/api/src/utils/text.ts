/** MySQL VARBINARY / Buffer 统一转 UTF-8 密文字符串。 */
export function cipherTextOf(value: unknown): string {
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}
