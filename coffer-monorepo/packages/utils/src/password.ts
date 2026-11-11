export type PasswordStrengthLevel = 'weak' | 'mid' | 'strong';

export interface PasswordStrength {
  level: PasswordStrengthLevel;
  label: string;
  hint: string;
}

/** 密码强度：< 8 位红，8–11 位橙，≥ 12 位且含多类字符绿。 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) {
    return { level: 'weak', label: '太短', hint: '至少 8 位，建议 12 位以上' };
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  if (password.length >= 12 && classes >= 3) {
    return { level: 'strong', label: '强', hint: '长度与字符多样性都很好' };
  }
  return { level: 'mid', label: '中等', hint: '再加长度或符号会更安全' };
}

/** 生成 16 位随机密码，保证包含大小写、数字与符号。 */
export function generatePassword(length = 16): string {
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*-_=+';
  const all = lower + upper + digits + symbols;
  const random = (max: number): number => {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    return bytes[0]! % max;
  };
  const pick = (pool: string): string => pool[random(pool.length)]!;
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < length) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join('');
}
