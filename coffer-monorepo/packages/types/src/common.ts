/** 后端统一响应结构：code 与 HTTP 状态码一致，成功时 code=200。 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
