import { Express, Request, Response } from "express";
import { storage } from "./storage";
import { z } from "zod";


const ensureAuthenticated = (req: Request, res: Response, next: any) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
};


const ensureSuperAdmin = (req: Request, res: Response, next: any) => {
  if (req.isAuthenticated() && req.user && (req.user as any).isSuperAdmin) {
    return next();
  }
  res.status(403).json({ message: 'Super admin access required' });
};


const planSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.string().min(0, "Price must be a positive number"),
  maxUsers: z.number().int().min(1, "Max users must be at least 1"),
  maxContacts: z.number().int().min(0, "Max contacts must be a positive number"),
  maxChannels: z.number().int().min(0, "Max channels must be a positive number"),
  maxFlows: z.number().int().min(0, "Max flows must be a positive number"),
  maxCampaigns: z.number().int().min(0, "Max campaigns must be a positive number").default(5),
  maxCampaignRecipients: z.number().int().min(0, "Max campaign recipients must be a positive number").default(1000),
  campaignFeatures: z.array(z.string()).default(["basic_campaigns"]),
  isActive: z.boolean().default(true),
  isFree: z.boolean().default(false),
  hasTrialPeriod: z.boolean().default(false),
  trialDays: z.number().int().min(0, "Trial days must be a positive number").default(0),
  features: z.array(z.string()).default([]),

  aiTokensIncluded: z.number().int().min(0, "AI tokens included must be a positive number").default(0),
  aiTokensMonthlyLimit: z.number().int().min(0, "AI tokens monthly limit must be a positive number").nullable().optional(),
  aiTokensDailyLimit: z.number().int().min(0, "AI tokens daily limit must be a positive number").nullable().optional(),
  aiOverageEnabled: z.boolean().default(false),
  aiOverageRate: z.string().default("0.000000"),
  aiOverageBlockEnabled: z.boolean().default(false),
  aiBillingEnabled: z.boolean().default(false),


  discountType: z.enum(["none", "percentage", "fixed_amount"]).default("none"),
  discountValue: z.string().default("0"),
  discountDuration: z.enum(["permanent", "first_month", "first_year", "limited_time"]).default("permanent"),
  discountStartDate: z.string().optional(),
  discountEndDate: z.string().optional(),
  originalPrice: z.string().optional(),


  storageLimit: z.number().int().min(0, "Storage limit must be a positive number").default(1024),
  bandwidthLimit: z.number().int().min(0, "Bandwidth limit must be a positive number").default(10240),
  fileUploadLimit: z.number().int().min(0, "File upload limit must be a positive number").default(25),
  totalFilesLimit: z.number().int().min(0, "Total files limit must be a positive number").default(1000),
  

  billingInterval: z.enum(['lifetime', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'semi_annual', 'annual', 'biennial', 'custom']).default('monthly'),
  customDurationDays: z.number().int().min(1, "Custom duration must be at least 1 day").nullable().optional()
});

export function registerPlanRoutes(app: Express) {

  app.get("/api/plans", ensureAuthenticated, async (req, res) => {
    try {
      const plans = await storage.getAllPlans();

      const activePlans = plans.filter(plan => plan.isActive);
      res.json(activePlans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });


  app.get("/api/plans/public", async (req, res) => {
    try {
      const plans = await storage.getAllPlans();

      const activePlans = plans.filter(plan => plan.isActive);
      res.json(activePlans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });


  app.get("/api/plans/registration", async (req, res) => {
    try {
      const plans = await storage.getAllPlans();

      const registrationPlans = plans.filter(plan =>
        plan.isActive && (plan.isFree || plan.hasTrialPeriod)
      );
      res.json(registrationPlans);
    } catch (error) {
      console.error("Error fetching registration plans:", error);
      res.status(500).json({ error: "Failed to fetch registration plans" });
    }
  });


  app.get("/api/admin/plans", ensureSuperAdmin, async (req, res) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ error: "Failed to fetch plans" });
    }
  });


  app.get("/api/admin/plans/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);
      const plan = await storage.getPlan(planId);

      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      res.json(plan);
    } catch (error) {
      console.error("Error fetching plan:", error);
      res.status(500).json({ error: "Failed to fetch plan" });
    }
  });


  app.post("/api/admin/plans", ensureSuperAdmin, async (req, res) => {
    try {

      const transformedBody = { ...req.body };
      if (transformedBody.price !== undefined) {
        transformedBody.price = typeof transformedBody.price === 'number'
          ? transformedBody.price.toString()
          : transformedBody.price;
      }
      if (transformedBody.maxUsers !== undefined) {
        transformedBody.maxUsers = parseInt(transformedBody.maxUsers);
      }
      if (transformedBody.maxContacts !== undefined) {
        transformedBody.maxContacts = parseInt(transformedBody.maxContacts);
      }
      if (transformedBody.maxChannels !== undefined) {
        transformedBody.maxChannels = parseInt(transformedBody.maxChannels);
      }
      if (transformedBody.maxFlows !== undefined) {
        transformedBody.maxFlows = parseInt(transformedBody.maxFlows);
      }
      if (transformedBody.maxCampaigns !== undefined) {
        transformedBody.maxCampaigns = parseInt(transformedBody.maxCampaigns);
      }
      if (transformedBody.maxCampaignRecipients !== undefined) {
        transformedBody.maxCampaignRecipients = parseInt(transformedBody.maxCampaignRecipients);
      }
      if (transformedBody.trialDays !== undefined) {
        transformedBody.trialDays = parseInt(transformedBody.trialDays);
      }

      if (transformedBody.aiTokensIncluded !== undefined) {
        transformedBody.aiTokensIncluded = parseInt(transformedBody.aiTokensIncluded);
      }
      if (transformedBody.aiTokensMonthlyLimit !== undefined && transformedBody.aiTokensMonthlyLimit !== null) {
        transformedBody.aiTokensMonthlyLimit = parseInt(transformedBody.aiTokensMonthlyLimit);
      }
      if (transformedBody.aiTokensDailyLimit !== undefined && transformedBody.aiTokensDailyLimit !== null) {
        transformedBody.aiTokensDailyLimit = parseInt(transformedBody.aiTokensDailyLimit);
      }
      if (transformedBody.aiOverageRate !== undefined) {
        transformedBody.aiOverageRate = typeof transformedBody.aiOverageRate === 'number'
          ? transformedBody.aiOverageRate.toString()
          : transformedBody.aiOverageRate;
      }


      if (transformedBody.discountValue !== undefined) {
        transformedBody.discountValue = typeof transformedBody.discountValue === 'number'
          ? transformedBody.discountValue.toString()
          : transformedBody.discountValue;
      }
      if (transformedBody.originalPrice !== undefined) {
        transformedBody.originalPrice = typeof transformedBody.originalPrice === 'number'
          ? transformedBody.originalPrice.toString()
          : transformedBody.originalPrice;
      }
      if (transformedBody.discountStartDate !== undefined && transformedBody.discountStartDate) {
        transformedBody.discountStartDate = new Date(transformedBody.discountStartDate);
      }
      if (transformedBody.discountEndDate !== undefined && transformedBody.discountEndDate) {
        transformedBody.discountEndDate = new Date(transformedBody.discountEndDate);
      }


      if (transformedBody.storageLimit !== undefined) {
        transformedBody.storageLimit = parseInt(transformedBody.storageLimit);
      }
      if (transformedBody.bandwidthLimit !== undefined) {
        transformedBody.bandwidthLimit = parseInt(transformedBody.bandwidthLimit);
      }
      if (transformedBody.fileUploadLimit !== undefined) {
        transformedBody.fileUploadLimit = parseInt(transformedBody.fileUploadLimit);
      }
      if (transformedBody.totalFilesLimit !== undefined) {
        transformedBody.totalFilesLimit = parseInt(transformedBody.totalFilesLimit);
      }

      const validationResult = planSchema.safeParse(transformedBody);

      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.format()
        });
      }

      const planData = validationResult.data;


      const newPlan = await storage.createPlan({
        name: planData.name,
        description: planData.description || "",
        price: planData.price,
        maxUsers: planData.maxUsers,
        maxContacts: planData.maxContacts,
        maxChannels: planData.maxChannels,
        maxFlows: planData.maxFlows,
        maxCampaigns: planData.maxCampaigns,
        maxCampaignRecipients: planData.maxCampaignRecipients,
        campaignFeatures: planData.campaignFeatures,
        isActive: planData.isActive,
        isFree: planData.isFree,
        hasTrialPeriod: planData.hasTrialPeriod,
        trialDays: planData.trialDays,
        features: planData.features,

        aiTokensIncluded: planData.aiTokensIncluded || 0,
        aiTokensMonthlyLimit: planData.aiTokensMonthlyLimit || null,
        aiTokensDailyLimit: planData.aiTokensDailyLimit || null,
        aiOverageEnabled: planData.aiOverageEnabled || false,
        aiOverageRate: planData.aiOverageRate || "0.000000",
        aiOverageBlockEnabled: planData.aiOverageBlockEnabled || false,
        aiBillingEnabled: planData.aiBillingEnabled || false,


        discountType: planData.discountType || "none",
        discountValue: planData.discountValue || "0",
        discountDuration: planData.discountDuration || "permanent",
        discountStartDate: planData.discountStartDate ? new Date(planData.discountStartDate) : null,
        discountEndDate: planData.discountEndDate ? new Date(planData.discountEndDate) : null,
        originalPrice: planData.originalPrice || null,


        storageLimit: planData.storageLimit || 1024,
        bandwidthLimit: planData.bandwidthLimit || 10240,
        fileUploadLimit: planData.fileUploadLimit ?? 25,
        totalFilesLimit: planData.totalFilesLimit || 1000,
        billingInterval: planData.billingInterval,
        customDurationDays: planData.customDurationDays
      });

      res.status(201).json(newPlan);
    } catch (error) {
      console.error("Error creating plan:", error);
      res.status(500).json({ error: "Failed to create plan" });
    }
  });


  app.put("/api/admin/plans/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);


      const existingPlan = await storage.getPlan(planId);
      if (!existingPlan) {
        return res.status(404).json({ error: "Plan not found" });
      }


      const transformedBody = { ...req.body };
      if (transformedBody.price !== undefined) {
        transformedBody.price = typeof transformedBody.price === 'number'
          ? transformedBody.price.toString()
          : transformedBody.price;
      }
      if (transformedBody.maxUsers !== undefined) {
        transformedBody.maxUsers = parseInt(transformedBody.maxUsers);
      }
      if (transformedBody.maxContacts !== undefined) {
        transformedBody.maxContacts = parseInt(transformedBody.maxContacts);
      }
      if (transformedBody.maxChannels !== undefined) {
        transformedBody.maxChannels = parseInt(transformedBody.maxChannels);
      }
      if (transformedBody.maxFlows !== undefined) {
        transformedBody.maxFlows = parseInt(transformedBody.maxFlows);
      }
      if (transformedBody.maxCampaigns !== undefined) {
        transformedBody.maxCampaigns = parseInt(transformedBody.maxCampaigns);
      }
      if (transformedBody.maxCampaignRecipients !== undefined) {
        transformedBody.maxCampaignRecipients = parseInt(transformedBody.maxCampaignRecipients);
      }
      if (transformedBody.trialDays !== undefined) {
        transformedBody.trialDays = parseInt(transformedBody.trialDays);
      }

      if (transformedBody.aiTokensIncluded !== undefined) {
        transformedBody.aiTokensIncluded = parseInt(transformedBody.aiTokensIncluded);
      }
      if (transformedBody.aiTokensMonthlyLimit !== undefined && transformedBody.aiTokensMonthlyLimit !== null) {
        transformedBody.aiTokensMonthlyLimit = parseInt(transformedBody.aiTokensMonthlyLimit);
      }
      if (transformedBody.aiTokensDailyLimit !== undefined && transformedBody.aiTokensDailyLimit !== null) {
        transformedBody.aiTokensDailyLimit = parseInt(transformedBody.aiTokensDailyLimit);
      }
      if (transformedBody.aiOverageRate !== undefined) {
        transformedBody.aiOverageRate = typeof transformedBody.aiOverageRate === 'number'
          ? transformedBody.aiOverageRate.toString()
          : transformedBody.aiOverageRate;
      }


      if (transformedBody.discountValue !== undefined) {
        transformedBody.discountValue = typeof transformedBody.discountValue === 'number'
          ? transformedBody.discountValue.toString()
          : transformedBody.discountValue;
      }
      if (transformedBody.originalPrice !== undefined) {
        transformedBody.originalPrice = typeof transformedBody.originalPrice === 'number'
          ? transformedBody.originalPrice.toString()
          : transformedBody.originalPrice;
      }
      if (transformedBody.discountStartDate !== undefined && transformedBody.discountStartDate) {
        transformedBody.discountStartDate = new Date(transformedBody.discountStartDate);
      }
      if (transformedBody.discountEndDate !== undefined && transformedBody.discountEndDate) {
        transformedBody.discountEndDate = new Date(transformedBody.discountEndDate);
      }


      if (transformedBody.storageLimit !== undefined) {
        transformedBody.storageLimit = parseInt(transformedBody.storageLimit);
      }
      if (transformedBody.bandwidthLimit !== undefined) {
        transformedBody.bandwidthLimit = parseInt(transformedBody.bandwidthLimit);
      }
      if (transformedBody.fileUploadLimit !== undefined) {
        transformedBody.fileUploadLimit = parseInt(transformedBody.fileUploadLimit);
      }
      if (transformedBody.totalFilesLimit !== undefined) {
        transformedBody.totalFilesLimit = parseInt(transformedBody.totalFilesLimit);
      }

      const validationResult = planSchema.partial().safeParse(transformedBody);

      if (!validationResult.success) {
        return res.status(400).json({
          error: "Validation failed",
          details: validationResult.error.format()
        });
      }

      const planData = validationResult.data;


      const transformedPlanData = {
        ...planData,
        discountStartDate: planData.discountStartDate ? new Date(planData.discountStartDate) : null,
        discountEndDate: planData.discountEndDate ? new Date(planData.discountEndDate) : null,
      };

      const updatedPlan = await storage.updatePlan(planId, transformedPlanData);

      res.json(updatedPlan);
    } catch (error) {
      console.error("Error updating plan:", error);
      res.status(500).json({ error: "Failed to update plan" });
    }
  });


  app.delete("/api/admin/plans/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const planId = parseInt(req.params.id);


      const existingPlan = await storage.getPlan(planId);
      if (!existingPlan) {
        return res.status(404).json({ error: "Plan not found" });
      }


      const success = await storage.deletePlan(planId);

      if (!success) {
        return res.status(500).json({ error: "Failed to delete plan" });
      }

      res.json({ message: "Plan deleted successfully" });
    } catch (error) {
      console.error("Error deleting plan:", error);
      res.status(500).json({ error: "Failed to delete plan" });
    }
  });
}
