import { Router } from 'express';
import { storage } from '../storage';
import { ensureCompanyUser } from '../middleware';
import { planExpirationService } from '../services/plan-expiration-service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get plan renewal status for the current company
 */
router.get('/status', ensureCompanyUser, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = user.companyId;


    const accessCheck = await planExpirationService.checkCompanyAccess(companyId);
    

    res.json({
      success: true,
      company: accessCheck.company,
      plan: accessCheck.plan,
      expirationStatus: accessCheck.expirationStatus,
      accessAllowed: accessCheck.allowed,
      reason: accessCheck.reason
    });

  } catch (error) {
    logger.error('plan-renewal', 'Error getting renewal status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get renewal status'
    });
  }
});



/**
 * Initiate plan renewal process
 */
router.post('/initiate', ensureCompanyUser, async (req, res) => {
  try {
    const user = req.user as any;
    const companyId = user.companyId;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({
        success: false,
        error: 'Plan ID is required'
      });
    }


    const plan = await storage.getPlan(planId);
    if (!plan) {
      return res.status(404).json({
        success: false,
        error: 'Plan not found'
      });
    }



    res.json({
      success: true,
      message: 'Renewal initiated successfully',
      plan: {
        id: plan.id,
        name: plan.name,
        price: plan.price
      },

      redirectUrl: `/payment/checkout?plan=${planId}&renewal=true`
    });

  } catch (error) {
    logger.error('plan-renewal', 'Error initiating renewal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate renewal'
    });
  }
});







export default router;
