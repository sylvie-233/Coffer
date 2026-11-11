import type { Context } from 'hono';

/** 当前请求的登录用户（由 JWT 中间件注入）。 */
export interface AuthUser {
  userId: number;
  email: string;
  nickname: string;
}

/** Hono 应用环境变量。 */
export interface AppEnv {
  Variables: {
    currentUser: AuthUser;
  };
}

export type AppContext = Context<AppEnv>;
