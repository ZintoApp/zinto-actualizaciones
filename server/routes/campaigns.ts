import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { CampaignService } from '../services/campaignService.js';
import { requirePermission, requireAnyPermission } from '../middleware.js';
import { db } from '../db.js';
import { campaigns, campaignRecipients, campaignQueue, campaignMessages, contacts, channelConnections, whatsappAccounts } from '../../shared/schema.js';
import { eq, sql, and, desc, inArray } from 'drizzle-orm';
import { sendTabularExport } from '../utils/tabular-export';

const router = Router();
const campaignService = new CampaignService();


const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};


const MEDIA_DIR = path.join(process.cwd(), 'media');
const upload = multer({
  dest: path.join(MEDIA_DIR, 'temp'),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/3gpp',
      'audio/mpeg', 'audio/aac', 'audio/ogg',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});






router.get('/', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      status: req.query.status as string,
      channel_type: req.query.channel_type as string,
      search: req.query.search as string,
      sort_field: req.query.sort_field as string,
      sort_order: req.query.sort_order as 'asc' | 'desc',
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
    };

    const campaigns = await campaignService.getCampaigns(companyId, filters);
    res.json({ success: true, data: campaigns });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/stats', requireAnyPermission(['view_campaigns', 'view_campaign_analytics']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const stats = await campaignService.getCampaignStats(companyId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching campaign stats:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/', requireAnyPermission(['create_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }


    // Forward all body fields including email campaign: emailSubject, emailProvider, contentMode, channelId, channelType
    const campaignData = { ...req.body };


    if (campaignData.scheduledAt && typeof campaignData.scheduledAt === 'string') {
      const scheduledDate = new Date(campaignData.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid scheduled date format' });
      }
      campaignData.scheduledAt = scheduledDate;
    }


    if (campaignData.scheduledAt === '') {
      campaignData.scheduledAt = null;
    }

    const campaign = await campaignService.createCampaign(companyId, userId, campaignData);
    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error creating campaign:', error);
    const errorMessage = getErrorMessage(error);
    // Check if it's a validation error (starts with "Validation failed" or contains validation errors)
    if (errorMessage.includes('Validation failed') || errorMessage.includes('recurring daily')) {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      res.status(500).json({ success: false, error: errorMessage });
    }
  }
});






router.get('/templates', requireAnyPermission(['view_campaigns', 'manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const filters = {
      category: req.query.category as string,
      channel_type: req.query.channel_type as string,
      is_active: req.query.is_active ? req.query.is_active === 'true' : undefined
    };

    const templates = await campaignService.getTemplates(companyId, filters);
    res.json({ success: true, data: templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/templates', requireAnyPermission(['manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    const template = await campaignService.createTemplate(companyId, userId, req.body);
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/templates/:id', requireAnyPermission(['view_campaigns', 'manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const templateId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const template = await campaignService.getTemplate(companyId, templateId);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.put('/templates/:id', requireAnyPermission(['manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const templateId = parseInt(req.params.id);

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    const template = await campaignService.updateTemplate(companyId, userId, templateId, req.body);
    res.json({ success: true, data: template });
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.delete('/templates/:id', requireAnyPermission(['manage_templates']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const templateId = parseInt(req.params.id);

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    await campaignService.deleteTemplate(companyId, userId, templateId);
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/templates/upload-media', requireAnyPermission(['manage_templates']), upload.single('media'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const file = req.file;
    const fileType = file.mimetype.split('/')[0]; // image, video, audio, application


    let mediaType: string;
    if (fileType === 'image') mediaType = 'image';
    else if (fileType === 'video') mediaType = 'video';
    else if (fileType === 'audio') mediaType = 'audio';
    else mediaType = 'document';


    const uniqueId = crypto.createHash('md5').update(`${Date.now()}-${file.originalname}`).digest('hex');
    const fileExt = path.extname(file.originalname);
    const filename = `${uniqueId}${fileExt}`;


    const mediaTypeDir = path.join(MEDIA_DIR, mediaType);
    await fs.ensureDir(mediaTypeDir);


    const finalPath = path.join(mediaTypeDir, filename);
    await fs.move(file.path, finalPath);


    const mediaUrl = `/media/${mediaType}/${filename}`;

    res.json({
      success: true,
      data: {
        url: mediaUrl,
        type: mediaType,
        filename: file.originalname,
        size: file.size
      }
    });
  } catch (error) {
    console.error('Error uploading media:', error);


    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temp file:', unlinkError);
      }
    }

    res.status(500).json({ success: false, error: 'Failed to upload media' });
  }
});






router.get('/segments', requireAnyPermission(['view_campaigns', 'manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const segments = await campaignService.getSegments(companyId);
    res.json({ success: true, data: segments });
  } catch (error) {
    console.error('Error fetching segments:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/segments', requireAnyPermission(['manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }


    const { excludedContactIds, ...segmentData } = req.body;
    const segment = await campaignService.createSegment(companyId, userId, segmentData, excludedContactIds);
    res.json({ success: true, data: segment });
  } catch (error) {
    console.error('Error creating segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/segments/:id', requireAnyPermission(['view_campaigns', 'manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const segmentId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const segment = await campaignService.getSegment(companyId, segmentId);
    if (!segment) {
      return res.status(404).json({ success: false, error: 'Segment not found' });
    }

    res.json({ success: true, data: segment });
  } catch (error) {
    console.error('Error fetching segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.put('/segments/:id', requireAnyPermission(['manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const segmentId = parseInt(req.params.id);

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    const segment = await campaignService.updateSegment(companyId, userId, segmentId, req.body);
    res.json({ success: true, data: segment });
  } catch (error) {
    console.error('Error updating segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.delete('/segments/:id', requireAnyPermission(['manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    const segmentId = parseInt(req.params.id);

    if (!companyId || !userId) {
      return res.status(400).json({ success: false, error: 'Company ID and User ID required' });
    }

    await campaignService.deleteSegment(companyId, userId, segmentId);
    res.json({ success: true, message: 'Segment deleted successfully' });
  } catch (error) {
    console.error('Error deleting segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/segments/preview', requireAnyPermission(['view_campaigns', 'manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const { criteria, includeDetails = false, limit = 50 } = req.body;

    if (!criteria) {
      return res.status(400).json({ success: false, error: 'Criteria is required' });
    }



    const tempSegment = {
      id: 0,
      companyId,
      criteria,
      name: 'preview',
      description: '',
      contactCount: 0,
      createdById: req.user?.id || 0,
      lastUpdatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (includeDetails) {

      const contacts = await campaignService.getContactsBySegmentWithDetails(tempSegment, limit);
      const count = await campaignService.calculateSegmentContactCount(tempSegment);

      res.json({
        success: true,
        data: {
          count,
          contacts,
          hasMore: count > limit
        }
      });
    } else {

      const count = await campaignService.calculateSegmentContactCount(tempSegment);
      res.json({ success: true, data: { count } });
    }
  } catch (error) {
    console.error('Error previewing segment:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});





router.get('/contacts/duplicates', requireAnyPermission(['view_campaigns', 'manage_segments']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    const duplicateReport = await campaignService.detectDuplicateContacts(companyId);
    res.json({ success: true, data: duplicateReport });
  } catch (error) {
    console.error('Error detecting duplicate contacts:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});






router.post('/validate-content', requireAnyPermission(['view_campaigns', 'create_campaigns']), async (req, res) => {
  try {
    const { content } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    const validation = await campaignService.validateCampaignContent(content);
    res.json({ success: true, data: validation });
  } catch (error) {
    console.error('Error validating content:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

router.post('/validate-whatsapp-content', requireAnyPermission(['view_campaigns', 'create_campaigns']), async (req, res) => {
  try {
    const { content, whatsappChannelType, messageType } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }

    const validation = await campaignService.validateCampaignContent(content);
    res.json({ success: true, data: validation });
  } catch (error) {
    console.error('Error validating WhatsApp content:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});




router.get('/:id', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const campaign = await campaignService.getCampaignById(companyId, campaignId);
    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error fetching campaign:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.put('/:id', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    // Forward all body fields including email: emailSubject, emailProvider, contentMode, channelId
    const updateData = { ...req.body };


    if (updateData.scheduledAt && typeof updateData.scheduledAt === 'string') {
      const scheduledDate = new Date(updateData.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        return res.status(400).json({ success: false, error: 'Invalid scheduled date format' });
      }
      updateData.scheduledAt = scheduledDate;
    }

    if (updateData.scheduledAt === '') {
      updateData.scheduledAt = null;
    }

    const campaign = await campaignService.updateCampaign(companyId, campaignId, updateData);
    res.json({ success: true, data: campaign });
  } catch (error) {
    console.error('Error updating campaign:', error);
    const errorMessage = getErrorMessage(error);
    // Check if it's a validation error (starts with "Validation failed" or contains validation errors)
    if (errorMessage.includes('Validation failed') || errorMessage.includes('recurring daily')) {
      res.status(400).json({ success: false, error: errorMessage });
    } else {
      res.status(500).json({ success: false, error: errorMessage });
    }
  }
});


router.delete('/:id', requireAnyPermission(['delete_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const result = await campaignService.deleteCampaign(companyId, campaignId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error deleting campaign:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/start', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const result = await campaignService.startCampaign(companyId, campaignId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error starting campaign:', error);
    const message = getErrorMessage(error);
    const status = /preflight|required|cannot be started|not active/i.test(message) ? 400 : 500;
    res.status(status).json({ success: false, error: message });
  }
});


router.post('/:id/pause', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const result = await campaignService.pauseCampaign(companyId, campaignId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error pausing campaign:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/recalculate-stats', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    const beforeCampaign = await campaignService.getCampaignById(companyId, campaignId);
    const before = {
      totalRecipients: beforeCampaign.totalRecipients || 0,
      processedRecipients: beforeCampaign.processedRecipients || 0,
      successfulSends: beforeCampaign.successfulSends || 0,
      failedSends: beforeCampaign.failedSends || 0,
    };

    await campaignService.recalculateCampaignStatistics(campaignId);

    const updatedCampaign = await campaignService.getCampaignById(companyId, campaignId);

    res.json({
      success: true,
      data: {
        message: 'Campaign statistics recalculated',
        before,
        after: updatedCampaign
      }
    });
  } catch (error) {
    console.error('Error recalculating campaign stats:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/resume', requireAnyPermission(['edit_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const result = await campaignService.resumeCampaign(companyId, campaignId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error resuming campaign:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/:id/analytics', requireAnyPermission(['view_campaign_analytics']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }

    const analytics = await campaignService.getCampaignAnalytics(companyId, campaignId);
    res.json({ success: true, data: analytics });
  } catch (error) {
    console.error('Error fetching campaign analytics:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.get('/:id/details', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)));

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }


    let campaignWhatsAppAccounts: Array<{
      id: number;
      accountName: string;
      phoneNumber: string | null;
    }> = [];
    try {
      if (campaign.channelIds && Array.isArray(campaign.channelIds) && campaign.channelIds.length > 0) {
        campaignWhatsAppAccounts = await db.select({
          id: channelConnections.id,
          accountName: channelConnections.accountName,
          phoneNumber: whatsappAccounts.phoneNumber
        })
        .from(channelConnections)
        .leftJoin(whatsappAccounts, eq(channelConnections.id, whatsappAccounts.channelId))
        .where(and(
          inArray(channelConnections.id, campaign.channelIds),
          eq(channelConnections.companyId, companyId)
        ));
      }
    } catch (error) {
      console.error('Error fetching campaign WhatsApp accounts:', error);
      campaignWhatsAppAccounts = [];
    }


    let messageData = await db.select()
      .from(campaignMessages)
      .where(eq(campaignMessages.campaignId, campaignId))
      .orderBy(desc(campaignMessages.createdAt));

    let details = [];

    if (messageData.length > 0) {

      details = await Promise.all(
        messageData.map(async (messageItem) => {
          let contactName = 'Unknown';
          let phoneNumber = 'Unknown';
          let whatsappAccount = 'Unknown';
          let whatsappAccountId = 0;


          if (messageItem.recipientId) {
            try {
              const [recipient] = await db.select()
                .from(campaignRecipients)
                .where(eq(campaignRecipients.id, messageItem.recipientId));

              if (recipient && recipient.contactId) {
                const [contact] = await db.select()
                  .from(contacts)
                  .where(eq(contacts.id, recipient.contactId));

                if (contact) {
                  contactName = contact.name || contact.phone || 'Unknown';
                  phoneNumber = contact.phone || 'Unknown';
                }
              }


              if (recipient) {
                try {
                  const [queueItem] = await db.select({
                    accountId: campaignQueue.accountId
                  })
                  .from(campaignQueue)
                  .where(and(
                    eq(campaignQueue.campaignId, campaignId),
                    eq(campaignQueue.recipientId, recipient.id)
                  ))
                  .limit(1);

                  if (queueItem && queueItem.accountId) {
                    const [account] = await db.select({
                      id: channelConnections.id,
                      accountName: channelConnections.accountName
                    })
                    .from(channelConnections)
                    .where(eq(channelConnections.id, queueItem.accountId));

                    if (account) {
                      whatsappAccount = account.accountName;
                      whatsappAccountId = account.id;
                    }
                  }
                } catch (error) {
                  console.error('Error fetching WhatsApp account from queue:', error);
                }
              }
            } catch (error) {
              console.error('Error fetching contact for recipient:', messageItem.recipientId, error);
            }
          }


          if (whatsappAccount === 'Unknown' && campaignWhatsAppAccounts.length > 0) {
            whatsappAccount = campaignWhatsAppAccounts[0].accountName;
            whatsappAccountId = campaignWhatsAppAccounts[0].id;
          }

          return {
            id: messageItem.id,
            contactName,
            phoneNumber,
            whatsappAccount,
            whatsappAccountId,
            messageStatus: messageItem.status,
            sentAt: messageItem.sentAt,
            messageContent: messageItem.content,
            deliveryStatus: messageItem.whatsappStatus,
            errorMessage: messageItem.errorMessage,
          };
        })
      );
    } else {

      const recipientData = await db.select()
        .from(campaignRecipients)
        .where(eq(campaignRecipients.campaignId, campaignId))
        .orderBy(desc(campaignRecipients.createdAt));

      details = await Promise.all(
        recipientData.map(async (recipient) => {
          let contactName = 'Unknown';
          let phoneNumber = 'Unknown';
          let whatsappAccount = 'Unknown';
          let whatsappAccountId = 0;


          if (recipient.contactId) {
            try {
              const [contact] = await db.select()
                .from(contacts)
                .where(eq(contacts.id, recipient.contactId));

              if (contact) {
                contactName = contact.name || contact.phone || 'Unknown';
                phoneNumber = contact.phone || 'Unknown';
              }
            } catch (error) {
              console.error('Error fetching contact for recipient:', recipient.id, error);
            }
          }


          try {
            const [queueItem] = await db.select({
              accountId: campaignQueue.accountId
            })
            .from(campaignQueue)
            .where(and(
              eq(campaignQueue.campaignId, campaignId),
              eq(campaignQueue.recipientId, recipient.id)
            ))
            .limit(1);

            if (queueItem && queueItem.accountId) {
              const [account] = await db.select({
                id: channelConnections.id,
                accountName: channelConnections.accountName
              })
              .from(channelConnections)
              .where(eq(channelConnections.id, queueItem.accountId));

              if (account) {
                whatsappAccount = account.accountName;
                whatsappAccountId = account.id;
              }
            }
          } catch (error) {
            console.error('Error fetching WhatsApp account from queue:', error);
          }


          if (whatsappAccount === 'Unknown' && campaignWhatsAppAccounts.length > 0) {
            whatsappAccount = campaignWhatsAppAccounts[0].accountName;
            whatsappAccountId = campaignWhatsAppAccounts[0].id;
          }

          return {
            id: recipient.id,
            contactName,
            phoneNumber,
            whatsappAccount,
            whatsappAccountId,
            messageStatus: recipient.status,
            sentAt: recipient.sentAt,
            messageContent: recipient.personalizedContent || campaign.content || 'No content',
            deliveryStatus: null,
            errorMessage: recipient.errorMessage,
          };
        })
      );
    }


    const transformedDetails = details.map(detail => ({
      id: detail.id,
      contactName: detail.contactName || detail.phoneNumber || 'Unknown',
      phoneNumber: detail.phoneNumber || 'Unknown',
      whatsappAccount: detail.whatsappAccount || 'Unknown',
      whatsappAccountId: detail.whatsappAccountId || 0,
      messageStatus: detail.messageStatus || 'pending',
      sentAt: detail.sentAt ? detail.sentAt.toISOString() : null,
      messageContent: detail.messageContent || '',
      deliveryStatus: detail.deliveryStatus || null,
      errorMessage: detail.errorMessage || null,
    }));

    res.json({ success: true, data: transformedDetails });
  } catch (error) {
    console.error('Error fetching campaign details:', error);
    res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/export/csv', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);
    const { campaignName } = req.body;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)));

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }


    let campaignWhatsAppAccounts: Array<{
      id: number;
      accountName: string;
      phoneNumber: string | null;
    }> = [];
    if (campaign.channelIds && Array.isArray(campaign.channelIds) && campaign.channelIds.length > 0) {
      campaignWhatsAppAccounts = await db.select({
        id: channelConnections.id,
        accountName: channelConnections.accountName,
        phoneNumber: whatsappAccounts.phoneNumber
      })
      .from(channelConnections)
      .leftJoin(whatsappAccounts, eq(channelConnections.id, whatsappAccounts.channelId))
      .where(and(
        inArray(channelConnections.id, campaign.channelIds),
        eq(channelConnections.companyId, companyId)
      ));
    }


    const recipientData = await db.select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));


    const details = await Promise.all(
      recipientData.map(async (recipient) => {
        let contactName = 'Unknown';
        let phoneNumber = 'Unknown';
        let whatsappAccount = 'Unknown';
        let whatsappAccountId = 0;


        if (recipient.contactId) {
          try {
            const [contact] = await db.select()
              .from(contacts)
              .where(eq(contacts.id, recipient.contactId));

            if (contact) {
              contactName = contact.name || contact.phone || 'Unknown';
              phoneNumber = contact.phone || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching contact for recipient:', recipient.id, error);
          }
        }


        try {
          const [queueItem] = await db.select({
            accountId: campaignQueue.accountId
          })
          .from(campaignQueue)
          .where(and(
            eq(campaignQueue.campaignId, campaignId),
            eq(campaignQueue.recipientId, recipient.id)
          ))
          .limit(1);

          if (queueItem && queueItem.accountId) {
            const [account] = await db.select({
              id: channelConnections.id,
              accountName: channelConnections.accountName
            })
            .from(channelConnections)
            .where(eq(channelConnections.id, queueItem.accountId));

            if (account) {
              whatsappAccount = account.accountName;
              whatsappAccountId = account.id;
            }
          }
        } catch (error) {
          console.error('Error fetching WhatsApp account from queue:', error);
        }


        if (whatsappAccount === 'Unknown' && campaignWhatsAppAccounts.length > 0) {
          whatsappAccount = campaignWhatsAppAccounts[0].accountName;
          whatsappAccountId = campaignWhatsAppAccounts[0].id;
        }

        return {
          id: recipient.id,
          contactName,
          phoneNumber,
          whatsappAccount,
          whatsappAccountId,
          messageStatus: recipient.status,
          sentAt: recipient.sentAt,
          messageContent: recipient.personalizedContent || campaign.content || 'No content',
          deliveryStatus: null,
          errorMessage: recipient.errorMessage,
          createdAt: recipient.createdAt,
        };
      })
    );


    const exportRows = details.map(detail => ({
      contactName: detail.contactName || detail.phoneNumber || 'Unknown',
      phoneNumber: detail.phoneNumber || 'Unknown',
      whatsappAccount: detail.whatsappAccount || 'Unknown',
      messageStatus: detail.messageStatus || 'pending',
      sentAt: detail.sentAt,
      messageContent: detail.messageContent || '',
      deliveryStatus: detail.deliveryStatus || '',
      errorMessage: detail.errorMessage || '',
      createdAt: detail.createdAt,
    }));
    await sendTabularExport(res, {
      filename: `campaign-${campaignName || campaign.name || 'export'}-${new Date().toISOString().slice(0, 10)}`,
      format: 'csv',
      sheets: [{ name: 'Campaign Recipients', columns: [
        { key: 'contactName', header: 'Contact Name', width: 24 },
        { key: 'phoneNumber', header: 'Phone Number', width: 18 },
        { key: 'whatsappAccount', header: 'WhatsApp Account', width: 24 },
        { key: 'messageStatus', header: 'Message Status', width: 16 },
        { key: 'sentAt', header: 'Sent At', type: 'date', numberFormat: 'yyyy-mm-dd hh:mm:ss', width: 22 },
        { key: 'messageContent', header: 'Message Content', width: 48 },
        { key: 'deliveryStatus', header: 'Delivery Status', width: 18 },
        { key: 'errorMessage', header: 'Error Message', width: 36 },
        { key: 'createdAt', header: 'Created At', type: 'date', numberFormat: 'yyyy-mm-dd hh:mm:ss', width: 22 },
      ], rows: exportRows }],
    });

  } catch (error) {
    console.error('Error exporting campaign to CSV:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});


router.post('/:id/export/excel', requireAnyPermission(['view_campaigns']), async (req, res) => {
  try {
    const companyId = req.user?.companyId;
    const campaignId = parseInt(req.params.id);
    const { campaignName } = req.body;

    if (!companyId) {
      return res.status(400).json({ success: false, error: 'Company ID required' });
    }

    if (isNaN(campaignId)) {
      return res.status(400).json({ success: false, error: 'Invalid campaign ID' });
    }


    const [campaign] = await db.select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.companyId, companyId)));

    if (!campaign) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }


    let campaignWhatsAppAccounts: Array<{
      id: number;
      accountName: string;
      phoneNumber: string | null;
    }> = [];
    try {
      if (campaign.channelIds && Array.isArray(campaign.channelIds) && campaign.channelIds.length > 0) {
        campaignWhatsAppAccounts = await db.select({
          id: channelConnections.id,
          accountName: channelConnections.accountName,
          phoneNumber: whatsappAccounts.phoneNumber
        })
        .from(channelConnections)
        .leftJoin(whatsappAccounts, eq(channelConnections.id, whatsappAccounts.channelId))
        .where(and(
          inArray(channelConnections.id, campaign.channelIds),
          eq(channelConnections.companyId, companyId)
        ));
      }
    } catch (error) {
      console.error('Error fetching campaign WhatsApp accounts:', error);
      campaignWhatsAppAccounts = [];
    }


    const recipientData = await db.select()
      .from(campaignRecipients)
      .where(eq(campaignRecipients.campaignId, campaignId));


    const details = await Promise.all(
      recipientData.map(async (recipient) => {
        let contactName = 'Unknown';
        let phoneNumber = 'Unknown';
        let whatsappAccount = 'Unknown';
        let whatsappAccountId = 0;


        if (recipient.contactId) {
          try {
            const [contact] = await db.select()
              .from(contacts)
              .where(eq(contacts.id, recipient.contactId));

            if (contact) {
              contactName = contact.name || contact.phone || 'Unknown';
              phoneNumber = contact.phone || 'Unknown';
            }
          } catch (error) {
            console.error('Error fetching contact for recipient:', recipient.id, error);
          }
        }


        try {
          const [queueItem] = await db.select({
            accountId: campaignQueue.accountId
          })
          .from(campaignQueue)
          .where(and(
            eq(campaignQueue.campaignId, campaignId),
            eq(campaignQueue.recipientId, recipient.id)
          ))
          .limit(1);

          if (queueItem && queueItem.accountId) {
            const [account] = await db.select({
              id: channelConnections.id,
              accountName: channelConnections.accountName
            })
            .from(channelConnections)
            .where(eq(channelConnections.id, queueItem.accountId));

            if (account) {
              whatsappAccount = account.accountName;
              whatsappAccountId = account.id;
            }
          }
        } catch (error) {
          console.error('Error fetching WhatsApp account from queue:', error);
        }


        if (whatsappAccount === 'Unknown' && campaignWhatsAppAccounts.length > 0) {
          whatsappAccount = campaignWhatsAppAccounts[0].accountName;
          whatsappAccountId = campaignWhatsAppAccounts[0].id;
        }

        return {
          id: recipient.id,
          contactName,
          phoneNumber,
          whatsappAccount,
          whatsappAccountId,
          messageStatus: recipient.status,
          sentAt: recipient.sentAt,
          messageContent: recipient.personalizedContent || campaign.content || 'No content',
          deliveryStatus: null,
          errorMessage: recipient.errorMessage,
          createdAt: recipient.createdAt,
        };
      })
    );


    const exportRows = details.map(detail => ({
      contactName: detail.contactName || detail.phoneNumber || 'Unknown',
      phoneNumber: detail.phoneNumber || 'Unknown',
      whatsappAccount: detail.whatsappAccount || 'Unknown',
      messageStatus: detail.messageStatus || 'pending',
      sentAt: detail.sentAt,
      messageContent: detail.messageContent || '',
      deliveryStatus: detail.deliveryStatus || '',
      errorMessage: detail.errorMessage || '',
      createdAt: detail.createdAt,
    }));
    await sendTabularExport(res, {
      filename: `campaign-${campaignName || campaign.name || 'export'}-${new Date().toISOString().slice(0, 10)}`,
      format: 'xlsx',
      sheets: [{ name: 'Campaign Recipients', columns: [
        { key: 'contactName', header: 'Contact Name', width: 24 },
        { key: 'phoneNumber', header: 'Phone Number', width: 18 },
        { key: 'whatsappAccount', header: 'WhatsApp Account', width: 24 },
        { key: 'messageStatus', header: 'Message Status', width: 16 },
        { key: 'sentAt', header: 'Sent At', type: 'date', numberFormat: 'yyyy-mm-dd hh:mm:ss', width: 22 },
        { key: 'messageContent', header: 'Message Content', width: 48 },
        { key: 'deliveryStatus', header: 'Delivery Status', width: 18 },
        { key: 'errorMessage', header: 'Error Message', width: 36 },
        { key: 'createdAt', header: 'Created At', type: 'date', numberFormat: 'yyyy-mm-dd hh:mm:ss', width: 22 },
      ], rows: exportRows }],
    });

  } catch (error) {
    console.error('Error exporting campaign to CSV:', error);
    if (!res.headersSent) res.status(500).json({ success: false, error: getErrorMessage(error) });
  }
});

export default router;
