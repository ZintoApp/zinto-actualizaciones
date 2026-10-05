import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { User } from '@shared/schema';
import { nodeRagService } from '../services/node-rag-service';
import { logger } from '../utils/logger';

const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = req.user as User;
  if (!user.isSuperAdmin) {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
};

const router = express.Router();

/**
 * Force re-embed all node types after definition changes in ai-flow-node-knowledge.ts.
 */
router.post('/re-embed', requireSuperAdmin, async (_req, res) => {
  try {
    await nodeRagService.initializeEmbeddings(0, true);
    res.json({ success: true, message: 'Node embeddings re-embedded successfully' });
  } catch (error) {
    logger.error('NodeRAGRoutes', 'Failed to re-embed node types', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to re-embed node types',
    });
  }
});

export default router;
