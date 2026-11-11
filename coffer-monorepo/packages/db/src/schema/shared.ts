import { customType } from 'drizzle-orm/mysql-core';

/** MySQL VARBINARY 列：驱动返回 Buffer，统一转成 UTF-8 密文字符串。 */
export const varbinary1024 = customType<{ data: string; driverData: Buffer }>({
  dataType() {
    return 'varbinary(1024)';
  },
  fromDriver(value: unknown) {
    return Buffer.from(value as Buffer).toString('utf8');
  },
  toDriver(value: string) {
    return Buffer.from(value, 'utf8');
  },
});
