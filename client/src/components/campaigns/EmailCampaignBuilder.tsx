import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useParams } from 'wouter';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { useTranslation } from '@/hooks/use-translation';
import {
  ArrowLeft,
  ArrowRight,
  BadgeInfo,
  CheckCircle,
  Eye,
  LayoutTemplate,
  Loader2,
  Save,
  Send,
  Settings,
  Users,
  Plus,
  Mail,
  Edit,
  FileText,
} from 'lucide-react';
import { Link } from 'wouter';
import { CreateSegmentModal } from './CreateSegmentModal';
import { CreateTemplateModal } from './CreateTemplateModal';
import { EditSegmentModal } from './EditSegmentModal';
import { EditTemplateModal } from './EditTemplateModal';
import { VariableInsertion } from './VariableInsertion';
import { WHATSAPP_CHANNEL_TYPES } from '@/lib/whatsapp-constants';
import { SegmentCard } from '@/components/segments/SegmentCard';
import { SkeletonLoader } from '@/components/segments/SkeletonLoader';
import type { EmailCampaignData } from '@/types/email-campaign';
import type { WhatsAppContactSegment } from '@/types/whatsapp-campaign';
import { TimezoneSelector } from '@/components/ui/TimezoneSelector';
import { getBrowserTimezone, utcToZonedDateTimeLocal, zonedDateTimeToUtc } from '@/utils/timezones';

const getEmailCampaignSteps = (t: (key: string, fallback?: string) => string) => [
  { id: 'basic', title: t('emailCampaign.step_basic_info', 'Basic Info'), icon: BadgeInfo },
  { id: 'audience', title: t('emailCampaign.step_audience', 'Audience'), icon: Users },
  { id: 'content', title: t('emailCampaign.step_content', 'Content'), icon: LayoutTemplate },
  { id: 'settings', title: t('emailCampaign.step_settings', 'Settings'), icon: Settings },
  { id: 'review', title: t('emailCampaign.step_review', 'Review'), icon: Eye },
];

const getStepDescription = (stepIndex: number, t: (key: string, fallback?: string) => string): string => {
  const descriptions = [
    t('emailCampaign.desc_basic', 'Set campaign name, email subject, and choose SMTP or Amazon SES'),
    t('emailCampaign.desc_audience', 'Choose your target audience segment'),
    t('emailCampaign.desc_content', 'Write your email content in plain text or visual HTML'),
    t('emailCampaign.desc_settings', 'Send immediately or schedule for later'),
    t('emailCampaign.desc_review', 'Review all settings and launch'),
  ];
  return descriptions[stepIndex] || '';
};

const defaultCampaignData: EmailCampaignData = {
  name: '',
  description: '',
  emailSubject: '',
  emailProvider: 'smtp',
  channelId: undefined,
  segmentId: undefined,
  campaignType: 'immediate',
  scheduledAt: undefined,
  timezone: getBrowserTimezone(),
  content: '',
  contentMode: 'text',
};

export function EmailCampaignBuilder() {
  const [location, setLocation] = useLocation();
  const params = useParams();
  const isEditMode = location.includes('/edit');
  const campaignId = isEditMode ? parseInt(params.id || '0') : null;
  const { t } = useTranslation();
  const { toast } = useToast();

  const [currentStep, setCurrentStep] = useState(0);
  const [campaignData, setCampaignData] = useState<EmailCampaignData>(defaultCampaignData);
  const [segments, setSegments] = useState<WhatsAppContactSegment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [editSegmentId, setEditSegmentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [contentMode, setContentMode] = useState<'text' | 'html'>('text');
  const [showLaunchConfirmation, setShowLaunchConfirmation] = useState(false);
  const [segmentSearchQuery, setSegmentSearchQuery] = useState('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const grapesjsEditorRef = useRef<any>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: channelConnections = [] } = useChannelConnections();
  const emailConnections = (channelConnections as any[]).filter(
    (conn) => conn.channelType === 'email' && conn.status === 'active'
  );

  const fetchSegments = useCallback(async () => {
    setSegmentsLoading(true);
    try {
      const response = await fetch('/api/campaigns/segments');
      const data = await response.json();
      if (data.success) setSegments(data.data);
    } catch (error) {
      console.error('Failed to fetch segments:', error);
    } finally {
      setSegmentsLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch('/api/campaigns/templates');
      const data = await response.json();
      if (data.success) setTemplates(data.data || []);
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  }, []);

  const fetchCampaignData = useCallback(async (id: number) => {
    try {
      const response = await fetch(`/api/campaigns/${id}`);
      const data = await response.json();
      if (data.success) {
        const c = data.data;
        setCampaignData({
          name: c.name || '',
          description: c.description || '',
          emailSubject: c.emailSubject || '',
          emailProvider: c.emailProvider || 'smtp',
          channelId: c.channelId,
          segmentId: c.segmentId,
          templateId: c.templateId,
          campaignType: c.campaignType === 'recurring_daily' ? 'immediate' : (c.campaignType || 'immediate'),
          timezone: c.timezone || getBrowserTimezone(),
          scheduledAt: c.scheduledAt
            ? utcToZonedDateTimeLocal(c.scheduledAt, c.timezone || getBrowserTimezone())
            : undefined,
          content: c.content || '',
          contentMode: (c as any).contentMode || 'text',
        });
        setContentMode((c as any).contentMode || 'text');
      }
    } catch (error) {
      console.error('Failed to fetch campaign:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('emailCampaign.load_failed', 'Failed to load campaign data'),
        variant: 'destructive',
      });
    }
  }, [toast, t]);

  useEffect(() => {
    fetchSegments();
    fetchTemplates();
    if (isEditMode && campaignId) fetchCampaignData(campaignId);
  }, [isEditMode, campaignId, fetchSegments, fetchTemplates, fetchCampaignData]);

  // GrapesJS lifecycle
  useEffect(() => {
    if (currentStep !== 2 || contentMode !== 'html') {
      if (grapesjsEditorRef.current) {
        grapesjsEditorRef.current.destroy();
        grapesjsEditorRef.current = null;
      }
      return;
    }
    if (!editorRef.current) return;
    if (grapesjsEditorRef.current) return;

    try {
      const editor = grapesjs.init({
        container: editorRef.current,
        height: '500px',
        width: 'auto',
        storageManager: false,
        fromElement: false,
        components: campaignData.content || '<p>Write your email content here.</p>',
        blockManager: {
          blocks: [
            { id: 'text', label: 'Text', content: { type: 'text', content: 'Insert text' } },
            { id: 'section', label: 'Section', content: '<section><h2>Heading</h2><p>Content</p></section>' },
            { id: 'image', label: 'Image', content: { type: 'image' } },
            { id: 'link', label: 'Link', content: { type: 'link', content: 'Link', attributes: { href: '#' } } },
          ],
        },
      });
      editor.on('update', () => {
        const html = editor.getHtml();
        setCampaignData((prev) => ({ ...prev, content: html }));
      });
      grapesjsEditorRef.current = editor;
    } catch (err) {
      console.error('GrapesJS init error:', err);
    }
    return () => {
      if (grapesjsEditorRef.current) {
        grapesjsEditorRef.current.destroy();
        grapesjsEditorRef.current = null;
      }
    };
  }, [currentStep, contentMode]);

  const EMAIL_CAMPAIGN_STEPS = getEmailCampaignSteps(t);

  const filteredSegments = segments.filter(
    (s) =>
      !segmentSearchQuery ||
      s.name.toLowerCase().includes(segmentSearchQuery.toLowerCase()) ||
      (s.description || '').toLowerCase().includes(segmentSearchQuery.toLowerCase())
  );

  const handleSegmentSelect = (segmentId: string) => {
    setCampaignData((prev) => ({ ...prev, segmentId: parseInt(segmentId) }));
  };

  const handleSegmentCreated = (newSegment: WhatsAppContactSegment) => {
    setSegments((prev) => [newSegment, ...prev]);
    setCampaignData((prev) => ({ ...prev, segmentId: newSegment.id }));
    setIsSegmentModalOpen(false);
  };

  const handleSegmentUpdated = () => {
    fetchSegments();
    setEditSegmentId(null);
  };

  const handleTemplateSelect = (templateIdStr: string) => {
    const id = parseInt(templateIdStr, 10);
    const template = templates.find((t) => t.id === id);
    if (template) {
      setCampaignData((prev) => ({
        ...prev,
        templateId: template.id,
        content: template.content || prev.content,
      }));
    }
  };

  const handleTemplateCreated = (newTemplate: any) => {
    setTemplates((prev) => [newTemplate, ...prev]);
    setCampaignData((prev) => ({
      ...prev,
      templateId: newTemplate.id,
      content: newTemplate.content || prev.content,
    }));
    setIsTemplateModalOpen(false);
  };

  const handleTemplateUpdated = (updatedTemplate: any) => {
    setTemplates((prev) => prev.map((t) => (t.id === updatedTemplate.id ? updatedTemplate : t)));
    if (campaignData.templateId === updatedTemplate.id) {
      setCampaignData((prev) => ({ ...prev, content: updatedTemplate.content || prev.content }));
    }
    setEditTemplateId(null);
  };

  const handleSegmentDelete = async (segmentId: number) => {
    if (!confirm(t('emailCampaign.confirm_delete_segment', 'Are you sure you want to delete this segment?'))) return;
    try {
      await fetch(`/api/campaigns/segments/${segmentId}`, { method: 'DELETE' });
      setSegments((prev) => prev.filter((s) => s.id !== segmentId));
      if (campaignData.segmentId === segmentId) {
        setCampaignData((prev) => ({ ...prev, segmentId: undefined }));
      }
    } catch (error) {
      toast({ title: t('common.error', 'Error'), description: t('emailCampaign.delete_segment_failed', 'Failed to delete segment'), variant: 'destructive' });
    }
  };

  const handleNext = () => {
    if (currentStep === 0) {
      if (!campaignData.name?.trim()) {
        toast({ title: t('common.error', 'Error'), description: t('emailCampaign.enter_name', 'Please enter a campaign name.'), variant: 'destructive' });
        return;
      }
      if (!campaignData.emailSubject?.trim()) {
        toast({ title: t('common.error', 'Error'), description: t('emailCampaign.enter_subject', 'Please enter an email subject.'), variant: 'destructive' });
        return;
      }
      if (campaignData.emailProvider === 'smtp' && !campaignData.channelId) {
        toast({ title: t('common.error', 'Error'), description: t('emailCampaign.select_smtp_channel', 'Please select an SMTP email channel.'), variant: 'destructive' });
        return;
      }
    }
    if (currentStep === 1) {
      if (!campaignData.segmentId) {
        toast({ title: t('common.error', 'Error'), description: t('emailCampaign.select_segment', 'Please select a segment.'), variant: 'destructive' });
        return;
      }
    }
    if (currentStep === 2) {
      const content = contentMode === 'html' ? grapesjsEditorRef.current?.getHtml() : campaignData.content;
      if (!content?.trim()) {
        toast({ title: t('common.error', 'Error'), description: t('emailCampaign.add_content', 'Please add email content.'), variant: 'destructive' });
        return;
      }
    }
    if (currentStep < EMAIL_CAMPAIGN_STEPS.length - 1) setCurrentStep(currentStep + 1);
  };

  const handlePrevious = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const buildEmailPayload = (status: string = 'draft') => {
    const timezone = campaignData.timezone || 'UTC';
    let scheduledAt = campaignData.scheduledAt;
    if (
      campaignData.campaignType === 'scheduled' &&
      scheduledAt &&
      !/[zZ]|[+-]\d{2}:\d{2}$/.test(scheduledAt)
    ) {
      scheduledAt = zonedDateTimeToUtc(scheduledAt, timezone).toISOString();
    }
    return {
      ...campaignData,
      timezone,
      scheduledAt,
      channelType: 'email',
      status,
      content: contentMode === 'html' && grapesjsEditorRef.current ? grapesjsEditorRef.current.getHtml() : campaignData.content,
      contentMode,
    };
  };

  const handleSaveDraft = async () => {
    setLoading(true);
    try {
      const payload = buildEmailPayload('draft');
      const url = isEditMode ? `/api/campaigns/${campaignId}` : '/api/campaigns';
      const method = isEditMode ? 'PUT' : 'POST';
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (data.success) {
        toast({ title: t('common.success', 'Success'), description: isEditMode ? t('emailCampaign.campaign_updated', 'Campaign updated.') : t('emailCampaign.saved_draft', 'Campaign saved as draft.') });
        if (!isEditMode && data.data?.id) setLocation(`/campaigns/email/${data.data.id}/edit`);
      } else throw new Error(data.error);
    } catch (error) {
      toast({ title: t('common.error', 'Error'), description: t('emailCampaign.save_failed', 'Failed to save campaign.'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleLaunchClick = () => {
    if (!campaignData.name?.trim()) {
      toast({ title: t('emailCampaign.validation_error', 'Validation Error'), description: t('emailCampaign.name_required', 'Campaign name is required.'), variant: 'destructive' });
      return;
    }
    if (!campaignData.emailSubject?.trim()) {
      toast({ title: t('emailCampaign.validation_error', 'Validation Error'), description: t('emailCampaign.subject_required', 'Email subject is required.'), variant: 'destructive' });
      return;
    }
    if (campaignData.emailProvider === 'smtp' && !campaignData.channelId) {
      toast({ title: t('emailCampaign.validation_error', 'Validation Error'), description: t('emailCampaign.select_smtp', 'Select an SMTP channel.'), variant: 'destructive' });
      return;
    }
    if (!campaignData.segmentId) {
      toast({ title: t('emailCampaign.validation_error', 'Validation Error'), description: t('emailCampaign.select_segment_required', 'Select a segment.'), variant: 'destructive' });
      return;
    }
    const content = contentMode === 'html' ? grapesjsEditorRef.current?.getHtml() : campaignData.content;
    if (!content?.trim()) {
      toast({ title: t('emailCampaign.validation_error', 'Validation Error'), description: t('emailCampaign.content_required', 'Email content is required.'), variant: 'destructive' });
      return;
    }
    setShowLaunchConfirmation(true);
  };

  const handleLaunchConfirm = async () => {
    setShowLaunchConfirmation(false);
    setLoading(true);
    try {
      const payload = buildEmailPayload('draft');
      const url = isEditMode ? `/api/campaigns/${campaignId}` : '/api/campaigns';
      const method = isEditMode ? 'PUT' : 'POST';
      const saveRes = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const saveData = await saveRes.json();
      if (!saveData.success) throw new Error(saveData.error);
      const id = isEditMode ? campaignId! : saveData.data.id;

      const isFutureSchedule =
        campaignData.campaignType === 'scheduled' &&
        campaignData.scheduledAt &&
        zonedDateTimeToUtc(campaignData.scheduledAt, campaignData.timezone || 'UTC').getTime() > Date.now();

      if (isFutureSchedule) {
        toast({
          title: t('emailCampaign.scheduled_title', 'Campaign Scheduled'),
          description: t('emailCampaign.scheduled_desc', '"{{name}}" is scheduled and will send later.', { name: campaignData.name }),
        });
        setTimeout(() => setLocation('/campaigns'), 1500);
        return;
      }

      const startRes = await fetch(`/api/campaigns/${id}/start`, { method: 'POST' });
      const startData = await startRes.json();
      if (!startData.success) throw new Error(startData.error);
      toast({ title: t('emailCampaign.launched_title', 'Campaign Launched'), description: t('emailCampaign.launched_desc', '"{{name}}" is now running.', { name: campaignData.name }) });
      setTimeout(() => setLocation('/campaigns'), 1500);
    } catch (error) {
      toast({
        title: t('emailCampaign.launch_failed_title', 'Launch Failed'),
        description: error instanceof Error ? error.message : t('emailCampaign.launch_failed_desc', 'Failed to launch.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: {
        return (
          <div className="space-y-6">
            <div>
              <Label htmlFor="name">{t('emailCampaign.campaign_name', 'Campaign Name')} *</Label>
              <Input data-tour="components-campaigns-emailcampaignbuilder.input.emailCampaign.placeholder_name"
                id="name"
                value={campaignData.name}
                onChange={(e) => setCampaignData((p) => ({ ...p, name: e.target.value }))}
                placeholder={t('emailCampaign.placeholder_name', 'My Email Campaign')}
              />
            </div>
            <div>
              <Label htmlFor="description">{t('emailCampaign.description', 'Description')}</Label>
              <Textarea data-tour="components-campaigns-emailcampaignbuilder.textarea.emailCampaign.placeholder_description"
                id="description"
                value={campaignData.description}
                onChange={(e) => setCampaignData((p) => ({ ...p, description: e.target.value }))}
                placeholder={t('emailCampaign.placeholder_description', 'Optional description')}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="emailSubject">{t('emailCampaign.email_subject', 'Email Subject')} *</Label>
              <Input data-tour="components-campaigns-emailcampaignbuilder.input.emailCampaign.placeholder_subject"
                id="emailSubject"
                value={campaignData.emailSubject}
                onChange={(e) => setCampaignData((p) => ({ ...p, emailSubject: e.target.value }))}
                placeholder={t('emailCampaign.placeholder_subject', 'Subject line')}
              />
            </div>
            <div>
              <Label>{t('emailCampaign.email_provider', 'Email Provider')}</Label>
              <RadioGroup
                value={campaignData.emailProvider}
                onValueChange={(v: 'smtp' | 'ses') => setCampaignData((p) => ({ ...p, emailProvider: v, channelId: v === 'ses' ? undefined : p.channelId }))}
                className="flex flex-col gap-3 mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="smtp" id="provider-smtp" />
                  <Label htmlFor="provider-smtp" className="font-normal cursor-pointer">{t('emailCampaign.provider_smtp', 'Existing SMTP Email Channel')}</Label>
                </div>
                {campaignData.emailProvider === 'smtp' && (
                  <div className="pl-6">
                    {emailConnections.length === 0 ? (
                      <p className="text-sm text-amber-600">
                        {t('emailCampaign.no_email_connections', 'No email connections found.')} <Link href="/settings"><span className="underline">{t('emailCampaign.go_to_email_settings', 'Go to Settings → Email Settings')}</span></Link> {t('emailCampaign.to_add_one', 'to add one.')}
                      </p>
                    ) : (
                      <Select
                        value={campaignData.channelId?.toString() ?? ''}
                        onValueChange={(v) => setCampaignData((p) => ({ ...p, channelId: v ? parseInt(v) : undefined }))}
                      >
                        <SelectTrigger data-tour="components-campaigns-emailcampaignbuilder.selecttrigger.emailCampaign.placeholder_select_smtp" className="max-w-md">
                          <SelectValue placeholder={t('emailCampaign.placeholder_select_smtp', 'Select SMTP channel')} />
                        </SelectTrigger>
                        <SelectContent>
                          {emailConnections.map((conn: any) => (
                            <SelectItem key={conn.id} value={conn.id.toString()}>{conn.name || conn.accountName || `Connection ${conn.id}`}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ses" id="provider-ses" />
                  <Label htmlFor="provider-ses" className="font-normal cursor-pointer">{t('emailCampaign.provider_ses', 'Amazon SES')}</Label>
                </div>
                {campaignData.emailProvider === 'ses' && (
                  <p className="text-xs text-muted-foreground pl-6">{t('emailCampaign.ses_credentials_note', 'SES credentials configured in Settings → Email Settings will be used.')}</p>
                )}
              </RadioGroup>
            </div>
          </div>
        );
      }
      case 1: {
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{t('emailCampaign.choose_segment', 'Choose a contact segment to target.')}</p>
              <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.create_segment" type="button" onClick={() => setIsSegmentModalOpen(true)} className="flex items-center gap-2">
                <Plus className="w-4 h-4" /> {t('emailCampaign.create_segment', 'Create New Segment')}
              </Button>
            </div>
            <div>
              <Input data-tour="components-campaigns-emailcampaignbuilder.input.emailCampaign.search_segments"
                placeholder={t('emailCampaign.search_segments', 'Search segments...')}
                value={segmentSearchQuery}
                onChange={(e) => setSegmentSearchQuery(e.target.value)}
                className="max-w-md"
              />
            </div>
            {segmentsLoading ? (
              <SkeletonLoader type="card" count={4} />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredSegments.map((segment) => (
                  <div key={segment.id} className="group">
                    <SegmentCard
                      segment={segment}
                      isSelected={campaignData.segmentId === segment.id}
                      onSelect={() => handleSegmentSelect(segment.id.toString())}
                      onEdit={() => setEditSegmentId(segment.id)}
                      onDelete={() => handleSegmentDelete(segment.id)}
                    />
                  </div>
                ))}
              </div>
            )}
            {!segmentsLoading && filteredSegments.length === 0 && (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground mb-2">{t('emailCampaign.no_segments', 'No segments found.')}</p>
                <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.create_first_segment" type="button" variant="outline" onClick={() => setIsSegmentModalOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> {t('emailCampaign.create_first_segment', 'Create your first segment')}
                </Button>
              </div>
            )}
          </div>
        );
      }
      case 2: {
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="sr-only">Template</Label>
              <Select
                value={campaignData.templateId?.toString() ?? ''}
                onValueChange={handleTemplateSelect}
              >
                <SelectTrigger data-tour="components-campaigns-emailcampaignbuilder.selecttrigger.emailCampaign.placeholder_template" className="w-[280px]">
                  <SelectValue placeholder={t('emailCampaign.placeholder_template', 'Choose a template (optional)')} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.create_template"
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsTemplateModalOpen(true)}
                className="flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {t('emailCampaign.create_template', 'Create template')}
              </Button>
              {campaignData.templateId && (
                <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.edit_template"
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditTemplateId(campaignData.templateId!)}
                  className="flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  {t('emailCampaign.edit_template', 'Edit template')}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.plain_text"
                type="button"
                variant={contentMode === 'text' ? 'default' : 'outline'}
                onClick={() => setContentMode('text')}
              >
                {t('emailCampaign.plain_text', 'Plain Text')}
              </Button>
              <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.visual_html"
                type="button"
                variant={contentMode === 'html' ? 'default' : 'outline'}
                onClick={() => setContentMode('html')}
              >
                {t('emailCampaign.visual_html', 'Visual HTML')}
              </Button>
            </div>
            {contentMode === 'text' ? (
              <>
                <Textarea data-tour="components-campaigns-emailcampaignbuilder.textarea.emailCampaign.placeholder_body"
                  ref={contentTextareaRef}
                  value={campaignData.content}
                  onChange={(e) => setCampaignData((p) => ({ ...p, content: e.target.value }))}
                  placeholder={t('emailCampaign.placeholder_body', 'Email body...')}
                  rows={12}
                  className="font-mono text-sm"
                />
                <VariableInsertion
                  textareaRef={contentTextareaRef}
                  value={campaignData.content}
                  onChange={(value) => setCampaignData((p) => ({ ...p, content: value }))}
                />
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{t('emailCampaign.html_note', 'HTML content will be sent as the email body.')}</p>
                <div ref={editorRef} style={{ height: '500px', border: '1px solid var(--border)', borderRadius: '8px' }} />
              </>
            )}
          </div>
        );
      }
      case 3: {
        return (
          <div className="space-y-6">
            <div>
              <Label>{t('emailCampaign.campaign_type', 'Campaign Type')}</Label>
              <RadioGroup
                value={campaignData.campaignType}
                onValueChange={(v: 'immediate' | 'scheduled') => setCampaignData((p) => ({ ...p, campaignType: v }))}
                className="flex gap-4 mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="immediate" id="type-immediate" />
                  <Label htmlFor="type-immediate" className="font-normal">{t('emailCampaign.send_immediately', 'Send Immediately')}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="scheduled" id="type-scheduled" />
                  <Label htmlFor="type-scheduled" className="font-normal">{t('emailCampaign.schedule_later', 'Schedule for Later')}</Label>
                </div>
              </RadioGroup>
            </div>
            {campaignData.campaignType === 'scheduled' && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="scheduledAt">{t('emailCampaign.scheduled_datetime', 'Scheduled Date & Time')}</Label>
                  <Input data-tour="components-campaigns-emailcampaignbuilder.input.scheduledAt"
                    id="scheduledAt"
                    type="datetime-local"
                    value={campaignData.scheduledAt ?? ''}
                    onChange={(e) => setCampaignData((p) => ({ ...p, scheduledAt: e.target.value || undefined }))}
                    className="max-w-xs mt-2"
                  />
                </div>
                <div>
                  <Label>{t('emailCampaign.timezone_label', 'Timezone')}</Label>
                  <div className="mt-2 flex gap-2 max-w-xl">
                    <TimezoneSelector
                      value={campaignData.timezone || 'UTC'}
                      onChange={(tz) => setCampaignData((p) => ({ ...p, timezone: tz }))}
                      className="flex-1"
                    />
                    <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.auto_detect_timezone"
                      type="button"
                      variant="outline"
                      onClick={() => setCampaignData((p) => ({ ...p, timezone: getBrowserTimezone() }))}
                    >
                      {t('emailCampaign.auto_detect_timezone', 'Auto-detect')}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      }
      case 4: {
        const segment = segments.find((s) => s.id === campaignData.segmentId);
        const contentPreview = contentMode === 'html' && grapesjsEditorRef.current
          ? grapesjsEditorRef.current.getHtml()
          : campaignData.content;
        const warnings: string[] = [];
        if (!campaignData.name?.trim()) warnings.push(t('emailCampaign.warn_name_required', 'Campaign name is required.'));
        if (!campaignData.emailSubject?.trim()) warnings.push(t('emailCampaign.warn_subject_required', 'Email subject is required.'));
        if (campaignData.emailProvider === 'smtp' && !campaignData.channelId) warnings.push(t('emailCampaign.warn_smtp_required', 'SMTP channel is required.'));
        if (!campaignData.segmentId) warnings.push(t('emailCampaign.warn_segment_required', 'Segment is required.'));
        if (!contentPreview?.trim()) warnings.push(t('emailCampaign.warn_content_required', 'Content is required.'));

        return (
          <div className="space-y-6">
            {warnings.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <p className="font-medium text-amber-800 dark:text-amber-200">{t('emailCampaign.fix_before_launch', 'Please fix before launching:')}</p>
                <ul className="list-disc list-inside text-sm text-amber-700 dark:text-amber-300 mt-1">
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-4 text-sm">
              <p><strong>{t('emailCampaign.label_name', 'Name')}:</strong> {campaignData.name || '—'}</p>
              <p><strong>{t('emailCampaign.label_subject', 'Subject')}:</strong> {campaignData.emailSubject || '—'}</p>
              <p><strong>{t('emailCampaign.label_provider', 'Provider')}:</strong> {campaignData.emailProvider === 'ses' ? t('emailCampaign.provider_ses', 'Amazon SES') : 'SMTP'}</p>
              <p><strong>{t('emailCampaign.label_channel', 'Channel')}:</strong> {campaignData.emailProvider === 'ses' ? t('emailCampaign.ses_settings', 'SES (Settings)') : (emailConnections.find((c: any) => c.id === campaignData.channelId)?.name || '—')}</p>
              <p><strong>{t('emailCampaign.label_segment', 'Segment')}:</strong> {segment ? `${segment.name} (${segment.contactCount} ${t('emailCampaign.contacts', 'contacts')})` : '—'}</p>
              <p><strong>{t('emailCampaign.label_type', 'Type')}:</strong> {campaignData.campaignType === 'scheduled' ? `${t('emailCampaign.scheduled', 'Scheduled')}: ${campaignData.scheduledAt ? new Date(campaignData.scheduledAt).toLocaleString() : '—'}` : t('emailCampaign.send_immediately', 'Send Immediately')}</p>
              <p><strong>{t('emailCampaign.content_preview', 'Content preview')}:</strong></p>
              <div className="bg-muted p-3 rounded-md max-h-32 overflow-y-auto">
                <pre className="text-muted-foreground text-xs whitespace-pre-wrap line-clamp-4">{(contentPreview || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 300)}{(contentPreview && contentPreview.length > 300 ? '...' : '')}</pre>
              </div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="max-w-8xl mx-auto space-y-6 pb-20 px-4 sm:px-6 lg:px-8">
      <div className="bg-gradient-to-r from-muted to-muted/80 rounded-xl p-6 mb-8 border border-border">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="ghost" size="sm" onClick={() => setLocation('/campaigns')} className="hover:bg-accent">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 data-tour="components-campaigns-emailcampaignbuilder.h1.emailCampaign.edit_title" className="text-2xl text-foreground">
              {isEditMode ? t('emailCampaign.edit_title', 'Edit Email Campaign') : t('emailCampaign.create_title', 'Create Email Campaign')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('emailCampaign.step_of', 'Step {{current}} of {{total}}', { current: currentStep + 1, total: EMAIL_CAMPAIGN_STEPS.length })}: {EMAIL_CAMPAIGN_STEPS[currentStep].title}
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 bg-background/60 rounded-full px-4 py-2">
            <div className="w-2 h-2 rounded-full bg-brand-primary" />
            <span className="text-sm font-medium">{Math.round(((currentStep + 1) / EMAIL_CAMPAIGN_STEPS.length) * 100)}% {t('emailCampaign.complete', 'Complete')}</span>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-2">
          <div className="bg-brand-primary h-2 rounded-full" style={{ width: `${((currentStep + 1) / EMAIL_CAMPAIGN_STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="bg-card rounded-xl p-4 sm:p-6 shadow-sm border border-border mb-8">
        <div className="flex items-center justify-between relative overflow-x-auto">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted -translate-y-1/2 z-0 hidden sm:block" />
          <div className="absolute top-1/2 left-0 h-0.5 bg-brand-primary -translate-y-1/2 z-0 hidden sm:block" style={{ width: `${(currentStep / (EMAIL_CAMPAIGN_STEPS.length - 1)) * 100}%` }} />
          {EMAIL_CAMPAIGN_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;
            return (
              <div key={step.id} className="flex flex-col items-center relative z-10 min-w-0 flex-shrink-0">
                <button
                  onClick={() => index <= currentStep && setCurrentStep(index)}
                  disabled={index > currentStep}
                  className={`flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 ${isActive ? 'border-brand-primary bg-brand-primary text-white' : isCompleted ? 'border-green-500 bg-green-500 text-white cursor-pointer' : 'border-border bg-background text-muted-foreground'} ${index <= currentStep && !isActive ? 'hover:border-brand-primary hover:bg-accent cursor-pointer' : ''} ${index > currentStep ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {isCompleted ? <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" /> : <Icon className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
                <span className={`mt-2 text-xs sm:text-sm font-medium ${isActive ? 'text-foreground' : isCompleted ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>{step.title}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-6 text-center">
          <p className="text-muted-foreground text-sm">{getStepDescription(currentStep, t)}</p>
        </div>
      </div>

      <Card className="shadow-lg border-0 bg-card overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-muted to-muted/80 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-primary flex items-center justify-center">
              {(() => {
                const Icon = EMAIL_CAMPAIGN_STEPS[currentStep].icon;
                return <Icon className="w-5 h-5 text-white" />;
              })()}
            </div>
            <div>
              <CardTitle className="text-xl font-semibold">{EMAIL_CAMPAIGN_STEPS[currentStep].title}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{getStepDescription(currentStep, t)}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-8">
          <div className="min-h-[400px]">{renderStepContent()}</div>
        </CardContent>
      </Card>

      <div className="bg-card rounded-xl p-6 shadow-sm border border-border mt-8">
        <div className="flex justify-between items-center">
          <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.previous" variant="outline" onClick={handlePrevious} disabled={currentStep === 0}>
            <ArrowLeft className="w-4 h-4 mr-2" /> {t('emailCampaign.previous', 'Previous')}
          </Button>
          <div className="flex gap-3">
            <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.save_draft" variant="outline" onClick={handleSaveDraft} disabled={loading}>
              <Save className="w-4 h-4 mr-2" /> {t('emailCampaign.save_draft', 'Save Draft')}
            </Button>
            {currentStep === EMAIL_CAMPAIGN_STEPS.length - 1 ? (
              <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.launching" onClick={handleLaunchClick} disabled={loading} className="min-w-[160px] px-8 py-3 bg-green-600 hover:bg-green-700 text-white">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t('emailCampaign.launching', 'Launching...')}</> : <><Send className="w-4 h-4 mr-2" /> {t('emailCampaign.launch_campaign', 'Launch Campaign')}</>}
              </Button>
            ) : (
              <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.next" onClick={handleNext} className="px-8 py-3 bg-brand-primary hover:bg-brand-primary text-white">
                {t('emailCampaign.next', 'Next')} <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border flex justify-center items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('emailCampaign.step_of', 'Step {{current}} of {{total}}', { current: currentStep + 1, total: EMAIL_CAMPAIGN_STEPS.length })}</span>
          <div className="flex gap-1 ml-2">
            {EMAIL_CAMPAIGN_STEPS.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === currentStep ? 'bg-brand-primary' : i < currentStep ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50">
        <Button data-tour="components-campaigns-emailcampaignbuilder.button.emailCampaign.quick_save" onClick={handleSaveDraft} disabled={loading} size="sm" className="w-12 h-12 rounded-full bg-background border-2 border-border shadow-lg" title={t('emailCampaign.quick_save', 'Quick Save')}>
          <Save className="w-4 h-4 text-muted-foreground" />
        </Button>
      </div>

      <CreateSegmentModal isOpen={isSegmentModalOpen} onClose={() => setIsSegmentModalOpen(false)} onSegmentCreated={handleSegmentCreated} />
      <CreateTemplateModal isOpen={isTemplateModalOpen} onClose={() => setIsTemplateModalOpen(false)} onTemplateCreated={handleTemplateCreated} whatsappChannelType={WHATSAPP_CHANNEL_TYPES.UNOFFICIAL} />
      {editSegmentId && (
        <EditSegmentModal isOpen={true} onClose={() => setEditSegmentId(null)} segmentId={editSegmentId} onSegmentUpdated={handleSegmentUpdated} />
      )}
      {editTemplateId && (
        <EditTemplateModal isOpen={true} onClose={() => setEditTemplateId(null)} templateId={editTemplateId} onTemplateUpdated={handleTemplateUpdated} />
      )}

      <AlertDialog open={showLaunchConfirmation} onOpenChange={setShowLaunchConfirmation}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('emailCampaign.launch_confirm_title', 'Launch Email Campaign')}</AlertDialogTitle>
            <AlertDialogDescription>{t('emailCampaign.launch_confirm_desc', 'Are you sure you want to launch this campaign? It will start sending emails to the selected segment.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLaunchConfirm}>{t('emailCampaign.launch', 'Launch')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
