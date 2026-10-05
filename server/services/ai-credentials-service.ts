import { appSumoCompanyPolicy, assertAppSumoAccess } from './appsumo-policy';
import { db } from '../db';
import { storage } from '../storage';
import { 
  systemAiCredentials, 
  companyAiCredentials, 
  companyAiPreferences,
  aiCredentialUsage,
  SystemAiCredential,
  CompanyAiCredential,
  CompanyAiPreferences,
  InsertSystemAiCredential,
  InsertCompanyAiCredential,
  InsertAiCredentialUsage
} from '@shared/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';
import OpenAI from 'openai';
import { getEnvironmentKeyForProvider } from './ai-credential-env';
import {
  buildAzureCredentialMetadata,
  parseAzureCredentialMetadata,
  type AzureConnectionConfig,
} from '@shared/ai-providers';
import { listAzureDeployments, requireAzureConnection } from './azure-openai';



interface ValidationResult {
  isValid: boolean;
  error?: string;
  metadata?: any;
}

interface CredentialSource {
  type: 'system' | 'company' | 'environment';
  credential?: SystemAiCredential | CompanyAiCredential;
  apiKey: string;
  azureEndpoint?: string;
  azureApiVersion?: string;
  defaultChatDeployment?: string;
}

type AzureCredentialInput = {
  endpoint?: string;
  apiVersion?: string;
  defaultChatDeployment?: string;
};

function attachAzureConnection(
  source: CredentialSource
): CredentialSource {
  const meta = parseAzureCredentialMetadata(source.credential?.metadata);
  if (!meta) {
    return source;
  }
  return {
    ...source,
    azureEndpoint: meta.endpoint,
    azureApiVersion: meta.apiVersion,
    defaultChatDeployment: meta.defaultChatDeployment,
  };
}

export function azureConnectionFromCredentialSource(
  source: CredentialSource | null | undefined
): AzureConnectionConfig | null {
  if (!source?.apiKey || !source.azureEndpoint) {
    return null;
  }
  return {
    apiKey: source.apiKey,
    endpoint: source.azureEndpoint,
    apiVersion: source.azureApiVersion || '2024-10-21',
    defaultChatDeployment: source.defaultChatDeployment,
  };
}

/**
 * AI Credentials Service
 * Handles encryption, validation, and management of AI provider credentials
 */
export class AiCredentialsService {
  private encryptionKey: string;

  constructor() {
    this.encryptionKey = process.env.ENCRYPTION_KEY || process.env.SESSION_SECRET || 'default-key';
  }

  /**
   * Encrypt API key for secure storage
   */
  private encryptApiKey(apiKey: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private extractAzureMetadata(
    provider: string,
    input: AzureCredentialInput & { metadata?: unknown }
  ): Record<string, unknown> | undefined {
    if (provider.toLowerCase() !== 'azure') {
      return input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, unknown>)
        : undefined;
    }
    const existing =
      input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
        ? (input.metadata as Record<string, unknown>)
        : {};
    const built = buildAzureCredentialMetadata({
      endpoint: input.endpoint || String(existing.endpoint || ''),
      apiVersion: input.apiVersion || (typeof existing.apiVersion === 'string' ? existing.apiVersion : undefined),
      defaultChatDeployment:
        input.defaultChatDeployment ??
        (typeof existing.defaultChatDeployment === 'string' ? existing.defaultChatDeployment : undefined),
    });
    return { ...existing, ...built };
  }

  /**
   * Decrypt API key for use
   */
  private decryptApiKey(encryptedKey: string): string {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
      let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      throw new Error('Invalid encrypted API key');
    }
  }

  /**
   * Validate API key with the respective provider
   */
  async validateApiKey(
    provider: string,
    apiKey: string,
    azure?: AzureCredentialInput
  ): Promise<ValidationResult> {
    try {
      switch (provider.toLowerCase()) {
        case 'openai':
          return await this.validateOpenAIKey(apiKey);
        case 'openrouter':
          return await this.validateOpenRouterKey(apiKey);
        case 'azure':
          return await this.validateAzureKey(apiKey, azure);
        default:
          return { isValid: false, error: 'Unsupported provider' };
      }
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed'
      };
    }
  }

  private async validateOpenAIKey(apiKey: string): Promise<ValidationResult> {
    try {
      const openai = new OpenAI({ apiKey });
      const response = await openai.models.list();
      return { 
        isValid: true, 
        metadata: { 
          modelCount: response.data.length,
          organization: response.data[0]?.owned_by 
        } 
      };
    } catch (error: any) {
      return { 
        isValid: false, 
        error: error.message || 'Invalid OpenAI API key' 
      };
    }
  }

  private async validateAzureKey(
    apiKey: string,
    azure?: AzureCredentialInput
  ): Promise<ValidationResult> {
    try {
      const connection = requireAzureConnection(apiKey, azure?.endpoint, azure?.apiVersion, azure?.defaultChatDeployment);
      const deployments = await listAzureDeployments(connection);
      return {
        isValid: true,
        metadata: {
          deploymentCount: deployments.length,
          deployments,
        },
      };
    } catch (error: any) {
      return {
        isValid: false,
        error: error?.message || 'Invalid Azure OpenAI credentials',
      };
    }
  }

  private async validateOpenRouterKey(apiKey: string): Promise<ValidationResult> {
    try {
      const openrouter = new OpenAI({
        apiKey,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://bothive.pro',
          'X-Title': 'BotHive'
        }
      });

      const response = await openrouter.chat.completions.create({
        model: 'openai/gpt-4.1-mini',
        // OpenRouter/Azure routes reject max_output_tokens < 16 (maps from max_tokens)
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Hi' }]
      });
      return {
        isValid: true,
        metadata: {
          model: response.model,
          usage: response.usage
        }
      };
    } catch (error: any) {
      return {
        isValid: false,
        error: error.message || 'Invalid OpenRouter API key'
      };
    }
  }



  /**
   * Create system-wide AI credential (super admin only)
   */
  async createSystemCredential(data: Omit<InsertSystemAiCredential, 'apiKeyEncrypted'> & { apiKey: string } & AzureCredentialInput): Promise<SystemAiCredential> {
    const { apiKey, endpoint, apiVersion, defaultChatDeployment, ...credentialData } = data;

    const validation = await this.validateApiKey(data.provider, apiKey, { endpoint, apiVersion, defaultChatDeployment });
    
    const encryptedKey = this.encryptApiKey(apiKey);
    const metadata = this.extractAzureMetadata(data.provider, { endpoint, apiVersion, defaultChatDeployment, metadata: credentialData.metadata });
    
    const [credential] = await db.insert(systemAiCredentials).values({
      ...credentialData,
      metadata: metadata ?? credentialData.metadata,
      apiKeyEncrypted: encryptedKey,
      validationStatus: validation.isValid ? 'valid' : 'invalid',
      validationError: validation.error,
      lastValidatedAt: new Date()
    }).returning();

    return credential;
  }

  /**
   * Create company-specific AI credential
   */
  async createCompanyCredential(data: Omit<InsertCompanyAiCredential, 'apiKeyEncrypted'> & { apiKey: string } & AzureCredentialInput): Promise<CompanyAiCredential> {
    const { apiKey, endpoint, apiVersion, defaultChatDeployment, ...credentialData } = data;

    const validation = await this.validateApiKey(data.provider, apiKey, { endpoint, apiVersion, defaultChatDeployment });
    
    const encryptedKey = this.encryptApiKey(apiKey);
    const metadata = this.extractAzureMetadata(data.provider, { endpoint, apiVersion, defaultChatDeployment, metadata: credentialData.metadata });
    
    const [credential] = await db.insert(companyAiCredentials).values({
      ...credentialData,
      metadata: metadata ?? credentialData.metadata,
      apiKeyEncrypted: encryptedKey,
      validationStatus: validation.isValid ? 'valid' : 'invalid',
      validationError: validation.error,
      lastValidatedAt: new Date()
    }).returning();

    return credential;
  }

  /**
   * Get system-level or environment credentials, skipping company-level DB lookups.
   * Use for startup-time or non-company-scoped operations (e.g. companyId 0).
   */
  async getSystemOrEnvCredential(provider: string): Promise<CredentialSource | null> {
    const [systemCredential] = await db.select()
      .from(systemAiCredentials)
      .where(and(
        eq(systemAiCredentials.provider, provider),
        eq(systemAiCredentials.isActive, true)
      ))
      .orderBy(desc(systemAiCredentials.isDefault));

    if (systemCredential && systemCredential.validationStatus === 'valid') {
      return attachAzureConnection({
        type: 'system',
        credential: systemCredential,
        apiKey: this.decryptApiKey(systemCredential.apiKeyEncrypted)
      });
    }

    if (provider.toLowerCase() === 'azure') {
      return null;
    }

    const envKey = this.getEnvironmentKey(provider);
    if (envKey) {
      return {
        type: 'environment',
        apiKey: envKey
      };
    }

    return null;
  }

  /**
   * Get the best available credential for a company and provider
   */
  async getCredentialForCompany(companyId: number, provider: string): Promise<CredentialSource | null> {
    await assertAppSumoAccess(companyId);
    if ((await appSumoCompanyPolicy(companyId)).managed) return this.getCredentialWithPreference(companyId, provider, 'company');

    const [preferences] = await db.select()
      .from(companyAiPreferences)
      .where(eq(companyAiPreferences.companyId, companyId));

    const credentialPreference = preferences?.credentialPreference || 'auto';


    if (credentialPreference === 'company' || credentialPreference === 'auto') {
      const [companyCredential] = await db.select()
        .from(companyAiCredentials)
        .where(and(
          eq(companyAiCredentials.companyId, companyId),
          eq(companyAiCredentials.provider, provider),
          eq(companyAiCredentials.isActive, true)
        ));

      if (companyCredential && companyCredential.validationStatus === 'valid') {
        return attachAzureConnection({
          type: 'company',
          credential: companyCredential,
          apiKey: this.decryptApiKey(companyCredential.apiKeyEncrypted)
        });
      }
    }


    if (credentialPreference === 'system' || credentialPreference === 'auto' || !preferences?.fallbackEnabled) {
      const [systemCredential] = await db.select()
        .from(systemAiCredentials)
        .where(and(
          eq(systemAiCredentials.provider, provider),
          eq(systemAiCredentials.isActive, true)
        ))
        .orderBy(desc(systemAiCredentials.isDefault));

      if (systemCredential && systemCredential.validationStatus === 'valid') {
        return attachAzureConnection({
          type: 'system',
          credential: systemCredential,
          apiKey: this.decryptApiKey(systemCredential.apiKeyEncrypted)
        });
      }
    }


    if (provider.toLowerCase() === 'azure') {
      return null;
    }

    const envKey = this.getEnvironmentKey(provider);
    if (envKey) {
      return {
        type: 'environment',
        apiKey: envKey
      };
    }

    return null;
  }

  /**
   * Get credential with specific preference override (for node-level configuration)
   * Also checks if AI billing is enabled for the company's plan
   */
  async getCredentialWithPreference(
    companyId: number,
    provider: string,
    preferenceOverride: 'company' | 'system' | 'auto'
  ): Promise<CredentialSource | null> {

    await assertAppSumoAccess(companyId);
    const credentialPreference = (await appSumoCompanyPolicy(companyId)).managed ? 'company' : preferenceOverride;


    if (credentialPreference === 'company' || credentialPreference === 'auto') {
      const [companyCredential] = await db.select()
        .from(companyAiCredentials)
        .where(and(
          eq(companyAiCredentials.companyId, companyId),
          eq(companyAiCredentials.provider, provider),
          eq(companyAiCredentials.isActive, true)
        ));

      if (companyCredential && companyCredential.validationStatus === 'valid') {
        return attachAzureConnection({
          type: 'company',
          credential: companyCredential,
          apiKey: this.decryptApiKey(companyCredential.apiKeyEncrypted)
        });
      }


      if (credentialPreference === 'company') {
        return null;
      }
    }


    if (credentialPreference === 'system' || credentialPreference === 'auto') {
      const [systemCredential] = await db.select()
        .from(systemAiCredentials)
        .where(and(
          eq(systemAiCredentials.provider, provider),
          eq(systemAiCredentials.isActive, true)
        ))
        .orderBy(desc(systemAiCredentials.isDefault));

      if (systemCredential && systemCredential.validationStatus === 'valid') {
        return attachAzureConnection({
          type: 'system',
          credential: systemCredential,
          apiKey: this.decryptApiKey(systemCredential.apiKeyEncrypted)
        });
      }


      if (credentialPreference === 'system') {
        return null;
      }
    }


    if (credentialPreference === 'auto' && provider.toLowerCase() !== 'azure') {
      const envKey = this.getEnvironmentKey(provider);
      if (envKey) {
        return {
          type: 'environment',
          apiKey: envKey
        };
      }
    }

    return null;
  }

  async getCompanyCredentialById(
    companyId: number,
    provider: string,
    credentialId: number
  ): Promise<CredentialSource | null> {
    await assertAppSumoAccess(companyId);
    const [companyCredential] = await db.select()
      .from(companyAiCredentials)
      .where(and(
        eq(companyAiCredentials.id, credentialId),
        eq(companyAiCredentials.companyId, companyId),
        eq(companyAiCredentials.provider, provider),
        eq(companyAiCredentials.isActive, true)
      ));

    if (!companyCredential || companyCredential.validationStatus !== 'valid') {
      return null;
    }

    return attachAzureConnection({
      type: 'company',
      credential: companyCredential,
      apiKey: this.decryptApiKey(companyCredential.apiKeyEncrypted)
    });
  }

  private getEnvironmentKey(provider: string): string | null {
    return getEnvironmentKeyForProvider(provider);
  }

  /**
   * Track AI credential usage for billing
   */
  async trackUsage(data: InsertAiCredentialUsage): Promise<void> {
    await db.insert(aiCredentialUsage).values(data);
  }

  /**
   * Estimate cost based on provider, model, and token usage
   */
  estimateCost(provider: string, model: string, tokensInput: number, tokensOutput: number): number {
    if (provider.toLowerCase() === 'azure') {
      return 0;
    }

    const pricingTable: Record<string, Record<string, { input: number; output: number }>> = {
      openai: {
        'gpt-5.6-sol': { input: 0.004, output: 0.02 },
        'gpt-5.6-terra': { input: 0.002, output: 0.012 },
        'gpt-5.6-luna': { input: 0.0002, output: 0.0012 },
        'gpt-5.1': { input: 0.003, output: 0.012 },
        'gpt-5-chat': { input: 0.0025, output: 0.01 },
        'gpt-4.1-mini': { input: 0.0002, output: 0.0008 },
        'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
        'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
        'default': { input: 0.0025, output: 0.01 }
      },
      openrouter: {
        'openai/gpt-5.6-sol': { input: 0.004, output: 0.02 },
        'openai/gpt-5.6-terra': { input: 0.002, output: 0.012 },
        'openai/gpt-5.6-luna': { input: 0.0002, output: 0.0012 },
        'openai/gpt-5.1': { input: 0.003, output: 0.012 },
        'openai/gpt-5-chat': { input: 0.0025, output: 0.01 },
        'openai/gpt-4.1-mini': { input: 0.0002, output: 0.0008 },
        'openai/gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
        'google/gemini-2.5-pro': { input: 0.00125, output: 0.005 },
        'google/gemini-2.5-flash': { input: 0.000125, output: 0.000375 },
        'google/gemini-2.0-flash-001': { input: 0.0001, output: 0.0003 },
        'deepseek/deepseek-chat-v3.1': { input: 0.00014, output: 0.00028 },
        'x-ai/grok-4': { input: 0.003, output: 0.012 },
        'qwen/qwen3-32b': { input: 0.0002, output: 0.0002 },
        'default': { input: 0.001, output: 0.003 }
      }
    };

    const providerPricing = pricingTable[provider.toLowerCase()];
    if (!providerPricing) {
      return 0; // Unknown provider
    }

    const modelPricing = providerPricing[model] || providerPricing['default'];

    const inputCost = (tokensInput / 1000) * modelPricing.input;
    const outputCost = (tokensOutput / 1000) * modelPricing.output;

    return inputCost + outputCost;
  }

  /**
   * Enhanced usage tracking with automatic cost estimation
   */
  async trackUsageWithCost(data: Omit<InsertAiCredentialUsage, 'costEstimated'> & {
    tokensInput: number;
    tokensOutput: number;
    model: string;
  }): Promise<void> {
    const estimatedCost = this.estimateCost(data.provider, data.model, data.tokensInput, data.tokensOutput);

    await this.trackUsage({
      ...data,
      costEstimated: estimatedCost.toFixed(6)
    });
  }

  /**
   * Get system credentials (super admin only)
   */
  async getSystemCredentials(): Promise<SystemAiCredential[]> {
    return await db.select().from(systemAiCredentials).orderBy(desc(systemAiCredentials.createdAt));
  }

  /**
   * Get company credentials
   */
  async getCompanyCredentials(companyId: number): Promise<CompanyAiCredential[]> {
    return await db.select()
      .from(companyAiCredentials)
      .where(eq(companyAiCredentials.companyId, companyId))
      .orderBy(desc(companyAiCredentials.createdAt));
  }

  /**
   * Reveal a system credential to an authorized caller.
   */
  async revealSystemCredential(credentialId: number): Promise<string | null> {
    const [credential] = await db.select({
      apiKeyEncrypted: systemAiCredentials.apiKeyEncrypted
    })
      .from(systemAiCredentials)
      .where(eq(systemAiCredentials.id, credentialId));

    return credential ? this.decryptApiKey(credential.apiKeyEncrypted) : null;
  }

  /**
   * Reveal a company credential while enforcing tenant ownership.
   */
  async revealCompanyCredential(credentialId: number, companyId: number): Promise<string | null> {
    const [credential] = await db.select({
      apiKeyEncrypted: companyAiCredentials.apiKeyEncrypted
    })
      .from(companyAiCredentials)
      .where(and(
        eq(companyAiCredentials.id, credentialId),
        eq(companyAiCredentials.companyId, companyId)
      ));

    return credential ? this.decryptApiKey(credential.apiKeyEncrypted) : null;
  }

  /**
   * Update credential validation status
   */
  async updateValidationStatus(
    type: 'system' | 'company',
    credentialId: number,
    status: 'valid' | 'invalid' | 'expired',
    error?: string
  ): Promise<void> {
    const table = type === 'system' ? systemAiCredentials : companyAiCredentials;

    await db.update(table)
      .set({
        validationStatus: status,
        validationError: error,
        lastValidatedAt: new Date()
      })
      .where(eq(table.id, credentialId));
  }

  /**
   * Update system credential
   */
  async updateSystemCredential(
    credentialId: number,
    data: Partial<Omit<SystemAiCredential, 'id' | 'apiKeyEncrypted' | 'createdAt' | 'updatedAt'>> & { apiKey?: string } & AzureCredentialInput
  ): Promise<SystemAiCredential> {
    const { apiKey, endpoint, apiVersion, defaultChatDeployment, ...updateData } = data;


    const [currentCredential] = await db.select()
      .from(systemAiCredentials)
      .where(eq(systemAiCredentials.id, credentialId));

    if (!currentCredential) {
      throw new Error('Credential not found');
    }

    const provider = updateData.provider || currentCredential.provider;
    const azureInput = {
      endpoint: endpoint ?? parseAzureCredentialMetadata(currentCredential.metadata)?.endpoint,
      apiVersion: apiVersion ?? parseAzureCredentialMetadata(currentCredential.metadata)?.apiVersion,
      defaultChatDeployment:
        defaultChatDeployment ?? parseAzureCredentialMetadata(currentCredential.metadata)?.defaultChatDeployment,
      metadata: updateData.metadata ?? currentCredential.metadata,
    };

    const updateFields: any = {
      ...updateData,
      updatedAt: new Date()
    };

    if (provider === 'azure' && (endpoint || apiVersion || defaultChatDeployment !== undefined)) {
      updateFields.metadata = this.extractAzureMetadata(provider, azureInput);
    }

    if (apiKey && apiKey.trim() !== '') {
      const validation = await this.validateApiKey(provider, apiKey, azureInput);

      updateFields.apiKeyEncrypted = this.encryptApiKey(apiKey);
      updateFields.validationStatus = validation.isValid ? 'valid' : 'invalid';
      updateFields.validationError = validation.error;
      updateFields.lastValidatedAt = new Date();
    } else if (provider === 'azure' && (endpoint || apiVersion)) {
      const decrypted = this.decryptApiKey(currentCredential.apiKeyEncrypted);
      const validation = await this.validateApiKey(provider, decrypted, azureInput);
      updateFields.validationStatus = validation.isValid ? 'valid' : 'invalid';
      updateFields.validationError = validation.error;
      updateFields.lastValidatedAt = new Date();
    }

    const [updated] = await db.update(systemAiCredentials)
      .set(updateFields)
      .where(eq(systemAiCredentials.id, credentialId))
      .returning();

    return updated;
  }

  /**
   * Delete system credential
   */
  async deleteSystemCredential(credentialId: number): Promise<void> {
    await db.delete(systemAiCredentials)
      .where(eq(systemAiCredentials.id, credentialId));
  }

  /**
   * Update company credential
   */
  async updateCompanyCredential(
    credentialId: number,
    companyId: number,
    data: Partial<Omit<CompanyAiCredential, 'id' | 'companyId' | 'apiKeyEncrypted' | 'createdAt' | 'updatedAt'>> & { apiKey?: string } & AzureCredentialInput
  ): Promise<CompanyAiCredential> {
    const { apiKey, endpoint, apiVersion, defaultChatDeployment, ...updateData } = data;


    const [currentCredential] = await db.select()
      .from(companyAiCredentials)
      .where(and(
        eq(companyAiCredentials.id, credentialId),
        eq(companyAiCredentials.companyId, companyId)
      ));

    if (!currentCredential) {
      throw new Error('Credential not found');
    }

    const provider = updateData.provider || currentCredential.provider;
    const azureInput = {
      endpoint: endpoint ?? parseAzureCredentialMetadata(currentCredential.metadata)?.endpoint,
      apiVersion: apiVersion ?? parseAzureCredentialMetadata(currentCredential.metadata)?.apiVersion,
      defaultChatDeployment:
        defaultChatDeployment ?? parseAzureCredentialMetadata(currentCredential.metadata)?.defaultChatDeployment,
      metadata: updateData.metadata ?? currentCredential.metadata,
    };

    const updateFields: any = {
      ...updateData,
      updatedAt: new Date()
    };

    if (provider === 'azure' && (endpoint || apiVersion || defaultChatDeployment !== undefined)) {
      updateFields.metadata = this.extractAzureMetadata(provider, azureInput);
    }

    if (apiKey && apiKey.trim() !== '') {
      const validation = await this.validateApiKey(provider, apiKey, azureInput);

      updateFields.apiKeyEncrypted = this.encryptApiKey(apiKey);
      updateFields.validationStatus = validation.isValid ? 'valid' : 'invalid';
      updateFields.validationError = validation.error;
      updateFields.lastValidatedAt = new Date();
    } else if (provider === 'azure' && (endpoint || apiVersion)) {
      const decrypted = this.decryptApiKey(currentCredential.apiKeyEncrypted);
      const validation = await this.validateApiKey(provider, decrypted, azureInput);
      updateFields.validationStatus = validation.isValid ? 'valid' : 'invalid';
      updateFields.validationError = validation.error;
      updateFields.lastValidatedAt = new Date();
    }

    const [updated] = await db.update(companyAiCredentials)
      .set(updateFields)
      .where(and(
        eq(companyAiCredentials.id, credentialId),
        eq(companyAiCredentials.companyId, companyId)
      ))
      .returning();

    return updated;
  }

  /**
   * Delete company credential
   */
  async deleteCompanyCredential(credentialId: number, companyId: number): Promise<void> {
    await db.delete(companyAiCredentials)
      .where(and(
        eq(companyAiCredentials.id, credentialId),
        eq(companyAiCredentials.companyId, companyId)
      ));
  }

  /**
   * Test company credential by validating it and updating status
   */
  async testCompanyCredential(credentialId: number, companyId: number): Promise<ValidationResult> {

    const [credential] = await db.select()
      .from(companyAiCredentials)
      .where(and(
        eq(companyAiCredentials.id, credentialId),
        eq(companyAiCredentials.companyId, companyId)
      ));

    if (!credential) {
      throw new Error('Credential not found');
    }


    const apiKey = this.decryptApiKey(credential.apiKeyEncrypted);
    const azureMeta = parseAzureCredentialMetadata(credential.metadata);
    const validation = await this.validateApiKey(credential.provider, apiKey, azureMeta ?? undefined);


    await this.updateValidationStatus(
      'company',
      credentialId,
      validation.isValid ? 'valid' : 'invalid',
      validation.error
    );

    return validation;
  }

  /**
   * Test system credential by validating it and updating status
   */
  async testSystemCredential(credentialId: number): Promise<ValidationResult> {

    const [credential] = await db.select()
      .from(systemAiCredentials)
      .where(eq(systemAiCredentials.id, credentialId));

    if (!credential) {
      throw new Error('Credential not found');
    }


    const apiKey = this.decryptApiKey(credential.apiKeyEncrypted);
    const azureMeta = parseAzureCredentialMetadata(credential.metadata);
    const validation = await this.validateApiKey(credential.provider, apiKey, azureMeta ?? undefined);


    await this.updateValidationStatus(
      'system',
      credentialId,
      validation.isValid ? 'valid' : 'invalid',
      validation.error
    );

    return validation;
  }

  /**
   * Get company AI preferences
   */
  async getCompanyPreferences(companyId: number): Promise<CompanyAiPreferences | null> {
    const [preferences] = await db.select()
      .from(companyAiPreferences)
      .where(eq(companyAiPreferences.companyId, companyId));

    return preferences || null;
  }

  /**
   * Update company AI preferences
   */
  async updateCompanyPreferences(
    companyId: number,
    data: Partial<Omit<CompanyAiPreferences, 'id' | 'companyId' | 'createdAt' | 'updatedAt'>>
  ): Promise<CompanyAiPreferences> {

    const [updated] = await db.update(companyAiPreferences)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(companyAiPreferences.companyId, companyId))
      .returning();

    if (updated) {
      return updated;
    }


    const [created] = await db.insert(companyAiPreferences)
      .values({
        companyId,
        ...data
      })
      .returning();

    return created;
  }

  /**
   * Get usage statistics for a company
   */
  async getCompanyUsageStats(companyId: number, startDate?: Date, endDate?: Date): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
    byCredentialType: Record<string, { requests: number; tokens: number; cost: number }>;
    byModel: Record<string, { requests: number; tokens: number; cost: number }>;
    dailyUsage: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  }> {
    const whereConditions = [eq(aiCredentialUsage.companyId, companyId)];

    if (startDate) {
      whereConditions.push(sql`${aiCredentialUsage.usageDate} >= ${startDate.toISOString().split('T')[0]}`);
    }
    if (endDate) {
      whereConditions.push(sql`${aiCredentialUsage.usageDate} <= ${endDate.toISOString().split('T')[0]}`);
    }

    const usageData = await db.select()
      .from(aiCredentialUsage)
      .where(and(...whereConditions))
      .orderBy(aiCredentialUsage.usageDate);


    let totalRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const byProvider: Record<string, { requests: number; tokens: number; cost: number }> = {};
    const byCredentialType: Record<string, { requests: number; tokens: number; cost: number }> = {};
    const byModel: Record<string, { requests: number; tokens: number; cost: number }> = {};
    const dailyUsage: Record<string, { requests: number; tokens: number; cost: number }> = {};

    usageData.forEach(usage => {
      const requests = usage.requestCount || 1;
      const tokens = usage.tokensTotal || 0;
      const cost = parseFloat(usage.costEstimated || '0');

      totalRequests += requests;
      totalTokens += tokens;
      totalCost += cost;


      if (!byProvider[usage.provider]) {
        byProvider[usage.provider] = { requests: 0, tokens: 0, cost: 0 };
      }
      byProvider[usage.provider].requests += requests;
      byProvider[usage.provider].tokens += tokens;
      byProvider[usage.provider].cost += cost;


      if (!byCredentialType[usage.credentialType]) {
        byCredentialType[usage.credentialType] = { requests: 0, tokens: 0, cost: 0 };
      }
      byCredentialType[usage.credentialType].requests += requests;
      byCredentialType[usage.credentialType].tokens += tokens;
      byCredentialType[usage.credentialType].cost += cost;


      const model = usage.model || 'unknown';
      if (!byModel[model]) {
        byModel[model] = { requests: 0, tokens: 0, cost: 0 };
      }
      byModel[model].requests += requests;
      byModel[model].tokens += tokens;
      byModel[model].cost += cost;


      let dateKey: string;
      if (usage.usageDate) {
        if (typeof usage.usageDate === 'string') {
          dateKey = usage.usageDate;
        } else {
          dateKey = (usage.usageDate as Date).toISOString().split('T')[0];
        }
      } else {
        dateKey = new Date().toISOString().split('T')[0];
      }
      if (!dailyUsage[dateKey]) {
        dailyUsage[dateKey] = { requests: 0, tokens: 0, cost: 0 };
      }
      dailyUsage[dateKey].requests += requests;
      dailyUsage[dateKey].tokens += tokens;
      dailyUsage[dateKey].cost += cost;
    });

    return {
      totalRequests,
      totalTokens,
      totalCost: Math.round(totalCost * 1000000) / 1000000, // Round to 6 decimal places
      byProvider,
      byCredentialType,
      byModel,
      dailyUsage: Object.entries(dailyUsage).map(([date, stats]) => ({
        date,
        ...stats,
        cost: Math.round(stats.cost * 1000000) / 1000000
      })).sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  /**
   * Get system-wide usage statistics (super admin only)
   */
  async getSystemUsageStats(startDate?: Date, endDate?: Date): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    byProvider: Record<string, { requests: number; tokens: number; cost: number }>;
    byCredentialType: Record<string, { requests: number; tokens: number; cost: number }>;
    byCompany: Record<string, { requests: number; tokens: number; cost: number }>;
    dailyUsage: Array<{ date: string; requests: number; tokens: number; cost: number }>;
  }> {
    const whereConditions = [];

    if (startDate) {
      whereConditions.push(sql`${aiCredentialUsage.usageDate} >= ${startDate.toISOString().split('T')[0]}`);
    }
    if (endDate) {
      whereConditions.push(sql`${aiCredentialUsage.usageDate} <= ${endDate.toISOString().split('T')[0]}`);
    }

    const query = whereConditions.length > 0
      ? db.select().from(aiCredentialUsage).where(and(...whereConditions))
      : db.select().from(aiCredentialUsage);

    const usageData = await query.orderBy(aiCredentialUsage.usageDate);


    let totalRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    const byProvider: Record<string, { requests: number; tokens: number; cost: number }> = {};
    const byCredentialType: Record<string, { requests: number; tokens: number; cost: number }> = {};
    const byCompany: Record<string, { requests: number; tokens: number; cost: number }> = {};
    const dailyUsage: Record<string, { requests: number; tokens: number; cost: number }> = {};

    usageData.forEach(usage => {
      const requests = usage.requestCount || 1;
      const tokens = usage.tokensTotal || 0;
      const cost = parseFloat(usage.costEstimated || '0');

      totalRequests += requests;
      totalTokens += tokens;
      totalCost += cost;


      if (!byProvider[usage.provider]) {
        byProvider[usage.provider] = { requests: 0, tokens: 0, cost: 0 };
      }
      byProvider[usage.provider].requests += requests;
      byProvider[usage.provider].tokens += tokens;
      byProvider[usage.provider].cost += cost;


      if (!byCredentialType[usage.credentialType]) {
        byCredentialType[usage.credentialType] = { requests: 0, tokens: 0, cost: 0 };
      }
      byCredentialType[usage.credentialType].requests += requests;
      byCredentialType[usage.credentialType].tokens += tokens;
      byCredentialType[usage.credentialType].cost += cost;


      const companyKey = `company_${usage.companyId}`;
      if (!byCompany[companyKey]) {
        byCompany[companyKey] = { requests: 0, tokens: 0, cost: 0 };
      }
      byCompany[companyKey].requests += requests;
      byCompany[companyKey].tokens += tokens;
      byCompany[companyKey].cost += cost;


      let dateKey: string;
      if (usage.usageDate) {
        if (typeof usage.usageDate === 'string') {
          dateKey = usage.usageDate;
        } else {
          dateKey = (usage.usageDate as Date).toISOString().split('T')[0];
        }
      } else {
        dateKey = new Date().toISOString().split('T')[0];
      }
      if (!dailyUsage[dateKey]) {
        dailyUsage[dateKey] = { requests: 0, tokens: 0, cost: 0 };
      }
      dailyUsage[dateKey].requests += requests;
      dailyUsage[dateKey].tokens += tokens;
      dailyUsage[dateKey].cost += cost;
    });

    return {
      totalRequests,
      totalTokens,
      totalCost: Math.round(totalCost * 1000000) / 1000000,
      byProvider,
      byCredentialType,
      byCompany,
      dailyUsage: Object.entries(dailyUsage).map(([date, stats]) => ({
        date,
        ...stats,
        cost: Math.round(stats.cost * 1000000) / 1000000
      })).sort((a, b) => a.date.localeCompare(b.date))
    };
  }

  /**
   * Check usage limits and send alerts if needed
   */
  async checkUsageLimits(companyId: number): Promise<{
    alerts: Array<{
      type: 'warning' | 'limit_exceeded';
      credentialId: number;
      credentialType: 'system' | 'company';
      provider: string;
      currentUsage: number;
      limit: number;
      percentage: number;
    }>;
  }> {
    const alerts: Array<{
      type: 'warning' | 'limit_exceeded';
      credentialId: number;
      credentialType: 'system' | 'company';
      provider: string;
      currentUsage: number;
      limit: number;
      percentage: number;
    }> = [];


    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyUsage = await db.select({
      credentialType: aiCredentialUsage.credentialType,
      credentialId: aiCredentialUsage.credentialId,
      provider: aiCredentialUsage.provider,
      totalRequests: sql<number>`sum(${aiCredentialUsage.requestCount})`.as('totalRequests')
    })
    .from(aiCredentialUsage)
    .where(and(
      eq(aiCredentialUsage.companyId, companyId),
      sql`${aiCredentialUsage.usageDate} >= ${startOfMonth.toISOString().split('T')[0]}`
    ))
    .groupBy(
      aiCredentialUsage.credentialType,
      aiCredentialUsage.credentialId,
      aiCredentialUsage.provider
    );


    const companyCredentials = await this.getCompanyCredentials(companyId);
    for (const credential of companyCredentials) {
      if (!credential.usageLimitMonthly) continue;

      const usage = monthlyUsage.find(u =>
        u.credentialType === 'company' &&
        u.credentialId === credential.id &&
        u.provider === credential.provider
      );

      const currentUsage = usage?.totalRequests || 0;
      const percentage = (currentUsage / credential.usageLimitMonthly) * 100;

      if (percentage >= 100) {
        alerts.push({
          type: 'limit_exceeded',
          credentialId: credential.id,
          credentialType: 'company',
          provider: credential.provider,
          currentUsage,
          limit: credential.usageLimitMonthly,
          percentage
        });
      } else if (percentage >= 80) {
        alerts.push({
          type: 'warning',
          credentialId: credential.id,
          credentialType: 'company',
          provider: credential.provider,
          currentUsage,
          limit: credential.usageLimitMonthly,
          percentage
        });
      }
    }

    return { alerts };
  }
}

export const aiCredentialsService = new AiCredentialsService();
