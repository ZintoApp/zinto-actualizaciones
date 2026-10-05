import express from 'express';
import { Request, Response, NextFunction } from 'express';
import { autoUpdateService } from '../services/auto-update-service';
import { storage } from '../storage';
import { logger } from '../utils/logger';
import { User } from '@shared/schema';


const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};


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
 * Get current application version
 */
router.get('/version', requireAuth, async (req, res) => {
  try {
    const version = await autoUpdateService.getCurrentVersion();
    res.json({ version });
  } catch (error) {
    logger.error('auto-update-api', 'Failed to get version', error);
    res.status(500).json({ error: 'Failed to get version' });
  }
});

/**
 * Check for available updates (Super Admin only)
 */
router.get('/check', requireSuperAdmin, async (req, res) => {
  try {
    const updatePackage = await autoUpdateService.checkForUpdates();
    res.json({ 
      updateAvailable: !!updatePackage,
      updatePackage 
    });
  } catch (error) {
    logger.error('auto-update-api', 'Failed to check for updates', error);
    res.status(500).json({ error: 'Failed to check for updates' });
  }
});

/**
 * Get all system updates history (Super Admin only)
 */
router.get('/history', requireSuperAdmin, async (req, res) => {
  try {
    const updates = await storage.getAllSystemUpdates();
    res.json({ updates });
  } catch (error) {
    logger.error('auto-update-api', 'Failed to get update history', error);
    res.status(500).json({ error: 'Failed to get update history' });
  }
});

/**
 * Get current update status (Super Admin only)
 */
router.get('/status', requireSuperAdmin, async (req, res) => {
  try {
    const currentUpdate = await autoUpdateService.getUpdateStatus();
    const isInProgress = autoUpdateService.isUpdateInProgress();
    
    res.json({ 
      currentUpdate,
      isInProgress
    });
  } catch (error) {
    logger.error('auto-update-api', 'Failed to get update status', error);
    res.status(500).json({ error: 'Failed to get update status' });
  }
});

/**
 * Start system update (Super Admin only)
 */
router.post('/start', requireSuperAdmin, async (req, res) => {
  try {
    if (autoUpdateService.isUpdateInProgress()) {
      return res.status(409).json({ error: 'Update already in progress' });
    }

    const updatePackage = await autoUpdateService.checkForUpdates();
    if (!updatePackage) {
      return res.status(404).json({ error: 'No updates available' });
    }


    setImmediate(async () => {
      try {
        const packagePath = await autoUpdateService.downloadUpdate(updatePackage);
        await autoUpdateService.applyUpdate(packagePath);
      } catch (error) {
        logger.error('auto-update-api', 'Update process failed', error);
      }
    });

    res.json({ message: 'Update started', version: updatePackage.version });
  } catch (error) {
    logger.error('auto-update-api', 'Failed to start update', error);
    res.status(500).json({ error: 'Failed to start update' });
  }
});

/**
 * Schedule system update (Super Admin only)
 */
router.post('/schedule', requireSuperAdmin, async (req, res) => {
  try {
    const { scheduledAt } = req.body;
    
    if (!scheduledAt) {
      return res.status(400).json({ error: 'scheduledAt is required' });
    }

    const updatePackage = await autoUpdateService.checkForUpdates();
    if (!updatePackage) {
      return res.status(404).json({ error: 'No updates available' });
    }

    const scheduledUpdate = await storage.createSystemUpdate({
      version: updatePackage.version,
      releaseNotes: updatePackage.releaseNotes || '',
      downloadUrl: updatePackage.downloadUrl,
      packageHash: updatePackage.packageHash,
      packageSize: updatePackage.packageSize,
      status: 'pending',
      scheduledAt: new Date(scheduledAt),
      migrationScripts: JSON.stringify(updatePackage.migrationScripts)
    });

    res.json({ 
      message: 'Update scheduled successfully',
      update: scheduledUpdate
    });
  } catch (error) {
    logger.error('auto-update-api', 'Failed to schedule update', error);
    res.status(500).json({ error: 'Failed to schedule update' });
  }
});

/**
 * Cancel scheduled update (Super Admin only)
 */
router.delete('/schedule/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updateId = parseInt(id);

    if (isNaN(updateId)) {
      return res.status(400).json({ error: 'Invalid update ID' });
    }

    const update = await storage.getSystemUpdate(updateId);
    if (!update) {
      return res.status(404).json({ error: 'Update not found' });
    }

    if (update.status !== 'pending') {
      return res.status(409).json({ error: 'Cannot cancel update that is not pending' });
    }

    await storage.deleteSystemUpdate(updateId);
    res.json({ message: 'Update cancelled successfully' });
  } catch (error) {
    logger.error('auto-update-api', 'Failed to cancel update', error);
    res.status(500).json({ error: 'Failed to cancel update' });
  }
});



/**
 * WebSocket endpoint for real-time update progress
 */
router.get('/progress', requireSuperAdmin, (req, res) => {

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  const progressHandler = (progress: any) => {
    res.write(`data: ${JSON.stringify(progress)}\n\n`);
  };

  autoUpdateService.on('progress', progressHandler);

  req.on('close', () => {
    autoUpdateService.removeListener('progress', progressHandler);
  });
});

export default router;
