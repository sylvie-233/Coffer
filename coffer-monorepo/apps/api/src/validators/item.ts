import { z } from 'zod';

import {
  cipherTextSchema,
  flagSchema,
  idSchema,
  itemTypeSchema,
} from './common.js';

export const createItemSchema = z.object({
  folderId: idSchema.nullable().optional(),
  itemType: itemTypeSchema,
  nameCipher: cipherTextSchema(1024),
  dataCipher: cipherTextSchema(2_000_000),
  favFlag: flagSchema.optional(),
  keyVersion: z.coerce.number().int().positive(),
});

export const updateItemSchema = z.object({
  folderId: idSchema.nullable().optional(),
  nameCipher: cipherTextSchema(1024),
  dataCipher: cipherTextSchema(2_000_000),
  keyVersion: z.coerce.number().int().positive(),
});

export const itemQuerySchema = z.object({
  type: itemTypeSchema.optional(),
  fav: flagSchema.optional(),
  folderId: z.string().trim().optional(),
  includeDeleted: flagSchema.optional(),
});

export const favSchema = z.object({
  favFlag: flagSchema,
});

export const uploadAttachmentSchema = z.object({
  fileNameCipher: cipherTextSchema(1024),
  mimeType: z.string().trim().max(64, 'MIME 类型过长').optional(),
  keyVersion: z.coerce.number().int().positive(),
});

export const replaceAttachmentContentSchema = z.object({
  keyVersion: z.coerce.number().int().positive(),
});
