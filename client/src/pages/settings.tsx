import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import { RiKanbanView2, RiPlugLine, RiWhatsappFill } from 'react-icons/ri';
import { AppSumoBilling, AppSumoPaidPlans } from '@/components/settings/AppSumo';
import PersonalizationSettings from '@/components/quick-actions/PersonalizationSettings';
import { useSearch } from 'wouter';
import { useState, useEffect, useMemo, useRef } from 'react';
import { DealAutomationRulesSettings } from '@/components/settings/DealAutomationRulesSettings';
import PipelineFollowUpSettings from '@/components/settings/PipelineFollowUpSettings';
import type { 
  DealAutomationRule, 
  DealAutomationTriggerType, 
  DealAutomationConditions, 
  DealAutomationAction,
  Pipeline,
  PipelineStage
} from '@shared/schema';

type LocalDealAutomationRule = Omit<DealAutomationRule, 'id' | 'companyId' | 'createdAt' | 'updatedAt'> & {
  id?: number;
  clientId: string;
};
import { useLocation } from 'wouter';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { TwilioIcon } from '@/components/icons/TwilioIcon';
import { useAvailablePlans, Plan } from "@/hooks/use-available-plans";
import { usePaymentMethods } from "@/hooks/use-payment-methods";
import { PlanCard } from "@/components/settings/PlanCard";
import { CheckoutDialog } from "@/components/settings/CheckoutDialog";
import { SubscriptionManagement } from "@/components/settings/SubscriptionManagement";
import { AffiliateEarningsCard } from "@/components/settings/AffiliateEarningsCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Loader2,
  RefreshCw,
  Calendar,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  AlertTriangle,
  Settings2,
  Key,
  Code,
  Plus,
  Trash,
  Edit,
  Paintbrush,
  BrainCircuit as TabIconBrainCircuit,
  Code as TabIconCode,
  Globe as TabIconGlobe,
  KeyRound as TabIconKeyRound,
  ListPlus as TabIconListPlus,
  Mail as TabIconMail,
  Palette as TabIconPalette,
  Receipt as TabIconReceipt,
  Settings as TabIconSettings,
  UsersRound as TabIconUsersRound,
} from "lucide-react";
import { coerceCustomJsSettings, createDefaultCustomCssSettings, createDefaultCustomJsSettings, type CustomCssSettings, type CustomJsSettings } from '@shared/customization-settings';
import { QRCodeSVG } from "qrcode.react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { WhatsAppEmbeddedSignup } from '@/components/settings/WhatsAppEmbeddedSignup';
import { WhatsAppBusinessApiForm } from '@/components/settings/WhatsAppBusinessApiForm';
import { MetaWhatsAppIntegratedOnboarding } from '@/components/settings/MetaWhatsAppIntegratedOnboarding';
import { ApiAccessTab } from '@/components/settings/ApiAccessTab';
import { InstagramConnectionForm } from '@/components/settings/InstagramConnectionForm';
import { TwilioSmsConnectionForm } from '@/components/settings/TwilioSmsConnectionForm';
import { EnhancedInstagramConnectionForm } from '@/components/settings/EnhancedInstagramConnectionForm';
import { MessengerConnectionForm } from '@/components/settings/MessengerConnectionForm';
import { MessengerEmbeddedSignup } from '@/components/settings/MessengerEmbeddedSignup';
import { InstagramEmbeddedSignup } from '@/components/settings/InstagramEmbeddedSignup';
import { ChannelSetupActions } from '@/components/settings/ChannelSetupActions';
import { TikTokConnectionForm } from '@/components/settings/TikTokConnectionForm';
import { TelegramConnectionForm } from '@/components/settings/TelegramConnectionForm';
import { EditTelegramConnectionForm } from '@/components/settings/EditTelegramConnectionForm';
import { TeamMembersList } from '@/components/settings/TeamMembersList';
import { RolesAndPermissions } from '@/components/settings/RolesAndPermissions';
import { SmtpConfiguration } from '@/components/settings/SmtpConfiguration';
import { SesConfiguration } from '@/components/settings/SesConfiguration';
import { TikTokPlatformConfigForm } from '@/components/settings/TikTokPlatformConfigForm';
import { WhatsAppBehaviorSettings } from '@/components/settings/WhatsAppBehaviorSettings';
import { InboxSettings } from '@/components/settings/InboxSettings';
import { EmailChannelForm } from '@/components/settings/EmailChannelForm';
import { EditEmailChannelForm } from '@/components/settings/EditEmailChannelForm';
import { EditWhatsAppBusinessApiForm } from '@/components/settings/EditWhatsAppBusinessApiForm';
import { EditMessengerConnectionForm } from '@/components/settings/EditMessengerConnectionForm';
import { EditInstagramConnectionForm } from '@/components/settings/EditInstagramConnectionForm';
import { EditTikTokConnectionForm } from '@/components/settings/EditTikTokConnectionForm';
import { EditTwilioSmsConnectionForm } from '@/components/settings/EditTwilioSmsConnectionForm';
import { TwilioVoiceConnectionForm } from '@/components/settings/TwilioVoiceConnectionForm';
import { EditTwilioVoiceConnectionForm } from '@/components/settings/EditTwilioVoiceConnectionForm';
import { WebChatConnectionForm } from '@/components/settings/WebChatConnectionForm';
import { EditWebChatConnectionForm } from '@/components/settings/EditWebChatConnectionForm';
import ConnectionControl from '@/components/whatsapp/ConnectionControl';
import CompanyAiCredentialsTab from '@/components/settings/CompanyAiCredentialsTab';
import AiUsageAnalytics from '@/components/settings/AiUsageAnalytics';
import { ContactCustomFieldsSettings } from '@/components/settings/ContactCustomFieldsSettings';
import { TimezoneSelector } from '@/components/ui/TimezoneSelector';
import { getBrowserTimezone } from '@/utils/timezones';

interface User {
  id: number;
  username: string;
  fullName: string;
  email: string;
  role: string;
  isSuperAdmin: boolean;
  companyId: number;
  company?: {
    id: number;
    name: string;
    plan: string;
    planId: number;
    subscriptionStatus: string;
    subscriptionEndDate?: string;
  };
}

interface ChannelConnection {
  id: number;
  userId: number;
  channelType: string;
  accountId: string;
  accountName: string;
  connectionData: any;
  status: string;
  createdAt: string;
  updatedAt: string;
  historySyncEnabled?: boolean;
  contactSyncEnabled?: boolean;
}

type PipelineListItem = { id: number; name: string };

const DEFAULT_STAGE_NOTIFICATION_MESSAGE_FALLBACK =
  'Hi {{contact_name}}, just a quick update — your deal “{{deal_title}}” has moved to the {{stage_name}} stage in the {{pipeline_name}} pipeline.';

function GeneralSettingsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [defaultTimezone, setDefaultTimezone] = useState(getBrowserTimezone());
  const [allowForceContactDeletion, setAllowForceContactDeletion] = useState(false);
  const [savedAllowForceContactDeletion, setSavedAllowForceContactDeletion] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [deleteAllConfirmation, setDeleteAllConfirmation] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const {
    data: timezoneSetting,
    isPending: isTimezonePending,
  } = useQuery({
    queryKey: ['/api/company-settings/default-timezone'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/default-timezone');
      if (!res.ok) {
        throw new Error('Failed to fetch timezone setting');
      }
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: deletionSetting, isPending: isDeletionSettingPending } = useQuery({
    queryKey: ['/api/company-settings/contact-deletion'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/contact-deletion');
      if (!res.ok) throw new Error('Failed to fetch contact deletion setting');
      return res.json() as Promise<{ allowForceContactDeletion: boolean }>;
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: deletionPreview, refetch: refetchDeletionPreview } = useQuery({
    queryKey: ['/api/contacts/delete-all-preview'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/contacts/delete-all-preview');
      if (!res.ok) throw new Error('Failed to load contact count');
      return res.json() as Promise<{ total: number; patients: number; archived: number }>;
    },
    enabled: savedAllowForceContactDeletion,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (timezoneSetting?.defaultTimezone != null) {
      setDefaultTimezone(timezoneSetting.defaultTimezone || 'UTC');
    }
  }, [timezoneSetting]);

  useEffect(() => {
    if (deletionSetting) {
      const enabled = deletionSetting.allowForceContactDeletion === true;
      setAllowForceContactDeletion(enabled);
      setSavedAllowForceContactDeletion(enabled);
    }
  }, [deletionSetting]);

  const saveTimezoneMutation = useMutation({
    mutationFn: async (tz: string) => {
      const res = await apiRequest('POST', '/api/company-settings/default-timezone', {
        defaultTimezone: tz,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save timezone');
      }
      return res.json();
    },
    onSuccess: () => {
      for (const key of ['/api/erp/dental/timezone', '/api/erp/dental/schedule/reminder-context', '/api/erp/dental/booking/reminder-deliveries']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (error: any) => {
      console.error('Error saving timezone:', error);
      toast({
        title: t('settings.error_saving', 'Error Saving Settings'),
        description: error.message,
        variant: 'destructive',
      });
      setIsSaving(false);
    },
  });

  const saveDeletionSettingMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest('POST', '/api/company-settings/contact-deletion', {
        allowForceContactDeletion: enabled,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save contact deletion setting');
      }
      return res.json();
    },
  });

  const deleteAllContactsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/contacts/all', {
        force: true,
        confirmation: deleteAllConfirmation,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to delete all contacts');
      return body as { deletedCount: number; deletedMediaFiles: number; fileCleanupFailures: string[] };
    },
    onSuccess: (result) => {
      setIsDeleteAllOpen(false);
      setDeleteAllConfirmation('');
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/delete-all-preview'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/archived-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      toast({
        title: t('settings.contact_deletion.all_deleted', 'All contacts deleted'),
        description: result.fileCleanupFailures.length > 0
          ? t('settings.contact_deletion.cleanup_warning', '{{count}} contacts were deleted, but {{files}} file(s) could not be removed.', { count: result.deletedCount, files: result.fileCleanupFailures.length })
          : t('settings.contact_deletion.all_deleted_description', '{{count}} contacts and their related data were permanently deleted.', { count: result.deletedCount }),
        variant: result.fileCleanupFailures.length > 0 ? 'destructive' : 'default',
      });
    },
    onError: (error: Error) => toast({
      title: t('settings.contact_deletion.delete_failed', 'Contact deletion failed'),
      description: error.message,
      variant: 'destructive',
    }),
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveTimezoneMutation.mutateAsync(defaultTimezone);
      await saveDeletionSettingMutation.mutateAsync(allowForceContactDeletion);
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings/default-timezone'] });
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings/contact-deletion'] });
      setSavedAllowForceContactDeletion(allowForceContactDeletion);
      if (allowForceContactDeletion) void refetchDeletionPreview();
      toast({
        title: t('settings.general_settings_saved', 'General saved'),
        description: t('settings.general_settings_saved_success', 'The setting has been saved successfully.'),
      });
    } catch {
      // Error toasts handled in mutations
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.tabs.general', 'General')}</CardTitle>
        <CardDescription>
          {t('settings.general_settings.description', 'Configure general application behavior')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isTimezonePending || isDeletionSettingPending ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-4">
                  {t('settings.general_settings.company_timezone', 'Company timezone')}
                </h3>
                <div className="p-4 border rounded-lg space-y-2">
                  <TimezoneSelector
                    value={defaultTimezone}
                    onChange={setDefaultTimezone}
                    className="w-full max-w-sm"
                  />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-4 text-destructive">
                  {t('settings.contact_deletion.title', 'Contact deletion')}
                </h3>
                <div className="p-4 border border-destructive/40 rounded-lg space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label htmlFor="allow-force-contact-deletion" className="text-base font-medium">
                        {t('settings.contact_deletion.allow_force', 'Allow forced contact deletion')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.contact_deletion.allow_force_description', 'Lets company administrators permanently delete contacts even when they have retained patient records. Clinical, billing, appointment, conversation, document, and CRM data will also be deleted.')}
                      </p>
                    </div>
                    <Switch
                      id="allow-force-contact-deletion"
                      checked={allowForceContactDeletion}
                      onCheckedChange={setAllowForceContactDeletion}
                    />
                  </div>
                  <Separator />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="font-medium text-destructive">
                        {t('settings.contact_deletion.delete_all', 'Force delete all contacts')}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.contact_deletion.delete_all_description', 'Permanently deletes every active, archived, patient, and non-patient contact in this company.')}
                      </p>
                    </div>
                    <Button data-tour="pages-settings.button.settings.contact_deletion.delete_all_button"
                      variant="destructive"
                      disabled={!savedAllowForceContactDeletion || deleteAllContactsMutation.isPending}
                      onClick={() => {
                        setDeleteAllConfirmation('');
                        void refetchDeletionPreview();
                        setIsDeleteAllOpen(true);
                      }}
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      {t('settings.contact_deletion.delete_all_button', 'Delete All Contacts')}
                    </Button>
                  </div>
                  {allowForceContactDeletion !== savedAllowForceContactDeletion && (
                    <p className="text-xs text-amber-600">
                      {t('settings.contact_deletion.save_to_apply', 'Save General Settings to apply this change.')}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button data-tour="pages-settings.button.settings.saving" onClick={handleSave} disabled={isSaving || saveTimezoneMutation.isPending || saveDeletionSettingMutation.isPending}>
                {isSaving || saveTimezoneMutation.isPending || saveDeletionSettingMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.saving', 'Saving...')}
                  </>
                ) : (
                  t('settings.save', 'Save')
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
      <Dialog open={isDeleteAllOpen} onOpenChange={(open) => {
        if (!deleteAllContactsMutation.isPending) {
          setIsDeleteAllOpen(open);
          if (!open) setDeleteAllConfirmation('');
        }
      }}>
        <DialogContent data-tour="pages-settings.dialogcontent.settings.contact_deletion.confirm_title">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t('settings.contact_deletion.confirm_title', 'Permanently delete all contacts?')}
            </DialogTitle>
            <DialogDescription>
              {t('settings.contact_deletion.confirm_description', 'This will permanently delete {{count}} contacts, including {{patients}} patient contact(s) and {{archived}} archived contact(s), together with all related data. This cannot be undone.', {
                count: deletionPreview?.total ?? 0,
                patients: deletionPreview?.patients ?? 0,
                archived: deletionPreview?.archived ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-all-confirmation">
              {t('settings.contact_deletion.type_confirmation', 'Type DELETE ALL to confirm')}
            </Label>
            <Input data-tour="pages-settings.input.delete-all-confirmation"
              id="delete-all-confirmation"
              value={deleteAllConfirmation}
              onChange={(event) => setDeleteAllConfirmation(event.target.value)}
              disabled={deleteAllContactsMutation.isPending}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button data-tour="pages-settings.button.common.cancel" variant="outline" onClick={() => setIsDeleteAllOpen(false)} disabled={deleteAllContactsMutation.isPending}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-settings.button.settings.contact_deletion.confirm_delete_all"
              variant="destructive"
              disabled={deleteAllConfirmation !== 'DELETE ALL' || deleteAllContactsMutation.isPending}
              onClick={() => deleteAllContactsMutation.mutate()}
            >
              {deleteAllContactsMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('settings.contact_deletion.confirm_delete_all', 'Permanently Delete All')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function PipelineSettingsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [autoAddToPipeline, setAutoAddToPipeline] = useState(true);
  const [autoAddPipelineId, setAutoAddPipelineId] = useState<number | null>(null);
  const [autoAddStageId, setAutoAddStageId] = useState<number | null>(null);
  const [stages, setStages] = useState<Array<{ id: number; name: string; order: number }>>([]);
  const [stageQualificationNotificationEnabled, setStageQualificationNotificationEnabled] = useState(true);
  const [stageQualificationNotificationMessage, setStageQualificationNotificationMessage] = useState('');
  const [dealAutomationRulesEnabled, setDealAutomationRulesEnabled] = useState(false);
  const [dealAutomationRules, setDealAutomationRules] = useState<LocalDealAutomationRule[]>([]);
  const notificationTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const toNullableId = (v: unknown): number | null => {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) && !Number.isNaN(n) ? n : null;
  };

  const [hasEditedDealAutomation, setHasEditedDealAutomation] = useState(false);

  // Fetch company-level settings
  const { data: companySetting, refetch: refetchCompanySetting } = useQuery({
    queryKey: ['/api/company-settings/auto-add-to-pipeline'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/auto-add-to-pipeline');
      if (!res.ok) {
        throw new Error('Failed to fetch setting');
      }
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: dealAutomationRulesSetting, isPending: isRulesLoading } = useQuery({
    queryKey: ['/api/company-settings/deal-automation-rules'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/deal-automation-rules');
      if (!res.ok) {
        throw new Error('Failed to fetch deal automation rules');
      }
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (dealAutomationRulesSetting && !hasEditedDealAutomation) {
      setDealAutomationRulesEnabled(Boolean(dealAutomationRulesSetting.dealAutomationRulesEnabled));
      if (Array.isArray(dealAutomationRulesSetting.rules)) {
        const sortedRules = [...dealAutomationRulesSetting.rules]
          .sort((a, b) => (a.priority || 0) - (b.priority || 0))
          .map((r: any) => ({
            ...r,
            clientId: r.clientId || crypto.randomUUID(),
          }));
        setDealAutomationRules(sortedRules);
      }
    }
  }, [dealAutomationRulesSetting, hasEditedDealAutomation]);

  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ['/api/pipelines'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/pipelines');
      if (!res.ok) {
        throw new Error('Failed to fetch pipelines');
      }
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const {
    data: stagesData,
    isPending: isStagesPending,
    isFetching: isStagesFetching,
  } = useQuery<Array<{ id: number; name: string; order: number }>>({
    queryKey: ['/api/pipeline/stages', autoAddPipelineId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/pipeline/stages?pipelineId=${autoAddPipelineId}`);
      if (!res.ok) {
        throw new Error('Failed to fetch stages');
      }
      return res.json();
    },
    enabled: autoAddToPipeline && autoAddPipelineId !== null,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const stagesListReady =
    autoAddToPipeline &&
    autoAddPipelineId !== null &&
    !isStagesPending &&
    !isStagesFetching;

  const { data: stageQualificationNotificationSetting } = useQuery({
    queryKey: ['/api/company-settings/stage-qualification-notification'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/stage-qualification-notification');
      if (!res.ok) {
        throw new Error('Failed to fetch stage qualification notification setting');
      }
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (companySetting) {
      setAutoAddToPipeline(companySetting.autoAddContactToPipeline || false);
      setAutoAddPipelineId(toNullableId(companySetting.autoAddPipelineId));
      setAutoAddStageId(toNullableId(companySetting.autoAddStageId));
      setIsLoading(false);
    }
  }, [companySetting]);

  useEffect(() => {
    if (!companySetting || pipelines.length === 0) return;
    if (toNullableId(companySetting.autoAddPipelineId) !== null) return;
    setAutoAddPipelineId((prev) => (prev == null ? pipelines[0].id : prev));
  }, [companySetting, pipelines]);

  useEffect(() => {
    if (!autoAddToPipeline || autoAddPipelineId === null) {
      setStages([]);
      return;
    }
    if (isStagesPending || isStagesFetching) {
      setStages([]);
      return;
    }
    if (stagesData && Array.isArray(stagesData)) {
      const mapped = stagesData.map((s) => ({ id: s.id, name: s.name, order: s.order }));
      setStages(mapped);
      if (
        companySetting &&
        toNullableId(companySetting.autoAddStageId) === null &&
        mapped.length > 0
      ) {
        setAutoAddStageId((prev) => (prev == null ? mapped[0].id : prev));
      }
    }
  }, [
    stagesData,
    autoAddPipelineId,
    autoAddToPipeline,
    isStagesPending,
    isStagesFetching,
    companySetting,
  ]);

  useEffect(() => {
    if (!stageQualificationNotificationSetting) return;
    setStageQualificationNotificationEnabled(
      Boolean(stageQualificationNotificationSetting.stageQualificationNotificationEnabled)
    );
    const raw =
      typeof stageQualificationNotificationSetting.stageQualificationNotificationMessage === 'string'
        ? stageQualificationNotificationSetting.stageQualificationNotificationMessage
        : '';
    const defaultMsg = t(
      'settings.pipeline.stage_notification_placeholder',
      DEFAULT_STAGE_NOTIFICATION_MESSAGE_FALLBACK,
    );
    setStageQualificationNotificationMessage(raw.trim() === '' ? defaultMsg : raw);
  }, [stageQualificationNotificationSetting, t]);

  const insertVariable = (variable: string) => {
    const textarea = notificationTextareaRef.current;
    const message = stageQualificationNotificationMessage;
    if (!textarea) {
      setStageQualificationNotificationMessage((prev) => prev + variable);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = message.slice(0, start) + variable + message.slice(end);
    setStageQualificationNotificationMessage(newValue);
    const newPos = start + variable.length;
    requestAnimationFrame(() => {
      const el = notificationTextareaRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(newPos, newPos);
      }
    });
  };

  const saveCompanySettingMutation = useMutation({
    mutationFn: async (payload: {
      autoAddContactToPipeline: boolean;
      autoAddPipelineId: number | null;
      autoAddStageId: number | null;
    }) => {
      const res = await apiRequest('POST', '/api/company-settings/auto-add-to-pipeline', {
        autoAddContactToPipeline: payload.autoAddContactToPipeline,
        autoAddPipelineId: payload.autoAddPipelineId,
        autoAddStageId: payload.autoAddStageId,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save setting');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings/auto-add-to-pipeline'] });
      refetchCompanySetting();
    },
    onError: (error: any) => {
      console.error('Error saving setting:', error);
      toast({
        title: t('settings.error_saving', 'Error Saving Settings'),
        description: error.message,
        variant: 'destructive'
      });
      setIsSaving(false);
    }
  });

  const saveQualificationNotificationMutation = useMutation({
    mutationFn: async (payload: {
      stageQualificationNotificationEnabled: boolean;
      stageQualificationNotificationMessage: string;
    }) => {
      const res = await apiRequest('POST', '/api/company-settings/stage-qualification-notification', {
        stageQualificationNotificationEnabled: payload.stageQualificationNotificationEnabled,
        stageQualificationNotificationMessage: payload.stageQualificationNotificationMessage,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save stage qualification notification');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings/stage-qualification-notification'] });
    },
    onError: (error: any) => {
      console.error('Error saving stage qualification notification:', error);
      toast({
        title: t('settings.error_saving', 'Error Saving Settings'),
        description: error.message,
        variant: 'destructive',
      });
      setIsSaving(false);
    },
  });

  const saveDealAutomationRulesMutation = useMutation({
    mutationFn: async (payload: {
      dealAutomationRulesEnabled: boolean;
      rules: any[];
    }) => {
      const res = await apiRequest('POST', '/api/company-settings/deal-automation-rules', {
        dealAutomationRulesEnabled: payload.dealAutomationRulesEnabled,
        rules: payload.rules.map(r => ({
          id: r.id,
          name: r.name,
          enabled: r.enabled,
          priority: r.priority,
          triggerType: r.triggerType,
          conditions: r.conditions,
          action: r.action
        })),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save deal automation rules');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings/deal-automation-rules'] });
      if (data && Array.isArray(data.rules)) {
        const sortedRules = [...data.rules]
          .sort((a, b) => (a.priority || 0) - (b.priority || 0))
          .map((r: any) => ({
            ...r,
            clientId: r.clientId || crypto.randomUUID(),
          }));
        setDealAutomationRules(sortedRules);
      }
      setHasEditedDealAutomation(false);
    },
    onError: (error: any) => {
      console.error('Error saving deal automation rules:', error);
      toast({
        title: t('settings.error_saving', 'Error Saving Settings'),
        description: error.message,
        variant: 'destructive',
      });
      setIsSaving(false);
    },
  });

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveCompanySettingMutation.mutateAsync({
        autoAddContactToPipeline: autoAddToPipeline,
        autoAddPipelineId,
        autoAddStageId,
      });
      await saveQualificationNotificationMutation.mutateAsync({
        stageQualificationNotificationEnabled,
        stageQualificationNotificationMessage,
      });
      await saveDealAutomationRulesMutation.mutateAsync({
        dealAutomationRulesEnabled,
        rules: dealAutomationRules,
      });
      toast({
        title: t('settings.pipeline.saved_title', 'Pipeline settings saved'),
        description: t(
          'settings.pipeline.saved_description',
          'Auto-add, stage notification, and automation rules settings were saved successfully.',
        ),
      });
    } catch {
      // Error toasts handled in mutations
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.pipeline.title', 'Pipeline')}</CardTitle>
        <CardDescription>
          {t(
            'settings.pipeline.description',
            'Configure automatic deal creation for new contacts and stage-change notifications.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-4">{t('settings.general_settings.pipeline_settings', 'Pipeline Settings')}</h3>
                <PipelineFollowUpSettings />
                <div className="p-4 border rounded-lg space-y-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label htmlFor="auto-add-pipeline" className="text-base font-medium">
                        {t('settings.general_settings.auto_add_to_pipeline', 'Auto-add contacts to pipeline')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.general_settings.auto_add_to_pipeline_description', 'Automatically create a deal in the initial pipeline stage when a new contact is created')}
                      </p>
                    </div>
                    <Switch
                      id="auto-add-pipeline"
                      checked={autoAddToPipeline}
                      onCheckedChange={setAutoAddToPipeline}
                    />
                  </div>
                  {autoAddToPipeline ? (
                    <div className="mt-4 space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="auto-add-pipeline-select">
                          {t('settings.general_settings.auto_add_pipeline', 'Pipeline')}
                        </Label>
                        <Select
                          value={autoAddPipelineId != null ? String(autoAddPipelineId) : undefined}
                          onValueChange={(val) => {
                            setStages([]);
                            setAutoAddPipelineId(Number(val));
                            setAutoAddStageId(null);
                          }}
                        >
                          <SelectTrigger data-tour="pages-settings.selecttrigger.settings.general_settings.auto_add_pipeline_placeholder" id="auto-add-pipeline-select" className="w-full max-w-sm">
                            <SelectValue
                              placeholder={t('settings.general_settings.auto_add_pipeline_placeholder', 'Select pipeline')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {pipelines.map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="auto-add-stage-select">
                          {t('settings.general_settings.auto_add_stage', 'Stage')}
                        </Label>
                        <Select
                          value={autoAddStageId != null ? String(autoAddStageId) : undefined}
                          onValueChange={(val) => setAutoAddStageId(Number(val))}
                          disabled={!autoAddPipelineId || !stagesListReady}
                        >
                          <SelectTrigger data-tour="pages-settings.selecttrigger.settings.general_settings.auto_add_stage_placeholder" id="auto-add-stage-select" className="w-full max-w-sm">
                            <SelectValue
                              placeholder={t('settings.general_settings.auto_add_stage_placeholder', 'Select stage')}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {stages.map((s) => (
                              <SelectItem key={s.id} value={s.id.toString()}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>


              <div>
                <h3 className="text-sm font-medium mb-4">Stage Qualification Notification</h3>
                <div className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <Label htmlFor="stage-qualification-notification" className="text-base font-medium">
                        {t(
                          'settings.general_settings.stage_qualification_notification',
                          'Notify contact when deal stage changes'
                        )}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t(
                          'settings.general_settings.stage_qualification_notification_description',
                          'Send a message to the contact when their deal moves to a new pipeline stage.'
                        )}
                      </p>
                    </div>
                    <Switch
                      id="stage-qualification-notification"
                      checked={stageQualificationNotificationEnabled}
                      onCheckedChange={setStageQualificationNotificationEnabled}
                    />
                  </div>
                  {stageQualificationNotificationEnabled ? (
                    <div className="space-y-2">
                      <Label htmlFor="stage-qualification-notification-message">Notification Message</Label>
                      <Textarea data-tour="pages-settings.textarea.stage-qualification-notification-message"
                        id="stage-qualification-notification-message"
                        ref={notificationTextareaRef}
                        value={stageQualificationNotificationMessage}
                        onChange={(e) => setStageQualificationNotificationMessage(e.target.value)}
                        rows={4}
                        placeholder={t(
                          'settings.pipeline.stage_notification_placeholder',
                          DEFAULT_STAGE_NOTIFICATION_MESSAGE_FALLBACK,
                        )}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => insertVariable('{{contact_name}}')}
                        >
                          {'{{contact_name}}'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => insertVariable('{{contact_phone}}')}
                        >
                          {'{{contact_phone}}'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => insertVariable('{{deal_title}}')}
                        >
                          {'{{deal_title}}'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => insertVariable('{{stage_name}}')}
                        >
                          {'{{stage_name}}'}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="cursor-pointer"
                          onClick={() => insertVariable('{{pipeline_name}}')}
                        >
                          {'{{pipeline_name}}'}
                        </Badge>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <DealAutomationRulesSettings
                enabled={dealAutomationRulesEnabled}
                onEnabledChange={(val) => {
                  setDealAutomationRulesEnabled(val);
                  setHasEditedDealAutomation(true);
                }}
                rules={dealAutomationRules}
                onRulesChange={(val) => {
                  setDealAutomationRules(val);
                  setHasEditedDealAutomation(true);
                }}
                pipelines={pipelines as any}
                isLoading={isRulesLoading}
              />
            </div>
            <div className="flex justify-end">
              <Button data-tour="pages-settings.button.settings.saving"
                onClick={handleSave}
                disabled={
                  isSaving ||
                  saveCompanySettingMutation.isPending ||
                  saveQualificationNotificationMutation.isPending ||
                  saveDealAutomationRulesMutation.isPending
                }
              >
                {isSaving ||
                saveCompanySettingMutation.isPending ||
                saveQualificationNotificationMutation.isPending ||
                saveDealAutomationRulesMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.saving', 'Saving...')}
                  </>
                ) : (
                  t('settings.save', 'Save')
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const [location] = useLocation();
  const { t } = useTranslation();

  const getActiveTab = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tab = urlParams.get('tab');
    return tab || 'channels';
  };

  const [activeTab, setActiveTab] = useState(getActiveTab());
  const settingsSearch = useSearch();

  useEffect(() => {
    setActiveTab(getActiveTab());
  }, [location, settingsSearch]);

  const [apiKey, setApiKey] = useState('');
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [showBusinessApiModal, setShowBusinessApiModal] = useState(false);
  const [showEmbeddedSignupModal, setShowEmbeddedSignupModal] = useState(false);
  const [repairEmbeddedConnection, setRepairEmbeddedConnection] = useState<{ id: number; name: string; signupMode?: 'standard' | 'coexistence' } | null>(null);
  const [showMetaIntegratedOnboardingModal, setShowMetaIntegratedOnboardingModal] = useState(false);
  const [showInstagramModal, setShowInstagramModal] = useState(false);
  const [showEnhancedInstagramModal, setShowEnhancedInstagramModal] = useState(false);
  const [showMessengerModal, setShowMessengerModal] = useState(false);
  const [showMessengerEmbeddedSignupModal, setShowMessengerEmbeddedSignupModal] = useState(false);
  const [showInstagramEmbeddedSignupModal, setShowInstagramEmbeddedSignupModal] = useState(false);
  const [showTikTokModal, setShowTikTokModal] = useState(false);
  const [showTelegramModal, setShowTelegramModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showTwilioSmsModal, setShowTwilioSmsModal] = useState(false);
  const [showTwilioVoiceModal, setShowTwilioVoiceModal] = useState(false);
  const [showEditTwilioVoiceModal, setShowEditTwilioVoiceModal] = useState(false);
  const [editTwilioVoiceConnectionId, setEditTwilioVoiceConnectionId] = useState<number | null>(null);
  const [showWebChatModal, setShowWebChatModal] = useState(false);
  const [showPartnerConfigModal, setShowPartnerConfigModal] = useState(false);
  const [showTikTokPlatformConfigModal, setShowTikTokPlatformConfigModal] = useState(false);
  const [isUpdatingCredentials, setIsUpdatingCredentials] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [isCheckoutDialogOpen, setIsCheckoutDialogOpen] = useState(false);
  const [customCssForm, setCustomCssForm] = useState<CustomCssSettings>(() => createDefaultCustomCssSettings(''));
  const [customJsForm, setCustomJsForm] = useState<CustomJsSettings>(() => createDefaultCustomJsSettings(''));
  const { toast } = useToast();

  const { plans, isLoading: isLoadingPlans } = useAvailablePlans();

  const { paymentMethods, isLoading: isLoadingPaymentMethods } = usePaymentMethods();

  const { data: planInfo, isLoading: isLoadingPlanInfo } = useQuery({
    queryKey: ['/api/user/plan-info'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/user/plan-info');
      if (!res.ok) throw new Error('Failed to fetch plan info');
      return res.json();
    },
  });

  const credentialsForm = useForm({
    defaultValues: {
      clientId: '',
      clientSecret: '',
      redirectUri: window.location.origin + '/api/google/callback'
    }
  });

  const { data: currentUser } = useQuery<User>({
    queryKey: ['/api/user'],
    refetchOnWindowFocus: false
  });

  const { canAccessTeam } = usePermissions();
  const { isImpersonating } = useAuth();
  const canAccessCompanyTeam =
    canAccessTeam() && !!currentUser?.companyId && (!currentUser?.isSuperAdmin || isImpersonating);
  const canManageTeamSettings =
    currentUser?.role === 'admin' ||
    (currentUser?.isSuperAdmin === true && isImpersonating && !!currentUser?.companyId);

  const {
    data: fetchedConnections = [],
    refetch: refetchConnections
  } = useQuery<ChannelConnection[]>({
    queryKey: ['/api/channel-connections'],
    refetchOnWindowFocus: false
  });

  const {
    data: googleCalendarStatus,
    refetch: refetchGoogleCalendarStatus
  } = useQuery<{ connected: boolean; message: string }>({
    queryKey: ['/api/google/calendar/status'],
    refetchOnWindowFocus: false
  });

  const {
    data: googleCalendarCredentials,
    refetch: refetchGoogleCalendarCredentials
  } = useQuery<{ configured: boolean; clientId: string; clientSecret: string; redirectUri: string }>({
    queryKey: ['/api/google/credentials'],
    refetchOnWindowFocus: false,
    enabled: currentUser?.role === 'admin' || currentUser?.isSuperAdmin
  });

  useEffect(() => {
    if (googleCalendarCredentials) {
      credentialsForm.reset({
        clientId: googleCalendarCredentials.clientId || '',
        clientSecret: '',
        redirectUri: googleCalendarCredentials.redirectUri || window.location.origin + '/api/google/callback'
      });
    }
  }, [googleCalendarCredentials, credentialsForm]);

  const { data: googleCalendarAuthData } = useQuery<{ authUrl: string }>({
    queryKey: ['/api/google/auth'],
    refetchOnWindowFocus: false,
    enabled: googleCalendarCredentials?.configured === true
  });

  // Fetch company custom CSS
  const { data: companyCssData } = useQuery({
    queryKey: ['/api/company-settings/custom-css'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/custom-css');
      if (!res.ok) {
        return createDefaultCustomCssSettings();
      }
      return res.json();
    },
    enabled: currentUser?.role === 'admin' || currentUser?.isSuperAdmin,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: companyJsData } = useQuery({
    queryKey: ['/api/company-settings/custom-js'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/custom-js');
      if (!res.ok) {
        return createDefaultCustomJsSettings();
      }
      return res.json();
    },
    enabled: currentUser?.role === 'admin' || currentUser?.isSuperAdmin,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (companyCssData) {
      setCustomCssForm({
        enabled: companyCssData.enabled || false,
        css: companyCssData.css || '',
        lastModified: companyCssData.lastModified || ''
      });
    }
  }, [companyCssData]);

  useEffect(() => {
    if (companyJsData) {
      setCustomJsForm(coerceCustomJsSettings(companyJsData, ''));
    }
  }, [companyJsData]);

  const saveCustomCssMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/company-settings/custom-css', customCssForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save custom CSS settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings/custom-css'] });
      toast({
        title: t('settings.custom_css_saved', 'Custom CSS settings saved'),
        description: t('settings.custom_css_saved_success', 'Custom CSS configuration has been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('settings.error_saving', 'Error Saving Settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const saveCustomJsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/company-settings/custom-js', customJsForm);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to save custom JavaScript settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/company-settings/custom-js'] });
      toast({
        title: t('settings.custom_js_saved', 'Custom JavaScript settings saved'),
        description: t('settings.custom_js_saved_success', 'Custom JavaScript configuration has been saved successfully.')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('settings.error_saving', 'Error Saving Settings'),
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const disconnectGoogleCalendarMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/google/calendar/disconnect');
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('settings.google_calendar_disconnected', 'Google Calendar Disconnected'),
        description: t('settings.google_calendar_disconnect_success', 'Your Google Calendar account has been disconnected successfully.'),
      });
      refetchGoogleCalendarStatus();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.google_calendar_disconnect_error', 'Failed to disconnect Google Calendar: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const updateGoogleCredentialsMutation = useMutation({
    mutationFn: async (credentials: { clientId: string; clientSecret: string; redirectUri: string }) => {
      const res = await apiRequest('POST', '/api/google/credentials', credentials);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('settings.google_calendar_credentials_updated', 'Google Calendar Credentials Updated'),
        description: t('settings.google_calendar_credentials_success', 'Your Google OAuth credentials have been updated successfully.'),
      });
      setShowCredentialsModal(false);
      refetchGoogleCalendarCredentials();
      disconnectGoogleCalendarMutation.mutate();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.google_calendar_credentials_error', 'Failed to update Google Calendar credentials: {{error}}', { error: error.message }),
        variant: 'destructive',
      });
    },
  });

  const [channelConnections, setChannelConnections] = useState<ChannelConnection[]>([]);

  useEffect(() => {
    setChannelConnections(fetchedConnections);
  }, [fetchedConnections]);

  const handleConnectionSuccess = () => {
    

    queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
    refetchConnections().catch(() => {
      // Error refetching connections
    });
  };

  const handleSaveAccount = () => {
    toast({
      title: t('settings.account_updated', 'Account Updated'),
      description: t('settings.account_updated_success', 'Your account settings have been saved successfully'),
    });
  };



  const handleSaveApiKey = () => {
    if (!apiKey.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('settings.api_key_empty_error', 'API key cannot be empty'),
        variant: "destructive"
      });
      return;
    }

    toast({
      title: t('settings.api_key_saved', 'API Key Saved'),
      description: t('settings.api_key_updated', 'Your API key has been updated'),
    });
    setApiKey('');
  };

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    setIsCheckoutDialogOpen(true);
  };

  const handleCheckoutSuccess = () => {
    setIsCheckoutDialogOpen(false);
    toast({
      title: t('settings.subscription_updated', 'Subscription Updated'),
      description: t('settings.subscription_updated_success', 'Your subscription has been updated successfully'),
    });
    queryClient.invalidateQueries({ queryKey: ['/api/user'] });
  };

  const [showQrModal, setShowQrModal] = useState(false);
  const [activeConnectionId, setActiveConnectionId] = useState<number | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);


  const [connectionStatus, setConnectionStatus] = useState<string>('');
  const [awaitingManualQr, setAwaitingManualQr] = useState(false);
  const [qrGenerationInProgress, setQrGenerationInProgress] = useState(false);
  const [qrGenerationTimeout, setQrGenerationTimeout] = useState<NodeJS.Timeout | null>(null);
  const [qrRetryCount, setQrRetryCount] = useState(0);
  const [qrRetryTimeout, setQrRetryTimeout] = useState<NodeJS.Timeout | null>(null);
  const [qrPollInterval, setQrPollInterval] = useState<NodeJS.Timeout | null>(null);
  const [isNewWhatsAppConnection, setIsNewWhatsAppConnection] = useState(false);
  const [historySyncEnabled, setHistorySyncEnabled] = useState(false);
  const [contactSyncEnabled, setContactSyncEnabled] = useState(false);
  const [historySyncUpdating, setHistorySyncUpdating] = useState(false);


  const memoizedWhatsAppQR = useMemo(() => {
    if (!qrCode) return null;
    
    return (
      <QRCodeSVG 
        value={qrCode} 
        size={256}
        className="w-full max-w-[180px] sm:max-w-[220px] md:max-w-[256px]"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
    );
  }, [qrCode]);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameConnectionId, setRenameConnectionId] = useState<number | null>(null);
  const [newChannelName, setNewChannelName] = useState('');

  const [disconnectConnectionId, setDisconnectConnectionId] = useState<number | null>(null);
  const [isDisconnectingEmbedded, setIsDisconnectingEmbedded] = useState(false);
  const [showDisconnectWarning, setShowDisconnectWarning] = useState(false);

  const [showEditEmailModal, setShowEditEmailModal] = useState(false);
  const [editEmailConnectionId, setEditEmailConnectionId] = useState<number | null>(null);

  const [showEditWhatsAppModal, setShowEditWhatsAppModal] = useState(false);
  const [editWhatsAppConnectionId, setEditWhatsAppConnectionId] = useState<number | null>(null);

  const [showEditMessengerModal, setShowEditMessengerModal] = useState(false);
  const [editMessengerConnectionId, setEditMessengerConnectionId] = useState<number | null>(null);

  const [showEditInstagramModal, setShowEditInstagramModal] = useState(false);
  const [editInstagramConnectionId, setEditInstagramConnectionId] = useState<number | null>(null);

  const [showEditTelegramModal, setShowEditTelegramModal] = useState(false);
  const [editTelegramConnectionId, setEditTelegramConnectionId] = useState<number | null>(null);

  const [showEditTikTokModal, setShowEditTikTokModal] = useState(false);
  const [editTikTokConnectionId, setEditTikTokConnectionId] = useState<number | null>(null);

  const [showEditTwilioSmsModal, setShowEditTwilioSmsModal] = useState(false);
  const [editTwilioSmsConnectionId, setEditTwilioSmsConnectionId] = useState<number | null>(null);
  const [showEditWebChatModal, setShowEditWebChatModal] = useState(false);
  const [editWebChatConnectionId, setEditWebChatConnectionId] = useState<number | null>(null);

  const [syncingChannels, setSyncingChannels] = useState<Set<number>>(new Set());


  const activeConnectionIdRef = useRef<number | null>(null);
  const channelConnectionsRef = useRef<ChannelConnection[]>([]);
  const generateQRCodeRef = useRef<((isManual?: boolean, connectionId?: number) => Promise<void>) | null>(null);
  const showQrModalRef = useRef<boolean>(false);
  const connectionStatusRef = useRef<string>('');
  const qrCodeRef = useRef<string | null>(null);
  /** Connection id created in this QR modal session (new add flow). Only this may be deleted on cancel; existing channels must not be. */
  const provisionalConnectionIdRef = useRef<number | null>(null);
  
  useEffect(() => {
    activeConnectionIdRef.current = activeConnectionId;
  }, [activeConnectionId]);

  useEffect(() => {
    channelConnectionsRef.current = channelConnections;
  }, [channelConnections]);

  useEffect(() => {
    showQrModalRef.current = showQrModal;
  }, [showQrModal]);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  useEffect(() => {
    qrCodeRef.current = qrCode;
  }, [qrCode]);

  const stopQrPolling = () => {
    setQrPollInterval(prev => {
      if (prev) clearInterval(prev);
      return null;
    });
  };

  const startQrPolling = (connectionId: number) => {
    stopQrPolling();

    const POLL_INTERVAL_MS = 2000;
    const MAX_DURATION_MS = 30000;
    let elapsed = 0;

    const interval = setInterval(async () => {
      const currentActiveId = activeConnectionIdRef.current;
      const currentShowModal = showQrModalRef.current;
      const currentQr = qrCodeRef.current;
      const currentStatus = connectionStatusRef.current;

      if (!currentShowModal || !currentActiveId || currentActiveId !== connectionId) {
        stopQrPolling();
        return;
      }

      if (currentQr || currentStatus === 'connected' || currentStatus === 'error') {
        stopQrPolling();
        return;
      }

      elapsed += POLL_INTERVAL_MS;
      if (elapsed > MAX_DURATION_MS) {
        stopQrPolling();
        return;
      }

      try {
        const res = await fetch(`/api/whatsapp/qr/${connectionId}`);
        if (!res.ok) {
          return;
        }
        const body = await res.json();
        if (body.qrCode) {
          setQrCode(body.qrCode);
          setConnectionStatus('qr_code');
          setAwaitingManualQr(false);
          setQrGenerationInProgress(false);
          setQrRetryCount(0);

          setQrGenerationTimeout(prev => {
            if (prev) clearTimeout(prev);
            return null;
          });
          setQrRetryTimeout(prev => {
            if (prev) clearTimeout(prev);
            return null;
          });

          stopQrPolling();
        }
      } catch (err) {
        console.error('Failed to poll WhatsApp QR code', err);
      }
    }, POLL_INTERVAL_MS);

    setQrPollInterval(interval);
  };

  useEffect(() => {
    return () => {
      setQrPollInterval(prev => {
        if (prev) clearInterval(prev);
        return null;
      });
    };
  }, []);

  const startQrGenerationTimeout = () => {
    setQrGenerationTimeout(prev => {
      if (prev) clearTimeout(prev);
      return null;
    });
    setQrRetryTimeout(prev => {
      if (prev) clearTimeout(prev);
      return null;
    });

    const timeout = setTimeout(() => {
      setQrGenerationInProgress(false);
      setAwaitingManualQr(false);

      if (connectionStatusRef.current === 'connecting') {
        setConnectionStatus('error');
        toast({
          title: t('settings.error', 'Error'),
          description: t(
            'settings.qr_timeout',
            'QR is taking longer than usual — this is normal in Docker. Please wait or click Generate QR Code.'
          ),
          variant: 'destructive',
        });
      }
    }, 30000);

    setQrGenerationTimeout(timeout);
  };

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    const reconnectInterval = 2000;
    const socketRef = { current: socket };


    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        

        const currentActiveConnectionId = activeConnectionIdRef.current;

        if (data.type === 'whatsappQrCode' && currentActiveConnectionId && data.connectionId === currentActiveConnectionId) {
          setQrCode(data.qrCode);
          setConnectionStatus('qr_code');
          setAwaitingManualQr(false);
          setQrGenerationInProgress(false);
          setQrRetryCount(0);

          setQrGenerationTimeout(prev => {
            if (prev) clearTimeout(prev);
            return null;
          });
          setQrRetryTimeout(prev => {
            if (prev) clearTimeout(prev);
            return null;
          });
          stopQrPolling();
        }

        else if (data.type === 'whatsappConnectionStatus' && currentActiveConnectionId && data.connectionId === currentActiveConnectionId) {
          setConnectionStatus(data.status);
          setAwaitingManualQr(false);

          if (data.status === 'connected') {
            provisionalConnectionIdRef.current = null;
            toast({
              title: t('settings.whatsapp_connected', 'WhatsApp Connected'),
              description: t('settings.whatsapp_connected_success', 'Your WhatsApp account has been connected successfully!'),
            });
            queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
            setTimeout(() => {
              setShowQrModal(false);
              setQrCode(null);
              setAwaitingManualQr(false);
            }, 2000);
          }
        }

        else if (data.type === 'whatsappConnectionError' && currentActiveConnectionId && data.connectionId === currentActiveConnectionId) {
          setConnectionStatus('error');
          toast({
            title: t('settings.connection_error', 'Connection Error'),
            description: data.error,
            variant: "destructive"
          });
        }

        else if (data.type === 'whatsappQrCodeRequired' && currentActiveConnectionId && data.connectionId === currentActiveConnectionId) {
          // Verify company ownership by checking if connection exists in our list
          const connection = channelConnectionsRef.current.find(c => c.id === data.connectionId);
          if (connection) {
            setConnectionStatus('qr_code');
            
            // Clear pending QR timers
            setQrGenerationTimeout(prev => {
              if (prev) clearTimeout(prev);
              return null;
            });
            setQrRetryTimeout(prev => {
              if (prev) clearTimeout(prev);
              return null;
            });
            stopQrPolling();
            
            // Reset QR generation state
            setQrGenerationInProgress(false);
            setAwaitingManualQr(false);
            setQrRetryCount(0);
            
            // Trigger QR code generation
            if (generateQRCodeRef.current) {
              generateQRCodeRef.current(false, data.connectionId);
            }
            
            // Show toast explaining a new scan is required
            toast({
              title: t('settings.qr_code_required', 'QR Code Required'),
              description: data.message || t('settings.session_expired_new_scan', 'Your session has expired. A new QR code scan is required.'),
              variant: "default",
              duration: 10000
            });
          }
        }
      } catch (error) {
        // Error parsing WebSocket message
      }
    };

    const reconnect = () => {
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        if (socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.close();
        }

        setTimeout(() => {
          const newSocket = new WebSocket(`${protocol}//${window.location.host}/ws`);

          newSocket.onopen = () => {
            reconnectAttempts = 0;

            if (currentUser?.id) {
              newSocket.send(JSON.stringify({
                type: 'authenticate',
                userId: currentUser.id
              }));
            }

            const cid = activeConnectionIdRef.current;
            if (cid) {
              fetch(`/api/whatsapp/qr/${cid}`)
                .then((r) => r.json())
                .then((data) => {
                  if (data.qrCode && data.expiresIn != null) {
                    setQrCode(data.qrCode);
                  }
                })
                .catch(() => {});
            }
          };

          newSocket.onmessage = handleWebSocketMessage;

          newSocket.onerror = () => {
            // WebSocket error
          };

          newSocket.onclose = () => {
            if (reconnectAttempts < maxReconnectAttempts) {
              setTimeout(reconnect, reconnectInterval);
            }
          };

          socketRef.current = newSocket;
        }, reconnectInterval);
      } else {
        setTimeout(() => {
          reconnectAttempts = 0;
        }, 60000);
      }
    };

    socket.onopen = () => {
      reconnectAttempts = 0;

      if (currentUser?.id) {
        socket.send(JSON.stringify({
          type: 'authenticate',
          userId: currentUser.id
        }));
      }
    };

    socket.onmessage = handleWebSocketMessage;

    socket.onerror = () => {
      // WebSocket error
    };

    socket.onclose = () => {
      reconnect();
    };

    return () => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
    };
  }, [currentUser?.id]);


  const handleConnectChannel = async (channelType: string) => {
    try {
      if (channelType === 'WhatsApp Unofficial') {

        setActiveConnectionId(null);
        setConnectionStatus('');
        setQrCode(null);
        setAwaitingManualQr(false);
        setQrGenerationInProgress(false);
        setIsNewWhatsAppConnection(true);
        setHistorySyncEnabled(false);
        setContactSyncEnabled(false);
        setHistorySyncUpdating(false);
        setShowQrModal(true);
        

      } else if (channelType === 'WhatsApp Business API') {
        setShowBusinessApiModal(true);
      } else if (channelType === 'WhatsApp Business Embedded') {
        setRepairEmbeddedConnection(null);
        setShowEmbeddedSignupModal(true);
      } else if (channelType === 'Instagram') {
        setShowInstagramModal(true);
      } else if (channelType === 'Instagram Embedded') {
        setShowInstagramEmbeddedSignupModal(true);
      } else if (channelType === 'Messenger') {
        setShowMessengerModal(true);
      } else if (channelType === 'Messenger Embedded') {
        setShowMessengerEmbeddedSignupModal(true);
      } else if (channelType === 'Voice Calls') {
        setShowTwilioVoiceModal(true);
      } else if (channelType === 'Twilio SMS') {
        setShowTwilioSmsModal(true);
      } else if (channelType === 'TikTok') {
        setShowTikTokModal(true);
      } else if (channelType === 'Telegram') {

        setShowTelegramModal(true);
      } else if (channelType === 'Email') {
        setShowEmailModal(true);
      } else if (channelType === 'WebChat') {
        setShowWebChatModal(true);
      } else {
        toast({
          title: "Channel Connection Initiated",
          description: `Starting connection flow for ${channelType}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect to channel",
        variant: "destructive"
      });
    }
  };


  const generateQRCode = async (isManual: boolean = false, connectionId?: number) => {
    let targetConnectionId = connectionId || activeConnectionId;
    let connectionJustCreated = false;
    

    if (!targetConnectionId) {
      try {
        const response = await fetch('/api/channel-connections', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            channelType: 'whatsapp_unofficial',
            accountId: `whatsapp-${Date.now()}`,
            accountName: 'WhatsApp Personal',
            connectionData: {},
            historySyncEnabled,
            contactSyncEnabled: historySyncEnabled && contactSyncEnabled
            // autoConnect defaults to true on server, so server will auto-connect
          })
        });

        if (!response.ok) {
          throw new Error('Failed to create WhatsApp connection');
        }

        const connection = await response.json();
        targetConnectionId = connection.id;
        setActiveConnectionId(connection.id);
        // Update ref immediately to ensure QR events are not filtered out
        activeConnectionIdRef.current = connection.id;
        provisionalConnectionIdRef.current = connection.id;
        connectionJustCreated = true;
      } catch (error: any) {
        toast({
          title: t('settings.error', 'Error'),
          description: error.message || 'Failed to create connection',
          variant: "destructive"
        });
        return;
      }
    } else {
      provisionalConnectionIdRef.current = null;
    }


    if (qrGenerationInProgress) {
      return;
    }

    try {
      setQrGenerationInProgress(true);
      setConnectionStatus('connecting');
      setQrCode(null);
      setAwaitingManualQr(true);

      startQrGenerationTimeout();

      // Only call connect if connection was not just created (server auto-connects on creation)
      // This ensures exactly one connect path runs to avoid dropping QR events
      if (!connectionJustCreated && targetConnectionId != null) {
        const response = await fetch(`/api/whatsapp/connect/${targetConnectionId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to connect to WhatsApp');
        }
      }
      if (targetConnectionId != null) {
        startQrPolling(targetConnectionId);
      }


      if (isManual) {
        toast({
          title: t('settings.connecting_whatsapp', 'Connecting WhatsApp'),
          description: t('settings.generating_qr', 'Requesting QR from WhatsApp… usually 1–2 seconds.'),
        });
      }
    } catch (error: any) {
      setConnectionStatus('error');
      setAwaitingManualQr(false);setQrGenerationInProgress(false);


      setQrGenerationTimeout(prev => {
        if (prev) clearTimeout(prev);
        return null;
      });
      setQrRetryTimeout(prev => {
        if (prev) clearTimeout(prev);
        return null;
      });

      toast({
        title: t('settings.error', 'Error'),
        description: error.message || t('settings.connection_failed', 'Failed to connect to WhatsApp'),
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    generateQRCodeRef.current = generateQRCode;
  }, [generateQRCode]);

  const handleManualConnect = async () => {
    await generateQRCode(true);
  };

  const handleRefreshQR = async () => {
    if (!activeConnectionId) {
      toast({
        title: t('settings.error', 'Error'),
        description: t('settings.no_active_connection', 'No active connection found'),
        variant: "destructive"
      });
      return;
    }

    try {
      setConnectionStatus('connecting');
      setQrCode(null);


      const response = await fetch(`/api/channel-connections/${activeConnectionId}/reconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ forceQR: true })
      });

      if (!response.ok) {
        throw new Error('Failed to refresh QR code');
      }

      toast({
        title: t('settings.qr_refreshing', 'Refreshing QR Code'),
        description: t('settings.generating_new_qr', 'Generating a new QR code...'),
      });

    } catch (error: any) {
      setConnectionStatus('error');
      toast({
        title: t('settings.refresh_failed', 'Refresh Failed'),
        description: error.message || t('settings.failed_refresh_qr', 'Failed to refresh QR code'),
        variant: "destructive"
      });
    }
  };

  const saveSyncSettingsAndRegenerateQr = async (
    enabled: boolean,
    contactsEnabled: boolean,
    rollback: () => void,
  ) => {

    const connectionId = activeConnectionIdRef.current;
    const isProvisionalConnection =
      connectionId !== null && connectionId === provisionalConnectionIdRef.current;

    // Before the first QR is requested, the selected value is sent with connection creation.
    if (!isProvisionalConnection || connectionId === null) {
      return;
    }

    let settingSaved = false;
    try {
      setHistorySyncUpdating(true);
      setQrGenerationInProgress(true);
      setAwaitingManualQr(true);
      setConnectionStatus('connecting');
      setQrCode(null);
      startQrGenerationTimeout();

      const settingResponse = await fetch(`/api/channel-connections/${connectionId}/history-sync`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, contactsEnabled }),
      });

      if (!settingResponse.ok) {
        const errorData = await settingResponse.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to update history sync setting');
      }
      settingSaved = true;

      const reconnectResponse = await fetch(`/api/channel-connections/${connectionId}/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceQR: true }),
      });

      if (!reconnectResponse.ok) {
        const errorData = await reconnectResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to regenerate QR code');
      }

      startQrPolling(connectionId);
    } catch (error) {
      if (!settingSaved) {
        rollback();
      }
      setQrGenerationInProgress(false);
      setAwaitingManualQr(false);
      setConnectionStatus('error');
      toast({
        title: t('settings.error', 'Error'),
        description: error instanceof Error ? error.message : 'Failed to update history sync setting',
        variant: 'destructive',
      });
    } finally {
      setHistorySyncUpdating(false);
    }
  };

  const handleHistorySyncToggle = async (enabled: boolean) => {
    const previousHistory = historySyncEnabled;
    const previousContacts = contactSyncEnabled;
    const nextContacts = enabled ? contactSyncEnabled : false;
    setHistorySyncEnabled(enabled);
    if (!enabled) setContactSyncEnabled(false);
    await saveSyncSettingsAndRegenerateQr(enabled, nextContacts, () => {
      setHistorySyncEnabled(previousHistory);
      setContactSyncEnabled(previousContacts);
    });
  };

  const handleContactSyncToggle = async (enabled: boolean) => {
    const previousValue = contactSyncEnabled;
    setContactSyncEnabled(enabled);
    await saveSyncSettingsAndRegenerateQr(historySyncEnabled, enabled, () => {
      setContactSyncEnabled(previousValue);
    });
  };

  const handleDisconnectChannel = async (connectionId: number) => {
    try {
      const response = await fetch(`/api/whatsapp/disconnect/${connectionId}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect channel');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });

      toast({
        title: "Channel Disconnected",
        description: "The channel has been disconnected successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect channel",
        variant: "destructive"
      });
    }
  };

  const handleDisconnectEmbeddedSignup = async (connectionId: number) => {
    try {
      setIsDisconnectingEmbedded(true);

      const response = await fetch(`/api/channel-connections/${connectionId}/disconnect-embedded-signup`, {
        method: 'POST'
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to disconnect WhatsApp number');
      }

      const result = await response.json();

      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });

      toast({
        title: result.actionRequired ? "Disconnect in WhatsApp Business" : "WhatsApp Number Disconnected",
        description: result.message || "WhatsApp number disconnected successfully",
      });

      setShowDisconnectWarning(false);
      setDisconnectConnectionId(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disconnect WhatsApp number",
        variant: "destructive"
      });
    } finally {
      setIsDisconnectingEmbedded(false);
    }
  };

  const handleDeleteChannel = async (connectionId: number) => {
    try {
      if (!window.confirm('Are you sure you want to delete this connection? This action cannot be undone.')) {
        return;
      }

      const response = await fetch(`/api/channel-connections/${connectionId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete channel connection');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });

      toast({
        title: "Channel Deleted",
        description: "The channel connection has been permanently deleted",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete channel connection",
        variant: "destructive"
      });
    }
  };

  const handleReconnectChannel = async (connectionId: number) => {
    try {
      const connection = channelConnections.find(c => c.id === connectionId);
      if (!connection) return;
      provisionalConnectionIdRef.current = null;

      setActiveConnectionId(connectionId);
      activeConnectionIdRef.current = connectionId;
      setIsNewWhatsAppConnection(false);
      setHistorySyncUpdating(false);
      setConnectionStatus('connecting');
      setQrCode(null);
      setAwaitingManualQr(false);
      setQrGenerationInProgress(true);
      setShowQrModal(true);

      startQrGenerationTimeout();

      // Rescan: force clear session and connect so QR is requested immediately (~1–2s).
      // Using reconnect+forceQR avoids connect() with stale auth which can take much longer.
      const response = await fetch(`/api/channel-connections/${connectionId}/reconnect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceQR: true }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to start rescan');
      }

      if (connectionId) {
        startQrPolling(connectionId);
      }
      // QR will arrive via WebSocket (whatsappQrCode) or via polling; handlers clear qrGenerationInProgress
    } catch (error) {
      setQrGenerationInProgress(false);
      setConnectionStatus('error');
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : 'An error occurred',
        variant: "destructive"
      });
    }
  };

  const handleOpenRenameModal = (connectionId: number, currentName: string) => {
    setRenameConnectionId(connectionId);
    setNewChannelName(currentName);
    setShowRenameModal(true);
  };

  const handleOpenEditEmailModal = (connectionId: number) => {
    setEditEmailConnectionId(connectionId);
    setShowEditEmailModal(true);
  };

  const handleConnectEmailChannel = async (connectionId: number) => {
    try {
      const response = await fetch('/api/email/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          connectionId: connectionId
        })
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Email channel connected successfully!",
        });
        window.location.reload();
      } else {
        const errorData = await response.json();
        toast({
          title: "Connection Failed",
          description: errorData.message || "Failed to connect email channel",
          variant: "destructive"
        });
      }
    } catch (error: any) {
      toast({
        title: "Connection Error",
        description: error.message || "Failed to connect email channel",
        variant: "destructive"
      });
    }
  };

  const handleSyncEmailChannel = async (connectionId: number) => {
    try {
      setSyncingChannels(prev => new Set(prev).add(connectionId));
      const response = await fetch(`/api/email/sync/${connectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      if (response.ok) {
        toast({ title: "Sync Started", description: "Email sync initiated successfully!" });
      } else {
        const errorData = await response.json();
        toast({ title: "Sync Failed", description: errorData.message || "Failed to sync", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Sync Error", description: error.message || "Failed to sync", variant: "destructive" });
    } finally {
      setTimeout(() => setSyncingChannels(prev => { const newSet = new Set(prev); newSet.delete(connectionId); return newSet; }), 2000);
    }
  };

  const handleOpenEditWhatsAppModal = (connectionId: number) => {
    setEditWhatsAppConnectionId(connectionId);
    setShowEditWhatsAppModal(true);
  };

  const handleOpenEditMessengerModal = (connectionId: number) => {
    setEditMessengerConnectionId(connectionId);
    setShowEditMessengerModal(true);
  };

  const handleOpenEditInstagramModal = (connectionId: number) => {
    setEditInstagramConnectionId(connectionId);
    setShowEditInstagramModal(true);
  };

  const handleOpenEditTelegramModal = (connectionId: number) => {
    setEditTelegramConnectionId(connectionId);
    setShowEditTelegramModal(true);
  };

  const handleOpenEditTikTokModal = (connectionId: number) => {
    setEditTikTokConnectionId(connectionId);
    setShowEditTikTokModal(true);
  };

  const handleOpenEditTwilioSmsModal = (connectionId: number) => {
    setEditTwilioSmsConnectionId(connectionId);
    setShowEditTwilioSmsModal(true);
  };

  const handleOpenEditTwilioVoiceModal = (connectionId: number) => {
    setEditTwilioVoiceConnectionId(connectionId);
    setShowEditTwilioVoiceModal(true);
  };

  const handleOpenEditWebChatModal = (connectionId: number) => {
    setEditWebChatConnectionId(connectionId);
    setShowEditWebChatModal(true);
  };

  const handleCopyWebChatEmbed = async (connectionId: number) => {
    const connection = channelConnections.find(c => c.id === connectionId);
    const token = connection?.connectionData?.widgetToken;
    if (token) {
      const embedCode = `<script src="${window.location.origin}/api/webchat/widget/${token}" async></script>`;
      await navigator.clipboard.writeText(embedCode);
      toast({ title: 'Copied!', description: 'Embed code copied to clipboard' });
    } else {
      toast({ title: 'Token not found', description: 'This WebChat connection does not have a widget token yet', variant: 'destructive' });
    }
  };




  const handleRenameChannel = async () => {
    if (!renameConnectionId || !newChannelName.trim()) {
      toast({
        title: "Validation Error",
        description: "Channel name cannot be empty",
        variant: "destructive"
      });
      return;
    }

    try {
      const response = await fetch(`/api/channel-connections/${renameConnectionId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          accountName: newChannelName.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to rename channel connection');
      }

      queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });

      setShowRenameModal(false);
      setRenameConnectionId(null);
      setNewChannelName('');

      toast({
        title: "Channel Renamed",
        description: "The channel has been renamed successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to rename channel",
        variant: "destructive"
});
    }
  };

  const getChannelInfo = (channelType: string) => {
    switch (channelType) {
      case 'whatsapp_official':
        return { icon: 'ri-whatsapp-line', color: '#25D366', name: 'WhatsApp Business API' };
      case 'whatsapp':
      case 'whatsapp_unofficial':
        return { icon: 'ri-whatsapp-line', color: '#F59E0B', name: 'WhatsApp (Unofficial)' };
      case 'messenger':
        return { icon: 'ri-messenger-line', color: '#1877F2', name: 'Facebook Messenger' };
      case 'instagram':
        return { icon: 'ri-instagram-line', color: '#E4405F', name: 'Instagram' };
      case 'tiktok':
        return { icon: 'ri-tiktok-line dark:text-white', color: '#000000', name: 'TikTok Business' };
      case 'telegram':
        return { icon: 'ri-telegram-line', color: '#0088CC', name: t('conversations.item.channel.telegram') };
      case 'twilio_voice':
        return { icon: <TwilioIcon className="h-6 w-6 sm:h-6 sm:w-6 mb-2" style={{ color: '#F22F46' }} />, color: '#F22F46', name: 'Voice Calls' };
      case 'twilio_sms':
        return { icon: <TwilioIcon className="h-6 w-6 sm:h-6 sm:w-6 mb-2" style={{ color: '#F22F46' }} />, color: '#F22F46', name: 'Twilio SMS' };
      case 'email':
        return { icon: 'ri-mail-line', color: '#3B82F6', name: 'Email' };
      case 'webchat':
        return {
          iconUrl: APP_ICONS.webchat,
          name: 'WebChat',
        };
      default:
        return { icon: <InboxConversationIcon className="h-6 w-6" />, color: '#333235', name: 'Chat' };
    }
  };

  const isEmbeddedSignupConnection = (connection: ChannelConnection): boolean => {
    return connection.channelType === 'whatsapp_official' && (connection.connectionData as any)?.partnerManaged === true;
  };

  const handleQrModalClose = async () => {
    setQrGenerationInProgress(false);
    setAwaitingManualQr(false);
    setQrRetryCount(0);
    
    // Clear all pending timers
    setQrGenerationTimeout(prev => {
      if (prev) clearTimeout(prev);
      return null;
    });
    setQrRetryTimeout(prev => {
      if (prev) clearTimeout(prev);
      return null;
    });

    // Only delete if this connection was created in this session (new-add flow). Never delete existing channels (e.g. rescan cancel/failure).
    const isProvisional = activeConnectionId !== null && activeConnectionId === provisionalConnectionIdRef.current;
    if (isProvisional && connectionStatus !== 'connected') {
      try {
        const response = await fetch(`/api/channel-connections/${activeConnectionId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });

          toast({
            title: "Connection Cancelled",
            description: "WhatsApp connection has been cancelled and removed.",
          });
        } else {
          await fetch(`/api/whatsapp/disconnect/${activeConnectionId}`, {
            method: 'POST'
          });
          queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
        }
      } catch (error) {
        try {
          await fetch(`/api/whatsapp/disconnect/${activeConnectionId}`, {
            method: 'POST'
          });
          queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
        } catch (disconnectError) {
          // Error disconnecting WhatsApp
        }
      }
    }
    provisionalConnectionIdRef.current = null;

    // Reset all state and refs
    setActiveConnectionId(null);
    activeConnectionIdRef.current = null;
    setIsNewWhatsAppConnection(false);
    setHistorySyncEnabled(false);
    setContactSyncEnabled(false);
    setHistorySyncUpdating(false);
    setConnectionStatus('');
    setQrCode(null);
  };

  // Automatic QR retry loop with backoff
  useEffect(() => {
    // Only retry when modal is open and we're in a state that needs QR
    if (!showQrModal || !activeConnectionId) {
      // Clear any pending retry timeout when modal closes
      setQrRetryTimeout(prev => {
        if (prev) clearTimeout(prev);
        return null;
      });
      return;
    }

    // Don't retry if we already have a QR code, are connected, or have an error
    if (qrCode || connectionStatus === 'connected' || connectionStatus === 'error') {
      // Clear any pending retry timeout on success/error
      setQrRetryTimeout(prev => {
        if (prev) clearTimeout(prev);
        return null;
      });
      return;
    }

    // Only retry if status is 'connecting' or 'qr_code' without a QR code
    if (connectionStatus === 'connecting' || connectionStatus === 'qr_code') {
      // Max retry attempts: 3
      const MAX_RETRY_ATTEMPTS = 3;
      
      if (qrRetryCount >= MAX_RETRY_ATTEMPTS) {
        // Stop retrying after max attempts
        setConnectionStatus('error');
        toast({
          title: t('settings.error', 'Error'),
          description: t('settings.qr_generation_failed', 'QR code generation failed after multiple attempts. Please try again.'),
          variant: "destructive"
        });
        setQrRetryTimeout(prev => {
          if (prev) clearTimeout(prev);
          return null;
        });
        return;
      }

      // Schedule retry after 10-12 seconds (using 11 seconds as middle ground)
      const retryTimeout = setTimeout(() => {
        // Use refs to get current values to avoid stale closures
        const currentActiveConnectionId = activeConnectionIdRef.current;
        const currentShowQrModal = showQrModalRef.current;
        const currentQrCode = qrCodeRef.current;
        const currentConnectionStatus = connectionStatusRef.current;
        
        if (currentShowQrModal && currentActiveConnectionId && !currentQrCode && 
            (currentConnectionStatus === 'connecting' || currentConnectionStatus === 'qr_code')) {
          // Increment retry count
          setQrRetryCount(prev => prev + 1);
          
          // Try to reconnect/generate QR
          if (generateQRCodeRef.current) {
            generateQRCodeRef.current(false, currentActiveConnectionId);
          } else {
            // Fallback to reconnect endpoint
            fetch(`/api/channel-connections/${currentActiveConnectionId}/reconnect`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              }
            }).catch(error => {
              console.error('Failed to reconnect:', error);
            });
          }
        }
      }, 11000); // 11 seconds

      setQrRetryTimeout(retryTimeout);

      return () => {
        clearTimeout(retryTimeout);
      };
    }
  }, [showQrModal, activeConnectionId, connectionStatus, qrCode, qrRetryCount, t]);

  const handleSubmitCredentials = (data: any) => {
    setIsUpdatingCredentials(true);
    updateGoogleCredentialsMutation.mutate(data, {
      onSettled: () => {
        setIsUpdatingCredentials(false);
      }
    });
  };

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-foreground">
      <Dialog open={showRenameModal} onOpenChange={setShowRenameModal}>
        <DialogContent className="w-[95vw] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Rename Channel</DialogTitle>
            <DialogDescription className="text-sm">
              Enter a new name for this channel connection to help identify it better in your sidebar and conversations.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="channelName" className="mb-2 block text-sm">Channel Name</Label>
            <Input data-tour="pages-settings.input.channelName"
              id="channelName"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="Enter new channel name"
              className="w-full"
            />
          </div>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowRenameModal(false);
                setRenameConnectionId(null);
                setNewChannelName('');
              }}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="brand"
              className="btn-brand-primary w-full sm:w-auto"
              onClick={handleRenameChannel}
              disabled={!newChannelName.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDisconnectWarning} onOpenChange={setShowDisconnectWarning}>
        <DialogContent className="w-[95vw] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Disconnect WhatsApp Number?</DialogTitle>
            <DialogDescription className="text-sm">
              <div className="space-y-2 mt-2">
                <p>For numbers connected through WhatsApp Business app, disconnect from Settings → Account → Business Platform in that app. Other Cloud API numbers will be deregistered after verification.</p>
                <p>Messaging via this number will stop immediately after disconnection.</p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDisconnectWarning(false);
                setDisconnectConnectionId(null);
              }}
              className="w-full sm:w-auto"
              disabled={isDisconnectingEmbedded}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (disconnectConnectionId) {
                  handleDisconnectEmbeddedSignup(disconnectConnectionId);
                }
              }}
              className="w-full sm:w-auto"
              disabled={isDisconnectingEmbedded || !disconnectConnectionId}
            >
              {isDisconnectingEmbedded ? (
                <>
                  <span className="mr-2">Disconnecting...</span>
                  <svg className="animate-spin h-4 w-4 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </>
              ) : (
                'Disconnect'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCredentialsModal} onOpenChange={setShowCredentialsModal}>
        <DialogContent className="w-[95vw] max-w-lg mx-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">
              {googleCalendarCredentials?.configured ? 'Update' : 'Configure'} Google Calendar API Credentials
            </DialogTitle>
            <DialogDescription className="text-sm">
              Enter your company's Google Cloud OAuth credentials to enable Google Calendar integration.
              These credentials will be used for all users in your company.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <Form {...credentialsForm}>
              <form onSubmit={credentialsForm.handleSubmit(handleSubmitCredentials)} className="space-y-4">
                <FormField
                  control={credentialsForm.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client ID</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Your Google OAuth Client ID"
                          required
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground mt-1">
                        Client ID from Google Cloud Console OAuth credentials
                      </p>
                    </FormItem>
                  )}
                />

                <FormField
                  control={credentialsForm.control}
                  name="clientSecret"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Secret</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="Your Google OAuth Client Secret"
                          required
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground mt-1">
                        Client Secret from Google Cloud Console OAuth credentials
                      </p>
                    </FormItem>
                  )}
                />

                <FormField
                  control={credentialsForm.control}
                  name="redirectUri"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Redirect URI</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="https://your-app-url.com/api/google/callback"
                          required
                        />
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground mt-1">
                        This should match the authorized redirect URI in your Google Cloud Console
                      </p>
                    </FormItem>
                  )}
                />

                <div className="pt-2 border-t border-border">
                  <Alert className="mb-4 bg-amber-50 border-amber-200">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Important</AlertTitle>
                    <AlertDescription className="text-xs">
                      After updating these credentials, you will need to reconnect your Google account.
                      All previous Google Calendar connections will be invalidated.
                    </AlertDescription>
                  </Alert>

                  <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-0 sm:justify-between mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowCredentialsModal(false);
                        credentialsForm.reset();
                      }}
                      className="w-full sm:w-auto"
                    >
                      Cancel
                    </Button>

                    <Button
                      variant={'brand'}
                      type="submit"
                      disabled={isUpdatingCredentials}
                      className="w-full sm:w-auto"
                    >
                      {isUpdatingCredentials && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {isUpdatingCredentials
                        ? 'Saving...'
                        : googleCalendarCredentials?.configured
                          ? 'Update Credentials'
                          : 'Save Credentials'
                      }
                    </Button>
                  </DialogFooter>
                </div>
              </form>
            </Form>
          </div>
        </DialogContent>
      </Dialog>

      <Header />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
            <div>
              <h1 data-tour="pages-settings.h1.settings.page.title" className="text-2xl">{t('settings.page.title', 'Settings')}</h1>
              <p className="text-muted-foreground text-sm sm:text-base mt-1">
                {t(
                  'settings.page.subtitle',
                  'Manage your account, channels, integrations, and team settings',
                )}
              </p>
            </div>
          </div>

          {/* WhatsApp QR Code Modal */}
          <Dialog open={showQrModal} onOpenChange={(open) => {
            if (!open) {
              handleQrModalClose();
            }
            setShowQrModal(open);
          }}>
            <DialogContent data-tour="pages-settings.dialogcontent.settings.whatsapp_connected" className="sm:max-w-[500px]" closeOnOutsideClick={false}>
              <DialogHeader>
                <DialogTitle>
                  {connectionStatus === 'connected' ? t('settings.whatsapp_connected', 'WhatsApp Connected') : t('settings.connect_whatsapp', 'Connect WhatsApp')}
                </DialogTitle>
                <DialogDescription>
                  {!connectionStatus && t('settings.whatsapp_connection_instructions', 'Connect your WhatsApp account by scanning the QR code with your mobile app')}
                  {connectionStatus === 'connecting' && t('settings.preparing_qr', 'Preparing QR code for authentication...')}
                  {connectionStatus === 'qr_code' && t('settings.scan_qr', 'Scan the QR code with your WhatsApp mobile app')}
                  {connectionStatus === 'connected' && t('settings.whatsapp_connected_success', 'Your WhatsApp has been connected successfully!')}
                </DialogDescription>
              </DialogHeader>

              <div className="flex justify-center items-center py-4">
                {!connectionStatus && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-muted-foreground/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <p className="mb-4 text-lg font-medium">{t('settings.ready_to_connect', 'Ready to Connect')}</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('settings.click_generate_qr', 'Click "Generate QR Code" to start the connection process')}
                    </p>
                  </div>
                )}
                
                {connectionStatus === 'connecting' && (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                    <p className="mb-4">{t('settings.preparing_connection', 'Preparing WhatsApp connection...')}</p>
                    {qrGenerationInProgress && (
                      <p className="text-sm text-primary mb-2">
                        {t('settings.generating_qr_progress', 'Requesting QR from WhatsApp… usually 1–2 seconds')}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      {t('settings.qr_delay_message', 'If QR code doesn\'t appear after a few seconds, use the Generate QR Code button below')}
                    </p>
                  </div>
                )}

                {connectionStatus === 'qr_code' && !qrCode && (
                  <div className="text-center py-8">
                    <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                    <p className="text-lg font-medium mb-2">{t('settings.qr_not_received', 'QR Code Not Received')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('settings.qr_generation_issue', 'The QR code is taking longer than expected. Use the Generate QR Code button below.')}
                    </p>
                  </div>
                )}

                {connectionStatus === 'qr_code' && qrCode && (
                  <div className="text-center py-4">
                    <div className="border-8 border-white inline-block rounded-lg shadow-md">
                      {memoizedWhatsAppQR}
                    </div>
                    <div className="mt-4 mb-2 flex items-center justify-center gap-2 text-sm  bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-md py-2 px-4 rounded-lg mx-4">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{t('settings.qr_expires', 'QR code expires after 30 seconds. Use Generate QR Code button if needed.')}</span>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground px-2">
                      {t('settings.whatsapp_scan_steps_1', '1. Open WhatsApp on your phone')}<br />
                      {t('settings.whatsapp_scan_steps_2', '2. Tap Menu or Settings and select WhatsApp Web')}<br />
                      {t('settings.whatsapp_scan_steps_3', '3. Point your phone to this screen to scan the code')}
                    </p>
                  </div>
                )}

                {connectionStatus === 'connected' && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-16 w-16 text-green-600 dark:text-green-500 mx-auto mb-4" />
                    <p className="text-lg font-medium">{t('settings.connection_successful', 'Connection Successful!')}</p>
                  </div>
                )}

                {connectionStatus === 'error' && (
                  <div className="text-center py-8">
                    <XCircle className="h-16 w-16 text-red-500 dark:text-red-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-red-600 dark:text-red-400">{t('settings.connection_failed', 'Connection Failed')}</p>
                    <p className="text-sm text-muted-foreground mt-2">{t('settings.try_again', 'Please try again')}</p>
                  </div>
                )}
              </div>

              {isNewWhatsAppConnection && connectionStatus !== 'connected' && (
                <div className="space-y-2 rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="whatsapp-history-sync" className="text-sm font-medium">
                      {t('settings.sync_existing_message_history', 'Sync existing message history')}
                    </Label>
                    <Switch
                      id="whatsapp-history-sync"
                      checked={historySyncEnabled}
                      onCheckedChange={handleHistorySyncToggle}
                      disabled={historySyncUpdating}
                      aria-label={t('settings.sync_existing_message_history', 'Sync existing message history')}
                    />
                  </div>
                  {historySyncEnabled && (
                    <div className="ml-3 flex items-center justify-between gap-4 border-l pl-3 pt-1">
                      <Label htmlFor="whatsapp-contact-sync" className="text-xs font-normal text-muted-foreground">
                        {t('settings.sync_contacts_to_crm', 'Sync contacts to CRM')}
                      </Label>
                      <Switch
                        id="whatsapp-contact-sync"
                        checked={contactSyncEnabled}
                        onCheckedChange={handleContactSyncToggle}
                        disabled={historySyncUpdating}
                        className="scale-90"
                        aria-label={t('settings.sync_contacts_to_crm', 'Sync contacts to CRM')}
                      />
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button data-tour="pages-settings.button.common.close" variant="outline" onClick={() => {
                  handleQrModalClose();
                  setShowQrModal(false);
                }}>
                  {connectionStatus === 'connected' ? t('common.close', 'Close') : t('common.cancel', 'Cancel')}
                </Button>
                {!connectionStatus && (
                  <Button data-tour="pages-settings.button.settings.generating"
                    onClick={handleManualConnect}
                    disabled={qrGenerationInProgress}
                    className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`h-4 w-4 ${qrGenerationInProgress ? 'animate-spin' : ''}`} />
                    {qrGenerationInProgress ? t('settings.generating', 'Generating...') : t('settings.generate_qr', 'Generate QR Code')}
                  </Button>
                )}
                {connectionStatus === 'qr_code' && (
                  <Button data-tour="pages-settings.button.settings.generating"
                    onClick={handleManualConnect}
                    disabled={qrGenerationInProgress}
                    className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`h-4 w-4 ${qrGenerationInProgress ? 'animate-spin' : ''}`} />
                    {qrGenerationInProgress ? t('settings.generating', 'Generating...') : t('settings.generate_qr', 'Generate QR Code')}
                  </Button>
                )}
                {connectionStatus === 'error' && (
                  <Button data-tour="pages-settings.button.settings.try_again"
                    onClick={handleManualConnect}
                    className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('settings.try_again', 'Try Again')}
                  </Button>
                )}
                {connectionStatus === 'connecting' && (
                  <Button data-tour="pages-settings.button.settings.generating"
                    onClick={handleManualConnect}
                    disabled={qrGenerationInProgress}
                    className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RefreshCw className={`h-4 w-4 ${qrGenerationInProgress ? 'animate-spin' : ''}`} />
                    {qrGenerationInProgress ? t('settings.generating', 'Generating...') : t('settings.generate_qr', 'Generate QR Code')}
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* WhatsApp Business API Connection Modal */}
          <WhatsAppBusinessApiForm
            isOpen={showBusinessApiModal}
            onClose={() => setShowBusinessApiModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* WhatsApp Business API Embedded Signup Modal */}
          <WhatsAppEmbeddedSignup
            isOpen={showEmbeddedSignupModal}
            onClose={() => {
              setShowEmbeddedSignupModal(false);
              setRepairEmbeddedConnection(null);
            }}
            onSuccess={handleConnectionSuccess}
            repairConnectionId={repairEmbeddedConnection?.id}
            initialConnectionName={repairEmbeddedConnection?.name}
            initialSignupMode={repairEmbeddedConnection?.signupMode}
          />

          {/* Meta WhatsApp Integrated Onboarding Modal */}
          <MetaWhatsAppIntegratedOnboarding
            isOpen={showMetaIntegratedOnboardingModal}
            onClose={() => setShowMetaIntegratedOnboardingModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* Partner Configuration Modal - Super Admin Only */}
          {currentUser?.isSuperAdmin && (
            <>
              <TikTokPlatformConfigForm
                isOpen={showTikTokPlatformConfigModal}
                onClose={() => setShowTikTokPlatformConfigModal(false)}
                onSuccess={() => {
                  toast({
                    title: "Success",
                    description: "TikTok platform configuration updated successfully",
                  });
                }}
              />
            </>
          )}

          {/* Instagram Connection Modal */}
      <InstagramConnectionForm
            isOpen={showInstagramModal}
            onClose={() => setShowInstagramModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* WebChat Connection Modal */}
          <WebChatConnectionForm
            isOpen={showWebChatModal}
            onClose={() => setShowWebChatModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* Enhanced Instagram Connection Modal */}
          <EnhancedInstagramConnectionForm
            isOpen={showEnhancedInstagramModal}
            onClose={() => setShowEnhancedInstagramModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* Messenger Connection Modal */}
          <MessengerConnectionForm
            isOpen={showMessengerModal}
            onClose={() => setShowMessengerModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* Messenger Embedded Signup Modal */}
          <MessengerEmbeddedSignup
            isOpen={showMessengerEmbeddedSignupModal}
            onClose={() => setShowMessengerEmbeddedSignupModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* Instagram Embedded Signup Modal */}
          <InstagramEmbeddedSignup
            isOpen={showInstagramEmbeddedSignupModal}
            onClose={() => setShowInstagramEmbeddedSignupModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* TikTok Connection Modal */}
          <TikTokConnectionForm
            isOpen={showTikTokModal}
            onClose={() => setShowTikTokModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* Telegram Connection Modal */}
          <TelegramConnectionForm
            isOpen={showTelegramModal}
            onClose={() => setShowTelegramModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* Edit Telegram Connection Modal */}
          {editTelegramConnectionId && (
            <EditTelegramConnectionForm
              isOpen={showEditTelegramModal}
              onClose={() => {
                setShowEditTelegramModal(false);
                setEditTelegramConnectionId(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
                setShowEditTelegramModal(false);
                setEditTelegramConnectionId(null);
              }}
              connectionId={editTelegramConnectionId}
            />
          )}

          {/* Email Channel Connection Modal */}
          <EmailChannelForm
            isOpen={showEmailModal}
            onClose={() => setShowEmailModal(false)}
            onSuccess={handleConnectionSuccess}
          />

          {/* Edit Email Channel Modal */}
          {editEmailConnectionId && (
            <EditEmailChannelForm
              isOpen={showEditEmailModal}
              onClose={() => {
                setShowEditEmailModal(false);
                setEditEmailConnectionId(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
                toast({
                  title: "Email Channel Updated",
                  description: "Your email channel has been updated successfully",
                });
              }}
              connectionId={editEmailConnectionId}
            />
          )}

          {/* Edit WhatsApp Business API Modal */}
          {editWhatsAppConnectionId && (
            <EditWhatsAppBusinessApiForm
              isOpen={showEditWhatsAppModal}
              onClose={() => {
                setShowEditWhatsAppModal(false);
                setEditWhatsAppConnectionId(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
                toast({
                  title: "WhatsApp Business API Updated",
                  description: "Your WhatsApp Business API connection has been updated successfully",
                });
              }}
              connectionId={editWhatsAppConnectionId}
            />
          )}

          {/* Edit Messenger Connection Modal */}
          {editMessengerConnectionId && (
            <EditMessengerConnectionForm
              isOpen={showEditMessengerModal}
              onClose={() => {
                setShowEditMessengerModal(false);
                setEditMessengerConnectionId(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
                setShowEditMessengerModal(false);
                setEditMessengerConnectionId(null);
              }}
              connectionId={editMessengerConnectionId}
            />
          )}

          {/* Edit Instagram Connection Modal */}
          {editInstagramConnectionId && (
            <EditInstagramConnectionForm
              isOpen={showEditInstagramModal}
              onClose={() => {
                setShowEditInstagramModal(false);
                setEditInstagramConnectionId(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
                setShowEditInstagramModal(false);
                setEditInstagramConnectionId(null);
              }}
              connectionId={editInstagramConnectionId}
            />
          )}

          {/* Edit TikTok Connection Modal */}
          {editTikTokConnectionId && (
            <EditTikTokConnectionForm
              isOpen={showEditTikTokModal}
              onClose={() => {
                setShowEditTikTokModal(false);
                setEditTikTokConnectionId(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
                setShowEditTikTokModal(false);
                setEditTikTokConnectionId(null);
              }}
              connectionId={editTikTokConnectionId}
            />
          )}

          {/* Edit Twilio SMS Connection Modal */}
          {editTwilioSmsConnectionId && (
            <EditTwilioSmsConnectionForm
              isOpen={showEditTwilioSmsModal}
              onClose={() => {
                setShowEditTwilioSmsModal(false);
                setEditTwilioSmsConnectionId(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
                setShowEditTwilioSmsModal(false);
                setEditTwilioSmsConnectionId(null);
              }}
              connectionId={editTwilioSmsConnectionId}
            />
          )}

          {editWebChatConnectionId && (
            <EditWebChatConnectionForm
              isOpen={showEditWebChatModal}
              onClose={() => {
                setShowEditWebChatModal(false);
                setEditWebChatConnectionId(null);
              }}
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
                setShowEditWebChatModal(false);
                setEditWebChatConnectionId(null);
              }}
              connectionId={editWebChatConnectionId}
            />
          )}

      

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="mb-6">
                <TabsList>
                  <TabsTrigger data-tour="pages-settings.tabstrigger.channels" value="channels">
                    <RiPlugLine aria-hidden="true" focusable="false" />
                    <span className="hidden sm:inline">{t('settings.tabs.channel_connections', 'Channel Connections')}</span>
                    <span className="sm:hidden">{t('settings.tabs.channels', 'Channels')}</span>
                  </TabsTrigger>
                  <TabsTrigger icon={InboxConversationIcon} data-tour="pages-settings.tabstrigger.inbox" value="inbox">
                    {t('settings.tabs.inbox', 'Inbox')}
                  </TabsTrigger>
                  <TabsTrigger data-tour="pages-settings.tabstrigger.whatsapp-behavior" value="whatsapp-behavior">
                    <RiWhatsappFill aria-hidden="true" focusable="false" />
                    <span className="hidden sm:inline">{t('settings.tabs.whatsapp_behavior', 'WhatsApp Behavior')}</span>
                    <span className="sm:hidden">{t('settings.tabs.whatsapp', 'WhatsApp')}</span>
                  </TabsTrigger>
                  <TabsTrigger icon={TabIconSettings} data-tour="pages-settings.tabstrigger.general" value="general">
                    {t('settings.tabs.general', 'General')}
                  </TabsTrigger>
                  <TabsTrigger icon={TabIconPalette} data-tour="pages-settings.tabstrigger.personalization" value="personalization">{t('personalization.title', 'Personalization')}</TabsTrigger>
                  <TabsTrigger data-tour="pages-settings.tabstrigger.pipeline" value="pipeline">
                    <RiKanbanView2 aria-hidden="true" focusable="false" />
                    <span className="hidden sm:inline">{t('settings.tabs.pipeline', 'Pipeline')}</span>
                    <span className="sm:hidden">{t('settings.tabs.pipeline_short', 'Pipeline')}</span>
                  </TabsTrigger>
                  {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && (
                    <TabsTrigger icon={TabIconMail} data-tour="pages-settings.tabstrigger.email-settings" value="email-settings">
                      {t('settings.tabs.email', 'Email')}
                    </TabsTrigger>
                  )}
                  {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && (
                    <TabsTrigger icon={TabIconListPlus} data-tour="pages-settings.tabstrigger.contact-custom-fields" value="contact-custom-fields">
                      <span className="hidden sm:inline">{t('settings.tabs.contact_custom_fields', 'Custom Fields')}</span>
                      <span className="sm:hidden">{t('settings.tabs.custom_fields', 'Custom Fields')}</span>
                    </TabsTrigger>
                  )}

                  <TabsTrigger icon={TabIconReceipt} data-tour="pages-settings.tabstrigger.billing" value="billing">
                    <span className="hidden sm:inline">{t('settings.tabs.billing', 'Billing')}</span>
                    <span className="sm:hidden">{t('settings.tabs.billing', 'Billing')}</span>
                  </TabsTrigger>
                  {canAccessCompanyTeam && (
                    <TabsTrigger icon={TabIconUsersRound} data-tour="pages-settings.tabstrigger.team" value="team">
                      <span className="hidden sm:inline">{t('settings.tabs.team_members', 'Team Members')}</span>
                      <span className="sm:hidden">{t('settings.tabs.team', 'Team')}</span>
                    </TabsTrigger>
                  )}
                  <TabsTrigger icon={TabIconCode} data-tour="pages-settings.tabstrigger.api" value="api">
                    <span className="hidden sm:inline">{t('settings.tabs.api_access', 'API Access')}</span>
                    <span className="sm:hidden">{t('settings.tabs.api', 'API')}</span>
                  </TabsTrigger>
                  <TabsTrigger icon={TabIconKeyRound} data-tour="pages-settings.tabstrigger.ai-credentials" value="ai-credentials">
                    <span className="hidden sm:inline">{t('settings.tabs.ai_credentials', 'AI Credentials')}</span>
                    <span className="sm:hidden">{t('settings.tabs.ai_keys', 'AI Keys')}</span>
                  </TabsTrigger>
                  <TabsTrigger icon={TabIconBrainCircuit} data-tour="pages-settings.tabstrigger.ai-usage" value="ai-usage">
                    <span className="hidden sm:inline">{t('settings.tabs.ai_usage', 'AI Usage')}</span>
                    <span className="sm:hidden">{t('settings.tabs.usage', 'Usage')}</span>
                  </TabsTrigger>
                  {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && (
                    <TabsTrigger data-tour="pages-settings.tabstrigger.custom-js" value="custom-js">
                      <Code className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{t('settings.tabs.custom_js', 'Custom JS')}</span>
                      <span className="sm:hidden">JS</span>
                    </TabsTrigger>
                  )}
                  {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && (
                    <TabsTrigger data-tour="pages-settings.tabstrigger.custom-css" value="custom-css">
                      <Paintbrush className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">{t('settings.tabs.custom_css', 'Custom CSS')}</span>
                      <span className="sm:hidden">CSS</span>
                    </TabsTrigger>
                  )}
                  {currentUser?.isSuperAdmin && (
                    <TabsTrigger icon={TabIconGlobe} data-tour="pages-settings.tabstrigger.platform" value="platform">
                      <span className="hidden sm:inline">{t('settings.tabs.platform', 'Platform')}</span>
                      <span className="sm:hidden">{t('settings.tabs.platform', 'Platform')}</span>
                    </TabsTrigger>
                  )}
                </TabsList>
            </div>



            <TabsContent data-tour="pages-settings.tabscontent.channels" value="channels">
              <Card>
                <CardHeader>
                  <CardTitle>{t('settings.channel_connections.title', 'Channel Connections')}</CardTitle>
                  <CardDescription>
                    {t('settings.channel_connections.description', 'Connect and manage your communication channels')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Connected Channels */}
                    <div>
                      <h3 className="text-base sm:text-lg font-medium mb-4">Connected Channels</h3>
                      <div className="space-y-4">
                        {channelConnections.map((connection: any) => {
                          const channelInfo = getChannelInfo(connection.channelType);

                          return (
                            <div key={connection.id} className="border border-border rounded-lg p-3 sm:p-4">
                              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                                <div className="flex items-center">
                                  {connection.channelType === 'instagram' && connection.connectionData?.accountInfo?.profile_picture_url ? (
                                    <img
                                      src={connection.connectionData.accountInfo.profile_picture_url}
                                      alt={connection.connectionData.accountInfo.username || connection.accountName}
                                      className="w-10 h-10 sm:w-12 sm:h-12 mr-3 rounded-full object-cover"
                                    />
                                  ) : channelInfo.iconUrl ? (
                                    <img
                                      src={channelInfo.iconUrl}
                                      alt={channelInfo.name}
                                      className="w-6 h-6 sm:w-7 sm:h-7 mr-3 rounded"
                                    />
                                  ) : typeof channelInfo.icon === 'string' ? (
                                    <i
                                      className={channelInfo.icon + " text-xl sm:text-2xl mr-3"}
                                      style={channelInfo.icon.includes('tiktok') ? undefined : { color: channelInfo.color }}
                                    />
                                  ) : (
                                    <span className="text-xl sm:text-2xl mr-3">
                                      {channelInfo.icon}
                                    </span>
                                  )}
                                  <div>
                                    <h4 className="font-medium text-sm sm:text-base">{connection.accountName}</h4>
                                    <p className="text-xs sm:text-sm text-muted-foreground">{channelInfo.name}</p>
                                    {connection.channelType === 'instagram' && connection.connectionData?.accountInfo ? (
                                      <div className="mt-1 space-y-0.5">
                                        {connection.connectionData.accountInfo.name && (
                                          <p className="text-xs text-muted-foreground">
                                            {connection.connectionData.accountInfo.name}
                                          </p>
                                        )}
                                        {connection.connectionData.accountInfo.username && (
                                          <p className="text-xs text-muted-foreground">
                                            @{connection.connectionData.accountInfo.username}
                                          </p>
                                        )}
                                        {connection.connectionData.accountInfo.account_type && (
                                          <p className="text-xs text-muted-foreground/70">
                                            {connection.connectionData.accountInfo.account_type}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">{connection.accountId}</p>
                                    )}
                                    {connection.channelType === 'email' && connection.lastSyncAt && (
                                      <p className="text-xs text-muted-foreground/70">
                                        Last sync: {new Date(connection.lastSyncAt).toLocaleString()}
                                      </p>
                                    )}
                                    {connection.channelType === 'tiktok' && connection.connectionData && (
                                      <div className="mt-1 space-y-1">
                                        {connection.connectionData.displayName && (
                                          <p className="text-xs text-muted-foreground">
                                            {connection.connectionData.displayName}
                                            {connection.connectionData.isVerified && (
                                              <span className="ml-1 text-blue-500 dark:text-blue-400">âœ"</span>
                                            )}
                                          </p>
                                        )}
                                        {connection.connectionData.username && (
                                          <p className="text-xs text-muted-foreground">
                                            @{connection.connectionData.username}
                                          </p>
                                        )}
                                        {connection.connectionData.lastSyncAt && (
                                          <p className="text-xs text-muted-foreground/70">
                                            Last sync: {new Date(connection.connectionData.lastSyncAt).toLocaleString()}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">

                                  <div className="flex flex-wrap gap-2 items-center">
                                    {(connection.channelType === 'whatsapp' || connection.channelType === 'whatsapp_unofficial' || connection.channelType === 'whatsapp_official') && (() => {
                                      return (
                                        <ConnectionControl
                                          connectionId={connection.id}
                                          status={connection.status}
                                          channelType={connection.channelType}
                                          onReconnectClick={() => {
                                            handleReconnectChannel(connection.id);
                                          }}
                                        />
                                      );
                                    })()}

                                    {connection.channelType === 'whatsapp_official' && (connection.connectionData as any)?.signupMode === 'coexistence' && (
                                      <div className="text-xs text-muted-foreground max-w-sm" role="status">
                                        <p>WhatsApp Business app: {(connection.connectionData as any).coexistenceStatus || 'connected'}</p>
                                        <p>Contacts: {(connection.connectionData as any).contactSyncStatus || 'pending'} · History: {(connection.connectionData as any).historySyncStatus || 'disabled'}</p>
                                        {(connection.connectionData as any).coexistenceStatus === 'offboarded' && <p>Cloud API sends are paused while WhatsApp reconnects on your device.</p>}
                                        {(connection.connectionData as any).syncNotice && <p>{(connection.connectionData as any).syncNotice}</p>}
                                        {(connection.connectionData as any).syncNotice && <Button size="sm" variant="outline" onClick={async () => {
                                          try {
                                            const response = await fetch(`/api/channel-connections/${connection.id}/coexistence-sync`, { method: 'POST' });
                                            const result = await response.json();
                                            toast({ title: response.ok ? 'Synchronization' : 'Synchronization error', description: result.message, variant: response.ok ? 'default' : 'destructive' });
                                            queryClient.invalidateQueries({ queryKey: ['/api/channel-connections'] });
                                          } catch { toast({ title: 'Synchronization error', description: 'Could not retry synchronization.', variant: 'destructive' }); }
                                        }}>Retry synchronization</Button>}

                                      </div>
                                    )}
                                    {/* Edit button for email channels */}
                                    {connection.channelType === 'email' && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                        onClick={() => handleOpenEditEmailModal(connection.id)}
                                      >
                                        <span className="hidden sm:inline">Edit</span>
                                        <span className="sm:hidden">Edit</span>
                                      </Button>
                                    )}

                                    {/* Sync button for email channels */}
                                    {connection.channelType === 'email' && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-purple-500 hover:text-purple-700 text-xs sm:text-sm"
                                        onClick={() => handleSyncEmailChannel(connection.id)}
                                        disabled={syncingChannels.has(connection.id)}
                                      >
                                        {syncingChannels.has(connection.id) ? (
                                          <>
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                            <span className="hidden sm:inline">Syncing...</span>
                                            <span className="sm:hidden">Sync...</span>
                                          </>
                                        ) : (
                                          <>
                                            <RefreshCw className="h-3 w-3 mr-1" />
                                            <span className="hidden sm:inline">Sync</span>
                                            <span className="sm:hidden">Sync</span>
                                          </>
                                        )}
                                      </Button>
                                    )}

                                    {/* Edit button for WhatsApp Business API channels - Hide for partner-managed (embedded signup) connections */}
                                    {connection.channelType === 'whatsapp_official' && !(connection.connectionData as any)?.partnerManaged && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                        onClick={() => handleOpenEditWhatsAppModal(connection.id)}
                                      >
                                        <span className="hidden sm:inline">Edit</span>
                                        <span className="sm:hidden">Edit</span>
                                      </Button>
                                    )}


                                    {/* Edit button for Messenger channels */}
                                    {connection.channelType === 'messenger' && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                        onClick={() => handleOpenEditMessengerModal(connection.id)}
                                      >
                                        <span className="hidden sm:inline">Edit</span>
                                        <span className="sm:hidden">Edit</span>
                                      </Button>
                                    )}

                                    {/* Edit button for WebChat channels */}
                                    {connection.channelType === 'webchat' && (
                                      <div className="flex items-center gap-2">
                                        <Button
                                          variant="brand"
                                          size="sm"
                                          className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                          onClick={() => handleOpenEditWebChatModal(connection.id)}
                                        >
                                          <span className="hidden sm:inline">Edit</span>
                                          <span className="sm:hidden">Edit</span>
                                        </Button>
                                        <Button
                                          variant="brand"
                                          size="sm"
                                          className="btn-brand-primary text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-500 text-xs sm:text-sm"
                                          onClick={() => handleCopyWebChatEmbed(connection.id)}
                                        >
                                          <span className="hidden sm:inline">Copy Embed</span>
                                          <span className="sm:hidden">Embed</span>
                                        </Button>
                                      </div>
                                    )}

                                    {/* Edit button for Instagram channels */}
                                    {connection.channelType === 'instagram' && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                        onClick={() => handleOpenEditInstagramModal(connection.id)}
                                      >
                                        <span className="hidden sm:inline">Edit</span>
                                        <span className="sm:hidden">Edit</span>
                                      </Button>
                                    )}

                                    {/* Edit button for Telegram channels */}
                                    {connection.channelType === 'telegram' && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                        onClick={() => handleOpenEditTelegramModal(connection.id)}
                                      >
                                        <span className="hidden sm:inline">Edit</span>
                                        <span className="sm:hidden">Edit</span>
                                      </Button>
                                    )}

                                    {/* Status badge for TikTok channels */}
                                    {connection.channelType === 'tiktok' && (
                                      <div className="flex items-center gap-2">
                                        {connection.status === 'active' && (
                                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400">
                                            <span className="w-2 h-2 mr-1 bg-green-500 dark:bg-green-400 rounded-full"></span>
                                            Active
                                          </span>
                                        )}
                                        {connection.status === 'error' && (
                                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400">
                                            <span className="w-2 h-2 mr-1 bg-red-500 dark:bg-red-400 rounded-full"></span>
                                            Error
                                          </span>
                                        )}
                                        {connection.status === 'disconnected' && (
                                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                                            <span className="w-2 h-2 mr-1 bg-muted-foreground rounded-full"></span>
                                            Disconnected
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* Edit button for TikTok channels */}
                                    {connection.channelType === 'tiktok' && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                        onClick={() => handleOpenEditTikTokModal(connection.id)}
                                      >
                                        <span className="hidden sm:inline">View Details</span>
                                        <span className="sm:hidden">Details</span>
                                      </Button>
                                    )}

                                    {/* Edit button for Twilio SMS channels */}
                                    {connection.channelType === 'twilio_sms' && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                        onClick={() => handleOpenEditTwilioSmsModal(connection.id)}
                                      >
                                        <span className="hidden sm:inline">Edit</span>
                                        <span className="sm:hidden">Edit</span>
                                      </Button>
                                    )}

                                    {/* Edit button for Twilio Voice channels */}
                                    {connection.channelType === 'twilio_voice' && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                        onClick={() => handleOpenEditTwilioVoiceModal(connection.id)}
                                      >
                                        <span className="hidden sm:inline">Edit</span>
                                        <span className="sm:hidden">Edit</span>
                                      </Button>
                                    )}

                                  

                                    <Button
                                      variant="brand"
                                      size="sm"
                                      className="btn-brand-primary text-blue-500 hover:text-blue-700 text-xs sm:text-sm"
                                      onClick={() => handleOpenRenameModal(connection.id, connection.accountName)}
                                    >
                                      <span className="hidden sm:inline">Rename</span>
                                      <span className="sm:hidden">Rename</span>
                                    </Button>

                                    {/* Disconnect button for embedded signup WhatsApp connections */}
                                    {isEmbeddedSignupConnection(connection) && (
                                      <>
                                        <Button
                                          variant="brand"
                                          size="sm"
                                          className="btn-brand-primary text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-500 text-xs sm:text-sm"
                                          onClick={() => {
                                            setRepairEmbeddedConnection({
                                              id: connection.id,
                                              name: connection.accountName || 'WhatsApp Business',
                                              signupMode: (connection.connectionData as any)?.signupMode,
                                            });
                                            setShowEmbeddedSignupModal(true);
                                          }}
                                        >
                                          Repair
                                        </Button>
                                        <Button
                                          variant="brand"
                                          size="sm"
                                          className="btn-brand-primary text-orange-500 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-500 text-xs sm:text-sm"
                                          onClick={() => {
                                            setDisconnectConnectionId(connection.id);
                                            setShowDisconnectWarning(true);
                                          }}
                                          disabled={isDisconnectingEmbedded}
                                        >
                                          {isDisconnectingEmbedded && disconnectConnectionId === connection.id ? (
                                            <>
                                              <svg className="animate-spin h-4 w-4 inline-block mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                              </svg>
                                              <span className="hidden sm:inline">Disconnecting...</span>
                                              <span className="sm:hidden">Disconnecting...</span>
                                            </>
                                          ) : (
                                            <>
                                              <span className="hidden sm:inline">Disconnect</span>
                                              <span className="sm:hidden">Disconnect</span>
                                            </>
                                          )}
                                        </Button>
                                      </>
                                    )}


                                    {/* Legacy disconnect button for non-WhatsApp connections */}
                                    {connection.channelType !== 'whatsapp' && connection.channelType !== 'whatsapp_unofficial' && connection.channelType !== 'whatsapp_official' && connection.channelType !== 'tiktok' && (
                                      <Button
                                        variant="brand"
                                        size="sm"
                                        className="btn-brand-primary text-orange-500 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-500 text-xs sm:text-sm"
                                        onClick={() => handleDisconnectChannel(connection.id)}
                                      >
                                        <span className="hidden sm:inline">Disconnect</span>
                                        <span className="sm:hidden">Disconnect</span>
                                      </Button>
                                    )}

                                    <Button
                                      variant="brand"
                                      size="sm"
                                      className="btn-brand-primary text-red-500 hover:text-red-700 text-xs sm:text-sm"
                                      onClick={() => handleDeleteChannel(connection.id)}
                                    >
                                      <span className="hidden sm:inline">Delete</span>
                                      <span className="sm:hidden">Delete</span>
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              {(connection.channelType === 'whatsapp' || connection.channelType === 'whatsapp_unofficial') && (
                                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900 rounded-md">
                                  <div className="flex items-start">
                                    <i className="ri-error-warning-line text-yellow-500 dark:text-yellow-400 mr-2 mt-0.5"></i>
                                    <div>
                                      <p className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">Unofficial Connection</p>
                                      <p className="text-xs text-yellow-600 dark:text-yellow-400">
                                        This connection is not using the official WhatsApp Business API.
                                        It may have limitations and could be subject to blocking by WhatsApp.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {connection.channelType === 'whatsapp_official' && (
                                <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900 rounded-md">
                                  <div className="flex items-start">
                                    <i className="ri-check-line text-green-500 dark:text-green-400 mr-2 mt-0.5"></i>
                                    <div>
                                      <p className="text-sm text-green-700 dark:text-green-400 font-medium">Official WhatsApp Business API (Meta)</p>
                                      <p className="text-xs text-green-600 dark:text-green-400">
                                        This connection uses the official WhatsApp Business API from Meta.
                                        It provides reliable messaging with advanced features and compliance.
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}


                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-base sm:text-lg font-medium mb-4">Add New Channel</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                        <div className="border border-border rounded-lg p-3 sm:p-4 flex h-full flex-col items-center">
                          <i className="ri-whatsapp-line text-2xl sm:text-3xl mb-2" style={{ color: '#25D366' }}></i>
                          <h4 className="font-medium text-sm sm:text-base text-center">{t('settings.channel_cards.whatsapp_business', 'WhatsApp Business API (Meta)')}</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">{t('settings.channel_cards.whatsapp_business_desc', 'Official Meta WhatsApp Business API')}</p>
                          <ChannelSetupActions
                            accent="whatsapp"
                            onEasySetup={() => handleConnectChannel('WhatsApp Business Embedded')}
                            onManualSetup={() => handleConnectChannel('WhatsApp Business API')}
                          />
                        </div>

                
                        {/* <div className="border border-gray-200 rounded-lg p-3 sm:p-4 flex flex-col items-center hover:bg-gray-50 cursor-pointer transition-colors" onClick={() => handleConnectChannel('WhatsApp Business API (360Dialog)')}>
                          <i className="ri-whatsapp-line text-2xl sm:text-3xl mb-2" style={{ color: '#25D366' }}></i>
                          <h4 className="font-medium text-sm sm:text-base text-center">WhatsApp Business API (360Dialog)</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">Integrated Onboarding via 360Dialog</p>
                        </div> */}

                        <div className="border border-border rounded-lg p-3 sm:p-4 flex flex-col items-center hover:bg-accent cursor-pointer transition-colors" onClick={() => handleConnectChannel('WhatsApp Unofficial')}>
                          <i className="ri-whatsapp-line text-2xl sm:text-3xl mb-2" style={{ color: '#25D366' }}></i>
                          <h4 className="font-medium text-sm sm:text-base text-center">WhatsApp QR Code</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">
                            <i className="ri-error-warning-line mr-1"></i>
                            Non-official connection
                          </p>
                        </div>

                        <div className="border border-border rounded-lg p-3 sm:p-4 flex h-full flex-col items-center">
                          <i className="ri-messenger-line text-2xl sm:text-3xl mb-2" style={{ color: '#1877F2' }}></i>
                          <h4 className="font-medium text-sm sm:text-base text-center">{t('settings.channel_cards.facebook_messenger', 'Facebook Messenger')}</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">{t('settings.channel_cards.facebook_messenger_desc', 'Via Facebook Pages')}</p>
                          <ChannelSetupActions
                            accent="messenger"
                            onEasySetup={() => handleConnectChannel('Messenger Embedded')}
                            onManualSetup={() => handleConnectChannel('Messenger')}
                          />
                        </div>

                        <div className="border border-border rounded-lg p-3 sm:p-4 flex h-full flex-col items-center">
                          <i className="ri-instagram-line text-2xl sm:text-3xl mb-2" style={{ color: '#E4405F' }}></i>
                          <h4 className="font-medium text-sm sm:text-base text-center">{t('settings.channel_cards.instagram', 'Instagram')}</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">{t('settings.channel_cards.instagram_desc', 'Business Account Integration')}</p>
                          <ChannelSetupActions
                            accent="instagram"
                            onEasySetup={() => handleConnectChannel('Instagram Embedded')}
                            onManualSetup={() => handleConnectChannel('Instagram')}
                          />
                        </div>

                        <div className="border border-border rounded-lg p-3 sm:p-4 flex flex-col items-center hover:bg-accent cursor-pointer transition-colors" onClick={() => handleConnectChannel('TikTok')}>
                          <i className="ri-tiktok-line text-2xl sm:text-3xl mb-2"></i>
                          <h4 className="font-medium text-sm sm:text-base text-center">TikTok</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">Business Messaging</p>
                        </div>

                        <div className="border border-border rounded-lg p-3 sm:p-4 flex flex-col items-center hover:bg-accent cursor-pointer transition-colors" onClick={() => handleConnectChannel('Telegram')}>
                          <i className="ri-telegram-line text-2xl sm:text-3xl mb-2" style={{ color: '#0088CC' }}></i>
                          <h4 className="font-medium text-sm sm:text-base text-center">{t('conversations.item.channel.telegram')}</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">{t('settings.telegramConnectionForm.channelSubtitle')}</p>
                        </div>

                        <div className="border border-border rounded-lg p-3 sm:p-4 flex flex-col items-center hover:bg-accent cursor-pointer transition-colors" onClick={() => handleConnectChannel('Email')}>
                          <i className="ri-mail-line text-2xl sm:text-3xl mb-2" style={{ color: '#3B82F6' }}></i>
                          <h4 className="font-medium text-sm sm:text-base text-center">Email</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">IMAP/SMTP Email Integration</p>
                        </div>

                        <div className="border border-border rounded-lg p-3 sm:p-4 flex flex-col items-center hover:bg-accent cursor-pointer transition-colors" data-tour="channel-webchat" onClick={() => handleConnectChannel('WebChat')}>
                          <img
                            src={APP_ICONS.webchat}
                            alt="WebChat"
                            className="w-7 h-7 sm:w-8 sm:h-8 mb-2 rounded"
                          />
                          <h4 className="font-medium text-sm sm:text-base text-center">WebChat</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">Chat widget for your website</p>
                        </div>

                        <div
                          className="border border-border rounded-lg p-3 sm:p-4 flex flex-col items-center hover:bg-accent cursor-pointer transition-colors"
                          onClick={() => handleConnectChannel('Voice Calls')}
                        >
                          <TwilioIcon className="h-6 w-6 sm:h-6 sm:w-6 mb-2" style={{ color: '#F22F46' }} />
                          <h4 className="font-medium text-sm sm:text-base text-center">Voice Calls</h4>
                          <p className="text-xs text-muted-foreground text-center mt-1">Voice Calls (Basic & AI-Powered)</p>
                        </div>

                          <div
                            className="border border-border rounded-lg p-3 sm:p-4 flex flex-col items-center hover:bg-accent cursor-pointer transition-colors"
                            onClick={() => handleConnectChannel('Twilio SMS')}
                          >
                            <TwilioIcon className="h-6 w-6 sm:h-6 sm:w-6 mb-2" style={{ color: '#F22F46' }} />
                            <h4 className="font-medium text-sm sm:text-base text-center">Twilio SMS</h4>
                            <p className="text-xs text-muted-foreground text-center mt-1">Programmable Messaging (SMS/MMS)</p>
                          </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent data-tour="pages-settings.tabscontent.inbox" value="inbox">
              <InboxSettings />
            </TabsContent>

            <TabsContent data-tour="pages-settings.tabscontent.whatsapp-behavior" value="whatsapp-behavior">
              <WhatsAppBehaviorSettings />
            </TabsContent>

            <TabsContent data-tour="pages-settings.tabscontent.personalization" value="personalization"><PersonalizationSettings /></TabsContent>
            <TabsContent data-tour="pages-settings.tabscontent.general" value="general">
              <GeneralSettingsTab />
            </TabsContent>

            <TabsContent data-tour="pages-settings.tabscontent.pipeline" value="pipeline">
              <PipelineSettingsTab />
            </TabsContent>

            {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && (
              <TabsContent data-tour="pages-settings.tabscontent.email-settings" value="email-settings">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('settings.tabs.email', 'Email')}</CardTitle>
                    <CardDescription>
                      {t(
                        'settings.email.tab_description',
                        'Configure outbound email providers for system notifications and marketing campaigns.',
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible defaultValue="smtp">
                      <AccordionItem value="smtp">
                        <AccordionTrigger>SMTP Configuration</AccordionTrigger>
                        <AccordionContent>
                          <SmtpConfiguration />
                        </AccordionContent>
                      </AccordionItem>
                      <AccordionItem value="ses">
                        <AccordionTrigger>Amazon SES</AccordionTrigger>
                        <AccordionContent>
                          <SesConfiguration />
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && (
              <TabsContent data-tour="pages-settings.tabscontent.contact-custom-fields" value="contact-custom-fields">
                <ContactCustomFieldsSettings />
              </TabsContent>
            )}

            <TabsContent data-tour="pages-settings.tabscontent.billing" value="billing">
              <Card>
                <CardHeader>
                  <CardTitle>{t('settings.billing.title', 'Billing & Subscription')}</CardTitle>
                  <CardDescription>
                    {t('settings.billing.description', 'Manage your subscription plan and payment methods')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-8">
                    <AppSumoBilling><SubscriptionManagement /></AppSumoBilling>

                    <Separator />

                    <AffiliateEarningsCard />

                    <Separator />



                    <AppSumoPaidPlans><div id="available-plans">
                      <h3 className="text-base sm:text-lg font-medium mb-4 text-foreground">Available Plans</h3>
                      {isLoadingPlans ? (
                        <div className="flex justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-primary"></div>
                        </div>
                      ) : plans && plans.length > 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                          {plans.map((plan) => {
                            const isCurrentPlan = planInfo?.plan?.id === plan.id || planInfo?.plan?.name === plan.name;

                            return (
                              <PlanCard
                                key={plan.id}
                                plan={plan}
                                isCurrentPlan={isCurrentPlan}
                                onSelectPlan={handleSelectPlan}
                              />
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground text-sm sm:text-base">
                          No plans available at the moment
                        </div>
                      )}
                    </div>

                    </AppSumoPaidPlans>

                    <div>
                      <h3 className="text-base sm:text-lg font-medium mb-4 text-foreground">Payment History</h3>

                      {(() => {
                        const { data: transactions, isLoading } = useQuery({
                          queryKey: ['/api/payment/transactions'],
                          queryFn: async () => {
                            const res = await apiRequest('GET', '/api/payment/transactions');
                            if (!res.ok) throw new Error('Failed to fetch payment history');
                            return res.json();
                          }
                        });

                        if (isLoading) {
                          return (
                            <div className="flex justify-center py-4">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                            </div>
                          );
                        }

                        if (!transactions || transactions.length === 0) {
                          return (
                            <div className="text-center py-4 text-muted-foreground text-sm sm:text-base">
                              No payment history available
                            </div>
                          );
                        }

                        return (
                          <div className="border border-border rounded-lg overflow-hidden">
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-border">
                                <thead className="bg-muted">
                                  <tr>
                                    <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                      Date
                                    </th>
                                    <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                      Description
                                    </th>
                                    <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                      Amount
                                    </th>
                                    <th scope="col" className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                      Status
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="bg-background divide-y divide-border">
                                  {transactions.map((transaction: any) => (
                                    <tr key={transaction.id}>
                                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-muted-foreground">
                                        {new Date(transaction.createdAt).toLocaleDateString()}
                                      </td>
                                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm font-medium text-foreground">
                                        {transaction.planName || 'Subscription Payment'}
                                      </td>
                                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-muted-foreground font-medium">
                                        ${transaction.amount.toFixed(2)}
                                      </td>
                                      <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 py-1 text-xs rounded-full ${transaction.status === 'completed'
                                            ? 'bg-primary/10 text-primary border border-primary/20'
                                            : transaction.status === 'pending'
                                              ? 'bg-secondary/10 text-secondary border border-secondary/20'
                                              : 'bg-destructive/10 text-destructive border border-destructive/20'
                                          }`}>
                                          {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <CheckoutDialog
                isOpen={isCheckoutDialogOpen}
                onClose={() => setIsCheckoutDialogOpen(false)}
                plan={selectedPlan}
                paymentMethods={paymentMethods || []}
                onSuccess={handleCheckoutSuccess}
              />
            </TabsContent>

            {canAccessCompanyTeam && (
              <TabsContent data-tour="pages-settings.tabscontent.team" value="team">
                <Card>
                  <CardContent className="pt-6">
                    <div className="space-y-10">
                      <TeamMembersList
                        maxUsers={planInfo?.plan?.maxUsers ?? planInfo?.company?.maxUsers}
                      />

                      {canManageTeamSettings && (
                        <div className="border-t border-border pt-8">
                          <RolesAndPermissions />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            <TabsContent data-tour="pages-settings.tabscontent.api" value="api">
              <ApiAccessTab />
            </TabsContent>

            <TabsContent data-tour="pages-settings.tabscontent.ai-credentials" value="ai-credentials">
              <CompanyAiCredentialsTab />
            </TabsContent>

            <TabsContent data-tour="pages-settings.tabscontent.ai-usage" value="ai-usage">
              <AiUsageAnalytics />
            </TabsContent>

            {currentUser?.isSuperAdmin && (
              <TabsContent data-tour="pages-settings.tabscontent.platform" value="platform">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('settings.platform.title', 'Platform Configuration')}</CardTitle>
                    <CardDescription>
                      {t('settings.platform.description', 'Configure platform-wide integrations and partner API settings')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="border border-border rounded-lg p-4 bg-card">
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <i className="ri-tiktok-line text-2xl text-foreground"></i>
                            <div>
                              <h3 className="text-lg font-medium text-foreground">TikTok Business Messaging API</h3>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                Configure TikTok Partner credentials for company messaging
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={() => setShowTikTokPlatformConfigModal(true)}
                            variant="outline"
                            className="btn-brand-primary"
                          >
                            <Settings2 className="w-4 h-4 mr-2" />
                            Configure
                          </Button>
                        </div>

                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          <p>• Platform-wide TikTok Business API integration</p>
                          <p>• Enables TikTok messaging for companies</p>
                          <p>• Requires TikTok Messaging Partner approval</p>
                        </div>
                      </div>

                      <div className="border border-border rounded-lg p-4 bg-card opacity-50">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-medium text-foreground">Additional Integrations</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              More platform-wide integrations coming soon
                            </p>
                          </div>
                        
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
            {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && (
              <TabsContent data-tour="pages-settings.tabscontent.custom-js" value="custom-js">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Code className="h-5 w-5" />
                      {t('settings.custom_js', 'Custom JavaScript')}
                    </CardTitle>
                    <CardDescription>
                      {t('settings.custom_js_description', 'Inject custom JavaScript into the <head> section of company-facing pages for authenticated company users.')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <Alert className="border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/20">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>{t('settings.custom_js_warning_title', 'Security warning')}</AlertTitle>
                      <AlertDescription>
                        {t('settings.custom_js_warning_description', 'Only add JavaScript from trusted sources.')}
                      </AlertDescription>
                    </Alert>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label className="text-base font-medium">{t('settings.enable_custom_js', 'Enable Custom JavaScript')}</Label>
                        <p className="text-sm text-muted-foreground">
                          {t('settings.enable_custom_js_description', 'Toggle to enable or disable custom JavaScript injection for your company-side.')}
                        </p>
                      </div>
                      <Switch
                        checked={customJsForm.enabled}
                        onCheckedChange={(checked) =>
                          setCustomJsForm(prev => ({ ...prev, enabled: checked }))
                        }
                      />
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="custom-js" className="text-base font-medium">
                        {t('settings.custom_js', 'Custom JavaScript')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.custom_js_input_description', 'Paste raw JavaScript or a trusted embed snippet here. The saved value will be preserved and loaded only for company-facing pages.')}
                      </p>
                      <Textarea data-tour="pages-settings.textarea.custom-js"
                        id="custom-js"
                        placeholder={`Example:
window.addEventListener('load', () => {
  console.log('Company custom JavaScript loaded');
});`}
                        value={customJsForm.js}
                        onChange={(e) =>
                          setCustomJsForm(prev => ({ ...prev, js: e.target.value }))
                        }
                        className="min-h-[200px] font-mono text-sm"
                        disabled={!customJsForm.enabled}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('settings.custom_js_note', 'This runs only for authenticated company-side sessions and does not affect public pages.')}
                      </p>
                    </div>

                    {customJsForm.lastModified && (
                      <div className="text-sm text-muted-foreground">
                        {t('settings.last_modified', 'Last modified')}: {new Date(customJsForm.lastModified).toLocaleString()}
                      </div>
                    )}

                    <div className="flex justify-end">
                      <Button data-tour="pages-settings.button.settings.save_custom_js"
                        onClick={() => saveCustomJsMutation.mutate()}
                        disabled={saveCustomJsMutation.isPending}
                        className="btn-brand-primary"
                      >
                        {saveCustomJsMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t('settings.save_custom_js', 'Save Custom JavaScript')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
            {(currentUser?.role === 'admin' || currentUser?.isSuperAdmin) && (
              <TabsContent data-tour="pages-settings.tabscontent.custom-css" value="custom-css">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Paintbrush className="h-5 w-5" />
                      {t('settings.custom_css', 'Custom CSS')}
                    </CardTitle>
                    <CardDescription>
                      {t('settings.custom_css_description', 'Inject custom CSS styles to customize the appearance of your application interface.')}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                  
                    {/* Enable/Disable Toggle */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label className="text-base font-medium">{t('settings.enable_custom_css', 'Enable Custom CSS')}</Label>
                        <p className="text-sm text-muted-foreground">
                          {t('settings.enable_custom_css_description', 'Toggle to enable or disable custom CSS injection for your company')}
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
                        {t('settings.custom_css', 'Custom CSS')}
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.custom_css_input_description', 'Paste your CSS code here. Styles will be injected into the <head> section of all pages.')}
                      </p>
                      <Textarea data-tour="pages-settings.textarea.custom-css"
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

                              /* Custom sidebar styles */
                              .sidebar {
                                background-color: #f5f5f5;
                              }`}
                        value={customCssForm.css}
                        onChange={(e) =>
                          setCustomCssForm(prev => ({ ...prev, css: e.target.value }))
                        }
                        className="min-h-[200px] font-mono text-sm"
                        disabled={!customCssForm.enabled}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('settings.custom_css_note', 'CSS will be applied globally. Use specific selectors to target elements without affecting the entire application.')}
                      </p>
                    </div>

                    {/* Last Modified Info */}
                    {customCssForm.lastModified && (
                      <div className="text-sm text-muted-foreground">
                        {t('settings.last_modified', 'Last modified')}: {new Date(customCssForm.lastModified).toLocaleString()}
                      </div>
                    )}

                    {/* Save Button */}
                    <div className="flex justify-end">
                      <Button data-tour="pages-settings.button.settings.save_custom_css"
                        onClick={() => saveCustomCssMutation.mutate()}
                        disabled={saveCustomCssMutation.isPending}
                        className="btn-brand-primary"
                      >
                        {saveCustomCssMutation.isPending && (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        )}
                        {t('settings.save_custom_css', 'Save Custom CSS')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* Twilio SMS Connection Modal */}
      <TwilioSmsConnectionForm
        isOpen={showTwilioSmsModal}
        onClose={() => setShowTwilioSmsModal(false)}
        onSuccess={handleConnectionSuccess}
      />

      {/* Voice Connection Modal */}
      <TwilioVoiceConnectionForm
        isOpen={showTwilioVoiceModal}
        onClose={() => setShowTwilioVoiceModal(false)}
        onSuccess={handleConnectionSuccess}
      />

      {/* Edit Voice Connection Modal */}
      {editTwilioVoiceConnectionId && (
        <EditTwilioVoiceConnectionForm
          isOpen={showEditTwilioVoiceModal}
          onClose={() => {
            setShowEditTwilioVoiceModal(false);
            setEditTwilioVoiceConnectionId(null);
          }}
          onSuccess={handleConnectionSuccess}
          connectionId={editTwilioVoiceConnectionId}
        />
      )}
    </div>
  );
}
