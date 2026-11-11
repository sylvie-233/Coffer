import { Hono } from 'hono';

import * as attachmentController from '../controllers/attachment.controller.js';
import { authenticate } from '../middleware/auth.js';
import type { AppEnv } from '../types/context.js';

const router = new Hono<AppEnv>();

router.use('*', authenticate);
router.get('/:id/content', attachmentController.content);
router.put('/:id/content', attachmentController.replaceContent);
router.delete('/:id', attachmentController.remove);

export default router;
