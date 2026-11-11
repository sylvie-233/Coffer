/** SQL 语句与参数：SQL 模块只负责拼装，执行仍在 service 层。 */
export interface SqlStatement {
  sql: string;
  params: unknown[];
}

/** 构造 IN 占位符，如 (?, ?, ?)。 */
export function inClause(values: readonly (string | number)[]): string {
  return values.map(() => '?').join(', ');
}
