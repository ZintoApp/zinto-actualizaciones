import { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { Company } from "@shared/schema";
import { shouldReturnCompanyNotFoundForUnknownSubdomain } from "./subdomain-hosts";


const subdomainLookupCache = new Map<string, { company: Company | null; timestamp: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Invalidate subdomain cache for a specific subdomain
 * Can be called from admin-routes when company branding or settings are updated
 */
export function invalidateSubdomainCache(subdomain: string): void {
  subdomainLookupCache.delete(subdomain.toLowerCase());
}

declare global {
  namespace Express {
    interface Request {
      subdomain?: string;
      subdomainCompany?: Company;
      isSubdomainMode?: boolean;
      isEmbedded?: boolean;
    }
  }
}

/**
 * Extract subdomain from hostname
 * @param hostname - The request hostname
 * @returns The subdomain or null if not found
 */
function extractSubdomain(hostname: string): string | null {
  if (!hostname) return null;


  const cleanHostname = hostname.split(':')[0];


  const parts = cleanHostname.split('.');


  if (parts.length === 2 && parts[1] === 'localhost') {
    const subdomain = parts[0];


    if (subdomain === 'localhost') {
      return null;
    }


    if (!/^[a-z0-9-]+$/i.test(subdomain)) {
      return null;
    }


    if (subdomain.length < 2 || subdomain.length > 63) {
      return null; // RFC compliant length limits
    }

    if (subdomain.startsWith('-') || subdomain.endsWith('-')) {
      return null; // Cannot start or end with hyphen
    }

    if (subdomain.includes('--')) {
      return null; // No consecutive hyphens
    }

    return subdomain.toLowerCase();
  }


  if (parts.length < 3) return null;


  const subdomain = parts[0];


  const ignoredSubdomains = ['www', 'api', 'admin', 'app', 'mail', 'ftp', 'cdn', 'static'];
  if (ignoredSubdomains.includes(subdomain.toLowerCase())) {
    return null;
  }


  if (!/^[a-z0-9-]+$/i.test(subdomain)) {
    return null;
  }


  if (subdomain.length < 2 || subdomain.length > 63) {
    return null; // RFC compliant length limits
  }

  if (subdomain.startsWith('-') || subdomain.endsWith('-')) {
    return null; // Cannot start or end with hyphen
  }

  if (subdomain.includes('--')) {
    return null; // No consecutive hyphens
  }


  const blockedSubdomains = [
    'admin', 'api', 'www', 'mail', 'ftp', 'localhost', 'test', 'staging',
    'dev', 'development', 'prod', 'production', 'demo', 'beta', 'alpha',
    'support', 'help', 'docs', 'blog', 'news', 'status', 'monitoring',
    'security', 'ssl', 'vpn', 'proxy', 'cdn', 'static', 'assets', 'media',
    'upload', 'download', 'backup', 'archive', 'log', 'logs', 'metrics'
  ];

  if (blockedSubdomains.includes(subdomain.toLowerCase())) {
    return null;
  }

  return subdomain.toLowerCase();
}

/**
 * Get company from cache or database
 */
async function getCompanyBySubdomain(subdomain: string): Promise<Company | null> {
  const now = Date.now();
  const cached = subdomainLookupCache.get(subdomain);

  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.company;
  }

  try {
    const company = await storage.getCompanyBySlug(subdomain);
    const result = company || null;
    subdomainLookupCache.set(subdomain, { company: result, timestamp: now });
    return result;
  } catch (error) {
    console.error('Error fetching company by subdomain:', error);
    return null;
  }
}

/**
 * Check if subdomain feature is enabled globally
 */
async function isSubdomainFeatureEnabled(): Promise<boolean> {
  try {
    const setting = await storage.getAppSetting('subdomain_authentication');
    return setting?.value === true || setting?.value === 'true';
  } catch (error) {
    console.error('Error checking subdomain feature status:', error);
    return false;
  }
}

/**
 * Middleware to detect and validate subdomains
 */
export const subdomainMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {

    const isEnabled = await isSubdomainFeatureEnabled();
    req.isSubdomainMode = isEnabled;
    
    if (!isEnabled) {

      return next();
    }
    

    const hostname = req.get('host') || req.hostname;
    const subdomain = extractSubdomain(hostname);
    
    if (!subdomain) {

      return next();
    }
    

    try {
      const company = await getCompanyBySubdomain(subdomain);
      
      if (!company) {

        if (!shouldReturnCompanyNotFoundForUnknownSubdomain(hostname)) {
          return next();
        }

        return res.status(404).json({
          error: 'COMPANY_NOT_FOUND',
          message: `No company found for subdomain: ${subdomain}`,
          subdomain
        });
      }
      
      if (!company.active) {

        return res.status(403).json({
          error: 'COMPANY_INACTIVE',
          message: 'This company account is currently inactive',
          subdomain
        });
      }
      
      req.subdomain = subdomain;


      req.subdomainCompany = company;


      res.setHeader('X-Subdomain-Company', company.slug);


      if (req.query.embed === 'true') {
        req.isEmbedded = true;
      }

      res.setHeader('X-Content-Type-Options', 'nosniff');

    } catch (error) {
      console.error('Error fetching company by subdomain:', error);
      return res.status(500).json({
        error: 'SUBDOMAIN_LOOKUP_ERROR',
        message: 'Error processing subdomain request'
      });
    }

    next();
  } catch (error) {
    console.error('Error in subdomain middleware:', error);
    next(); // Continue without subdomain processing on error
  }
};

/**
 * Middleware to ensure subdomain authentication for protected routes
 */
export const requireSubdomainAuth = (req: Request, res: Response, next: NextFunction) => {

  if (!req.isSubdomainMode) {
    return next();
  }
  

  

  if (req.isAuthenticated() && req.user) {
    const user = req.user;
    

    if (user.isSuperAdmin) {
      return next();
    }
    
    
  }
  
  next();
};

/**
 * Get the appropriate login URL based on subdomain mode
 */
export function getLoginUrl(req: Request): string {
  if (req.isSubdomainMode && req.subdomain) {
    return '/auth';
  }
  return '/auth';
}

/**
 * Get the appropriate company registration URL
 */
export function getRegistrationUrl(req: Request): string {
  if (req.isSubdomainMode) {

    const hostname = req.get('host') || req.hostname;
    const parts = hostname.split('.');
    if (parts.length >= 3) {
      const mainDomain = parts.slice(1).join('.');
      const protocol = req.protocol;
      return `${protocol}://${mainDomain}/register`;
    }
  }
  return '/register';
}

export default {
  subdomainMiddleware,
  requireSubdomainAuth,
  getLoginUrl,
  getRegistrationUrl,
  extractSubdomain,
  isSubdomainFeatureEnabled
};
