import { Hono } from 'hono';

import attachmentRoutes from './attachments.js';
import authRoutes from './auth.js';
import folderRoutes from './folders.js';
import itemRoutes from './items.js';
import userRoutes from './users.js';
import type { AppEnv } from '../types/context.js';

const router = new Hono<AppEnv>();

router.route('/auth', authRoutes);
router.route('/users', userRoutes);
router.route('/folders', folderRoutes);
router.route('/items', itemRoutes);
router.route('/attachments', attachmentRoutes);

export default router;
