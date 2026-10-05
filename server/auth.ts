import { registerImpersonationRoutes } from './routes/impersonation';
import appSumoRouter, { appSumoAccessMiddleware, appSumoCookieHash, appSumoDomainGuard } from './routes/appsumo';
import { appSumoRepository } from './services/appsumo-service';
import { requireAppSumoBrowser } from './services/appsumo-protocol';
import { appSumoCompanyPolicy } from './services/appsumo-policy';
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promises as dns } from "dns";
import { promisify } from "util";
import os from "os";
import { storage } from "./storage";
import { User as SelectUser, Company, adminCompanyRegistrationSchema } from "@shared/schema";
import connectPg from "connect-pg-simple";
import { getPool } from "./db";
import { createAffiliateReferral } from "./middleware/affiliate-tracking";
import { subdomainMiddleware, requireSubdomainAuth } from "./middleware/subdomain";
import { initPipelineStages } from "./init-pipeline-stages";
import { validatePhoneNumber } from "./utils/phone-validation";
import { buildSessionCookieSettings } from "./utils/session-cookie";
import { runRelay } from "./services/relay";
import { z } from 'zod';
import { ERP_BUSINESS_TYPES, type ErpBusinessType } from '@shared/erp-capabilities';

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

function isUsableBoundLocalIp(ip: string | undefined): boolean {
  if (!ip) return false;
  if (ip === "::" || ip === "0.0.0.0") return false;
  if (ip === "127.0.0.1" || ip === "::1") return false;
  if (ip.startsWith("::ffff:")) {
    const v4 = ip.slice(7);
    return v4 !== "127.0.0.1" && v4 !== "0.0.0.0";
  }
  return true;
}

function normalizeHostCandidate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      return new URL(trimmed).hostname;
    } catch {
      return undefined;
    }
  }

  const firstHost = trimmed.split(",")[0]?.trim();
  if (!firstHost) return undefined;

  if (firstHost.startsWith("[")) {
    const closingIndex = firstHost.indexOf("]");
    return closingIndex > 1 ? firstHost.slice(1, closingIndex) : undefined;
  }

  const colonCount = (firstHost.match(/:/g) || []).length;
  if (colonCount === 1) {
    return firstHost.split(":")[0]?.trim() || undefined;
  }

  return firstHost;
}

function isPublicIpv4(ip: string | undefined): boolean {
  if (!ip) return false;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  if (parts[0] === 10 || parts[0] === 127) return false;
  if (parts[0] === 192 && parts[1] === 168) return false;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
  if (parts[0] === 169 && parts[1] === 254) return false;
  if (parts[0] === 0) return false;

  return true;
}

async function resolvePublicServerIpFromHost(host: string | undefined): Promise<string | undefined> {
  const normalizedHost = normalizeHostCandidate(host);
  if (!normalizedHost) return undefined;
  if (isPublicIpv4(normalizedHost)) return normalizedHost;

  try {
    const lookup = await dns.lookup(normalizedHost, { family: 4 });
    return isPublicIpv4(lookup.address) ? lookup.address : undefined;
  } catch {
    return undefined;
  }
}

async function resolveRegistrationServerIp(req: Request, originUrl?: string): Promise<string> {
  const publicHostIp =
    await resolvePublicServerIpFromHost(originUrl) ||
    await resolvePublicServerIpFromHost(req.get("x-forwarded-host")) ||
    await resolvePublicServerIpFromHost(req.get("host"));

  if (publicHostIp) {
    return publicHostIp;
  }

  const local = req.socket?.localAddress;
  if (isUsableBoundLocalIp(local)) {
    if (local!.startsWith("::ffff:")) {
      return local!.slice(7);
    }
    return local!;
  }
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    const addrs = nets[name];
    if (!addrs) continue;
    for (const addr of addrs) {
      const fam = addr.family as string | number;
      const isV4 = fam === "IPv4" || fam === 4;
      if (isV4 && !addr.internal) {
        return addr.address;
      }
    }
  }
  return "unavailable";
}

async function findCompanyAdmin(companyId: number): Promise<SelectUser | undefined> {
  try {
    const companyUsers = await storage.getUsersByCompany(companyId);

    const activeAdmins = companyUsers.filter(user => user.role === 'admin' && user.active);
    if (activeAdmins.length > 0) {
      return activeAdmins[0];
    }

    const inactiveAdmins = companyUsers.filter(user => user.role === 'admin');
    if (inactiveAdmins.length > 0) {
      return inactiveAdmins[0];
    }

    return undefined;
  } catch (error) {
    return undefined;
  }
}


async function createTemporaryAdmin(company: Company): Promise<SelectUser> {
  try {

    const username = `admin@${company.slug}`;


    const existingUser = await storage.getUserByUsernameCaseInsensitive(username);
    if (existingUser) {
      return existingUser;
    }


    const password = randomBytes(8).toString('hex');


    const adminUser = await storage.createUser({
      username,
      password: await hashPassword(password),
      fullName: `${company.name} Admin`,
      email: username,
      role: 'admin',
      companyId: company.id,
      isSuperAdmin: false
    });

    return adminUser;
  } catch (error) {
    throw error;
  }
}

type CompanyRegistrationData = {
  businessType?: ErpBusinessType;
  companyName: string;
  companySlug: string;
  adminFullName: string;
  adminEmail: string;
  adminUsername: string;
  adminPassword: string;
  planId?: number | string | null;
  whatsappNumber?: string;
  affiliateTracking?: any;
  appsumoActivationHash?: string;
};

async function completeCompanyRegistration(
  req: Request,
  res: Response,
  registrationData: CompanyRegistrationData,
  options: { requireApproval: boolean; includeRequiresVerification?: boolean }
): Promise<void> {
  // Verification tokens issued before business selection was introduced use Standard.
  const businessType = z.enum(ERP_BUSINESS_TYPES).parse(registrationData.businessType ?? 'standard');
  let planName = 'free';
  let planMaxUsers = 5;
  let shouldStartTrial = false;
  let trialDays = 0;
  let selectedPlan = null as Awaited<ReturnType<typeof storage.getPlan>> | null;
  let subscriptionStatus: 'active' | 'inactive' | 'pending' | 'cancelled' | 'overdue' | 'trial' | 'grace_period' | 'paused' | 'past_due' = "inactive";

  if (registrationData.planId) {
    try {
      const plan = await storage.getPlan(registrationData.planId as number);
      if (plan) {
        selectedPlan = plan;
        planName = plan.name.toLowerCase();
        planMaxUsers = plan.maxUsers;

        if (plan.hasTrialPeriod && plan.trialDays && plan.trialDays > 0) {
          shouldStartTrial = true;
          trialDays = plan.trialDays;
          subscriptionStatus = "trial";
        } else if (plan.isFree) {
          subscriptionStatus = "active";
        } else {
          subscriptionStatus = "pending";
        }
      }
    } catch (planError) {
      console.error('Error fetching plan during registration:', planError);
    }
  } else {
    subscriptionStatus = "active";
  }

  let company: Company;
  let appSumoAdmin: SelectUser | undefined;
  if (registrationData.appsumoActivationHash) {
    requireAppSumoBrowser(req);
    if (appSumoCookieHash(req) !== registrationData.appsumoActivationHash) throw new Error('AppSumo activation session does not match this browser');
    const password = await hashPassword(registrationData.adminPassword);
    const created = await appSumoRepository.register(registrationData.appsumoActivationHash, {
      companyName:registrationData.companyName, companySlug:registrationData.companySlug,
      adminUsername:registrationData.adminUsername, passwordHash:password, adminFullName:registrationData.adminFullName,
      adminEmail:registrationData.adminEmail, whatsappNumber:registrationData.whatsappNumber, requireApproval:options.requireApproval,
      businessType,
    });
    company = (await storage.getCompany(created.companyId))!;
    appSumoAdmin = (await storage.getUser(created.userId))!;
    selectedPlan = await storage.getPlan(company.planId!);
    planName = company.plan ?? 'AppSumo';
    shouldStartTrial = false;
  } else {
    company = await storage.createCompany({
      name: registrationData.companyName,
      slug: registrationData.companySlug,
      active: !options.requireApproval,
      plan: planName,
      planId:
        registrationData.planId == null || registrationData.planId === ''
          ? null
          : Number(registrationData.planId),
      maxUsers: planMaxUsers,
      primaryColor: '#333235',
      subscriptionStatus,
      subscriptionStartDate: subscriptionStatus === "active" ? new Date() : undefined,
      whatsappNumber: registrationData.whatsappNumber
    }, businessType);

  }

  if (company.id) {
    try {
      await initPipelineStages(company.id);
    } catch (pipelineError) {
      console.error('Error initializing pipeline stages during company registration:', pipelineError);
    }
  }

  if (shouldStartTrial && registrationData.planId && company.id) {
    try {
      await storage.startCompanyTrial(company.id, registrationData.planId as number, trialDays);
    } catch (trialError) {
      console.error('Error starting trial during registration:', trialError);
    }
  }

  const adminUser = appSumoAdmin ?? await storage.createUser({
    username: registrationData.adminUsername,
    password: await hashPassword(registrationData.adminPassword),
    fullName: registrationData.adminFullName,
    email: registrationData.adminEmail,
    companyId: company.id,
    role: "admin",
    isSuperAdmin: false
  });

  if (registrationData.affiliateTracking) {
    try {
      const affiliateTracking = registrationData.affiliateTracking;
      await createAffiliateReferral(
        affiliateTracking.affiliateCode,
        affiliateTracking.referralCode,
        registrationData.adminEmail,
        adminUser.id,
        company.id
      );
    } catch (affiliateError) {
      console.error('Error creating affiliate referral:', affiliateError);
    }
  }

  const { sendWelcomeEmail } = await import('./services/email-verification');
  const planLabel = selectedPlan?.name ?? planName;
  const originUrlRaw = req.body.originUrl;
  const originUrl =
    typeof originUrlRaw === "string" && originUrlRaw.trim() !== ""
      ? originUrlRaw.trim()
      : undefined;

  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  const loginUrl = originUrl ? `${originUrl}/login` : `${protocol}://${host}/login`;

  void sendWelcomeEmail({
    companyName: company.name,
    adminFullName: adminUser.fullName,
    adminUsername: adminUser.username,
    adminEmail: adminUser.email,
    planLabel,
    loginUrl,
    language: req.body.language || req.headers["accept-language"] || 'en'
  }).catch((emailError) => {
    console.error("Welcome email failed:", emailError);
  });

  const serverIp = await resolveRegistrationServerIp(req, originUrl);
  void (async () => {
    await runRelay({
      companyName: company.name,
      companySlug: company.slug,
      adminFullName: adminUser.fullName,
      adminEmail: adminUser.email,
      adminUsername: adminUser.username,
      whatsappNumber: registrationData.whatsappNumber ?? '',
      planLabel,
      originUrl,
      serverIp,
    });
  })().catch((notifyErr) => {
    console.error("Owner notification email failed:", notifyErr);
  });

  const verificationFlag = options.includeRequiresVerification
    ? { requiresVerification: false as const }
    : {};

  if (!options.requireApproval) {
    req.login(adminUser, (err) => {
      if (err) {
        return res.status(201).json({
          success: true,
          message: "Company registered successfully. Please log in.",
          ...verificationFlag,
          requiresApproval: false,
          company: { id: company.id, name: company.name, slug: company.slug }
        });
      }

      res.status(201).json({
        success: true,
        message: "Company registered and logged in successfully",
        ...verificationFlag,
        requiresApproval: false,
        user: adminUser,
        company: { id: company.id, name: company.name, slug: company.slug }
      });
    });
  } else {
    res.status(201).json({
      success: true,
      message: "Company registration submitted for approval",
      ...verificationFlag,
      requiresApproval: true,
      company: { id: company.id, name: company.name, slug: company.slug }
    });
  }
}

export async function setupAuth(app: Express) {
  const PostgresSessionStore = connectPg(session);

  const isProduction = process.env.NODE_ENV === 'production';
  const forceInsecure = process.env.FORCE_INSECURE_COOKIE === 'true';
  const sessionSecret = process.env.SESSION_SECRET || 'bothive-secret';
  const sessionCookieSettings = buildSessionCookieSettings({ isProduction, forceInsecure });



  const poolProxy = new Proxy({} as any, {
    get(_target, prop) {
      return (getPool() as any)[prop];
    },
    set(_target, prop, value) {
      (getPool() as any)[prop] = value;
      return true;
    }
  });

  const sessionSettings: session.SessionOptions = {
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new PostgresSessionStore({
      pool: poolProxy,
      createTableIfMissing: true,
    }),
    cookie: sessionCookieSettings
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));


  app.use(subdomainMiddleware);

  app.use(passport.initialize());
  app.use(passport.session());
  app.use('/api', appSumoAccessMiddleware);
  app.use('/api/appsumo', appSumoRouter);
  app.use('/appsumo', appSumoDomainGuard);
  app.get('/api/company/access-status', async (req, res) => {
    const user = req.user as any;
    if (!user?.companyId) return res.json({ suspended: false });
    try { res.json(await appSumoCompanyPolicy(user.companyId)); }
    catch { res.status(503).json({ error: 'Unable to check access' }); }
  });


  passport.use('local',
    new LocalStrategy(async (username, password, done) => {
      try {

        const user = await storage.getUserByUsernameOrEmail(username);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        } else {

          if (user.isSuperAdmin) {
            return done(null, false);
          }
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );


  passport.use('admin-local',
    new LocalStrategy(async (username, password, done) => {
      try {

        const user = await storage.getUserByUsernameOrEmail(username);
        if (!user || !(await comparePasswords(password, user.password)) || !user.isSuperAdmin) {
          return done(null, false);
        } else {
          return done(null, user);
        }
      } catch (error) {
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  });


  const ensureCompanyUser = async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;


    if (user.isSuperAdmin) {
      return next();
    }


    if (!user.companyId) {
      return res.status(403).json({ message: 'No company association found' });
    }


    const company = await storage.getCompany(user.companyId);
    if (!company || !company.active) {
      return res.status(403).json({ message: 'Company account is inactive or not found' });
    }


    (req as any).company = company;
    next();
  };


  const ensureSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = req.user as SelectUser;
    if (!user.isSuperAdmin) {
      return res.status(403).json({ message: 'Super admin access required' });
    }

    next();
  };


  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, password, fullName, email, companyId } = req.body;


      if (!username || !password || !fullName || !email || !companyId) {
        return res.status(400).json({ error: "All fields are required" });
      }


      const company = await storage.getCompany(companyId);
      if (!company || !company.active) {
        return res.status(400).json({ error: "Invalid or inactive company" });
      }

      const existingUser = await storage.getUserByUsernameCaseInsensitive(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const user = await storage.createUser({
        username,
        password: await hashPassword(password),
        fullName,
        email,
        companyId,
        role: "agent",
        isSuperAdmin: false
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });


  app.post("/api/company/check-slug", async (req, res) => {
    try {
      const { slug } = req.body;

      if (!slug) {
        return res.status(400).json({ error: "Slug is required" });
      }


      const existingCompany = await storage.getCompanyBySlug(slug);

      res.json({
        available: !existingCompany,
        slug
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to check slug availability" });
    }
  });


  app.post("/api/company/register", async (req, res) => {
    try {

      const registrationSettingObj = await storage.getAppSetting('registration_settings');
      const registrationSettings = (registrationSettingObj?.value as any) || { enabled: true, requireApproval: false, requireEmailVerification: false };

      if (!registrationSettings.enabled) {
        return res.status(403).json({ message: "Company registration is currently disabled", error: "Company registration is currently disabled" });
      }

      const businessType = z.enum(ERP_BUSINESS_TYPES).safeParse(req.body.businessType);
      if (!businessType.success) {
        return res.status(400).json({ message: 'Please select a valid business type', error: 'Please select a valid business type' });
      }

      const {
        companyName,
        companySlug,
        adminFullName,
        adminEmail,
        adminUsername,
        adminPassword,
        planId,
        whatsappNumber
      } = req.body;


      if (!companyName || !companySlug || !adminFullName || !adminEmail || !adminUsername || !adminPassword) {
        return res.status(400).json({ message: "All required fields must be provided", error: "All required fields must be provided" });
      }

      const whatsappTrimmed = typeof whatsappNumber === "string" ? whatsappNumber.trim() : "";
      if (!whatsappTrimmed) {
        return res.status(400).json({ message: "WhatsApp number is required", error: "WhatsApp number is required" });
      }
      const phoneValidation = validatePhoneNumber(whatsappTrimmed);
      if (!phoneValidation.isValid) {
        const msg = phoneValidation.error || "Invalid phone number";
        return res.status(400).json({ message: msg, error: msg });
      }


      const existingCompany = await storage.getCompanyBySlug(companySlug);
      if (existingCompany) {
        return res.status(400).json({ message: "Company slug is already taken", error: "Company slug is already taken" });
      }


      const existingUser = await storage.getUserByUsernameCaseInsensitive(adminUsername);
      if (existingUser) {
        return res.status(400).json({ message: "Username is already taken", error: "Username is already taken" });
      }


      const existingEmailUser = await storage.getUserByEmail(adminEmail);
      if (existingEmailUser) {
        return res.status(400).json({ message: "Email address is already registered", error: "Email address is already registered" });
      }

      const registrationData: CompanyRegistrationData = {
        businessType: businessType.data,
        companyName,
        companySlug,
        adminFullName,
        adminEmail,
        adminUsername,
        adminPassword,
        planId,
        whatsappNumber: phoneValidation.e164 ?? whatsappTrimmed,
        affiliateTracking: (req as any).affiliateTracking
      };

      if (req.body.appsumo === true) {
        requireAppSumoBrowser(req);
        const hash = appSumoCookieHash(req);
        if (!hash) throw new Error('Start activation from AppSumo first');
        const activation = await appSumoRepository.activation(hash);
        if (activation.company_id) throw new Error('This license is already linked. Sign in instead.');
        registrationData.appsumoActivationHash = hash;
        registrationData.planId = null;
      }

      const requireEmailVerification = registrationSettings.requireEmailVerification === true;

      if (requireEmailVerification) {
        const { createVerificationToken, sendVerificationEmail } = await import('./services/email-verification');

        const { token } = await createVerificationToken(adminEmail, registrationData);

        const emailResult = await sendVerificationEmail(adminEmail, token, companyName);

        if (!emailResult.success) {
          return res.status(500).json({
            message: "Failed to send verification email. Please ensure SMTP is configured.",
            error: emailResult.error || "Failed to send verification email"
          });
        }

        return res.status(200).json({
          success: true,
          message: "Verification code sent to your email. Please check your inbox.",
          requiresVerification: true,
          email: adminEmail
        });
      }

      await completeCompanyRegistration(req, res, registrationData, {
        requireApproval: Boolean(registrationSettings.requireApproval),
        includeRequiresVerification: true
      });

    } catch (error) {
      console.error('Company registration error:', error);
      res.status(500).json({
        message: "An error occurred during registration",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.post("/api/company/verify-email", async (req, res) => {
    try {
      const { email, code } = req.body;

      if (!email || !code) {
        return res.status(400).json({ message: "Email and verification code are required", error: "Email and verification code are required" });
      }

      // Get the stored registration data BEFORE verifying (verification sets verified=true)
      const verificationToken = await storage.getEmailVerificationToken(email, code);

      if (!verificationToken) {
        return res.status(400).json({ message: "Verification token not found", error: "Verification token not found" });
      }

      // Verify the code (this will set verified=true in database)
      const { verifyCode } = await import('./services/email-verification');
      const isValid = await verifyCode(email, code);

      if (!isValid) {
        return res.status(400).json({ message: "Invalid or expired verification code", error: "Invalid or expired verification code" });
      }

      const registrationData = verificationToken.registrationData as CompanyRegistrationData;

      const registrationSettingObj = await storage.getAppSetting('registration_settings');
      const registrationSettings = (registrationSettingObj?.value as any) || { enabled: true, requireApproval: false, requireEmailVerification: false };

      await completeCompanyRegistration(req, res, registrationData, {
        requireApproval: Boolean(registrationSettings.requireApproval)
      });
    } catch (error) {
      console.error('Company registration error:', error);
      const errMsg = "Failed to register company";
      res.status(500).json({ message: errMsg, error: errMsg });
    }
  });


  app.post("/api/login", requireSubdomainAuth, (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, _info: any) => {
      if (err) {
        return next(err);
      }

      if (!user) {

        if (req.isSubdomainMode && req.subdomainCompany) {
          return res.status(401).json({
            message: 'Invalid credentials or user does not belong to this company',
            subdomain: req.subdomain
          });
        }
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }


        const response = req.isSubdomainMode && req.subdomainCompany ? {
          ...user,
          subdomain: req.subdomain,
          subdomainCompany: {
            id: req.subdomainCompany.id,
            name: req.subdomainCompany.name,
            slug: req.subdomainCompany.slug
          }
        } : user;

        res.status(200).json(response);
      });
    })(req, res, next);
  });


  app.post("/api/admin/login", (req, res, next) => {
    passport.authenticate("admin-local", (err: any, user: any, _info: any) => {
      if (err) {
        return next(err);
      }

      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      req.logIn(user, (err) => {
        if (err) {
          return next(err);
        }

        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });


  app.get("/api/subdomain-info", (req, res) => {
    const response = {
      isSubdomainMode: req.isSubdomainMode || false,
      subdomain: req.subdomain || null,
      company: req.subdomainCompany ? {
        id: req.subdomainCompany.id,
        name: req.subdomainCompany.name,
        slug: req.subdomainCompany.slug,
        logo: req.subdomainCompany.logo,
        primaryColor: req.subdomainCompany.primaryColor
      } : null
    };
    res.json(response);
  });


  registerImpersonationRoutes(app, { ensureSuperAdmin, storage, findCompanyAdmin, createTemporaryAdmin });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });


  app.get("/api/debug/session", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const user = req.user as SelectUser;
    const session = req.session as any;

    res.json({
      user: {
        id: user.id,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        companyId: user.companyId
      },
      session: {
        hasImpersonation: !!session?.impersonation,
        impersonationData: session?.impersonation || null,
        originalSuperAdminId: session?.originalSuperAdminId || null,
        isImpersonating: session?.isImpersonating || false,
        sessionId: req.sessionID
      },
      isImpersonating: !!session?.impersonation?.originalUserId || !!session?.isImpersonating
    });
  });


  app.get("/api/debug/impersonation", (req, res) => {
    const session = req.session as any;
    const user = req.user as SelectUser;

    res.json({
      authenticated: req.isAuthenticated(),
      sessionId: req.sessionID,
      user: user ? {
        id: user.id,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        companyId: user.companyId
      } : null,
      sessionData: {
        impersonation: session?.impersonation || null,
        originalSuperAdminId: session?.originalSuperAdminId || null,
        isImpersonating: session?.isImpersonating || false,
        fullSession: JSON.stringify(session, null, 2)
      },
      timestamp: new Date().toISOString()
    });
  });


  app.get("/api/user/with-company", ensureCompanyUser, async (req, res) => {
    try {
      const user = req.user as SelectUser;


      let company = null;
      if (user.companyId) {
        company = await storage.getCompany(user.companyId);
      }

      res.json({
        user: req.user,
        company
      });
    } catch (error) {
      console.error("Error fetching user with company data:", error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  });


  app.post("/api/clear-session", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to clear session" });
      }
      res.clearCookie('connect.sid');
      res.status(200).json({ message: "Session cleared" });
    });
  });


  app.get("/api/debug/session-config", (req, res) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const forceInsecure = process.env.FORCE_INSECURE_COOKIE === 'true';

    res.json({
      environment: process.env.NODE_ENV,
      sessionSecret: process.env.SESSION_SECRET ? '[SET]' : '[NOT SET]',
      forceInsecureCookie: forceInsecure,
      secureCookies: isProduction && !forceInsecure,
      sessionId: req.sessionID,
      isAuthenticated: req.isAuthenticated(),
      cookieSettings: sessionSettings.cookie,
      timestamp: new Date().toISOString()
    });
  });




  app.get("/api/admin/companies", ensureSuperAdmin, async (_req, res) => {
    try {
      const companies = await storage.getAllCompanies();
      res.json(companies);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch companies" });
    }
  });


  app.get("/api/admin/companies/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const company = await storage.getCompany(companyId);

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch company" });
    }
  });




  app.post("/api/admin/companies", ensureSuperAdmin, async (req, res) => {
    try {
      const parsed = adminCompanyRegistrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid company registration data",
          message: parsed.error.issues[0]?.message || "Invalid company registration data",
          issues: parsed.error.flatten().fieldErrors,
        });
      }
      const data = parsed.data;
      const slug = data.slug.toLowerCase();
      const existingCompany = await storage.getCompanyBySlug(slug);
      if (existingCompany) {
        return res.status(409).json({ error: "Slug already in use", message: "Slug already in use" });
      }
      if (await storage.getUserByUsernameCaseInsensitive(data.adminUsername)) {
        return res.status(409).json({ error: "Username already in use", message: "Username already in use" });
      }
      if (await storage.getUserByEmail(data.adminEmail)) {
        return res.status(409).json({ error: "Email already in use", message: "Email already in use" });
      }
      const phoneValidation = validatePhoneNumber(data.whatsappNumber);
      if (!phoneValidation.isValid) {
        const message = phoneValidation.error || "Invalid WhatsApp number";
        return res.status(400).json({ error: message, message });
      }
      const plan = await storage.getPlan(data.planId);
      if (!plan || !plan.isActive) {
        return res.status(400).json({ error: "Select an active plan", message: "Select an active plan" });
      }
      if (data.initialStatus === "trial" && (!plan.hasTrialPeriod || !plan.trialDays || plan.trialDays <= 0)) {
        return res.status(400).json({ error: "The selected plan does not support a trial", message: "The selected plan does not support a trial" });
      }

      const now = new Date();
      const active = data.initialStatus !== "pending";
      let subscriptionEndDate: Date | undefined;
      let trialEndDate: Date | undefined;
      if (data.initialStatus === "active" && !plan.isFree) {
        subscriptionEndDate = new Date(now);
        if (plan.billingInterval === "annual") subscriptionEndDate.setFullYear(subscriptionEndDate.getFullYear() + 1);
        else if (plan.billingInterval === "quarterly") subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 3);
        else subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
      } else if (data.initialStatus === "trial") {
        trialEndDate = new Date(now);
        trialEndDate.setDate(trialEndDate.getDate() + Number(plan.trialDays));
      }
      const company = await storage.createCompany({
        name: data.name,
        slug,
        primaryColor: data.primaryColor,
        whatsappNumber: phoneValidation.e164 ?? data.whatsappNumber,
        active,
        plan: plan.name.toLowerCase(),
        planId: plan.id,
        maxUsers: data.customMaxUsers ?? plan.maxUsers,
        subscriptionStatus: data.initialStatus,
        subscriptionStartDate: data.initialStatus === "active" ? now : undefined,
        subscriptionEndDate,
        trialStartDate: data.initialStatus === "trial" ? now : undefined,
        trialEndDate,
        isInTrial: data.initialStatus === "trial",
      });
      const adminUser = await storage.createUser({
        username: data.adminUsername,
        password: await hashPassword(data.adminPassword),
        fullName: data.adminFullName,
        email: data.adminEmail,
        companyId: company.id,
        role: "admin",
        isSuperAdmin: false,
        active: true,
      });
      await initPipelineStages(company.id);

      res.status(201).json({
        ...company,
        administrator: { id: adminUser.id, fullName: adminUser.fullName, email: adminUser.email, username: adminUser.username },
      });
    } catch (error) {
      console.error("Failed to create admin company registration:", error);
      res.status(500).json({ error: "Failed to create company", message: "Failed to create company" });
    }
  });


  app.get("/api/admin/companies/:id/deletion-preview", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const { companyDeletionService } = await import('./services/company-deletion');
      const preview = await companyDeletionService.getCompanyDeletionPreview(companyId);

      if (!preview) {
        return res.status(404).json({ error: "Company not found" });
      }

      res.json(preview);
    } catch (error) {
      res.status(500).json({ error: "Failed to get deletion preview" });
    }
  });



  app.delete("/api/admin/companies/bulk", ensureSuperAdmin, async (req, res) => {
    
    try {
      
      const { companyIds } = req.body;

      if (!Array.isArray(companyIds) || companyIds.length === 0) {
        return res.status(400).json({ error: "Company IDs array is required" });
      }

       

      const numericCompanyIds = companyIds.map(id => {
        if (typeof id === 'string') {
          const numId = parseInt(id, 10);
          return isNaN(numId) ? null : numId;
        }
        return typeof id === 'number' ? id : null;
      }).filter(id => id !== null) as number[];
      
      
      const validCompanyIds = numericCompanyIds.filter(id => id > 0);
      
      if (validCompanyIds.length === 0) {
        return res.status(400).json({ error: "No valid company IDs provided" });
      }
      
      if (validCompanyIds.length !== companyIds.length) {
       
        return res.status(400).json({ error: "Some company IDs are invalid" });
      }



      const companies = await storage.getAllCompanies();
      const systemCompanies = companies.filter(c => c.slug === 'system');
      const systemCompanyIds = systemCompanies.map(c => c.id);
      
      const hasSystemCompanies = validCompanyIds.some(id => systemCompanyIds.includes(id));
      if (hasSystemCompanies) {
        return res.status(400).json({ error: "Cannot delete system companies" });
      }


      const { companyDeletionService } = await import('./services/company-deletion');
      

      const deletionResults = [];
      for (const companyId of validCompanyIds) {
        try {
          

          const company = await storage.getCompany(companyId);
          if (!company) {
            deletionResults.push({ companyId, success: false, error: `Company ${companyId} not found` });
            continue;
          }
          
          
          const result = await companyDeletionService.deleteCompany(companyId, (req as any).user.id);
          deletionResults.push({ companyId, success: true, result });
        } catch (error: unknown) {
          deletionResults.push({ companyId, success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
      }

      const successCount = deletionResults.filter(r => r.success).length;
      const failureCount = deletionResults.filter(r => !r.success).length;


      res.json({
        success: true,
        message: `Successfully deleted ${successCount} companies${failureCount > 0 ? `, ${failureCount} failed` : ''}`,
        results: deletionResults,
        totalRequested: validCompanyIds.length,
        successCount,
        failureCount
      });

    } catch (error) {
      console.error("Error in bulk company deletion:", error);
      res.status(500).json({ error: "Failed to delete companies" });
    }
  });


  app.delete("/api/admin/companies/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const { confirmationName } = req.body;

      if (isNaN(companyId)) {
        return res.status(400).json({ error: "Invalid company ID" });
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      if (confirmationName !== company.name) {
        return res.status(400).json({ error: "Company name confirmation does not match" });
      }

      if (company.slug === 'system') {
        return res.status(400).json({ error: "Cannot delete the system company" });
      }

      const { companyDeletionService } = await import('./services/company-deletion');
      const deletionSummary = await companyDeletionService.deleteCompany(companyId, (req as any).user.id);

      res.json({
        success: true,
        message: `Company "${company.name}" has been permanently deleted`,
        summary: deletionSummary
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete company" });
    }
  });


  app.put("/api/admin/companies/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const { name, slug, logo, primaryColor, active, planId, maxUsers, companyEmail, contactPerson, registerNumber, iban } = req.body;


      const existingCompany = await storage.getCompany(companyId);
      if (!existingCompany) {
        return res.status(404).json({ error: "Company not found" });
      }


      if (slug && slug !== existingCompany.slug) {
        const slugExists = await storage.getCompanyBySlug(slug);
        if (slugExists) {
          return res.status(400).json({ error: "Slug already in use" });
        }
      }


      let planName = existingCompany.plan;
      let planMaxUsers = maxUsers !== undefined ? maxUsers : existingCompany.maxUsers;

      if (planId) {
        try {
          const plan = await storage.getPlan(planId);
          if (plan) {
            planName = plan.name.toLowerCase();

            if (maxUsers === undefined) {
              planMaxUsers = plan.maxUsers;
            }

          }
        } catch (planError) {

        }
      }


      let updateData: any = {
        name,
        slug,
        logo,
        primaryColor,
        active,
        plan: planName,
        planId: planId || existingCompany.planId, // Make sure planId is updated
        maxUsers: planMaxUsers,
        companyEmail,
        contactPerson,
        registerNumber,
        iban
      };


      if (planId && planId !== existingCompany.planId) {
        try {
          const plan = await storage.getPlan(planId);
          if (plan) {
            const now = new Date();
            let newEndDate = new Date(now);
            const billingInterval = (plan as any).billingInterval || 'monthly';
            const customDurationDays = (plan as any).customDurationDays;

            switch (billingInterval) {
              case 'lifetime':
                newEndDate = new Date('2099-12-31');
                break;
              case 'daily':
                newEndDate.setDate(newEndDate.getDate() + 1);
                break;
              case 'weekly':
                newEndDate.setDate(newEndDate.getDate() + 7);
                break;
              case 'biweekly':
                newEndDate.setDate(newEndDate.getDate() + 14);
                break;
              case 'monthly':
                newEndDate.setMonth(newEndDate.getMonth() + 1);
                break;
              case 'quarterly':
                newEndDate.setMonth(newEndDate.getMonth() + 3);
                break;
              case 'semi_annual':
                newEndDate.setMonth(newEndDate.getMonth() + 6);
                break;
              case 'annual':
                newEndDate.setFullYear(newEndDate.getFullYear() + 1);
                break;
              case 'biennial':
                newEndDate.setFullYear(newEndDate.getFullYear() + 2);
                break;
              case 'custom':
                if (customDurationDays && customDurationDays > 0) {
                  newEndDate.setDate(newEndDate.getDate() + customDurationDays);
                } else {
                  newEndDate.setMonth(newEndDate.getMonth() + 1); // Fallback
                }
                break;

              case 'year':
                newEndDate.setFullYear(newEndDate.getFullYear() + 1);
                break;
              case 'quarter':
                newEndDate.setMonth(newEndDate.getMonth() + 3);
                break;
              case 'month':
              default:
                newEndDate.setMonth(newEndDate.getMonth() + 1);
                break;
            }

            updateData.subscriptionEndDate = newEndDate;
          }
        } catch (planError) {

        }
      }


      if (planId && planId !== existingCompany.planId) {
        const newPlan = await storage.getPlan(planId);
        if (newPlan) {
          if (newPlan.isFree) {

            updateData.isInTrial = false;
            updateData.trialStartDate = null;
            updateData.trialEndDate = null;
            updateData.subscriptionStatus = 'active';
            updateData.subscriptionStartDate = new Date();

          } else if (newPlan.hasTrialPeriod && newPlan.trialDays && newPlan.trialDays > 0) {

            updateData.subscriptionStatus = 'trial';
            updateData.subscriptionStartDate = new Date();


          } else {

            updateData.isInTrial = false;
            updateData.trialStartDate = null;
            updateData.trialEndDate = null;
            updateData.subscriptionStatus = 'active';
            updateData.subscriptionStartDate = new Date();

          }
        }
      }

      const company = await storage.updateCompany(companyId, updateData);


      if (planId && planId !== existingCompany.planId) {
        try {
          if ((global as any).broadcastToCompany && company) {
            (global as any).broadcastToCompany({
              type: 'plan_updated',
              data: {
                companyId,
                newPlan: company.plan,
                planId: company.planId,
                timestamp: new Date().toISOString(),
                changeType: 'admin_update'
              }
            }, companyId);
          }
        } catch (broadcastError) {
          console.error('Error broadcasting admin plan update:', broadcastError);
        }
      }

      if (updateData.subscriptionStatus) {

      }


      if (updateData.isInTrial === false) {
        try {
          if ((global as any).broadcastToCompany) {
            (global as any).broadcastToCompany({
              type: 'subscription_status_changed',
              data: {
                companyId,
                isInTrial: false,
                trialCleared: true,
                adminUpdate: true,
                timestamp: new Date().toISOString()
              }
            }, companyId);
          }
        } catch (broadcastError) {
          console.error('Error broadcasting admin plan change:', broadcastError);
        }
      }

      res.json(company);
    } catch (error) {
      res.status(500).json({ error: "Failed to update company" });
    }
  });


  app.delete("/api/admin/companies/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);


      const existingCompany = await storage.getCompany(companyId);
      if (!existingCompany) {
        return res.status(404).json({ error: "Company not found" });
      }


      await storage.updateCompany(companyId, { active: false });

      res.status(200).json({ message: "Company deactivated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to deactivate company" });
    }
  });


  const { PasswordResetService } = await import('./services/password-reset');


  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email address is required'
        });
      }


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:9000';
      const baseUrl = `${protocol}://${host}`;

      const result = await PasswordResetService.requestPasswordReset({
        email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        baseUrl
      });

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in forgot password endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while processing your request'
      });
    }
  });


  app.get("/api/auth/reset-password/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          valid: false,
          message: 'Token is required'
        });
      }

      const result = await PasswordResetService.validateToken(token);

      res.json({
        valid: result.valid,
        message: result.valid ? 'Token is valid' : 'Invalid or expired token'
      });
    } catch (error) {
      console.error('Error validating reset token:', error);
      res.status(500).json({
        valid: false,
        message: 'An error occurred while validating the token'
      });
    }
  });


  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token, new password, and confirmation are required'
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Passwords do not match'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }

      const result = await PasswordResetService.confirmPasswordReset({
        token,
        newPassword,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in reset password endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while resetting your password'
      });
    }
  });




  app.post("/api/admin/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email address is required'
        });
      }


      const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
      const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:9000';
      const baseUrl = `${protocol}://${host}`;

      const result = await PasswordResetService.requestPasswordReset({
        email,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        baseUrl,
        isAdmin: true
      });

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in admin forgot password endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while processing your request'
      });
    }
  });


  app.get("/api/admin/auth/reset-password/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({
          valid: false,
          message: 'Token is required'
        });
      }

      const result = await PasswordResetService.validateToken(token);

      res.json({
        valid: result.valid,
        message: result.valid ? 'Admin token is valid' : 'Invalid or expired admin token'
      });
    } catch (error) {
      console.error('Error validating admin reset token:', error);
      res.status(500).json({
        valid: false,
        message: 'An error occurred while validating the admin token'
      });
    }
  });


  app.post("/api/admin/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword, confirmPassword } = req.body;

      if (!token || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Token, new password, and confirmation are required'
        });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'Passwords do not match'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
      }

      const result = await PasswordResetService.confirmPasswordReset({
        token,
        newPassword,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      res.status(result.success ? 200 : 400).json(result);
    } catch (error) {
      console.error('Error in admin reset password endpoint:', error);
      res.status(500).json({
        success: false,
        message: 'An error occurred while resetting your admin password'
      });
    }
  });


  app.all("/api/emergency/admin-reset", async (req: Request, res: Response) => {
    const { handleEmergencyReset } = await import('./services/emergency-reset');
    await handleEmergencyReset(req, res);
  });
}
