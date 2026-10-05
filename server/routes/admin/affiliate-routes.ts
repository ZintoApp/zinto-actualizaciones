import { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { ensureSuperAdmin } from "../../middleware";
import Papa from 'papaparse';
import { parseExportFormat, sendTabularExport, type ExportColumn } from '../../utils/tabular-export';
import { 
  insertAffiliateSchema, 
  insertAffiliateCommissionStructureSchema,
  insertAffiliateReferralSchema,
  insertAffiliatePayoutSchema 
} from "../../../shared/schema";
import {
  AFFILIATE_PUBLIC_SETTINGS_KEY,
  DEFAULT_AFFILIATE_PUBLIC_SETTINGS
} from "@shared/affiliate-settings";


const affiliateCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  businessName: z.string().optional(),
  taxId: z.string().optional(),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    postalCode: z.string().optional()
  }).optional(),
  paymentDetails: z.object({
    method: z.string().optional(),
    accountInfo: z.record(z.any()).optional(),
    preferences: z.record(z.any()).optional()
  }).optional(),
  defaultCommissionRate: z.number().min(0).max(100).optional(),
  commissionType: z.enum(["percentage", "fixed", "tiered"]).optional(),
  notes: z.string().optional()
});

const affiliateUpdateSchema = affiliateCreateSchema.partial().extend({
  status: z.enum(["pending", "active", "suspended", "rejected"]).optional(),
  rejectionReason: z.string().optional(),
  approvedBy: z.number().optional(),
  approvedAt: z.union([z.string(), z.date()]).optional()
});

const commissionStructureSchema = z.object({
  affiliateId: z.number(),
  planId: z.number().optional(),
  name: z.string().min(1, "Name is required"),
  commissionType: z.enum(["percentage", "fixed", "tiered"]),
  commissionValue: z.number().min(0),
  tierRules: z.array(z.object({
    minReferrals: z.number().min(0),
    maxReferrals: z.number().min(0).optional(),
    rate: z.number().min(0)
  })).optional(),
  minimumPayout: z.number().min(0).optional(),
  maximumPayout: z.number().min(0).optional(),
  recurringCommission: z.boolean().optional(),
  recurringMonths: z.number().min(0).optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional()
});

const payoutCreateSchema = z.object({
  affiliateId: z.number(),
  amount: z.number().min(0.01),
  currency: z.string().default("USD"),
  paymentMethod: z.string(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  referralIds: z.array(z.number()).optional(),
  notes: z.string().optional()
});

const affiliateSettingsSchema = z.object({
  registrationCommissionRate: z.number().min(0).max(100)
});

const paginationSchema = z.object({
  page: z.string().transform(val => parseInt(val) || 1),
  limit: z.string().transform(val => Math.min(parseInt(val) || 20, 100)),
  search: z.string().optional(),
  status: z.enum(["pending", "active", "suspended", "rejected", "all"]).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional()
});

export function registerAffiliateRoutes(app: Express) {


  app.post("/api/affiliate/apply", async (req: Request, res: Response) => {
    try {
      const applicationSchema = z.object({
        firstName: z.string().min(2).max(50),
        lastName: z.string().min(2).max(50),
        email: z.string().email(),
        phone: z.string().optional(),
        company: z.string().optional(),
        website: z.string().url().optional().or(z.literal("")),
        country: z.string().min(1),
        marketingChannels: z.array(z.string()).min(1),
        expectedMonthlyReferrals: z.string().min(1),
        experience: z.string().min(50),
        motivation: z.string().min(50),
        agreeToTerms: z.boolean().refine(val => val === true),
      });

      const validatedData = applicationSchema.parse(req.body);


      const existingApplication = await storage.getAffiliateApplicationByEmail(validatedData.email);
      if (existingApplication) {
        return res.status(400).json({ error: "An application with this email already exists" });
      }

      const existingAffiliate = await storage.getAffiliateByEmail(validatedData.email);
      if (existingAffiliate) {
        return res.status(400).json({ error: "An affiliate with this email already exists" });
      }


      const application = await storage.createAffiliateApplication({
        ...validatedData,
        status: 'pending',
        submittedAt: new Date(),
      });

      res.status(201).json({
        message: "Application submitted successfully",
        applicationId: (application as any).id
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Error submitting affiliate application:", error);
      res.status(500).json({ error: "Failed to submit application" });
    }
  });


  app.get("/api/admin/affiliate/settings", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const setting = await storage.getAppSetting(AFFILIATE_PUBLIC_SETTINGS_KEY);
      res.json({
        ...DEFAULT_AFFILIATE_PUBLIC_SETTINGS,
        ...((setting?.value as Record<string, unknown> | undefined) || {})
      });
    } catch (error) {
      console.error("Error fetching affiliate settings:", error);
      res.status(500).json({ error: "Failed to fetch affiliate settings" });
    }
  });


  app.put("/api/admin/affiliate/settings", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = affiliateSettingsSchema.parse(req.body);
      const setting = await storage.saveAppSetting(AFFILIATE_PUBLIC_SETTINGS_KEY, validatedData);

      try {
        if ((global as any).broadcastToAllClients) {
          (global as any).broadcastToAllClients({
            type: 'settingsUpdated',
            key: AFFILIATE_PUBLIC_SETTINGS_KEY,
            value: validatedData
          });
        }
      } catch (broadcastError) {
        console.error("Error broadcasting affiliate settings update:", broadcastError);
      }

      res.json(setting.value);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Error updating affiliate settings:", error);
      res.status(500).json({ error: "Failed to update affiliate settings" });
    }
  });


  app.get("/api/admin/affiliate/applications", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const applications = await storage.getAffiliateApplications();
      res.json(applications);
    } catch (error) {
      console.error("Error fetching affiliate applications:", error);
      res.status(500).json({ error: "Failed to fetch affiliate applications" });
    }
  });


  app.post("/api/admin/affiliate/applications/:id/approve", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      if (isNaN(applicationId)) {
        return res.status(400).json({ error: "Invalid application ID" });
      }

      const application = await storage.getAffiliateApplication(applicationId) as any;
      if (!application) {
        return res.status(404).json({ error: "Application not found" });
      }


      const affiliateCode = await storage.generateAffiliateCode(`${application.firstName} ${application.lastName}`);


      const affiliateData = {
        name: `${application.firstName} ${application.lastName}`,
        email: application.email,
        phone: application.phone,
        website: application.website,
        affiliateCode,
        companyId: null, // Global affiliate
        status: "active" as const,
        approvedBy: (req.user as any).id,
        approvedAt: new Date(),
        defaultCommissionRate: 10.0, // Default 10% commission
        commissionType: "percentage" as const,
        businessName: application.company,
        notes: `Approved from application. Marketing channels: ${application.marketingChannels.join(', ')}. Expected monthly referrals: ${application.expectedMonthlyReferrals}`,
      };

      const affiliate = await storage.createAffiliate(affiliateData);


      await storage.updateAffiliateApplication(applicationId, {
        status: 'approved',
        reviewedBy: (req.user as any).id,
        reviewedAt: new Date(),
      });

      res.json({ affiliate, message: "Application approved successfully" });
    } catch (error) {
      console.error("Error approving affiliate application:", error);
      res.status(500).json({ error: "Failed to approve application" });
    }
  });


  app.post("/api/admin/affiliate/applications/:id/reject", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const applicationId = parseInt(req.params.id);
      if (isNaN(applicationId)) {
        return res.status(400).json({ error: "Invalid application ID" });
      }

      const { rejectionReason } = req.body;
      if (!rejectionReason) {
        return res.status(400).json({ error: "Rejection reason is required" });
      }

      await storage.updateAffiliateApplication(applicationId, {
        status: 'rejected',
        reviewedBy: (req.user as any).id,
        reviewedAt: new Date(),
        rejectionReason,
      });

      res.json({ message: "Application rejected successfully" });
    } catch (error) {
      console.error("Error rejecting affiliate application:", error);
      res.status(500).json({ error: "Failed to reject application" });
    }
  });


  app.get("/api/admin/affiliate/metrics", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const metrics = await storage.getAffiliateMetrics();
      res.json(metrics);
    } catch (error) {
      console.error("Error fetching affiliate metrics:", error);
      res.status(500).json({ error: "Failed to fetch affiliate metrics" });
    }
  });


  app.get("/api/admin/affiliate/affiliates", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const params = paginationSchema.parse(req.query);
      const result = await storage.getAffiliates(params);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching affiliates:", error);
      res.status(500).json({ error: "Failed to fetch affiliates" });
    }
  });


  app.get("/api/admin/affiliate/affiliates/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const affiliateId = parseInt(req.params.id);
      if (isNaN(affiliateId)) {
        return res.status(400).json({ error: "Invalid affiliate ID" });
      }

      const affiliate = await storage.getAffiliate(affiliateId);
      if (!affiliate) {
        return res.status(404).json({ error: "Affiliate not found" });
      }

      res.json(affiliate);
    } catch (error) {
      console.error("Error fetching affiliate:", error);
      res.status(500).json({ error: "Failed to fetch affiliate" });
    }
  });


  app.post("/api/admin/affiliate/affiliates", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = affiliateCreateSchema.parse(req.body);
      

      const affiliateCode = await storage.generateAffiliateCode(validatedData.name);
      
      const affiliateData = {
        ...validatedData,
        affiliateCode,
        companyId: null, // Super admin creates global affiliates
        status: "pending" as const
      };

      const affiliate = await storage.createAffiliate(affiliateData);
      res.status(201).json(affiliate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Error creating affiliate:", error);
      res.status(500).json({ error: "Failed to create affiliate" });
    }
  });


  app.put("/api/admin/affiliate/affiliates/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const affiliateId = parseInt(req.params.id);
      if (isNaN(affiliateId)) {
        return res.status(400).json({ error: "Invalid affiliate ID" });
      }

      const validatedData = affiliateUpdateSchema.parse(req.body);
      

      if (validatedData.status === "active") {
        validatedData.approvedBy = (req.user as any).id;
        validatedData.approvedAt = new Date();
      }

      const affiliate = await storage.updateAffiliate(affiliateId, validatedData);
      if (!affiliate) {
        return res.status(404).json({ error: "Affiliate not found" });
      }

      res.json(affiliate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Error updating affiliate:", error);
      res.status(500).json({ error: "Failed to update affiliate" });
    }
  });


  app.delete("/api/admin/affiliate/affiliates/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const affiliateId = parseInt(req.params.id);
      if (isNaN(affiliateId)) {
        return res.status(400).json({ error: "Invalid affiliate ID" });
      }

      const success = await storage.deleteAffiliate(affiliateId);
      if (!success) {
        return res.status(404).json({ error: "Affiliate not found" });
      }

      res.json({ message: "Affiliate deleted successfully" });
    } catch (error) {
      console.error("Error deleting affiliate:", error);
      res.status(500).json({ error: "Failed to delete affiliate" });
    }
  });


  app.get("/api/admin/affiliate/affiliates/:id/commission-structures", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const affiliateId = parseInt(req.params.id);
      if (isNaN(affiliateId)) {
        return res.status(400).json({ error: "Invalid affiliate ID" });
      }

      const structures = await storage.getAffiliateCommissionStructures(affiliateId);
      res.json(structures);
    } catch (error) {
      console.error("Error fetching commission structures:", error);
      res.status(500).json({ error: "Failed to fetch commission structures" });
    }
  });


  app.post("/api/admin/affiliate/commission-structures", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = commissionStructureSchema.parse(req.body);
      
      const structureData = {
        ...validatedData,
        companyId: null // Super admin creates global structures
      };

      const structure = await storage.createCommissionStructure(structureData);
      res.status(201).json(structure);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Error creating commission structure:", error);
      res.status(500).json({ error: "Failed to create commission structure" });
    }
  });


  app.put("/api/admin/affiliate/commission-structures/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const structureId = parseInt(req.params.id);
      if (isNaN(structureId)) {
        return res.status(400).json({ error: "Invalid commission structure ID" });
      }

      const validatedData = commissionStructureSchema.partial().parse(req.body);
      const structure = await storage.updateCommissionStructure(structureId, validatedData);
      
      if (!structure) {
        return res.status(404).json({ error: "Commission structure not found" });
      }

      res.json(structure);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Error updating commission structure:", error);
      res.status(500).json({ error: "Failed to update commission structure" });
    }
  });


  app.delete("/api/admin/affiliate/commission-structures/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const structureId = parseInt(req.params.id);
      if (isNaN(structureId)) {
        return res.status(400).json({ error: "Invalid commission structure ID" });
      }

      const success = await storage.deleteCommissionStructure(structureId);
      if (!success) {
        return res.status(404).json({ error: "Commission structure not found" });
      }

      res.json({ message: "Commission structure deleted successfully" });
    } catch (error) {
      console.error("Error deleting commission structure:", error);
      res.status(500).json({ error: "Failed to delete commission structure" });
    }
  });


  app.get("/api/admin/affiliate/referrals", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const params = paginationSchema.extend({
        affiliateId: z.string().transform(val => parseInt(val)).optional(),
        status: z.enum(["pending", "converted", "expired", "cancelled", "all"]).optional()
      }).parse(req.query);

      const result = await storage.getAffiliateReferrals(params);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching referrals:", error);
      res.status(500).json({ error: "Failed to fetch referrals" });
    }
  });


  app.get("/api/admin/affiliate/affiliates/:id/referrals", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const affiliateId = parseInt(req.params.id);
      if (isNaN(affiliateId)) {
        return res.status(400).json({ error: "Invalid affiliate ID" });
      }

      const params = paginationSchema.parse(req.query);
      const result = await storage.getAffiliateReferrals({ ...params, affiliateId });
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching affiliate referrals:", error);
      res.status(500).json({ error: "Failed to fetch affiliate referrals" });
    }
  });


  app.patch("/api/admin/affiliate/referrals/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const referralId = parseInt(req.params.id);
      if (isNaN(referralId)) {
        return res.status(400).json({ error: "Invalid referral ID" });
      }

      const updateSchema = z.object({
        status: z.enum(["pending", "converted", "expired", "cancelled"]),
        conversionValue: z.number().min(0).optional(),
        commissionAmount: z.number().min(0).optional(),
        notes: z.string().optional(),
        convertedAt: z.union([z.string(), z.date()]).optional()
      });

      const validatedData = updateSchema.parse(req.body);

      if (validatedData.status === "converted") {
        validatedData.convertedAt = new Date();
      }

      const referral = await storage.updateAffiliateReferral(referralId, validatedData);
      if (!referral) {
        return res.status(404).json({ error: "Referral not found" });
      }

      res.json(referral);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Error updating referral:", error);
      res.status(500).json({ error: "Failed to update referral" });
    }
  });


  app.get("/api/admin/affiliate/payouts", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const params = paginationSchema.extend({
        affiliateId: z.string().transform(val => parseInt(val)).optional(),
        status: z.enum(["pending", "processing", "completed", "failed", "cancelled", "all"]).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional()
      }).parse(req.query);

      const result = await storage.getAffiliatePayouts(params);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching payouts:", error);
      res.status(500).json({ error: "Failed to fetch payouts" });
    }
  });


  app.post("/api/admin/affiliate/payouts", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = payoutCreateSchema.parse(req.body);

      const payoutData = {
        ...validatedData,
        companyId: null, // Super admin creates global payouts
        processedBy: (req.user as any).id
      };

      const payout = await storage.createAffiliatePayout(payoutData);
      res.status(201).json(payout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Error creating payout:", error);
      res.status(500).json({ error: "Failed to create payout" });
    }
  });


  app.patch("/api/admin/affiliate/payouts/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const payoutId = parseInt(req.params.id);
      if (isNaN(payoutId)) {
        return res.status(400).json({ error: "Invalid payout ID" });
      }

      const updateSchema = z.object({
        status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]),
        paymentReference: z.string().optional(),
        externalTransactionId: z.string().optional(),
        failureReason: z.string().optional(),
        notes: z.string().optional(),
        processedAt: z.union([z.string(), z.date()]).optional(),
        processedBy: z.number().optional()
      });

      const validatedData = updateSchema.parse(req.body);

      if (validatedData.status === "completed") {
        validatedData.processedAt = new Date();
        validatedData.processedBy = (req.user as any).id;
      }

      const payout = await storage.updateAffiliatePayout(payoutId, validatedData);
      if (!payout) {
        return res.status(404).json({ error: "Payout not found" });
      }

      res.json(payout);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid input data", details: error.errors });
      }
      console.error("Error updating payout:", error);
      res.status(500).json({ error: "Failed to update payout" });
    }
  });


  app.get("/api/admin/affiliate/analytics", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const analyticsSchema = z.object({
        affiliateId: z.string().transform(val => parseInt(val)).optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        periodType: z.enum(["daily", "weekly", "monthly"]).optional(),
        groupBy: z.enum(["affiliate", "date", "country", "source"]).optional()
      });

      const params = analyticsSchema.parse(req.query);
      const analytics = await storage.getAffiliateAnalytics(params);
      res.json(analytics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching affiliate analytics:", error);
      res.status(500).json({ error: "Failed to fetch affiliate analytics" });
    }
  });


  app.get("/api/admin/affiliate/performance", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const performanceSchema = z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        topN: z.string().transform(val => parseInt(val) || 10).optional()
      });

      const params = performanceSchema.parse(req.query);
      const performance = await storage.getAffiliatePerformance(params);
      res.json(performance);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error fetching affiliate performance:", error);
      res.status(500).json({ error: "Failed to fetch affiliate performance" });
    }
  });


  app.get("/api/admin/affiliate/export", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const exportSchema = z.object({
        type: z.enum(["affiliates", "referrals", "payouts", "analytics"]),
        format: z.enum(["csv", "xlsx", "excel"]).optional().default("csv"),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        affiliateId: z.string().transform(val => parseInt(val)).optional()
      });

      const params = exportSchema.parse(req.query);
      const format = parseExportFormat(params.format);
      if (!format) return res.status(400).json({ error: 'Unsupported export format' });
      const csv = await storage.exportAffiliateData({ ...params, format: 'csv' });
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      const headers = parsed.meta.fields ?? [];
      const numericFields = new Set([
        'id', 'affiliateId', 'referredCompanyId', 'referredUserId', 'totalReferrals', 'successfulReferrals',
        'clicks', 'uniqueClicks', 'impressions', 'referrals', 'conversions', 'processedBy',
        'totalEarnings', 'pendingEarnings', 'paidEarnings', 'defaultCommissionRate', 'conversionValue',
        'commissionAmount', 'commissionRate', 'amount', 'conversionRate', 'revenue', 'commissionEarned', 'averageOrderValue',
      ]);
      const percentageFields = new Set(['defaultCommissionRate', 'commissionRate', 'conversionRate']);
      const dateFields = new Set(['createdAt', 'updatedAt', 'convertedAt', 'periodStart', 'periodEnd', 'processedAt', 'date']);
      const columns: ExportColumn[] = headers.map((header) => ({
        key: header,
        header: header.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()),
        type: percentageFields.has(header) ? 'percentage' : dateFields.has(header) ? 'date' : numericFields.has(header) ? 'number' : 'string',
        numberFormat: percentageFields.has(header) ? '0.00%' : dateFields.has(header) ? 'yyyy-mm-dd' : undefined,
        width: Math.min(32, Math.max(12, header.length + 3)),
      }));
      const rows = parsed.data.map((source) => Object.fromEntries(headers.map((header) => {
        const value = source[header];
        if (percentageFields.has(header) && value !== '') return [header, Number(value) / 100];
        if (numericFields.has(header) && value !== '') return [header, Number(value)];
        return [header, value];
      })));

      await sendTabularExport(res, {
        filename: `affiliate-${params.type}-${new Date().toISOString().slice(0, 10)}`,
        format,
        sheets: [{ name: params.type, columns, rows }],
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid query parameters", details: error.errors });
      }
      console.error("Error exporting affiliate data:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to export affiliate data" });
    }
  });
}
