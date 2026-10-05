import { Router } from 'express';
import { ensureSuperAdmin } from '../middleware';
import { storage } from '../storage';
import { db } from '../db';
import { appSettings, campaignTemplates, campaigns, companies, followUpSchedules, followUpTemplates, flowMediaAssets, knowledgeBaseDocuments, users, messages, conversations } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import fsExtra from 'fs-extra';
import { usageTrackingService } from '../services/usage-tracking-service';
import { bytesToMegabytes, bytesToTrackedMB, megabytesToBytes } from '../services/data-usage-calculations';

const router = Router();

const MAX_USAGE_MB = 10_000_000; // 10 TB
const MAX_FILES_COUNT = 1_000_000;

const calculateUsagePercentage = (used: number, limit: number) => {
  if (limit <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((used / limit) * 100));
};

const isNearLimit = (used: number, limit: number) => limit > 0 && used / limit >= 0.8;
const isLimitExceeded = (used: number, limit: number) => limit > 0 && used >= limit;

const extractUploadUrls = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return [];
};


const updateUsageSchema = z.object({
  storageUsed: z.number().int().min(0).max(MAX_USAGE_MB).optional(),
  bandwidthUsed: z.number().min(0).max(MAX_USAGE_MB).optional(),
  filesCount: z.number().int().min(0).max(MAX_FILES_COUNT).optional()
});


const overrideUsageSchema = z.object({
  currentStorageUsed: z.number().int().min(0).max(MAX_USAGE_MB).optional(),
  currentBandwidthUsed: z.number().min(0).max(MAX_USAGE_MB).optional(),
  filesCount: z.number().int().min(0).max(MAX_FILES_COUNT).optional(),
  reason: z.string().optional()
});

/**
 * Get company data usage and limits
 */
router.get('/:companyId/usage', ensureSuperAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }


    let plan = null;
    if (company.planId) {
      plan = await storage.getPlan(company.planId);
    }


    // Ensure we're using actual database values, not defaults
    const currentStorageUsed = company.currentStorageUsed ?? 0;
    const currentBandwidthUsedBytes = company.currentBandwidthUsed ?? 0;
    const currentBandwidthUsed = bytesToMegabytes(currentBandwidthUsedBytes);
    const currentFilesCount = company.filesCount ?? 0;
    
    const storageLimit = plan?.storageLimit ?? 0;
    const bandwidthLimit = plan?.bandwidthLimit ?? 0;
    const totalFilesLimit = plan?.totalFilesLimit ?? 0;
    
    const storagePercentage = calculateUsagePercentage(currentStorageUsed, storageLimit);
    const bandwidthPercentage = calculateUsagePercentage(currentBandwidthUsed, bandwidthLimit);
    const filesPercentage = calculateUsagePercentage(currentFilesCount, totalFilesLimit);

    const usageData = {
      companyId: company.id,
      companyName: company.name,
      planName: plan?.name || 'No Plan',
      

      currentUsage: {
        // Note: Storage is tracked in whole megabytes using Math.ceil.
        // Any non-zero file size is rounded up to the next megabyte (e.g., 1 byte = 1 MB).
        storage: currentStorageUsed, // in MB - actual database value
        bandwidth: currentBandwidthUsed, // in MB, converted from exact transferred bytes
        files: currentFilesCount // actual database value
      },
      

      limits: {
        storage: storageLimit, // in MB
        bandwidth: bandwidthLimit, // in MB
        fileUpload: plan?.fileUploadLimit ?? 0, // in MB
        totalFiles: totalFilesLimit
      },
      

      percentages: {
        storage: storagePercentage,
        bandwidth: bandwidthPercentage,
        files: filesPercentage
      },
      

      status: {
        storageNearLimit: isNearLimit(currentStorageUsed, storageLimit),
        bandwidthNearLimit: isNearLimit(currentBandwidthUsed, bandwidthLimit),
        filesNearLimit: isNearLimit(currentFilesCount, totalFilesLimit),
        storageExceeded: isLimitExceeded(currentStorageUsed, storageLimit),
        bandwidthExceeded: isLimitExceeded(currentBandwidthUsed, bandwidthLimit),
        filesExceeded: isLimitExceeded(currentFilesCount, totalFilesLimit)
      },
      
      lastUpdated: company.lastUsageUpdate
    };

    res.json(usageData);

  } catch (error) {
    console.error('Error fetching company usage:', error);
    res.status(500).json({ error: 'Failed to fetch company usage data' });
  }
});

/**
 * Update company usage (internal API for system use)
 */
router.post('/:companyId/usage/update', ensureSuperAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const validatedData = updateUsageSchema.parse(req.body);

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }


    const updateData: any = {
      lastUsageUpdate: new Date()
    };

    if (validatedData.storageUsed !== undefined) {
      updateData.currentStorageUsed = validatedData.storageUsed;
    }
    if (validatedData.bandwidthUsed !== undefined) {
      updateData.currentBandwidthUsed = megabytesToBytes(validatedData.bandwidthUsed);
    }
    if (validatedData.filesCount !== undefined) {
      updateData.filesCount = validatedData.filesCount;
    }

    await storage.updateCompany(companyId, updateData);

    res.json({
      success: true,
      message: 'Usage updated successfully',
      updatedFields: Object.keys(updateData)
    });

  } catch (error) {
    console.error('Error updating company usage:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to update company usage' });
  }
});

/**
 * Override company usage manually (admin only)
 */
router.post('/:companyId/usage/override', ensureSuperAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const validatedData = overrideUsageSchema.parse(req.body);

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }


    const updateData: any = {
      lastUsageUpdate: new Date()
    };

    if (validatedData.currentStorageUsed !== undefined) {
      updateData.currentStorageUsed = validatedData.currentStorageUsed;
    }
    if (validatedData.currentBandwidthUsed !== undefined) {
      updateData.currentBandwidthUsed = megabytesToBytes(validatedData.currentBandwidthUsed);
    }
    if (validatedData.filesCount !== undefined) {
      updateData.filesCount = validatedData.filesCount;
    }

    const auditRecord = {
      action: 'usage_override',
      companyId,
      userId: (req.user as any)?.id,
      reason: validatedData.reason || 'Admin manual override',
      oldValues: {
        currentStorageUsed: company.currentStorageUsed ?? 0,
        currentBandwidthUsed: bytesToMegabytes(company.currentBandwidthUsed ?? 0),
        filesCount: company.filesCount ?? 0
      },
      newValues: {
        currentStorageUsed: updateData.currentStorageUsed ?? company.currentStorageUsed ?? 0,
        currentBandwidthUsed: bytesToMegabytes(updateData.currentBandwidthUsed ?? company.currentBandwidthUsed ?? 0),
        filesCount: updateData.filesCount ?? company.filesCount ?? 0
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      createdAt: new Date().toISOString()
    };

    await db.transaction(async (tx) => {
      const [updatedCompany] = await tx
        .update(companies)
        .set({
          ...updateData,
          updatedAt: new Date()
        })
        .where(eq(companies.id, companyId))
        .returning();

      if (!updatedCompany) {
        throw new Error(`Company with ID ${companyId} not found`);
      }

      await tx.insert(appSettings).values({
        key: `audit_usage_override_${companyId}_${Date.now()}`,
        value: auditRecord
      });
    });

    res.json({
      success: true,
      message: 'Usage overridden successfully',
      reason: validatedData.reason,
      updatedFields: Object.keys(updateData).filter(key => key !== 'lastUsageUpdate')
    });

  } catch (error) {
    console.error('Error overriding company usage:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Validation error', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to override company usage' });
  }
});

/**
 * Reset monthly bandwidth usage (typically called by a cron job)
 */
router.post('/:companyId/usage/reset-bandwidth', ensureSuperAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    await usageTrackingService.resetMonthlyBandwidthUsage(companyId);

    res.json({
      success: true,
      message: 'Bandwidth usage reset successfully'
    });

  } catch (error) {
    console.error('Error resetting bandwidth usage:', error);
    res.status(500).json({ error: 'Failed to reset bandwidth usage' });
  }
});

/**
 * Recalculate company usage from actual files (admin only)
 * POST /api/admin/companies/:companyId/usage/recalculate
 */
router.post('/:companyId/usage/recalculate', ensureSuperAdmin, async (req, res) => {
  try {
    const companyId = parseInt(req.params.companyId);
    
    if (isNaN(companyId)) {
      return res.status(400).json({ error: 'Invalid company ID' });
    }

    const company = await storage.getCompany(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Scan actual uploaded files and calculate tracked totals.
    // Storage is accumulated per file in whole MB to match DataUsageTracker.
    let totalStorageMB = 0;
    let totalFiles = 0;
    const processedFiles = new Set<string>();

    const addUploadedFile = async (uploadUrl: string | null | undefined, expectedPrefix: string) => {
      if (!uploadUrl || !uploadUrl.startsWith(expectedPrefix)) {
        return;
      }

      const uploadsRoot = path.normalize(path.join(process.cwd(), 'uploads'));
      const relativeUploadPath = uploadUrl.replace(/^\/uploads\//, '');
      const filePath = path.normalize(path.join(uploadsRoot, relativeUploadPath));

      if (!(filePath === uploadsRoot || filePath.startsWith(`${uploadsRoot}${path.sep}`)) || processedFiles.has(filePath)) {
        return;
      }

      processedFiles.add(filePath);

      if (await fsExtra.pathExists(filePath)) {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          totalStorageMB += bytesToTrackedMB(stats.size);
          totalFiles += 1;
        }
      }
    };

    // Scan knowledge base documents
    const knowledgeBaseDocs = await db.select()
      .from(knowledgeBaseDocuments)
      .where(eq(knowledgeBaseDocuments.companyId, companyId));

    for (const doc of knowledgeBaseDocs) {
      if (doc.fileSize) {
        totalStorageMB += bytesToTrackedMB(doc.fileSize);
        totalFiles += 1;
      }
    }

    const galleryAssets = await db.select({ fileSize: flowMediaAssets.fileSize })
      .from(flowMediaAssets)
      .where(eq(flowMediaAssets.companyId, companyId));
    for (const asset of galleryAssets) {
      totalStorageMB += bytesToTrackedMB(asset.fileSize);
      totalFiles += 1;
    }

    // Scan only template media referenced by this company's records.
    try {
      const templateRows = await db
        .select({ mediaUrls: campaignTemplates.mediaUrls })
        .from(campaignTemplates)
        .where(eq(campaignTemplates.companyId, companyId));

      const campaignRows = await db
        .select({ mediaUrls: campaigns.mediaUrls })
        .from(campaigns)
        .where(eq(campaigns.companyId, companyId));

      const followUpTemplateRows = await db
        .select({ mediaUrl: followUpTemplates.mediaUrl })
        .from(followUpTemplates)
        .where(eq(followUpTemplates.companyId, companyId));

      const followUpScheduleRows = await db
        .select({ mediaUrl: followUpSchedules.mediaUrl })
        .from(followUpSchedules)
        .where(eq(followUpSchedules.companyId, companyId));

      const templateUrls = [
        ...templateRows.flatMap(row => extractUploadUrls(row.mediaUrls)),
        ...campaignRows.flatMap(row => extractUploadUrls(row.mediaUrls)),
        ...followUpTemplateRows.flatMap(row => extractUploadUrls(row.mediaUrl)),
        ...followUpScheduleRows.flatMap(row => extractUploadUrls(row.mediaUrl))
      ];

      for (const templateUrl of templateUrls) {
        try {
          await addUploadedFile(templateUrl, '/uploads/templates/');
        } catch (error) {
          console.warn(`Could not access template file ${templateUrl}:`, error);
        }
      }
    } catch (error) {
      console.error('Error scanning template media references:', error);
    }

    // Scan webchat uploads - find files referenced in messages from this company's conversations
    try {
      const webchatDir = path.join(process.cwd(), 'uploads', 'webchat');
      if (await fsExtra.pathExists(webchatDir)) {
        // Get all webchat media URLs from messages in this company's conversations
        const webchatMessages = await db
          .select({ mediaUrl: messages.mediaUrl })
          .from(messages)
          .innerJoin(conversations, eq(messages.conversationId, conversations.id))
          .where(
            and(
              eq(conversations.companyId, companyId),
              sql`${messages.mediaUrl} LIKE '/uploads/webchat/%'`
            )
          );

        for (const msg of webchatMessages) {
          if (msg.mediaUrl) {
            const filename = path.basename(msg.mediaUrl);
            try {
              await addUploadedFile(msg.mediaUrl, '/uploads/webchat/');
            } catch (error) {
              // Skip files that can't be accessed
              console.warn(`Could not access webchat file ${filename}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error scanning webchat uploads:', error);
    }

    // Scan avatar files for users in this company
    try {
      const companyUsers = await db
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.companyId, companyId));

      for (const user of companyUsers) {
        if (user.avatarUrl && user.avatarUrl.startsWith('/uploads/')) {
          const filename = path.basename(user.avatarUrl);
          try {
            await addUploadedFile(user.avatarUrl, '/uploads/avatars/');
          } catch (error) {
            // Skip files that can't be accessed
            console.warn(`Could not access avatar file ${filename}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Error scanning avatar files:', error);
    }

    // Update company usage
    await storage.updateCompany(companyId, {
      currentStorageUsed: totalStorageMB,
      filesCount: totalFiles,
      lastUsageUpdate: new Date()
    });

    res.json({
      success: true,
      message: 'Storage usage and file count recalculated successfully. Bandwidth is tracked from transfer events and is not recalculated from files.',
      recalculated: {
        storage: totalStorageMB,
        files: totalFiles
      },
      bandwidth: {
        status: 'not_recalculated',
        currentValue: bytesToMegabytes(company.currentBandwidthUsed ?? 0),
        reason: 'Bandwidth is monthly transfer usage and cannot be rebuilt from current files without a durable transfer log.'
      }
    });

  } catch (error) {
    console.error('Error recalculating company usage:', error);
    res.status(500).json({ error: 'Failed to recalculate company usage' });
  }
});

export default router;
