import { AppSumoAdminPanel } from '@/components/settings/AppSumo';
import { isAppSumoOrigin } from '@shared/appsumo';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { settingsEvents, SETTINGS_EVENTS } from '@/lib/settings-events';

import { useBranding } from '@/contexts/branding-context';
import { useCurrency } from '@/contexts/currency-context';
import { useTranslation } from '@/hooks/use-translation';
import AdminLayout from '@/components/admin/AdminLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import {
  Loader2,
  Upload,
  Check,
  CreditCard,
  Palette,
  Globe,
  FileImage,
  UserPlus,
  Mail,
  Database,
  RefreshCw,
  Settings,
  Key,
  Code,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Plus,
  Paintbrush,
  X,
  LayoutTemplate,
  Smile,
  Monitor,
  Smartphone,
  Info,
  Gift as TabIconGift,
} from 'lucide-react';
import BackupManagement from '@/components/admin/BackupManagement';
import SystemUpdatesTab from '@/components/settings/SystemUpdatesTab';

import { MetaPartnerConfigurationForm } from '@/components/settings/MetaPartnerConfigurationForm';
import { TikTokPlatformConfigForm } from '@/components/settings/TikTokPlatformConfigForm';
import AiCredentialsTab from '@/components/admin/AiCredentialsTab';
import SystemUsageAnalytics from '@/components/admin/SystemUsageAnalytics';
import FrontendWebsiteManagementSection from '@/components/settings/FrontendWebsiteManagementSection';


const BUILT_IN_CURRENCY_OPTIONS = [
  { code: 'ARS', label: 'ARS - Argentine Peso' },
  { code: 'BRL', label: 'BRL - Brazilian Real' },
  { code: 'MXN', label: 'MXN - Mexican Peso' },
  { code: 'CLP', label: 'CLP - Chilean Peso' },
  { code: 'COP', label: 'COP - Colombian Peso' },
  { code: 'PEN', label: 'PEN - Peruvian Sol' },
  { code: 'UYU', label: 'UYU - Uruguayan Peso' },
  { code: 'PYG', label: 'PYG - Paraguayan Guarani' },
  { code: 'BOB', label: 'BOB - Bolivian Boliviano' },
  { code: 'VEF', label: 'VEF - Venezuelan Bolívar' },
  { code: 'PKR', label: 'PKR - Pakistani Rupee' },
  { code: 'INR', label: 'INR - Indian Rupee' },
  { code: 'USD', label: 'USD - US Dollar' },
  { code: 'EUR', label: 'EUR - Euro' },
  // Paystack-supported currencies
  { code: 'NGN', label: 'NGN - Nigerian Naira' },
  { code: 'GHS', label: 'GHS - Ghanaian Cedi' },
  { code: 'ZAR', label: 'ZAR - South African Rand' },
  { code: 'KES', label: 'KES - Kenyan Shilling' },
  { code: 'XOF', label: 'XOF - West African CFA Franc' },
  { code: 'EGP', label: 'EGP - Egyptian Pound' },
] as const;


const BUILT_IN_CURRENCY_CODES: string[] = BUILT_IN_CURRENCY_OPTIONS.map(opt => opt.code);

/** Must match server admin mask for unchanged OAuth client secret on save */
const ADMIN_OAUTH_CLIENT_SECRET_MASK = '••••••••';

const UI_GRADIENT_TEMPLATES = {
  'glass-dark': {
    label: 'Glass Dark',
    start: '#070b18',
    middle: '#0f172a',
    end: '#1d4ed8',
  },
  'midnight-aurora': {
    label: 'Midnight Aurora',
    start: '#08111f',
    middle: '#132238',
    end: '#14b8a6',
  },
  'graphite-violet': {
    label: 'Graphite Violet',
    start: '#11131b',
    middle: '#1f2231',
    end: '#7c3aed',
  },
  'obsidian-ember': {
    label: 'Obsidian Ember',
    start: '#120f14',
    middle: '#231a25',
    end: '#f97316',
  },
  'ocean-noir': {
    label: 'Ocean Noir',
    start: '#061018',
    middle: '#10243a',
    end: '#0ea5e9',
  },
  'emerald-night': {
    label: 'Emerald Night',
    start: '#07130f',
    middle: '#163127',
    end: '#10b981',
  },
  'royal-amethyst': {
    label: 'Royal Amethyst',
    start: '#0f1020',
    middle: '#241c3f',
    end: '#8b5cf6',
  },
  'carbon-steel': {
    label: 'Carbon Steel',
    start: '#0b0f17',
    middle: '#1b2432',
    end: '#64748b',
  },
  'ruby-eclipse': {
    label: 'Ruby Eclipse',
    start: '#140a12',
    middle: '#2b1625',
    end: '#e11d48',
  },
  'sunset-onyx': {
    label: 'Sunset Onyx',
    start: '#140d0a',
    middle: '#33201d',
    end: '#f59e0b',
  },
  'neon-cyber': {
    label: 'Neon Cyber',
    start: '#050816',
    middle: '#111c3a',
    end: '#06b6d4',
  },
  'deep-space': {
    label: 'Deep Space',
    start: '#05070d',
    middle: '#161b2e',
    end: '#3b82f6',
  },
  'moonlit-forest': {
    label: 'Moonlit Forest',
    start: '#08110d',
    middle: '#182b24',
    end: '#22c55e',
  },
  'storm-slate': {
    label: 'Storm Slate',
    start: '#0a0f16',
    middle: '#1c2633',
    end: '#94a3b8',
  },
  'plum-night': {
    label: 'Plum Night',
    start: '#100914',
    middle: '#24142e',
    end: '#c084fc',
  },
  'crimson-noir': {
    label: 'Crimson Noir',
    start: '#12070c',
    middle: '#2a1220',
    end: '#f43f5e',
  },
  'arctic-glow': {
    label: 'Arctic Glow',
    start: '#061018',
    middle: '#12283d',
    end: '#38bdf8',
  },
  'dark-lux': {
    label: 'Dark Lux',
    start: '#0b0b12',
    middle: '#211f2f',
    end: '#facc15',
  },
  'graphite-glass': {
    label: 'Graphite Glass',
    start: '#101216',
    middle: '#262a33',
    end: '#4f5668',
  },
} as const;

type UiGradientTemplateKey = keyof typeof UI_GRADIENT_TEMPLATES;

export default function AdminSettingsPage() {
  const { toast } = useToast();
  const { t, currentLanguage } = useTranslation();
  const langCode = currentLanguage?.code || 'en';
  const { refreshBranding } = useBranding();
  const { formatCurrency } = useCurrency();
  const [location] = useLocation();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [faviconPreview, setFaviconPreview] = useState<string | null>(null);
  const [adminAuthBgFile, setAdminAuthBgFile] = useState<File | null>(null);
  const [adminAuthBgPreview, setAdminAuthBgPreview] = useState<string | null>(null);
  const [userAuthBgFile, setUserAuthBgFile] = useState<File | null>(null);
  const [userAuthBgPreview, setUserAuthBgPreview] = useState<string | null>(null);
  
  const [showPartnerConfigModal, setShowPartnerConfigModal] = useState(false);
  const [showMetaPartnerConfigModal, setShowMetaPartnerConfigModal] = useState(false);
  const [showTikTokPlatformConfigModal, setShowTikTokPlatformConfigModal] = useState(false);
  const [brandingUpdateKey, setBrandingUpdateKey] = useState(0);

  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const tabFromUrl = urlParams.get('tab') || 'branding';
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  const applyGradientTemplate = (templateKey: UiGradientTemplateKey) => {
    const template = UI_GRADIENT_TEMPLATES[templateKey];
    setBrandingForm((prev) => ({
      ...prev,
      uiGradientPreset: templateKey,
      uiGradientStart: template.start,
      uiGradientMiddle: template.middle,
      uiGradientEnd: template.end,
    }));
  };

  const updateBrandingGradientColor = (field: 'uiGradientStart' | 'uiGradientMiddle' | 'uiGradientEnd', value: string) => {
    setBrandingForm((prev) => ({
      ...prev,
      uiGradientPreset: 'custom',
      [field]: value,
    }));
  };

  useEffect(() => {
    const newUrlParams = new URLSearchParams(location.split('?')[1] || '');
    const newTabFromUrl = newUrlParams.get('tab') || 'branding';
    setActiveTab(newTabFromUrl);
  }, [location]);


  useEffect(() => {
    const handleBrandingUpdate = () => {
      setBrandingUpdateKey(prev => prev + 1);
    };

    window.addEventListener('brandingUpdated', handleBrandingUpdate);
    return () => window.removeEventListener('brandingUpdated', handleBrandingUpdate);
  }, []);

  const [brandingForm, setBrandingForm] = useState({
    appName: 'BotHive',
    primaryColor: '#333235',
    secondaryColor: '#4F46E5',
    uiGradientPreset: 'glass-dark',
    uiGradientStart: '#070b18',
    uiGradientMiddle: '#0f172a',
    uiGradientEnd: '#1d4ed8',
    defaultTheme: '' as 'dark' | 'light' | ''
  });

  const [stripeForm, setStripeForm] = useState({
    publishableKey: '',
    secretKey: '',
    webhookSecret: '',
    webhookUrl: '',
    testMode: true,
    enabled: false
  });

  const [paystackForm, setPaystackForm] = useState({
    publicKey: '',
    secretKey: '',
    subaccount: '',
    webhookSecret: '',
    merchantCurrency: '',
    testMode: true,
    enabled: false
  });


  const [embedSettings, setEmbedSettings] = useState({
    width: '100%',
    height: '600px',
    showHeader: true,
    allowFullscreen: true,
    borderRadius: '8px',
    boxShadow: true
  });
  const [embedCode, setEmbedCode] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [showEmbedPreview, setShowEmbedPreview] = useState(false);

  const [registrationSettings, setRegistrationSettings] = useState({
    enabled: true,
    requireApproval: false,
    requireEmailVerification: false,
    defaultPlan: ''
  });





  const [googleCalendarOAuthForm, setGoogleCalendarOAuthForm] = useState({
    enabled: false,
    client_id: '',
    client_secret: '',
    redirect_uri: ''
  });

  const [zohoCalendarOAuthForm, setZohoCalendarOAuthForm] = useState({
    enabled: false,
    client_id: '',
    client_secret: '',
    redirect_uri: ''
  });

  const [calendlyOAuthForm, setCalendlyOAuthForm] = useState({
    enabled: false,
    client_id: '',
    client_secret: '',
    webhook_signing_key: '',
    redirect_uri: ''
  });


  const [googleSheetsOAuthForm, setGoogleSheetsOAuthForm] = useState({
    enabled: false,
    client_id: '',
    client_secret: '',
    redirect_uri: ''
  });

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState('');

  const [showGoogleCalendarClientSecret, setShowGoogleCalendarClientSecret] = useState(false);
  const [showGoogleSheetsClientSecret, setShowGoogleSheetsClientSecret] = useState(false);

  const [mercadoPagoForm, setMercadoPagoForm] = useState({
    clientId: '',
    clientSecret: '',
    accessToken: '',
    testMode: true,
    enabled: false
  });

  const [paypalForm, setPaypalForm] = useState({
    clientId: '',
    clientSecret: '',
    testMode: true,
    enabled: false
  });

  const [moyasarForm, setMoyasarForm] = useState({
    publishableKey: '',
    secretKey: '',
    testMode: true,
    enabled: false
  });

  const [mpesaForm, setMpesaForm] = useState({
    consumerKey: '',
    consumerSecret: '',
    businessShortcode: '',
    passkey: '',
    shortcodeType: 'paybill',
    callbackUrl: '',
    testMode: true,
    enabled: false
  });

  const [bankTransferForm, setBankTransferForm] = useState({
    accountName: '',
    accountNumber: '',
    bankName: '',
    routingNumber: '',
    swiftCode: '',
    instructions: '',
    enabled: false
  });

  const [generalSettingsForm, setGeneralSettingsForm] = useState({
    defaultCurrency: 'USD',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    subdomainAuthentication: false,
    frontendWebsiteEnabled: false,
    planRenewalEnabled: true,
    helpSupportUrl: '',
    customCurrencies: [] as Array<{ code: string; name: string; symbol: string }>
  });
  const [persistedGeneralSettings, setPersistedGeneralSettings] = useState(generalSettingsForm);

  const [smtpForm, setSmtpForm] = useState({
    enabled: false,
    host: '',
    port: 587,
    security: 'tls',
    username: '',
    password: '',
    fromName: '',
    fromEmail: '',
    testEmail: ''
  });
  const isValidSmtpEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const [isSmtpPasswordVisible, setIsSmtpPasswordVisible] = useState(false);
  const [storedSmtpPassword, setStoredSmtpPassword] = useState('');

  const [customScriptsForm, setCustomScriptsForm] = useState({
    enabled: false,
    scripts: '',
    lastModified: ''
  });

  const [customCssForm, setCustomCssForm] = useState({
    enabled: false,
    css: '',
    lastModified: ''
  });

  const [welcomeEmailForm, setWelcomeEmailForm] = useState({
    enabled: true,
    subject: 'Welcome to {{companyName}} - Your Account is Ready!',
    body: '',
  });

  const [welcomeEmailPreviewDevice, setWelcomeEmailPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [welcomeEmailEditorView, setWelcomeEmailEditorView] = useState<'code' | 'preview'>('code'); // 'code' is active by default in the screenshot

  const [showWelcomeEmailPreview, setShowWelcomeEmailPreview] = useState(true); // Always show preview side-by-side on desktop as shown in screenshot

  const handleCopyVariable = (variable: string) => {
    navigator.clipboard.writeText(variable);
    toast({
      title: t('admin.settings.welcome_email.copied', 'Copied to Clipboard'),
      description: t('admin.settings.welcome_email.copied_desc', 'Variable {{variable}} has been copied to your clipboard.', { variable }),
    });
  };

  const [showCustomCurrencyDialog, setShowCustomCurrencyDialog] = useState(false);
  const [customCurrencyForm, setCustomCurrencyForm] = useState({
    code: '',
    name: '',
    symbol: ''
  });



  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['/api/admin/settings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      return res.json();
    }
  });



  const { data: plans, isLoading: isLoadingPlans } = useQuery({
    queryKey: ['/api/admin/plans'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/plans');
      if (!res.ok) throw new Error('Failed to fetch plans');
      return res.json();
    }
  });





  const { data: googleCalendarOAuthSettings } = useQuery({
    queryKey: ['/api/admin/settings/integrations/google-calendar'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings/integrations/google-calendar');
      if (!res.ok) throw new Error('Failed to fetch Google Calendar OAuth settings');
      return res.json();
    }
  });

  const { data: zohoCalendarOAuthSettings } = useQuery({
    queryKey: ['/api/admin/settings/integrations/zoho-calendar'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings/integrations/zoho-calendar');
      if (!res.ok) throw new Error('Failed to fetch Zoho Calendar OAuth settings');
      return res.json();
    }
  });

  const { data: calendlyOAuthSettings } = useQuery({
    queryKey: ['/api/admin/settings/integrations/calendly'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings/integrations/calendly');
      if (!res.ok) throw new Error('Failed to fetch Calendly OAuth settings');
      return res.json();
    }
  });


  const { data: googleSheetsOAuthSettings } = useQuery({
    queryKey: ['/api/admin/settings/integrations/google-sheets'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/admin/settings/integrations/google-sheets');
      if (!res.ok) throw new Error('Failed to fetch Google Sheets OAuth settings');
      return res.json();
    }
  });

  const { data: googleMapsSettings } = useQuery({
    queryKey: ['/api/company-settings/google-maps'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/google-maps');
      if (!res.ok) throw new Error('Failed to fetch Google Maps API key');
      return res.json();
    }
  });

  const { data: welcomeEmailSettings } = useQuery({
    queryKey: ['/api/admin/settings/welcome-email', langCode],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/admin/settings/welcome-email?lang=${langCode}`);
      if (!res.ok) throw new Error('Failed to fetch welcome email template');
      return res.json();
    }
  });



  useEffect(() => {
    if (settings) {
      const brandingSetting = settings.find((s: any) => s.key === 'branding');
      if (brandingSetting) {
        const savedBranding = brandingSetting.value || {};
        const matchedTemplate = (Object.entries(UI_GRADIENT_TEMPLATES) as Array<[UiGradientTemplateKey, typeof UI_GRADIENT_TEMPLATES[UiGradientTemplateKey]]>).find(([, template]) => (
          template.start === savedBranding.uiGradientStart &&
          template.middle === savedBranding.uiGradientMiddle &&
          template.end === savedBranding.uiGradientEnd
        ));

        setBrandingForm(prev => ({
          ...prev,
          ...savedBranding,
          uiGradientPreset: savedBranding.uiGradientPreset || matchedTemplate?.[0] || prev.uiGradientPreset,
          defaultTheme: savedBranding.defaultTheme || ''
        }));
      }

      const logoSetting = settings.find((s: any) => s.key === 'branding_logo');
      if (logoSetting) {
        setLogoPreview(logoSetting.value);
      }

      const faviconSetting = settings.find((s: any) => s.key === 'branding_favicon');
      if (faviconSetting) {
        setFaviconPreview(faviconSetting.value);
      }

      // Load admin auth background image
      const adminAuthBgSetting = settings.find((s: any) => s.key === 'branding_admin_auth_background');
      if (adminAuthBgSetting) {
        setAdminAuthBgPreview(adminAuthBgSetting.value);
      }

      // Load user auth background image
      const userAuthBgSetting = settings.find((s: any) => s.key === 'branding_user_auth_background');
      if (userAuthBgSetting) {
        setUserAuthBgPreview(userAuthBgSetting.value);
      }

      const registrationSetting = settings.find((s: any) => s.key === 'registration_settings');
      if (registrationSetting) {
        const value = registrationSetting.value || {};
        setRegistrationSettings({
          enabled: value.enabled ?? true,
          requireApproval: value.requireApproval ?? false,
          requireEmailVerification: value.requireEmailVerification ?? false,
          defaultPlan: value.defaultPlan || ''
        });
      }

      const stripeSetting = settings.find((s: any) => s.key === 'payment_stripe');
      if (stripeSetting) {
        setStripeForm({
          publishableKey: stripeSetting.value.publishableKey || '',
          secretKey: stripeSetting.value.secretKey ? '••••••••' : '',
          webhookSecret: stripeSetting.value.webhookSecret || '',
          webhookUrl: stripeSetting.value.webhookUrl || `${window.location.origin}/api/webhooks/stripe`,
          testMode: stripeSetting.value.testMode !== undefined ? !!stripeSetting.value.testMode : true,
          enabled: !!stripeSetting.value.enabled,
        });
      }

      const mercadoPagoSetting = settings.find((s: any) => s.key === 'payment_mercadopago');
      if (mercadoPagoSetting) {
        setMercadoPagoForm({
          ...mercadoPagoSetting.value,
          clientSecret: mercadoPagoSetting.value.clientSecret ? '••••••••' : '',
          accessToken: mercadoPagoSetting.value.accessToken ? '••••••••' : ''
        });
      }

      const paypalSetting = settings.find((s: any) => s.key === 'payment_paypal');
      if (paypalSetting) {
        setPaypalForm({
          ...paypalSetting.value,
          clientSecret: paypalSetting.value.clientSecret ? '••••••••' : ''
        });
      }

      const paystackSetting = settings.find((s: any) => s.key === 'payment_paystack');
      if (paystackSetting) {
        setPaystackForm({
          ...paystackSetting.value,
          merchantCurrency: paystackSetting.value.merchantCurrency || '',
          secretKey: paystackSetting.value.secretKey ? '••••••••' : ''
        });
      }

      const moyasarSetting = settings.find((s: any) => s.key === 'payment_moyasar');
      if (moyasarSetting) {
        setMoyasarForm({
          ...moyasarSetting.value,
          secretKey: moyasarSetting.value.secretKey ? '••••••••' : ''
        });
      }

      const mpesaSetting = settings.find((s: any) => s.key === 'payment_mpesa');
      if (mpesaSetting) {
        setMpesaForm({
          ...mpesaSetting.value
        });
      }

      const bankTransferSetting = settings.find((s: any) => s.key === 'payment_bank_transfer');
      if (bankTransferSetting) {
        setBankTransferForm(bankTransferSetting.value);
      }

      const generalSetting = settings.find((s: any) => s.key === 'general_settings');
      if (generalSetting && generalSetting.value) {
        const settingsValue = generalSetting.value as any;
        const loadedGeneralSettings = {
          defaultCurrency: settingsValue.defaultCurrency || 'USD',
          dateFormat: settingsValue.dateFormat || 'MM/DD/YYYY',
          timeFormat: settingsValue.timeFormat || '12h',
          subdomainAuthentication: settingsValue.subdomainAuthentication || false,
          frontendWebsiteEnabled: settingsValue.frontendWebsiteEnabled !== undefined ? settingsValue.frontendWebsiteEnabled : false,
          planRenewalEnabled: settingsValue.planRenewalEnabled !== undefined ? settingsValue.planRenewalEnabled : true,
          helpSupportUrl: settingsValue.helpSupportUrl || '',
          customCurrencies: settingsValue.customCurrencies || []
        };
        setGeneralSettingsForm(loadedGeneralSettings);
        setPersistedGeneralSettings(loadedGeneralSettings);
      }

      const smtpSetting = settings.find((s: any) => s.key === 'smtp_config');
      if (smtpSetting) {
        setStoredSmtpPassword(smtpSetting.value.password || '');
        setSmtpForm({
          ...smtpSetting.value,
          password: '' // Clear password field for security
        });
      }

      const customScriptsSetting = settings.find((s: any) => s.key === 'custom_scripts');
      if (customScriptsSetting) {
        setCustomScriptsForm({
          enabled: customScriptsSetting.value.enabled || false,
          scripts: customScriptsSetting.value.scripts || '',
          lastModified: customScriptsSetting.value.lastModified || ''
        });
      }

      const customCssSetting = settings.find((s: any) => s.key === 'custom_css');
      if (customCssSetting) {
        setCustomCssForm({
          enabled: customCssSetting.value.enabled || false,
          css: customCssSetting.value.css || '',
          lastModified: customCssSetting.value.lastModified || ''
        });
      }

    }
  }, [settings]);

  useEffect(() => {
    if (welcomeEmailSettings) {
      setWelcomeEmailForm({
        enabled: welcomeEmailSettings.enabled ?? true,
        subject: welcomeEmailSettings.subject || '',
        body: welcomeEmailSettings.body || '',
      });
    }
  }, [welcomeEmailSettings]);




  useEffect(() => {
    if (googleCalendarOAuthSettings) {

      const dynamicRedirectUri = `${window.location.origin}/api/google/calendar/callback`;
      const savedRedirect = typeof googleCalendarOAuthSettings.redirect_uri === 'string'
        ? googleCalendarOAuthSettings.redirect_uri.trim()
        : '';

      setGoogleCalendarOAuthForm({
        ...googleCalendarOAuthSettings,
        client_secret: googleCalendarOAuthSettings.client_secret != null
          ? String(googleCalendarOAuthSettings.client_secret)
          : '',
        redirect_uri: savedRedirect || dynamicRedirectUri
      });
    }
  }, [googleCalendarOAuthSettings]);

  useEffect(() => {
    if (zohoCalendarOAuthSettings) {

      const dynamicRedirectUri = `${window.location.origin}/api/zoho/calendar/callback`;

      setZohoCalendarOAuthForm({
        ...zohoCalendarOAuthSettings,
        client_secret: zohoCalendarOAuthSettings.client_secret ? '••••••••' : '',
        redirect_uri: dynamicRedirectUri
      });
    }
  }, [zohoCalendarOAuthSettings]);

  useEffect(() => {
    if (calendlyOAuthSettings) {

      const dynamicRedirectUri = `${window.location.origin}/api/calendly/callback`;

      setCalendlyOAuthForm({
        ...calendlyOAuthSettings,
        client_secret: calendlyOAuthSettings.client_secret ? '••••••••' : '',
        webhook_signing_key: calendlyOAuthSettings.webhook_signing_key ? '••••••••' : '',
        redirect_uri: dynamicRedirectUri
      });
    }
  }, [calendlyOAuthSettings]);

  useEffect(() => {
    if (googleSheetsOAuthSettings) {

      const dynamicRedirectUri = `${window.location.origin}/api/google/sheets/callback`;
      const savedRedirect = typeof googleSheetsOAuthSettings.redirect_uri === 'string'
        ? googleSheetsOAuthSettings.redirect_uri.trim()
        : '';

      setGoogleSheetsOAuthForm({
        ...googleSheetsOAuthSettings,
        client_secret: googleSheetsOAuthSettings.client_secret != null
          ? String(googleSheetsOAuthSettings.client_secret)
          : '',
        redirect_uri: savedRedirect || dynamicRedirectUri
      });
    }
  }, [googleSheetsOAuthSettings]);

  useEffect(() => {
    if (googleMapsSettings) {


      if (!googleMapsSettings.configured) {
        setGoogleMapsApiKey('');
      }
    }
  }, [googleMapsSettings]);



  useEffect(() => {
    if (plans && plans.length > 0 && !registrationSettings.defaultPlan) {
      const defaultPlan = plans.find((plan: any) => plan.isActive) || plans[0];
      if (defaultPlan) {
        setRegistrationSettings(prev => ({
          ...prev,
          defaultPlan: defaultPlan.id.toString()
        }));
      }
    }
  }, [plans, registrationSettings.defaultPlan]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
      uploadLogoMutation.mutate(file);
      e.target.value = '';
    }
  };

  const handleFaviconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setFaviconFile(file);
      setFaviconPreview(URL.createObjectURL(file));
      uploadFaviconMutation.mutate(file);
      e.target.value = '';
    }
  };

  const handleAdminAuthBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAdminAuthBgFile(file);
      setAdminAuthBgPreview(URL.createObjectURL(file));
      uploadAdminAuthBgMutation.mutate(file);
      e.target.value = '';
    }
  };

  const handleUserAuthBgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUserAuthBgFile(file);
      setUserAuthBgPreview(URL.createObjectURL(file));
      uploadUserAuthBgMutation.mutate(file);
      e.target.value = '';
    }
  };

  const uploadLogoMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('logo', file);

      const res = await fetch('/api/admin/settings/branding/logo', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_upload_logo', 'Failed to upload logo'));
      }

      return res.json();
    },
    onSuccess: async (data) => {
      setLogoFile(null);

      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });


      await refreshBranding();


      setBrandingUpdateKey(prev => prev + 1);


      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('brandingUpdated', {
          detail: { logoUrl: data.logoUrl }
        }));
      }, 100);

      toast({
        title: t('admin.settings.logo_uploaded', 'Logo uploaded'),
        description: t('admin.settings.logo_uploaded_desc', 'The logo has been uploaded successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_uploading_logo', 'Error uploading logo'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const uploadFaviconMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('favicon', file);

      const res = await fetch('/api/admin/settings/branding/favicon', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_upload_favicon', 'Failed to upload favicon'));
      }

      return res.json();
    },
    onSuccess: async (data) => {
      setFaviconFile(null);

      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });


      await refreshBranding();


      setBrandingUpdateKey(prev => prev + 1);


      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('brandingUpdated', {
          detail: { faviconUrl: data.faviconUrl }
        }));
      }, 100);

      toast({
        title: t('admin.settings.favicon_uploaded', 'Favicon uploaded'),
        description: t('admin.settings.favicon_uploaded_desc', 'The favicon has been uploaded successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_uploading_favicon', 'Error uploading favicon'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const deleteLogoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/admin/settings/branding/logo');
      if (!res.ok) throw new Error(t('admin.settings.failed_delete_logo', 'Failed to delete logo'));
      return res.json();
    },
    onSuccess: async () => {
      setLogoPreview(null);
      setLogoFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
      await refreshBranding();
      setBrandingUpdateKey(prev => prev + 1);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('brandingUpdated', {
          detail: { logoUrl: null }
        }));
      }, 100);
      toast({
        title: t('admin.settings.logo_deleted', 'Logo deleted'),
        description: t('admin.settings.logo_deleted_desc', 'The logo has been deleted successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_deleting_logo', 'Error deleting logo'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const deleteFaviconMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/admin/settings/branding/favicon');
      if (!res.ok) throw new Error(t('admin.settings.failed_delete_favicon', 'Failed to delete favicon'));
      return res.json();
    },
    onSuccess: async () => {
      setFaviconPreview(null);
      setFaviconFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
      await refreshBranding();
      setBrandingUpdateKey(prev => prev + 1);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('brandingUpdated', {
          detail: { faviconUrl: null }
        }));
      }, 100);
      toast({
        title: t('admin.settings.favicon_deleted', 'Favicon deleted'),
        description: t('admin.settings.favicon_deleted_desc', 'The favicon has been deleted successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_deleting_favicon', 'Error deleting favicon'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const uploadAdminAuthBgMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('adminAuthBackground', file);

      const res = await fetch('/api/admin/settings/branding/admin-auth-background', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to upload admin auth background');
      }

      return res.json();
    },
    onSuccess: async (data) => {
      setAdminAuthBgFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
      await refreshBranding();

      toast({
        title: 'Admin auth background uploaded',
        description: 'The admin authentication background has been uploaded successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error uploading admin auth background',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const uploadUserAuthBgMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('userAuthBackground', file);

      const res = await fetch('/api/admin/settings/branding/user-auth-background', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to upload user auth background');
      }

      return res.json();
    },
    onSuccess: async (data) => {
      setUserAuthBgFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
      await refreshBranding();

      toast({
        title: 'User auth background uploaded',
        description: 'The user authentication background has been uploaded successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error uploading user auth background',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const deleteAdminAuthBgMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/admin/settings/branding/admin-auth-background');
      if (!res.ok) throw new Error('Failed to delete admin auth background');
      return res.json();
    },
    onSuccess: async () => {
      setAdminAuthBgPreview(null);
      setAdminAuthBgFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
      await refreshBranding();
      toast({ title: 'Admin auth background deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const deleteUserAuthBgMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/admin/settings/branding/user-auth-background');
      if (!res.ok) throw new Error('Failed to delete user auth background');
      return res.json();
    },
    onSuccess: async () => {
      setUserAuthBgPreview(null);
      setUserAuthBgFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });
      await refreshBranding();
      toast({ title: 'User auth background deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const saveBrandingMutation = useMutation({
    mutationFn: async () => {
      if (!brandingForm.appName) {
        throw new Error(t('admin.settings.app_name_required', 'Application name is required'));
      }

      const res = await apiRequest('POST', '/api/admin/settings/branding', brandingForm);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || t('admin.settings.failed_save_branding', 'Failed to save branding settings'));
      }
      return res.json();
    },
    onSuccess: async (data) => {

      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/branding'] });


      await refreshBranding();


      setBrandingUpdateKey(prev => prev + 1);


      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('brandingUpdated', {
          detail: data.settings
        }));
      }, 100);

      toast({
        title: t('admin.settings.branding_saved', 'Branding settings saved'),
        description: t('admin.settings.branding_saved_desc', 'The branding settings have been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_saving_branding', 'Error saving branding settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveStripeMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...stripeForm,
        secretKey: stripeForm.secretKey === '••••••••' ? undefined : stripeForm.secretKey
      };

      const res = await apiRequest('POST', '/api/admin/settings/payment/stripe', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_save_stripe', 'Failed to save Stripe settings'));
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: t('admin.settings.stripe_saved', 'Stripe settings saved'),
        description: t('admin.settings.stripe_saved_desc', 'The Stripe settings have been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_saving_stripe', 'Error saving Stripe settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const savePaystackMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...paystackForm,
        secretKey: paystackForm.secretKey === '••••••••' ? undefined : paystackForm.secretKey
      };

      const res = await apiRequest('POST', '/api/admin/settings/payment/paystack', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Paystack settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Paystack settings saved',
        description: 'The Paystack settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Paystack settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testPaystackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/paystack/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test Paystack connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Paystack connection successful',
        description: data.testMode ? 'Connected in test mode' : 'Connected in live mode'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error connecting to Paystack',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testStripeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/stripe/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_test_stripe', 'Failed to test Stripe connection'));
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('admin.settings.stripe_connection_successful', 'Stripe connection successful'),
        description: t('admin.settings.connected_to_stripe_account', 'Connected to Stripe account: {{email}}', { email: data.account.email })
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_connecting_stripe', 'Error connecting to Stripe'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveMercadoPagoMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...mercadoPagoForm,
        clientSecret: mercadoPagoForm.clientSecret === '••••••••' ? undefined : mercadoPagoForm.clientSecret,
        accessToken: mercadoPagoForm.accessToken === '••••••••' ? undefined : mercadoPagoForm.accessToken
      };

      const res = await apiRequest('POST', '/api/admin/settings/payment/mercadopago', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Mercado Pago settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Mercado Pago settings saved',
        description: 'The Mercado Pago settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Mercado Pago settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testMercadoPagoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/mercadopago/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test Mercado Pago connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Mercado Pago connection successful',
        description: `Connected to Mercado Pago account: ${data.account.email || data.account.nickname}`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error connecting to Mercado Pago',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const savePaypalMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...paypalForm,
        clientSecret: paypalForm.clientSecret === '••••••••' ? undefined : paypalForm.clientSecret
      };

      const res = await apiRequest('POST', '/api/admin/settings/payment/paypal', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save PayPal settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'PayPal settings saved',
        description: 'The PayPal settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving PayPal settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testPaypalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/paypal/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test PayPal connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'PayPal connection successful',
        description: `Connected to PayPal ${data.account.environment} environment`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error connecting to PayPal',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveMoyasarMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...moyasarForm,
        secretKey: moyasarForm.secretKey === '••••••••' ? undefined : moyasarForm.secretKey
      };
      const res = await apiRequest('POST', '/api/admin/settings/payment/moyasar', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Moyasar settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Moyasar settings saved',
        description: 'Your Moyasar payment settings have been updated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Moyasar settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testMoyasarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/moyasar/test');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test Moyasar connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Moyasar connection successful',
        description: `Connected to Moyasar API successfully`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error connecting to Moyasar',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveMpesaMutation = useMutation({
    mutationFn: async () => {
      const { _showConsumerSecret, _showPasskey, ...cleanForm } = mpesaForm as any;
      const payload = {
        ...cleanForm
      };
      const res = await apiRequest('POST', '/api/admin/settings/payment/mpesa', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save MPESA settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'MPESA settings saved',
        description: 'Your MPESA payment settings have been updated successfully'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to save MPESA settings',
        description: error.message || 'An error occurred while saving MPESA settings',
        variant: 'destructive'
      });
    }
  });

  const testMpesaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/mpesa/test', {
        consumerKey: mpesaForm.consumerKey,
        consumerSecret: mpesaForm.consumerSecret === '••••••••' ? undefined : mpesaForm.consumerSecret,
        businessShortcode: mpesaForm.businessShortcode,
        testMode: mpesaForm.testMode
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to test MPESA connection');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'MPESA connection successful',
        description: `Connected to MPESA API successfully`
      });
    },
    onError: (error: any) => {
      toast({
        title: 'MPESA connection failed',
        description: error.message || 'Failed to connect to MPESA API',
        variant: 'destructive'
      });
    }
  });

  const saveBankTransferMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/payment/bank-transfer', bankTransferForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save bank transfer settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'Bank transfer settings saved',
        description: 'The bank transfer settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving bank transfer settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleAddCustomCurrency = () => {
    const code = customCurrencyForm.code.trim().toUpperCase();
    const name = customCurrencyForm.name.trim();
    const symbol = customCurrencyForm.symbol.trim();


    if (!code || !name || !symbol) {
      toast({
        title: 'Validation error',
        description: 'All fields are required',
        variant: 'destructive'
      });
      return;
    }

    if (!/^[A-Z]{3}$/.test(code)) {
      toast({
        title: 'Validation error',
        description: 'Currency code must be exactly 3 uppercase letters (ISO 4217 format)',
        variant: 'destructive'
      });
      return;
    }


    if (generalSettingsForm.customCurrencies.some(c => c.code === code)) {
      toast({
        title: 'Validation error',
        description: 'This currency code already exists in custom currencies',
        variant: 'destructive'
      });
      return;
    }


    if (BUILT_IN_CURRENCY_CODES.includes(code)) {
      toast({
        title: 'Validation error',
        description: 'This currency code already exists in default currencies',
        variant: 'destructive'
      });
      return;
    }


    try {
      new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(1);
    } catch (error) {
      toast({
        title: 'Validation error',
        description: `Currency code ${code} is not supported by the browser's Intl API. Please use a valid ISO 4217 currency code.`,
        variant: 'destructive'
      });
      return;
    }


    setGeneralSettingsForm({
      ...generalSettingsForm,
      customCurrencies: [...generalSettingsForm.customCurrencies, { code, name, symbol }]
    });


    setCustomCurrencyForm({ code: '', name: '', symbol: '' });
    setShowCustomCurrencyDialog(false);

    toast({
      title: 'Custom currency added',
      description: `${code} - ${name} has been added successfully.`
    });
  };

  const handleRemoveCustomCurrency = (code: string) => {

    const needsDefaultCurrencyUpdate = generalSettingsForm.defaultCurrency === code;
    

    const updatedForm = {
      ...generalSettingsForm,
      customCurrencies: generalSettingsForm.customCurrencies.filter(c => c.code !== code),
      ...(needsDefaultCurrencyUpdate && { defaultCurrency: 'USD' })
    };

    setGeneralSettingsForm(updatedForm);

    toast({
      title: 'Custom currency removed',
      description: needsDefaultCurrencyUpdate 
        ? `Currency ${code} has been removed. Default currency has been switched to USD.`
        : `Currency ${code} has been removed.`
    });
  };

  const saveGeneralSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/general', generalSettingsForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save general settings');
      }
      return res.json();
    },
    onSuccess: () => {
      setPersistedGeneralSettings(generalSettingsForm);

      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['website-enabled'] });
      

      queryClient.removeQueries({ queryKey: ['website-enabled'] });
      

      settingsEvents.emit(SETTINGS_EVENTS.FRONTEND_WEBSITE_TOGGLED, {
        enabled: generalSettingsForm.frontendWebsiteEnabled
      });
      
      toast({
        title: 'General settings saved',
        description: 'The general settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      console.error('Error saving general settings:', error);
      toast({
        title: 'Error saving general settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveFrontendWebsitePublishStateMutation = useMutation({
    mutationFn: async (payload: typeof generalSettingsForm) => {
      const res = await apiRequest('POST', '/api/admin/settings/general', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save publish state');
      }
      return res.json();
    },
    onSuccess: (_data, payload) => {
      setPersistedGeneralSettings(payload);

      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      queryClient.invalidateQueries({ queryKey: ['website-enabled'] });
      queryClient.removeQueries({ queryKey: ['website-enabled'] });

      settingsEvents.emit(SETTINGS_EVENTS.FRONTEND_WEBSITE_TOGGLED, {
        enabled: payload.frontendWebsiteEnabled,
      });

      toast({
        title: 'Publish state saved',
        description: 'The public website publish state has been saved successfully.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving publish state',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSaveFrontendWebsitePublishState = () => {
    saveFrontendWebsitePublishStateMutation.mutate({
      ...persistedGeneralSettings,
      frontendWebsiteEnabled: generalSettingsForm.frontendWebsiteEnabled,
    });
  };

  const saveSmtpMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...smtpForm,

        password: smtpForm.password || storedSmtpPassword
      };

      const res = await apiRequest('POST', '/api/admin/settings/smtp', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save SMTP settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: 'SMTP settings saved',
        description: 'The SMTP settings have been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving SMTP settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const testSmtpMutation = useMutation({
    mutationFn: async () => {
      if (!smtpForm.testEmail) {
        throw new Error(t('admin.settings.test_email_required', 'Test email address is required'));
      }

      const payload: Record<string, unknown> = {
        testEmail: smtpForm.testEmail,
        host: smtpForm.host,
        port: smtpForm.port,
        security: smtpForm.security,
        username: smtpForm.username,
        fromName: smtpForm.fromName,
        fromEmail: smtpForm.fromEmail,
      };
      if (smtpForm.password) {
        payload.password = smtpForm.password;
      }

      const res = await apiRequest('POST', '/api/admin/settings/smtp/test', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || t('admin.settings.failed_test_smtp', 'Failed to test SMTP connection'));
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: t('admin.settings.smtp_connection_successful', 'SMTP connection successful'),
        description: data.message || t('admin.settings.smtp_test_passed', 'SMTP connection test passed')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_testing_smtp', 'Error testing SMTP connection'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveRegistrationMutation = useMutation({
    mutationFn: async () => {
      try {
        const payload = {
          enabled: Boolean(registrationSettings.enabled),
          requireApproval: Boolean(registrationSettings.requireApproval),
          requireEmailVerification: Boolean(registrationSettings.requireEmailVerification),
          defaultPlan: registrationSettings.defaultPlan || (plans && plans.length > 0 ? plans[0].id.toString() : '1')
        };

        if (payload.enabled && !payload.defaultPlan) {
          throw new Error(t('admin.settings.default_plan_required', 'Default plan is required when registration is enabled'));
        }

        const res = await apiRequest('POST', '/api/admin/settings/registration', payload);

        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || t('admin.settings.failed_save_registration', 'Failed to save registration settings'));
        }

        const result = await res.json();
        return result;
      } catch (error) {
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: t('admin.settings.registration_saved', 'Registration settings saved'),
        description: t('admin.settings.registration_saved_desc', 'The registration settings have been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.error_saving_registration', 'Error saving registration settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });





  const saveGoogleCalendarOAuthMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...googleCalendarOAuthForm,
        client_secret: googleCalendarOAuthForm.client_secret === ADMIN_OAUTH_CLIENT_SECRET_MASK ? undefined : googleCalendarOAuthForm.client_secret
      };
      const res = await apiRequest('POST', '/api/admin/settings/integrations/google-calendar', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Google Calendar OAuth settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings/integrations/google-calendar'] });
      toast({
        title: 'Google Calendar OAuth settings saved',
        description: 'Google Calendar OAuth configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Google Calendar OAuth settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveZohoCalendarOAuthMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...zohoCalendarOAuthForm,
        client_secret: zohoCalendarOAuthForm.client_secret === '••••••••' ? undefined : zohoCalendarOAuthForm.client_secret
      };
      const res = await apiRequest('POST', '/api/admin/settings/integrations/zoho-calendar', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Zoho Calendar OAuth settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings/integrations/zoho-calendar'] });
      toast({
        title: 'Zoho Calendar OAuth settings saved',
        description: 'Zoho Calendar OAuth configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Zoho Calendar OAuth settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveCalendlyOAuthMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...calendlyOAuthForm,
        client_secret: calendlyOAuthForm.client_secret === '••••••••' ? undefined : calendlyOAuthForm.client_secret,
        webhook_signing_key: calendlyOAuthForm.webhook_signing_key === '••••••••' ? undefined : calendlyOAuthForm.webhook_signing_key
      };
      const res = await apiRequest('POST', '/api/admin/settings/integrations/calendly', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Calendly OAuth settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings/integrations/calendly'] });
      toast({
        title: 'Calendly OAuth settings saved',
        description: 'Calendly OAuth configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Calendly OAuth settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });


  const saveGoogleSheetsOAuthMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...googleSheetsOAuthForm,
        client_secret: googleSheetsOAuthForm.client_secret === ADMIN_OAUTH_CLIENT_SECRET_MASK ? undefined : googleSheetsOAuthForm.client_secret
      };
      const res = await apiRequest('POST', '/api/admin/settings/integrations/google-sheets', payload);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Google Sheets OAuth settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings/integrations/google-sheets'] });
      toast({
        title: 'Google Sheets OAuth settings saved',
        description: 'Google Sheets OAuth configuration has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Google Sheets OAuth settings',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveGoogleMapsApiKeyMutation = useMutation({
    mutationFn: async () => {
      if (!googleMapsApiKey.trim()) {
        throw new Error('API key is required');
      }
      const res = await apiRequest('POST', '/api/company-settings/google-maps', {
        apiKey: googleMapsApiKey.trim()
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save Google Maps API key');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings/google-maps'] });
      setGoogleMapsApiKey('');
      toast({
        title: 'Google Maps API key saved',
        description: 'Google Maps API key has been saved successfully.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error saving Google Maps API key',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveCustomScriptsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/custom-scripts', customScriptsForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save custom scripts settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: t('admin.settings.custom_scripts_page.saved_title', 'Custom scripts settings saved'),
        description: t('admin.settings.custom_scripts_page.saved_description', 'Custom scripts configuration has been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.custom_scripts_page.error_title', 'Error saving custom scripts settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveCustomCssMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/admin/settings/custom-css', customCssForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save custom CSS settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      toast({
        title: t('admin.settings.custom_css_page.saved_title', 'Custom CSS settings saved'),
        description: t('admin.settings.custom_css_page.saved_description', 'Custom CSS configuration has been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.custom_css_page.error_title', 'Error saving custom CSS settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveWelcomeEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PUT', '/api/admin/settings/welcome-email', welcomeEmailForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save welcome email template');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/settings/welcome-email'] });
      toast({
        title: t('admin.settings.welcome_email.saved_title', 'Welcome email template saved'),
        description: t('admin.settings.welcome_email.saved_description', 'The welcome email template has been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('admin.settings.welcome_email.error_title', 'Error saving welcome email template'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const getIframeProps = () => {
    const currentUrl = window.location.origin;
    const width = embedSettings.width || '100%';
    const height = embedSettings.height || '600px';

    const brandingSetting = settings?.find((s: any) => s.key === 'branding');
    const appTitle = brandingForm.appName || brandingSetting?.value?.appName || 'BotHive Application';

    const styles: React.CSSProperties = {
      border: 'none',
    };
    if (embedSettings.borderRadius) {
      styles.borderRadius = embedSettings.borderRadius;
    }
    if (embedSettings.boxShadow) {
      styles.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
    }

    const embedUrl = new URL(currentUrl);
    embedUrl.searchParams.set('embed', 'true');
    if (!embedSettings.showHeader) {
      embedUrl.searchParams.set('hideHeader', 'true');
    }

    return {
      src: embedUrl.toString(),
      width: width,
      height: height,
      frameBorder: 0,
      allow: `camera; microphone; geolocation; encrypted-media${embedSettings.allowFullscreen ? '; fullscreen' : ''}`,
      allowFullScreen: embedSettings.allowFullscreen || false,
      sandbox: 'allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation',
      loading: 'lazy' as const,
      title: `${appTitle} - Embedded Application`,
      style: styles,
    };
  };

  const generateEmbedCode = () => {
    const currentUrl = window.location.origin;
    const width = embedSettings.width || '100%';
    const height = embedSettings.height || '600px';

    const brandingSetting = settings?.find((s: any) => s.key === 'branding');
    const appTitle = brandingForm.appName || brandingSetting?.value?.appName || 'BotHive Application';


    const styles = [];
    styles.push('border: none');
    if (embedSettings.borderRadius) {
      styles.push(`border-radius: ${embedSettings.borderRadius}`);
    }
    if (embedSettings.boxShadow) {
      styles.push('box-shadow: 0 4px 12px rgba(0,0,0,0.1)');
    }


    const embedUrl = new URL(currentUrl);
    embedUrl.searchParams.set('embed', 'true');
    if (!embedSettings.showHeader) {
      embedUrl.searchParams.set('hideHeader', 'true');
    }

    const code = `<iframe
  src="${embedUrl.toString()}"
  width="${width}"
  height="${height}"
  frameborder="0"
  allow="camera; microphone; geolocation; encrypted-media${embedSettings.allowFullscreen ? '; fullscreen' : ''}"
  ${embedSettings.allowFullscreen ? 'allowfullscreen' : ''}
  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-top-navigation-by-user-activation"
  loading="lazy"
  title="${appTitle} - Embedded Application"
  style="${styles.join('; ')};">
  <p>Your browser does not support iframes. Please visit <a href="${currentUrl}" target="_blank">${appTitle}</a> directly.</p>
</iframe>`;

    setEmbedCode(code);
  };

  const copyEmbedCode = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopySuccess(true);
      toast({
        title: t('admin.settings.embed_code_copied', 'Embed code copied'),
        description: t('admin.settings.embed_code_copied_desc', 'The embed code has been copied to your clipboard.'),
        variant: 'default'
      });


      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      toast({
        title: t('admin.settings.copy_failed', 'Copy failed'),
        description: t('admin.settings.copy_failed_desc', 'Failed to copy embed code to clipboard. Please copy manually.'),
        variant: 'destructive'
      });
    }
  };

  if (isLoadingSettings) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-3 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 gap-4">
          <div>
            <h1 className="text-2xl">{t('admin.settings.title', 'Settings')}</h1>
            <p className="text-muted-foreground text-sm sm:text-base mt-1">
              {t('admin.settings.description', 'Configure system settings, payment gateways, and application preferences')}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="mb-6">
            <TabsList>
              <TabsTrigger value="branding">
                <Palette className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.branding', 'Branding')}</span>
                <span className="md:hidden">{t('admin.settings.tab_short.branding', 'Brand')}</span>
              </TabsTrigger>

              <TabsTrigger value="integrations">
                <Settings className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.integrations', 'Other Integrations')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.integrations', 'Integrations')}</span>
              </TabsTrigger>
              {isAppSumoOrigin(window.location.origin) && <TabsTrigger icon={TabIconGift} value="appsumo">AppSumo</TabsTrigger>}
              <TabsTrigger value="payment">
                <CreditCard className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.payment_gateways', 'Payment Gateways')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.payment', 'Payment')}</span>
              </TabsTrigger>
              <TabsTrigger value="email">
                <Mail className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.email', 'Email Settings')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.email', 'Email')}</span>
              </TabsTrigger>
              <TabsTrigger value="welcome-email">
                <Mail className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.tab.welcome_email', 'Welcome Email')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.welcome_email', 'Welcome')}</span>
              </TabsTrigger>
              <TabsTrigger value="general">
                <Globe className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.general', 'General')}</span>
                <span className="md:hidden">{t('admin.settings.tab_short.general', 'General')}</span>
              </TabsTrigger>
              <TabsTrigger value="platform">
                <Settings className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.partnerapi', 'Partner API')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.partner', 'Partner')}</span>
              </TabsTrigger>
              <TabsTrigger value="registration">
                <UserPlus className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.registration', 'Registration')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.registration', 'Register')}</span>
              </TabsTrigger>
              <TabsTrigger value="backup">
                <Database className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.backup', 'Database Backup')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.backup', 'Backup')}</span>
              </TabsTrigger>
              {/* <TabsTrigger value="updates" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2">
                <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.updates', 'System Updates')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.updates', 'Updates')}</span>
              </TabsTrigger> */}
              <TabsTrigger value="ai-credentials">
                <Key className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.ai_credentials', 'AI Credentials')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.ai_credentials', 'AI Keys')}</span>
              </TabsTrigger>
              <TabsTrigger value="ai-usage">
                <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.ai_usage', 'AI Usage')}</span>
                <span className="md:hidden">{t('admin.settings.tab_short.ai_usage', 'Usage')}</span>
              </TabsTrigger>
              <TabsTrigger value="frontend-website">
                <LayoutTemplate className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden lg:inline">{t('admin.settings.frontend_website_tab', 'Frontend Website')}</span>
                <span className="lg:hidden">{t('admin.settings.tab_short.frontend_website', 'Website')}</span>
              </TabsTrigger>
              <TabsTrigger value="custom-scripts">
                <Code className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.custom_scripts', 'Custom Scripts')}</span>
                <span className="md:hidden">{t('admin.settings.tab_short.custom_scripts', 'Scripts')}</span>
              </TabsTrigger>
              <TabsTrigger value="custom-css">
                <Paintbrush className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                <span className="hidden md:inline">{t('admin.settings.custom_css', 'Custom CSS')}</span>
                <span className="md:hidden">{t('admin.settings.tab_short.custom_css', 'CSS')}</span>
              </TabsTrigger>

            </TabsList>
          </div>


          <TabsContent value="branding">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.branding', 'Application Branding')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.branding_description', 'Customize the appearance of your application')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="appName">{t('admin.settings.app_name', 'Application Name')}</Label>
                    <Input
                      id="appName"
                      value={brandingForm.appName}
                      onChange={(e) => setBrandingForm({...brandingForm, appName: e.target.value})}
                      placeholder=""
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="defaultTheme">{t('admin.settings.default_theme', 'Default Theme')}</Label>
                    <Select
                      value={brandingForm.defaultTheme || 'none'}
                      onValueChange={(value) => setBrandingForm({...brandingForm, defaultTheme: value === 'none' ? '' : value as 'dark' | 'light' | ''})}
                    >
                      <SelectTrigger id="defaultTheme">
                        <SelectValue placeholder={t('admin.settings.select_theme', 'Select default theme')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('admin.settings.theme_none', 'None (System Default)')}</SelectItem>
                        <SelectItem value="light">{t('admin.settings.theme_light', 'Light')}</SelectItem>
                        <SelectItem value="dark">{t('admin.settings.theme_dark', 'Dark')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor" className="text-sm">{t('admin.settings.primary_color', 'Primary Color')}</Label>
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-6 h-6 rounded-full border cursor-pointer flex-shrink-0"
                          style={{ backgroundColor: brandingForm.primaryColor }}
                          onClick={() => {
                            const colorInput = document.getElementById('primaryColor') as HTMLInputElement;
                            if (colorInput) colorInput.click();
                          }}
                        />
                        <Input
                          id="primaryColor"
                          type="color"
                          value={brandingForm.primaryColor}
                          onChange={(e) => setBrandingForm({...brandingForm, primaryColor: e.target.value})}
                          className="w-12 sm:w-16 h-8 sm:h-10 p-1 border border-border rounded cursor-pointer flex-shrink-0"
                        />
                        <Input
                          type="text"
                          value={brandingForm.primaryColor}
                          onChange={(e) => setBrandingForm({...brandingForm, primaryColor: e.target.value})}
                          placeholder="#333235"
                          className="flex-1 min-w-0"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor" className="text-sm">{t('admin.settings.secondary_color', 'Secondary Color')}</Label>
                      <div className="flex items-center space-x-2">
                        <div
                          className="w-6 h-6 rounded-full border cursor-pointer flex-shrink-0"
                          style={{ backgroundColor: brandingForm.secondaryColor }}
                          onClick={() => {
                            const colorInput = document.getElementById('secondaryColor') as HTMLInputElement;
                            if (colorInput) colorInput.click();
                          }}
                        />
                        <Input
                          id="secondaryColor"
                          type="color"
                          value={brandingForm.secondaryColor}
                          onChange={(e) => setBrandingForm({...brandingForm, secondaryColor: e.target.value})}
                          className="w-12 sm:w-16 h-8 sm:h-10 p-1 border border-border rounded cursor-pointer flex-shrink-0"
                        />
                        <Input
                          type="text"
                          value={brandingForm.secondaryColor}
                          onChange={(e) => setBrandingForm({...brandingForm, secondaryColor: e.target.value})}
                          placeholder="#4F46E5"
                          className="flex-1 min-w-0"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <Label className="text-sm">{t('admin.settings.interface_gradient_colors', 'Interface Gradient Colors')}</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('admin.settings.interface_gradient_colors_description', 'These colors are used for the dark admin header, sidebar, cards, buttons, tabs, and modals.')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="uiGradientPreset" className="text-sm">{t('admin.settings.gradient_template', 'Gradient Template')}</Label>
                      <Select
                        value={brandingForm.uiGradientPreset}
                        onValueChange={(value) => {
                          if (value === 'custom') {
                            setBrandingForm(prev => ({ ...prev, uiGradientPreset: 'custom' }));
                            return;
                          }

                          applyGradientTemplate(value as UiGradientTemplateKey);
                        }}
                      >
                        <SelectTrigger id="uiGradientPreset">
                          <SelectValue placeholder={t('admin.settings.select_gradient_template', 'Select a gradient template')} />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(UI_GRADIENT_TEMPLATES).map(([key, template]) => (
                            <SelectItem key={key} value={key}>
                              {t(
                                `admin.settings.gradient_template.preset.${key.replace(/-/g, '_')}`,
                                template.label
                              )}
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value="custom">{t('admin.settings.gradient_template_custom', 'Custom')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="uiGradientStart" className="text-sm">{t('admin.settings.gradient_start', 'Gradient Start')}</Label>
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-6 h-6 rounded-full border cursor-pointer flex-shrink-0"
                            style={{ backgroundColor: brandingForm.uiGradientStart }}
                            onClick={() => {
                              const colorInput = document.getElementById('uiGradientStart') as HTMLInputElement;
                              if (colorInput) colorInput.click();
                            }}
                          />
                          <Input
                            id="uiGradientStart"
                            type="color"
                            value={brandingForm.uiGradientStart}
                            onChange={(e) => updateBrandingGradientColor('uiGradientStart', e.target.value)}
                            className="w-12 sm:w-16 h-8 sm:h-10 p-1 border border-border rounded cursor-pointer flex-shrink-0"
                          />
                          <Input
                            type="text"
                            value={brandingForm.uiGradientStart}
                            onChange={(e) => updateBrandingGradientColor('uiGradientStart', e.target.value)}
                            placeholder="#070b18"
                            className="flex-1 min-w-0"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="uiGradientMiddle" className="text-sm">{t('admin.settings.gradient_middle', 'Gradient Middle')}</Label>
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-6 h-6 rounded-full border cursor-pointer flex-shrink-0"
                            style={{ backgroundColor: brandingForm.uiGradientMiddle }}
                            onClick={() => {
                              const colorInput = document.getElementById('uiGradientMiddle') as HTMLInputElement;
                              if (colorInput) colorInput.click();
                            }}
                          />
                          <Input
                            id="uiGradientMiddle"
                            type="color"
                            value={brandingForm.uiGradientMiddle}
                            onChange={(e) => updateBrandingGradientColor('uiGradientMiddle', e.target.value)}
                            className="w-12 sm:w-16 h-8 sm:h-10 p-1 border border-border rounded cursor-pointer flex-shrink-0"
                          />
                          <Input
                            type="text"
                            value={brandingForm.uiGradientMiddle}
                            onChange={(e) => updateBrandingGradientColor('uiGradientMiddle', e.target.value)}
                            placeholder="#0f172a"
                            className="flex-1 min-w-0"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="uiGradientEnd" className="text-sm">{t('admin.settings.gradient_end', 'Gradient End')}</Label>
                        <div className="flex items-center space-x-2">
                          <div
                            className="w-6 h-6 rounded-full border cursor-pointer flex-shrink-0"
                            style={{ backgroundColor: brandingForm.uiGradientEnd }}
                            onClick={() => {
                              const colorInput = document.getElementById('uiGradientEnd') as HTMLInputElement;
                              if (colorInput) colorInput.click();
                            }}
                          />
                          <Input
                            id="uiGradientEnd"
                            type="color"
                            value={brandingForm.uiGradientEnd}
                            onChange={(e) => updateBrandingGradientColor('uiGradientEnd', e.target.value)}
                            className="w-12 sm:w-16 h-8 sm:h-10 p-1 border border-border rounded cursor-pointer flex-shrink-0"
                          />
                          <Input
                            type="text"
                            value={brandingForm.uiGradientEnd}
                            onChange={(e) => updateBrandingGradientColor('uiGradientEnd', e.target.value)}
                            placeholder="#1d4ed8"
                            className="flex-1 min-w-0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button
                    variant="brand"
                    onClick={() => saveBrandingMutation.mutate()}
                    disabled={saveBrandingMutation.isPending}
                    className="btn-brand-primary"
                  >
                    {saveBrandingMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('admin.settings.save_branding', 'Save Branding Settings')}
                  </Button>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('admin.settings.logo', 'Logo')}</CardTitle>
                    <CardDescription>
                      {t('admin.settings.logo_description', 'Upload your company logo (recommended size: 200x50px)')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {logoPreview && (
                      <div className="relative border border-border rounded-md p-4 flex items-center justify-center bg-muted/50">
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute right-2 top-2 h-6 w-6 text-white"
                          onClick={() => deleteLogoMutation.mutate()}
                          disabled={deleteLogoMutation.isPending}
                          aria-label={t('admin.settings.delete_logo', 'Delete logo')}
                        >
                          {deleteLogoMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <img
                          src={logoPreview}
                          alt={t('admin.settings.logo_preview_alt', 'Logo Preview')}
                          className="max-h-16 max-w-full object-contain"
                        />
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Input
                        id="logo"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        disabled={uploadLogoMutation.isPending}
                        className="hidden"
                      />
                      <Label
                        htmlFor="logo"
                        className={`cursor-pointer flex items-center justify-center border border-border rounded-md px-4 py-2 hover:bg-muted ${uploadLogoMutation.isPending ? 'pointer-events-none opacity-60' : ''}`}
                      >
                        {uploadLogoMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {uploadLogoMutation.isPending
                          ? t('admin.settings.uploading', 'Uploading...')
                          : t('admin.settings.choose_logo', 'Choose Logo')}
                      </Label>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('admin.settings.favicon', 'Favicon')}</CardTitle>
                    <CardDescription>
                      {t('admin.settings.favicon_description', 'Upload your favicon (recommended size: 32x32px)')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {faviconPreview && (
                      <div className="relative border border-border rounded-md p-4 flex items-center justify-center bg-muted/50">
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute right-2 top-2 h-6 w-6 text-white"
                          onClick={() => deleteFaviconMutation.mutate()}
                          disabled={deleteFaviconMutation.isPending}
                          aria-label={t('admin.settings.delete_favicon', 'Delete favicon')}
                        >
                          {deleteFaviconMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <X className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <img
                          src={faviconPreview}
                          alt="Favicon Preview"
                          className="max-h-8 max-w-full object-contain"
                        />
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <Input
                        id="favicon"
                        type="file"
                        accept="image/*"
                        onChange={handleFaviconChange}
                        disabled={uploadFaviconMutation.isPending}
                        className="hidden"
                      />
                      <Label
                        htmlFor="favicon"
                        className={`cursor-pointer flex items-center justify-center border border-border rounded-md px-4 py-2 hover:bg-muted ${uploadFaviconMutation.isPending ? 'pointer-events-none opacity-60' : ''}`}
                      >
                        {uploadFaviconMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <FileImage className="h-4 w-4 mr-2" />
                        )}
                        {uploadFaviconMutation.isPending
                          ? t('admin.settings.uploading', 'Uploading...')
                          : t('admin.settings.choose_favicon', 'Choose Favicon')}
                      </Label>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Auth Backgrounds Section */}
              <div className="col-span-1 lg:col-span-2 mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('admin.settings.auth_backgrounds.title', 'Authentication Page Backgrounds')}</CardTitle>
                    <CardDescription>
                      {t(
                        'admin.settings.auth_backgrounds.description',
                        'Keep admin and user login backgrounds organized in compact panels.'
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Accordion type="single" collapsible defaultValue="admin-auth" className="rounded-lg border border-border/60 px-4">
                      <AccordionItem value="admin-auth" className="border-border/60">
                        <AccordionTrigger className="py-4 hover:no-underline">
                          <div className="flex flex-1 items-center justify-between gap-4 pr-4 text-left">
                            <div>
                              <div className="font-medium">
                                {t('admin.settings.auth_backgrounds.admin.label', 'Admin Auth Background')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t('admin.settings.auth_backgrounds.admin.hint', 'Customize `/admin/login`')}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {adminAuthBgPreview
                                ? t('admin.settings.auth_backgrounds.status_attached', 'Image attached')
                                : t('admin.settings.auth_backgrounds.status_none', 'No image')}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="space-y-3">
                            <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                              {adminAuthBgPreview ? (
                                <img
                                  src={adminAuthBgPreview}
                                  alt={t('admin.settings.auth_backgrounds.admin.alt', 'Admin auth background')}
                                  className="h-40 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                                  {t('admin.settings.auth_backgrounds.no_preview', 'No preview uploaded')}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Input
                                id="admin-auth-bg"
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                                onChange={handleAdminAuthBgChange}
                                disabled={uploadAdminAuthBgMutation.isPending}
                                className="hidden"
                              />
                              <Label htmlFor="admin-auth-bg" className={`cursor-pointer flex items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-muted ${uploadAdminAuthBgMutation.isPending ? 'pointer-events-none opacity-60' : ''}`}>
                                {uploadAdminAuthBgMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="mr-2 h-4 w-4" />
                                )}
                                {uploadAdminAuthBgMutation.isPending
                                  ? t('admin.settings.uploading', 'Uploading...')
                                  : t('admin.settings.auth_backgrounds.choose_image', 'Choose Image')}
                              </Label>
                              {adminAuthBgPreview && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteAdminAuthBgMutation.mutate()}
                                  disabled={deleteAdminAuthBgMutation.isPending}
                                >
                                  {deleteAdminAuthBgMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>

                      <AccordionItem value="user-auth" className="border-b-0 border-border/60">
                        <AccordionTrigger className="py-4 hover:no-underline">
                          <div className="flex flex-1 items-center justify-between gap-4 pr-4 text-left">
                            <div>
                              <div className="font-medium">
                                {t('admin.settings.auth_backgrounds.user.label', 'User Auth Background')}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {t('admin.settings.auth_backgrounds.user.hint', 'Customize `/login`')}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {userAuthBgPreview
                                ? t('admin.settings.auth_backgrounds.status_attached', 'Image attached')
                                : t('admin.settings.auth_backgrounds.status_none', 'No image')}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4">
                          <div className="space-y-3">
                            <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/30">
                              {userAuthBgPreview ? (
                                <img
                                  src={userAuthBgPreview}
                                  alt={t('admin.settings.auth_backgrounds.user.alt', 'User auth background')}
                                  className="h-40 w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                                  {t('admin.settings.auth_backgrounds.no_preview', 'No preview uploaded')}
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Input
                                id="user-auth-bg"
                                type="file"
                                accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
                                onChange={handleUserAuthBgChange}
                                disabled={uploadUserAuthBgMutation.isPending}
                                className="hidden"
                              />
                              <Label htmlFor="user-auth-bg" className={`cursor-pointer flex items-center justify-center rounded-md border px-3 py-2 text-sm hover:bg-muted ${uploadUserAuthBgMutation.isPending ? 'pointer-events-none opacity-60' : ''}`}>
                                {uploadUserAuthBgMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Upload className="mr-2 h-4 w-4" />
                                )}
                                {uploadUserAuthBgMutation.isPending
                                  ? t('admin.settings.uploading', 'Uploading...')
                                  : t('admin.settings.auth_backgrounds.choose_image', 'Choose Image')}
                              </Label>
                              {userAuthBgPreview && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => deleteUserAuthBgMutation.mutate()}
                                  disabled={deleteUserAuthBgMutation.isPending}
                                >
                                  {deleteUserAuthBgMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>








          <TabsContent value="integrations">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.integrations.google_calendar.title', 'Google Calendar Integration')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.integrations.google_calendar.description', 'Configure Google OAuth for Calendar integration across all companies')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="google-calendar-enabled"
                      checked={googleCalendarOAuthForm.enabled}
                      onCheckedChange={(checked) => setGoogleCalendarOAuthForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="google-calendar-enabled">{t('admin.settings.integrations.google_calendar.enable', 'Enable Google Calendar Integration')}</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-calendar-client-id">{t('admin.settings.integrations.client_id', 'Client ID')}</Label>
                    <Input
                      id="google-calendar-client-id"
                      placeholder={t('admin.settings.integrations.placeholder_google_oauth_client_id', 'Enter Google OAuth Client ID')}
                      value={googleCalendarOAuthForm.client_id}
                      onChange={(e) => setGoogleCalendarOAuthForm(prev => ({ ...prev, client_id: e.target.value }))}
                      disabled={!googleCalendarOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-calendar-client-secret">{t('admin.settings.integrations.client_secret', 'Client Secret')}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="google-calendar-client-secret"
                        type={showGoogleCalendarClientSecret ? 'text' : 'password'}
                        placeholder={t('admin.settings.integrations.placeholder_google_oauth_client_secret', 'Enter Google OAuth Client Secret')}
                        value={googleCalendarOAuthForm.client_secret}
                        onChange={(e) => setGoogleCalendarOAuthForm(prev => ({ ...prev, client_secret: e.target.value }))}
                        disabled={!googleCalendarOAuthForm.enabled}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={!googleCalendarOAuthForm.enabled}
                        onClick={() => setShowGoogleCalendarClientSecret(v => !v)}
                        aria-label={showGoogleCalendarClientSecret
                          ? t('admin.settings.integrations.hide_client_secret', 'Hide client secret')
                          : t('admin.settings.integrations.show_client_secret', 'Show client secret')}
                      >
                        {showGoogleCalendarClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-calendar-redirect-uri">{t('admin.settings.integrations.redirect_uri', 'Redirect URI')}</Label>
                    <Input
                      id="google-calendar-redirect-uri"
                      placeholder={t('admin.settings.integrations.placeholder_redirect_auto', 'Auto-generated redirect URI')}
                      value={googleCalendarOAuthForm.redirect_uri}
                      onChange={(e) => setGoogleCalendarOAuthForm(prev => ({ ...prev, redirect_uri: e.target.value }))}
                      disabled={!googleCalendarOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.settings.integrations.google_calendar.redirect_help', 'This redirect URI must be added to your Google Cloud Console OAuth configuration.')}
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveGoogleCalendarOAuthMutation.mutate()}
                      disabled={saveGoogleCalendarOAuthMutation.isPending || !googleCalendarOAuthForm.enabled}
                      className="w-full"
                    >
                      {saveGoogleCalendarOAuthMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t('admin.settings.integrations.google_calendar.save', 'Save Google Calendar Settings')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.integrations.setup_instructions_title', 'Setup Instructions')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.integrations.google_calendar.setup_description', 'How to configure Google Calendar integration')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.google_calendar.step1_title', '1. Create Google Cloud Project')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.google_calendar.step1_body', 'Go to Google Cloud Console and create a new project or select an existing one.')}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.google_calendar.step2_title', '2. Enable Calendar API')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.google_calendar.step2_body', 'Enable the Google Calendar API in the APIs & Services section.')}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.google_calendar.step3_title', '3. Create OAuth Credentials')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.google_calendar.step3_body', 'Create OAuth 2.0 Client ID credentials and add the redirect URI shown above.')}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="rounded-md border border-border bg-muted/40 p-3">
                      <h4 className="mb-1 text-sm font-medium text-foreground">{t('admin.settings.integrations.multi_tenant_title', 'Multi-Tenant Architecture')}</h4>
                      <p className="text-xs text-muted-foreground">
                        {t('admin.settings.integrations.multi_tenant_google', 'These credentials will be used by all companies on your platform. Individual users will authenticate with their own Google accounts using these application credentials.')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.integrations.zoho_calendar.title', 'Zoho Calendar Integration')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.integrations.zoho_calendar.description', 'Configure Zoho OAuth for Calendar integration across all companies')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="zoho-calendar-enabled"
                      checked={zohoCalendarOAuthForm.enabled}
                      onCheckedChange={(checked) => setZohoCalendarOAuthForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="zoho-calendar-enabled">{t('admin.settings.integrations.zoho_calendar.enable', 'Enable Zoho Calendar Integration')}</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zoho-calendar-client-id">{t('admin.settings.integrations.client_id', 'Client ID')}</Label>
                    <Input
                      id="zoho-calendar-client-id"
                      placeholder={t('admin.settings.integrations.zoho_calendar.placeholder_client_id', 'Enter Zoho OAuth Client ID')}
                      value={zohoCalendarOAuthForm.client_id}
                      onChange={(e) => setZohoCalendarOAuthForm(prev => ({ ...prev, client_id: e.target.value }))}
                      disabled={!zohoCalendarOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zoho-calendar-client-secret">{t('admin.settings.integrations.client_secret', 'Client Secret')}</Label>
                    <Input
                      id="zoho-calendar-client-secret"
                      type="password"
                      placeholder={t('admin.settings.integrations.zoho_calendar.placeholder_client_secret', 'Enter Zoho OAuth Client Secret')}
                      value={zohoCalendarOAuthForm.client_secret}
                      onChange={(e) => setZohoCalendarOAuthForm(prev => ({ ...prev, client_secret: e.target.value }))}
                      disabled={!zohoCalendarOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zoho-calendar-redirect-uri">{t('admin.settings.integrations.redirect_uri', 'Redirect URI')}</Label>
                    <Input
                      id="zoho-calendar-redirect-uri"
                      placeholder={t('admin.settings.integrations.placeholder_redirect_auto', 'Auto-generated redirect URI')}
                      value={zohoCalendarOAuthForm.redirect_uri}
                      onChange={(e) => setZohoCalendarOAuthForm(prev => ({ ...prev, redirect_uri: e.target.value }))}
                      disabled={!zohoCalendarOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.settings.integrations.zoho_calendar.redirect_help', 'This redirect URI must be added to your Zoho Developer Console OAuth configuration.')}
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveZohoCalendarOAuthMutation.mutate()}
                      disabled={saveZohoCalendarOAuthMutation.isPending || !zohoCalendarOAuthForm.enabled}
                      className="w-full"
                    >
                      {saveZohoCalendarOAuthMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t('admin.settings.integrations.zoho_calendar.save', 'Save Zoho Calendar Settings')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.integrations.setup_instructions_title', 'Setup Instructions')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.integrations.zoho_calendar.setup_description', 'How to configure Zoho Calendar integration')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.zoho_calendar.step1_title', '1. Create Zoho Developer Account')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.zoho_calendar.step1_body', 'Go to Zoho Developer Console (https://accounts.zoho.com/developerconsole) and create a new client application.')}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.zoho_calendar.step2_title', '2. Configure OAuth Application')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.zoho_calendar.step2_body', 'Set the application type to "Web-based" and add the redirect URI shown above.')}
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.zoho_calendar.step4_title', '4. Copy Credentials')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.zoho_calendar.step4_body', 'Copy the Client ID and Client Secret from your Zoho application and paste them above.')}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="rounded-md border border-border bg-muted/40 p-3">
                      <h4 className="mb-1 text-sm font-medium text-foreground">{t('admin.settings.integrations.multi_tenant_title', 'Multi-Tenant Architecture')}</h4>
                      <p className="text-xs text-muted-foreground">
                        {t('admin.settings.integrations.multi_tenant_zoho', 'These credentials will be used by all companies on your platform. Individual users will authenticate with their own Zoho accounts using these application credentials.')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.integrations.calendly.title', 'Calendly Integration')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.integrations.calendly.description', 'Configure Calendly OAuth for Calendar integration across all companies')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="calendly-enabled"
                      checked={calendlyOAuthForm.enabled}
                      onCheckedChange={(checked) => setCalendlyOAuthForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="calendly-enabled">{t('admin.settings.integrations.calendly.enable', 'Enable Calendly Integration')}</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="calendly-client-id">{t('admin.settings.integrations.client_id', 'Client ID')}</Label>
                    <Input
                      id="calendly-client-id"
                      placeholder={t('admin.settings.integrations.calendly.placeholder_client_id', 'Enter Calendly OAuth Client ID')}
                      value={calendlyOAuthForm.client_id}
                      onChange={(e) => setCalendlyOAuthForm(prev => ({ ...prev, client_id: e.target.value }))}
                      disabled={!calendlyOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="calendly-client-secret">{t('admin.settings.integrations.client_secret', 'Client Secret')}</Label>
                    <Input
                      id="calendly-client-secret"
                      type="password"
                      placeholder={t('admin.settings.integrations.calendly.placeholder_client_secret', 'Enter Calendly OAuth Client Secret')}
                      value={calendlyOAuthForm.client_secret}
                      onChange={(e) => setCalendlyOAuthForm(prev => ({ ...prev, client_secret: e.target.value }))}
                      disabled={!calendlyOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="calendly-webhook-signing-key">{t('admin.settings.integrations.calendly.webhook_signing_key', 'Webhook Signing Key')}</Label>
                    <Input
                      id="calendly-webhook-signing-key"
                      type="password"
                      placeholder={t('admin.settings.integrations.calendly.placeholder_webhook_key', 'Enter Calendly Webhook Signing Key')}
                      value={calendlyOAuthForm.webhook_signing_key}
                      onChange={(e) => setCalendlyOAuthForm(prev => ({ ...prev, webhook_signing_key: e.target.value }))}
                      disabled={!calendlyOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.settings.integrations.calendly.webhook_help', "A unique key shared between your app and Calendly that's used to verify events sent to your endpoints.")}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="calendly-redirect-uri">{t('admin.settings.integrations.redirect_uri', 'Redirect URI')}</Label>
                    <Input
                      id="calendly-redirect-uri"
                      placeholder={t('admin.settings.integrations.placeholder_redirect_auto', 'Auto-generated redirect URI')}
                      value={calendlyOAuthForm.redirect_uri}
                      onChange={(e) => setCalendlyOAuthForm(prev => ({ ...prev, redirect_uri: e.target.value }))}
                      disabled={!calendlyOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.settings.integrations.calendly.redirect_help', 'This redirect URI must be added to your Calendly Developer Console OAuth configuration.')}
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveCalendlyOAuthMutation.mutate()}
                      disabled={saveCalendlyOAuthMutation.isPending || !calendlyOAuthForm.enabled}
                      className="w-full"
                    >
                      {saveCalendlyOAuthMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t('admin.settings.integrations.calendly.save', 'Save Calendly Settings')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.integrations.setup_instructions_title', 'Setup Instructions')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.integrations.calendly.setup_description', 'How to configure Calendly integration')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.calendly.step1_title', '1. Create Calendly Developer Account')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.calendly.step1_body', 'Go to Calendly Developer Console (https://developer.calendly.com) and create a new OAuth application.')}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.calendly.step2_title', '2. Configure OAuth Application')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.calendly.step2_body', 'Set the application type to "Web Application" and add the redirect URI shown above.')}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.calendly.step4_title', '4. Copy Credentials')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.calendly.step4_body', 'Copy the Client ID, Client Secret, and Webhook Signing Key from your Calendly application and paste them above.')}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="rounded-md border border-border bg-muted/40 p-3">
                      <h4 className="mb-1 text-sm font-medium text-foreground">{t('admin.settings.integrations.multi_tenant_title', 'Multi-Tenant Architecture')}</h4>
                      <p className="text-xs text-muted-foreground">
                        {t('admin.settings.integrations.multi_tenant_calendly', 'These credentials will be used by all companies on your platform. Individual users will authenticate with their own Calendly accounts using these application credentials.')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.integrations.google_sheets.title', 'Google Sheets Integration')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.integrations.google_sheets.description', 'Configure Google OAuth for Sheets integration across all companies')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="google-sheets-enabled"
                      checked={googleSheetsOAuthForm.enabled}
                      onCheckedChange={(checked) => setGoogleSheetsOAuthForm(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label htmlFor="google-sheets-enabled">{t('admin.settings.integrations.google_sheets.enable', 'Enable Google Sheets Integration')}</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-sheets-client-id">{t('admin.settings.integrations.client_id', 'Client ID')}</Label>
                    <Input
                      id="google-sheets-client-id"
                      placeholder={t('admin.settings.integrations.placeholder_google_oauth_client_id', 'Enter Google OAuth Client ID')}
                      value={googleSheetsOAuthForm.client_id}
                      onChange={(e) => setGoogleSheetsOAuthForm(prev => ({ ...prev, client_id: e.target.value }))}
                      disabled={!googleSheetsOAuthForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-sheets-client-secret">{t('admin.settings.integrations.client_secret', 'Client Secret')}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="google-sheets-client-secret"
                        type={showGoogleSheetsClientSecret ? 'text' : 'password'}
                        placeholder={t('admin.settings.integrations.placeholder_google_oauth_client_secret', 'Enter Google OAuth Client Secret')}
                        value={googleSheetsOAuthForm.client_secret}
                        onChange={(e) => setGoogleSheetsOAuthForm(prev => ({ ...prev, client_secret: e.target.value }))}
                        disabled={!googleSheetsOAuthForm.enabled}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        disabled={!googleSheetsOAuthForm.enabled}
                        onClick={() => setShowGoogleSheetsClientSecret(v => !v)}
                        aria-label={showGoogleSheetsClientSecret
                          ? t('admin.settings.integrations.hide_client_secret', 'Hide client secret')
                          : t('admin.settings.integrations.show_client_secret', 'Show client secret')}
                      >
                        {showGoogleSheetsClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google-sheets-redirect-uri">{t('admin.settings.integrations.redirect_uri', 'Redirect URI')}</Label>
                    <Input
                      id="google-sheets-redirect-uri"
                      placeholder={t('admin.settings.integrations.placeholder_redirect_auto', 'Auto-generated redirect URI')}
                      value={googleSheetsOAuthForm.redirect_uri}
                      onChange={(e) => setGoogleSheetsOAuthForm(prev => ({ ...prev, redirect_uri: e.target.value }))}
                      disabled={!googleSheetsOAuthForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.settings.integrations.google_sheets.redirect_help', 'This redirect URI must be added to your Google Cloud Console OAuth configuration.')}
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveGoogleSheetsOAuthMutation.mutate()}
                      disabled={saveGoogleSheetsOAuthMutation.isPending || !googleSheetsOAuthForm.enabled}
                      className="w-full"
                    >
                      {saveGoogleSheetsOAuthMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t('admin.settings.integrations.google_sheets.save', 'Save Google Sheets Settings')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.integrations.google_sheets.setup_title', 'Google Sheets Setup')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.integrations.google_sheets.setup_description', 'How to configure Google Sheets integration')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 text-sm">
                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.google_sheets.step1_title', '1. Use Same Google Cloud Project')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.google_sheets.step1_body', 'You can use the same Google Cloud project and OAuth credentials as Google Calendar.')}
                      </p>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.google_sheets.step2_title', '2. Enable APIs')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.google_sheets.step2_body', 'Enable the Google Drive API and Google Sheets API from Google Cloud Console.')}
                      </p>
                    </div>



                    <div>
                      <h4 className="font-medium mb-2">{t('admin.settings.integrations.google_sheets.step4_title', '4. User Authentication')}</h4>
                      <p className="text-muted-foreground">
                        {t('admin.settings.integrations.google_sheets.step4_body', 'Users will authenticate with their personal Google accounts to access their own spreadsheets.')}
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="rounded-md border border-border bg-muted/40 p-3">
                      <h4 className="mb-1 text-sm font-medium text-foreground">{t('admin.settings.integrations.google_sheets.simplified_title', 'Simplified Setup')}</h4>
                      <p className="text-xs text-muted-foreground">
                        {t('admin.settings.integrations.google_sheets.simplified_body', 'Users simply connect their Google accounts and can immediately access their own spreadsheets.')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.settings.integrations.google_maps.title', 'Google Maps Integration')}</CardTitle>
                  <CardDescription>
                    {t('admin.settings.integrations.google_maps.description', 'Configure your Google Maps API key to enable scraping business contacts from Google Maps.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="google-maps-api-key">{t('admin.settings.integrations.google_maps.api_key', 'API Key')}</Label>
                    <Input
                      id="google-maps-api-key"
                      type="text"
                      placeholder={t('admin.settings.integrations.google_maps.placeholder_key', 'AIzaSy...')}
                      value={googleMapsApiKey}
                      onChange={(e) => setGoogleMapsApiKey(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.settings.integrations.google_maps.api_key_help_prefix', 'Enter your Google Maps API key. Get one from')}{' '}
                      <a
                        href="https://console.cloud.google.com/google/maps-apis"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {t('admin.settings.integrations.google_maps.google_cloud_console_link', 'Google Cloud Console')}
                      </a>
                    </p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      {t('admin.settings.integrations.google_maps.super_admin_note', 'Note: Only super admins can configure this app-level setting.')}
                    </p>
                    {googleMapsSettings?.configured && (
                      <div className="mt-1 text-xs text-green-600 dark:text-green-400">
                        {t(
                          'admin.settings.integrations.google_maps.status_configured',
                          'Status: Configured ({{preview}})',
                          { preview: googleMapsSettings.apiKey }
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t">
                    <Button
                      onClick={() => saveGoogleMapsApiKeyMutation.mutate()}
                      disabled={saveGoogleMapsApiKeyMutation.isPending || !googleMapsApiKey.trim()}
                      className="w-full"
                    >
                      {saveGoogleMapsApiKeyMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {t('admin.settings.integrations.google_maps.save', 'Save Google Maps API Key')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="appsumo"><AppSumoAdminPanel /></TabsContent>
            <TabsContent value="payment">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Stripe Integration</CardTitle>
                  <CardDescription>
                    {t('admin.settings.configure_stripe_gateway', 'Configure Stripe payment gateway')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="stripe-enabled"
                      checked={stripeForm.enabled}
                      onCheckedChange={(checked) => setStripeForm({...stripeForm, enabled: checked})}
                    />
                    <Label htmlFor="stripe-enabled">Enable Stripe Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="publishableKey">Publishable Key</Label>
                    <Input
                      id="publishableKey"
                      value={stripeForm.publishableKey}
                      onChange={(e) => setStripeForm({...stripeForm, publishableKey: e.target.value})}
                      placeholder="pk_test_..."
                      disabled={!stripeForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="secretKey">Secret Key</Label>
                    <Input
                      id="secretKey"
                      type="password"
                      value={stripeForm.secretKey}
                      onChange={(e) => setStripeForm({...stripeForm, secretKey: e.target.value})}
                      placeholder="sk_test_..."
                      disabled={!stripeForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="webhookSecret">Webhook Secret</Label>
                    <Input
                      id="webhookSecret"
                      value={stripeForm.webhookSecret}
                      onChange={(e) => setStripeForm({...stripeForm, webhookSecret: e.target.value})}
                      placeholder="whsec_..."
                      disabled={!stripeForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="webhookUrl">Webhook Endpoint URL</Label>
                    <Input
                      id="webhookUrl"
                      value={stripeForm.webhookUrl}
                      onChange={(e) => setStripeForm({...stripeForm, webhookUrl: e.target.value})}
                      placeholder={`${window.location.origin}/api/webhooks/stripe`}
                      disabled={!stripeForm.enabled}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="stripe-test-mode"
                      checked={stripeForm.testMode}
                      onCheckedChange={(checked) => setStripeForm({...stripeForm, testMode: checked})}
                      disabled={!stripeForm.enabled}
                    />
                    <Label htmlFor="stripe-test-mode">Test Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => saveStripeMutation.mutate()}
                      disabled={saveStripeMutation.isPending || !stripeForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {saveStripeMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save Stripe Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testStripeMutation.mutate()}
                      disabled={testStripeMutation.isPending || !stripeForm.enabled || !stripeForm.secretKey}
                      className="w-full sm:w-auto"
                    >
                      {testStripeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Paystack Integration</CardTitle>
                  <CardDescription>
                    Configure Paystack payment gateway
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="paystack-enabled"
                      checked={paystackForm.enabled}
                      onCheckedChange={(checked) => setPaystackForm({ ...paystackForm, enabled: checked })}
                    />
                    <Label htmlFor="paystack-enabled">Enable Paystack Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paystack-publicKey">Public Key</Label>
                    <Input
                      id="paystack-publicKey"
                      value={paystackForm.publicKey}
                      onChange={(e) => setPaystackForm({ ...paystackForm, publicKey: e.target.value })}
                      placeholder="pk_test_xxxxx"
                      disabled={!paystackForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paystack-secretKey">Secret Key</Label>
                    <Input
                      id="paystack-secretKey"
                      type="password"
                      value={paystackForm.secretKey}
                      onChange={(e) => setPaystackForm({ ...paystackForm, secretKey: e.target.value })}
                      placeholder="sk_test_xxxxx"
                      disabled={!paystackForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paystack-subaccount">Subaccount (optional)</Label>
                    <Input
                      id="paystack-subaccount"
                      value={paystackForm.subaccount}
                      onChange={(e) => setPaystackForm({ ...paystackForm, subaccount: e.target.value })}
                      placeholder="ACCT_xxxxx"
                      disabled={!paystackForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paystack-webhookSecret">Webhook Secret (optional)</Label>
                    <Input
                      id="paystack-webhookSecret"
                      value={paystackForm.webhookSecret}
                      onChange={(e) => setPaystackForm({ ...paystackForm, webhookSecret: e.target.value })}
                      placeholder="whsec_xxxxx"
                      disabled={!paystackForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paystack-merchantCurrency">Merchant Currency</Label>
                    <Select
                      value={paystackForm.merchantCurrency || 'auto'}
                      onValueChange={(v) => setPaystackForm({ ...paystackForm, merchantCurrency: v === 'auto' ? '' : v })}
                      disabled={!paystackForm.enabled}
                    >
                      <SelectTrigger id="paystack-merchantCurrency">
                        <SelectValue placeholder="Use app default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Use app default</SelectItem>
                        <SelectItem value="NGN">NGN (Nigerian Naira)</SelectItem>
                        <SelectItem value="GHS">GHS (Ghanaian Cedi)</SelectItem>
                        <SelectItem value="ZAR">ZAR (South African Rand)</SelectItem>
                        <SelectItem value="USD">USD (US Dollar)</SelectItem>
                        <SelectItem value="KES">KES (Kenyan Shilling)</SelectItem>
                        <SelectItem value="XOF">XOF (West African CFA Franc)</SelectItem>
                        <SelectItem value="EGP">EGP (Egyptian Pound)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Set this if you get &quot;Currency not supported by merchant&quot;. Use the currency enabled on your Paystack integration (e.g. NGN for Nigeria, GHS for Ghana).
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="paystack-test-mode"
                      checked={paystackForm.testMode}
                      onCheckedChange={(checked) => setPaystackForm({ ...paystackForm, testMode: checked })}
                      disabled={!paystackForm.enabled}
                    />
                    <Label htmlFor="paystack-test-mode">Test Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => savePaystackMutation.mutate()}
                      disabled={savePaystackMutation.isPending || !paystackForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {savePaystackMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save Paystack Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testPaystackMutation.mutate()}
                      disabled={testPaystackMutation.isPending || !paystackForm.enabled || !paystackForm.secretKey}
                      className="w-full sm:w-auto"
                    >
                      {testPaystackMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Mercado Pago Integration</CardTitle>
                  <CardDescription>
                    Configure Mercado Pago payment gateway
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="mercadopago-enabled"
                      checked={mercadoPagoForm.enabled}
                      onCheckedChange={(checked) => setMercadoPagoForm({...mercadoPagoForm, enabled: checked})}
                    />
                    <Label htmlFor="mercadopago-enabled">Enable Mercado Pago Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mercadopago-clientId">Client ID</Label>
                    <Input
                      id="mercadopago-clientId"
                      value={mercadoPagoForm.clientId}
                      onChange={(e) => setMercadoPagoForm({...mercadoPagoForm, clientId: e.target.value})}
                      placeholder="2740017016616699"
                      disabled={!mercadoPagoForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mercadopago-clientSecret">Client Secret</Label>
                    <Input
                      id="mercadopago-clientSecret"
                      type="password"
                      value={mercadoPagoForm.clientSecret}
                      onChange={(e) => setMercadoPagoForm({...mercadoPagoForm, clientSecret: e.target.value})}
                      placeholder="9JUknDFhkXkuyEBuEnvWiXrpVFnYdtLc"
                      disabled={!mercadoPagoForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="mercadopago-accessToken">Access Token</Label>
                    <Input
                      id="mercadopago-accessToken"
                      type="password"
                      value={mercadoPagoForm.accessToken}
                      onChange={(e) => setMercadoPagoForm({...mercadoPagoForm, accessToken: e.target.value})}
                      placeholder="APP_USR-2740017016616699-021517-c5d115a0e393d32ec81f16ec2dc15e7e-221745631"
                      disabled={!mercadoPagoForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      This is the Production Access Token from your Mercado Pago Developer Dashboard.
                      Make sure to use the correct token for test or production mode.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="mercadopago-test-mode"
                      checked={mercadoPagoForm.testMode}
                      onCheckedChange={(checked) => setMercadoPagoForm({...mercadoPagoForm, testMode: checked})}
                      disabled={!mercadoPagoForm.enabled}
                    />
                    <Label htmlFor="mercadopago-test-mode">Test Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => saveMercadoPagoMutation.mutate()}
                      disabled={saveMercadoPagoMutation.isPending || !mercadoPagoForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {saveMercadoPagoMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save Mercado Pago Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testMercadoPagoMutation.mutate()}
                      disabled={testMercadoPagoMutation.isPending || !mercadoPagoForm.enabled || !mercadoPagoForm.accessToken}
                      className="w-full sm:w-auto"
                    >
                      {testMercadoPagoMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>PayPal Integration</CardTitle>
                  <CardDescription>
                    {t('admin.settings.configure_paypal_gateway', 'Configure PayPal payment gateway')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="paypal-enabled"
                      checked={paypalForm.enabled}
                      onCheckedChange={(checked) => setPaypalForm({...paypalForm, enabled: checked})}
                    />
                    <Label htmlFor="paypal-enabled">Enable PayPal Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clientId">Client ID</Label>
                    <Input
                      id="clientId"
                      value={paypalForm.clientId}
                      onChange={(e) => setPaypalForm({...paypalForm, clientId: e.target.value})}
                      placeholder="Your PayPal Client ID"
                      disabled={!paypalForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="clientSecret">Client Secret</Label>
                    <Input
                      id="clientSecret"
                      type="password"
                      value={paypalForm.clientSecret}
                      onChange={(e) => setPaypalForm({...paypalForm, clientSecret: e.target.value})}
                      placeholder="Your PayPal Client Secret"
                      disabled={!paypalForm.enabled}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="paypal-test-mode"
                      checked={paypalForm.testMode}
                      onCheckedChange={(checked) => setPaypalForm({...paypalForm, testMode: checked})}
                      disabled={!paypalForm.enabled}
                    />
                    <Label htmlFor="paypal-test-mode">Sandbox Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => savePaypalMutation.mutate()}
                      disabled={savePaypalMutation.isPending || !paypalForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {savePaypalMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save PayPal Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testPaypalMutation.mutate()}
                      disabled={testPaypalMutation.isPending || !paypalForm.enabled || !paypalForm.clientSecret}
                      className="w-full sm:w-auto"
                    >
                      {testPaypalMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Moyasar Integration</CardTitle>
                  <CardDescription>
                    Configure Moyasar payment gateway for Saudi Arabia
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="moyasar-enabled"
                      checked={moyasarForm.enabled}
                      onCheckedChange={(checked) => setMoyasarForm({...moyasarForm, enabled: checked})}
                    />
                    <Label htmlFor="moyasar-enabled">Enable Moyasar Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="publishableKey">Publishable Key</Label>
                    <Input
                      id="publishableKey"
                      value={moyasarForm.publishableKey}
                      onChange={(e) => setMoyasarForm({...moyasarForm, publishableKey: e.target.value})}
                      placeholder="Your Moyasar Publishable Key"
                      disabled={!moyasarForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="secretKey">Secret Key</Label>
                    <Input
                      id="secretKey"
                      type="password"
                      value={moyasarForm.secretKey}
                      onChange={(e) => setMoyasarForm({...moyasarForm, secretKey: e.target.value})}
                      placeholder="Your Moyasar Secret Key"
                      disabled={!moyasarForm.enabled}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="moyasar-test-mode"
                      checked={moyasarForm.testMode}
                      onCheckedChange={(checked) => setMoyasarForm({...moyasarForm, testMode: checked})}
                      disabled={!moyasarForm.enabled}
                    />
                    <Label htmlFor="moyasar-test-mode">Test Mode</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => saveMoyasarMutation.mutate()}
                      disabled={saveMoyasarMutation.isPending || !moyasarForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {saveMoyasarMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save Moyasar Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testMoyasarMutation.mutate()}
                      disabled={testMoyasarMutation.isPending || !moyasarForm.enabled || !moyasarForm.secretKey}
                      className="w-full sm:w-auto"
                    >
                      {testMoyasarMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>MPESA Integration</CardTitle>
                  <CardDescription>
                    Configure MPESA payment gateway for Kenya
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="mpesa-enabled"
                      checked={mpesaForm.enabled}
                      onCheckedChange={(checked) => setMpesaForm({...mpesaForm, enabled: checked})}
                    />
                    <Label htmlFor="mpesa-enabled">Enable MPESA Payments</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="consumerKey">Consumer Key</Label>
                    <Input
                      id="consumerKey"
                      value={mpesaForm.consumerKey}
                      onChange={(e) => setMpesaForm({...mpesaForm, consumerKey: e.target.value})}
                      placeholder="Your MPESA Consumer Key"
                      disabled={!mpesaForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="consumerSecret">Consumer Secret</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="consumerSecret"
                        type={mpesaForm as any && (mpesaForm as any)._showConsumerSecret ? 'text' : 'password'}
                        value={mpesaForm.consumerSecret}
                        onChange={(e) => setMpesaForm({...mpesaForm, consumerSecret: e.target.value})}
                        placeholder="Your MPESA Consumer Secret"
                        disabled={!mpesaForm.enabled}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setMpesaForm({
                          ...mpesaForm,
                          _showConsumerSecret: !(mpesaForm as any)._showConsumerSecret
                        } as any)}
                        aria-label={(mpesaForm as any)._showConsumerSecret ? 'Hide Consumer Secret' : 'Show Consumer Secret'}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="businessShortcode">Business Shortcode</Label>
                    <Input
                      id="businessShortcode"
                      value={mpesaForm.businessShortcode}
                      onChange={(e) => setMpesaForm({...mpesaForm, businessShortcode: e.target.value})}
                      placeholder="Your MPESA Business Shortcode"
                      disabled={!mpesaForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="shortcodeType">Shortcode Type</Label>
                    <Select
                      value={mpesaForm.shortcodeType}
                      onValueChange={(value) => setMpesaForm({...mpesaForm, shortcodeType: value as any})}
                      disabled={!mpesaForm.enabled}
                    >
                      <SelectTrigger id="shortcodeType">
                        <SelectValue placeholder="Select shortcode type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="paybill">PayBill</SelectItem>
                        <SelectItem value="buygoods">BuyGoods (Till)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="passkey">Passkey</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="passkey"
                        type={(mpesaForm as any)._showPasskey ? 'text' : 'password'}
                        value={mpesaForm.passkey}
                        onChange={(e) => setMpesaForm({...mpesaForm, passkey: e.target.value})}
                        placeholder="Your MPESA Passkey"
                        disabled={!mpesaForm.enabled}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setMpesaForm({
                          ...mpesaForm,
                          _showPasskey: !(mpesaForm as any)._showPasskey
                        } as any)}
                        aria-label={(mpesaForm as any)._showPasskey ? 'Hide Passkey' : 'Show Passkey'}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="callbackUrl">Callback URL</Label>
                    <Input
                      id="callbackUrl"
                      value={mpesaForm.callbackUrl}
                      onChange={(e) => setMpesaForm({...mpesaForm, callbackUrl: e.target.value})}
                      placeholder="https://your-domain.com/api/webhooks/mpesa"
                      disabled={!mpesaForm.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Must be a publicly reachable HTTPS URL that accepts MPESA STK callbacks.
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="mpesa-test-mode"
                      checked={mpesaForm.testMode}
                      onCheckedChange={(checked) => setMpesaForm({...mpesaForm, testMode: checked})}
                      disabled={!mpesaForm.enabled}
                    />
                    <Label htmlFor="mpesa-test-mode">Test Mode (Sandbox)</Label>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
                    <Button
                      variant="brand"
                      onClick={() => saveMpesaMutation.mutate()}
                      disabled={saveMpesaMutation.isPending || !mpesaForm.enabled}
                      className="btn-brand-primary w-full sm:w-auto"
                    >
                      {saveMpesaMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <span className="hidden sm:inline">Save MPESA Settings</span>
                      <span className="sm:hidden">Save Settings</span>
                    </Button>

                    <Button
                      variant="brand"
                      onClick={() => testMpesaMutation.mutate()}
                      disabled={testMpesaMutation.isPending || !mpesaForm.enabled || !mpesaForm.consumerSecret}
                      className="w-full sm:w-auto"
                    >
                      {testMpesaMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      {t('admin.settings.test_connection', 'Test Connection')}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bank Transfer</CardTitle>
                  <CardDescription>
                    Configure offline payment via bank transfer
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="bank-transfer-enabled"
                      checked={bankTransferForm.enabled}
                      onCheckedChange={(checked) => setBankTransferForm({...bankTransferForm, enabled: checked})}
                    />
                    <Label htmlFor="bank-transfer-enabled">Enable Bank Transfer</Label>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountName">Account Name</Label>
                    <Input
                      id="accountName"
                      value={bankTransferForm.accountName}
                      onChange={(e) => setBankTransferForm({...bankTransferForm, accountName: e.target.value})}
                      placeholder={t('admin.settings.company_name_placeholder', 'Company Name')}
                      disabled={!bankTransferForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input
                      id="accountNumber"
                      value={bankTransferForm.accountNumber}
                      onChange={(e) => setBankTransferForm({...bankTransferForm, accountNumber: e.target.value})}
                      placeholder="123456789"
                      disabled={!bankTransferForm.enabled}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input
                      id="bankName"
                      value={bankTransferForm.bankName}
                      onChange={(e) => setBankTransferForm({...bankTransferForm, bankName: e.target.value})}
                      placeholder="Bank of Example"
                      disabled={!bankTransferForm.enabled}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="routingNumber">Routing Number</Label>
                      <Input
                        id="routingNumber"
                        value={bankTransferForm.routingNumber}
                        onChange={(e) => setBankTransferForm({...bankTransferForm, routingNumber: e.target.value})}
                        placeholder="Optional"
                        disabled={!bankTransferForm.enabled}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="swiftCode">SWIFT Code</Label>
                      <Input
                        id="swiftCode"
                        value={bankTransferForm.swiftCode}
                        onChange={(e) => setBankTransferForm({...bankTransferForm, swiftCode: e.target.value})}
                        placeholder="Optional"
                        disabled={!bankTransferForm.enabled}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="instructions">Payment Instructions</Label>
                    <Input
                      id="instructions"
                      value={bankTransferForm.instructions}
                      onChange={(e) => setBankTransferForm({...bankTransferForm, instructions: e.target.value})}
                      placeholder="Include payment reference in transfer details"
                      disabled={!bankTransferForm.enabled}
                    />
                  </div>

                  <Button
                    variant="brand"
                    onClick={() => saveBankTransferMutation.mutate()}
                    disabled={saveBankTransferMutation.isPending || !bankTransferForm.enabled}
                    className="btn-brand-primary"
                  >
                    {saveBankTransferMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Bank Transfer Settings
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="email">
            <Card>
              <CardHeader>
                <CardTitle>SMTP Email Configuration</CardTitle>
                <CardDescription>
                  {t('admin.settings.configure_smtp_settings', 'Configure SMTP settings for sending system emails, notifications, and password resets')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="smtp-enabled"
                    checked={smtpForm.enabled}
                    onCheckedChange={(checked) => setSmtpForm({...smtpForm, enabled: checked})}
                  />
                  <Label htmlFor="smtp-enabled">Enable SMTP Email</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  When enabled, the system will use SMTP to send emails for password resets, notifications, and other system communications.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="smtp-host">SMTP Host</Label>
                    <Input
                      id="smtp-host"
                      value={smtpForm.host}
                      onChange={(e) => setSmtpForm({...smtpForm, host: e.target.value})}
                      placeholder="smtp.example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-username">SMTP Username</Label>
                    <Input
                      id="smtp-username"
                      value={smtpForm.username}
                      onChange={(e) => setSmtpForm({...smtpForm, username: e.target.value})}
                      placeholder="username@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-port">SMTP Port</Label>
                    <Input
                      id="smtp-port"
                      type="number"
                      value={smtpForm.port}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        const port = Number.isFinite(parsed) ? parsed : smtpForm.port;
                        let suggestedSecurity = smtpForm.security;

                        if (Number.isFinite(parsed)) {
                          if (parsed === 465) {
                            suggestedSecurity = 'ssl';
                          } else if (parsed === 587) {
                            suggestedSecurity = 'tls';
                          } else if (parsed === 25) {
                            suggestedSecurity = 'none';
                          }
                        }

                        setSmtpForm({...smtpForm, port, security: suggestedSecurity});
                      }}
                      placeholder="587"
                    />
                    <p className="text-xs text-muted-foreground">
                      Common ports: 587 (STARTTLS, recommended), 465 (SSL/TLS), 25 (No encryption)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-password">SMTP Password</Label>
                    <Input
                      id="smtp-password"
                      type="password"
                      value={smtpForm.password}
                      onChange={(e) => setSmtpForm({...smtpForm, password: e.target.value})}
                      placeholder={storedSmtpPassword ? "Leave empty to keep current password" : "Enter password"}
                    />
                    <p className="text-xs text-muted-foreground">
                      {storedSmtpPassword ? "Password is set. Leave empty to keep it unchanged, or enter new password." : "For Gmail, use an App Password instead of your regular password"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-security">Security</Label>
                    <Select
                      value={smtpForm.security}
                      onValueChange={(value) => setSmtpForm({...smtpForm, security: value})}
                    >
                      <SelectTrigger id="smtp-security">
                        <SelectValue placeholder="Select security" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssl">SSL / Implicit TLS (Port 465)</SelectItem>
                        <SelectItem value="tls">STARTTLS (Port 587)</SelectItem>
                        <SelectItem value="none">None (Port 25)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-from-email">From Email Address</Label>
                    <Input
                      id="smtp-from-email"
                      type="email"
                      value={smtpForm.fromEmail}
                      onChange={(e) => setSmtpForm({...smtpForm, fromEmail: e.target.value})}
                      placeholder="noreply@example.com"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-from-name">From Name</Label>
                    <Input
                      id="smtp-from-name"
                      value={smtpForm.fromName}
                      onChange={(e) => setSmtpForm({...smtpForm, fromName: e.target.value})}
                      placeholder="Tech Support"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-test-email">Test Email Address</Label>
                    <Input
                      id="smtp-test-email"
                      type="email"
                      value={smtpForm.testEmail}
                      onChange={(e) => setSmtpForm({...smtpForm, testEmail: e.target.value})}
                      placeholder="test@example.com"
                    />
                    <p className="text-xs text-muted-foreground">
                      Email address to send test emails to
                    </p>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <Button
                    variant="brand"
                    onClick={() => saveSmtpMutation.mutate()}
                    disabled={saveSmtpMutation.isPending}
                    className="btn-brand-primary"
                  >
                    {saveSmtpMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save SMTP Settings
                  </Button>

                  <Button
                    variant="brand"
                    onClick={() => testSmtpMutation.mutate()}
                    disabled={
                      testSmtpMutation.isPending ||
                      !smtpForm.host ||
                      !smtpForm.testEmail ||
                      !isValidSmtpEmail(smtpForm.testEmail) ||
                      (!!smtpForm.fromEmail && !isValidSmtpEmail(smtpForm.fromEmail))
                    }
                  >
                    {testSmtpMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-2 h-4 w-4" />
                    )}
                    {t('admin.settings.test_connection', 'Test Connection')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="welcome-email">
            <div className="space-y-6">
              <Card className="border border-border/80 shadow-md">
                <CardHeader className="border-b border-border/40 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary shrink-0">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-xl font-bold flex items-center gap-2">
                        {t('admin.settings.welcome_email', 'Welcome Email Template')}
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground mt-0.5">
                        {t('admin.settings.welcome_email.description', 'Customize the welcome email sent to admin users when a new company registers. Use the available variables to personalize the email content.')}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">

                  {/* Redesigned 2-Column Section */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    
                    {/* Left Column: Form Controls */}
                    <div className="lg:col-span-7 space-y-6">
                      
                      {/* Enable/Disable Toggle */}
                      <div className="flex items-center justify-between p-4 border border-border/60 bg-muted/20 dark:bg-muted/5 rounded-xl transition-all hover:bg-muted/30">
                        <div className="space-y-0.5 pr-4">
                          <Label className="text-sm font-semibold text-foreground">
                            {t('admin.settings.welcome_email.enable_label', 'Send Welcome Email')}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {t('admin.settings.welcome_email.enable_hint', 'When enabled, a welcome email is sent to the admin after successful company registration.')}
                          </p>
                        </div>
                        <Switch
                          checked={welcomeEmailForm.enabled}
                          onCheckedChange={(checked) =>
                            setWelcomeEmailForm(prev => ({ ...prev, enabled: checked }))
                          }
                          className="shrink-0 data-[state=checked]"
                        />
                      </div>

                      {/* Subject & Body wrapped in collapsible edit block */}
                      <div className={`space-y-6 transition-all duration-300 ${welcomeEmailForm.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
                        
                        {/* Subject */}
                        <div className="space-y-2">
                          <Label htmlFor="welcome-email-subject" className="text-sm font-semibold text-foreground">
                            {t('admin.settings.welcome_email.subject_label', 'Email Subject')}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {t('admin.settings.welcome_email.subject_hint', 'The subject line of the welcome email. Supports variables.')}
                          </p>
                          <div className="relative rounded-lg shadow-sm">
                            <Input
                              id="welcome-email-subject"
                              value={welcomeEmailForm.subject}
                              onChange={(e) => setWelcomeEmailForm(prev => ({ ...prev, subject: e.target.value }))}
                              placeholder="Welcome to {{companyName}} - Your Account is Ready!"
                              className="font-mono text-xs pr-10 bg-background border-border/80 focus-visible:ring-1"
                            />
                            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-muted-foreground/60">
                              <Smile className="h-4 w-4" />
                            </div>
                          </div>
                        </div>

                        {/* Body */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label htmlFor="welcome-email-body" className="text-sm font-semibold text-foreground">
                                {t('admin.settings.welcome_email.body_label', 'Email Body (HTML)')}
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                {t('admin.settings.welcome_email.body_hint', 'HTML body of the welcome email. Variables like {{companyName}} will be replaced.')}
                              </p>
                            </div>
                            
                            {/* Editor vs preview toggle */}
                            <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted/40 p-0.5 shrink-0">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2.5 rounded-md text-xs transition-all gap-1.5 ${welcomeEmailEditorView === 'code' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setWelcomeEmailEditorView('code')}
                              >
                                <Code className="h-3.5 w-3.5 text-primary" />
                                <span>{t('admin.settings.welcome_email.editor_view_code', '</>')}</span>
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2.5 rounded-md text-xs transition-all gap-1.5 ${welcomeEmailEditorView === 'preview' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setWelcomeEmailEditorView('preview')}
                              >
                                <Eye className="h-3.5 w-3.5 text-primary" />
                                <span>{t('admin.settings.welcome_email.editor_view_preview', 'Preview')}</span>
                              </Button>
                            </div>
                          </div>

                          {welcomeEmailEditorView === 'code' ? (
                            /* Simulated IDE Code Editor */
                            <div className="relative border border-border rounded-xl overflow-hidden bg-[#070b13] focus-within:ring-1 focus-within:ring-primary/40 shadow-inner">
                              {/* Editor Top Tabs */}
                              <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-muted/10">
                                <div className="flex items-center gap-1.5">
                                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/80"></div>
                                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80"></div>
                                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/80"></div>
                                  <span className="text-[11px] font-mono text-muted-foreground/80 ml-2">{t('admin.settings.welcome_email.editor_filename', 'welcome_template.html')}</span>
                                </div>
                                <span className="text-[9px] font-mono text-muted-foreground/40 font-bold uppercase">{t('admin.settings.welcome_email.editor_type', 'HTML5 Editor')}</span>
                              </div>
                              
                              {/* Textarea & Line Numbers */}
                              <div className="flex font-mono text-xs">
                                <div className="select-none text-right pr-3 pl-4 py-4 text-muted-foreground/20 border-r border-white/5 bg-black/10 leading-relaxed shrink-0">
                                  {Array.from({ length: 18 }).map((_, i) => (
                                    <div key={i} className="text-[10px] h-[19px]">{i + 1}</div>
                                  ))}
                                </div>
                                <Textarea
                                  id="welcome-email-body"
                                  value={welcomeEmailForm.body}
                                  onChange={(e) => setWelcomeEmailForm(prev => ({ ...prev, body: e.target.value }))}
                                  placeholder="<html>...</html>"
                                  className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-[#e2e8f0] placeholder:text-muted-foreground/20 leading-relaxed font-mono text-xs p-4 w-full h-[342px] resize-none overflow-y-auto"
                                />
                              </div>
                            </div>
                          ) : (
                            /* Local HTML render preview inside left pane */
                            <div className="border border-border rounded-xl overflow-hidden bg-background h-[394px] p-0.5 shadow-sm">
                              <iframe
                                title={t('admin.settings.welcome_email.preview_body_only', 'Body Render Preview Only')}
                                srcDoc={welcomeEmailForm.body
                                  .replace(/\{\{appName\}\}/g, brandingForm.appName || 'BotHive')
                                  .replace(/\{\{companyName\}\}/g, 'Pointer Software')
                                  .replace(/\{\{adminFullName\}\}/g, 'Felix Zona')
                                  .replace(/\{\{adminUsername\}\}/g, 'felix')
                                  .replace(/\{\{adminEmail\}\}/g, 'info@pointer.pk')
                                  .replace(/\{\{planLabel\}\}/g, 'Pro')
                                  .replace(/\{\{loginUrl\}\}/g, window.location.origin + '/auth')
                                  .replace(/\{\{currentYear\}\}/g, String(new Date().getFullYear()))
                                }
                                className="w-full h-full border-0 bg-white"
                                sandbox="allow-same-origin"
                              />
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    {/* Right Column: Live Devices Preview Frame */}
                    <div className="lg:col-span-5 flex flex-col space-y-3 lg:border-l lg:border-border/30 lg:pl-6">
                      <div className="flex items-center justify-between pb-1">
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-semibold text-foreground">
                            {t('admin.settings.welcome_email.preview_label', 'Email Preview')}
                          </h4>
                          <p className="text-[11px] text-muted-foreground">
                            {t('admin.settings.welcome_email.preview_hint', 'This is how your email will look to the recipient.')}
                          </p>
                        </div>
                        
                        {/* Device view selection */}
                        <div className="flex items-center border border-border rounded-lg overflow-hidden bg-muted/40 p-0.5 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('admin.settings.welcome_email.device_desktop', 'Desktop view')}
                            className={`h-7 w-8 rounded-md transition-all ${welcomeEmailPreviewDevice === 'desktop' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setWelcomeEmailPreviewDevice('desktop')}
                          >
                            <Monitor className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('admin.settings.welcome_email.device_mobile', 'Mobile view')}
                            className={`h-7 w-8 rounded-md transition-all ${welcomeEmailPreviewDevice === 'mobile' ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setWelcomeEmailPreviewDevice('mobile')}
                          >
                            <Smartphone className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Device Render viewport with fallback shell */}
                      <div className="flex items-center justify-center p-4 bg-muted/15 border border-border/40 rounded-2xl min-h-[440px]">
                        {welcomeEmailPreviewDevice === 'desktop' ? (
                          <div className="border border-border/80 rounded-xl overflow-hidden w-full bg-white shadow-sm transition-all duration-300">
                            <iframe
                              title={t('admin.settings.welcome_email.preview_desktop', 'Welcome Email Desktop Preview')}
                              srcDoc={welcomeEmailForm.body
                                .replace(/\{\{appName\}\}/g, brandingForm.appName || 'BotHive')
                                .replace(/\{\{companyName\}\}/g, 'Pointer Software')
                                .replace(/\{\{adminFullName\}\}/g, 'Felix Zona')
                                .replace(/\{\{adminUsername\}\}/g, 'felix')
                                .replace(/\{\{adminEmail\}\}/g, 'info@pointer.pk')
                                .replace(/\{\{planLabel\}\}/g, 'Pro')
                                .replace(/\{\{loginUrl\}\}/g, window.location.origin + '/auth')
                                .replace(/\{\{currentYear\}\}/g, String(new Date().getFullYear()))
                              }
                              className="w-full"
                              style={{ height: '394px', border: 'none' }}
                              sandbox="allow-same-origin"
                            />
                          </div>
                        ) : (
                          /* Realistic Interactive Phone Shell Simulation */
                          <div className="relative border-slate-950 bg-slate-950 border-[10px] rounded-[36px] h-[415px] w-[220px] shadow-2xl overflow-hidden transition-all duration-300 ring-4 ring-slate-800/10 shrink-0">
                            {/* Speaker notch */}
                            <div className="absolute top-0 inset-x-0 h-[16px] bg-slate-950 z-30 flex items-center justify-center">
                              <div className="w-12 h-2.5 bg-black rounded-full mb-0.5"></div>
                            </div>
                            {/* Screen Container */}
                            <div className="w-full h-full pt-[16px] bg-white">
                              <iframe
                                title={t('admin.settings.welcome_email.preview_mobile', 'Welcome Email Mobile Preview')}
                                srcDoc={welcomeEmailForm.body
                                  .replace(/\{\{appName\}\}/g, brandingForm.appName || 'BotHive')
                                  .replace(/\{\{companyName\}\}/g, 'Pointer Software')
                                  .replace(/\{\{adminFullName\}\}/g, 'Felix Zona')
                                  .replace(/\{\{adminUsername\}\}/g, 'felix')
                                  .replace(/\{\{adminEmail\}\}/g, 'info@pointer.pk')
                                  .replace(/\{\{planLabel\}\}/g, 'Pro')
                                  .replace(/\{\{loginUrl\}\}/g, window.location.origin + '/auth')
                                  .replace(/\{\{currentYear\}\}/g, String(new Date().getFullYear()))
                                }
                                className="w-full h-full border-none"
                                sandbox="allow-same-origin"
                              />
                            </div>
                            {/* Home Bar indicator */}
                            <div className="absolute bottom-1.5 inset-x-0 flex justify-center z-30 pointer-events-none">
                              <div className="w-16 h-1 bg-slate-800 rounded-full"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Redesigned Available Variables Grid with Interactive Click to Copy */}
                  <div className="p-5 bg-muted/20 border border-border/50 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold text-foreground">
                          {t('admin.settings.welcome_email.variables_label', 'Available Variables')}
                        </Label>
                        <p className="text-[11px] text-muted-foreground">
                          {t('admin.settings.welcome_email.variables_hint', 'Click on any variable token to instantly copy it to your clipboard.')}
                        </p>
                      </div>
                      <Copy className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1">
                      {[
                        ['{{appName}}', t('admin.settings.welcome_email.var_app_name', 'Application name (platform)')],
                        ['{{companyName}}', t('admin.settings.welcome_email.var_company_name', 'Company name')],
                        ['{{adminFullName}}', t('admin.settings.welcome_email.var_admin_full_name', "Admin's full name")],
                        ['{{adminUsername}}', t('admin.settings.welcome_email.var_admin_username', 'Admin username')],
                        ['{{adminEmail}}', t('admin.settings.welcome_email.var_admin_email', 'Admin email address')],
                        ['{{planLabel}}', t('admin.settings.welcome_email.var_plan_label', 'Selected plan name')],
                        ['{{loginUrl}}', t('admin.settings.welcome_email.var_login_url', 'Login page URL')],
                        ['{{currentYear}}', t('admin.settings.welcome_email.var_current_year', 'Current year (e.g. 2026)')],
                      ].map(([variable, desc]) => (
                        <div 
                          key={variable} 
                          onClick={() => handleCopyVariable(variable)}
                          className="flex flex-col p-2 bg-background border border-border/80 rounded-lg text-xs cursor-pointer group hover:border-primary/45 hover:shadow-sm hover:bg-muted/10 transition-all select-none"
                        >
                          <div className="flex items-center justify-between">
                            <code className="text-primary font-mono text-[11px] font-bold group-hover:text-blue-600 transition-colors">
                              {variable}
                            </code>
                            <Copy className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <span className="text-muted-foreground text-[10px] mt-1 line-clamp-1">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Redesigned Footer Action Panel */}
                  <div className="border-t border-border/40 pt-4 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5 px-3 py-2.5 bg-blue-50/40 dark:bg-blue-950/10 border border-blue-100/50 dark:border-blue-900/10 rounded-xl text-[11px] text-blue-700 dark:text-blue-300 w-full md:w-auto">
                      <Info className="h-4 w-4 shrink-0 text-blue-500" />
                      <span>{t('admin.settings.welcome_email.smtp_notice', 'Welcome emails require SMTP to be configured and enabled. Configure SMTP in the Email Settings tab.')}</span>
                    </div>
                    
                    <Button
                      onClick={() => saveWelcomeEmailMutation.mutate()}
                      disabled={saveWelcomeEmailMutation.isPending}
                      className="bg-[#2563eb] text-white hover:bg-blue-600 font-medium px-6 py-5 rounded-lg gap-2 shrink-0 shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all self-end md:self-auto"
                    >
                      {saveWelcomeEmailMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('admin.settings.welcome_email.saving', 'Saving...')}
                        </>
                      ) : (
                        <>
                          <Database className="h-4 w-4" />
                          {t('admin.settings.save_button', 'Save Template')}
                        </>
                      )}
                    </Button>
                  </div>

                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>
                  {t('admin.settings.configure_general_settings', 'Configure general application settings')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="defaultCurrency">Default Currency</Label>
                    
                    {/* Custom Currency Management Section */}
                    <div className="mb-3 space-y-2">
                      <Dialog open={showCustomCurrencyDialog} onOpenChange={setShowCustomCurrencyDialog}>
                        <DialogTrigger asChild>
                          <Button type="button" variant="outline" size="sm" className="w-full">
                            <Plus className="mr-2 h-4 w-4" />
                            Add Custom Currency
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add Custom Currency</DialogTitle>
                            <DialogDescription>
                              Add a custom currency with a 3-letter ISO 4217 code, name, and symbol.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label htmlFor="currency-code">Currency Code (ISO 4217)</Label>
                              <Input
                                id="currency-code"
                                placeholder="USD"
                                value={customCurrencyForm.code}
                                onChange={(e) => setCustomCurrencyForm({...customCurrencyForm, code: e.target.value.toUpperCase()})}
                                maxLength={3}
                              />
                              <p className="text-xs text-muted-foreground">
                                3 uppercase letters (e.g., USD, EUR, GBP)
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="currency-name">Currency Name</Label>
                              <Input
                                id="currency-name"
                                placeholder="US Dollar"
                                value={customCurrencyForm.name}
                                onChange={(e) => setCustomCurrencyForm({...customCurrencyForm, name: e.target.value})}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="currency-symbol">Currency Symbol</Label>
                              <Input
                                id="currency-symbol"
                                placeholder="$"
                                value={customCurrencyForm.symbol}
                                onChange={(e) => setCustomCurrencyForm({...customCurrencyForm, symbol: e.target.value})}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => {
                              setShowCustomCurrencyDialog(false);
                              setCustomCurrencyForm({ code: '', name: '', symbol: '' });
                            }}>
                              Cancel
                            </Button>
                            <Button onClick={handleAddCustomCurrency}>
                              Add Currency
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      {generalSettingsForm.customCurrencies.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-muted-foreground">Custom Currencies:</p>
                          <div className="space-y-1">
                            {generalSettingsForm.customCurrencies.map((currency) => (
                              <div key={currency.code} className="flex items-center justify-between p-2 border border-border rounded-md">
                                <span className="text-sm">
                                  {currency.code} - {currency.name} ({currency.symbol})
                                </span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveCustomCurrency(currency.code)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <Select
                      value={generalSettingsForm.defaultCurrency}
                      onValueChange={(value) => setGeneralSettingsForm({...generalSettingsForm, defaultCurrency: value})}
                    >
                      <SelectTrigger id="defaultCurrency">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {BUILT_IN_CURRENCY_OPTIONS.map((currency) => (
                          <SelectItem key={currency.code} value={currency.code}>
                            {currency.label}
                          </SelectItem>
                        ))}
                        {generalSettingsForm.customCurrencies.length > 0 && (
                          <>
                            <SelectSeparator />
                            {generalSettingsForm.customCurrencies.map((currency) => (
                              <SelectItem key={currency.code} value={currency.code}>
                                {currency.code} - {currency.name} ({currency.symbol})
                              </SelectItem>
                            ))}
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateFormat">Date Format</Label>
                    <Select
                      value={generalSettingsForm.dateFormat}
                      onValueChange={(value) => setGeneralSettingsForm({...generalSettingsForm, dateFormat: value})}
                    >
                      <SelectTrigger id="dateFormat">
                        <SelectValue placeholder="Select date format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                        <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                        <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="timeFormat">Time Format</Label>
                    <Select
                      value={generalSettingsForm.timeFormat}
                      onValueChange={(value) => setGeneralSettingsForm({...generalSettingsForm, timeFormat: value})}
                    >
                      <SelectTrigger id="timeFormat">
                        <SelectValue placeholder="Select time format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="12h">12-hour (AM/PM)</SelectItem>
                        <SelectItem value="24h">24-hour</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator className="my-6" />

                {/* Application Embedding Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">{t('admin.settings.embed.title', 'Application Embedding')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'admin.settings.embed.description',
                        'Generate HTML embed code to integrate {{appName}} into external websites or platforms',
                        { appName: brandingForm.appName || 'app' }
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="embedWidth">{t('admin.settings.embed.width_label', 'Embed Width')}</Label>
                      <Input
                        id="embedWidth"
                        type="text"
                        placeholder={t('admin.settings.embed.width_placeholder', '100% or 800px')}
                        value={embedSettings.width}
                        onChange={(e) => setEmbedSettings({...embedSettings, width: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="embedHeight">{t('admin.settings.embed.height_label', 'Embed Height')}</Label>
                      <Input
                        id="embedHeight"
                        type="text"
                        placeholder={t('admin.settings.embed.height_placeholder', '600px or 100vh')}
                        value={embedSettings.height}
                        onChange={(e) => setEmbedSettings({...embedSettings, height: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="borderRadius">{t('admin.settings.embed.border_radius_label', 'Border Radius')}</Label>
                      <Input
                        id="borderRadius"
                        type="text"
                        placeholder={t('admin.settings.embed.border_radius_placeholder', '8px')}
                        value={embedSettings.borderRadius}
                        onChange={(e) => setEmbedSettings({...embedSettings, borderRadius: e.target.value})}
                      />
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="showHeader"
                          checked={embedSettings.showHeader}
                          onChange={(e) => setEmbedSettings({...embedSettings, showHeader: e.target.checked})}
                          className="rounded"
                        />
                        <Label htmlFor="showHeader">{t('admin.settings.embed.show_header', 'Show Header')}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="allowFullscreen"
                          checked={embedSettings.allowFullscreen}
                          onChange={(e) => setEmbedSettings({...embedSettings, allowFullscreen: e.target.checked})}
                          className="rounded"
                        />
                        <Label htmlFor="allowFullscreen">{t('admin.settings.embed.allow_fullscreen', 'Allow Fullscreen')}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="boxShadow"
                          checked={embedSettings.boxShadow}
                          onChange={(e) => setEmbedSettings({...embedSettings, boxShadow: e.target.checked})}
                          className="rounded"
                        />
                        <Label htmlFor="boxShadow">{t('admin.settings.embed.box_shadow', 'Box Shadow')}</Label>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={generateEmbedCode}
                      className="flex items-center gap-2"
                    >
                      <Code className="h-4 w-4" />
                      {t('admin.settings.embed.generate_button', 'Generate Embed Code')}
                    </Button>
                    {embedCode && (
                      <>
                        <Button
                          variant="outline"
                          onClick={copyEmbedCode}
                          className="flex items-center gap-2"
                        >
                          {copySuccess ? (
                            <>
                              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                              {t('admin.settings.embed.copied', 'Copied!')}
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4" />
                              {t('admin.settings.embed.copy_clipboard', 'Copy to Clipboard')}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setShowEmbedPreview(!showEmbedPreview)}
                          className="flex items-center gap-2"
                        >
                          <Eye className="h-4 w-4" />
                          {showEmbedPreview
                            ? t('admin.settings.embed.hide_preview', 'Hide Preview')
                            : t('admin.settings.embed.preview_embed', 'Preview Embed')}
                        </Button>
                      </>
                    )}
                  </div>

                  {embedCode && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="embedCode">{t('admin.settings.embed.generated_code_label', 'Generated Embed Code')}</Label>
                        <div className="relative">
                          <textarea
                            id="embedCode"
                            readOnly
                            value={embedCode}
                            className="w-full h-32 p-3 text-sm font-mono bg-muted/50 border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                            placeholder={t('admin.settings.embed.textarea_placeholder', 'Generated embed code will appear here...')}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t(
                            'admin.settings.embed.copy_instruction',
                            'Copy this HTML code and paste it into your website where you want {{appName}} to appear.',
                            { appName: brandingForm.appName || 'BotHive' }
                          )}
                        </p>
                      </div>

                      {showEmbedPreview && embedCode && (
                        <div className="space-y-2">
                          <Label>{t('admin.settings.embed.preview_label', 'Embed Preview')}</Label>
                          <div className="border border-border rounded-lg p-4 bg-muted/50">
                            <div
                              className="bg-background rounded border border-border"
                              style={{
                                width: embedSettings.width === '100%' ? '100%' : embedSettings.width,
                                height: embedSettings.height,
                                maxWidth: '100%',
                                maxHeight: '700px',
                                overflow: 'hidden'
                              }}
                            >
                              <iframe {...getIframeProps()} />
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {t('admin.settings.embed.preview_hint', 'This is how the embedded application will appear on external websites.')}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-muted/40 p-4">
                    <div className="flex items-start space-x-2">
                      <div className="mt-0.5 text-muted-foreground">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="text-sm">
                        <p className="font-medium text-foreground">{t('admin.settings.embed.guidelines_title', 'Embedding Guidelines')}</p>
                        <ul className="mt-1 space-y-1 text-muted-foreground">
                          <li className="flex gap-2">
                            <span className="select-none" aria-hidden>•</span>
                            <span>{t('admin.settings.embed.guideline_1', 'The embed code points directly to the main application with embed context')}</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="select-none" aria-hidden>•</span>
                            <span>{t('admin.settings.embed.guideline_2', 'Users will authenticate within the embedded application with full functionality')}</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="select-none" aria-hidden>•</span>
                            <span>{t('admin.settings.embed.guideline_3', 'The iframe includes proper security sandboxing and permission controls')}</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="select-none" aria-hidden>•</span>
                            <span>{t('admin.settings.embed.guideline_4', 'Responsive design automatically adapts to the container size')}</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="select-none" aria-hidden>•</span>
                            <span>{t('admin.settings.embed.guideline_5', 'HTTPS is recommended for secure embedding on external websites')}</span>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>


                <Separator className="my-6" />

                {/* Plan Renewal Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">{t('admin.settings.plan_renewal.title', 'Plan Renewal Settings')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('admin.settings.plan_renewal.description', 'Control whether companies can have automatic plan renewals')}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="plan-renewal-enabled" className="text-base">
                        {t('admin.settings.plan_renewal.enable_label', 'Enable Plan Renewal')}
                      </Label>
                      <div className="text-sm text-muted-foreground">
                        {generalSettingsForm.planRenewalEnabled ? (
                          <span className="text-green-600 dark:text-green-400">
                            {t('admin.settings.plan_renewal.status_enabled', 'Plan renewal is enabled. Companies can set up automatic renewals.')}
                          </span>
                        ) : (
                          <span>
                            {t('admin.settings.plan_renewal.status_disabled', 'Plan renewal is disabled. Companies can use their plans indefinitely without expiry.')}
                          </span>
                        )}
                      </div>
                    </div>
                    <Switch
                      id="plan-renewal-enabled"
                      checked={generalSettingsForm.planRenewalEnabled}
                      onCheckedChange={(checked) =>
                        setGeneralSettingsForm({...generalSettingsForm, planRenewalEnabled: checked})
                      }
                    />
                  </div>

                  {!generalSettingsForm.planRenewalEnabled && (
                    <div className="rounded-lg border border-border bg-muted/40 p-4">
                      <div className="flex items-start space-x-2">
                        <div className="mt-0.5 text-muted-foreground">
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-foreground">{t('admin.settings.plan_renewal.unlimited_title', 'Unlimited Plan Usage')}</h4>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t('admin.settings.plan_renewal.unlimited_body', 'When plan renewal is disabled, companies can use their plans indefinitely without any expiry dates or renewal requirements. Plans will never expire and no renewal dialogs will be shown.')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <Separator className="my-6" />

                {/* Help & Support URL Section */}
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium">{t('admin.settings.help_support.section_title', 'Help & Support')}</h3>
                    <p className="text-sm text-muted-foreground">
                      {t('admin.settings.help_support.section_description', 'Configure the Help & Support URL that appears in the company sidebar')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="help-support-url">{t('admin.settings.help_support.url_label', 'Help & Support URL')}</Label>
                    <Input
                      id="help-support-url"
                      type="url"
                      value={generalSettingsForm.helpSupportUrl}
                      onChange={(e) => setGeneralSettingsForm({...generalSettingsForm, helpSupportUrl: e.target.value})}
                      placeholder={t('admin.settings.help_support.url_placeholder', 'https://docs.yourdomain.com')}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('admin.settings.help_support.url_hint', 'This URL will be used for the "Help & Support" link in the company sidebar. If left empty, it will default to https://docs.{domain}.')}
                    </p>
                  </div>
                </div>

                <Button
                  variant="brand"
                  onClick={() => saveGeneralSettingsMutation.mutate()}
                  disabled={saveGeneralSettingsMutation.isPending}
                  className="btn-brand-primary"
                >
                  {saveGeneralSettingsMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('admin.settings.save_general_settings', 'Save General Settings')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="registration">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings.registration.card_title', 'Company Registration Settings')}</CardTitle>
                <CardDescription>
                  {t('admin.settings.registration.card_description', 'Control how new companies can register for your platform')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="registration-enabled"
                    checked={registrationSettings.enabled}
                    onCheckedChange={(checked) => setRegistrationSettings({...registrationSettings, enabled: checked})}
                  />
                  <Label htmlFor="registration-enabled" className="text-sm font-medium">
                    {t('admin.settings.enable_company_registration', 'Enable Company Registration')}
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('admin.settings.registration_description', 'When enabled, new companies can register for accounts. When disabled, the registration page will show a message that registration is currently unavailable.')}
                </p>

                <Separator />

                <div className="flex items-center space-x-2">
                  <Switch
                    id="registration-approval"
                    checked={registrationSettings.requireApproval}
                    onCheckedChange={(checked) => setRegistrationSettings({...registrationSettings, requireApproval: checked})}
                    disabled={!registrationSettings.enabled}
                  />
                  <Label htmlFor="registration-approval" className="text-sm font-medium">
                    {t('admin.settings.registration.require_approval_label', 'Require Admin Approval')}
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('admin.settings.approval_description', 'When enabled, new company registrations will require super admin approval before they can access the platform.')}
                </p>

                <Separator />

                <div className="flex items-center space-x-2">
                  <Switch
                    id="registration-email-verification"
                    checked={registrationSettings.requireEmailVerification}
                    onCheckedChange={(checked) => setRegistrationSettings({...registrationSettings, requireEmailVerification: checked})}
                    disabled={!registrationSettings.enabled}
                  />
                  <Label htmlFor="registration-email-verification" className="text-sm font-medium">
                    {t('admin.settings.registration.require_email_verification_label', 'Require Email Verification')}
                  </Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('admin.settings.registration.require_email_verification_description', 'When enabled, new companies must verify their email with a code before registration is completed. When disabled, companies are created immediately.')}
                </p>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="default-plan">{t('admin.settings.registration.default_plan_label', 'Default Plan for New Companies')}</Label>
                  <Select
                    value={registrationSettings.defaultPlan}
                    onValueChange={(value) => setRegistrationSettings({...registrationSettings, defaultPlan: value})}
                    disabled={!registrationSettings.enabled || isLoadingPlans}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('admin.settings.registration.select_default_plan_placeholder', 'Select default plan')} />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingPlans ? (
                        <SelectItem value="loading" disabled>
                          <div className="flex items-center">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            {t('admin.settings.registration.loading_plans', 'Loading plans...')}
                          </div>
                        </SelectItem>
                      ) : plans && plans.length > 0 ? (
                        plans
                          .filter((plan: any) => plan.isActive)
                          .map((plan: any) => (
                            <SelectItem key={plan.id} value={plan.id.toString()}>
                              {t(
                                'admin.settings.registration.plan_option',
                                '{{name}} ({{price}}/month) - {{maxUsers}} users',
                                { name: plan.name, price: formatCurrency(plan.price), maxUsers: plan.maxUsers }
                              )}
                            </SelectItem>
                          ))
                      ) : (
                        <SelectItem value="none" disabled>
                          {t('admin.settings.registration.no_plans_available', 'No plans available')}
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    {t('admin.settings.registration.default_plan_helper', 'New companies will be automatically assigned to this plan upon registration.')}
                  </p>
                </div>

                <Button
                  variant="brand"
                  onClick={() => {
                    try {
                      const payload = {
                        enabled: Boolean(registrationSettings.enabled),
                        requireApproval: Boolean(registrationSettings.requireApproval),
                        requireEmailVerification: Boolean(registrationSettings.requireEmailVerification),
                        defaultPlan: registrationSettings.defaultPlan || (plans && plans.length > 0 ? plans[0].id.toString() : '1')
                      };

                      if (payload.enabled && !payload.defaultPlan) {
                        toast({
                          title: t('admin.settings.registration.validation_error_title', 'Validation Error'),
                          description: t('admin.settings.registration.default_plan_required', 'Default plan is required when registration is enabled'),
                          variant: 'destructive'
                        });
                        return;
                      }

                      saveRegistrationMutation.mutate();
                    } catch (error) {
                      toast({
                        title: t('admin.settings.registration.error_title', 'Error'),
                        description: t('admin.settings.registration.unexpected_error', 'An unexpected error occurred'),
                        variant: 'destructive'
                      });
                    }
                  }}
                  disabled={saveRegistrationMutation.isPending}
                  className="btn-brand-primary"
                >
                  {saveRegistrationMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t('admin.settings.registration.save_button', 'Save Registration Settings')}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="backup">
            <BackupManagement />
          </TabsContent>

          <TabsContent value="updates">
            <SystemUpdatesTab />
          </TabsContent>

          <TabsContent value="ai-credentials">
            <AiCredentialsTab />
          </TabsContent>

          <TabsContent value="ai-usage">
            <SystemUsageAnalytics />
          </TabsContent>

          <TabsContent value="platform">
            <Card>
              <CardHeader>
                <CardTitle>{t('admin.settings.platform.title', 'Platform Configuration')}</CardTitle>
                <CardDescription>
                  {t('admin.settings.platform.description', 'Configure platform-wide integrations and partner API settings')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Meta WhatsApp Business API Partner Configuration */}
                  <div className="border border-border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-foreground">
                          {t('admin.settings.platform.meta_partner.title', 'Meta Partner API')}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {t('admin.settings.platform.meta_partner.channel_description', 'Configure WhatsApp embedded signup, Messenger Page connections, and direct Instagram login.')}
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowMetaPartnerConfigModal(true)}
                        variant="outline"
                        className="btn-brand-primary"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        {t('admin.settings.configure', 'Configure')}
                      </Button>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <p>
                        •{' '}
                        {t('admin.settings.platform.meta.benefits.embedded_signup', 'Tech Provider embedded signup integration')}
                      </p>
                      <p>
                        •{' '}
                        {t('admin.settings.platform.meta.benefits.streamlined_onboarding', 'Streamlined WhatsApp Business account onboarding')}
                      </p>
                      <p>
                        •{' '}
                        {t('admin.settings.platform.meta.benefits.messenger_pages', 'Easy setup for Messenger via Facebook Pages')}
                      </p>
                      <p>
                        •{' '}
                        {t('admin.settings.platform.meta.benefits.instagram_accounts', 'Easy setup for Instagram Business accounts')}
                      </p>
                      <p>
                        •{' '}
                        {t(
                          'admin.settings.platform.meta.benefits.automatic_provisioning',
                          'Automatic phone number provisioning (WhatsApp)'
                        )}
                      </p>
                    </div>
                  </div>

                  {/* TikTok Business Messaging API Configuration */}
                  <div className="border border-border rounded-lg p-4 bg-card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
                          <i className="ri-tiktok-line text-xl"></i>
                          {t('admin.settings.platform.tiktok.title', 'TikTok Business Messaging API')}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {t(
                            'admin.settings.platform.tiktok.description',
                            'Configure TikTok Partner credentials for company messaging integration'
                          )}
                        </p>
                      </div>
                      <Button
                        onClick={() => setShowTikTokPlatformConfigModal(true)}
                        variant="outline"
                        className="btn-brand-primary"
                      >
                        <Settings className="w-4 h-4 mr-2" />
                        {t('admin.settings.configure', 'Configure')}
                      </Button>
                    </div>

                    <div className="text-sm text-muted-foreground">
                      <p>
                        •{' '}
                        {t(
                          'admin.settings.platform.tiktok.benefit_platform',
                          'Platform-wide TikTok Business Messaging integration'
                        )}
                      </p>
                      <p>
                        •{' '}
                        {t(
                          'admin.settings.platform.tiktok.benefit_oauth',
                          'OAuth 2.0 authentication for company accounts'
                        )}
                      </p>
                      <p>
                        •{' '}
                        {t('admin.settings.platform.tiktok.benefit_messaging', 'Direct messaging with TikTok users')}
                      </p>
                      <p>
                        •{' '}
                        {t(
                          'admin.settings.platform.tiktok.benefit_partner_approval',
                          'Requires TikTok Messaging Partner approval'
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom-scripts">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="h-5 w-5" />
                  {t('admin.settings.custom_scripts', 'Custom Scripts')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'admin.settings.custom_scripts_page.card_description',
                    'Inject custom HTML and JavaScript code globally across your application. This feature allows you to integrate third-party services like translation tools, analytics, or other widgets.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Security Warning */}
                <Alert className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
                  <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                    <strong>{t('admin.settings.custom_scripts_page.warning_title', 'Security Warning:')}</strong>{' '}
                    {t(
                      'admin.settings.custom_scripts_page.warning_body',
                      "Only add scripts from trusted sources. Malicious scripts can compromise your application's security and user data. Scripts are validated against a whitelist of common CDNs and services."
                    )}
                  </AlertDescription>
                </Alert>

                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-base font-medium">
                      {t('admin.settings.custom_scripts_page.enable_label', 'Enable Custom Scripts')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'admin.settings.custom_scripts_page.enable_hint',
                        'Toggle to enable or disable custom script injection globally'
                      )}
                    </p>
                  </div>
                  <Switch
                    checked={customScriptsForm.enabled}
                    onCheckedChange={(checked) =>
                      setCustomScriptsForm(prev => ({ ...prev, enabled: checked }))
                    }
                  />
                </div>

                {/* Scripts Input */}
                <div className="space-y-3">
                  <Label htmlFor="custom-scripts" className="text-base font-medium">
                    {t('admin.settings.custom_scripts_page.editor_heading', 'Custom Scripts')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      'admin.settings.custom_scripts_page.editor_hint',
                      'Paste your HTML/JavaScript code here. Scripts will be injected into the <head> section of all pages.'
                    )}
                  </p>
                  <Textarea
                    id="custom-scripts"
                    placeholder={`Example:
<script type="text/javascript" src="https://cdn.weglot.com/weglot.min.js"></script>
<script>
    Weglot.initialize({
        api_key: 'your_api_key_here'
    });
</script>`}
                    value={customScriptsForm.scripts}
                    onChange={(e) =>
                      setCustomScriptsForm(prev => ({ ...prev, scripts: e.target.value }))
                    }
                    className="min-h-[200px] font-mono text-sm"
                    disabled={!customScriptsForm.enabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'admin.settings.custom_scripts_page.domains_note',
                      'Supported domains include: cdn.jsdelivr.net, cdnjs.cloudflare.com, unpkg.com, googleapis.com, facebook.net, stripe.com, paypal.com, weglot.com, and more.'
                    )}
                  </p>
                </div>

                {/* Last Modified Info */}
                {customScriptsForm.lastModified && (
                  <div className="text-sm text-muted-foreground">
                    {t('admin.settings.custom_scripts_page.last_modified', 'Last modified: {{date}}', {
                      date: new Date(customScriptsForm.lastModified).toLocaleString(),
                    })}
                  </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveCustomScriptsMutation.mutate()}
                    disabled={saveCustomScriptsMutation.isPending}
                    className="btn-brand-primary"
                  >
                    {saveCustomScriptsMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('admin.settings.custom_scripts_page.save', 'Save Custom Scripts')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom-css">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Paintbrush className="h-5 w-5" />
                  {t('admin.settings.custom_css', 'Custom CSS')}
                </CardTitle>
                <CardDescription>
                  {t(
                    'admin.settings.custom_css_page.card_description',
                    'Inject custom CSS styles globally across your application.'
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
              

                {/* Enable/Disable Toggle */}
                <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-base font-medium">
                      {t('admin.settings.custom_css_page.enable_label', 'Enable Custom CSS')}
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'admin.settings.custom_css_page.enable_hint',
                        'Toggle to enable or disable custom CSS injection globally'
                      )}
                    </p>
                  </div>
                  <Switch
                    checked={customCssForm.enabled}
                    onCheckedChange={(checked) =>
                      setCustomCssForm(prev => ({ ...prev, enabled: checked }))
                    }
                  />
                </div>

                {/* CSS Input */}
                <div className="space-y-3">
                  <Label htmlFor="custom-css" className="text-base font-medium">
                    {t('admin.settings.custom_css_page.editor_heading', 'Custom CSS')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t(
                      'admin.settings.custom_css_page.editor_hint',
                      'Paste your CSS code here. Styles will be injected into the <head> section of all pages.'
                    )}
                  </p>
                  <Textarea
                    id="custom-css"
                    placeholder={`Example:
/* Custom button styles */
.btn-brand-primary {
  border-radius: 8px;
  font-weight: 600;
}

/* Custom header styles */
header {
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

/* Custom sidebar styles (use !important to override inline styles) */
aside {
  background-color: #f5f5f5 !important;
}

/* Or target admin sidebar specifically */
div.flex.flex-1.relative > aside {
  background-color: #f5f5f5 !important;
}`}
                    value={customCssForm.css}
                    onChange={(e) =>
                      setCustomCssForm(prev => ({ ...prev, css: e.target.value }))
                    }
                    className="min-h-[200px] font-mono text-sm"
                    disabled={!customCssForm.enabled}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'admin.settings.custom_css_page.selectors_note',
                      'CSS will be applied globally. Use specific selectors to target elements without affecting the entire application.'
                    )}
                  </p>
                </div>

                {/* Last Modified Info */}
                {customCssForm.lastModified && (
                  <div className="text-sm text-muted-foreground">
                    {t('admin.settings.custom_css_page.last_modified', 'Last modified: {{date}}', {
                      date: new Date(customCssForm.lastModified).toLocaleString(),
                    })}
                  </div>
                )}

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={() => saveCustomCssMutation.mutate()}
                    disabled={saveCustomCssMutation.isPending}
                    className="btn-brand-primary"
                  >
                    {saveCustomCssMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('admin.settings.custom_css_page.save', 'Save Custom CSS')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="frontend-website">
            <FrontendWebsiteManagementSection
              frontendWebsiteEnabled={generalSettingsForm.frontendWebsiteEnabled}
              persistedFrontendWebsiteEnabled={persistedGeneralSettings.frontendWebsiteEnabled}
              onFrontendWebsiteEnabledChange={(checked) =>
                setGeneralSettingsForm({ ...generalSettingsForm, frontendWebsiteEnabled: checked })
              }
              onSavePublishState={handleSaveFrontendWebsitePublishState}
              isSavingPublishState={saveFrontendWebsitePublishStateMutation.isPending}
            />
          </TabsContent>


        </Tabs>

        {/* Partner Configuration Modals */}
        <MetaPartnerConfigurationForm
          isOpen={showMetaPartnerConfigModal}
          onClose={() => setShowMetaPartnerConfigModal(false)}
          onSuccess={() => {
            toast({
              title: t('admin.settings.toast.meta_partner_saved_title', 'Success'),
              description: t(
                'admin.settings.toast.meta_partner_saved_description',
                'Meta Partner configuration updated successfully'
              ),
            });
          }}
        />

        <TikTokPlatformConfigForm
          isOpen={showTikTokPlatformConfigModal}
          onClose={() => setShowTikTokPlatformConfigModal(false)}
          onSuccess={() => {
            toast({
              title: t('admin.settings.toast.tiktok_platform_saved_title', 'Success'),
              description: t(
                'admin.settings.toast.tiktok_platform_saved_description',
                'TikTok platform configuration updated successfully'
              ),
            });
            setShowTikTokPlatformConfigModal(false);
          }}
        />
      </div>
    </AdminLayout>
  );
}
