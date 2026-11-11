import { Hono } from 'hono';

import * as userController from '../controllers/user.controller.js';
import { authenticate } from '../middleware/auth.js';
import type { AppEnv } from '../types/context.js';

const router = new Hono<AppEnv>();

router.use('*', authenticate);
router.patch('/me', userController.updateMe);
router.put('/me/avatar', userController.uploadAvatar);
router.get('/me/avatar', userController.getAvatar);
router.delete('/me/avatar', userController.deleteAvatar);

export default router;
