import { useState, useRef, useMemo } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { isChannelAvailable } from '@shared/channel-utils';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, AlertCircle, Info, Upload, X, Image as ImageIcon, Video, FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  compileSystemVariableText,
  extractTemplateVariables,
  type WhatsAppParameterFormat,
  type WhatsAppTemplateVariableMappings,
} from '@shared/whatsapp-template-variables';
import { TemplateVariableMappingField, TemplateVariableTextEditor } from './TemplateVariableMappingField';

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTemplateModal({ isOpen, onClose }: CreateTemplateModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'marketing' | 'utility' | 'authentication'>('utility');
  const [language, setLanguage] = useState('en');
  const [content, setContent] = useState('');
  const [headerType, setHeaderType] = useState<'none' | 'text' | 'image' | 'video' | 'document'>('none');
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [headerMediaFile, setHeaderMediaFile] = useState<File | null>(null);
  const [headerMediaPreview, setHeaderMediaPreview] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);
  const [parameterFormat, setParameterFormat] = useState<WhatsAppParameterFormat>('positional');
  const [variableExamples, setVariableExamples] = useState<Record<string, string>>({});
  const [variableMappings, setVariableMappings] = useState<WhatsAppTemplateVariableMappings>({});
  const [buttons, setButtons] = useState<Array<{ type: 'URL' | 'COPY_CODE'; text: string; url?: string }>>([]);

  const compiledDraft = useMemo(() => {
    try {
      const sourceTexts = [headerType === 'text' ? headerText : '', content, ...buttons.map(button => button.url || '')];
      const tokens = sourceTexts.flatMap(text => Array.from(text.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g), match => match[1].trim()));
      const systemTokens = tokens.filter(token => /^[A-Za-z_][A-Za-z0-9_.-]*\.[A-Za-z0-9_.-]+$/.test(token));
      const usesSystemVariables = systemTokens.length > 0;
      const header = compileSystemVariableText(headerText, position => `header:${position}`);
      const body = compileSystemVariableText(content, position => `body:${position}`);
      const compiledButtons = buttons.map((button, index) => {
        if (button.type !== 'URL') return button;
        const compiled = compileSystemVariableText(button.url || '', position => `button:${index}:url:${position}`);
        return { ...button, url: compiled.text, _mappings: compiled.mappings };
      });
      const autoMappings: WhatsAppTemplateVariableMappings = {
        ...header.mappings,
        ...body.mappings,
        ...compiledButtons.reduce((all, button: any) => ({ ...all, ...(button._mappings || {}) }), {}),
      };
      const cleanButtons = compiledButtons.map(({ _mappings, ...button }: any) => button);
      const components = [
        ...(headerType === 'text' && header.text ? [{ type: 'HEADER', format: 'TEXT', text: header.text }] : []),
        { type: 'BODY', text: body.text },
        ...(cleanButtons.length ? [{ type: 'BUTTONS', buttons: cleanButtons }] : []),
      ];
      return {
        content: body.text,
        headerText: header.text,
        buttons: cleanButtons,
        components,
        autoMappings,
        parameterFormat: usesSystemVariables ? 'positional' as const : parameterFormat,
        usesSystemVariables,
        error: '',
      };
    } catch (error: any) {
      return { content, headerText, buttons, components: [], autoMappings: {}, parameterFormat, usesSystemVariables: false, error: error.message || 'Invalid template variables' };
    }
  }, [headerType, headerText, content, buttons, parameterFormat, t]);
  const variableParse = useMemo(() => {
    try {
      if (compiledDraft.error) throw new Error(compiledDraft.error);
      return { ...extractTemplateVariables(compiledDraft.components, compiledDraft.parameterFormat), error: '' };
    } catch (error: any) {
      return { parameterFormat: compiledDraft.parameterFormat, variables: [], error: error.message || 'Invalid template variables' };
    }
  }, [compiledDraft]);
  const effectiveMappings = useMemo<WhatsAppTemplateVariableMappings>(() => ({
    ...variableMappings,
    ...(compiledDraft.autoMappings as WhatsAppTemplateVariableMappings),
  }), [variableMappings, compiledDraft.autoMappings]);


  const { data: channels = [] } = useQuery({
    queryKey: ['/api/channel-connections'],
    select: (data: any[]) => data.filter(ch => ch.channelType === 'whatsapp_official' && isChannelAvailable(ch)),
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/whatsapp-templates', data);
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || error.message || t('templates.create_failed', 'Failed to create template'));
      }
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: t('templates.created', 'Template Created'),
        description: t('templates.created_success', 'Template has been created and submitted for approval'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/whatsapp-templates'] });
      resetForm();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setName('');
    setDescription('');
    setCategory('utility');
    setLanguage('en');
    setContent('');
    setHeaderType('none');
    setHeaderText('');
    setFooterText('');
    setHeaderMediaFile(null);
    setHeaderMediaPreview(null);
    setSelectedConnectionId(null);
    setParameterFormat('positional');
    setVariableExamples({});
    setVariableMappings({});
    setButtons([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleMediaFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;


    const validTypes: Record<string, string[]> = {
      image: ['image/jpeg', 'image/png'],
      video: ['video/mp4'],
      document: ['application/pdf']
    };

    if (headerType !== 'none' && headerType !== 'text') {
      const allowed = validTypes[headerType];
      if (!allowed.includes(file.type)) {
        toast({
          title: t('common.error', 'Error'),
          description: t('templates.invalid_file_type', 'Invalid file type for selected header format'),
          variant: 'destructive',
        });
        return;
      }
    }


    const maxSizes: Record<string, number> = {
      image: 5 * 1024 * 1024,
      video: 16 * 1024 * 1024,
      document: 100 * 1024 * 1024
    };

    const maxSize = maxSizes[headerType as keyof typeof maxSizes] || 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.file_too_large', 'File size exceeds the maximum allowed'),
        variant: 'destructive',
      });
      return;
    }

    setHeaderMediaFile(file);
    setHeaderMediaPreview(URL.createObjectURL(file));
  };

  const removeMediaFile = () => {
    if (headerMediaPreview) {
      URL.revokeObjectURL(headerMediaPreview);
    }
    setHeaderMediaFile(null);
    setHeaderMediaPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();


    if (!name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.name_required', 'Template name is required'),
        variant: 'destructive',
      });
      return;
    }


    if (!/^[a-z0-9_]+$/.test(name)) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.name_format_error', 'Template name must contain only lowercase letters, numbers, and underscores'),
        variant: 'destructive',
      });
      return;
    }

    if (!content.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.content_required', 'Template content is required'),
        variant: 'destructive',
      });
      return;
    }


    if (['image', 'video', 'document'].includes(headerType) && !headerMediaFile) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.media_required', 'Please upload a media file for the header'),
        variant: 'destructive',
      });
      return;
    }

    if (channels.length === 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.no_channels', 'Please connect a WhatsApp Business API channel first'),
        variant: 'destructive',
      });
      return;
    }

    if (!selectedConnectionId) {
      toast({
        title: t('common.error', 'Error'),
        description: t('templates.select_connection', 'Please select a WhatsApp connection'),
        variant: 'destructive',
      });
      return;
    }


    if (variableParse.error) {
      toast({ title: t('common.error', 'Error'), description: variableParse.error, variant: 'destructive' });
      return;
    }
    const missingExample = variableParse.variables.find(variable => !variableExamples[variable.id]?.trim());
    if (missingExample) {
      toast({ title: t('common.error', 'Error'), description: `Example value is required for ${missingExample.id}`, variant: 'destructive' });
      return;
    }
    const missingMapping = variableParse.variables.find(variable => {
      const mapping = effectiveMappings[variable.id];
      return !mapping || (mapping.source === 'fixed'
        ? !mapping.value?.trim() && !mapping.fallback?.trim()
        : !mapping.field?.trim());
    });
    if (missingMapping) {
      toast({ title: t('common.error', 'Error'), description: `Choose a system variable or fixed value for ${missingMapping.id}`, variant: 'destructive' });
      return;
    }
    const headerVariables = variableParse.variables.filter(variable => variable.component === 'header');
    if (headerVariables.length > 1) {
      toast({ title: t('common.error', 'Error'), description: t('templates.header_one_variable', 'Meta text headers support only one variable'), variant: 'destructive' });
      return;
    }


    let headerMediaUrl: string | undefined;
    if (headerMediaFile && ['image', 'video', 'document'].includes(headerType)) {
      try {
        setUploadingMedia(true);
        const formData = new FormData();
        formData.append('media', headerMediaFile);

        const uploadResponse = await fetch('/api/templates/upload-media', {
          method: 'POST',
          body: formData
        });

        if (!uploadResponse.ok) {
          throw new Error(t('templates.media_upload_failed', 'Media upload failed'));
        }

        const uploadData = await uploadResponse.json();
        headerMediaUrl = uploadData.data.url;
      } catch (error) {
        toast({
          title: t('common.error', 'Error'),
          description: t('templates.media_upload_failed', 'Failed to upload media file'),
          variant: 'destructive',
        });
        setUploadingMedia(false);
        return;
      } finally {
        setUploadingMedia(false);
      }
    }


    const templateData = {
      name: name.trim(),
      description: description.trim() || undefined,
      whatsappTemplateCategory: category,
      whatsappTemplateLanguage: language,
      content: compiledDraft.content.trim(),
      variables: variableParse.variables.filter(v => v.component === 'body').map(v => v.name || String(v.position)),
      parameterFormat: compiledDraft.parameterFormat,
      variableExamples,
      variableMappings: effectiveMappings,
      buttons: compiledDraft.buttons,
      whatsappChannelType: 'official',
      connectionId: selectedConnectionId,
      headerType: headerType !== 'none' ? headerType : undefined,
      headerText: headerType === 'text' ? compiledDraft.headerText.trim() : undefined,
      headerMediaUrl: headerMediaUrl,
      footerText: footerText.trim() || undefined,
    };

    createTemplateMutation.mutate(templateData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-templates-createtemplatemodal.dialogcontent.templates.create_title" className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('templates.create_title', 'Create WhatsApp Template')}</DialogTitle>
          <DialogDescription>
            {t('templates.create_description', 'Create a new message template for WhatsApp Business API. Templates must be approved by Meta before use.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {channels.length === 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                {t('templates.no_connections_alert', 'No active WhatsApp Business API connections found. Please connect a WhatsApp channel first.')}
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {t('templates.approval_notice', 'Templates are submitted to Meta for approval. This process typically takes 24-48 hours.')}
            </AlertDescription>
          </Alert>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                {t('templates.name', 'Template Name')} <span className="text-red-500">*</span>
              </Label>
              <Input data-tour="components-templates-createtemplatemodal.input.templates.name_example"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder={t('templates.name_example', 'welcome_message')}
                required
              />
              <p className="text-xs text-gray-500">
                {t('templates.name_help', 'Use lowercase letters, numbers, and underscores only')}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">{t('templates.description_label', 'Description')}</Label>
              <Input data-tour="components-templates-createtemplatemodal.input.templates.description_placeholder"
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('templates.description_placeholder', 'Brief description of this template')}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="connection">
                {t('templates.whatsapp_connection', 'WhatsApp Connection')} <span className="text-red-500">*</span>
              </Label>
              <Select
                value={selectedConnectionId?.toString() || ''}
                onValueChange={(value) => setSelectedConnectionId(Number(value))}
              >
                <SelectTrigger data-tour="components-templates-createtemplatemodal.selecttrigger.templates.select_connection_placeholder">
                  <SelectValue placeholder={t('templates.select_connection_placeholder', 'Select a WhatsApp connection')} />
                </SelectTrigger>
                <SelectContent>
                  {channels.length === 0 ? (
                    <div className="p-2 text-sm text-gray-500">
                      {t('templates.no_connections', 'No active WhatsApp connections found')}
                    </div>
                  ) : (
                    channels.map((channel: any) => {
                      const phoneNumber = channel.connectionData?.phoneNumber ||
                                         channel.connectionData?.phone_number ||
                                         channel.accountName;
                      const displayName = phoneNumber || channel.accountName || t('templates.connection_fallback', 'Connection {{id}}', { id: channel.id });
                      return (
                        <SelectItem key={channel.id} value={channel.id.toString()}>
                          {displayName}
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {t('templates.connection_help', 'Select the WhatsApp Business API connection to submit this template')}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">
                  {t('templates.category', 'Category')} <span className="text-red-500">*</span>
                </Label>
                <Select value={category} onValueChange={(value: any) => setCategory(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="utility">{t('templates.category.utility', 'Utility')}</SelectItem>
                    <SelectItem value="marketing">{t('templates.category.marketing', 'Marketing')}</SelectItem>
                    <SelectItem value="authentication">{t('templates.category.authentication', 'Authentication')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {category === 'marketing' && t('templates.category_help.marketing', 'Promotional content, requires opt-in')}
                  {category === 'utility' && t('templates.category_help.utility', 'Transactional updates, confirmations')}
                  {category === 'authentication' && t('templates.category_help.authentication', 'OTP and verification codes')}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="language">
                  {t('templates.language', 'Language')} <span className="text-red-500">*</span>
                </Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">{t('templates.language.en', 'English')}</SelectItem>
                    <SelectItem value="en_US">{t('templates.language.en_US', 'English (US)')}</SelectItem>
                    <SelectItem value="es">{t('templates.language.es', 'Spanish')}</SelectItem>
                    <SelectItem value="pt_BR">{t('templates.language.pt_BR', 'Portuguese (Brazil)')}</SelectItem>
                    <SelectItem value="fr">{t('templates.language.fr', 'French')}</SelectItem>
                    <SelectItem value="de">{t('templates.language.de', 'German')}</SelectItem>
                    <SelectItem value="it">{t('templates.language.it', 'Italian')}</SelectItem>
                    <SelectItem value="ar">{t('templates.language.ar', 'Arabic')}</SelectItem>
                    <SelectItem value="hi">{t('templates.language.hi', 'Hindi')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t('templates.parameter_format', 'Variable Format')}</Label>
              <Select value={compiledDraft.parameterFormat} disabled={compiledDraft.usesSystemVariables} onValueChange={(value: WhatsAppParameterFormat) => {
                setParameterFormat(value);
                setVariableExamples({});
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="positional">{t('templates.parameter_format.positional', 'Positional — {{1}}, {{2}}')}</SelectItem>
                  <SelectItem value="named">{t('templates.parameter_format.named', 'Named — {{customer_name}}')}</SelectItem>
                </SelectContent>
              </Select>
              {compiledDraft.usesSystemVariables && (
                <p className="text-xs text-muted-foreground">
                  {t('templates.system_variables_positional', 'System variables are converted to the numbered positional format required by Meta.')}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="headerType">{t('templates.header', 'Header (Optional)')}</Label>
              <Select value={headerType} onValueChange={(value: any) => {
                setHeaderType(value);

                if (!['image', 'video', 'document'].includes(value)) {
                  removeMediaFile();
                }
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('templates.header.none', 'No Header')}</SelectItem>
                  <SelectItem value="text">{t('templates.header.text', 'Text Header')}</SelectItem>
                  <SelectItem value="image">{t('templates.header.image', 'Image Header')}</SelectItem>
                  <SelectItem value="video">{t('templates.header.video', 'Video Header')}</SelectItem>
                  <SelectItem value="document">{t('templates.header.document', 'Document Header')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {headerType === 'image' && t('templates.header_help.image', 'JPEG or PNG, max 5MB')}
                {headerType === 'video' && t('templates.header_help.video', 'MP4, max 16MB')}
                {headerType === 'document' && t('templates.header_help.document', 'PDF, max 100MB')}
              </p>
            </div>

            {headerType === 'text' && (
              <div className="grid gap-2">
                <Label htmlFor="headerText">{t('templates.header_text', 'Header Text')}</Label>
                <TemplateVariableTextEditor
                  value={headerText}
                  onChange={setHeaderText}
                  placeholder={t('templates.header_text_placeholder', 'Enter header text')}
                  maxLength={60}
                />
                <p className="text-xs text-gray-500">{headerText.length}/60</p>
              </div>
            )}

            {['image', 'video', 'document'].includes(headerType) && (
              <div className="grid gap-2">
                <Label htmlFor="headerMedia">
                  {t('templates.header_media', 'Header Media')} <span className="text-red-500">*</span>
                </Label>
                <input data-tour="components-templates-createtemplatemodal.input.templates.header_media"
                  ref={fileInputRef}
                  type="file"
                  id="headerMedia"
                  onChange={handleMediaFileSelect}
                  accept={
                    headerType === 'image' ? 'image/jpeg,image/png' :
                    headerType === 'video' ? 'video/mp4' :
                    'application/pdf'
                  }
                  className="hidden"
                />
                {!headerMediaPreview ? (
                  <Button data-tour="components-templates-createtemplatemodal.button.templates.upload_media"
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {t('templates.upload_media', 'Upload Media')}
                  </Button>
                ) : (
                  <div className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {headerType === 'image' && <ImageIcon className="h-5 w-5 text-blue-500" />}
                        {headerType === 'video' && <Video className="h-5 w-5 text-purple-500" />}
                        {headerType === 'document' && <FileText className="h-5 w-5 text-red-500" />}
                        <span className="text-sm font-medium">{headerMediaFile?.name}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeMediaFile}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {headerType === 'image' && headerMediaPreview && (
                      <img
                        src={headerMediaPreview}
                        alt={t('templates.image_preview', 'Preview')}
                        className="w-full h-48 object-cover rounded"
                      />
                    )}
                    {headerType === 'video' && headerMediaPreview && (
                      <video
                        src={headerMediaPreview}
                        controls
                        className="w-full h-48 rounded"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="content">
                {t('templates.body', 'Body Content')} <span className="text-red-500">*</span>
              </Label>
              <TemplateVariableTextEditor
                value={content}
                onChange={setContent}
                placeholder={t('templates.body_placeholder', 'Hello {{contact.name}}, your appointment is {{appointment.date}}.')}
                multiline
                className="min-h-[150px]"
                maxLength={1024}
              />
              <p className="text-xs text-gray-500">
                {compiledDraft.usesSystemVariables
                  ? t('templates.variables_help_system', 'Insert any available system variable; it will be mapped to a Meta placeholder automatically.')
                  : parameterFormat === 'named'
                  ? t('templates.variables_help_named', 'Use lowercase names such as {{customer_name}}')
                  : t('templates.variables_help', 'Use {{1}}, {{2}}, etc. for dynamic variables')} • {content.length}/1024
              </p>
              {compiledDraft.usesSystemVariables && !compiledDraft.error && (
                <div className="rounded bg-muted px-3 py-2 text-xs">
                  <span className="font-medium">{t('templates.meta_preview', 'Meta template')}:</span>{' '}
                  <span className="whitespace-pre-wrap font-mono">{compiledDraft.content}</span>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>{t('templates.dynamic_buttons', 'Dynamic Buttons')}</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setButtons(prev => [...prev, { type: 'URL', text: '', url: '' }])}>+ URL</Button>
                  <Button data-tour="components-templates-createtemplatemodal.button.templates.copy_code" type="button" size="sm" variant="outline" onClick={() => setButtons(prev => [...prev, { type: 'COPY_CODE', text: 'Copy code' }])}>+ {t('templates.copy_code', 'Copy Code')}</Button>
                </div>
              </div>
              {buttons.map((button, index) => (
                <div key={index} className="grid grid-cols-[1fr_2fr_auto] gap-2 rounded border p-3">
                  <Input data-tour="components-templates-createtemplatemodal.input.templates.button_label" value={button.text} disabled={button.type === 'COPY_CODE'} maxLength={25}
                    placeholder={t('templates.button_label', 'Button label')}
                    onChange={e => setButtons(prev => prev.map((item, i) => i === index ? { ...item, text: e.target.value } : item))} />
                  {button.type === 'URL' ? (
                    <Input value={button.url || ''} maxLength={2000}
                      placeholder="https://example.com/order/{{1}}"
                      onChange={e => setButtons(prev => prev.map((item, i) => i === index ? { ...item, url: e.target.value } : item))} />
                  ) : <div className="text-sm text-muted-foreground self-center">{t('templates.copy_code_help', 'Code is supplied when sending')}</div>}
                  <Button type="button" size="icon" variant="ghost" onClick={() => setButtons(prev => prev.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>

            {(variableParse.error || variableParse.variables.length > 0) && (
              <div className="grid gap-3 rounded border p-3">
                <Label>{t('templates.variable_mappings', 'Variable Mappings and Meta Examples')}</Label>
                {variableParse.error ? <p className="text-sm text-red-600">{variableParse.error}</p> : variableParse.variables.map(variable => (
                  <div key={variable.id} className="grid gap-2 rounded bg-muted/40 p-2 md:grid-cols-[minmax(130px,.7fr)_minmax(180px,1.4fr)_minmax(160px,1fr)] md:items-center">
                    <span className="text-sm font-mono">{variable.id}</span>
                    <TemplateVariableMappingField
                      mapping={effectiveMappings[variable.id]}
                      disabled={Boolean((compiledDraft.autoMappings as WhatsAppTemplateVariableMappings)[variable.id])}
                      onChange={mapping => setVariableMappings(prev => ({ ...prev, [variable.id]: mapping }))}
                    />
                    <Input data-tour="components-templates-createtemplatemodal.input.templates.variable_example_placeholder" value={variableExamples[variable.id] || ''} required
                      placeholder={t('templates.variable_example_placeholder', 'Example value required by Meta')}
                      onChange={e => setVariableExamples(prev => ({ ...prev, [variable.id]: e.target.value }))} />
                  </div>
                ))}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="footerText">{t('templates.footer', 'Footer (Optional)')}</Label>
              <Input data-tour="components-templates-createtemplatemodal.input.templates.footer_placeholder"
                id="footerText"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder={t('templates.footer_placeholder', 'Reply STOP to unsubscribe')}
                maxLength={60}
              />
              <p className="text-xs text-gray-500">{footerText.length}/60</p>
            </div>
          </div>

          <DialogFooter>
            <Button data-tour="components-templates-createtemplatemodal.button.common.cancel" type="button" variant="outline" onClick={onClose} disabled={uploadingMedia || createTemplateMutation.isPending}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-templates-createtemplatemodal.button.templates.uploading" type="submit" disabled={uploadingMedia || createTemplateMutation.isPending} className="btn-brand-primary">
              {(uploadingMedia || createTemplateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {uploadingMedia ? t('templates.uploading', 'Uploading...') : t('templates.submit_for_approval', 'Submit for Approval')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

