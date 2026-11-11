import type {
  ApiResponse,
  AttachmentDto,
  CreateFolderInput,
  CreateItemInput,
  FolderDto,
  ItemDto,
  LoginResult,
  RegisterInput,
  RegisterResult,
  RekeyInput,
  SrpChallengeResult,
  UpdateFolderInput,
  UpdateItemInput,
  UserProfile,
} from '@coffer/types';

import { getToken } from './session';

/** 统一 API 异常：带 HTTP 状态码，便于界面区分 401 / 409 / 413 等。 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * API 根路径。浏览器默认走同源 `/api`（由 Next rewrites 或 Nginx 代理）；
 * Electron 等宿主可在启动时调用 configureApi 指向本地/远程 Hono 服务。
 */
let apiBaseUrl = '/api';

/** 单次请求超时。React Native 在目标不可达时不会自己失败，需要主动中止。 */
let requestTimeoutMs = 20_000;

export function configureApi(options: { baseUrl?: string; timeoutMs?: number }): void {
  if (options.baseUrl) {
    apiBaseUrl = options.baseUrl.replace(/\/+$/, '');
  }
  if (typeof options.timeoutMs === 'number' && options.timeoutMs > 0) {
    requestTimeoutMs = options.timeoutMs;
  }
}

function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`;
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function parseError(response: Response): Promise<ApiError> {
  let message = `请求失败（${response.status}）`;
  try {
    const body = (await response.json()) as ApiResponse<unknown>;
    if (body && typeof body.message === 'string' && body.message) {
      message = body.message;
    }
  } catch {
    // 非 JSON 错误响应，保留默认文案
  }
  return new ApiError(response.status, message);
}

/**
 * 给请求挂上超时。调用方自带 signal 时不再覆盖，由调用方管理取消。
 */
function timedFetchInit(init: RequestInit): {
  init: RequestInit;
  dispose: () => void;
  timedOut: () => boolean;
} {
  if (typeof AbortController === 'undefined' || init.signal) {
    return { init, dispose: () => {}, timedOut: () => false };
  }
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, requestTimeoutMs);
  return {
    init: { ...init, signal: controller.signal },
    dispose: () => clearTimeout(timer),
    timedOut: () => timedOut,
  };
}

function timeoutError(): ApiError {
  const seconds = Math.round(requestTimeoutMs / 1000);
  return new ApiError(0, `请求超时（${seconds} 秒），请检查网络或服务是否可用`);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // 仅字符串请求体按 JSON 发送；FormData / 二进制必须让浏览器自行生成 Content-Type
  const headers = authHeaders(
    typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {},
  );
  const timed = timedFetchInit(init);
  try {
    const response = await fetch(apiUrl(path), {
      ...timed.init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    });

    if (!response.ok) {
      throw await parseError(response);
    }

    const payload = (await response.json()) as ApiResponse<T>;
    if (!payload || payload.code !== 200) {
      throw new ApiError(payload?.code ?? response.status, payload?.message ?? '请求失败');
    }
    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (timed.timedOut()) {
      throw timeoutError();
    }
    throw error;
  } finally {
    timed.dispose();
  }
}

async function requestBinary(
  path: string,
  init: RequestInit = {},
  allowNotFound = false,
): Promise<Uint8Array | null> {
  const timed = timedFetchInit(init);
  try {
    const response = await fetch(apiUrl(path), {
      ...timed.init,
      headers: authHeaders(init.headers as Record<string, string> | undefined),
    });
    if (allowNotFound && response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw await parseError(response);
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (timed.timedOut()) {
      throw timeoutError();
    }
    throw error;
  } finally {
    timed.dispose();
  }
}

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  // 不依赖 URLSearchParams：React Native 运行时并不保证提供该实现。
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }
    const text = typeof value === 'boolean' ? (value ? '1' : '0') : String(value);
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(text)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/** React Native FormData 只接受 { uri, name, type } 形式的文件描述。 */
export interface UploadFilePart {
  uri: string;
  name: string;
  type: string;
}

function isUploadFilePart(value: unknown): value is UploadFilePart {
  return typeof value === 'object' && value !== null && 'uri' in value;
}

/* ============================ 认证 ============================ */

export const authApi = {
  register(input: RegisterInput): Promise<RegisterResult> {
    return request<RegisterResult>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  challenge(email: string): Promise<SrpChallengeResult> {
    return request<SrpChallengeResult>('/auth/challenge', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  verify(input: { srpSessionId: string; A: string; M1: string }): Promise<LoginResult> {
    return request<LoginResult>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  me(): Promise<UserProfile> {
    return request<UserProfile>('/auth/me');
  },

  rekey(input: RekeyInput): Promise<UserProfile> {
    return request<UserProfile>('/auth/rekey', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};

/* ============================ 用户 ============================ */

export const userApi = {
  updateProfile(input: { nickname?: string; avatarColor?: string }): Promise<UserProfile> {
    return request<UserProfile>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  uploadAvatar(bytes: Uint8Array | Blob): Promise<UserProfile> {
    return request<UserProfile>('/users/me/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes as unknown as BodyInit,
    });
  },

  getAvatar(): Promise<Uint8Array | null> {
    return requestBinary('/users/me/avatar', {}, true);
  },

  deleteAvatar(): Promise<UserProfile> {
    return request<UserProfile>('/users/me/avatar', { method: 'DELETE' });
  },
};

/* ============================ 文件夹 ============================ */

export const folderApi = {
  list(): Promise<FolderDto[]> {
    return request<FolderDto[]>('/folders');
  },

  create(input: CreateFolderInput): Promise<FolderDto> {
    return request<FolderDto>('/folders', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(folderId: number, input: UpdateFolderInput): Promise<FolderDto> {
    return request<FolderDto>(`/folders/${folderId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  remove(folderId: number): Promise<null> {
    return request<null>(`/folders/${folderId}`, { method: 'DELETE' });
  },
};

/* ============================ 凭证 ============================ */

export interface ItemListQuery {
  type?: '0' | '1' | '2';
  fav?: '0' | '1';
  folderId?: number | 'none';
  includeDeleted?: boolean;
}

export const itemApi = {
  list(query: ItemListQuery = {}): Promise<ItemDto[]> {
    return request<ItemDto[]>(`/items${queryString({ ...query })}`);
  },

  create(input: CreateItemInput): Promise<ItemDto> {
    return request<ItemDto>('/items', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  update(itemId: number, input: UpdateItemInput): Promise<ItemDto> {
    return request<ItemDto>(`/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  favorite(itemId: number, favFlag: '0' | '1'): Promise<null> {
    return request<null>(`/items/${itemId}/fav`, {
      method: 'PATCH',
      body: JSON.stringify({ favFlag }),
    });
  },

  remove(itemId: number): Promise<null> {
    return request<null>(`/items/${itemId}`, { method: 'DELETE' });
  },

  restore(itemId: number): Promise<ItemDto> {
    return request<ItemDto>(`/items/${itemId}/restore`, { method: 'POST' });
  },
};

/* ============================ 附件 ============================ */

export const attachmentApi = {
  upload(
    itemId: number,
    input: { fileNameCipher: string; mimeType: string; keyVersion: number },
    source: Uint8Array | Blob | UploadFilePart,
  ): Promise<AttachmentDto> {
    const form = new FormData();
    form.append('fileNameCipher', input.fileNameCipher);
    form.append('mimeType', input.mimeType);
    form.append('keyVersion', String(input.keyVersion));
    const filePart = isUploadFilePart(source)
      ? source
      : source instanceof Uint8Array
        ? new Blob([source as unknown as BlobPart], { type: 'application/octet-stream' })
        : source;
    form.append('file', filePart as unknown as Blob, 'attachment.bin');
    return request<AttachmentDto>(`/items/${itemId}/attachments`, {
      method: 'POST',
      body: form,
    });
  },

  content(attachId: number): Promise<Uint8Array | null> {
    return requestBinary(`/attachments/${attachId}/content`, {}, true);
  },

  replaceContent(attachId: number, bytes: Uint8Array | Blob, keyVersion: number): Promise<null> {
    return request<null>(`/attachments/${attachId}/content?keyVersion=${keyVersion}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes as unknown as BodyInit,
    });
  },

  remove(attachId: number): Promise<null> {
    return request<null>(`/attachments/${attachId}`, { method: 'DELETE' });
  },
};
