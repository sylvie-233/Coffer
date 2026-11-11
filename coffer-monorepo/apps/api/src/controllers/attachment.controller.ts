import * as attachmentService from '../services/attachment.service.js';
import type { AppContext } from '../types/context.js';
import { HttpError, binary, success } from '../utils/http.js';
import { parseId } from '../utils/validate.js';
import {
  replaceAttachmentContentSchema,
  uploadAttachmentSchema,
} from '../validators/item.js';

/** POST /api/items/:id/attachments（multipart/form-data，file 字段为密文文件） */
export async function upload(c: AppContext): Promise<Response> {
  const itemId = parseId(c.req.param('id'), '凭证 ID');
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || typeof file === 'string') {
    throw new HttpError(400, '缺少上传文件（file）');
  }

  const parsed = uploadAttachmentSchema.safeParse({
    fileNameCipher: body['fileNameCipher'],
    mimeType: typeof body['mimeType'] === 'string' ? body['mimeType'] : '',
    keyVersion: body['keyVersion'],
  });
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? '上传参数不合法');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const data = await attachmentService.uploadAttachment(
    c.get('currentUser').userId,
    itemId,
    {
      fileNameCipher: parsed.data.fileNameCipher,
      mimeType: parsed.data.mimeType ?? '',
      keyVersion: parsed.data.keyVersion,
    },
    bytes,
  );
  return success(c, data, '图片已加密上传');
}

/** GET /api/attachments/:id/content */
export async function content(c: AppContext): Promise<Response> {
  const attachId = parseId(c.req.param('id'), '附件 ID');
  const result = await attachmentService.getAttachmentContent(
    c.get('currentUser').userId,
    attachId,
  );
  return binary(c, result.bytes);
}

/** PUT /api/attachments/:id/content?keyVersion=n（修改主密码时替换密文内容） */
export async function replaceContent(c: AppContext): Promise<Response> {
  const attachId = parseId(c.req.param('id'), '附件 ID');
  const query = replaceAttachmentContentSchema.safeParse({
    keyVersion: c.req.query('keyVersion'),
  });
  if (!query.success) {
    throw new HttpError(400, query.error.issues[0]?.message ?? '密钥版本不合法');
  }
  const bytes = new Uint8Array(await c.req.arrayBuffer());
  await attachmentService.replaceAttachmentContent(
    c.get('currentUser').userId,
    attachId,
    bytes,
    query.data.keyVersion,
  );
  return success(c, null, '附件密文已更新');
}

/** DELETE /api/attachments/:id */
export async function remove(c: AppContext): Promise<Response> {
  const attachId = parseId(c.req.param('id'), '附件 ID');
  await attachmentService.removeAttachment(c.get('currentUser').userId, attachId);
  return success(c, null, '附件已删除');
}
