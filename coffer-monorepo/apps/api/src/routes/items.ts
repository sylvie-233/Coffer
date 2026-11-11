import { Hono } from 'hono';

import * as attachmentController from '../controllers/attachment.controller.js';
import * as itemController from '../controllers/item.controller.js';
import { authenticate } from '../middleware/auth.js';
import type { AppEnv } from '../types/context.js';

const router = new Hono<AppEnv>();

router.use('*', authenticate);
router.get('/', itemController.list);
router.post('/', itemController.create);
router.get('/:id', itemController.detail);
router.put('/:id', itemController.update);
router.patch('/:id/fav', itemController.favorite);
router.delete('/:id', itemController.remove);
router.post('/:id/restore', itemController.restore);
router.post('/:id/attachments', attachmentController.upload);

export default router;
