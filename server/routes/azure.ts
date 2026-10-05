import { Router } from 'express';
import { z } from 'zod';
import { ensureAuthenticated } from '../middleware';
import { aiCredentialsService, azureConnectionFromCredentialSource } from '../services/ai-credentials-service';
import { listAzureDeployments, requireAzureConnection } from '../services/azure-openai';
import { DEFAULT_AZURE_OPENAI_API_VERSION } from '@shared/ai-providers';

const router = Router();

const previewSchema = z.object({
  apiKey: z.string().min(1),
  endpoint: z.string().min(1),
  apiVersion: z.string().optional(),
});

router.get('/deployments', ensureAuthenticated, async (req: any, res) => {
  try {
    const preference = (req.query.preference as 'company' | 'system' | 'auto') || 'auto';
    const companyId = req.user?.companyId;
    if (!companyId && req.user?.role !== 'super_admin') {
      return res.status(400).json({ success: false, error: 'Company context is required' });
    }

    const credential = companyId
      ? await aiCredentialsService.getCredentialWithPreference(companyId, 'azure', preference)
      : await aiCredentialsService.getSystemOrEnvCredential('azure');

    const connection = azureConnectionFromCredentialSource(credential);
    if (!connection) {
      return res.status(404).json({
        success: false,
        error: 'No Azure OpenAI credentials configured. Add an Azure credential in AI settings.',
      });
    }

    const deployments = await listAzureDeployments(connection);
    res.json({ success: true, data: deployments });
  } catch (error) {
    console.error('Error listing Azure deployments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list Azure deployments',
    });
  }
});

router.post('/deployments', ensureAuthenticated, async (req: any, res) => {
  try {
    const parsed = previewSchema.parse(req.body);
    const connection = requireAzureConnection(
      parsed.apiKey,
      parsed.endpoint,
      parsed.apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION
    );
    const deployments = await listAzureDeployments(connection);
    res.json({ success: true, data: deployments });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Validation error', details: error.errors });
    }
    console.error('Error listing Azure deployments:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list Azure deployments',
    });
  }
});

export default router;
