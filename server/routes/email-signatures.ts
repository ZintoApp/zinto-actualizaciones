import express from 'express';
import { storage } from '../storage';
import { ensureAuthenticated } from '../middleware';
import { InsertEmailSignature, User as SelectUser } from '@shared/schema';

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
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const signatures = await storage.getEmailSignaturesByUser(user.id);
    res.json({ success: true, data: signatures });
  } catch (error: any) {
    console.error('Error fetching email signatures:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/default', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const signature = await storage.getDefaultEmailSignature(user.id);
    res.json({ success: true, data: signature });
  } catch (error: any) {
    console.error('Error fetching default email signature:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const signatureId = parseInt(req.params.id);
    const signature = await storage.getEmailSignatureById(signatureId);

    if (!signature) {
      return res.status(404).json({ success: false, error: 'Signature not found' });
    }

    if (signature.userId !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    res.json({ success: true, data: signature });
  } catch (error: any) {
    console.error('Error fetching email signature:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const { name, htmlContent, plainTextContent, isDefault } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required'
      });
    }

    if (!htmlContent && !plainTextContent) {
      return res.status(400).json({
        success: false,
        error: 'Either HTML content or plain text content is required'
      });
    }

    if (!user.companyId) {
      return res.status(403).json({ success: false, error: 'No company association found' });
    }

    const signatureData: InsertEmailSignature = {
      userId: user.id,
      companyId: user.companyId,
      name,
      htmlContent: htmlContent || null,
      plainTextContent: plainTextContent || null,
      isDefault: isDefault || false,
      isActive: true
    };

    const signature = await storage.createEmailSignature(signatureData);
    res.status(201).json({ success: true, data: signature });
  } catch (error: any) {
    console.error('Error creating email signature:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const signatureId = parseInt(req.params.id);
    const { name, htmlContent, plainTextContent, isDefault, isActive } = req.body;

    const existingSignature = await storage.getEmailSignatureById(signatureId);
    if (!existingSignature) {
      return res.status(404).json({ success: false, error: 'Signature not found' });
    }

    if (existingSignature.userId !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const updates: Partial<InsertEmailSignature> = {};
    if (name !== undefined) updates.name = name;
    if (htmlContent !== undefined) updates.htmlContent = htmlContent;
    if (plainTextContent !== undefined) updates.plainTextContent = plainTextContent;
    if (isDefault !== undefined) updates.isDefault = isDefault;
    if (isActive !== undefined) updates.isActive = isActive;

    const signature = await storage.updateEmailSignature(signatureId, updates);
    res.json({ success: true, data: signature });
  } catch (error: any) {
    console.error('Error updating email signature:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', ensureAuthenticated, async (req, res) => {
  try {
    const user = req.user as SelectUser;
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not authenticated' });
    }

    const signatureId = parseInt(req.params.id);

    const existingSignature = await storage.getEmailSignatureById(signatureId);
    if (!existingSignature) {
      return res.status(404).json({ success: false, error: 'Signature not found' });
    }

    if (existingSignature.userId !== user.id) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    await storage.deleteEmailSignature(signatureId);
    res.json({ success: true, message: 'Signature deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting email signature:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
