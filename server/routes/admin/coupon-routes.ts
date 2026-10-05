import { Express, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { ensureSuperAdmin } from "../../middleware";


const createCouponSchema = z.object({
  code: z.string().min(1, "Coupon code is required").max(50, "Coupon code too long"),
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  description: z.string().optional(),
  discountType: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.number().positive("Discount value must be positive"),
  usageLimit: z.number().int().positive().optional().nullable(),
  usageLimitPerUser: z.number().int().positive().default(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional().nullable(),
  applicablePlanIds: z.array(z.number().int()).optional().nullable(),
  minimumPlanValue: z.number().positive().optional().nullable(),
  isActive: z.boolean().default(true)
});

const updateCouponSchema = createCouponSchema.partial().extend({
  id: z.number().int().positive()
});

const validateCouponSchema = z.object({
  code: z.string().min(1, "Coupon code is required"),
  planId: z.number().int().positive("Plan ID is required"),
  amount: z.number().positive("Amount must be positive")
});

export function setupCouponRoutes(app: Express) {
  

  app.get("/api/admin/coupons", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const coupons = await storage.getAllCoupons();
      res.json(coupons);
    } catch (error: any) {
      console.error("Error fetching coupons:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch coupons"
      });
    }
  });


  app.post("/api/admin/coupons", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const validatedData = createCouponSchema.parse(req.body);
      

      const existingCoupon = await storage.getCouponByCode(validatedData.code);
      if (existingCoupon) {
        return res.status(400).json({
          success: false,
          message: "Coupon code already exists"
        });
      }


      if (validatedData.discountType === 'percentage' && validatedData.discountValue > 100) {
        return res.status(400).json({
          success: false,
          message: "Percentage discount cannot exceed 100%"
        });
      }

      const couponData = {
        ...validatedData,
        createdBy: (req as any).user!.id,
        companyId: null // Global coupons for now
      };

      const coupon = await storage.createCoupon(couponData);
      res.status(201).json({
        success: true,
        data: coupon
      });

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          errors: error.errors
        });
      }

      console.error("Error creating coupon:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to create coupon"
      });
    }
  });


  app.put("/api/admin/coupons/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const couponId = parseInt(req.params.id);
      if (isNaN(couponId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon ID"
        });
      }

      const validatedData = updateCouponSchema.parse({ ...req.body, id: couponId });


      const existingCoupon = await storage.getCouponById(couponId);
      if (!existingCoupon) {
        return res.status(404).json({
          success: false,
          message: "Coupon not found"
        });
      }


      if (validatedData.code && validatedData.code !== existingCoupon.code) {
        const codeExists = await storage.getCouponByCode(validatedData.code);
        if (codeExists) {
          return res.status(400).json({
            success: false,
            message: "Coupon code already exists"
          });
        }
      }


      if (validatedData.discountType === 'percentage' && validatedData.discountValue && validatedData.discountValue > 100) {
        return res.status(400).json({
          success: false,
          message: "Percentage discount cannot exceed 100%"
        });
      }

      const updatedCoupon = await storage.updateCoupon(couponId, validatedData);
      res.json({
        success: true,
        data: updatedCoupon
      });

    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          message: "Invalid input data",
          errors: error.errors
        });
      }

      console.error("Error updating coupon:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to update coupon"
      });
    }
  });


  app.delete("/api/admin/coupons/:id", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const couponId = parseInt(req.params.id);
      if (isNaN(couponId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon ID"
        });
      }

      const deleted = await storage.deleteCoupon(couponId);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: "Coupon not found"
        });
      }

      res.json({
        success: true,
        message: "Coupon deleted successfully"
      });

    } catch (error: any) {
      console.error("Error deleting coupon:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to delete coupon"
      });
    }
  });


  app.post("/api/coupons/validate", async (req: Request, res: Response) => {
    try {
      const validatedData = validateCouponSchema.parse(req.body);
      
      const validation = await storage.validateCoupon(
        validatedData.code,
        validatedData.planId,
        validatedData.amount,
        req.user ? (req.user as any).id : null
      );

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: validation.reason
        });
      }

      res.json({
        success: true,
        data: {
          couponId: validation.coupon.id,
          discountAmount: validation.discountAmount,
          finalAmount: validation.finalAmount,
          discountType: validation.coupon.discountType,
          discountValue: validation.coupon.discountValue
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

      console.error("Error validating coupon:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to validate coupon"
      });
    }
  });


  app.get("/api/admin/coupons/:id/usage", ensureSuperAdmin, async (req: Request, res: Response) => {
    try {
      const couponId = parseInt(req.params.id);
      if (isNaN(couponId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid coupon ID"
        });
      }

      const usage = await storage.getCouponUsageStats(couponId);
      res.json({
        success: true,
        data: usage
      });

    } catch (error: any) {
      console.error("Error fetching coupon usage:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch coupon usage"
      });
    }
  });
}
