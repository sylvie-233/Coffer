import { z } from 'zod';

import { cipherTextSchema, colorSchema } from './common.js';

export const createFolderSchema = z.object({
  folderNameCipher: cipherTextSchema(1024),
  folderColor: colorSchema,
  sortNo: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export const updateFolderSchema = z
  .object({
    folderNameCipher: cipherTextSchema(1024).optional(),
    folderColor: colorSchema.optional(),
    sortNo: z.coerce.number().int().min(0).max(1_000_000).optional(),
  })
  .refine(
    (value) =>
      value.folderNameCipher !== undefined ||
      value.folderColor !== undefined ||
      value.sortNo !== undefined,
    { message: '没有需要更新的字段' },
  );
