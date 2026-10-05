import { Router } from 'express';
import { ensureSuperAdmin } from '../middleware';
import { aiCredentialsService } from '../services/ai-credentials-service';
import { z } from 'zod';
import { aiLlmProviderSchema, requireAzureEndpointWhenProviderAzure } from '@shared/ai-providers';

const router = Router();


const createSystemCredentialSchema = z.object({
  provider: aiLlmProviderSchema,
  apiKey: z.string().min(1, 'API key is required'),
  displayName: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  usageLimitMonthly: z.number().optional(),
  endpoint: z.string().optional(),
  apiVersion: z.string().optional(),
  defaultChatDeployment: z.string().optional(),
}).superRefine(requireAzureEndpointWhenProviderAzure);

const updateSystemCredentialSchema = z.object({
  provider: aiLlmProviderSchema.optional(),
  apiKey: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  usageLimitMonthly: z.number().optional(),
  endpoint: z.string().optional(),
  apiVersion: z.string().optional(),
  defaultChatDeployment: z.string().optional(),
}).superRefine(requireAzureEndpointWhenProviderAzure);

const validateCredentialSchema = z.object({
  provider: aiLlmProviderSchema,
  apiKey: z.string().min(1, 'API key is required'),
  endpoint: z.string().optional(),
  apiVersion: z.string().optional(),
}).superRefine(requireAzureEndpointWhenProviderAzure);


router.get('/', ensureSuperAdmin, async (req, res) => {
  try {
    const credentials = await aiCredentialsService.getSystemCredentials();
    

    const safeCredentials = credentials.map(cred => ({
      ...cred,
      apiKeyEncrypted: undefined,
      apiKeyPreview: `${cred.provider}_****${cred.apiKeyEncrypted.slice(-4)}`
    }));

    res.json({
      success: true,
      data: safeCredentials
    });
  } catch (error) {
    console.error('Error fetching system AI credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AI credentials'
    });
  }
});

router.get('/:id/reveal', ensureSuperAdmin, async (req, res) => {
  try {
    const credentialId = parseInt(req.params.id, 10);
    if (isNaN(credentialId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential ID'
      });
    }

    const apiKey = await aiCredentialsService.revealSystemCredential(credentialId);
    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'Credential not found'
      });
    }

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: { apiKey }
    });
  } catch (error) {
    console.error('Error revealing system AI credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reveal AI credential'
    });
  }
});


router.post('/', ensureSuperAdmin, async (req, res) => {
  try {
    const validatedData = createSystemCredentialSchema.parse(req.body);
    
    const credential = await aiCredentialsService.createSystemCredential(validatedData);
    

    const safeCredential = {
      ...credential,
      apiKeyEncrypted: undefined,
      apiKeyPreview: `${credential.provider}_****${credential.apiKeyEncrypted.slice(-4)}`
    };

    res.status(201).json({
      success: true,
      message: 'AI credential created successfully',
      data: safeCredential
    });
  } catch (error) {
    console.error('Error creating system AI credential:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create AI credential'
    });
  }
});


router.put('/:id', ensureSuperAdmin, async (req, res) => {
  try {
    const credentialId = parseInt(req.params.id);
    if (isNaN(credentialId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential ID'
      });
    }

    const validatedData = updateSystemCredentialSchema.parse(req.body);

    const updatedCredential = await aiCredentialsService.updateSystemCredential(credentialId, validatedData);


    const safeCredential = {
      ...updatedCredential,
      apiKeyEncrypted: undefined,
      apiKeyPreview: `${updatedCredential.provider}_****${updatedCredential.apiKeyEncrypted.slice(-4)}`
    };

    res.json({
      success: true,
      message: 'AI credential updated successfully',
      data: safeCredential
    });
  } catch (error) {
    console.error('Error updating system AI credential:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update AI credential'
    });
  }
});


router.delete('/:id', ensureSuperAdmin, async (req, res) => {
  try {
    const credentialId = parseInt(req.params.id);
    if (isNaN(credentialId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential ID'
      });
    }

    await aiCredentialsService.deleteSystemCredential(credentialId);

    res.json({
      success: true,
      message: 'AI credential deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting system AI credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete AI credential'
    });
  }
});


router.post('/validate', ensureSuperAdmin, async (req, res) => {
  try {
    const { provider, apiKey, endpoint, apiVersion } = validateCredentialSchema.parse(req.body);
    
    const validation = await aiCredentialsService.validateApiKey(provider, apiKey, { endpoint, apiVersion });
    
    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Error validating API key:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to validate API key'
    });
  }
});


router.post('/:id/test', ensureSuperAdmin, async (req, res) => {
  try {
    const credentialId = parseInt(req.params.id);
    if (isNaN(credentialId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential ID'
      });
    }

    const result = await aiCredentialsService.testSystemCredential(credentialId);

    res.json({
      success: true,
      message: 'AI credential tested successfully',
      data: result
    });
  } catch (error) {
    console.error('Error testing system AI credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test AI credential'
    });
  }
});


router.post('/:id/revalidate', ensureSuperAdmin, async (req, res) => {
  try {
    const credentialId = parseInt(req.params.id);
    if (isNaN(credentialId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential ID'
      });
    }

    const result = await aiCredentialsService.testSystemCredential(credentialId);

    res.json({
      success: true,
      message: 'AI credential revalidated successfully',
      data: result
    });
  } catch (error) {
    console.error('Error revalidating AI credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revalidate AI credential'
    });
  }
});


router.get('/usage', ensureSuperAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate as string) : undefined;
    const end = endDate ? new Date(endDate as string) : undefined;

    const usageStats = await aiCredentialsService.getSystemUsageStats(start, end);

    res.json({
      success: true,
      data: usageStats
    });
  } catch (error) {
    console.error('Error fetching system usage statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system usage statistics'
    });
  }
});

export default router;
