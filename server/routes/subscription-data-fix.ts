import { Router } from 'express';
import { ensureSuperAdmin } from '../middleware';
import { subscriptionDataValidator } from '../services/subscription-data-validator';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Run comprehensive subscription data validation and fix
 * This endpoint fixes the critical bug where existing deployments show incorrect renewal dialogs
 */
router.post('/validate-and-fix', ensureSuperAdmin, async (req, res) => {
  try {
    logger.info('subscription-data-fix', 'Starting subscription data validation and fix via API');

    const result = await subscriptionDataValidator.validateAndFixAllData();

    if (result.success) {
      logger.info('subscription-data-fix', `Successfully fixed ${result.fixedCompanies} companies`);
      res.json({
        success: true,
        message: `Successfully validated and fixed subscription data for ${result.fixedCompanies} companies`,
        fixedCompanies: result.fixedCompanies,
        errors: result.errors
      });
    } else {
      logger.warn('subscription-data-fix', `Fixed ${result.fixedCompanies} companies but encountered ${result.errors.length} errors`);
      res.status(207).json({ // 207 Multi-Status - partial success
        success: false,
        message: `Partially completed: fixed ${result.fixedCompanies} companies but encountered ${result.errors.length} errors`,
        fixedCompanies: result.fixedCompanies,
        errors: result.errors
      });
    }

  } catch (error) {
    logger.error('subscription-data-fix', 'Critical error during data validation:', error);
    res.status(500).json({
      success: false,
      message: 'Critical error during subscription data validation',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Generate subscription data report
 */
router.get('/report', ensureSuperAdmin, async (req, res) => {
  try {
    logger.info('subscription-data-fix', 'Generating subscription data report');

    const report = await subscriptionDataValidator.generateDataReport();

    res.json({
      success: true,
      report
    });

  } catch (error) {
    logger.error('subscription-data-fix', 'Error generating data report:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate subscription data report',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

/**
 * Check if data validation is needed
 */
router.get('/check-needed', ensureSuperAdmin, async (req, res) => {
  try {
    const report = await subscriptionDataValidator.generateDataReport();
    
    const validationNeeded = report.issuesFound.length > 0;
    
    res.json({
      success: true,
      validationNeeded,
      issuesFound: report.issuesFound,
      recommendations: report.recommendations,
      statusBreakdown: report.statusBreakdown,
      totalCompanies: report.totalCompanies
    });

  } catch (error) {
    logger.error('subscription-data-fix', 'Error checking if validation needed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check if validation is needed',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
