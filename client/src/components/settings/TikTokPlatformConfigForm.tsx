import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { CheckCircle2, Copy, RefreshCw, Loader2, Trash2 } from 'lucide-react';
import {
  TIKTOK_ALLOWED_SCOPES,
  buildCanonicalTikTokOAuthRedirectUriFromOrigin,
  canonicalizeTikTokOAuthRedirectUri,
  getTikTokOAuthRedirectOriginIssues,
  normalizeTikTokOAuthRedirectUri,
  parseTikTokScopeList,
  TikTokPartnerConfigValidationError,
} from '@shared/types/tiktok';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface TikTokBusinessMessagingConfig {
  clientKey: string;
  clientSecret: string;
  webhookVerifyToken: string;
}

const INITIAL_FORM_DATA: TikTokBusinessMessagingConfig = {
  clientKey: '',
  clientSecret: '',
  webhookVerifyToken: '',
};

export function TikTokPlatformConfigForm({ isOpen, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [existingConfig, setExistingConfig] = useState<any>(null);

  const [formData, setFormData] = useState<TikTokBusinessMessagingConfig>({ ...INITIAL_FORM_DATA });
  const [oauthAuthorizationUrl, setOauthAuthorizationUrl] = useState('');
  const [oauthScopesCsv, setOauthScopesCsv] = useState(TIKTOK_ALLOWED_SCOPES.join(', '));
  /** Persisted TikTok OAuth redirect URI (trimmed on submit); not replaced by current browser origin on unrelated saves. */
  const [oauthRedirectUri, setOauthRedirectUri] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadExistingConfiguration();
    }
  }, [isOpen]);

  const loadExistingConfiguration = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/partner-configurations/tiktok');
      if (response.ok) {
        const config = await response.json();
        setExistingConfig(config);
        setFormData({
          clientKey: config.partnerApiKey || '',
          clientSecret:
            (config.partnerSecret && String(config.partnerSecret).trim() !== '')
              ? config.partnerSecret
              : config.partnerId || '',
          webhookVerifyToken: config.webhookVerifyToken || '',
        });
        const pp =
          config.publicProfile && typeof config.publicProfile === 'object'
            ? (config.publicProfile as Record<string, unknown>)
            : {};
        setOauthAuthorizationUrl(
          typeof pp.accountHolderAuthorizationUrl === 'string' ? pp.accountHolderAuthorizationUrl : ''
        );
        const scopes = pp.allowedScopes;
        setOauthScopesCsv(
          Array.isArray(scopes) && scopes.length > 0
            ? scopes.join(', ')
            : TIKTOK_ALLOWED_SCOPES.join(', ')
        );
        const savedRedirect =
          typeof config.redirectUrl === 'string' && String(config.redirectUrl).trim() !== ''
            ? String(config.redirectUrl).trim()
            : '';
        if (savedRedirect) {
          try {
            setOauthRedirectUri(canonicalizeTikTokOAuthRedirectUri(savedRedirect));
          } catch {
            setOauthRedirectUri(
              normalizeTikTokOAuthRedirectUri(savedRedirect) ||
                buildCanonicalTikTokOAuthRedirectUriFromOrigin(window.location.origin)
            );
          }
        } else {
          setOauthRedirectUri(buildCanonicalTikTokOAuthRedirectUriFromOrigin(window.location.origin));
        }
      } else {
        setExistingConfig(null);
        setFormData({ ...INITIAL_FORM_DATA });
        setOauthAuthorizationUrl('');
        setOauthScopesCsv(TIKTOK_ALLOWED_SCOPES.join(', '));
        setOauthRedirectUri(buildCanonicalTikTokOAuthRedirectUriFromOrigin(window.location.origin));
      }
    } catch (error) {
      console.error('Error loading TikTok platform configuration:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: value }));
    },
    []
  );

  const handleAuthorizationUrlChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setOauthAuthorizationUrl(value);
    const trimmed = value.trim();
    if (!trimmed) return;
    try {
      const parsed = parseTikTokScopeList(new URL(trimmed).searchParams.get('scope'));
      if (parsed.length > 0) {
        setOauthScopesCsv(parsed.join(', '));
      }
    } catch {
      /* ignore invalid URL until save-time normalization */
    }
  }, []);

  const resetForm = useCallback(() => {
    setFormData({ ...INITIAL_FORM_DATA });
    setExistingConfig(null);
    setIsSubmitting(false);
    setIsValidating(false);
    setOauthAuthorizationUrl('');
    setOauthScopesCsv(TIKTOK_ALLOWED_SCOPES.join(', '));
    setOauthRedirectUri('');
  }, []);

  const regenerateRedirectUriFromCurrentOrigin = useCallback(() => {
    setOauthRedirectUri(buildCanonicalTikTokOAuthRedirectUriFromOrigin(window.location.origin));
    toast({
      title: t('settings.tiktok_platform_config.toast.redirect_reset_title', 'Redirect URL updated'),
      description: t(
        'settings.tiktok_platform_config.toast.redirect_reset_description',
        "OAuth redirect URL was set from this site's origin. Register the same value in the TikTok portal."
      ),
    });
  }, [toast, t]);

  const generateVerifyToken = useCallback(() => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const token = Array.from(array, byte => chars[byte % chars.length]).join('');
    setFormData(prev => ({ ...prev, webhookVerifyToken: token }));
    toast({
      title: t('settings.tiktok_platform_config.toast.token_generated_title', 'Token Generated'),
      description: t(
        'settings.tiktok_platform_config.toast.token_generated_description',
        'A secure webhook verify token has been generated.'
      ),
    });
  }, [toast, t]);

  const copyToClipboard = useCallback(
    (value: string, label: string) => {
      navigator.clipboard.writeText(value);
      toast({
        title: t('settings.tiktok_platform_config.toast.copied_title', 'Copied'),
        description: t('settings.tiktok_platform_config.toast.copied_description', '{{label}} copied to clipboard.', {
          label,
        }),
      });
    },
    [toast, t]
  );

  const validateCredentials = async () => {
    if (!formData.clientKey || !formData.clientSecret) {
      toast({
        title: t('settings.tiktok_platform_config.toast.validation_error_title', 'Validation Error'),
        description: t(
          'settings.tiktok_platform_config.toast.client_key_secret_required',
          'Client Key and Client Secret are required.'
        ),
        variant: 'destructive',
      });
      return;
    }

    setIsValidating(true);
    try {
      const response = await fetch('/api/admin/partner-configurations/tiktok/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientKey: formData.clientKey,
          clientSecret: formData.clientSecret,
        }),
      });
      const result = await response.json();

      if (response.ok && result.valid) {
        toast({
          title: t('settings.tiktok_platform_config.toast.valid_title', 'Valid'),
          description: t(
            'settings.tiktok_platform_config.toast.valid_description',
            'TikTok API credentials verified successfully.'
          ),
        });
      } else {
        toast({
          title: t('settings.tiktok_platform_config.toast.invalid_credentials_title', 'Invalid Credentials'),
          description:
            result.error ||
            t(
              'settings.tiktok_platform_config.toast.invalid_credentials_fallback',
              'Check your Client Key and Client Secret.'
            ),
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: t('settings.tiktok_platform_config.toast.error_title', 'Error'),
        description: t(
          'settings.tiktok_platform_config.toast.validation_request_failed',
          'Credential validation failed. Please try again.'
        ),
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clientKey || !formData.clientSecret) {
      toast({
        title: t('settings.tiktok_platform_config.toast.validation_error_title', 'Validation Error'),
        description: t(
          'settings.tiktok_platform_config.toast.client_key_secret_required',
          'Client Key and Client Secret are required.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (!formData.webhookVerifyToken) {
      toast({
        title: t('settings.tiktok_platform_config.toast.validation_error_title', 'Validation Error'),
        description: t(
          'settings.tiktok_platform_config.toast.webhook_token_required',
          'Webhook Verify Token is required for message event delivery.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (existingConfig) {
      const configId = existingConfig.id;
      if (configId == null || !Number.isFinite(Number(configId))) {
        toast({
          title: t('settings.tiktok_platform_config.toast.error_title', 'Error'),
          description: t(
            'settings.tiktok_platform_config.toast.config_missing_id',
            'Cannot update: configuration has no valid id. Reload and try again.'
          ),
          variant: 'destructive',
        });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const existingPP =
        existingConfig?.publicProfile && typeof existingConfig.publicProfile === 'object'
          ? (existingConfig.publicProfile as Record<string, unknown>)
          : {};
      const scopeList = oauthScopesCsv
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const publicProfile: Record<string, unknown> = {
        ...existingPP,
        allowedScopes: scopeList.length > 0 ? scopeList : [...TIKTOK_ALLOWED_SCOPES],
      };
      if (oauthAuthorizationUrl.trim()) {
        publicProfile.accountHolderAuthorizationUrl = oauthAuthorizationUrl.trim();
      } else {
        delete publicProfile.accountHolderAuthorizationUrl;
      }

      let redirectUrl: string;
      const trimmedRedirect = oauthRedirectUri.trim();
      try {
        redirectUrl =
          trimmedRedirect
            ? canonicalizeTikTokOAuthRedirectUri(trimmedRedirect)
            : buildCanonicalTikTokOAuthRedirectUriFromOrigin(window.location.origin);
      } catch (e) {
        const msg =
          e instanceof TikTokPartnerConfigValidationError
            ? e.message
            : 'OAuth redirect URL is invalid. It must be an absolute https URL whose path is exactly /api/tiktok/oauth/callback (no trailing slash).';
        toast({
          title: t('settings.tiktok_platform_config.toast.validation_error_title', 'Validation Error'),
          description: msg,
          variant: 'destructive',
        });
        setIsSubmitting(false);
        return;
      }

      const payload = {
        provider: 'tiktok',
        partnerApiKey: formData.clientKey.trim(),
        partnerSecret: formData.clientSecret.trim(),
               partnerWebhookUrl: `${window.location.origin}/api/webhooks/tiktok`,
        webhookVerifyToken: formData.webhookVerifyToken.trim(),
        redirectUrl,
        publicProfile,
        isActive: true,
      };

      const isUpdate = !!existingConfig;
      const saveUrl = isUpdate
        ? `/api/admin/partner-configurations/${existingConfig!.id}`
        : '/api/admin/partner-configurations/tiktok';

      const response = await fetch(saveUrl, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast({
          title: t('settings.tiktok_platform_config.toast.success_title', 'Success'),
          description: existingConfig
            ? t(
                'settings.tiktok_platform_config.toast.success_updated',
                'TikTok Business Messaging configuration updated.'
              )
            : t(
                'settings.tiktok_platform_config.toast.success_created',
                'TikTok Business Messaging configuration created.'
              ),
        });
        resetForm();
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        toast({
          title: t('settings.tiktok_platform_config.toast.error_title', 'Error'),
          description:
            error.message ||
            t('settings.tiktok_platform_config.toast.save_failed_fallback', 'Failed to save configuration.'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: t('settings.tiktok_platform_config.toast.error_title', 'Error'),
        description: t('settings.tiktok_platform_config.toast.unexpected_error', 'An unexpected error occurred.'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingConfig) return;
    const configId = existingConfig.id;
    if (configId == null || !Number.isFinite(Number(configId))) {
      toast({
        title: t('settings.tiktok_platform_config.toast.error_title', 'Error'),
        description: t(
          'settings.tiktok_platform_config.toast.config_missing_id_delete',
          'Cannot delete: configuration has no valid id. Reload and try again.'
        ),
        variant: 'destructive',
      });
      return;
    }
    if (
      !confirm(
        t(
          'settings.tiktok_platform_config.confirm_delete',
          'Delete the TikTok Business Messaging configuration? This will disconnect all linked TikTok channels.'
        )
      )
    )
      return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/partner-configurations/${configId}`, { method: 'DELETE' });
      if (response.ok) {
        toast({
          title: t('settings.tiktok_platform_config.toast.deleted_title', 'Deleted'),
          description: t('settings.tiktok_platform_config.toast.deleted_description', 'TikTok configuration removed.'),
        });
        resetForm();
        onSuccess();
        onClose();
      } else {
        const error = await response.json();
        toast({
          title: t('settings.tiktok_platform_config.toast.error_title', 'Error'),
          description:
            error.message ||
            t('settings.tiktok_platform_config.toast.delete_failed_fallback', 'Failed to delete.'),
          variant: 'destructive',
        });
      }
    } catch {
      toast({
        title: t('settings.tiktok_platform_config.toast.error_title', 'Error'),
        description: t('settings.tiktok_platform_config.toast.unexpected_error', 'An unexpected error occurred.'),
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isValidating;

  const derivedWebhookUrl = `${window.location.origin}/api/webhooks/tiktok`;
  const displayRedirectUrl =
    oauthRedirectUri.trim() ||
    buildCanonicalTikTokOAuthRedirectUriFromOrigin(window.location.origin);
  const redirectPreviewOrigin = useMemo(() => {
    const t = oauthRedirectUri.trim();
    if (!t) return window.location.origin;
    try {
      return new URL(t).origin;
    } catch {
      return window.location.origin;
    }
  }, [oauthRedirectUri]);
  const redirectOriginIssues = getTikTokOAuthRedirectOriginIssues(redirectPreviewOrigin);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-settings-tiktokplatformconfigform.dialogcontent.settings.tiktok_platform_config.dialog_title" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="ri-tiktok-line text-2xl" />
            {t('settings.tiktok_platform_config.dialog_title', 'TikTok Business Messaging')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('settings.tiktok_platform_config.portal_intro_before', 'Create or open an app in the ')}
                <a
                  href="https://business-api.tiktok.com/portal/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {t('settings.tiktok_platform_config.portal_link_text', 'TikTok Business API portal')}
                </a>
                {t('settings.tiktok_platform_config.portal_intro_after', ' and copy your Client Key and Client Secret below.')}
              </p>

              <div>
                <Label htmlFor="clientKey">
                  {t('settings.tiktok_platform_config.client_key_label', 'Client Key *')}
                </Label>
                <Input data-tour="components-settings-tiktokplatformconfigform.input.settings.tiktok_platform_config.client_key_placeholder"
                  id="clientKey"
                  name="clientKey"
                  value={formData.clientKey}
                  onChange={handleInputChange}
                  placeholder={t(
                    'settings.tiktok_platform_config.client_key_placeholder',
                    'TikTok App Client Key (App ID)'
                  )}
                  required
                  disabled={isBusy}
                />
              </div>

              <div>
                <Label htmlFor="clientSecret">
                  {t('settings.tiktok_platform_config.client_secret_label', 'Client Secret *')}
                </Label>
                <Input data-tour="components-settings-tiktokplatformconfigform.input.settings.tiktok_platform_config.client_secret_placeholder"
                  id="clientSecret"
                  name="clientSecret"
                  type="password"
                  value={formData.clientSecret}
                  onChange={handleInputChange}
                  placeholder={t(
                    'settings.tiktok_platform_config.client_secret_placeholder',
                    'TikTok App Client Secret'
                  )}
                  required
                  disabled={isBusy}
                />
              </div>

              <div>
                <Label htmlFor="webhookVerifyToken">
                  {t('settings.tiktok_platform_config.webhook_token_label', 'Webhook Verify Token *')}
                </Label>
                <div className="flex gap-2">
                  <Input data-tour="components-settings-tiktokplatformconfigform.input.settings.tiktok_platform_config.webhook_token_placeholder"
                    id="webhookVerifyToken"
                    name="webhookVerifyToken"
                    value={formData.webhookVerifyToken}
                    onChange={handleInputChange}
                    placeholder={t(
                      'settings.tiktok_platform_config.webhook_token_placeholder',
                      'Webhook verification token'
                    )}
                    required
                    disabled={isBusy}
                    className="flex-1"
                  />
                  <Button data-tour="components-settings-tiktokplatformconfigform.button.settings.tiktok_platform_config.generate_token_title"
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={generateVerifyToken}
                    title={t('settings.tiktok_platform_config.generate_token_title', 'Generate token')}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t(
                    'settings.tiktok_platform_config.webhook_token_hint',
                    "Must match the token in your TikTok app's webhook settings."
                  )}
                </p>
              </div>

              <div>
                <Label htmlFor="oauthAuthorizationUrl">
                  {t(
                    'settings.tiktok_platform_config.oauth_authorization_url_label',
                    'Account holder authorization URL (recommended)'
                  )}
                </Label>
                <Textarea data-tour="components-settings-tiktokplatformconfigform.textarea.settings.tiktok_platform_config.oauth_authorization_url_placeholder"
                  id="oauthAuthorizationUrl"
                  name="oauthAuthorizationUrl"
                  value={oauthAuthorizationUrl}
                  onChange={handleAuthorizationUrlChange}
                  placeholder={t(
                    'settings.tiktok_platform_config.oauth_authorization_url_placeholder',
                    'Paste the full authorize URL from the TikTok Business API portal (leave blank to build from scopes below)'
                  )}
                  disabled={isBusy}
                  rows={3}
                  className="mt-1.5 resize-y min-h-[4.5rem]"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t(
                    'settings.tiktok_platform_config.oauth_authorization_url_portal_note',
                    'Copy the URL from My Apps → App Detail → Basic Information → TikTok account holder authorization URL in the TikTok developer portal. Paste it unchanged; scopes in the URL sync to the field below as you type.'
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t(
                    'settings.tiktok_platform_config.oauth_authorization_url_hint',
                    'When set, the connect flow uses this URL and applies state and redirect_uri at runtime. Otherwise scopes are used to build the authorize URL.'
                  )}
                </p>
              </div>

              <div>
                <Label htmlFor="oauthScopesCsv">
                  {t('settings.tiktok_platform_config.oauth_scopes_label', 'OAuth scopes (comma-separated)')}
                </Label>
                <Input data-tour="components-settings-tiktokplatformconfigform.input.oauthScopesCsv"
                  id="oauthScopesCsv"
                  name="oauthScopesCsv"
                  value={oauthScopesCsv}
                  onChange={e => setOauthScopesCsv(e.target.value)}
                  placeholder={TIKTOK_ALLOWED_SCOPES.join(', ')}
                  disabled={isBusy}
                  className="mt-1.5"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t(
                    'settings.tiktok_platform_config.oauth_scopes_hint',
                    'Must match the portal-approved scope list for your app. Used for consent when no authorization URL is set, and for verifying granted permissions after OAuth.'
                  )}
                </p>
              </div>
            </section>

            <div className="space-y-3 rounded-md border border-border bg-muted/30 p-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground">
                  {t('settings.tiktok_platform_config.webhook_url_label', 'Webhook URL')}
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-sm">{derivedWebhookUrl}</code>
                  <Button data-tour="components-settings-tiktokplatformconfigform.button.settings.tiktok_platform_config.webhook_url_label"
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(
                        derivedWebhookUrl,
                        t('settings.tiktok_platform_config.webhook_url_label', 'Webhook URL')
                      )
                    }
                    title={t('settings.tiktok_platform_config.copy_webhook_title', 'Copy webhook URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground">
                  {t('settings.tiktok_platform_config.redirect_url_label', 'Redirect URL')}
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-sm">{displayRedirectUrl}</code>
                  <Button data-tour="components-settings-tiktokplatformconfigform.button.settings.tiktok_platform_config.regenerate_redirect_title"
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={regenerateRedirectUriFromCurrentOrigin}
                    disabled={isBusy}
                    title={t(
                      'settings.tiktok_platform_config.regenerate_redirect_title',
                      'Set redirect URL from this origin'
                    )}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <Button data-tour="components-settings-tiktokplatformconfigform.button.settings.tiktok_platform_config.redirect_url_label"
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() =>
                      copyToClipboard(
                        displayRedirectUrl,
                        t('settings.tiktok_platform_config.redirect_url_label', 'Redirect URL')
                      )
                    }
                    title={t('settings.tiktok_platform_config.copy_redirect_title', 'Copy redirect URL')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(
                    'settings.tiktok_platform_config.redirect_preserve_hint',
                    "This value is saved with your configuration. Use the reset control only if you intentionally want the redirect to match this browser's origin."
                  )}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t(
                    'settings.tiktok_platform_config.redirect_exact_match_portal_hint',
                    'Register this exact redirect URL in the TikTok developer portal (same string as shown here, including https origin and path with no trailing slash). Mismatches break OAuth after consent.'
                  )}
                </p>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {t(
                  'settings.tiktok_platform_config.urls_register_hint',
                  "Register these URLs in your TikTok app's settings."
                )}
              </p>
              {redirectOriginIssues.length > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  {redirectOriginIssues.includes('not_https') && (
                    <p>
                      {t(
                        'settings.tiktok_platform_config.redirect_origin_not_https',
                        'TikTok production apps expect an HTTPS redirect URL. Use your deployed HTTPS origin when registering the redirect in the TikTok portal.'
                      )}
                    </p>
                  )}
                  {redirectOriginIssues.includes('explicit_port') && (
                    <p>
                      {t(
                        'settings.tiktok_platform_config.redirect_origin_explicit_port',
                        'Avoid non-default ports in the public redirect URL unless your TikTok app registration explicitly allows this origin.'
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <div>
                {existingConfig && (
                  <Button data-tour="components-settings-tiktokplatformconfigform.button.settings.tiktok_platform_config.delete" type="button" variant="destructive" onClick={handleDelete} disabled={isBusy}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('settings.tiktok_platform_config.delete', 'Delete')}
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button data-tour="components-settings-tiktokplatformconfigform.button.common.cancel"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    onClose();
                  }}
                  disabled={isBusy}
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button data-tour="components-settings-tiktokplatformconfigform.button.settings.tiktok_platform_config.validating"
                  type="button"
                  variant="outline"
                  onClick={validateCredentials}
                  disabled={isBusy || !formData.clientKey || !formData.clientSecret}
                >
                  {isValidating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  {isValidating
                    ? t('settings.tiktok_platform_config.validating', 'Validating...')
                    : t('settings.tiktok_platform_config.validate_credentials', 'Validate Credentials')}
                </Button>
                <Button data-tour="components-settings-tiktokplatformconfigform.button.settings.tiktok_platform_config.saving" type="submit" disabled={isBusy}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('settings.tiktok_platform_config.saving', 'Saving...')}
                    </>
                  ) : existingConfig ? (
                    t('settings.tiktok_platform_config.update_configuration', 'Update Configuration')
                  ) : (
                    t('settings.tiktok_platform_config.save_configuration', 'Save Configuration')
                  )}
                </Button>
              </div>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
