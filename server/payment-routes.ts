import { completeStripeCheckout } from './services/stripe-checkout-completion';
import { assertNotAppSumoBilling } from './services/appsumo-policy';
import { Express, Request, Response, NextFunction } from "express";
import { storage, PaymentTransaction } from "./storage";
import Stripe from "stripe";
import paypal from "@paypal/checkout-server-sdk";
import { affiliateService } from "./services/affiliate-service";
import { getExchangeRate } from "./utils/exchange-rate";
import { activateSubscriptionAfterPayment, computeSubscriptionEndDate } from "./routes/enhanced-subscription";
import { parseExportFormat, sendTabularExport } from './utils/tabular-export';

const PAYSTACK_SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'ZAR', 'USD', 'KES', 'XOF', 'EGP'];

function isRenewalTransaction(transaction: Pick<PaymentTransaction, 'metadata'>): boolean {
  return transaction.metadata?.renewalType === 'subscription_renewal';
}

async function applySubscriptionAfterVerifiedPayment(
  transaction: Pick<PaymentTransaction, 'id' | 'companyId' | 'planId' | 'amount' | 'metadata'>,
  paymentId: string
): Promise<{ plan: NonNullable<Awaited<ReturnType<typeof storage.getPlan>>> | null }> {
  if (!transaction.companyId) {
    throw new Error('Transaction has no company ID');
  }
  if (!transaction.planId) {
    throw new Error('Transaction has no plan ID');
  }

  const companyId = transaction.companyId;
  const planId = transaction.planId;
  const plan = await storage.getPlan(planId);

  if (isRenewalTransaction(transaction)) {
    await activateSubscriptionAfterPayment(
      companyId,
      planId,
      paymentId,
      transaction.amount
    );
  } else {
    const company = await storage.getCompany(companyId);
    if (!company) {
      throw new Error('Company not found');
    }
    if (!plan) {
      throw new Error('Plan not found');
    }

    const now = new Date();
    const newEndDate = computeSubscriptionEndDate(plan, now);

    await storage.updateCompany(companyId, {
      planId,
      plan: plan.name.toLowerCase(),
      subscriptionStatus: 'active',
      subscriptionStartDate: now,
      subscriptionEndDate: newEndDate,
      isInTrial: false,
      trialStartDate: null,
      trialEndDate: null,
    });
  }

  return { plan: plan ?? null };
}

/**
 * Validates that the originUrl is safe to use
 * Ensures it's a valid URL with http/https protocol and prevents open redirects
 */
function validateOriginUrl(originUrl: string): string | null {
  try {
    const url = new URL(originUrl);
    
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }
    
    // Remove trailing slash for consistency
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}



const ensureAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
};

export function registerPaymentRoutes(app: Express) {

  const getDefaultCurrency = async (): Promise<string> => {
    try {
      const generalSettings = await storage.getAppSetting('general_settings');
      if (generalSettings?.value && typeof generalSettings.value === 'object') {
        const settings = generalSettings.value as any;
        return settings.defaultCurrency || 'USD';
      }
      return 'USD';
    } catch (error) {
      console.error('Error fetching default currency:', error);
      return 'USD';
    }
  };

  /** Generate a short, unique order reference for M-PESA (e.g. ORD1A2B3C). Max 12 chars for Safaricom. */
  const generateOrderReference = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let suffix = '';
    for (let i = 0; i < 6; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `ORD${suffix}`;
  };

  /** Fetch live USD to KES exchange rate (for M-PESA). */
  const getUsdToKesRate = async (): Promise<number> => getExchangeRate('USD', 'KES');

  const formatDarajaTimestamp = (date: Date = new Date()) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  };
  /** GET /api/payment/exchange-rate?from=USD&to=KES&amount=29 - for displaying KES equivalent when gateway is M-PESA and system currency is USD */
  app.get("/api/payment/exchange-rate", ensureAuthenticated, async (req: Request, res: Response) => {
    try {
      const from = (req.query.from as string)?.toUpperCase() || 'USD';
      const to = (req.query.to as string)?.toUpperCase() || 'KES';
      const amount = parseFloat((req.query.amount as string) ?? '');
      if (from !== 'USD' || to !== 'KES') {
        return res.status(400).json({ error: 'Only USD to KES is supported' });
      }
      const rate = await getUsdToKesRate();
      const converted = Number.isFinite(amount) && amount > 0 ? Math.round(amount * rate) : null;
      res.json({ rate, amountKes: converted });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to get exchange rate'
      });
    }
  });

  app.get("/api/payment/methods", ensureAuthenticated, async (req, res) => {
    try {
      const paymentMethods = [];

      const stripeSettingObj = await storage.getAppSetting('payment_stripe');
      if (stripeSettingObj?.value && (stripeSettingObj.value as any).enabled) {
        paymentMethods.push({
          id: 'stripe',
          name: 'Stripe',
          description: 'Pay with credit card via Stripe',
          testMode: (stripeSettingObj.value as any).testMode
        });
      }

      const mercadoPagoSettingObj = await storage.getAppSetting('payment_mercadopago');
      if (mercadoPagoSettingObj?.value && (mercadoPagoSettingObj.value as any).enabled) {
        paymentMethods.push({
          id: 'mercadopago',
          name: 'Mercado Pago',
          description: 'Pay with Mercado Pago',
          testMode: (mercadoPagoSettingObj.value as any).testMode
        });
      }

      const paypalSettingObj = await storage.getAppSetting('payment_paypal');
      if (paypalSettingObj?.value && (paypalSettingObj.value as any).enabled) {
        paymentMethods.push({
          id: 'paypal',
          name: 'PayPal',
          description: 'Pay with PayPal',
          testMode: (paypalSettingObj.value as any).testMode
        });
      }

      const paystackSettingObj = await storage.getAppSetting('payment_paystack');
      if (paystackSettingObj?.value && (paystackSettingObj.value as any).enabled) {
        paymentMethods.push({
          id: 'paystack',
          name: 'Paystack',
          description: 'Pay securely via Paystack',
          testMode: (paystackSettingObj.value as any).testMode
        });
      }

      const moyasarSettingObj = await storage.getAppSetting('payment_moyasar');
      if (moyasarSettingObj?.value && (moyasarSettingObj.value as any).enabled) {
        paymentMethods.push({
          id: 'moyasar',
          name: 'Moyasar',
          description: 'Pay with credit card via Moyasar',
          testMode: (moyasarSettingObj.value as any).testMode
        });
      }

      const mpesaSettingObj = await storage.getAppSetting('payment_mpesa');
      if (mpesaSettingObj?.value && (mpesaSettingObj.value as any).enabled) {
        paymentMethods.push({
          id: 'mpesa',
          name: 'MPESA',
          description: 'Pay with MPESA mobile money',
          testMode: (mpesaSettingObj.value as any).testMode
        });
      }

      const bankTransferSettingObj = await storage.getAppSetting('payment_bank_transfer');
      if (bankTransferSettingObj?.value && (bankTransferSettingObj.value as any).enabled) {
        paymentMethods.push({
          id: 'bank-transfer',
          name: 'Bank Transfer',
          description: 'Pay via bank transfer'
        });
      }

      res.json(paymentMethods);
    } catch (error) {
      console.error("Error fetching payment methods:", error);
      res.status(500).json({ error: "Failed to fetch payment methods" });
    }
  });

  app.post("/api/payment/checkout/stripe", ensureAuthenticated, async (req: any, res) => {
    let transactionId: number | undefined;
    let createdSessionId: string | undefined;
    try {
      const planId = Number(req.body.planId);
      if (!Number.isInteger(req.user?.companyId) || req.user.companyId <= 0) return res.status(403).json({ error: 'A company account is required' });
      if (req.user.role !== 'admin') return res.status(403).json({ error: 'Company admin access is required' });
      await assertNotAppSumoBilling(req.user.companyId);

      if (!Number.isInteger(planId) || planId <= 0) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan || !plan.isActive) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const stripeSettingObj = await storage.getAppSetting('payment_stripe');
      if (!stripeSettingObj || !stripeSettingObj.value) {
        return res.status(400).json({ error: "Stripe is not configured" });
      }

      const stripeSettings = stripeSettingObj.value as any;

      if (!stripeSettings.enabled || typeof stripeSettings.secretKey !== 'string' || !stripeSettings.secretKey.startsWith('sk_')) return res.status(400).json({ error: 'Stripe is disabled or its secret key is invalid' });
      if (!Number.isFinite(Number(plan.price)) || Number(plan.price) <= 0) return res.status(400).json({ error: 'The selected plan has no valid payable price' });
      const stripe = new Stripe(stripeSettings.secretKey);

      const defaultCurrency = await getDefaultCurrency();
      

      const supportedCurrencies = ['usd', 'eur', 'gbp', 'cad', 'aud', 'jpy', 'chf', 'nzd', 'sek', 'nok', 'dkk', 'pln', 'czk', 'huf', 'ron', 'bgn', 'hrk', 'rub', 'try', 'brl', 'mxn', 'ars', 'clp', 'cop', 'pen', 'inr', 'sgd', 'hkd', 'krw', 'twd', 'thb', 'myr', 'php', 'idr', 'vnd', 'aed', 'sar', 'ils', 'zar', 'ngn', 'egp', 'kes'];
      const currencyLower = defaultCurrency.toLowerCase();
      if (!supportedCurrencies.includes(currencyLower)) {
        return res.status(400).json({ 
          error: `Currency ${defaultCurrency} is not supported by Stripe. Please configure a supported currency in General Settings.` 
        });
      }

      const transaction = await storage.createPaymentTransaction({
        companyId: req.user.companyId,
        planId,
        amount: plan.price,
        currency: defaultCurrency,
        status: 'pending',
        paymentMethod: 'stripe'
      });

      transactionId = transaction.id;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: currencyLower,
              product_data: {
                name: plan.name,
                description: plan.description || ''
              },
              unit_amount: Math.round(Number(plan.price) * 100)
            },
            quantity: 1
          }
        ],
        mode: 'payment',
        success_url: `${req.protocol}://${req.get('host')}/payment/success?session_id={CHECKOUT_SESSION_ID}&transaction_id=${transaction.id}&source=stripe`,
        cancel_url: `${req.protocol}://${req.get('host')}/payment/cancel`,
        metadata: {
          transactionId: transaction.id.toString(),
          planId: planId.toString(),
          companyId: req.user.companyId.toString()
        }
      });

      createdSessionId = session.id;
      await storage.updatePaymentTransaction(transaction.id, { metadata: { stripeSessionId: session.id } });
      // Activation may have reserved the company while Stripe created this session.
      // Do not return a payable session after the customer has switched to AppSumo.
      try { await assertNotAppSumoBilling(req.user.companyId); }
      catch (error) { await stripe.checkout.sessions.expire(session.id); throw error; }
      res.json({
        checkoutUrl: session.url,
        sessionId: session.id,
        transactionId: transaction.id
      });
    } catch (error) {
      if (transactionId) await storage.updatePaymentTransaction(transactionId, { status: 'failed', metadata: { ...(createdSessionId ? { stripeSessionId: createdSessionId } : {}), failureReason: 'Stripe checkout creation failed' } }).catch(() => {});
      console.error('Stripe checkout failed:', { transactionId, code: (error as any)?.code, type: (error as any)?.type });
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/payment/checkout/mercadopago", ensureAuthenticated, async (req: any, res) => {
    try {
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const mercadoPagoSettingObj = await storage.getAppSetting('payment_mercadopago');
      if (!mercadoPagoSettingObj || !mercadoPagoSettingObj.value) {
        return res.status(400).json({ error: "Mercado Pago is not configured" });
      }

      const mercadoPagoSettings = mercadoPagoSettingObj.value as any;

      if (!mercadoPagoSettings.clientId || !mercadoPagoSettings.clientSecret || !mercadoPagoSettings.accessToken) {
        console.error("Mercado Pago settings are incomplete:", {
          hasClientId: !!mercadoPagoSettings.clientId,
          hasClientSecret: !!mercadoPagoSettings.clientSecret,
          hasAccessToken: !!mercadoPagoSettings.accessToken
        });
        return res.status(400).json({ error: "Mercado Pago settings are incomplete" });
      }

      const defaultCurrency = await getDefaultCurrency();
      


      const supportedCurrencies = ['USD', 'ARS', 'BRL', 'CLP', 'COP', 'MXN', 'PEN', 'UYU', 'VEF'];
      if (!supportedCurrencies.includes(defaultCurrency.toUpperCase())) {
        return res.status(400).json({ 
          error: `Currency ${defaultCurrency} may not be supported by Mercado Pago. Supported currencies: ${supportedCurrencies.join(', ')}. Please verify your Mercado Pago account configuration.` 
        });
      }

      const transaction = await storage.createPaymentTransaction({
        companyId: req.user.companyId,
        planId,
        amount: plan.price,
        currency: defaultCurrency,
        status: 'pending',
        paymentMethod: 'mercadopago'
      });

      // Validate and use originUrl if provided, otherwise fallback to request-based URL
      let baseUrl = `${req.protocol}://${req.get('host')}`;
      if (req.body.originUrl) {
        const validatedUrl = validateOriginUrl(req.body.originUrl);
        if (validatedUrl) {
          baseUrl = validatedUrl;
        } else {
          console.warn('Invalid originUrl provided, falling back to request URL');
        }
      }
      
      // Enhanced logging for debugging
      console.log('Mercado Pago - Base URL:', baseUrl);
      
      const preferenceData = {
        items: [
          {
            title: plan.name,
            description: plan.description || 'Subscription plan',
            quantity: 1,
            currency_id: defaultCurrency.toUpperCase(),
            unit_price: Number(plan.price)
          }
        ],
        back_urls: {
          success: `${baseUrl}/payment/success?source=mercadopago&transaction_id=${transaction.id}`,
          failure: `${baseUrl}/payment/cancel?source=mercadopago&transaction_id=${transaction.id}`,
          pending: `${baseUrl}/payment/pending?source=mercadopago&transaction_id=${transaction.id}`
        },
        auto_return: 'all',
        external_reference: transaction.id.toString(),
        notification_url: `${baseUrl}/api/webhooks/mercadopago`
      };
      
      // Log complete preference data for debugging
      console.log('Mercado Pago preference data:', JSON.stringify(preferenceData, null, 2));

      let responseData;

      try {
        const apiUrl = 'https://api.mercadopago.com/checkout/preferences';

        

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mercadoPagoSettings.accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(preferenceData)
        });

        

        if (!response.ok) {
          let errorMessage = `Failed to create Mercado Pago preference: ${response.status} ${response.statusText}`;

          try {
            const errorData = await response.json();
            console.error('Mercado Pago API error response:', errorData);

            if (errorData.message) {
              errorMessage = `Mercado Pago API error: ${errorData.message}`;
            }

            if (errorData.error) {
              errorMessage += ` (${errorData.error})`;
            }
          } catch (parseError) {
            console.error('Failed to parse Mercado Pago error response:', parseError);
          }

          throw new Error(errorMessage);
        }

        responseData = await response.json();
        
      } catch (error) {
        console.error('Error in Mercado Pago API call:', error);
        throw error;
      }

      if (!responseData || !responseData.init_point) {
        console.error("Invalid Mercado Pago response data:", responseData);
        throw new Error("Invalid response from Mercado Pago API");
      }

      

      res.json({
        checkoutUrl: responseData.init_point,
        preferenceId: responseData.id,
        transactionId: transaction.id
      });
    } catch (error) {
      console.error("Error creating Mercado Pago checkout session:", error);
      res.status(500).json({
        error: "Failed to create checkout session",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/payment/checkout/paypal", ensureAuthenticated, async (req: any, res) => {
    try {
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const paypalSettingObj = await storage.getAppSetting('payment_paypal');
      if (!paypalSettingObj || !paypalSettingObj.value) {
        return res.status(400).json({ error: "PayPal is not configured" });
      }

      const paypalSettings = paypalSettingObj.value as any;

      // Trim credentials defensively
      const clientId = (paypalSettings.clientId || '').trim();
      const clientSecret = (paypalSettings.clientSecret || '').trim();

      // Validate credentials
      if (!clientId || !clientSecret) {
        console.error('PayPal credentials validation failed:', {
          hasClientId: !!paypalSettings.clientId,
          hasClientSecret: !!paypalSettings.clientSecret,
          clientIdLength: clientId?.length || 0,
          clientSecretLength: clientSecret?.length || 0,
          testMode: paypalSettings.testMode
        });
        return res.status(400).json({ error: "Invalid PayPal credentials. Please check your PayPal settings." });
      }

      let environment;
      if (paypalSettings.testMode) {
        environment = new paypal.core.SandboxEnvironment(
          clientId,
          clientSecret
        );
      } else {
        environment = new paypal.core.LiveEnvironment(
          clientId,
          clientSecret
        );
      }

      const client = new paypal.core.PayPalHttpClient(environment);

      const defaultCurrency = await getDefaultCurrency();
      

      const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'NZD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'HRK', 'RUB', 'TRY', 'BRL', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'INR', 'SGD', 'HKD', 'KRW', 'TWD', 'THB', 'MYR', 'PHP', 'IDR', 'VND', 'AED', 'SAR', 'ILS', 'ZAR', 'NGN', 'EGP', 'KES'];
      if (!supportedCurrencies.includes(defaultCurrency.toUpperCase())) {
        return res.status(400).json({ 
          error: `Currency ${defaultCurrency} may not be supported by PayPal. Please verify your PayPal account configuration supports this currency.` 
        });
      }

      const transaction = await storage.createPaymentTransaction({
        companyId: req.user.companyId,
        planId,
        amount: plan.price,
        currency: defaultCurrency,
        status: 'pending',
        paymentMethod: 'paypal'
      });

      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer("return=representation");
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: defaultCurrency.toUpperCase(),
            value: plan.price.toString()
          },
          description: plan.description,
          custom_id: transaction.id.toString()
        }] as any,
        application_context: {
          brand_name: 'AppName',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: `${(() => {
            let baseUrl = `${req.protocol}://${req.get('host')}`;
            if (req.body.originUrl) {
              const validatedUrl = validateOriginUrl(req.body.originUrl);
              if (validatedUrl) {
                baseUrl = validatedUrl;
              }
            }
            return baseUrl;
          })()}/payment/success?source=paypal&transaction_id=${transaction.id}`,
          cancel_url: `${(() => {
            let baseUrl = `${req.protocol}://${req.get('host')}`;
            if (req.body.originUrl) {
              const validatedUrl = validateOriginUrl(req.body.originUrl);
              if (validatedUrl) {
                baseUrl = validatedUrl;
              }
            }
            return baseUrl;
          })()}/payment/cancel?source=paypal&transaction_id=${transaction.id}`
        }
      });

      const response = await client.execute(request);

      const approvalLink = response.result.links.find((link: any) => link.rel === 'approve');
      if (!approvalLink) {
        throw new Error('PayPal approval URL not found');
      }
      const approvalUrl = approvalLink.href;

      res.json({
        checkoutUrl: approvalUrl,
        orderId: response.result.id,
        transactionId: transaction.id
      });
    } catch (error) {
      console.error("Error creating PayPal checkout session:", error);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  app.post("/api/payment/checkout/paystack", ensureAuthenticated, async (req: any, res) => {
    try {
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const paystackSettingObj = await storage.getAppSetting('payment_paystack');
      if (!paystackSettingObj || !paystackSettingObj.value || !(paystackSettingObj.value as any).enabled) {
        return res.status(400).json({ error: "Paystack is not configured" });
      }

      const paystackSettings = paystackSettingObj.value as any;
      const appCurrency = (await getDefaultCurrency()).toUpperCase();
      const merchantCurrency = (paystackSettings.merchantCurrency as string)?.trim().toUpperCase() || appCurrency;

      if (!PAYSTACK_SUPPORTED_CURRENCIES.includes(merchantCurrency)) {
        return res.status(400).json({
          error: `Paystack merchant currency "${merchantCurrency}" is not supported. Supported: ${PAYSTACK_SUPPORTED_CURRENCIES.join(', ')}`
        });
      }

      let paystackAmount: number;
      let paystackCurrency: string;
      if (merchantCurrency === appCurrency) {
        paystackAmount = Number(plan.price);
        paystackCurrency = appCurrency;
      } else {
        try {
          const rate = await getExchangeRate(appCurrency, merchantCurrency);
          paystackAmount = Number(plan.price) * rate;
          paystackCurrency = merchantCurrency;
        } catch (err) {
          return res.status(400).json({
            error: `Cannot convert ${appCurrency} to ${merchantCurrency}. Set Paystack merchant currency to match your app currency (${appCurrency}), or enable ${appCurrency} in your Paystack dashboard.`
          });
        }
      }

      const transaction = await storage.createPaymentTransaction({
        companyId: req.user.companyId,
        planId,
        amount: plan.price,
        currency: appCurrency,
        status: 'pending',
        paymentMethod: 'paystack'
      });

      // Validate and use originUrl if provided, otherwise fallback to request-based URL
      let baseUrl = `${req.protocol}://${req.get('host')}`;
      if (req.body.originUrl) {
        const validatedUrl = validateOriginUrl(req.body.originUrl);
        if (validatedUrl) {
          baseUrl = validatedUrl;
        } else {
          console.warn('Invalid originUrl provided for Paystack, falling back to request URL');
        }
      }
      const callbackUrl = `${baseUrl}/payment/success?source=paystack&transaction_id=${transaction.id}`;
      const reference = `PC-${transaction.id}-${Date.now()}`;

      const initResponse = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${paystackSettings.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: req.user.email || req.user.companyEmail || 'no-email@bothiveplus.local',
          amount: Math.round(paystackAmount * 100),
          currency: paystackCurrency,
          reference,
          callback_url: callbackUrl,
          metadata: {
            transactionId: transaction.id,
            planId,
            companyId: req.user.companyId
          }
        })
      });

      const initData = await initResponse.json().catch(() => ({}));
      if (!initResponse.ok || !initData?.data?.authorization_url) {
        const apiMessage = initData?.message || initResponse.statusText;
        const code = initData?.code;
        console.error('Paystack initialize error:', initData);
        if (code === 'unsupported_currency' || (apiMessage && apiMessage.toLowerCase().includes('currency not supported'))) {
          return res.status(400).json({
            error: `Currency ${paystackCurrency} is not enabled on your Paystack account. Go to Admin → Settings → Paystack and set "Merchant Currency" to the currency enabled on your integration (usually NGN for Nigeria, GHS for Ghana, ZAR for South Africa). Or contact Paystack support to enable ${paystackCurrency}.`
          });
        }
        return res.status(500).json({ error: `Failed to initialize Paystack payment: ${apiMessage}` });
      }

      await storage.updatePaymentTransaction(transaction.id, {
        paymentIntentId: reference,
        externalTransactionId: initData.data.reference
      });

      res.json({
        checkoutUrl: initData.data.authorization_url,
        reference: initData.data.reference,
        transactionId: transaction.id
      });
    } catch (error) {
      console.error("Error creating Paystack checkout session:", error);
      res.status(500).json({
        error: "Failed to create checkout session",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/payment/checkout/moyasar", ensureAuthenticated, async (req: any, res) => {
    try {
      const { planId, callbackUrl } = req.body;

      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      if (!callbackUrl) {
        return res.status(400).json({ error: "Callback URL is required" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const moyasarSettingObj = await storage.getAppSetting('payment_moyasar');
      if (!moyasarSettingObj || !moyasarSettingObj.value) {
        return res.status(400).json({ error: "Moyasar is not configured" });
      }

      const moyasarSettings = moyasarSettingObj.value as any;

      if (!moyasarSettings.publishableKey) {
        return res.status(400).json({ error: "Moyasar publishable key is missing" });
      }

      const defaultCurrency = await getDefaultCurrency();
      

      if (defaultCurrency.toUpperCase() !== 'SAR') {
        return res.status(400).json({ 
          error: `Moyasar only supports SAR (Saudi Riyal). Current configured currency is ${defaultCurrency}. Please change the default currency to SAR in General Settings to use Moyasar.` 
        });
      }

      const transaction = await storage.createPaymentTransaction({
        companyId: req.user.companyId,
        planId,
        amount: plan.price,
        currency: 'SAR', // Moyasar primarily works with SAR
        status: 'pending',
        paymentMethod: 'moyasar'
      });




      const fullCallbackUrl = `${callbackUrl}${transaction.id}`;

      res.json({

        publishableKey: moyasarSettings.publishableKey,
        amount: Math.round(Number(plan.price) * 100), // Convert to halalas (smallest SAR unit)
        currency: 'SAR',
        description: `${plan.name} - ${plan.description || 'Subscription plan'}`,
        callbackUrl: fullCallbackUrl, // Use the complete callback URL
        transactionId: transaction.id,
        metadata: {
          transaction_id: transaction.id.toString(),
          plan_id: planId.toString(),
          company_id: req.user.companyId.toString()
        }
      });
    } catch (error) {
      console.error("Error creating Moyasar checkout session:", error);
      res.status(500).json({
        error: "Failed to create checkout session",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/payment/checkout/mpesa", ensureAuthenticated, async (req: any, res) => {
    try {
      const { planId, phoneNumber } = req.body;

      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      if (!phoneNumber) {
        return res.status(400).json({ error: "Phone number is required for MPESA payment" });
      }


      const phoneRegex = /^254[0-9]{9}$/;
      if (!phoneRegex.test(phoneNumber)) {
        return res.status(400).json({ error: "Invalid phone number format. Use format: 254XXXXXXXXX" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const mpesaSettingObj = await storage.getAppSetting('payment_mpesa');
      if (!mpesaSettingObj || !mpesaSettingObj.value) {
        return res.status(400).json({ error: "MPESA is not configured" });
      }

      const mpesaSettings = mpesaSettingObj.value as any;

      if (!mpesaSettings.consumerKey || !mpesaSettings.consumerSecret || !mpesaSettings.businessShortcode || !mpesaSettings.passkey) {
        return res.status(400).json({ error: "MPESA configuration is incomplete" });
      }


      const defaultCurrency = (await getDefaultCurrency()).toUpperCase();
      const orderReference = generateOrderReference();

      let amountInKes: number;
      let transactionMetadata: Record<string, unknown> = { orderReference };

      if (defaultCurrency === 'KES') {
        amountInKes = Number(plan.price);
      } else {
        // Convert USD (or other system currency) to KES using live rate for M-PESA
        const rate = await getUsdToKesRate();
        amountInKes = Math.round(Number(plan.price) * rate);
        transactionMetadata = {
          ...transactionMetadata,
          originalAmountUSD: Number(plan.price),
          originalCurrency: defaultCurrency,
          exchangeRate: rate
        };
      }

      const transaction = await storage.createPaymentTransaction({
        companyId: req.user.companyId,
        planId,
        amount: String(amountInKes),
        currency: 'KES',
        status: 'pending',
        paymentMethod: 'mpesa',
        metadata: transactionMetadata
      });


      const baseUrl = mpesaSettings.testMode ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
      const credentials = Buffer.from(`${mpesaSettings.consumerKey}:${mpesaSettings.consumerSecret}`).toString('base64');

      const authResponse = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json'
        }
      });

      if (!authResponse.ok) {
        throw new Error('Failed to authenticate with MPESA API');
      }

      const authData = await authResponse.json();
      const accessToken = authData.access_token;


      const timestamp = formatDarajaTimestamp();
      const password = Buffer.from(`${mpesaSettings.businessShortcode}${mpesaSettings.passkey}${timestamp}`).toString('base64');


      const transactionType = mpesaSettings.shortcodeType === 'buygoods' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
      const callbackUrl = (mpesaSettings.callbackUrl && typeof mpesaSettings.callbackUrl === 'string')
        ? mpesaSettings.callbackUrl
        : `${req.protocol}://${req.get('host')}/api/webhooks/mpesa`;
      const stkPushPayload = {
        BusinessShortCode: mpesaSettings.businessShortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: transactionType,
        Amount: Math.round(amountInKes),
        PartyA: phoneNumber,
        PartyB: mpesaSettings.businessShortcode,
        PhoneNumber: phoneNumber,
        CallBackURL: callbackUrl,
        AccountReference: orderReference,
        TransactionDesc: `${plan.name} - ${plan.description || 'Subscription plan'}`
      };

      const stkResponse = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(stkPushPayload)
      });

      if (!stkResponse.ok) {
        const errorData = await stkResponse.json().catch(() => ({}));
        throw new Error(errorData.errorMessage || 'Failed to initiate MPESA payment');
      }

      const stkData = await stkResponse.json();

      if (stkData.ResponseCode !== "0") {
        throw new Error(stkData.ResponseDescription || 'MPESA payment initiation failed');
      }


      await storage.updatePaymentTransaction(transaction.id, {
        paymentIntentId: stkData.CheckoutRequestID,
        externalTransactionId: stkData.MerchantRequestID
      });

      res.json({
        success: true,
        transactionId: transaction.id,
        checkoutRequestId: stkData.CheckoutRequestID,
        merchantRequestId: stkData.MerchantRequestID,
        responseCode: stkData.ResponseCode,
        responseDescription: stkData.ResponseDescription,
        customerMessage: stkData.CustomerMessage,
        message: "STK Push sent to your phone. Please complete the payment."
      });

    } catch (error) {
      console.error("Error creating MPESA checkout session:", error);
      res.status(500).json({
        error: "Failed to create MPESA checkout session",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/api/payment/verify", ensureAuthenticated, async (req: any, res) => {
    try {
      const { transactionId, source, session_id } = req.body;


      if (source === 'stripe' && session_id && !transactionId) {
        const stripeSettingObj = await storage.getAppSetting('payment_stripe');
        if (!stripeSettingObj || !stripeSettingObj.value) {
          return res.status(400).json({ error: "Stripe is not configured" });
        }

        const stripeSettings = stripeSettingObj.value as any;
        const stripe = new Stripe(stripeSettings.secretKey, {
          apiVersion: '2025-09-30.clover' as any
        });

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid' && session.metadata?.transactionId) {
          const transaction = await storage.getPaymentTransaction(parseInt(session.metadata.transactionId));

          if (transaction) {
            if (!transaction.companyId || transaction.companyId !== req.user.companyId) {
              return res.status(403).json({ error: 'Transaction does not belong to your company' });
            }

            const { plan } = await completeStripeCheckout(session, req.user.companyId);


            try {
              if ((global as any).broadcastToCompany && plan) {
                (global as any).broadcastToCompany({
                  type: 'plan_updated',
                  data: {
                    companyId: transaction.companyId,
                    newPlan: plan.name.toLowerCase(),
                    planId: transaction.planId,
                    timestamp: new Date().toISOString(),
                    changeType: 'payment_upgrade',
                    subscriptionStatus: 'active',
                    trialCleared: true
                  }
                }, transaction.companyId);


                (global as any).broadcastToCompany({
                  type: 'subscription_status_changed',
                  data: {
                    companyId: transaction.companyId,
                    subscriptionStatus: 'active',
                    isInTrial: false,
                    timestamp: new Date().toISOString()
                  }
                }, transaction.companyId);
              }
            } catch (broadcastError) {
              console.error('Error broadcasting plan update:', broadcastError);
            }


            try {
              await affiliateService.processPaymentCommission(transaction.id);
            } catch (affiliateError) {
              console.error('Error processing affiliate commission:', affiliateError);

            }

            return res.json({
              success: true,
              status: 'completed',
              message: "Payment has been verified and subscription activated"
            });
          }
        }

        return res.json({
          success: false,
          status: 'failed',
          message: "Payment verification failed"
        });
      }

      if (!transactionId) {
        return res.status(400).json({ error: "Transaction ID is required" });
      }

      const transaction = await storage.getPaymentTransaction(parseInt(transactionId));

      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      if (!transaction.companyId || transaction.companyId !== req.user.companyId) {
        return res.status(403).json({ error: 'Transaction does not belong to your company' });
      }


      if (transaction.status === 'completed') {
        const company = await storage.getCompany(transaction.companyId);
        if (company && (company.planId !== transaction.planId || company.subscriptionStatus !== 'active')) {
          await applySubscriptionAfterVerifiedPayment(transaction, transaction.paymentIntentId || String(transaction.id));
        }

        return res.json({
          success: true,
          status: transaction.status,
          message: "Payment has been verified and subscription activated"
        });
      }

      if (transaction.paymentMethod === 'bank_transfer') {
        return res.json({
          success: true,
          status: transaction.status,
          message: "Bank transfer is pending manual verification"
        });
      }

      if (source === 'paystack' && transaction.paymentMethod === 'paystack') {
        const paystackSettingObj = await storage.getAppSetting('payment_paystack');
        if (!paystackSettingObj || !paystackSettingObj.value) {
          return res.status(400).json({ error: "Paystack is not configured" });
        }

        const paystackSettings = paystackSettingObj.value as any;
        const reference = transaction.paymentIntentId || transaction.externalTransactionId;

        if (!reference) {
          return res.status(400).json({
            error: "Missing Paystack reference for verification"
          });
        }

        const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
          headers: {
            'Authorization': `Bearer ${paystackSettings.secretKey}`
          }
        });

        const verifyData = await verifyResponse.json().catch(() => ({}));
        if (!verifyResponse.ok) {
          const apiMessage = verifyData?.message || verifyResponse.statusText;
          return res.status(400).json({ error: `Failed to verify Paystack payment: ${apiMessage}` });
        }

        const paystackStatus = verifyData?.data?.status;
        const paystackReference = verifyData?.data?.reference;
        const paystackId = verifyData?.data?.id;

        let newStatus: 'pending' | 'completed' | 'failed' | 'cancelled' = transaction.status as any;
        if (paystackStatus === 'success') {
          newStatus = 'completed';
        } else if (paystackStatus === 'failed') {
          newStatus = 'failed';
        }

        await storage.updatePaymentTransaction(transaction.id, {
          status: newStatus,
          externalTransactionId: paystackReference || transaction.externalTransactionId,
          paymentIntentId: reference,
          metadata: {
            ...(transaction.metadata || {}),
            paystackId,
            paystackStatus
          }
        });

        if (newStatus === 'completed') {
          const { plan } = await applySubscriptionAfterVerifiedPayment(
            transaction,
            String(paystackId || paystackReference || reference)
          );

          try {
            if ((global as any).broadcastToCompany && plan) {
              (global as any).broadcastToCompany({
                type: 'plan_updated',
                data: {
                  companyId: transaction.companyId,
                  newPlan: plan.name.toLowerCase(),
                  planId: transaction.planId,
                  timestamp: new Date().toISOString(),
                  changeType: 'payment_upgrade',
                  subscriptionStatus: 'active',
                  trialCleared: true
                }
              }, transaction.companyId);
            }
          } catch (broadcastError) {
            console.error('Error broadcasting plan update:', broadcastError);
          }

          try {
            await affiliateService.processPaymentCommission(transaction.id);
          } catch (affiliateError) {
            console.error('Error processing affiliate commission:', affiliateError);
          }

          return res.json({
            success: true,
            status: 'completed',
            message: "Payment has been verified and subscription activated",
            source: 'paystack',
            paymentId: paystackId
          });
        }

        return res.json({
          success: true,
          status: newStatus,
          message: paystackStatus ? `Payment is ${paystackStatus}` : 'Payment verification pending',
          source: 'paystack'
        });
      }

      if (source === 'stripe' && transaction.paymentMethod === 'stripe') {
        const stripeSettingObj = await storage.getAppSetting('payment_stripe');
        if (!stripeSettingObj || !stripeSettingObj.value) {
          return res.status(400).json({ error: "Stripe is not configured" });
        }

        const stripeSettings = stripeSettingObj.value as any;
        const stripe = new Stripe(stripeSettings.secretKey as string, {
          apiVersion: '2025-09-30.clover' as any
        });

        if (session_id) {
          const session = await stripe.checkout.sessions.retrieve(session_id);

          if (session.payment_status === 'paid') {
            const { plan } = await completeStripeCheckout(session, req.user.companyId);


            try {
              if ((global as any).broadcastToCompany && plan) {
                (global as any).broadcastToCompany({
                  type: 'plan_updated',
                  data: {
                    companyId: transaction.companyId,
                    newPlan: plan.name.toLowerCase(),
                    planId: transaction.planId,
                    timestamp: new Date().toISOString(),
                    changeType: 'payment_upgrade'
                  }
                }, transaction.companyId);
              }
            } catch (broadcastError) {
              console.error('Error broadcasting plan update:', broadcastError);
            }

            return res.json({
              success: true,
              status: 'completed',
              message: "Payment has been verified and subscription activated"
            });
          } else {
            return res.json({
              success: true,
              status: transaction.status,
              message: `Payment is ${session.payment_status}`
            });
          }
        } else {
          if (transaction.paymentIntentId) {
            const paymentIntent = await stripe.paymentIntents.retrieve(transaction.paymentIntentId);

            if (paymentIntent.status === 'succeeded') {
              await storage.updatePaymentTransaction(transaction.id, {
                status: 'completed'
              });


              const { plan } = await applySubscriptionAfterVerifiedPayment(
                transaction,
                paymentIntent.id
              );


              try {
                if ((global as any).broadcastToCompany && plan) {
                  (global as any).broadcastToCompany({
                    type: 'plan_updated',
                    data: {
                      companyId: transaction.companyId,
                      newPlan: plan.name.toLowerCase(),
                      planId: transaction.planId,
                      timestamp: new Date().toISOString(),
                      changeType: 'payment_upgrade'
                    }
                  }, transaction.companyId);
                }
              } catch (broadcastError) {
                console.error('Error broadcasting plan update:', broadcastError);
              }

              return res.json({
                success: true,
                status: 'completed',
                message: "Payment has been verified and subscription activated"
              });
            } else {
              return res.json({
                success: true,
                status: transaction.status,
                message: `Payment is ${paymentIntent.status}`
              });
            }
          } else {
            return res.json({
              success: true,
              status: transaction.status,
              message: "Payment status could not be verified"
            });
          }
        }
      }

      if (source === 'paypal' && transaction.paymentMethod === 'paypal') {
        if ((transaction.status as any) === 'completed') {

          const { plan } = await applySubscriptionAfterVerifiedPayment(
            transaction,
            transaction.paymentIntentId || String(transaction.id)
          );


          try {
            if ((global as any).broadcastToCompany && plan) {
              (global as any).broadcastToCompany({
                type: 'plan_updated',
                data: {
                  companyId: transaction.companyId,
                  newPlan: plan.name.toLowerCase(),
                  planId: transaction.planId,
                  timestamp: new Date().toISOString(),
                  changeType: 'payment_upgrade'
                }
              }, transaction.companyId);
            }
          } catch (broadcastError) {
            console.error('Error broadcasting plan update:', broadcastError);
          }

          return res.json({
            success: true,
            status: 'completed',
            message: "Payment has been verified and subscription activated"
          });
        } else {
          return res.json({
            success: true,
            status: transaction.status,
            message: `Payment is ${transaction.status}`
          });
        }
      }

      if (source === 'mercadopago' && transaction.paymentMethod === 'mercadopago') {
        if ((transaction.status as any) === 'completed') {

          const { plan } = await applySubscriptionAfterVerifiedPayment(
            transaction,
            transaction.paymentIntentId || String(transaction.id)
          );


          try {
            if ((global as any).broadcastToCompany && plan) {
              (global as any).broadcastToCompany({
                type: 'plan_updated',
                data: {
                  companyId: transaction.companyId,
                  newPlan: plan.name.toLowerCase(),
                  planId: transaction.planId,
                  timestamp: new Date().toISOString(),
                  changeType: 'payment_upgrade'
                }
              }, transaction.companyId);
            }
          } catch (broadcastError) {
            console.error('Error broadcasting plan update:', broadcastError);
          }

          return res.json({
            success: true,
            status: 'completed',
            message: "Payment has been verified and subscription activated"
          });
        } else {
          return res.json({
            success: true,
            status: transaction.status,
            message: `Payment is ${transaction.status}`
          });
        }
      }

      if (source === 'moyasar' && transaction.paymentMethod === 'moyasar') {
        const moyasarSettingObj = await storage.getAppSetting('payment_moyasar');
        if (!moyasarSettingObj || !moyasarSettingObj.value) {
          return res.status(400).json({ error: "Moyasar is not configured" });
        }

        const moyasarSettings = moyasarSettingObj.value as any;

        if (transaction.paymentIntentId) {

          try {
            const response = await fetch(`https://api.moyasar.com/v1/payments/${transaction.paymentIntentId}`, {
              method: 'GET',
              headers: {
                'Authorization': `Basic ${Buffer.from(moyasarSettings.secretKey + ':').toString('base64')}`,
                'Content-Type': 'application/json'
              }
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));


              if (errorData.type === 'account_inactive_error') {


                await storage.updatePaymentTransaction(transaction.id, {
                  status: 'completed'
                });


                const { plan } = await applySubscriptionAfterVerifiedPayment(
                  transaction,
                  transaction.paymentIntentId || String(transaction.id)
                );


                try {
                  if ((global as any).broadcastToCompany && plan) {
                    (global as any).broadcastToCompany({
                      type: 'plan_updated',
                      data: {
                        companyId: transaction.companyId,
                        newPlan: plan.name.toLowerCase(),
                        planId: transaction.planId,
                        timestamp: new Date().toISOString(),
                        changeType: 'payment_upgrade'
                      }
                    }, transaction.companyId);
                  }
                } catch (broadcastError) {
                  console.error('Error broadcasting plan update:', broadcastError);
                }

                return res.json({
                  success: true,
                  status: 'completed',
                  message: "Payment has been verified and subscription activated (Moyasar account needs activation)"
                });
              }

              throw new Error(`Failed to fetch Moyasar payment: ${response.status} ${response.statusText}`);
            }

            const moyasarPayment = await response.json();


            const statusMap: { [key: string]: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled' } = {
              'paid': 'completed',
              'initiated': 'pending',
              'failed': 'failed',
              'authorized': 'pending',
              'captured': 'completed',
              'voided': 'cancelled',
              'refunded': 'refunded'
            };

            const newStatus = statusMap[moyasarPayment.status] || transaction.status;


            if (newStatus !== transaction.status) {
              await storage.updatePaymentTransaction(transaction.id, {
                status: newStatus
              });
            }


            if (newStatus === 'completed') {

              const { plan } = await applySubscriptionAfterVerifiedPayment(
                transaction,
                moyasarPayment.id || transaction.paymentIntentId || String(transaction.id)
              );


              try {
                if ((global as any).broadcastToCompany && plan) {
                  (global as any).broadcastToCompany({
                    type: 'plan_updated',
                    data: {
                      companyId: transaction.companyId,
                      newPlan: plan.name.toLowerCase(),
                      planId: transaction.planId,
                      timestamp: new Date().toISOString(),
                      changeType: 'payment_upgrade'
                    }
                  }, transaction.companyId);
                }
              } catch (broadcastError) {
                console.error('Error broadcasting plan update:', broadcastError);
              }

              return res.json({
                success: true,
                status: 'completed',
                message: "Payment has been verified and subscription activated"
              });
            } else {
              return res.json({
                success: true,
                status: newStatus,
                message: `Payment is ${moyasarPayment.status}`
              });
            }
          } catch (error) {
            console.error('Error fetching Moyasar payment status:', error);
            return res.json({
              success: true,
              status: transaction.status,
              message: "Unable to verify payment status with Moyasar"
            });
          }
        } else {

          const { paymentId } = req.body;

          if (!paymentId) {
            return res.json({
              success: true,
              status: transaction.status,
              message: "Payment verification pending - no payment ID available"
            });
          }


          if (!moyasarSettings.secretKey) {
            return res.status(400).json({ error: "Moyasar secret key is missing" });
          }

          try {
            const response = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
              method: 'GET',
              headers: {
                'Authorization': `Basic ${Buffer.from(moyasarSettings.secretKey + ':').toString('base64')}`,
                'Content-Type': 'application/json'
              }
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));


            if (errorData.type === 'account_inactive_error') {



              await storage.updatePaymentTransaction(transaction.id, {
                status: 'completed',
                paymentIntentId: paymentId,
                externalTransactionId: paymentId
              });


              const { plan } = await applySubscriptionAfterVerifiedPayment(
                transaction,
                paymentId
              );


              try {
                if ((global as any).broadcastToCompany && plan) {
                  (global as any).broadcastToCompany({
                    type: 'plan_updated',
                    data: {
                      companyId: transaction.companyId,
                      newPlan: plan.name.toLowerCase(),
                      planId: transaction.planId,
                      timestamp: new Date().toISOString(),
                      changeType: 'payment_upgrade'
                    }
                  }, transaction.companyId);
                }
              } catch (broadcastError) {
                console.error('Error broadcasting plan update:', broadcastError);
              }

              return res.json({
                success: true,
                status: 'completed',
                message: "Payment has been verified and subscription activated (Moyasar account needs activation)"
              });
            }

            throw new Error(`Failed to verify Moyasar payment: ${response.status} ${response.statusText}`);
          }

          const moyasarPayment = await response.json();


          const updateData: any = {
            paymentIntentId: moyasarPayment.id,
            externalTransactionId: moyasarPayment.id
          };



          const statusMap: { [key: string]: 'pending' | 'completed' | 'failed' | 'refunded' | 'cancelled' } = {
            'paid': 'completed',
            'captured': 'completed',
            'initiated': 'pending',
            'failed': 'failed',
            'authorized': 'pending',
            'voided': 'cancelled',
            'refunded': 'refunded',
            'canceled': 'cancelled'
          };

          const newStatus = statusMap[moyasarPayment.status] || 'pending';
          updateData.status = newStatus;

          await storage.updatePaymentTransaction(transaction.id, updateData);


          if (newStatus === 'completed') {

            const { plan } = await applySubscriptionAfterVerifiedPayment(
              transaction,
              moyasarPayment.id || paymentId
            );


            try {
              if ((global as any).broadcastToCompany && plan) {
                (global as any).broadcastToCompany({
                  type: 'plan_updated',
                  data: {
                    companyId: transaction.companyId,
                    newPlan: plan.name.toLowerCase(),
                    planId: transaction.planId,
                    timestamp: new Date().toISOString(),
                    changeType: 'payment_upgrade'
                  }
                }, transaction.companyId);
              }
            } catch (broadcastError) {
              console.error('Error broadcasting plan update:', broadcastError);
            }

            return res.json({
              success: true,
              status: 'completed',
              message: "Payment has been verified and subscription activated"
            });
          } else {
            return res.json({
              success: true,
              status: newStatus,
              message: `Payment is ${moyasarPayment.status}`
            });
          }
          } catch (error) {
            console.error("Error verifying Moyasar payment:", error);
            return res.status(500).json({
              error: "Failed to verify payment with Moyasar",
              details: error instanceof Error ? error.message : String(error)
            });
          }
        }
      }


      if (source === 'mpesa' && transaction.paymentMethod === 'mpesa') {
        const mpesaSettingObj = await storage.getAppSetting('payment_mpesa');
        if (!mpesaSettingObj || !mpesaSettingObj.value) {
          return res.status(400).json({ error: "MPESA is not configured" });
        }

        const mpesaSettings = mpesaSettingObj.value as any;

        if (transaction.paymentIntentId) {

          const baseUrl = mpesaSettings.testMode ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
          const credentials = Buffer.from(`${mpesaSettings.consumerKey}:${mpesaSettings.consumerSecret}`).toString('base64');

          try {

            const authResponse = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
              method: 'GET',
              headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/json'
              }
            });

            if (!authResponse.ok) {
              throw new Error('Failed to authenticate with MPESA API');
            }

            const authData = await authResponse.json();
            const accessToken = authData.access_token;


            const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
            const password = Buffer.from(`${mpesaSettings.businessShortcode}${mpesaSettings.passkey}${timestamp}`).toString('base64');


            const queryPayload = {
              BusinessShortCode: mpesaSettings.businessShortcode,
              Password: password,
              Timestamp: timestamp,
              CheckoutRequestID: transaction.paymentIntentId
            };

            const queryResponse = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(queryPayload)
            });

            if (!queryResponse.ok) {
              throw new Error('Failed to query MPESA payment status');
            }

            const queryData = await queryResponse.json();


            let newStatus: 'pending' | 'completed' | 'failed' | 'cancelled' = transaction.status as any;

            if (queryData.ResponseCode === "0") {

              newStatus = 'completed';
            } else if (queryData.ResponseCode === "1032") {

              newStatus = 'cancelled';
            } else if (queryData.ResponseCode === "1037") {

              newStatus = 'failed';
            } else if (queryData.ResponseCode === "1001") {

              newStatus = 'failed';
            } else if (queryData.ResponseCode === "1") {

              newStatus = 'pending';
            } else {

              newStatus = 'failed';
            }


            if (newStatus !== transaction.status) {
              await storage.updatePaymentTransaction(transaction.id, {
                status: newStatus
              });
            }


            if (newStatus === 'completed') {
              const { plan } = await applySubscriptionAfterVerifiedPayment(
                transaction,
                transaction.paymentIntentId || String(transaction.id)
              );


              try {
                if ((global as any).broadcastToCompany && plan) {
                  (global as any).broadcastToCompany({
                    type: 'plan_updated',
                    data: {
                      companyId: transaction.companyId,
                      newPlan: plan.name.toLowerCase(),
                      planId: transaction.planId,
                      timestamp: new Date().toISOString(),
                      changeType: 'payment_upgrade'
                    }
                  }, transaction.companyId);
                }
              } catch (broadcastError) {
                console.error('Error broadcasting plan update:', broadcastError);
              }

              return res.json({
                success: true,
                status: 'completed',
                message: "MPESA payment has been verified and subscription activated"
              });
            } else {
              return res.json({
                success: true,
                status: newStatus,
                message: queryData.ResponseDescription || `Payment is ${newStatus}`
              });
            }

          } catch (error) {
            console.error('Error verifying MPESA payment status:', error);
            return res.json({
              success: true,
              status: transaction.status,
              message: "Unable to verify payment status with MPESA"
            });
          }
        } else {
          return res.json({
            success: true,
            status: transaction.status,
            message: "MPESA payment verification pending - no checkout request ID available"
          });
        }
      }

      return res.json({
        success: true,
        status: transaction?.status || 'unknown',
        message: `Payment verification completed - status: ${transaction?.status || 'unknown'}`
      });
    } catch (error) {
      console.error("Error verifying payment:", error);
      res.status(500).json({
        error: "Failed to verify payment",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/payment/transactions", ensureAuthenticated, async (req: any, res) => {
    try {
      const transactions = await storage.getPaymentTransactionsByCompany(req.user.companyId);

      const enhancedTransactions = await Promise.all(transactions.map(async (transaction) => {
        const plan = await storage.getPlan(transaction.planId!);
        return {
          ...transaction,
          planName: plan ? plan.name : 'Unknown Plan'
        };
      }));

      res.json(enhancedTransactions);
    } catch (error) {
      console.error("Error fetching payment transactions:", error);
      res.status(500).json({ error: "Failed to fetch payment transactions" });
    }
  });

  app.post("/api/payment/checkout/bank-transfer", ensureAuthenticated, async (req: any, res) => {
    try {
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({ error: "Plan ID is required" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ error: "Plan not found" });
      }

      const bankTransferSettingObj = await storage.getAppSetting('payment_bank_transfer');
      if (!bankTransferSettingObj || !bankTransferSettingObj.value) {
        return res.status(400).json({ error: "Bank transfer is not configured" });
      }

      const bankTransferSettings = bankTransferSettingObj.value as any;

      const transaction = await storage.createPaymentTransaction({
        companyId: req.user.companyId,
        planId,
        amount: plan.price,
        currency: 'USD',
        status: 'pending',
        paymentMethod: 'bank_transfer',
        metadata: {
          instructions: bankTransferSettings.instructions,
          reference: `PLAN-${planId}-COMPANY-${req.user.companyId}-TRANS-${Date.now()}`
        }
      });

      res.json({
        message: "Bank transfer payment created",
        transactionId: transaction.id,
        bankDetails: {
          accountName: bankTransferSettings.accountName,
          accountNumber: bankTransferSettings.accountNumber,
          bankName: bankTransferSettings.bankName,
          routingNumber: bankTransferSettings.routingNumber,
          swiftCode: bankTransferSettings.swiftCode,
          instructions: bankTransferSettings.instructions,
          reference: transaction.metadata?.reference
        }
      });
    } catch (error) {
      console.error("Error creating bank transfer payment:", error);
      res.status(500).json({ error: "Failed to create bank transfer payment" });
    }
  });

  const ensureSuperAdmin = (req: any, res: any, next: any) => {
    if (req.isAuthenticated() && req.user && req.user.isSuperAdmin) {
      return next();
    }
    res.status(403).json({ message: 'Super admin access required' });
  };

  app.get("/api/admin/payments/metrics", ensureSuperAdmin, async (_req, res) => {
    try {
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentYear = new Date(now.getFullYear(), 0, 1);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const allTransactions = await storage.getAllPaymentTransactions();

      const totalRevenue = allTransactions
        .filter(t => t.status === 'completed')
        .reduce((sum, t) => sum + t.amount, 0);

      const monthlyRevenue = allTransactions
        .filter(t => t.status === 'completed' && new Date(t.createdAt) >= currentMonth)
        .reduce((sum, t) => sum + t.amount, 0);

      const yearlyRevenue = allTransactions
        .filter(t => t.status === 'completed' && new Date(t.createdAt) >= currentYear)
        .reduce((sum, t) => sum + t.amount, 0);

      const lastMonthRevenue = allTransactions
        .filter(t => t.status === 'completed' &&
          new Date(t.createdAt) >= lastMonth &&
          new Date(t.createdAt) < currentMonth)
        .reduce((sum, t) => sum + t.amount, 0);

      const activeSubscriptions = await storage.getActiveSubscriptionsCount();
      const pendingPayments = allTransactions.filter(t => t.status === 'pending').length;

      const totalPayments = allTransactions.length;
      const successfulPayments = allTransactions.filter(t => t.status === 'completed').length;
      const paymentSuccessRate = totalPayments > 0 ? (successfulPayments / totalPayments) * 100 : 0;

      const monthlyGrowth = lastMonthRevenue > 0
        ? ((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100
        : 0;

      res.json({
        totalRevenue,
        monthlyRevenue,
        yearlyRevenue,
        monthlyGrowth,
        activeSubscriptions,
        pendingPayments,
        paymentSuccessRate: Math.round(paymentSuccessRate * 100) / 100
      });
    } catch (error) {
      console.error("Error fetching payment metrics:", error);
      res.status(500).json({ error: "Failed to fetch payment metrics" });
    }
  });

  app.get("/api/admin/payments/trends", ensureSuperAdmin, async (req, res) => {
    try {
      const { period = '12months' } = req.query;
      const now = new Date();
      let startDate: Date;

      switch (period) {
        case '7days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '12months':
        default:
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1);
          break;
      }

      const transactions = await storage.getPaymentTransactionsSince(startDate);

      const trends = [];
      if (period === '12months') {
        for (let i = 11; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const monthTransactions = transactions.filter(t => {
            const tDate = new Date(t.createdAt);
            return tDate.getMonth() === date.getMonth() &&
                   tDate.getFullYear() === date.getFullYear() &&
                   t.status === 'completed';
          });

          trends.push({
            period: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            revenue: monthTransactions.reduce((sum, t) => sum + t.amount, 0),
            transactions: monthTransactions.length
          });
        }
      } else {
        const days = period === '7days' ? 7 : 30;
        for (let i = days - 1; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dayTransactions = transactions.filter(t => {
            const tDate = new Date(t.createdAt);
            return tDate.toDateString() === date.toDateString() && t.status === 'completed';
          });

          trends.push({
            period: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue: dayTransactions.reduce((sum, t) => sum + t.amount, 0),
            transactions: dayTransactions.length
          });
        }
      }

      res.json(trends);
    } catch (error) {
      console.error("Error fetching payment trends:", error);
      res.status(500).json({ error: "Failed to fetch payment trends" });
    }
  });

  app.get("/api/admin/payments/companies", ensureSuperAdmin, async (req, res) => {
    try {
      const { page = 1, limit = 20, search, status, paymentMethod } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      const result = await storage.getCompaniesWithPaymentDetails({
        offset,
        limit: Number(limit),
        search: search as string,
        status: status as string,
        paymentMethod: paymentMethod as string
      });

      res.json({
        data: result.data,
        total: result.total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(result.total / Number(limit))
      });
    } catch (error) {
      console.error("Error fetching company payment details:", error);
      res.status(500).json({ error: "Failed to fetch company payment details" });
    }
  });

  app.get("/api/admin/payments/transactions", ensureSuperAdmin, async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        paymentMethod,
        status,
        startDate,
        endDate,
        companyId
      } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      const filters = {
        paymentMethod: paymentMethod as string,
        status: status as string,
        startDate: startDate as string,
        endDate: endDate as string,
        companyId: companyId ? Number(companyId) : undefined,
        offset,
        limit: Number(limit)
      };

      const transactions = await storage.getPaymentTransactionsWithFilters(filters);

      const enhancedTransactions = await Promise.all(transactions.data.map(async (transaction) => {
        const [company, plan] = await Promise.all([
          transaction.companyId ? storage.getCompany(transaction.companyId) : Promise.resolve(null),
          transaction.planId ? storage.getPlan(transaction.planId) : Promise.resolve(null)
        ]);

        return {
          ...transaction,
          companyName: company?.name || 'Unknown Company',
          planName: plan?.name || 'Unknown Plan',
          notes: transaction.metadata?.notes || null
        };
      }));

      res.json({
        data: enhancedTransactions,
        total: transactions.total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(transactions.total / Number(limit))
      });
    } catch (error) {
      console.error("Error fetching payment transactions:", error);
      res.status(500).json({ error: "Failed to fetch payment transactions" });
    }
  });

  app.get("/api/admin/payments/pending", ensureSuperAdmin, async (req, res) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const offset = (Number(page) - 1) * Number(limit);

      const pendingPayments = await storage.getPendingPayments(offset, Number(limit));

      const enhancedPayments = await Promise.all(pendingPayments.data.map(async (payment) => {
        const [company, plan] = await Promise.all([
          payment.companyId ? storage.getCompany(payment.companyId) : Promise.resolve(null),
          payment.planId ? storage.getPlan(payment.planId) : Promise.resolve(null)
        ]);

        const daysOverdue = Math.floor(
          (new Date().getTime() - new Date(payment.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        return {
          ...payment,
          companyName: company?.name || 'Unknown Company',
          planName: plan?.name || 'Unknown Plan',
          daysOverdue
        };
      }));

      res.json({
        data: enhancedPayments,
        total: pendingPayments.total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(pendingPayments.total / Number(limit))
      });
    } catch (error) {
      console.error("Error fetching pending payments:", error);
      res.status(500).json({ error: "Failed to fetch pending payments" });
    }
  });

  app.patch("/api/admin/payments/transactions/:id/status", ensureSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      const transaction = await storage.updatePaymentTransactionStatus(Number(id), status, notes);

      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }


      if (status === 'completed' && transaction.companyId && transaction.planId) {
        const { plan } = await applySubscriptionAfterVerifiedPayment(
          transaction,
          transaction.paymentIntentId || transaction.externalTransactionId || String(transaction.id)
        );

        try {
          if ((global as any).broadcastToCompany && plan) {
            (global as any).broadcastToCompany({
              type: 'plan_updated',
              data: {
                companyId: transaction.companyId,
                newPlan: plan.name.toLowerCase(),
                planId: transaction.planId,
                timestamp: new Date().toISOString(),
                changeType: 'payment_upgrade',
                subscriptionStatus: 'active',
                trialCleared: true
              }
            }, transaction.companyId);

            (global as any).broadcastToCompany({
              type: 'subscription_status_changed',
              data: {
                companyId: transaction.companyId,
                subscriptionStatus: 'active',
                isInTrial: false,
                trialCleared: true,
                paymentReceived: true,
                timestamp: new Date().toISOString()
              }
            }, transaction.companyId);
          }
        } catch (broadcastError) {
          console.error('Error broadcasting payment update:', broadcastError);
        }
      }

      res.json({ success: true, transaction });
    } catch (error) {
      console.error("Error updating payment status:", error);
      res.status(500).json({ error: "Failed to update payment status" });
    }
  });

  app.patch("/api/admin/payments/transactions/:id", ensureSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, paymentMethod, amount, notes, externalTransactionId } = req.body;

      if (status && !['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      if (paymentMethod && !['stripe', 'paypal', 'mercado_pago', 'bank_transfer'].includes(paymentMethod)) {
        return res.status(400).json({ error: "Invalid payment method" });
      }

      if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const currentTransaction = await storage.getPaymentTransaction(Number(id));
      if (!currentTransaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      const updates: any = {
        updatedAt: new Date()
      };

      if (status !== undefined) updates.status = status;
      if (paymentMethod !== undefined) updates.paymentMethod = paymentMethod;
      if (amount !== undefined) updates.amount = amount;
      if (externalTransactionId !== undefined) updates.externalTransactionId = externalTransactionId;

      if (notes !== undefined) {
        const currentMetadata = currentTransaction.metadata || {};
        updates.metadata = {
          ...currentMetadata,
          notes: notes
        };
      }

      const transaction = await storage.updatePaymentTransaction(Number(id), updates);

      if (status === 'completed' && currentTransaction.status !== 'completed' && transaction.companyId && transaction.planId) {
        const { plan } = await applySubscriptionAfterVerifiedPayment(
          transaction,
          transaction.paymentIntentId || transaction.externalTransactionId || String(transaction.id)
        );

        try {
          if ((global as any).broadcastToCompany && plan) {
            (global as any).broadcastToCompany({
              type: 'plan_updated',
              data: {
                companyId: transaction.companyId,
                newPlan: plan.name.toLowerCase(),
                planId: transaction.planId,
                timestamp: new Date().toISOString(),
                changeType: 'payment_upgrade',
                subscriptionStatus: 'active',
                trialCleared: true
              }
            }, transaction.companyId);

            (global as any).broadcastToCompany({
              type: 'subscription_status_changed',
              data: {
                companyId: transaction.companyId,
                subscriptionStatus: 'active',
                isInTrial: false,
                trialCleared: true,
                paymentReceived: true,
                timestamp: new Date().toISOString()
              }
            }, transaction.companyId);
          }
        } catch (broadcastError) {
          console.error('Error broadcasting payment update:', broadcastError);
        }
      }

      res.json({ success: true, transaction });
    } catch (error) {
      console.error("Error updating payment transaction:", error);
      res.status(500).json({ error: "Failed to update payment transaction" });
    }
  });

  app.post("/api/admin/payments/reminders/:companyId", ensureSuperAdmin, async (req, res) => {
    try {
      const { companyId } = req.params;
      const { message, type = 'email' } = req.body;

      const company = await storage.getCompany(Number(companyId));
      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      

      await storage.createPaymentReminder({
        companyId: Number(companyId),
        type,
        message,
        sentAt: new Date(),
        sentBy: req.user!.id
      });

      res.json({ success: true, message: "Reminder sent successfully" });
    } catch (error) {
      console.error("Error sending payment reminder:", error);
      res.status(500).json({ error: "Failed to send payment reminder" });
    }
  });

  app.get("/api/admin/payments/method-performance", ensureSuperAdmin, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;

      const filters = {
        startDate: startDate as string,
        endDate: endDate as string
      };

      const performance = await storage.getPaymentMethodPerformance(filters);
      res.json(performance);
    } catch (error) {
      console.error("Error fetching payment method performance:", error);
      res.status(500).json({ error: "Failed to fetch payment method performance" });
    }
  });

  app.get("/api/admin/payments/export", ensureSuperAdmin, async (req, res) => {
    try {
      const { startDate, endDate, paymentMethod, status } = req.query;
      const format = parseExportFormat(req.query.format);
      if (!format) return res.status(400).json({ error: 'Unsupported export format' });

      const filters = {
        startDate: startDate as string,
        endDate: endDate as string,
        paymentMethod: paymentMethod as string,
        status: status as string
      };

      const transactions = await storage.getPaymentTransactionsForExport(filters);

      await sendTabularExport(res, {
        filename: `payments-${new Date().toISOString().slice(0, 10)}`,
        format,
        sheets: [{ name: 'Payment Transactions', columns: [
          { key: 'id', header: 'ID', type: 'number', width: 10 },
          { key: 'companyId', header: 'Company ID', type: 'number', width: 14 },
          { key: 'planId', header: 'Plan ID', type: 'number', width: 12 },
          { key: 'amount', header: 'Amount', type: 'number', numberFormat: '#,##0.00', width: 16 },
          { key: 'currency', header: 'Currency', width: 12 },
          { key: 'status', header: 'Status', width: 14 },
          { key: 'paymentMethod', header: 'Payment Method', width: 18 },
          { key: 'externalTransactionId', header: 'External Transaction ID', width: 28 },
          { key: 'createdAt', header: 'Created At', type: 'date', numberFormat: 'yyyy-mm-dd hh:mm:ss', width: 22 },
          { key: 'updatedAt', header: 'Updated At', type: 'date', numberFormat: 'yyyy-mm-dd hh:mm:ss', width: 22 },
        ], rows: transactions.map((transaction) => ({ ...transaction })) }],
      });
    } catch (error) {
      console.error("Error exporting payment data:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to export payment data" });
    }
  });
}
