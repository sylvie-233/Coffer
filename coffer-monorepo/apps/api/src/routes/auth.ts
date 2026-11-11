import { Hono } from 'hono';

import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';
import type { AppEnv } from '../types/context.js';

const router = new Hono<AppEnv>();

router.post('/register', authController.register);
router.post('/challenge', authController.challenge);
router.post('/verify', authController.verify);
router.get('/me', authenticate, authController.me);
router.post('/rekey', authenticate, authController.rekey);

export default router;
