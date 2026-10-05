import { Express } from "express";
import { ensureAuthenticated, ensureSuperAdmin } from "./middleware";
import { storage } from "./storage";

export function setupTrialRoutes(app: Express) {

  app.get("/api/trial/status", ensureAuthenticated, async (req, res) => {
    try {
      const companyId = req.user?.companyId;
      if (!companyId) {
        return res.status(400).json({ error: "Company ID required" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      const trialStatus = {
        isInTrial: company.isInTrial,
        trialStartDate: company.trialStartDate,
        trialEndDate: company.trialEndDate,
        daysRemaining: company.trialEndDate 
          ? Math.ceil((new Date(company.trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
          : 0
      };

      res.json(trialStatus);
    } catch (error) {
      console.error("Error fetching trial status:", error);
      res.status(500).json({ error: "Failed to fetch trial status" });
    }
  });


  app.post("/api/admin/trials/process-expired", ensureSuperAdmin, async (req, res) => {
    try {

      const expiredCompanies = await storage.getCompaniesWithExpiredTrials();
      const processedCompanies = [];

      for (const company of expiredCompanies) {
        try {
          await storage.endCompanyTrial(company.id);
          processedCompanies.push({
            id: company.id,
            name: company.name,
            status: "processed"
          });
        } catch (error) {
          console.error(`Error processing expired trial for company ${company.id}:`, error);
          processedCompanies.push({
            id: company.id,
            name: company.name,
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error"
          });
        }
      }

      res.json({
        message: `Processed ${processedCompanies.length} expired trials`,
        companies: processedCompanies
      });
    } catch (error) {
      console.error("Error processing expired trials:", error);
      res.status(500).json({ error: "Failed to process expired trials" });
    }
  });


  app.get("/api/admin/trials/expiring", ensureSuperAdmin, async (req, res) => {
    try {

      const daysBeforeExpiry = parseInt(req.query.days as string) || 3;
      const expiringCompanies = await storage.getCompaniesWithExpiringTrials(daysBeforeExpiry);

      const companiesWithDetails = expiringCompanies.map(company => ({
        id: company.id,
        name: company.name,
        trialEndDate: company.trialEndDate,
        daysRemaining: company.trialEndDate 
          ? Math.ceil((new Date(company.trialEndDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
          : 0
      }));

      res.json(companiesWithDetails);
    } catch (error) {
      console.error("Error fetching expiring trials:", error);
      res.status(500).json({ error: "Failed to fetch expiring trials" });
    }
  });


  app.post("/api/admin/trials/:companyId/extend", ensureSuperAdmin, async (req, res) => {
    try {

      const companyId = parseInt(req.params.companyId);
      const { additionalDays } = req.body;

      if (!additionalDays || additionalDays <= 0) {
        return res.status(400).json({ error: "Additional days must be a positive number" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      if (!company.isInTrial || !company.trialEndDate) {
        return res.status(400).json({ error: "Company is not in trial period" });
      }

      const newTrialEndDate = new Date(company.trialEndDate);
      newTrialEndDate.setDate(newTrialEndDate.getDate() + additionalDays);

      await storage.updateCompany(companyId, {
        trialEndDate: newTrialEndDate
      });

      res.json({
        message: `Trial extended by ${additionalDays} days`,
        newTrialEndDate
      });
    } catch (error) {
      console.error("Error extending trial:", error);
      res.status(500).json({ error: "Failed to extend trial" });
    }
  });
}
