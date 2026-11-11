import { Hono } from 'hono';

import * as folderController from '../controllers/folder.controller.js';
import { authenticate } from '../middleware/auth.js';
import type { AppEnv } from '../types/context.js';

const router = new Hono<AppEnv>();

router.use('*', authenticate);
router.get('/', folderController.list);
router.post('/', folderController.create);
router.put('/:id', folderController.update);
router.delete('/:id', folderController.remove);

export default router;
