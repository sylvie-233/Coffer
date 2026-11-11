import { z } from 'zod';

import { colorSchema } from './common.js';

export const updateProfileSchema = z
  .object({
    nickname: z.string().trim().min(1, '昵称不能为空').max(16, '昵称不能超过 16 个字').optional(),
    avatarColor: colorSchema.optional(),
  })
  .refine((value) => value.nickname !== undefined || value.avatarColor !== undefined, {
    message: '没有需要更新的字段',
  });
