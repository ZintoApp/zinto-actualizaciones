import { readContactAddResult, contactAddFeedback, contactCreationErrorMessage, refreshContactQueries } from './contact-add-result';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { normalizeUsername, validateUsername } from '@/lib/username-utils';
import { CustomFieldFileSelect, uploadCustomFieldFile } from './CustomFieldFileSelect';
import { missingRequiredContactCustomFields, type ContactCustomFieldDefinition } from '@shared/contact-custom-fields';
import { ColombiaCustomerFiscalFields } from '@/components/erp/ColombiaFiscalProfileFields';
import type { ColombiaCustomerFiscalProfile } from '@shared/factus';
import { requiresWhatsAppContactIdentity } from '@shared/whatsapp-contact-identity';

type ContactRow = {
  id: number;
  name: string;
  isArchived?: boolean | null;
};

type CreateContactModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (contact: ContactRow) => void;
  initialName?: string;
  compact?: boolean;
};

function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  let normalized = phone.replace(/[^\d+]/g, '');
  if (normalized && !normalized.startsWith('+')) {
    normalized = normalized.replace(/^0+/, '');
    if (normalized.length > 10) normalized = `+${normalized}`;
  }
  return normalized;
}

export default function CreateContactModal({ isOpen, onClose, onCreated, initialName = '', compact = false }: CreateContactModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsappUsername, setWhatsappUsername] = useState('');
  const [whatsappUsernameKey, setWhatsappUsernameKey] = useState('');
  const [company, setCompany] = useState('');
  const [identifierType, setIdentifierType] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState('');
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [colombiaFiscalProfile, setColombiaFiscalProfile] = useState<Partial<ColombiaCustomerFiscalProfile>>({ tributeCode: 'ZZ', responsibilities: ['R-99-PN'], countryCode: 'CO' });
  const [pendingCustomFieldFiles, setPendingCustomFieldFiles] = useState<Record<string, File | null>>({});
  const [createdDraft, setCreatedDraft] = useState<ContactRow | null>(null);

  const { data: contactCustomFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'contact'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=contact');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isOpen,
  });

  const tagsArray = useMemo(
    () => tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tags]
  );

  const reset = (nextInitialName = '') => {
    setName(nextInitialName);
    setEmail('');
    setPhone('');
    setWhatsappUsername('');
    setWhatsappUsernameKey('');
    setCompany('');
    setIdentifierType('');
    setIdentifier('');
    setNotes('');
    setTags('');
    setCustomFields({});
    setColombiaFiscalProfile({ tributeCode: 'ZZ', responsibilities: ['R-99-PN'], countryCode: 'CO' });
    setPendingCustomFieldFiles({});
    setCreatedDraft(null);
  };

  useEffect(() => {
    if (!isOpen) return;
    reset(compact ? initialName : '');
    // Reinitialize when a new open flow starts (especially POS compact flow).
  }, [isOpen, initialName, compact]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const customFieldsSanitized = Object.fromEntries(
        Object.entries(customFields).filter(
          ([, value]) =>
            value !== undefined &&
            value !== null &&
            value !== '' &&
            (!Array.isArray(value) || value.length > 0)
        )
      );
      if (whatsappUsername.trim() && !validateUsername(whatsappUsername)) {
        throw new Error(t('contacts.creation.error.invalid_username', 'WhatsApp username must be 3-35 characters using letters, numbers, periods or underscores.'));
      }
      if (requiresWhatsAppContactIdentity({ identifierType, phone, whatsappUsername })) {
        throw new Error(t('contacts.creation.error.identity_required', 'Enter a phone number or WhatsApp username.'));
      }
      let contact = createdDraft;
      let creationMeta = (contact as any)?.creationMeta;
      if (!contact) {
        const response = await apiRequest('POST', '/api/contacts', {
          name: name.trim(),
          email: email.trim() || undefined,
          phone: normalizePhoneNumber(phone),
          whatsappUsername: whatsappUsername.trim() ? normalizeUsername(whatsappUsername) : undefined,
          whatsappUsernameKey: whatsappUsernameKey.trim() || undefined,
          company: company.trim() || undefined,
          identifierType: identifierType || undefined,
          identifier: identifier.trim() || undefined,
          notes: notes.trim() || undefined,
          tags: tagsArray,
          customFields: customFieldsSanitized,
          colombiaFiscalProfile: colombiaFiscalProfile.identification ? colombiaFiscalProfile : undefined,
        });
        const result = await readContactAddResult<ContactRow>(response);
        if (!result.created) return result;
        contact = result.contact;
        creationMeta = result.creationMeta;
        setCreatedDraft(contact);
      }

      for (const [fieldName, file] of Object.entries(pendingCustomFieldFiles)) {
        if (!file) continue;
        const reference = await uploadCustomFieldFile('contact', contact.id, file, t);
        const response = await apiRequest('PUT', '/api/custom-field-attachments/value', {
          ownerType: 'contact', ownerId: contact.id, fieldName, value: reference,
        });
        if (!response.ok) throw new Error(t('custom_fields.file.assign_failed', 'Failed to assign {{name}}', { name: file.name }));
        setCustomFields((current) => ({ ...current, [fieldName]: reference }));
        setPendingCustomFieldFiles((current) => ({ ...current, [fieldName]: null }));
      }
      return { contact, created: true, creationMeta };
    },
    onSuccess: (result) => {
      refreshContactQueries(queryClient);
      toast(contactAddFeedback(result, t));
      onCreated?.(result.contact);
      reset();
      onClose();
    },
    onError: (error: Error & { errorCode?: string }) => {
      toast({
        title: t('ui.common.error', 'Error'),
        description: contactCreationErrorMessage(error, t),
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent data-tour="components-contacts-createcontactmodal.dialogcontent.contacts.create.title" className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t('contacts.create.title', 'Create customer')}</DialogTitle>
          <DialogDescription>
            {t('contacts.create.description', 'Add a contact and continue your workflow.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('contacts.create.name', 'Name')} *</Label>
              <Input data-tour="components-contacts-createcontactmodal.input.contacts.create.name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.create.email', 'Email')}</Label>
              <Input data-tour="components-contacts-createcontactmodal.input.contacts.create.name" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('contacts.create.phone', 'Phone')}</Label>
              <LocalizedPhoneInput value={phone} onChange={setPhone} />
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.create.whatsapp_username', 'WhatsApp Username')}</Label>
              <Input data-tour="components-contacts-createcontactmodal.input.contacts.add.whatsapp_username_placeholder" value={whatsappUsername} onChange={(event) => setWhatsappUsername(event.target.value)} placeholder={t('contacts.add.whatsapp_username_placeholder', '@username')} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('contacts.creation.identity_help', 'Enter at least a phone number or WhatsApp username. You may provide both.')}
          </p>
          {whatsappUsername.trim() ? (
            <div className="space-y-2">
              <Label>{t('contacts.creation.username_key_label', 'Username key (optional)')}</Label>
              <Input data-tour="components-contacts-createcontactmodal.input.contacts.creation.username_key_placeholder"
                value={whatsappUsernameKey}
                onChange={(event) => setWhatsappUsernameKey(event.target.value)}
                placeholder={t('contacts.creation.username_key_placeholder', 'Key shared by the contact')}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t('contacts.creation.username_key_help', 'Used only to verify protected usernames and never stored.')}
              </p>
            </div>
          ) : null}
          {identifierType === 'whatsapp_official' && whatsappUsername.trim() && !phone.trim() ? (
            <p className="text-xs text-amber-600">
              {t('contacts.creation.official_help', 'WhatsApp Official cannot initiate by username until the contact messages you first.')}
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('contacts.create.company', 'Company')}</Label>
              <Input data-tour="components-contacts-createcontactmodal.input.contacts.create.company" value={company} onChange={(event) => setCompany(event.target.value)} />
            </div>
          </div>
          {!compact ? <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('contacts.create.channel', 'Channel')}</Label>
              <Select value={identifierType} onValueChange={setIdentifierType}>
                <SelectTrigger data-tour="components-contacts-createcontactmodal.selecttrigger.contacts.create.channelPlaceholder">
                  <SelectValue placeholder={t('contacts.create.channelPlaceholder', 'Select channel')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp_official">WhatsApp Official</SelectItem>
                  <SelectItem value="whatsapp_unofficial">WhatsApp Unofficial</SelectItem>
                  <SelectItem value="messenger">Facebook Messenger</SelectItem>
                  <SelectItem value="instagram">Instagram</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('contacts.create.channelIdentifier', 'Channel identifier')}</Label>
              <Input data-tour="components-contacts-createcontactmodal.input.contacts.create.channel" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
            </div>
          </div> : null}
          <div className="space-y-2">
            <Label>{t('contacts.create.tags', 'Tags')}</Label>
            <Input data-tour="components-contacts-createcontactmodal.input.contacts.create.name" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="vip, walk-in" />
          </div>
          {!compact && <ColombiaCustomerFiscalFields value={colombiaFiscalProfile} onChange={setColombiaFiscalProfile} />}
          {contactCustomFieldsSchema.length > 0 && (
            <div className="space-y-3">
              <Label>{t('contacts.create.customFields', 'Custom fields')}</Label>
              {contactCustomFieldsSchema.map((field: { id: number; fieldName: string; fieldLabel: string; fieldType: string; required?: boolean; options?: { value: string; label: string }[] }) => (
                <div key={field.id} className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {field.fieldLabel}
                    {field.required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
                  </Label>
                  {field.fieldType === 'file_select' ? (
                    <CustomFieldFileSelect
                      ownerType="contact"
                      ownerId={createdDraft?.id}
                      value={customFields[field.fieldName] as any}
                      pendingFile={pendingCustomFieldFiles[field.fieldName]}
                      onChange={(value) => setCustomFields((prev) => ({ ...prev, [field.fieldName]: value }))}
                      onPendingFileChange={(file) => setPendingCustomFieldFiles((prev) => ({ ...prev, [field.fieldName]: file }))}
                    />
                  ) : field.fieldType === 'select' ? (
                    <Select
                      value={(customFields[field.fieldName] as string) ?? ''}
                      onValueChange={(value) => setCustomFields((prev) => ({ ...prev, [field.fieldName]: value }))}
                    >
                      <SelectTrigger data-tour="components-contacts-createcontactmodal.selecttrigger.ui.common.select">
                        <SelectValue placeholder={t('ui.common.select', 'Select')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : field.fieldType === 'boolean' ? (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={Boolean(customFields[field.fieldName])}
                        onCheckedChange={(checked) =>
                          setCustomFields((prev) => ({ ...prev, [field.fieldName]: checked === true }))
                        }
                      />
                      <span className="text-sm">{t('ui.common.enabled', 'Enabled')}</span>
                    </div>
                  ) : (
                    <Input
                      type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                      value={(customFields[field.fieldName] as string) ?? ''}
                      onChange={(event) => setCustomFields((prev) => ({ ...prev, [field.fieldName]: event.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <Label>{t('contacts.create.notes', 'Notes')}</Label>
            <Textarea data-tour="components-contacts-createcontactmodal.textarea.contacts.create.name" value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button data-tour="components-contacts-createcontactmodal.button.ui.common.cancel"
            type="button"
            variant="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            {t('ui.common.cancel', 'Cancel')}
          </Button>
          <Button data-tour="components-contacts-createcontactmodal.button.contacts.create.submit"
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={
              !name.trim() ||
              requiresWhatsAppContactIdentity({ identifierType, phone, whatsappUsername }) ||
              createMutation.isPending ||
              missingRequiredContactCustomFields(contactCustomFieldsSchema as ContactCustomFieldDefinition[], {
                ...customFields,
                ...Object.fromEntries(Object.entries(pendingCustomFieldFiles).filter(([, file]) => Boolean(file))),
              }).length > 0
            }
          >
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t('contacts.create.submit', 'Create contact')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
