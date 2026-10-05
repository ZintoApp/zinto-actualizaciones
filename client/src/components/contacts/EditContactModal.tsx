import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { normalizeUsername, validateUsername } from '@/lib/username-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { CustomFieldFileSelect } from './CustomFieldFileSelect';
import { ColombiaCustomerFiscalFields } from '@/components/erp/ColombiaFiscalProfileFields';
import type { ColombiaCustomerFiscalProfile } from '@shared/factus';

interface Contact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
  tags?: string[] | null;
  customFields?: Record<string, any> | null;
  colombiaFiscalProfile?: ColombiaCustomerFiscalProfile | null;
  isActive?: boolean | null;
  identifier?: string | null;
  identifierType?: string | null;
  source?: string | null;
  notes?: string | null;
  whatsappUsername?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EditContactModalProps {
  contact: Contact | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: (contact: Contact) => void;
}

export default function EditContactModal({ contact, isOpen, onClose, onUpdated }: EditContactModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    identifierType: '',
    identifier: '',
    notes: '',
    tags: '',
    whatsappUsername: '',
    customFields: {} as Record<string, any>,
    colombiaFiscalProfile: {} as Partial<ColombiaCustomerFiscalProfile>,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation();

  const electronicInvoicingStatusQuery = useQuery<{ enabled: boolean }>({
    queryKey: ['/api/erp/invoices/electronic-invoicing-status'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/erp/invoices/electronic-invoicing-status');
      if (!response.ok) throw new Error('Failed to load electronic invoicing status');
      const body = await response.json();
      return body.data;
    },
    enabled: isOpen,
    retry: false,
  });
  const isFactusEnabled = electronicInvoicingStatusQuery.isSuccess
    && !electronicInvoicingStatusQuery.isFetching
    && electronicInvoicingStatusQuery.data.enabled === true;

  const { data: contactCustomFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'contact'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=contact');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  // Fetch available tags
  const { data: availableTags = [] } = useQuery({
    queryKey: ['/api/contacts/tags'],
    queryFn: async () => {
      const response = await fetch('/api/contacts/tags');
      if (!response.ok) {
        throw new Error('Failed to fetch tags');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  useEffect(() => {
    if (contact) {
      setFormData({
        name: contact.name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        identifierType: contact.identifierType || '',
        identifier: contact.identifier || '',
        notes: contact.notes || '',
        tags: Array.isArray(contact.tags) ? contact.tags.join(', ') : '',
        whatsappUsername: (contact as any).whatsappUsername || '',
        customFields: contact.customFields && typeof contact.customFields === 'object' ? { ...contact.customFields } : {},
        colombiaFiscalProfile: contact.colombiaFiscalProfile || { tributeCode: 'ZZ', responsibilities: ['R-99-PN'], countryCode: 'CO' },
      });
    }
  }, [contact]);

  const updateContactMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!contact?.id) throw new Error(t('contacts.edit.contact_id_missing', 'Contact ID is missing'));

      const response = await apiRequest('PATCH', `/api/contacts/${contact.id}`, data);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || t('contacts.edit.update_failed', 'Failed to update contact'));
      }
      
      return response.json();
    },
    onSuccess: (updatedContact: Contact) => {
      toast({
        title: t('contacts.edit.success_title', 'Contact updated'),
        description: t('contacts.edit.success_description', 'The contact has been successfully updated.'),
      });

      queryClient.setQueriesData({ queryKey: ['/api/contacts'] }, (cached: any) => {
        if (!cached) return cached;
        if (Array.isArray(cached)) {
          return cached.map((item) => item.id === updatedContact.id ? { ...item, ...updatedContact } : item);
        }
        if (Array.isArray(cached.contacts)) {
          return {
            ...cached,
            contacts: cached.contacts.map((item: Contact) =>
              item.id === updatedContact.id ? { ...item, ...updatedContact } : item,
            ),
          };
        }
        return cached;
      });
      queryClient.setQueryData(['/api/contacts/pins'], (cached: any) => {
        if (!cached || !Array.isArray(cached.contacts)) return cached;
        return {
          ...cached,
          contacts: cached.contacts.map((item: Contact) =>
            item.id === updatedContact.id ? { ...item, ...updatedContact } : item,
          ),
        };
      });
      onUpdated?.(updatedContact);
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/pins'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/tags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/documents', updatedContact.id] });

      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.edit.error_title', 'Update failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsSubmitting(false);
    }
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.whatsappUsername && !validateUsername(formData.whatsappUsername)) {
      toast({
        title: t('contacts.edit.error_title', 'Update failed'),
        description: t('contacts.edit.invalid_username', 'WhatsApp username must be 3-35 characters using letters, numbers, periods or underscores'),
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    
    const tagsArray = formData.tags
      ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];

    const customFieldsSanitized = Object.fromEntries(
      Object.entries(formData.customFields || {}).filter(
        ([_, v]) => v !== undefined && v !== null && v !== '' && (Array.isArray(v) ? v.length > 0 : true)
      )
    );
      
    const { colombiaFiscalProfile, ...contactData } = formData;
    updateContactMutation.mutate({
      ...contactData,
      tags: tagsArray,
      whatsappUsername: formData.whatsappUsername ? normalizeUsername(formData.whatsappUsername) : null,
      customFields: customFieldsSanitized,
      ...(isFactusEnabled ? { colombiaFiscalProfile } : {}),
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-contacts-editcontactmodal.dialogcontent.contacts.edit.title" className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('contacts.edit.title', 'Edit Contact')}</DialogTitle>
          <DialogDescription>
            {t('contacts.edit.description', 'Make changes to the contact information below.')}
          </DialogDescription>
        </DialogHeader>
        
       <form onSubmit={handleSubmit} className="space-y-4 pt-4 max-h-[65vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('contacts.edit.name_label', 'Name')} *</Label>
              <Input data-tour="components-contacts-editcontactmodal.input.name"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">{t('contacts.edit.email_label', 'Email')}</Label>
              <Input data-tour="components-contacts-editcontactmodal.input.email"
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t('contacts.edit.phone_label', 'Phone')}</Label>
              <LocalizedPhoneInput
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={(phone) => setFormData((current) => ({ ...current, phone }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="whatsappUsername">{t('contacts.edit.whatsapp_username_label', 'WhatsApp Username')}</Label>
              <Input data-tour="components-contacts-editcontactmodal.input.whatsappUsername"
                id="whatsappUsername"
                name="whatsappUsername"
                value={formData.whatsappUsername}
                onChange={handleInputChange}
                placeholder="@username"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="company">{t('contacts.edit.company_label', 'Company')}</Label>
              <Input data-tour="components-contacts-editcontactmodal.input.company"
                id="company"
                name="company"
                value={formData.company}
                onChange={handleInputChange}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="identifierType">{t('contacts.edit.channel_label', 'Channel')}</Label>
              <Select
                value={formData.identifierType}
                onValueChange={(value) => handleSelectChange('identifierType', value)}
              >
                <SelectTrigger data-tour="components-contacts-editcontactmodal.selecttrigger.contacts.edit.select_channel_placeholder">
                  <SelectValue placeholder={t('contacts.edit.select_channel_placeholder', 'Select channel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp_official">{t('contacts.edit.channel.whatsapp_official', 'WhatsApp Official')}</SelectItem>
                  <SelectItem value="whatsapp_unofficial">{t('contacts.edit.channel.whatsapp_unofficial', 'WhatsApp Unofficial')}</SelectItem>
                  <SelectItem value="messenger">{t('contacts.edit.channel.messenger', 'Facebook Messenger')}</SelectItem>
                  <SelectItem value="instagram">{t('contacts.edit.channel.instagram', 'Instagram')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="identifier">{t('contacts.edit.channel_identifier_label', 'Channel Identifier')}</Label>
              <Input data-tour="components-contacts-editcontactmodal.input.contacts.edit.channel_identifier_placeholder"
                id="identifier"
                name="identifier"
                value={formData.identifier}
                onChange={handleInputChange}
                placeholder={t('contacts.edit.channel_identifier_placeholder', 'Phone number or ID')}
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="tags">{t('contacts.edit.tags_label', 'Tags (comma separated)')}</Label>
            <Input data-tour="components-contacts-editcontactmodal.input.contacts.edit.tags_placeholder"
              id="tags"
              name="tags"
              value={formData.tags}
              onChange={handleInputChange}
              placeholder={t('contacts.edit.tags_placeholder', 'lead, customer, etc.')}
            />
            {availableTags.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  {t('contacts.edit.available_tags', 'Available tags:')}
                </div>
                <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                  {availableTags.map((tag: string) => {
                    const currentTags = formData.tags ? formData.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t) : [];
                    const isSelected = currentTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          const currentTags = formData.tags ? formData.tags.split(',').map((t: string) => t.trim()).filter((t: string) => t) : [];
                          if (isSelected) {
                            // Remove tag if already selected
                            const newTags = currentTags.filter((t: string) => t !== tag);
                            setFormData(prev => ({ ...prev, tags: newTags.join(', ') }));
                          } else {
                            // Add tag if not selected
                            const newTags = [...currentTags, tag];
                            setFormData(prev => ({ ...prev, tags: newTags.join(', ') }));
                          }
                        }}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                          isSelected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-muted hover:bg-muted/80 border-border'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {isFactusEnabled && <ColombiaCustomerFiscalFields value={formData.colombiaFiscalProfile} onChange={(colombiaFiscalProfile) => setFormData((prev) => ({ ...prev, colombiaFiscalProfile }))} />}

          {contactCustomFieldsSchema.length > 0 && (
            <div className="space-y-3">
              <Label>{t('contacts.edit.custom_fields_label', 'Custom Fields')}</Label>
              <div className="space-y-3">
                {contactCustomFieldsSchema.map((field: { id: number; fieldName: string; fieldLabel: string; fieldType: string; required?: boolean; options?: { value: string; label: string }[] }) => (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={`edit-cf-${field.fieldName}`} className="text-sm font-medium">
                      {field.fieldLabel}
                      {field.required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
                      {field.fieldType === 'multi_select' && ' (select multiple)'}
                    </Label>
                    {field.fieldType === 'file_select' && contact ? (
                      <CustomFieldFileSelect
                        ownerType="contact"
                        ownerId={contact.id}
                        value={formData.customFields[field.fieldName]}
                        onChange={(value) => setFormData(prev => ({
                          ...prev,
                          customFields: { ...prev.customFields, [field.fieldName]: value },
                        }))}
                      />
                    ) : field.fieldType === 'text' && (
                      <Input data-tour="components-contacts-editcontactmodal.input.contacts.edit.enter_value"
                        id={`edit-cf-${field.fieldName}`}
                        value={formData.customFields[field.fieldName] ?? ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          customFields: { ...prev.customFields, [field.fieldName]: e.target.value }
                        }))}
                        placeholder={t('contacts.edit.enter_value', 'Enter value...')}
                      />
                    )}
                    {field.fieldType === 'number' && (
                      <Input data-tour="components-contacts-editcontactmodal.input.contacts.edit.enter_value"
                        id={`edit-cf-${field.fieldName}`}
                        type="number"
                        value={formData.customFields[field.fieldName] ?? ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          customFields: {
                            ...prev.customFields,
                            [field.fieldName]: e.target.value === '' ? undefined : parseFloat(e.target.value)
                          }
                        }))}
                        placeholder={t('contacts.edit.enter_value', 'Enter value...')}
                      />
                    )}
                    {field.fieldType === 'select' && (
                      <Select
                        value={formData.customFields[field.fieldName] ?? ''}
                        onValueChange={(value) => setFormData(prev => ({
                          ...prev,
                          customFields: { ...prev.customFields, [field.fieldName]: value }
                        }))}
                      >
                        <SelectTrigger data-tour="components-contacts-editcontactmodal.selecttrigger.contacts.edit.select_option" id={`edit-cf-${field.fieldName}`}>
                          <SelectValue placeholder={t('contacts.edit.select_option', 'Select...')} />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                            const val = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                            const lab = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                            return (
                              <SelectItem key={val} value={val}>
                                {lab}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                    {field.fieldType === 'multi_select' && (
                      <div className="flex flex-wrap gap-2">
                        {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                          const optVal = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                          const optLab = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                          const selected = Array.isArray(formData.customFields[field.fieldName])
                            ? formData.customFields[field.fieldName].includes(optVal)
                            : false;
                          return (
                            <div key={optVal} className="flex items-center space-x-2">
                              <Checkbox
                                id={`edit-cf-${field.fieldName}-${optVal}`}
                                checked={selected}
                                onCheckedChange={(checked) => {
                                  const current = Array.isArray(formData.customFields[field.fieldName])
                                    ? formData.customFields[field.fieldName]
                                    : [];
                                  const next = checked
                                    ? [...current, optVal]
                                    : current.filter((v: string) => v !== optVal);
                                  setFormData(prev => ({
                                    ...prev,
                                    customFields: { ...prev.customFields, [field.fieldName]: next }
                                  }));
                                }}
                              />
                              <label htmlFor={`edit-cf-${field.fieldName}-${optVal}`} className="text-sm cursor-pointer">
                                {optLab}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {field.fieldType === 'date' && (
                      <Input
                        id={`edit-cf-${field.fieldName}`}
                        type="date"
                        value={formData.customFields[field.fieldName] ?? ''}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          customFields: { ...prev.customFields, [field.fieldName]: e.target.value || undefined }
                        }))}
                      />
                    )}
                    {field.fieldType === 'boolean' && (() => {
                      const boolOpts = field.options && !Array.isArray(field.options) ? (field.options as { trueLabel?: string; falseLabel?: string }) : null;
                      const trueLabel = boolOpts?.trueLabel ?? t('common.yes', 'Yes');
                      const falseLabel = boolOpts?.falseLabel ?? t('common.no', 'No');
                      return (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`edit-cf-${field.fieldName}`}
                            checked={!!formData.customFields[field.fieldName]}
                            onCheckedChange={(checked) => setFormData(prev => ({
                              ...prev,
                              customFields: { ...prev.customFields, [field.fieldName]: !!checked }
                            }))}
                          />
                          <label htmlFor={`edit-cf-${field.fieldName}`} className="text-sm">
                            {formData.customFields[field.fieldName] ? trueLabel : falseLabel}
                          </label>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">{t('contacts.edit.notes_label', 'Notes')}</Label>
            <Textarea data-tour="components-contacts-editcontactmodal.textarea.notes"
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
            />
          </div>
          
          <DialogFooter>
            <Button data-tour="components-contacts-editcontactmodal.button.common.cancel"
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-contacts-editcontactmodal.button.contacts.edit.saving"
              type="submit"
              disabled={isSubmitting}
              variant="brand"
              className="btn-brand-primary"
            >
              {isSubmitting ? t('contacts.edit.saving', 'Saving...') : t('contacts.edit.save_changes', 'Save Changes')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
