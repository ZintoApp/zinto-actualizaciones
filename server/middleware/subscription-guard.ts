import { Request, Response, NextFunction } from 'express';
import { planLimitsService } from '../services/plan-limits-service';
import { User as SelectUser } from '@shared/schema';

/**
 * Middleware to enforce subscription expiration
 * Blocks access for companies with expired subscriptions
 */
export const ensureActiveSubscription = async (req: Request, res: Response, next: NextFunction) => {
  try {

    const user = req.user as SelectUser;
    if (user?.isSuperAdmin) {
      return next();
    }


    const publicRoutes = [
      '/api/login',
      '/api/register',
      '/api/logout',
      '/api/auth',
      '/api/payment',
      '/api/subscription/renew',
      '/api/subscription/status',
      '/api/enhanced-subscription',
      '/api/user/plan-info'
    ];

    const isPublicRoute = publicRoutes.some(route => req.path.startsWith(route));
    if (isPublicRoute) {
      return next();
    }


    if (!user || !user.companyId) {
      return next();
    }




    const accessCheck = await planLimitsService.checkApplicationAccess(user.companyId);


    















    next();
  } catch (error) {
    console.error('Error in subscription guard middleware:', error);

    next();
  }
};

/**
 * Middleware specifically for API routes that need subscription checks
 */
export const apiSubscriptionGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {

    const user = req.user as SelectUser;
    if (user?.isSuperAdmin) {
      return next();
    }


    const allowedRoutes = [
      '/api/enhanced-subscription/status',
      '/api/enhanced-subscription/renew',
      '/api/user/plan-info',
      '/api/logout'
    ];

    if (allowedRoutes.some(route => req.path === route)) {
      return next();
    }


    if (!user || !user.companyId) {
      return res.status(403).json({
        error: 'NO_COMPANY',
        message: 'No company association found'
      });
    }


    const expirationCheck = await planLimitsService.checkSubscriptionExpiration(user.companyId);

























    (req as any).subscriptionInfo = expirationCheck;
    next();
  } catch (error) {
    console.error('Error in API subscription guard:', error);
    next();
  }
};

/**
 * Light check for non-critical operations
 * Returns warning but doesn't block access
 */
export const subscriptionWarning = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = req.user as SelectUser;
    if (!user?.companyId || user.isSuperAdmin) {
      return next();
    }

    const expirationCheck = await planLimitsService.checkSubscriptionExpiration(user.companyId);
    

    if (!expirationCheck.isExpired && expirationCheck.daysUntilExpiry !== undefined && expirationCheck.daysUntilExpiry <= 7) {
      res.setHeader('X-Subscription-Warning', 'expiring');
      res.setHeader('X-Days-Until-Expiry', expirationCheck.daysUntilExpiry.toString());
    }

    if (expirationCheck.isInGracePeriod) {
      res.setHeader('X-Subscription-Warning', 'grace-period');
      res.setHeader('X-Grace-Period-End', expirationCheck.gracePeriodEnd?.toISOString() || '');
    }

    next();
  } catch (error) {
    console.error('Error in subscription warning middleware:', error);
    next();
  }
};
