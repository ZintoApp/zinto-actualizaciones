import { Express } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { ensureSuperAdmin } from "../../middleware";


const createProviderConfigSchema = z.object({
  planId: z.number(),
  provider: z.string().min(1),
  tokensMonthlyLimit: z.number().nullable().optional(),
  tokensDailyLimit: z.number().nullable().optional(),
  customPricingEnabled: z.boolean().default(false),
  inputTokenRate: z.string().nullable().optional(),
  outputTokenRate: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
  priority: z.number().default(0),
  metadata: z.any().optional()
});

const updateProviderConfigSchema = createProviderConfigSchema.partial().omit({ planId: true });

export function setupPlanAiProviderRoutes(app: Express) {
  

  app.get("/api/admin/plans/:planId/ai-providers", ensureSuperAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }


      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const configs = await storage.getPlanAiProviderConfigs(planId);
      res.json(configs);
    } catch (error) {
      console.error("Error fetching AI provider configs:", error);
      res.status(500).json({ error: "Failed to fetch AI provider configs" });
    }
  });


  app.post("/api/admin/plans/:planId/ai-providers", ensureSuperAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }


      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }


      const transformedBody = { ...req.body, planId };


      if (transformedBody.inputTokenRate !== undefined && transformedBody.inputTokenRate !== null) {
        transformedBody.inputTokenRate = typeof transformedBody.inputTokenRate === 'number'
          ? transformedBody.inputTokenRate.toString()
          : transformedBody.inputTokenRate;
      }
      if (transformedBody.outputTokenRate !== undefined && transformedBody.outputTokenRate !== null) {
        transformedBody.outputTokenRate = typeof transformedBody.outputTokenRate === 'number'
          ? transformedBody.outputTokenRate.toString()
          : transformedBody.outputTokenRate;
      }


      const validationResult = createProviderConfigSchema.safeParse(transformedBody);

      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.format()
        });
      }

      const configData = validationResult.data;


      const existingConfigs = await storage.getPlanAiProviderConfigs(planId);
      const existingProvider = existingConfigs.find(config => config.provider === configData.provider);
      
      if (existingProvider) {
        return res.status(409).json({ 
          error: `AI provider configuration for ${configData.provider} already exists for this plan` 
        });
      }

      const newConfig = await storage.createPlanAiProviderConfig(configData);
      res.status(201).json(newConfig);
    } catch (error) {
      console.error("Error creating AI provider config:", error);
      res.status(500).json({ error: "Failed to create AI provider config" });
    }
  });


  app.put("/api/admin/plans/:planId/ai-providers/:configId", ensureSuperAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const configId = parseInt(req.params.configId);
      
      if (isNaN(planId) || isNaN(configId)) {
        return res.status(400).json({ error: "Invalid plan ID or config ID" });
      }


      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }


      const existingConfigs = await storage.getPlanAiProviderConfigs(planId);
      const existingConfig = existingConfigs.find(config => config.id === configId);
      
      if (!existingConfig) {
        return res.status(404).json({ error: "AI provider config not found" });
      }


      const transformedBody = { ...req.body };


      if (transformedBody.inputTokenRate !== undefined && transformedBody.inputTokenRate !== null) {
        transformedBody.inputTokenRate = typeof transformedBody.inputTokenRate === 'number'
          ? transformedBody.inputTokenRate.toString()
          : transformedBody.inputTokenRate;
      }
      if (transformedBody.outputTokenRate !== undefined && transformedBody.outputTokenRate !== null) {
        transformedBody.outputTokenRate = typeof transformedBody.outputTokenRate === 'number'
          ? transformedBody.outputTokenRate.toString()
          : transformedBody.outputTokenRate;
      }


      const validationResult = updateProviderConfigSchema.safeParse(transformedBody);

      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.format()
        });
      }

      const updateData = validationResult.data;

      const updatedConfig = await storage.updatePlanAiProviderConfig(configId, updateData);
      res.json(updatedConfig);
    } catch (error) {
      console.error("Error updating AI provider config:", error);
      res.status(500).json({ error: "Failed to update AI provider config" });
    }
  });


  app.delete("/api/admin/plans/:planId/ai-providers/:configId", ensureSuperAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const configId = parseInt(req.params.configId);
      
      if (isNaN(planId) || isNaN(configId)) {
        return res.status(400).json({ error: "Invalid plan ID or config ID" });
      }


      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }


      const existingConfigs = await storage.getPlanAiProviderConfigs(planId);
      const existingConfig = existingConfigs.find(config => config.id === configId);
      
      if (!existingConfig) {
        return res.status(404).json({ error: "AI provider config not found" });
      }

      const success = await storage.deletePlanAiProviderConfig(configId);
      
      if (success) {
        res.json({ message: "AI provider config deleted successfully" });
      } else {
        res.status(500).json({ error: "Failed to delete AI provider config" });
      }
    } catch (error) {
      console.error("Error deleting AI provider config:", error);
      res.status(500).json({ error: "Failed to delete AI provider config" });
    }
  });


  app.get("/api/admin/plans/:planId/ai-usage-stats", ensureSuperAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const companyId = req.query.companyId ? parseInt(req.query.companyId as string) : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }


      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      if (companyId) {

        const stats = await storage.getPlanAiUsageStats(companyId, planId, startDate, endDate);
        res.json(stats);
      } else {

        const aggregatedStats = await storage.getAggregatedPlanAiUsageStats(planId, startDate, endDate);
        res.json(aggregatedStats);
      }
    } catch (error) {
      console.error("Error fetching AI usage stats:", error);
      res.status(500).json({ error: "Failed to fetch AI usage stats" });
    }
  });


  app.get("/api/admin/ai-usage-overview", ensureSuperAdmin, async (req, res) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const overview = await storage.getSystemAiUsageOverview(startDate, endDate);
      res.json(overview);
    } catch (error) {
      console.error("Error fetching AI usage overview:", error);
      res.status(500).json({ error: "Failed to fetch AI usage overview" });
    }
  });
}
