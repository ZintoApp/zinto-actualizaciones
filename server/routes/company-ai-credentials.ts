import { Router } from 'express';
import { ensureAuthenticated, ensureAdmin } from '../middleware';
import { aiCredentialsService } from '../services/ai-credentials-service';
import { z } from 'zod';
import { aiLlmProviderSchema, requireAzureEndpointWhenProviderAzure } from '@shared/ai-providers';

const router = Router();


const createCompanyCredentialSchema = z.object({
  provider: aiLlmProviderSchema,
  apiKey: z.string().min(1, 'API key is required'),
  displayName: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  usageLimitMonthly: z.number().optional(),
  endpoint: z.string().optional(),
  apiVersion: z.string().optional(),
  defaultChatDeployment: z.string().optional(),
}).superRefine(requireAzureEndpointWhenProviderAzure);

const updateCompanyCredentialSchema = z.object({
  provider: aiLlmProviderSchema.optional(),
  apiKey: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  usageLimitMonthly: z.number().optional(),
  endpoint: z.string().optional(),
  apiVersion: z.string().optional(),
  defaultChatDeployment: z.string().optional(),
}).superRefine(requireAzureEndpointWhenProviderAzure);

const updatePreferencesSchema = z.object({
  defaultProvider: aiLlmProviderSchema.optional(),
  credentialPreference: z.enum(['company', 'system', 'auto']).optional(),
  fallbackEnabled: z.boolean().optional(),
  usageAlertsEnabled: z.boolean().optional(),
  usageAlertThreshold: z.number().min(1).max(100).optional()
});


router.get('/', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
  try {
    const companyId = req.user.companyId;
    const credentials = await aiCredentialsService.getCompanyCredentials(companyId);
    

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
    console.error('Error fetching company AI credentials:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AI credentials'
    });
  }
});

router.get('/:id/reveal', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
  try {
    const credentialId = parseInt(req.params.id, 10);
    const companyId = req.user.companyId;

    if (isNaN(credentialId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential ID'
      });
    }

    const apiKey = await aiCredentialsService.revealCompanyCredential(credentialId, companyId);
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
    console.error('Error revealing company AI credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reveal AI credential'
    });
  }
});


router.post('/validate', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
  try {
    const { provider, apiKey, endpoint, apiVersion } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Provider and API key are required'
      });
    }

    if (provider === 'azure' && !endpoint) {
      return res.status(400).json({
        success: false,
        error: 'Azure endpoint is required'
      });
    }

    const validation = await aiCredentialsService.validateApiKey(provider, apiKey, { endpoint, apiVersion });

    res.json({
      success: true,
      data: validation
    });
  } catch (error) {
    console.error('Error validating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate API key'
    });
  }
});


router.get('/preferences', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user.companyId;

    const preferences = await aiCredentialsService.getCompanyPreferences(companyId);


    const defaultPreferences = {
      defaultProvider: 'gemini',
      credentialPreference: 'auto',
      fallbackEnabled: true,
      usageAlertsEnabled: true,
      usageAlertThreshold: 80
    };

    res.json({
      success: true,
      data: preferences || defaultPreferences
    });
  } catch (error) {
    console.error('Error fetching AI preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch AI preferences'
    });
  }
});


router.get('/availability', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user.companyId;
    const provider = (req.query.provider as string) || 'openrouter';
    const preference = (req.query.preference as 'company' | 'system' | 'auto') || 'auto';

    const credential = await aiCredentialsService.getCredentialWithPreference(
      companyId,
      provider,
      preference
    );

    res.json({
      success: true,
      data: { available: !!credential }
    });
  } catch (error) {
    console.error('Error checking credential availability:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check credential availability'
    });
  }
});

router.put('/preferences', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
  try {
    const companyId = req.user.companyId;
    const validatedData = updatePreferencesSchema.parse(req.body);

    const updatedPreferences = await aiCredentialsService.updateCompanyPreferences(companyId, validatedData);

    res.json({
      success: true,
      message: 'AI preferences updated successfully',
      data: updatedPreferences
    });
  } catch (error) {
    console.error('Error updating AI preferences:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update AI preferences'
    });
  }
});


router.post('/', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
  try {
    const companyId = req.user.companyId;
    const validatedData = createCompanyCredentialSchema.parse(req.body);

    const credential = await aiCredentialsService.createCompanyCredential({
      ...validatedData,
      companyId
    });


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
    console.error('Error creating company AI credential:', error);

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


router.put('/:id', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
  try {
    const credentialId = parseInt(req.params.id);
    const companyId = req.user.companyId;

    if (isNaN(credentialId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential ID'
      });
    }

    const validatedData = updateCompanyCredentialSchema.parse(req.body);

    const updatedCredential = await aiCredentialsService.updateCompanyCredential(credentialId, companyId, validatedData);


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
    console.error('Error updating company AI credential:', error);

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


router.post('/:id/test', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
  try {
    const credentialId = parseInt(req.params.id);
    const companyId = req.user.companyId;

    if (isNaN(credentialId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential ID'
      });
    }

    const result = await aiCredentialsService.testCompanyCredential(credentialId, companyId);

    res.json({
      success: true,
      message: 'AI credential tested successfully',
      data: result
    });
  } catch (error) {
    console.error('Error testing company AI credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to test AI credential'
    });
  }
});


router.delete('/:id', ensureAuthenticated, ensureAdmin, async (req: any, res) => {
  try {
    const credentialId = parseInt(req.params.id);
    const companyId = req.user.companyId;

    if (isNaN(credentialId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid credential ID'
      });
    }

    await aiCredentialsService.deleteCompanyCredential(credentialId, companyId);

    res.json({
      success: true,
      message: 'AI credential deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting company AI credential:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete AI credential'
    });
  }
});


router.get('/usage', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user.companyId;
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    const usageStats = await aiCredentialsService.getCompanyUsageStats(companyId, start, end);

    res.json({
      success: true,
      data: usageStats
    });
  } catch (error) {
    console.error('Error fetching company AI usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage statistics'
    });
  }
});


router.get('/usage/alerts', ensureAuthenticated, async (req: any, res) => {
  try {
    const companyId = req.user.companyId;

    const alertsData = await aiCredentialsService.checkUsageLimits(companyId);

    res.json({
      success: true,
      data: alertsData
    });
  } catch (error) {
    console.error('Error checking usage limits:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check usage limits'
    });
  }
});

export default router;
