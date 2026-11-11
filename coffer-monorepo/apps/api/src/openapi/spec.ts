/**
 * API 文档：客户端与服务端只交换密文和元信息。
 * 这里维护一份可读的 OpenAPI 3.1 描述，供 /api/docs 使用。
 */
const jsonBody = { 'application/json': { schema: { type: 'object' } } } as const;
const jsonResponse = {
  200: {
    description: '统一响应 { code, message, data }',
    content: { 'application/json': { schema: { type: 'object' } } },
  },
} as const;
const errorResponses = {
  400: { description: '参数错误' },
  401: { description: '未登录或登录失效' },
  404: { description: '资源不存在' },
  409: { description: '状态冲突' },
} as const;

function operation(
  summary: string,
  tag: string,
  options: { auth?: boolean; requestBody?: object; responses?: object } = {},
): object {
  return {
    summary,
    tags: [tag],
    ...(options.auth === false ? { security: [] } : {}),
    ...(options.requestBody ? { requestBody: { required: true, content: options.requestBody } } : {}),
    responses: options.responses ?? { ...jsonResponse, ...errorResponses },
  };
}

export const openapiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Coffer API',
    version: '1.0.0',
    description: [
      'Coffer 零知识个人凭证管理器 API。',
      '',
      '云端只保存客户端密文；服务端不持有密钥、不参与内容搜索。',
      '登录使用 SRP-6a，主密码与 x 不上网络；除注册 / 挑战 / 验证接口外均需 JWT。',
    ].join('\n'),
  },
  servers: [{ url: '/api', description: '当前服务' }],
  tags: [
    { name: '认证', description: '注册、SRP 登录、当前用户与修改主密码' },
    { name: '用户', description: '个人资料与加密头像' },
    { name: '文件夹', description: '加密文件夹名称、颜色与排序' },
    { name: '凭证', description: '密文条目的增删改查、收藏与回收站' },
    { name: '附件', description: '图片附件的密文上传、下载与替换' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'SRP 验证成功后签发的 JWT：Authorization: Bearer <token>',
      },
    },
  },
  security: [{ BearerAuth: [] }],
  paths: {
    '/auth/register': {
      post: operation('创建保险库（提交 SRP 验证器与加密盐）', '认证', {
        auth: false,
        requestBody: jsonBody,
      }),
    },
    '/auth/challenge': {
      post: operation('获取 SRP 登录挑战（盐与 B）', '认证', {
        auth: false,
        requestBody: jsonBody,
      }),
    },
    '/auth/verify': {
      post: operation('校验 SRP 证明码并签发 JWT', '认证', {
        auth: false,
        requestBody: jsonBody,
      }),
    },
    '/auth/me': {
      get: operation('获取当前用户资料（含 enc_salt / key_version / 密钥校验文）', '认证'),
    },
    '/auth/rekey': {
      post: operation('修改主密码：更新 SRP 材料并写入全库重加密结果', '认证', {
        requestBody: jsonBody,
      }),
    },
    '/users/me': {
      patch: operation('更新昵称与头像底色', '用户', { requestBody: jsonBody }),
    },
    '/users/me/avatar': {
      get: operation('下载加密头像二进制', '用户', {
        responses: { 200: { description: 'application/octet-stream 密文' } },
      }),
      put: operation('上传加密头像二进制（≤3MB 明文）', '用户', {
        requestBody: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } },
      }),
      delete: operation('删除头像，恢复文字头像', '用户'),
    },
    '/folders': {
      get: operation('获取文件夹列表（名称为密文）', '文件夹'),
      post: operation('新建文件夹（名称由客户端加密）', '文件夹', { requestBody: jsonBody }),
    },
    '/folders/{id}': {
      put: operation('重命名 / 改色 / 调整排序', '文件夹', { requestBody: jsonBody }),
      delete: operation('删除文件夹，其中条目移入未分类', '文件夹'),
    },
    '/items': {
      get: operation('按类型 / 收藏 / 文件夹筛选密文条目（includeDeleted=1 含回收站）', '凭证'),
      post: operation('新建密文条目', '凭证', { requestBody: jsonBody }),
    },
    '/items/{id}': {
      get: operation('获取单条密文条目', '凭证'),
      put: operation('更新密文条目', '凭证', { requestBody: jsonBody }),
      delete: operation('移入回收站（保留 30 天）', '凭证'),
    },
    '/items/{id}/fav': {
      patch: operation('切换收藏（收藏为明文元信息）', '凭证', { requestBody: jsonBody }),
    },
    '/items/{id}/restore': {
      post: operation('从回收站恢复', '凭证'),
    },
    '/items/{id}/attachments': {
      post: operation('上传加密图片附件（multipart/form-data）', '附件'),
    },
    '/attachments/{id}/content': {
      get: operation('下载附件密文二进制', '附件', {
        responses: { 200: { description: 'application/octet-stream 密文' } },
      }),
      put: operation('替换附件密文（修改主密码重加密）', '附件'),
    },
    '/attachments/{id}': {
      delete: operation('删除附件（立即清理对象存储）', '附件'),
    },
  },
} as const;
