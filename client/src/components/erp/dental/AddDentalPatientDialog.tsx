import { emitTourSignal } from '@/components/guided-tours/signals';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Check,
  ChevronsUpDown,
  Loader2,
  UserPlus,
  ContactRound as TabIconContactRound,
  UserPlus as TabIconUserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ContactCustomFieldsEditor } from '@/components/contacts/ContactCustomFieldsEditor';
import { uploadCustomFieldFile } from '@/components/contacts/CustomFieldFileSelect';
import { useCompanyContactCustomFields } from '@/hooks/use-company-contact-custom-fields';
import { missingRequiredContactCustomFields } from '@shared/contact-custom-fields';
import { normalizeUsername, validateUsername } from '@/lib/username-utils';
import { contactCreationErrorMessage, contactCreationWarningDescription } from '@/components/contacts/contact-add-result';

export type DentalPatientRef = {
  contactId: number;
  name: string;
};

type ContactOption = {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  whatsappUsername?: string | null;
};

type PhoneConflict = {
  contactId: number;
  isPatient: boolean;
  name: string;
  phone: string | null;
  email: string | null;
  whatsappUsername?: string | null;
  identityType?: 'phone' | 'whatsappUsername';
};

type AddDentalPatientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after a patient is created/promoted.
   * When `navigateOnSuccess` is true (Patients page), this still fires before navigation.
   */
  onSuccess: (patient: DentalPatientRef) => void;
  /** Patients page: navigate to clinical profile after success. Default false (stay in context). */
  navigateOnSuccess?: boolean;
  initialMode?: 'existing' | 'new';
  title?: string;
  description?: string;
};

export function AddDentalPatientDialog({
  open,
  onOpenChange,
  onSuccess,
  navigateOnSuccess = false,
  initialMode = 'existing',
  title,
  description,
}: AddDentalPatientDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canCreateContact = hasPermission(PERMISSIONS.CREATE_CONTACTS);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [addMode, setAddMode] = useState<'existing' | 'new'>(initialMode);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [forcedContact, setForcedContact] = useState<ContactOption | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactWhatsappUsername, setNewContactWhatsappUsername] = useState('');
  const [newContactWhatsappUsernameKey, setNewContactWhatsappUsernameKey] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactCustomFields, setNewContactCustomFields] = useState<Record<string, unknown>>({});
  const [pendingCustomFieldFiles, setPendingCustomFieldFiles] = useState<Record<string, File | null>>({});
  const [createdPatientDraft, setCreatedPatientDraft] = useState<DentalPatientRef | null>(null);
  const [createdPatientMeta, setCreatedPatientMeta] = useState<any>(undefined);
  const [phoneConflictHint, setPhoneConflictHint] = useState<string | null>(null);
  const [existingPatientConflict, setExistingPatientConflict] = useState<DentalPatientRef | null>(
    null,
  );

  useEffect(() => {
    if (open) setAddMode(initialMode);
  }, [initialMode, open]);

  const reset = () => {
    setAddMode(initialMode);
    setPickerOpen(false);
    setContactSearch('');
    setSelectedContactId(null);
    setForcedContact(null);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactWhatsappUsername('');
    setNewContactWhatsappUsernameKey('');
    setNewContactEmail('');
    setNewContactCustomFields({});
    setPendingCustomFieldFiles({});
    setCreatedPatientDraft(null);
    setCreatedPatientMeta(undefined);
    setPhoneConflictHint(null);
    setExistingPatientConflict(null);
  };

  const contactsQuery = useQuery({
    queryKey: ['/api/erp/dental/patients/eligible-contacts', contactSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '20' });
      if (contactSearch.trim()) params.set('search', contactSearch.trim());
      const res = await apiRequest('GET', `/api/erp/dental/patients/eligible-contacts?${params}`);
      if (!res.ok) throw new Error('Failed to search contacts');
      const json = await res.json();
      return (json.data ?? []) as ContactOption[];
    },
    enabled: open && addMode === 'existing',
  });
  const {
    data: contactCustomFieldDefinitions = [],
    isLoading: customFieldsLoading,
    isError: customFieldsError,
    refetch: refetchCustomFields,
  } = useCompanyContactCustomFields({
    enabled: open && addMode === 'new' && canCreateContact,
  });

  const finish = (patient: DentalPatientRef) => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/patient-options'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans/patient-options'] });
    toast({ title: t('erp.dental.patients.added', 'Patient added') });
    onOpenChange(false);
    reset();
    onSuccess(patient);
    if (navigateOnSuccess) {
      setLocation(`/erp/dental/patients/${patient.contactId}`);
    }
  };

  const createPatientMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await apiRequest('POST', '/api/erp/dental/patients', { contactId });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to add patient');
      const name =
        (forcedContact && forcedContact.id === contactId ? forcedContact.name : null) ||
        (contactsQuery.data ?? []).find((c) => c.id === contactId)?.name ||
        `#${contactId}`;
      return { contactId: (json.data as { contactId: number }).contactId, name };
    },
    onSuccess: (data) => finish(data),
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const createNewPatientMutation = useMutation({
    mutationFn: async () => {
      const name = newContactName.trim();
      let patient = createdPatientDraft;
      let creationMeta = createdPatientMeta;
      if (!patient) {
        const nonFileValues = Object.fromEntries(
          Object.entries(newContactCustomFields).filter(([, value]) =>
            !value || typeof value !== 'object' || Array.isArray(value) || !('source' in value),
          ),
        );
        const res = await fetch('/api/erp/dental/patients/with-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name,
            phone: newContactPhone.trim(),
            whatsappUsername: newContactWhatsappUsername.trim()
              ? normalizeUsername(newContactWhatsappUsername)
              : undefined,
            whatsappUsernameKey: newContactWhatsappUsernameKey.trim() || undefined,
            email: newContactEmail.trim() || undefined,
            customFields: nonFileValues,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (res.status === 409 && ['PHONE_EXISTS', 'WHATSAPP_USERNAME_EXISTS'].includes(json.code)) {
          const err = new Error(json.error || 'Contact already exists') as Error & {
            phoneConflict?: PhoneConflict;
          };
          err.phoneConflict = {
            contactId: json.contactId,
            isPatient: Boolean(json.isPatient),
            name: json.name,
            phone: json.phone ?? null,
            email: json.email ?? null,
            whatsappUsername: json.whatsappUsername ?? null,
            identityType: json.identityType,
          };
          throw err;
        }
        if (!res.ok) {
          const err = new Error(json.error || 'Failed to create patient') as Error & { errorCode?: string };
          err.errorCode = json.code;
          throw err;
        }
        patient = { contactId: (json.data as { contactId: number }).contactId, name };
        creationMeta = json.creationMeta;
        setCreatedPatientDraft(patient);
        setCreatedPatientMeta(creationMeta);
      }

      for (const [fieldName, file] of Object.entries(pendingCustomFieldFiles)) {
        if (!file) continue;
        const reference = await uploadCustomFieldFile('contact', patient.contactId, file, t);
        const response = await apiRequest('PUT', '/api/custom-field-attachments/value', {
          ownerType: 'contact', ownerId: patient.contactId, fieldName, value: reference,
        });
        if (!response.ok) throw new Error(t('custom_fields.file.assign_failed', 'Failed to assign {{name}}', { name: file.name }));
        setNewContactCustomFields((current) => ({ ...current, [fieldName]: reference }));
        setPendingCustomFieldFiles((current) => ({ ...current, [fieldName]: null }));
      }
      return { patient, creationMeta };
    },
    onSuccess: ({ patient, creationMeta }) => {
      emitTourSignal('patient-created', patient.contactId);
      finish(patient);
      const warning = contactCreationWarningDescription(creationMeta, t);
      if (warning) toast({ title: t('contacts.creation.warning.title', 'Contact saved with a warning'), description: warning });
    },
    onError: (error: Error & { phoneConflict?: PhoneConflict; errorCode?: string }) => {
      const conflict = error.phoneConflict;
      if (conflict) {
        if (conflict.isPatient) {
          setExistingPatientConflict({
            contactId: conflict.contactId,
            name: conflict.name || `#${conflict.contactId}`,
          });
          setPhoneConflictHint(
            navigateOnSuccess
              ? t(
                  conflict.identityType === 'whatsappUsername'
                    ? 'erp.dental.patients.usernameExistsPatient'
                    : 'erp.dental.patients.phoneExistsPatient',
                  conflict.identityType === 'whatsappUsername'
                    ? 'A patient with this WhatsApp username already exists. Open their clinical profile instead.'
                    : 'A patient with this phone already exists. Open their clinical profile instead.',
                )
              : t(
                  conflict.identityType === 'whatsappUsername'
                    ? 'erp.dental.patients.usernameExistsPatientSelect'
                    : 'erp.dental.patients.phoneExistsPatientSelect',
                  conflict.identityType === 'whatsappUsername'
                    ? 'A patient with this WhatsApp username already exists. Select them instead.'
                    : 'A patient with this phone already exists. Select them instead.',
                ),
          );
          toast({
            title: conflict.identityType === 'whatsappUsername'
              ? t('erp.dental.patients.usernameExistsPatient', 'A patient with this WhatsApp username already exists. Open their clinical profile instead.')
              : t('erp.dental.patients.phoneExistsPatient', 'A patient with this phone already exists. Open their clinical profile instead.'),
            variant: 'destructive',
          });
          return;
        }
        setAddMode('existing');
        setForcedContact({
          id: conflict.contactId,
          name: conflict.name,
          phone: conflict.phone,
          email: conflict.email,
          whatsappUsername: conflict.whatsappUsername,
        });
        setSelectedContactId(conflict.contactId);
        setContactSearch(conflict.name);
        setExistingPatientConflict(null);
        setPhoneConflictHint(
          t(
            conflict.identityType === 'whatsappUsername'
              ? 'erp.dental.patients.usernameExistsContact'
              : 'erp.dental.patients.phoneExistsContact',
            conflict.identityType === 'whatsappUsername'
              ? 'A contact with this WhatsApp username already exists. Confirm adding them as a patient.'
              : 'A contact with this phone already exists. Confirm adding them as a patient.',
          ),
        );
        toast({
          title: conflict.identityType === 'whatsappUsername'
            ? t('erp.dental.patients.usernameExistsContact', 'A contact with this WhatsApp username already exists. Confirm adding them as a patient.')
            : t('erp.dental.patients.phoneExistsContact', 'A contact with this phone already exists. Confirm adding them as a patient.'),
          variant: 'destructive',
        });
        return;
      }
      toast({ title: contactCreationErrorMessage(error, t), variant: 'destructive' });
    },
  });

  const selectedContact =
    (forcedContact && forcedContact.id === selectedContactId ? forcedContact : null) ||
    (contactsQuery.data ?? []).find((c) => c.id === selectedContactId) ||
    null;
  const addPending = createPatientMutation.isPending || createNewPatientMutation.isPending;
  const canSubmitNew =
    Boolean(newContactName.trim()) &&
    Boolean(newContactPhone.trim() || newContactWhatsappUsername.trim()) &&
    (!newContactWhatsappUsername.trim() || validateUsername(newContactWhatsappUsername)) &&
    canCreateContact &&
    !customFieldsLoading &&
    !customFieldsError &&
    missingRequiredContactCustomFields(contactCustomFieldDefinitions, {
      ...newContactCustomFields,
      ...Object.fromEntries(Object.entries(pendingCustomFieldFiles).filter(([, file]) => Boolean(file))),
    }).length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent data-tour="components-erp-dental-adddentalpatientdialog.dialogcontent.erp.dental.patients.addTitle" className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title || t('erp.dental.patients.addTitle', 'Add Patient')}</DialogTitle>
          <DialogDescription>
            {description || t(
              'erp.dental.patients.addDescription',
              'Link an existing contact or create a new patient with a phone number or WhatsApp username.',
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={addMode}
          onValueChange={(value) => {
            setAddMode(value as 'existing' | 'new');
            setPhoneConflictHint(null);
            setExistingPatientConflict(null);
          }}
        >
          <TabsList>
            <TabsTrigger icon={TabIconContactRound} data-tour="components-erp-dental-adddentalpatientdialog.tabstrigger.existing" value="existing">
              {t('erp.dental.patients.modeExisting', 'Existing contact')}
            </TabsTrigger>
            <TabsTrigger icon={TabIconUserPlus} data-tour="components-erp-dental-adddentalpatientdialog.tabstrigger.new" value="new" disabled={!canCreateContact}>
              {t('erp.dental.patients.modeNew', 'New patient')}
            </TabsTrigger>
          </TabsList>

          {phoneConflictHint ? (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              <p>{phoneConflictHint}</p>
              {existingPatientConflict ? (
                <Button data-tour="components-erp-dental-adddentalpatientdialog.button.erp.dental.patients.openExistingPatient"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    const patient = existingPatientConflict;
                    onOpenChange(false);
                    reset();
                    if (navigateOnSuccess) {
                      setLocation(`/erp/dental/patients/${patient.contactId}`);
                    } else {
                      onSuccess(patient);
                    }
                  }}
                >
                  {navigateOnSuccess
                    ? t('erp.dental.patients.openExistingPatient', 'Open clinical profile')
                    : t('erp.dental.patients.selectExistingPatient', 'Select this patient')}
                </Button>
              ) : null}
            </div>
          ) : null}

          <TabsContent data-tour="components-erp-dental-adddentalpatientdialog.tabscontent.existing" value="existing" className="space-y-3 mt-3">
            <div className="space-y-1.5">
              <Label>{t('erp.dental.patients.contactLabel', 'Contact')}</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button data-tour="components-erp-dental-adddentalpatientdialog.button.erp.dental.patients.pickContact" type="button" variant="outline" role="combobox" className="w-full justify-between">
                    <span className="truncate text-left">
                      {selectedContact
                        ? `${selectedContact.name}${selectedContact.phone ? ` | ${selectedContact.phone}` : selectedContact.whatsappUsername ? ` | @${selectedContact.whatsappUsername}` : ''}`
                        : t('erp.dental.patients.pickContact', 'Search contacts')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={t('erp.dental.patients.pickContact', 'Search contacts')}
                      value={contactSearch}
                      onValueChange={setContactSearch}
                    />
                    <CommandList className="max-h-72">
                      <CommandEmpty>
                        {contactsQuery.isLoading
                          ? t('common.loading', 'Loading…')
                          : t('erp.dental.patients.noContacts', 'No contacts found')}
                      </CommandEmpty>
                      {(contactsQuery.data ?? []).map((contact) => (
                        <CommandItem
                          key={contact.id}
                          value={`${contact.name} ${contact.phone ?? ''} ${contact.whatsappUsername ?? ''} ${contact.email ?? ''}`}
                          onSelect={() => {
                            setSelectedContactId(contact.id);
                            setForcedContact(null);
                            setContactSearch(contact.name);
                            setPhoneConflictHint(null);
                            setPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'h-4 w-4',
                              selectedContactId === contact.id ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          {contact.name}
                          {contact.phone
                            ? ` | ${contact.phone}`
                            : contact.whatsappUsername
                              ? ` | @${contact.whatsappUsername}`
                            : contact.email
                              ? ` | ${contact.email}`
                              : ''}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </TabsContent>

          <TabsContent data-tour="components-erp-dental-adddentalpatientdialog.tabscontent.new" value="new" className="space-y-3 mt-3">
            {!canCreateContact ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  'erp.dental.patients.needCreateContacts',
                  'You need permission to create contacts to add a new patient.',
                )}
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>
                    {t('contacts.name', 'Name')}
                    <span className="text-destructive"> *</span>
                  </Label>
                  <Input data-tour="components-erp-dental-adddentalpatientdialog.input.contacts.name"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>
                    {t('contacts.phone', 'Phone')}
                  </Label>
                  <LocalizedPhoneInput
                    value={newContactPhone}
                    onChange={setNewContactPhone}
                    autoComplete="tel"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('contacts.add.whatsapp_username_label', 'WhatsApp Username')}</Label>
                  <Input data-tour="components-erp-dental-adddentalpatientdialog.input.contacts.add.whatsapp_username_placeholder"
                    value={newContactWhatsappUsername}
                    onChange={(e) => setNewContactWhatsappUsername(e.target.value)}
                    placeholder={t('contacts.add.whatsapp_username_placeholder', '@username')}
                    autoComplete="off"
                  />
                  {newContactWhatsappUsername.trim() && !validateUsername(newContactWhatsappUsername) ? (
                    <p className="text-xs text-destructive">
                      {t('contacts.creation.error.invalid_username', 'WhatsApp username must be 3-35 characters using letters, numbers, periods or underscores.')}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('contacts.creation.identity_help', 'Enter at least a phone number or WhatsApp username. You may provide both.')}
                </p>
                {newContactWhatsappUsername.trim() ? (
                  <div className="space-y-1.5">
                    <Label>{t('contacts.creation.username_key_label', 'Username key (optional)')}</Label>
                    <Input data-tour="components-erp-dental-adddentalpatientdialog.input.contacts.creation.username_key_placeholder"
                      value={newContactWhatsappUsernameKey}
                      onChange={(e) => setNewContactWhatsappUsernameKey(e.target.value)}
                      placeholder={t('contacts.creation.username_key_placeholder', 'Key shared by the contact')}
                      autoComplete="off"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t('contacts.creation.username_key_help', 'Used only to verify protected usernames and never stored.')}
                    </p>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label>{t('contacts.email', 'Email')}</Label>
                  <Input data-tour="components-erp-dental-adddentalpatientdialog.input.contacts.name"
                    type="email"
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
                {(customFieldsLoading || customFieldsError || contactCustomFieldDefinitions.length > 0) ? (
                  <div className="space-y-2 rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">
                        {t('erp.dental.patients.contactCustomFields', 'Contact custom fields')}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('erp.dental.patients.contactCustomFieldsHelp', 'These fields are shared with the patient contact record.')}
                      </p>
                    </div>
                    {customFieldsLoading ? (
                      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('common.loading', 'Loading…')}
                      </div>
                    ) : customFieldsError ? (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm text-destructive">
                        <span>{t('common.error', 'Something went wrong')}</span>
                        <Button data-tour="components-erp-dental-adddentalpatientdialog.button.common.retry" type="button" size="sm" variant="outline" onClick={() => refetchCustomFields()}>
                          {t('common.retry', 'Retry')}
                        </Button>
                      </div>
                    ) : (
                      <ContactCustomFieldsEditor
                        definitions={contactCustomFieldDefinitions}
                        values={newContactCustomFields}
                        onChange={setNewContactCustomFields}
                        ownerId={createdPatientDraft?.contactId}
                        pendingFiles={pendingCustomFieldFiles}
                        onPendingFilesChange={setPendingCustomFieldFiles}
                      />
                    )}
                  </div>
                ) : null}
              </>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="sm:justify-end gap-2">
          <Button data-tour="components-erp-dental-adddentalpatientdialog.button.common.cancel" type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          {addMode === 'existing' ? (
            <Button data-tour="components-erp-dental-adddentalpatientdialog.button.erp.dental.patients.add"
              type="button"
              disabled={!selectedContactId || addPending}
              onClick={() => selectedContactId && createPatientMutation.mutate(selectedContactId)}
            >
              {createPatientMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {t('erp.dental.patients.add', 'Add Patient')}
            </Button>
          ) : (
            <Button data-tour="components-erp-dental-adddentalpatientdialog.button.erp.dental.patients.createAndAdd"
              type="button"
              disabled={!canSubmitNew || addPending}
              onClick={() => createNewPatientMutation.mutate()}
            >
              {createNewPatientMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <UserPlus className="h-4 w-4 mr-2" />
              )}
              {t('erp.dental.patients.createAndAdd', 'Create & add patient')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
