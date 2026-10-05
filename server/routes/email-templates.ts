import express from 'express';
import { storage } from '../storage';
import { ensureAuthenticated } from '../middleware';
import { InsertEmailTemplate, User as SelectUser } from '@shared/schema';

declare global {
  namespace Express {
    interface Request {
      user?: SelectUser;
    }
  }
}

const router = express.Router();

router.get('/', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user || !user.companyId) {
      return res.status(403).json({ success: false, error: 'No company association found' });
    }

    const templates = await storage.getEmailTemplatesByCompany(user.companyId);
    res.json({ success: true, data: templates });
  } catch (error: any) {
    console.error('Error fetching email templates:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user || !user.companyId) {
      return res.status(403).json({ success: false, error: 'No company association found' });
    }

    const templateId = parseInt(req.params.id);
    const template = await storage.getEmailTemplateById(templateId);

    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    if (template.companyId !== user.companyId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('Error fetching email template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user || !user.companyId) {
      return res.status(403).json({ success: false, error: 'No company association found' });
    }

    const { name, description, category, subject, htmlContent, plainTextContent, variables } = req.body;

    if (!name || !subject) {
      return res.status(400).json({
        success: false,
        error: 'Name and subject are required'
      });
    }

    const templateData: InsertEmailTemplate = {
      companyId: user.companyId,
      createdById: user.id,
      name,
      description: description || null,
      category: category || 'general',
      subject,
      htmlContent: htmlContent || null,
      plainTextContent: plainTextContent || null,
      variables: variables || [],
      isActive: true
    };

    const template = await storage.createEmailTemplate(templateData);
    res.status(201).json({ success: true, data: template });
  } catch (error: any) {
    console.error('Error creating email template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user || !user.companyId) {
      return res.status(403).json({ success: false, error: 'No company association found' });
    }

    const templateId = parseInt(req.params.id);
    const { name, description, category, subject, htmlContent, plainTextContent, variables, isActive } = req.body;

    const existingTemplate = await storage.getEmailTemplateById(templateId);
    if (!existingTemplate) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    if (existingTemplate.companyId !== user.companyId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updates: Partial<InsertEmailTemplate> = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (category !== undefined) updates.category = category;
    if (subject !== undefined) updates.subject = subject;
    if (htmlContent !== undefined) updates.htmlContent = htmlContent;
    if (plainTextContent !== undefined) updates.plainTextContent = plainTextContent;
    if (variables !== undefined) updates.variables = variables;
    if (isActive !== undefined) updates.isActive = isActive;

    const template = await storage.updateEmailTemplate(templateId, updates);
    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('Error updating email template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user || !user.companyId) {
      return res.status(403).json({ success: false, error: 'No company association found' });
    }

    const templateId = parseInt(req.params.id);

    const existingTemplate = await storage.getEmailTemplateById(templateId);
    if (!existingTemplate) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    if (existingTemplate.companyId !== user.companyId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await storage.deleteEmailTemplate(templateId);
    res.json({ success: true, message: 'Template deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting email template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/use', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user || !user.companyId) {
      return res.status(403).json({ success: false, error: 'No company association found' });
    }

    const templateId = parseInt(req.params.id);

    const template = await storage.getEmailTemplateById(templateId);
    if (!template) {
      return res.status(404).json({ success: false, error: 'Template not found' });
    }

    if (template.companyId !== user.companyId) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await storage.incrementEmailTemplateUsage(templateId);
    res.json({ success: true, message: 'Template usage recorded' });
  } catch (error: any) {
    console.error('Error recording template usage:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
