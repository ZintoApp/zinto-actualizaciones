import { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { ensureAuthenticated } from "../middleware";


const applyCreditsSchema = z.object({
  amount: z.number().positive("Amount must be positive"),
  paymentTransactionId: z.number().int().positive("Invalid payment transaction ID")
});

export function setupAffiliateEarningsRoutes(app: Express) {
  

  app.get("/api/affiliate/earnings/balance", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user!;
      

      if (!user.companyId) {
        return res.status(400).json({
          success: false,
          message: "User is not associated with a company"
        });
      }

      const affiliates = await storage.getAffiliatesByCompany(user.companyId);
      const affiliate = affiliates.find(a => a.companyId === user.companyId);
      
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: "No affiliate account found for this company"
        });
      }

      const balance = await storage.getAffiliateEarningsBalance(user.companyId, affiliate.id);
      
      res.json({
        success: true,
        data: {
          affiliateId: affiliate.id,
          affiliateCode: affiliate.affiliateCode,
          totalEarned: Number(balance.totalEarned),
          availableBalance: Number(balance.availableBalance),
          appliedToPlans: Number(balance.appliedToPlans),
          pendingPayout: Number(balance.pendingPayout),
          paidOut: Number(balance.paidOut),
          lastUpdated: balance.lastUpdated
        }
      });

    } catch (error: any) {
      console.error("Error getting affiliate earnings balance:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get affiliate earnings balance"
      });
    }
  });


  app.get("/api/affiliate/earnings/transactions", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user!;
      const limit = parseInt(req.query.limit as string) || 50;
      

      if (!user.companyId) {
        return res.status(400).json({
          success: false,
          message: "User is not associated with a company"
        });
      }

      const affiliates = await storage.getAffiliatesByCompany(user.companyId);
      const affiliate = affiliates.find(a => a.companyId === user.companyId);
      
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: "No affiliate account found for this company"
        });
      }

      const transactions = await storage.getAffiliateEarningsTransactions(affiliate.id, limit);
      
      res.json({
        success: true,
        data: transactions.map(t => ({
          id: t.id,
          transactionType: t.transactionType,
          amount: Number(t.amount),
          balanceAfter: Number(t.balanceAfter),
          description: t.description,
          createdAt: t.createdAt,
          metadata: t.metadata
        }))
      });

    } catch (error: any) {
      console.error("Error getting affiliate earnings transactions:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to get affiliate earnings transactions"
      });
    }
  });


  app.post("/api/affiliate/earnings/apply-credits", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user!;
      const validatedData = applyCreditsSchema.parse(req.body);
      

      if (!user.companyId) {
        return res.status(400).json({
          success: false,
          message: "User is not associated with a company"
        });
      }

      const affiliates = await storage.getAffiliatesByCompany(user.companyId);
      const affiliate = affiliates.find(a => a.companyId === user.companyId);
      
      if (!affiliate) {
        return res.status(404).json({
          success: false,
          message: "No affiliate account found for this company"
        });
      }


      const balance = await storage.getAffiliateEarningsBalance(user.companyId, affiliate.id);
      if (Number(balance.availableBalance) < validatedData.amount) {
        return res.status(400).json({
          success: false,
          message: "Insufficient affiliate balance"
        });
      }


      const success = await storage.applyAffiliateCreditsToPayment(
        user.companyId,
        affiliate.id,
        validatedData.amount,
        validatedData.paymentTransactionId
      );

      if (!success) {
        return res.status(500).json({
          success: false,
          message: "Failed to apply affiliate credits"
        });
      }


      const updatedBalance = await storage.getAffiliateEarningsBalance(user.companyId, affiliate.id);

      res.json({
        success: true,
        message: `Successfully applied $${validatedData.amount} in affiliate credits`,
        data: {
          appliedAmount: validatedData.amount,
          remainingBalance: Number(updatedBalance.availableBalance)
        }
      });

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          errors: error.errors
        });
      }

      console.error("Error applying affiliate credits:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to apply affiliate credits"
      });
    }
  });


  app.post("/api/affiliate/earnings/check-credits", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user!;
      const { amount } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid amount"
        });
      }


      if (!user.companyId) {
        return res.json({
          success: true,
          data: {
            hasAffiliateAccount: false,
            canApplyCredits: false,
            availableBalance: 0,
            maxApplicableAmount: 0
          }
        });
      }

      const affiliates = await storage.getAffiliatesByCompany(user.companyId);
      const affiliate = affiliates.find(a => a.companyId === user.companyId);
      
      if (!affiliate) {
        return res.json({
          success: true,
          data: {
            hasAffiliateAccount: false,
            canApplyCredits: false,
            availableBalance: 0,
            maxApplicableAmount: 0
          }
        });
      }

      const balance = await storage.getAffiliateEarningsBalance(user.companyId, affiliate.id);
      const availableBalance = Number(balance.availableBalance);
      const maxApplicableAmount = Math.min(availableBalance, amount);

      res.json({
        success: true,
        data: {
          hasAffiliateAccount: true,
          canApplyCredits: availableBalance > 0,
          availableBalance,
          maxApplicableAmount,
          requestedAmount: amount
        }
      });

    } catch (error: any) {
      console.error("Error checking affiliate credits:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to check affiliate credits"
      });
    }
  });
}
