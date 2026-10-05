import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { readContactAddResult, contactAddFeedback, contactCreationErrorMessage, localizeWhatsAppContactImportError, refreshContactQueries } from '@/components/contacts/contact-add-result';
import { useQuickAction } from '@/hooks/use-quick-action';
import Header from '@/components/layout/Header';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import { formatUsername, normalizeUsername, validateUsername } from '@/lib/username-utils';
import Papa from 'papaparse';
import Pagination from '@/components/contacts/Pagination';
import EditContactModal from '@/components/contacts/EditContactModal';
import { ContactExportModal } from '@/components/contacts/ContactExportModal';
import { CreateSegmentFromContactsModal } from '@/components/contacts/CreateSegmentFromContactsModal';
import { AddToExistingSegmentModal } from '@/components/contacts/AddToExistingSegmentModal';
import { WhatsAppScrapingModal } from '@/components/contacts/WhatsAppScrapingModal';
import { WhatsAppContactSyncAction } from '@/components/contacts/WhatsAppContactSyncAction';
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, parseISO, formatISO, addHours } from 'date-fns';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { FileUpload } from '@/components/ui/file-upload';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Loader2,
  Plus,
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  X,
  Trash2,
  Search,
  Phone,
  Mail,
  Building2,
  Calendar,
  FileText,
  Archive,
  Users,
  Eye,
  Edit,
  Clock,
  Flag,
  User,
  CheckSquare,
  Square,
  AlertTriangle,
  ChevronDown,
  SortAsc,
  SortDesc,
  UserPlus,
  Pin,
  PinOff,
  Briefcase,
  HeartPulse,
  AtSign,
  ArrowLeft,
  Copy,
  CloudUpload,
  ContactRound as TabIconContactRound,
  FolderOpen as TabIconFolderOpen,
  History as TabIconHistory,
  List as TabIconList,
  ListTodo as TabIconListTodo,
  ShoppingCart as TabIconShoppingCart,
} from 'lucide-react';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { DENTAL_CLINICAL_DOCUMENT_CATEGORIES } from '@shared/dental-clinical';
import { AddContactIcon } from '@/components/ui/add-contact-icon';
import { ImportCsvIcon } from '@/components/ui/import-csv-icon';
import { FilterIcon } from '@/components/ui/filter-icon';
import { ScrapeContactsIcon } from '@/components/ui/scrape-contacts-icon';
import AgentDisplay from '@/components/contacts/AgentDisplay';
import { AuditLogTimeline } from '@/components/contacts/AuditLogTimeline';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { ContactCustomFieldsBadges } from '@/components/contacts/ContactCustomFieldsBadges';
import { CustomFieldFileSelect, uploadCustomFieldFile } from '@/components/contacts/CustomFieldFileSelect';
import { isCustomFieldFileReference, missingRequiredContactCustomFields, type ContactCustomFieldDefinition } from '@shared/contact-custom-fields';
import { ContactSalesTimeline } from '@/components/contacts/ContactSalesTimeline';
import { SalesOrderCreateDialog, type CreatedSalesOrder } from '@/components/erp/SalesOrderCreateDialog';
import { SendQuotationDialog, type SendQuotationOrder } from '@/components/erp/SendQuotationDialog';
import { GoogleCalendarSelector } from '@/components/calendar/GoogleCalendarSelector';
import { useGoogleCalendarAuth } from '@/hooks/useGoogleCalendarAuth';
import { useZohoCalendarAuth } from '@/hooks/useZohoCalendarAuth';
import { useCalendlyCalendarAuth } from '@/hooks/useCalendlyCalendarAuth';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { useConversations } from '@/context/ConversationContext';
import { useActiveChannel, useChannelInfo } from '@/contexts/ActiveChannelContext';
import { isChannelAvailable } from '@shared/channel-utils';
import { CallChannelWizard, type CallWizardSelection } from '@/components/conversations/CallChannelWizard';
import { CallScreenModal } from '@/components/conversations/CallScreenModal';
import { WhatsAppCallScreenModal } from '@/components/conversations/WhatsAppCallScreenModal';
import { closeWhatsAppRtcSession } from '@/lib/whatsapp-call-webrtc';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/use-auth';
import { RiChatSmileAiLine } from 'react-icons/ri';
import { normalizeVoiceChannelConnectionData, supportsBrowserVoiceConnection, type VoiceProviderStack } from '@shared/types/call-types';
import { PipelineProvider } from '@/contexts/PipelineContext';
import AddDealModal from '@/components/pipeline/AddDealModal';
import EditDealModal from '@/components/pipeline/EditDealModal';
import DealDetailsModal from '@/components/pipeline/DealDetailsModal';
import type { Deal } from '@shared/schema';
import { requiresWhatsAppContactIdentity } from '@shared/whatsapp-contact-identity';

const PINNED_CONTACTS_MAX = 7;

function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';


  let normalized = phone.replace(/[^\d+]/g, '');


  if (normalized && !normalized.startsWith('+')) {

    normalized = normalized.replace(/^0+/, '');
    if (normalized.length > 10) {
      normalized = '+' + normalized;
    }
  }

  return normalized;
}

function formatChannelTypeLabel(channelType: string | null | undefined): string {
  if (!channelType) return '—';

  return channelType
    .split('_')
    .map((part) => part.toLowerCase() === 'whatsapp'
      ? 'WhatsApp'
      : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatCustomFieldName(fieldName: string): string {
  return fieldName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatCustomFieldValue(value: any, field?: { fieldType?: string; options?: any }): string {
  const optionList = Array.isArray(field?.options) ? field.options : [];
  const formatOption = (item: any) => optionList.find((option: any) => option.value === String(item))?.label || String(item);

  if (Array.isArray(value)) return value.map(formatOption).join(', ');
  if (typeof value === 'boolean') {
    const booleanOptions = field?.options && !Array.isArray(field.options) ? field.options : null;
    return value ? (booleanOptions?.trueLabel || 'Yes') : (booleanOptions?.falseLabel || 'No');
  }
  if (value && typeof value === 'object') return JSON.stringify(value);
  return formatOption(value);
}

function isWhatsAppGroupChatId(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber) {
    return false;
  }
  return phoneNumber.trim().toLowerCase().endsWith('@g.us');
}

function isValidInternationalPhoneNumber(phone: string): boolean {
  const numericOnly = phone.replace(/[^0-9]/g, '');


  if (numericOnly.length < 7 || numericOnly.length > 14) {
    return false;
  }


  const validCountryCodePatterns = [

    /^1[2-9]\d{9}$/,

    /^44[1-9]\d{8,9}$/,

    /^49[1-9]\d{8,10}$/,

    /^33[1-9]\d{8}$/,

    /^39[0-9]\d{6,10}$/,

    /^34[6-9]\d{8}$/,

    /^31[1-9]\d{8}$/,

    /^32[1-9]\d{7,8}$/,

    /^41[1-9]\d{8}$/,

    /^43[1-9]\d{6,10}$/,

    /^61[2-9]\d{8}$/,

    /^81[1-9]\d{8,9}$/,

    /^82[1-9]\d{7,8}$/,

    /^86[1-9]\d{9,10}$/,

    /^91[6-9]\d{9}$/,

    /^55[1-9]\d{8,9}$/,

    /^52[1-9]\d{9}$/,

    /^54[1-9]\d{8,9}$/,

    /^57[1-9]\d{7,9}$/,

    /^27[1-9]\d{8}$/,

    /^234[7-9]\d{9}$/,

    /^254[7]\d{8}$/,

    /^255[6-9]\d{8}$/,

    /^20[1-9]\d{8,9}$/,

    /^7[3-9]\d{9}$/,

    /^90[5]\d{9}$/,

    /^966[5]\d{8}$/,

    /^971[5]\d{8}$/,

    /^92[3]\d{9}$/,

    /^880[1]\d{8,9}$/,

    /^62[8]\d{8,10}$/,

    /^60[1]\d{7,8}$/,

    /^66[6-9]\d{8}$/,

    /^63[9]\d{9}$/,

    /^84[3-9]\d{8}$/,

    /^65[6-9]\d{7}$/,
  ];

  return validCountryCodePatterns.some(pattern => pattern.test(numericOnly));
}

function validatePhoneNumber(phone: string): { isValid: boolean; error?: string } {
  if (!phone) {
    return { isValid: true }; // Phone is optional
  }


  if (phone.startsWith('LID-')) {
    return {
      isValid: false,
      error: 'LID format phone numbers are not allowed'
    };
  }


  const numericOnly = phone.replace(/[^0-9]/g, '');
  if (numericOnly.length > 14) {
    return {
      isValid: false,
      error: 'Phone number is too long (maximum 14 digits allowed)'
    };
  }

  if (numericOnly.length < 7) {
    return {
      isValid: false,
      error: 'Phone number is too short (minimum 7 digits required)'
    };
  }


  const normalized = normalizePhoneNumber(phone);


  if (isWhatsAppGroupChatId(normalized)) {
    return {
      isValid: false,
      error: 'WhatsApp group chat IDs are not allowed as contact phone numbers'
    };
  }





  return { isValid: true };
}

// Advisory only: the visible page may not include every matching contact.
// Submission still goes to the server for authoritative resolution and access grants.
function checkForDuplicatePhone(phone: string, existingContacts: Contact[]): { isDuplicate: boolean; existingContact?: Contact } {
  const normalizedPhone = normalizePhoneNumber(phone);
  if (!normalizedPhone) return { isDuplicate: false };
  const existingContact = existingContacts.find(contact =>
    contact.phone && normalizePhoneNumber(contact.phone) === normalizedPhone
  );
  return { isDuplicate: Boolean(existingContact), existingContact };
}

function getDealSortTime(deal: Deal, field: 'lastActivityAt' | 'updatedAt' | 'createdAt'): number {
  const value = deal[field];
  if (!value) return 0;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareDealsByRecentActivity(a: Deal, b: Deal): number {
  return (
    getDealSortTime(b, 'lastActivityAt') - getDealSortTime(a, 'lastActivityAt') ||
    getDealSortTime(b, 'updatedAt') - getDealSortTime(a, 'updatedAt') ||
    getDealSortTime(b, 'createdAt') - getDealSortTime(a, 'createdAt') ||
    b.id - a.id
  );
}

function hasRequiredDealDetails(deal: Deal): boolean {
  return (
    deal.id != null &&
    deal.title != null &&
    deal.contactId != null &&
    deal.pipelineId != null &&
    deal.stageId != null &&
    deal.priority != null &&
    deal.createdAt != null &&
    deal.updatedAt != null
  );
}

interface Contact {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  phoneDigits?: string | null;
  whatsappBsuid?: string | null;
  whatsappLid?: string | null;
  company?: string | null;
  avatarUrl?: string | null;
  tags?: string[] | null;
  customFields?: Record<string, any> | null;
  isActive?: boolean | null;
  identifier?: string | null;
  identifierType?: string | null;
  source?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EventFormData {
  summary: string;
  description: string;
  location: string;
  startDateTime: string;
  endDateTime: string;
  attendees: string[];
  attendeeInput: string;
  colorId?: string;
}

export default function Contacts() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const { canViewContactPhone, canAccessPipeline, PERMISSIONS, hasPermission, hasAnyPermission } = usePermissions();
  const { isDental } = useErpBusinessType();
  const canViewDentalPatients = hasAnyPermission([PERMISSIONS.VIEW_DENTAL_PATIENTS, PERMISSIONS.MANAGE_DENTAL_PATIENTS]);
  const canManageDentalPatients = hasPermission(PERMISSIONS.MANAGE_DENTAL_PATIENTS);
  const showDentalPatientActions = isDental && canViewDentalPatients;
  const canCreateQuotation = hasAnyPermission([PERMISSIONS.CREATE_QUOTATIONS, PERMISSIONS.MANAGE_SALES_ORDERS]);
  const canViewContactSales = hasAnyPermission([
    PERMISSIONS.VIEW_SALES_ORDERS,
    PERMISSIONS.MANAGE_SALES_ORDERS,
    PERMISSIONS.CREATE_QUOTATIONS,
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.MANAGE_INVOICES,
    PERMISSIONS.RECORD_PAYMENTS,
  ]);
  const { company, user } = useAuth();
  const queryClient = useQueryClient();
  const [location, setLocation] = useLocation();
  const [pinnedIds, setPinnedIds] = useState<number[]>([]);
  const [markingPatientContactId, setMarkingPatientContactId] = useState<number | null>(null);


  const { isConnected: isGoogleCalendarConnected } = useGoogleCalendarAuth();
  const { isConnected: isZohoCalendarConnected } = useZohoCalendarAuth();
  const { isConnected: isCalendlyCalendarConnected } = useCalendlyCalendarAuth();

  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [nameFrom, setNameFrom] = useState<string | null>(null);
  const [jumpRailPreview, setJumpRailPreview] = useState<{
    letter: string;
    top: number;
    left: number;
    backgroundColor: string;
  } | null>(null);
  const [channelFilter, setChannelFilter] = useState('all');
  const [tagsFilter, setTagsFilter] = useState<string[]>([]);
  const itemsPerPage = 40;
  const [deleteContactId, setDeleteContactId] = useState<number | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [forceSingleDelete, setForceSingleDelete] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedContactForDetail, setSelectedContactForDetail] = useState<Contact | null>(null);
  const [isPhoneCopied, setIsPhoneCopied] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('contacts');
  const [selectedContactIdForAddDeal, setSelectedContactIdForAddDeal] = useState<number | null>(null);
  const [selectedDealForEdit, setSelectedDealForEdit] = useState<Deal | null>(null);
  const [isAddDealModalOpen, setIsAddDealModalOpen] = useState(false);
  const [isEditDealModalOpen, setIsEditDealModalOpen] = useState(false);
  const [savedDealForDetails, setSavedDealForDetails] = useState<Deal | null>(null);
  const [isSavedDealDetailsOpen, setIsSavedDealDetailsOpen] = useState(false);
  const [smartDealLoadingContactId, setSmartDealLoadingContactId] = useState<number | null>(null);


  const [isAddContactDialogOpen, setIsAddContactDialogOpen] = useState(false);
  const [addContactForm, setAddContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    identifierType: '',
    identifier: '',
    notes: '',
    tags: '',
    whatsappUsername: '',
    whatsappUsernameKey: '',
    customFields: {} as Record<string, any>,
    avatarFile: null as File | null,
    avatarPreview: '' as string
  });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [pendingContactFiles, setPendingContactFiles] = useState<Record<string, File | null>>({});
  const [createdContactDraft, setCreatedContactDraft] = useState<any | null>(null);


  const [isAppointmentModalOpen, setIsAppointmentModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'zoho' | 'calendly'>('google');
  const [googleCalendarId, setGoogleCalendarId] = useState<string>('primary');
  const [eventForm, setEventForm] = useState<EventFormData>({
    summary: '',
    description: '',
    location: '',
    startDateTime: formatISO(new Date()),
    endDateTime: formatISO(addHours(new Date(), 1)),
    attendees: [],
    attendeeInput: '',
    colorId: '1'
  });

  useEffect(() => {
    if (selectedProvider !== 'google' || !isGoogleCalendarConnected) {
      setGoogleCalendarId('primary');
    }
  }, [selectedProvider, isGoogleCalendarConnected]);

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importResults, setImportResults] = useState<{
    successful: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const [duplicateHandling, setDuplicateHandling] = useState<'skip' | 'update' | 'create'>('skip');
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);


  const [selectedContacts, setSelectedContacts] = useState<Set<number>>(new Set());
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [forceBulkDelete, setForceBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const isCompanyAdmin = Boolean((user as any)?.isSuperAdmin || (user as any)?.role === 'admin');
  const { data: contactDeletionSetting } = useQuery({
    queryKey: ['/api/company-settings/contact-deletion'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company-settings/contact-deletion');
      if (!response.ok) throw new Error('Failed to load contact deletion setting');
      return response.json() as Promise<{ allowForceContactDeletion: boolean }>;
    },
    enabled: isCompanyAdmin,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const canForceDeleteContacts = isCompanyAdmin && contactDeletionSetting?.allowForceContactDeletion === true;


  const [isCreateSegmentModalOpen, setIsCreateSegmentModalOpen] = useState(false);
  const [isAddToSegmentModalOpen, setIsAddToSegmentModalOpen] = useState(false);


  const [isWhatsAppScrapingModalOpen, setIsWhatsAppScrapingModalOpen] = useState(false);
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [contactDetailTab, setContactDetailTab] = useState('dossier');
  const [isQuotationDialogOpen, setIsQuotationDialogOpen] = useState(false);
  const [quotationSendTarget, setQuotationSendTarget] = useState<SendQuotationOrder | null>(null);
  const [archivedFilter, setArchivedFilter] = useState('active'); // 'all', 'active', 'archived'
  const [dateFilter, setDateFilter] = useState('all');


  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [contactToArchive, setContactToArchive] = useState<number | null>(null);
  const [isBulkArchiveDialogOpen, setIsBulkArchiveDialogOpen] = useState(false);
  const [bulkArchiveAction, setBulkArchiveAction] = useState<'archive' | 'unarchive'>('archive');


  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isEditTaskModalOpen, setIsEditTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [taskSearchTerm, setTaskSearchTerm] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all');
  const [taskSortBy, setTaskSortBy] = useState('dueDate');
  const [taskSortOrder, setTaskSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedTasks, setSelectedTasks] = useState<Set<number>>(new Set());
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    priority: 'medium',
    status: 'not_started',
    dueDate: '',
    assignedTo: '',
    category: '',
    tags: [] as string[]
  });


  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDocumentUploadModalOpen, setIsDocumentUploadModalOpen] = useState(false);
  const [documentPendingDelete, setDocumentPendingDelete] = useState<{
    contactId: number;
    documentId: string;
    source?: string;
    name: string;
  } | null>(null);
  const [downloadingDocuments, setDownloadingDocuments] = useState<Set<string>>(new Set());
  const [documentUploadForm, setDocumentUploadForm] = useState({
    category: 'general',
    customCategory: '',
    description: '',
    file: null as File | null
  });

  // Call-related state
  const [isCallTypeModalOpen, setIsCallTypeModalOpen] = useState(false);
  const [selectedContactForCall, setSelectedContactForCall] = useState<Contact | null>(null);
  const [isCallScreenOpen, setIsCallScreenOpen] = useState(false);
  const [activeCallData, setActiveCallData] = useState<{
    callId: string;
    contactName: string;
    contactPhone: string;
    contactAvatar?: string;
    conferenceName?: string;
    channelId?: number;
    callType?: 'direct' | 'ai-powered';
    providerStack?: VoiceProviderStack;
    supportsBrowserDirect?: boolean;
    provider?: 'whatsapp' | 'twilio' | 'telnyx';
    rtcSessionKey?: string;
  } | null>(null);

  // Message: open channel picker for this contact (persist + navigate to inbox on channel select)
  const [messageContactForChannel, setMessageContactForChannel] = useState<Contact | null>(null);

  const { data: pinnedData } = useQuery({
    queryKey: ['/api/contacts/pins'],
    queryFn: async () => {
      const response = await fetch('/api/contacts/pins');
      if (!response.ok) throw new Error('Failed to fetch pinned contacts');
      return response.json();
    },
  });

  useEffect(() => {
    setPinnedIds(Array.isArray(pinnedData?.pinnedIds) ? pinnedData.pinnedIds : []);
  }, [pinnedData?.pinnedIds]);

  // Invalidate contacts cache when user opens or switches to this page so list is fresh
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
  }, [queryClient]);

  const pinContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await apiRequest('POST', `/api/contacts/${contactId}/pin`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.message || 'Failed to pin contact');
      }
      return response.json();
    },
    onSuccess: (_, contactId) => {
      setPinnedIds(prev => [...prev, contactId]);
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/pins'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.toast.pin_failed.title', 'Pin failed'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const unpinContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await apiRequest('DELETE', `/api/contacts/${contactId}/pin`);
      if (!response.ok) throw new Error('Failed to unpin contact');
      return response.json();
    },
    onSuccess: (_, contactId) => {
      setPinnedIds(prev => prev.filter(id => id !== contactId));
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/pins'] });
    },
  });

  const handleTogglePin = (contactId: number) => {
    const id = typeof contactId === 'string' ? parseInt(String(contactId), 10) : contactId;
    const isPinned = pinnedIds.includes(id);
    if (isPinned) {
      unpinContactMutation.mutate(id);
    } else {
      if (pinnedIds.length >= PINNED_CONTACTS_MAX) {
        toast({
          title: t('contacts.toast.pin_max_reached.title', 'Maximum pins reached'),
          description: t(
            'contacts.toast.pin_max_reached.description',
            'You can pin up to {{max}} contacts. Unpin one to pin another.',
            { max: PINNED_CONTACTS_MAX }
          ),
          variant: 'destructive',
        });
        return;
      }
      pinContactMutation.mutate(id);
    }
  };

  const handleDocumentUpload = async (file: File, category: string) => {
    if (!selectedContactForDetail) return;

    setIsUploadingDocument(true);
    setUploadProgress(0);

    try {

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      await uploadDocumentMutation.mutateAsync({
        contactId: selectedContactForDetail.id,
        file,
        category: category
      });

      clearInterval(progressInterval);
      setUploadProgress(100);


      setTimeout(() => {
        setUploadProgress(0);
        setIsUploadingDocument(false);
      }, 1000);
    } catch (error) {
      setIsUploadingDocument(false);
      setUploadProgress(0);
    }
  };


  const handleUnifiedDocumentUpload = async () => {
    if (!selectedContactForDetail || !documentUploadForm.file) return;

    setIsUploadingDocument(true);
    setUploadProgress(0);

    try {

      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const finalCategory = documentUploadForm.category === 'custom'
        ? documentUploadForm.customCategory
        : documentUploadForm.category;

      await uploadDocumentMutation.mutateAsync({
        contactId: selectedContactForDetail.id,
        file: documentUploadForm.file,
        category: finalCategory,
        description: documentUploadForm.description
      });

      clearInterval(progressInterval);
      setUploadProgress(100);


      setTimeout(() => {
        setUploadProgress(0);
        setIsUploadingDocument(false);
        setIsDocumentUploadModalOpen(false);
        setDocumentUploadForm({
          category: 'general',
          customCategory: '',
          description: '',
          file: null
        });
      }, 1000);
    } catch (error) {
      setIsUploadingDocument(false);
      setUploadProgress(0);
    }
  };


  const getDownloadFilename = (fileDoc: any) => {
    let filename = fileDoc.originalName || 'download';


    if (!filename.includes('.')) {
      const urlParts = fileDoc.fileUrl?.split('.');
      if (urlParts && urlParts.length > 1) {
        const extension = urlParts[urlParts.length - 1].split('?')[0]; // Remove query params
        filename += `.${extension}`;
      }
    }

    return filename;
  };


  const handleDocumentDownload = async (fileDoc: any) => {
    if (!selectedContactForDetail) return;

    const documentId = fileDoc.id.toString();
    const filename = getDownloadFilename(fileDoc);


    setDownloadingDocuments(prev => new Set(prev).add(documentId));

    try {

      try {
        const response = await fetch(fileDoc.fileUrl);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const blob = await response.blob();


        const blobUrl = window.URL.createObjectURL(blob);


        const link = window.document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';


        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);


        setTimeout(() => {
          window.URL.revokeObjectURL(blobUrl);
        }, 100);

        toast({
          title: t('contacts.toast.download_started.title', 'Download started'),
          description: t('contacts.toast.download_started.description', 'Downloading {{name}}', { name: filename }),
        });
      } catch (fetchError) {

        console.warn('Fetch download failed, trying fallback method:', fetchError);

        const link = window.document.createElement('a');
        link.href = fileDoc.fileUrl;
        link.download = filename;
        link.target = '_blank';
        link.style.display = 'none';

        window.document.body.appendChild(link);
        link.click();
        window.document.body.removeChild(link);

        toast({
          title: t('contacts.toast.download_started.title', 'Download started'),
          description: t('contacts.toast.download_started.description', 'Downloading {{name}}', { name: filename }),
        });
      }
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: t('contacts.toast.download_failed.title', 'Download failed'),
        description: error instanceof Error
          ? error.message
          : t('contacts.toast.download_failed.description_fallback', 'Failed to download the document. Please try again or contact support.'),
        variant: "destructive",
      });
    } finally {

      setTimeout(() => {
        setDownloadingDocuments(prev => {
          const newSet = new Set(prev);
          newSet.delete(documentId);
          return newSet;
        });
      }, 1000);
    }
  };

  const handleDocumentDelete = (documentId: string, source: string | undefined, name: string) => {
    if (!selectedContactForDetail) return;
    setDocumentPendingDelete({
      contactId: selectedContactForDetail.id,
      documentId,
      source,
      name,
    });
  };


  const handleAvatarUpload = (file: File) => {
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast({
        title: t('contacts.toast.avatar.file_too_large.title', 'File too large'),
        description: t('contacts.toast.avatar.file_too_large.description', 'Avatar must be less than 5MB'),
        variant: "destructive",
      });
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast({
        title: t('contacts.toast.avatar.invalid_file_type.title', 'Invalid file type'),
        description: t('contacts.toast.avatar.invalid_file_type.description', 'Please select an image file (JPG, PNG)'),
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setAddContactForm(prev => ({
        ...prev,
        avatarFile: file,
        avatarPreview: e.target?.result as string
      }));
    };
    reader.readAsDataURL(file);
  };







  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);
  


  const { data: contactCustomFieldsSchema = [] } = useQuery({
    queryKey: ['/api/company/custom-fields', 'contact'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=contact');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const { data: availableTags = [], refetch: refetchTags } = useQuery({
    queryKey: ['/api/contacts/tags'],
    queryFn: async () => {
      const response = await fetch('/api/contacts/tags');
      if (!response.ok) {
        throw new Error('Failed to fetch tags');
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: contactDocuments = [], refetch: refetchDocuments } = useQuery({
    queryKey: ['/api/contacts/documents', selectedContactForDetail?.id],
    queryFn: async () => {
      if (!selectedContactForDetail?.id) return [];
      const response = await apiRequest('GET', `/api/contacts/${selectedContactForDetail.id}/documents`);
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }
      return response.json();
    },
    enabled: !!selectedContactForDetail?.id
  });


  const { data: assignedAgentData, isLoading: isLoadingAssignedAgent } = useQuery({
    queryKey: ['/api/contacts/assigned-agent', selectedContactForDetail?.id],
    queryFn: async () => {
      if (!selectedContactForDetail?.id) return null;
      const response = await apiRequest('GET', `/api/contacts/${selectedContactForDetail.id}/assigned-agent`);
      if (!response.ok) {
        throw new Error('Failed to fetch assigned agent');
      }
      return response.json();
    },
    enabled: !!selectedContactForDetail?.id,
    staleTime: 30 * 1000, // Cache for 30 seconds
  });

  const { data: auditLogsData, isLoading: isLoadingAuditLogs } = useQuery({
    queryKey: ['/api/contacts/audit-logs', selectedContactForDetail?.id],
    queryFn: async () => {
      if (!selectedContactForDetail?.id) return { logs: [], total: 0 };
      const response = await apiRequest('GET', `/api/contacts/${selectedContactForDetail.id}/audit-logs?limit=100`);
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      return response.json();
    },
    enabled: !!selectedContactForDetail?.id
  });


  const { data: contactTasks = [], isLoading: isLoadingTasks, refetch: refetchTasks } = useQuery({
    queryKey: ['/api/contacts/tasks', selectedContactForDetail?.id, taskStatusFilter, taskPriorityFilter, taskSearchTerm],
    queryFn: async () => {
      if (!selectedContactForDetail?.id) return [];
      const params = new URLSearchParams();
      if (taskStatusFilter !== 'all') params.append('status', taskStatusFilter);
      if (taskPriorityFilter !== 'all') params.append('priority', taskPriorityFilter);
      if (taskSearchTerm) params.append('search', taskSearchTerm);

      const response = await apiRequest('GET', `/api/contacts/${selectedContactForDetail.id}/tasks?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch tasks');
      }
      return response.json();
    },
    enabled: !!selectedContactForDetail?.id
  });

  const contactActivity = auditLogsData?.logs || [];

  // Fetch channel connections for call functionality and message channel picker
  const { data: channelConnections = [] } = useChannelConnections();
  const { setActiveChannelId: setConversationActiveChannelId } = useConversations();
  const { setActiveChannelId: setGlobalActiveChannelId } = useActiveChannel();
  const { getChannelDisplayName, getChannelIcon } = useChannelInfo();

  const activeChannelsForMessage = channelConnections.filter(
    (ch: { channelType: string; status: string | null }) => isChannelAvailable(ch)
  );

  const archiveContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await apiRequest('POST', `/api/contacts/${contactId}/archive`);
      if (!response.ok) {
        throw new Error('Failed to archive contact');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/archived-count'] });
      toast({
        title: t('contacts.toast.contact_archived.title', 'Contact Archived'),
        description: t('contacts.toast.contact_archived.description', 'The contact has been successfully archived.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('contacts.toast.archive_failed.title', 'Archive Failed'),
        description: error.message || t('contacts.toast.archive_failed.description_fallback', 'Failed to archive contact'),
        variant: "destructive",
      });
    }
  });

  // Mutation for initiating contact calls
  const initiateContactCallMutation = useMutation({
    mutationFn: async ({ contactId, selection }: { contactId: number; selection: CallWizardSelection }) => {
      const response = await apiRequest('POST', `/api/contacts/${contactId}/initiate-call`, {
        channelId: selection.channel.id,
        callType: selection.callType,
        recording: selection.recording,
        transcription: selection.transcription,
        sdpOffer: selection.sdpOffer,
      });
      return response.json();
    },
    onMutate: () => {
      // Loading state can be handled by the button's disabled state
    },
    onSuccess: (data, variables) => {
      toast({
        title: t('contacts.toast.call_initiated.title', 'Call Initiated'),
        description: t('contacts.toast.call_initiated.description', 'Connecting you to the contact...'),
      });
      
      // Set active call data and open call screen
      setActiveCallData({
        callId: data.callId,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactAvatar: data.contactAvatar,
        conferenceName: data.conferenceName,
        channelId: data.channelId,
        callType: data.callType || data.metadata?.callType || 'direct',
        providerStack: data.providerStack || data.metadata?.providerStack || variables.selection.channel.providerStack,
        supportsBrowserDirect: data.supportsBrowserDirect ?? data.metadata?.supportsBrowserDirect ?? variables.selection.channel.supportsBrowserDirect,
        provider: data.provider || (variables.selection.channel.channelType === 'whatsapp_official' ? 'whatsapp' : undefined),
        rtcSessionKey: variables.selection.rtcSessionKey,
      });
      setIsCallScreenOpen(true);
      
      // Invalidate call logs query
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
    },
    onError: (error: Error & { errorCode?: string }, variables) => {
      if (variables.selection.rtcSessionKey) closeWhatsAppRtcSession(variables.selection.rtcSessionKey);
      toast({
        title: t('contacts.toast.call_failed.title', 'Call Failed'),
        description: error.errorCode
          ? t(`calling.errors.${error.errorCode}`, error.message)
          : error.message || t('contacts.toast.call_failed.description_fallback', 'Failed to initiate call. Please try again.'),
        variant: "destructive",
      });
    }
  });

  const unarchiveContactMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const response = await apiRequest('DELETE', `/api/contacts/${contactId}/archive`);
      if (!response.ok) {
        throw new Error('Failed to unarchive contact');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/archived-count'] });
      toast({
        title: t('contacts.toast.contact_unarchived.title', 'Contact Unarchived'),
        description: t('contacts.toast.contact_unarchived.description', 'The contact has been successfully unarchived.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('contacts.toast.unarchive_failed.title', 'Unarchive Failed'),
        description: error.message || t('contacts.toast.unarchive_failed.description_fallback', 'Failed to unarchive contact'),
        variant: "destructive",
      });
    }
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async ({ contactIds, archive }: { contactIds: number[]; archive: boolean }) => {
      const promises = contactIds.map(id =>
        apiRequest(archive ? 'POST' : 'DELETE', `/api/contacts/${id}/archive`)
      );
      const responses = await Promise.all(promises);

      const failedRequests = responses.filter(response => !response.ok);
      if (failedRequests.length > 0) {
        throw new Error(`Failed to ${archive ? 'archive' : 'unarchive'} ${failedRequests.length} contact(s)`);
      }

      return responses;
    },
    onSuccess: (_, { archive }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      toast({
        title: archive
          ? t('contacts.toast.bulk_archive.success_title_archive', 'Contacts archived successfully')
          : t('contacts.toast.bulk_archive.success_title_unarchive', 'Contacts unarchived successfully'),
        description: archive
          ? t('contacts.toast.bulk_archive.success_description_archive', '{{count}} contact(s) have been archived.', { count: selectedContacts.size })
          : t('contacts.toast.bulk_archive.success_description_unarchive', '{{count}} contact(s) have been unarchived.', { count: selectedContacts.size }),
      });
      setSelectedContacts(new Set());
    },
    onError: (error, { archive }) => {
      toast({
        title: archive
          ? t('contacts.toast.bulk_archive.error_title_archive', 'Failed to archive contacts')
          : t('contacts.toast.bulk_archive.error_title_unarchive', 'Failed to unarchive contacts'),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['/api/contacts', currentPage, debouncedSearch, nameFrom, channelFilter, tagsFilter, archivedFilter, dateFilter, itemsPerPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', itemsPerPage.toString());

      if (debouncedSearch) {
        params.append('search', debouncedSearch);
      }

      if (nameFrom) {
        params.append('nameFrom', nameFrom);
      }

      if (channelFilter && channelFilter !== 'all') {
        params.append('channel', channelFilter);
      }

      if (tagsFilter.length > 0) {
        params.append('tags', tagsFilter.join(','));
      }


      if (archivedFilter === 'archived') {
        params.append('includeArchived', 'true');
        params.append('archivedOnly', 'true');
      } else if (archivedFilter === 'all') {
        params.append('includeArchived', 'true');
      }


      if (dateFilter && dateFilter !== 'all') {
        params.append('dateRange', dateFilter);
      }

      const response = await fetch(`/api/contacts?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch contacts');
      }

      return response.json();
    },
    refetchOnWindowFocus: false
  });
  

  const rawContacts: Contact[] = Array.isArray(data?.contacts) ? data.contacts : [];



  const contacts: Contact[] = (() => {
    const pinnedSet = new Set(pinnedIds);
    const pinnedContacts: Contact[] = Array.isArray(pinnedData?.contacts) ? pinnedData.contacts : [];
    const unpinned = rawContacts.filter(c => !pinnedSet.has(typeof c.id === 'string' ? parseInt(c.id, 10) : c.id));
    return [...pinnedContacts, ...unpinned];
  })();
  const totalContacts = data?.total || 0;
  const totalPages = Math.ceil(totalContacts / itemsPerPage);

  const visibleContactIds = contacts
    .map((contact) => (typeof contact.id === 'string' ? parseInt(contact.id, 10) : contact.id))
    .filter((id): id is number => Number.isFinite(id) && id > 0);

  const detailContactId = selectedContactForDetail
    ? (typeof selectedContactForDetail.id === 'string'
        ? parseInt(selectedContactForDetail.id, 10)
        : selectedContactForDetail.id)
    : null;

  const membershipContactIds = Array.from(
    new Set([
      ...visibleContactIds,
      ...(detailContactId && Number.isFinite(detailContactId) ? [detailContactId] : []),
    ]),
  );

  const { data: dentalPatientMembership = [] } = useQuery({
    queryKey: ['/api/erp/dental/patients/membership', membershipContactIds],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/erp/dental/patients/membership', {
        contactIds: membershipContactIds,
      });
      if (!res.ok) throw new Error('Failed to load dental patient membership');
      const json = await res.json();
      return (json.data ?? []) as number[];
    },
    enabled: showDentalPatientActions && membershipContactIds.length > 0,
    refetchOnWindowFocus: false,
  });

  const dentalPatientIdSet = new Set(dentalPatientMembership);


  const { data: archivedCountData } = useQuery({
    queryKey: ['/api/contacts/archived-count'],
    queryFn: async () => {
      const response = await fetch('/api/contacts/archived-count');
      if (!response.ok) {
        throw new Error('Failed to fetch archived contact count');
      }
      const data = await response.json();
      return data.count as number;
    },
    refetchOnWindowFocus: false
  });

  const archivedContactsCount = archivedCountData ?? 0;


  
  const deleteContactMutation = useMutation({
    mutationFn: async ({ contactId, force }: { contactId: number; force: boolean }) => {
      const response = await apiRequest('DELETE', `/api/contacts/${contactId}`, { force });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete contact');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('contacts.toast.contact_deleted.title', 'Contact deleted'),
        description: t('contacts.toast.contact_deleted.description', 'The contact has been successfully deleted.'),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/tags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/archived-count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] });
      setForceSingleDelete(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.toast.delete_failed.title', 'Delete failed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });


  const addContactMutation = useMutation({
    mutationFn: async (contactData: any) => {
      let newContact = createdContactDraft;
      let creationMeta = newContact?.creationMeta;
      if (!newContact) {
        const response = await apiRequest('POST', '/api/contacts', contactData);
        const result = await readContactAddResult<any>(response);
        if (!result.created) return result;
        newContact = result.contact;
        creationMeta = result.creationMeta;
        setCreatedContactDraft(newContact);
      }


      if (addContactForm.avatarFile) {
        const formData = new FormData();
        formData.append('avatar', addContactForm.avatarFile);

        const avatarResponse = await apiRequest('POST', `/api/contacts/${newContact.id}/avatar`, formData);

        if (avatarResponse.ok) {
          const avatarData = await avatarResponse.json();
          newContact.avatarUrl = avatarData.avatarUrl;
        }
      }

      for (const [fieldName, file] of Object.entries(pendingContactFiles)) {
        if (!file) continue;
        const reference = await uploadCustomFieldFile('contact', newContact.id, file, t);
        const response = await apiRequest('PUT', '/api/custom-field-attachments/value', {
          ownerType: 'contact', ownerId: newContact.id, fieldName, value: reference,
        });
        if (!response.ok) throw new Error(t('custom_fields.file.assign_failed', 'Failed to assign {{name}}', { name: file.name }));
        setAddContactForm((current) => ({
          ...current,
          customFields: { ...current.customFields, [fieldName]: reference },
        }));
        setPendingContactFiles((current) => ({ ...current, [fieldName]: null }));
      }

      return { contact: newContact, created: true, creationMeta };
    },
    onMutate: () => {
      setIsSubmittingContact(true);
    },
    onSuccess: (result) => {
      toast(contactAddFeedback(result, t));
      refreshContactQueries(queryClient);
      setIsAddContactDialogOpen(false);
      resetAddContactForm();
    },
    onError: (error: Error & { errorCode?: string }) => {
      toast({
        title: t('contacts.add.error_title', 'Creation failed'),
        description: contactCreationErrorMessage(error, t),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsSubmittingContact(false);
    }
  });


  const importContactsMutation = useMutation({
    mutationFn: async ({ file, duplicateHandling }: { file: File; duplicateHandling: string }) => {
      const formData = new FormData();
      formData.append('csvFile', file);
      formData.append('duplicateHandling', duplicateHandling);


      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            setImportProgress(percentComplete);
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response);
            } catch (e) {
              reject(new Error('Invalid response format'));
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText);
              reject(new Error(errorResponse.error || 'Import failed'));
            } catch (e) {
              reject(new Error(`Import failed with status ${xhr.status}`));
            }
          }
        };

        xhr.onerror = () => reject(new Error('Network error during import'));

        xhr.open('POST', '/api/contacts/import');
        xhr.send(formData);
      });
    },
    onMutate: () => {
      setIsImporting(true);
      setImportProgress(0);
      setImportResults(null);
    },
    onSuccess: (data: any) => {
      setImportResults(data);
      toast({
        title: t('contacts.import.success_title', 'Import completed'),
        description: t('contacts.import.success_description', 'Successfully imported {{count}} contacts', { count: data.successful }),
      });

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/tags'] });
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.import.error_title', 'Import failed'),
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsImporting(false);
      setImportProgress(0);
    }
  });


  const uploadDocumentMutation = useMutation({
    mutationFn: async ({ contactId, file, category, description }: { contactId: number; file: File; category: string; description?: string }) => {
      const formData = new FormData();
      formData.append('document', file);
      formData.append('category', category);
      if (description) {
        formData.append('description', description);
      }

      const response = await apiRequest('POST', `/api/contacts/${contactId}/documents`, formData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload document');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('contacts.toast.document_uploaded.title', 'Document uploaded'),
        description: t('contacts.toast.document_uploaded.description', 'The document has been successfully uploaded.'),
      });
      refetchDocuments();
      setIsUploadingDocument(false);
      setUploadProgress(0);
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.toast.upload_failed.title', 'Upload failed'),
        description: error.message,
        variant: "destructive",
      });
      setIsUploadingDocument(false);
      setUploadProgress(0);
    }
  });


  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ contactId, documentId, source }: { contactId: number; documentId: string; source?: string }) => {
      const response = await apiRequest(
        'DELETE',
        source === 'custom_field_attachment'
          ? `/api/custom-field-attachments/${documentId}`
          : `/api/contacts/${contactId}/documents/${documentId}`,
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete document');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('contacts.toast.document_deleted.title', 'Document deleted'),
        description: t('contacts.toast.document_deleted.description', 'The document has been successfully deleted.'),
      });
      refetchDocuments();
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.toast.delete_failed.title', 'Delete failed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });





  const bulkDeleteContactsMutation = useMutation({
    mutationFn: async ({ contactIds, force }: { contactIds: number[]; force: boolean }) => {
      const response = await apiRequest('DELETE', '/api/contacts/bulk', { contactIds, force });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete contacts');
      }

      return response.json();
    },
    onMutate: () => {
      setIsBulkDeleting(true);
    },
    onSuccess: (data: any) => {
      const { successful, failed, total } = data;

      if (successful.length > 0) {
        toast({
          title: t('contacts.bulk_delete.success_title', 'Contacts deleted'),
          description: t('contacts.bulk_delete.success_description', 'Successfully deleted {{count}} of {{total}} contacts', {
            count: successful.length,
            total
          }),
        });
      }

      if (failed.length > 0) {
        toast({
          title: t('contacts.bulk_delete.partial_failure_title', 'Some deletions failed'),
          description: t('contacts.bulk_delete.partial_failure_description', '{{count}} contacts could not be deleted', {
            count: failed.length
          }),
          variant: 'destructive',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts/tags'] });
      setSelectedContacts(new Set());
      setIsBulkDeleteDialogOpen(false);
      setForceBulkDelete(false);
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.bulk_delete.error_title', 'Bulk delete failed'),
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsBulkDeleting(false);
    }
  });


  const resetAddContactForm = () => {
    setAddContactForm({
      name: '',
      email: '',
      phone: '',
      company: '',
      identifierType: '',
      identifier: '',
      notes: '',
      tags: '',
      whatsappUsername: '',
      whatsappUsernameKey: '',
      customFields: {},
      avatarFile: null,
      avatarPreview: ''
    });
    setPendingContactFiles({});
    setCreatedContactDraft(null);
  };

  const resetImportForm = () => {
    setImportFile(null);
    setImportProgress(0);
    setImportResults(null);
    setCsvPreview([]);
    setShowPreview(false);
    setDuplicateHandling('skip');
  };

  const handleAddContactSubmit = () => {
    if (!addContactForm.name.trim()) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.add.name_required', 'Contact name is required'),
        variant: 'destructive'
      });
      return;
    }


    if (addContactForm.phone) {
      const phoneValidation = validatePhoneNumber(addContactForm.phone);
      if (!phoneValidation.isValid) {
        toast({
          title: t('common.error', 'Error'),
          description: phoneValidation.error,
          variant: 'destructive'
        });
        return;
      }
    }

    if (addContactForm.whatsappUsername) {
      if (!validateUsername(addContactForm.whatsappUsername)) {
        toast({
          title: t('common.error', 'Error'),
          description: t('contacts.creation.error.invalid_username', 'WhatsApp username must be 3-35 characters using letters, numbers, periods or underscores.'),
          variant: 'destructive'
        });
        return;
      }
    }

    if (requiresWhatsAppContactIdentity(addContactForm)) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.creation.error.identity_required', 'Enter a phone number or WhatsApp username.'),
        variant: 'destructive',
      });
      return;
    }

    if (missingRequiredContactCustomFields(contactCustomFieldsSchema as ContactCustomFieldDefinition[], {
      ...addContactForm.customFields,
      ...Object.fromEntries(Object.entries(pendingContactFiles).filter(([, file]) => Boolean(file))),
    }).length > 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t('custom_fields.editor.complete_required', 'Complete all required custom fields.'),
        variant: 'destructive',
      });
      return;
    }

    const tagsArray = addContactForm.tags
      ? addContactForm.tags.split(',').map(tag => tag.trim()).filter(Boolean)
      : [];


    const normalizedPhone = addContactForm.phone ? normalizePhoneNumber(addContactForm.phone) : '';

    const customFieldsSanitized = Object.fromEntries(
      Object.entries(addContactForm.customFields || {}).filter(
        ([_, v]) => v !== undefined && v !== null && v !== '' && (Array.isArray(v) ? v.length > 0 : true)
      )
    );

    addContactMutation.mutate({
      ...addContactForm,
      phone: normalizedPhone,
      whatsappUsername: addContactForm.whatsappUsername
        ? normalizeUsername(addContactForm.whatsappUsername)
        : null,
      tags: tagsArray,
      customFields: customFieldsSanitized
    });
  };

  const handleFileSelected = (file: File) => {
    setImportFile(file);

    parseCsvPreview(file);
  };

  const parseCsvPreview = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      complete: (results) => {
        if (results.errors?.length) {
          const msg = results.errors
            .slice(0, 5)
            .map(e => (e.message ? `${e.type ?? 'Parse'}: ${e.message}` : String(e.type ?? e)))
            .join('; ');
          toast({
            title: t('contacts.import.csv_parse_notice', 'CSV parse notice'),
            description: msg || t('contacts.import.csv_parse_notice_desc', 'Some CSV rows had parse notices.'),
          });
        }

        const dataRows = (results.data as Record<string, string>[]).filter(
          row => row && Object.values(row).some(v => v != null && String(v).trim() !== '')
        );

        const preview = dataRows.slice(0, 5).map((obj, index) => {
          const row: any = { ...obj };

          const warnings: string[] = [];
          if (row.phone) {
            const phoneValidation = validatePhoneNumber(row.phone);
            if (!phoneValidation.isValid) {
              warnings.push(phoneValidation.error || 'Invalid phone number');
            }

            const duplicateCheck = checkForDuplicatePhone(row.phone, contacts || []);
            if (duplicateCheck.isDuplicate) {
              warnings.push(`Duplicate phone number (existing contact: ${duplicateCheck.existingContact?.name})`);
            }
          }
          if (row.whatsappUsername && !validateUsername(row.whatsappUsername)) {
            warnings.push(t('contacts.creation.error.invalid_username', 'WhatsApp username must be 3-35 characters using letters, numbers, periods or underscores.'));
          } else if (row.whatsappUsername) {
            const normalizedUsername = normalizeUsername(row.whatsappUsername);
            const existing = (contacts || []).find(contact =>
              normalizeUsername((contact as any).whatsappUsername || '') === normalizedUsername
            );
            if (existing) {
              warnings.push(t(
                'contacts.import.preview.duplicate_username',
                'Duplicate WhatsApp username (existing contact: {{name}})',
                { name: existing.name },
              ));
            }
          }
          if (requiresWhatsAppContactIdentity({
            identifierType: row.identifierType,
            phone: row.phone,
            whatsappUsername: row.whatsappUsername,
          })) {
            warnings.push(t('contacts.creation.error.identity_required', 'Enter a phone number or WhatsApp username.'));
          }

          row._warnings = warnings;
          row._rowNumber = index + 2;
          return row;
        });
        setCsvPreview(preview);
        setShowPreview(true);
      },
      error: (err) => {
        toast({
          title: t('common.error', 'Error'),
          description: err.message || t('contacts.import.csv_preview_failed', 'Failed to read CSV preview'),
          variant: 'destructive',
        });
      },
    });
  };

  const downloadCsvTemplate = () => {
    const headers = ['name', 'email', 'phone', 'whatsappUsername', 'company', 'identifierType', 'identifier', 'notes', 'tags'];
    const exampleData = [
      'Abid,admin@pointer.pk,+923059002132,abid.shafi,Pointer Software,whatsapp,+923059020132,Sales lead,"lead,customer"',
      'Niamat,niamat@pointer.pk,,niamat.shakran,Pointer Software,whatsapp_unofficial,,Username-only WhatsApp contact,"prospect,vip"'
    ];

    const csvContent = [headers.join(','), ...exampleData].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleImportSubmit = () => {
    if (!importFile) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.import.no_file_selected', 'Please select a CSV file to import'),
        variant: 'destructive'
      });
      return;
    }

    importContactsMutation.mutate({
      file: importFile,
      duplicateHandling
    });
  };


  const handleSelectContact = (contactId: number, checked: boolean) => {
    const newSelected = new Set(selectedContacts);

    const numericId = typeof contactId === 'string' ? parseInt(contactId, 10) : contactId;

    if (isNaN(numericId)) {
      console.error('Invalid contact ID detected:', contactId);
      return;
    }

    if (checked) {
      newSelected.add(numericId);
    } else {
      newSelected.delete(numericId);
    }

    setSelectedContacts(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {

      const allContactIds = new Set(contacts.map(contact => {
        const id = typeof contact.id === 'string' ? parseInt(contact.id, 10) : contact.id;
        return id;
      }).filter(id => !isNaN(id)));

      setSelectedContacts(allContactIds);
    } else {
      setSelectedContacts(new Set());
    }
  };

  const handleClearSelection = () => {
    setSelectedContacts(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedContacts.size === 0) return;
    setForceBulkDelete(false);
    setIsBulkDeleteDialogOpen(true);
  };

  const handleSegmentCreated = (segment: any) => {
    toast({
      title: t('common.success', 'Success'),
      description: t('segments.create.success_redirect', 'Segment "{{name}}" created successfully. You can now use it in campaigns.', {
        name: segment.name
      })
    });


    setSelectedContacts(new Set());



  };

  const handleContactsAddedToSegment = (segmentName: string, contactCount: number) => {
    toast({
      title: t('common.success', 'Success'),
      description: t('segments.add_to_existing.success', 'Added {{count}} contact(s) to segment "{{name}}"', {
        count: contactCount.toString(),
        name: segmentName
      })
    });
    setSelectedContacts(new Set());
    queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
  };

  const confirmBulkDelete = () => {
    const contactIds = Array.from(selectedContacts);


    const validContactIds = contactIds
      .map(id => {
        const numId = typeof id === 'string' ? parseInt(id, 10) : Number(id);
        return isNaN(numId) ? null : numId;
      })
      .filter(id => id !== null) as number[];

    if (validContactIds.length === 0) {
      toast({
        title: t('common.error', 'Error'),
        description: 'No valid contact IDs selected for deletion',
        variant: 'destructive'
      });
      return;
    }

    bulkDeleteContactsMutation.mutate({ contactIds: validContactIds, force: forceBulkDelete });
  };
  
  const handleDeleteContact = (id: number) => {
    setDeleteContactId(id);
    setForceSingleDelete(false);
    setIsDeleteDialogOpen(true);
  };

  const handleEditContact = (contact: Contact) => {
    setSelectedContact(contact);
    setIsEditModalOpen(true);
  };

  const handleEditModalClose = () => {
    setIsEditModalOpen(false);
    setSelectedContact(null);
  };
  
  const confirmDelete = () => {
    if (deleteContactId) {
      deleteContactMutation.mutate({ contactId: deleteContactId, force: forceSingleDelete });
    }

    setIsDeleteDialogOpen(false);
  };
  
  const formatLastContact = (date: string) => {
    if (!date) return 'Never';
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };


  const handleArchiveContact = (contactId: number) => {
    setContactToArchive(contactId);
    setIsArchiveDialogOpen(true);
  };

  const handleConfirmArchive = () => {
    if (contactToArchive) {
      archiveContactMutation.mutate(contactToArchive);
      setIsArchiveDialogOpen(false);
      setContactToArchive(null);
    }
  };

  const handleBulkArchiveConfirm = (action: 'archive' | 'unarchive') => {
    setBulkArchiveAction(action);
    setIsBulkArchiveDialogOpen(true);
  };

  const handleConfirmBulkArchive = () => {
    const contactIds = Array.from(selectedContacts);
    bulkArchiveMutation.mutate({
      contactIds,
      archive: bulkArchiveAction === 'archive'
    });
    setIsBulkArchiveDialogOpen(false);
  };


  const createTaskMutation = useMutation({
    mutationFn: async ({ contactId, taskData }: { contactId: number; taskData: any }) => {
      const response = await apiRequest('POST', `/api/contacts/${contactId}/tasks`, taskData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create task');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('contacts.toast.task_created.title', 'Task created'),
        description: t('contacts.toast.task_created.description', 'The task has been successfully created.'),
      });
      refetchTasks();
      setIsCreateTaskModalOpen(false);
      setTaskForm({
        title: '',
        description: '',
        priority: 'medium',
        status: 'not_started',
        dueDate: '',
        assignedTo: '',
        category: '',
        tags: []
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.toast.creation_failed.title', 'Creation failed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ contactId, taskId, taskData }: { contactId: number; taskId: number; taskData: any }) => {
      const response = await apiRequest('PATCH', `/api/contacts/${contactId}/tasks/${taskId}`, taskData);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update task');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('contacts.toast.task_updated.title', 'Task updated'),
        description: t('contacts.toast.task_updated.description', 'The task has been successfully updated.'),
      });
      refetchTasks();
      setIsEditTaskModalOpen(false);
      setSelectedTask(null);
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.toast.update_failed.title', 'Update failed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async ({ contactId, taskId }: { contactId: number; taskId: number }) => {
      const response = await apiRequest('DELETE', `/api/contacts/${contactId}/tasks/${taskId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to delete task');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('contacts.toast.task_deleted.title', 'Task deleted'),
        description: t('contacts.toast.task_deleted.description', 'The task has been successfully deleted.'),
      });
      refetchTasks();
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.toast.delete_failed.title', 'Delete failed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const bulkUpdateTasksMutation = useMutation({
    mutationFn: async ({ contactId, taskIds, updates }: { contactId: number; taskIds: number[]; updates: any }) => {
      const response = await apiRequest('PATCH', `/api/contacts/${contactId}/tasks/bulk`, { taskIds, updates });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update tasks');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('contacts.toast.tasks_updated.title', 'Tasks updated'),
        description: t('contacts.toast.tasks_updated.description', 'The selected tasks have been successfully updated.'),
      });
      refetchTasks();
      setSelectedTasks(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.toast.bulk_update_failed.title', 'Bulk update failed'),
        description: error.message,
        variant: "destructive",
      });
    }
  });


  const createEventMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest('POST', `/api/${selectedProvider}/calendar/events`, data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: t('contacts.toast.appointment_created.title', 'Appointment Created'),
        description: t('contacts.toast.appointment_created.description', 'Your appointment has been successfully created'),
      });
      setIsAppointmentModalOpen(false);
      resetEventForm();
    },
    onError: (error: any) => {
      toast({
        title: t('contacts.toast.appointment_create_failed.title', 'Failed to Create Appointment'),
        description: error.message || t('contacts.toast.appointment_create_failed.description_fallback', 'Failed to create appointment'),
        variant: "destructive",
      });
    }
  });


  const resetEventForm = () => {
    setEventForm({
      summary: '',
      description: '',
      location: '',
      startDateTime: formatISO(new Date()),
      endDateTime: formatISO(addHours(new Date(), 1)),
      attendees: [],
      attendeeInput: '',
      colorId: '1'
    });
  };

  const handleAddAttendee = () => {
    if (eventForm.attendeeInput && eventForm.attendeeInput.includes('@')) {
      setEventForm({
        ...eventForm,
        attendees: [...eventForm.attendees, eventForm.attendeeInput],
        attendeeInput: ''
      });
    }
  };

  const handleRemoveAttendee = (email: string) => {
    setEventForm({
      ...eventForm,
      attendees: eventForm.attendees.filter(attendee => attendee !== email)
    });
  };

  const handleScheduleAppointment = (contact: Contact) => {

    const isConnected = selectedProvider === 'google' ? isGoogleCalendarConnected :
                       selectedProvider === 'zoho' ? isZohoCalendarConnected : isCalendlyCalendarConnected;
    const providerName = selectedProvider === 'google'
      ? t('contacts.page.appointment.provider.google', 'Google Calendar')
      : selectedProvider === 'zoho'
        ? t('contacts.page.appointment.provider.zoho', 'Zoho Calendar')
        : t('contacts.page.appointment.provider.calendly', 'Calendly');

    if (!isConnected) {
      toast({
        title: t('contacts.toast.appointment_provider_not_connected.title', '{{provider}} Not Connected', { provider: providerName }),
        description: t(
          'contacts.toast.appointment_provider_not_connected.description',
          'Please connect your {{provider}} first to schedule appointments',
          { provider: providerName }
        ),
        variant: "destructive",
      });
      return;
    }


    setEventForm({
      summary: t('contacts.page.appointment.event.summary', 'Meeting with {{name}}', { name: contact.name }),
      description: contact.company
        ? t(
            'contacts.page.appointment.event.description_with_company',
            'Appointment with {{name}} from {{company}}',
            { name: contact.name, company: contact.company }
          )
        : t('contacts.page.appointment.event.description', 'Appointment with {{name}}', { name: contact.name }),
      location: '',
      startDateTime: formatISO(new Date()),
      endDateTime: formatISO(addHours(new Date(), 1)),
      attendees: contact.email ? [contact.email] : [],
      attendeeInput: '',
      colorId: '1'
    });
    setIsAppointmentModalOpen(true);
  };

  const handleCreateEvent = () => {
    if (!eventForm.summary || !eventForm.startDateTime || !eventForm.endDateTime) {
      toast({
        title: t('contacts.toast.missing_information.title', 'Missing Information'),
        description: t('contacts.toast.missing_information.description', 'Please fill in all required fields'),
        variant: "destructive",
      });
      return;
    }

    const eventData = {
      summary: eventForm.summary,
      description: eventForm.description,
      location: eventForm.location,
      startDateTime: selectedProvider === 'google' ? eventForm.startDateTime.slice(0, 16) : eventForm.startDateTime,
      endDateTime: selectedProvider === 'google' ? eventForm.endDateTime.slice(0, 16) : eventForm.endDateTime,
      attendees: eventForm.attendees,
      colorId: eventForm.colorId,
      ...(selectedProvider === 'google' ? { calendarId: googleCalendarId } : {}),
    };

    createEventMutation.mutate(eventData);
  };

  const handleMessageClick = (contact: Contact) => {
    if (!contact.id) return;
    setMessageContactForChannel(contact);
  };

  const handleChannelClick = (contact: Contact) => {
    handleMessageClick(contact);
  };

  const handleMessageChannelSelected = (channelId: number, channelType: string) => {
    if (!messageContactForChannel) return;
    localStorage.setItem('selectedContactId', messageContactForChannel.id.toString());
    localStorage.setItem('selectedChannelId', channelId.toString());
    localStorage.setItem('selectedChannelType', channelType);
    setConversationActiveChannelId(channelId);
    setGlobalActiveChannelId(channelId);
    setMessageContactForChannel(null);
    setLocation('/inbox');
    toast({
      title: t('contacts.redirecting_to_inbox', 'Redirecting to inbox'),
      description: t('contacts.opening_conversation_with', 'Opening conversation with {{name}}', { name: messageContactForChannel.name }),
    });
  };

  const handleOpenSavedDealDetails = useCallback(async (
    savedDeal: Deal,
    options?: { fallbackContactId?: number | null; previousContactId?: number | null }
  ) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['/api/deals'] }),
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] }),
    ]);

    let dealForDetails = savedDeal;
    if (!hasRequiredDealDetails(savedDeal) || typeof savedDeal.contactId !== 'number') {
      try {
        const response = await apiRequest('GET', `/api/deals/${savedDeal.id}`);
        dealForDetails = await response.json();
      } catch (error: any) {
        toast({
          title: t('contacts.toast.deal_details_failed.title', 'Deal details failed'),
          description: error.message || t('contacts.toast.deal_details_failed.description', 'Failed to load the saved deal details.'),
          variant: "destructive",
        });
        return;
      }
    }

    if (!hasRequiredDealDetails(dealForDetails)) {
      toast({
        title: t('contacts.toast.deal_details_failed.title', 'Deal details failed'),
        description: t('contacts.toast.deal_details_failed.description', 'Failed to load the saved deal details.'),
        variant: "destructive",
      });
      return;
    }

    const affectedContactIds = new Set<number>();
    if (typeof dealForDetails.contactId === 'number') {
      affectedContactIds.add(dealForDetails.contactId);
    }
    if (typeof options?.fallbackContactId === 'number') {
      affectedContactIds.add(options.fallbackContactId);
    }
    if (typeof options?.previousContactId === 'number') {
      affectedContactIds.add(options.previousContactId);
    }

    await Promise.all(
      Array.from(affectedContactIds).flatMap((contactId) => [
        queryClient.invalidateQueries({ queryKey: [`/api/deals/contact/${contactId}`] }),
        queryClient.invalidateQueries({ queryKey: ['/api/deals/contact', contactId] }),
      ])
    );

    setSavedDealForDetails(dealForDetails);
    setIsSavedDealDetailsOpen(true);
  }, [queryClient, t, toast]);

  const handleCloseAddDealModal = () => {
    setIsAddDealModalOpen(false);
    setSelectedContactIdForAddDeal(null);
  };

  const handleCloseEditDealModal = () => {
    setIsEditDealModalOpen(false);
    setSelectedDealForEdit(null);
  };

  const handleCloseSavedDealDetailsModal = () => {
    setIsSavedDealDetailsOpen(false);
    setSavedDealForDetails(null);
  };

  const handleSmartDealClick = async (contact: Contact) => {
    if (!contact.id || smartDealLoadingContactId !== null) return;

    setSmartDealLoadingContactId(contact.id);

    try {
      const response = await apiRequest('GET', `/api/deals/contact/${contact.id}`);
      const deals: Deal[] = await response.json();
      const activeDeals = deals
        .filter((deal) => deal.status === 'active')
        .sort(compareDealsByRecentActivity);

      if (activeDeals.length > 0) {
        setSelectedDealForEdit(activeDeals[0]);
        setIsEditDealModalOpen(true);
      } else {
        setSelectedContactIdForAddDeal(contact.id);
        setIsAddDealModalOpen(true);
      }
    } catch (error: any) {
      toast({
        title: t('contacts.toast.deal_lookup_failed.title', 'Deal lookup failed'),
        description: error.message || t('contacts.toast.deal_lookup_failed.description', 'Failed to load deals for this contact.'),
        variant: "destructive",
      });
    } finally {
      setSmartDealLoadingContactId(null);
    }
  };

  const isDentalPatientContact = (contact: Contact) => {
    const id = typeof contact.id === 'string' ? parseInt(contact.id, 10) : contact.id;
    return Number.isFinite(id) && dentalPatientIdSet.has(id);
  };

  const handleOpenDentalPatient = (contact: Contact) => {
    setLocation(`/erp/dental/patients/${contact.id}`);
  };

  const handleMarkAsDentalPatient = async (contact: Contact) => {
    if (!contact.id || markingPatientContactId !== null) return;
    setMarkingPatientContactId(contact.id);
    try {
      const res = await apiRequest('POST', '/api/erp/dental/patients', { contactId: contact.id });
      const json = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) {
        throw new Error(json.error || 'Failed to mark as patient');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients/membership'] });
      toast({
        title:
          res.status === 409
            ? t('contacts.toast.already_patient.title', 'Already a patient')
            : t('contacts.toast.marked_patient.title', 'Marked as patient'),
      });
      setLocation(`/erp/dental/patients/${contact.id}`);
    } catch (error: any) {
      toast({
        title: t('contacts.toast.mark_patient_failed.title', 'Could not mark as patient'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setMarkingPatientContactId(null);
    }
  };

  const handleNameJump = (letter: string) => {
    setNameFrom((current) => (current === letter ? null : letter));
    setCurrentPage(1);
  };

  const showJumpRailPreview = (letter: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const primaryHsl = getComputedStyle(document.documentElement)
      .getPropertyValue('--primary')
      .trim();
    setJumpRailPreview({
      letter,
      top: rect.top + rect.height / 2,
      left: rect.right + 10,
      backgroundColor: primaryHsl ? `hsl(${primaryHsl})` : '#00a887'
    });
  };

  const hideJumpRailPreview = () => setJumpRailPreview(null);

  const alphabetJumpKeys = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

  // Handle call button click
  const handleCallClick = async (contact: Contact) => {
    // Check if contact is archived
    if ((contact as any).isArchived) {
      toast({
        title: t('contacts.toast.contact_archived.call_block.title', 'Contact Archived'),
        description: t('contacts.toast.contact_archived.call_block.description', 'Cannot call archived contacts. Please unarchive the contact first.'),
        variant: "destructive",
      });
      return;
    }

    setSelectedContactForCall(contact);
    setIsCallTypeModalOpen(true);
  };

  const handleCallTypeSelected = (selection: CallWizardSelection) => {
    setIsCallTypeModalOpen(false);
    if (selectedContactForCall) {
      initiateContactCallMutation.mutate({
        contactId: selectedContactForCall.id,
        selection,
      });
    }
  };


  const activeFiltersCount = [
    channelFilter !== 'all' ? 1 : 0,
    archivedFilter !== 'active' ? 1 : 0,
    dateFilter !== 'all' ? 1 : 0,
    tagsFilter.length
  ].reduce((a, b) => a + b, 0);

  const handleCopyPhone = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setIsPhoneCopied(true);
      window.setTimeout(() => setIsPhoneCopied(false), 1800);
    } catch {
      setIsPhoneCopied(false);
    }
  };
  
  useQuickAction('create-contact', { open: isAddContactDialogOpen, onOpen: () => setIsAddContactDialogOpen(true) });

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      <Header />
      
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Contacts List */}
          <Tabs value={activeTab} onValueChange={value => { setActiveTab(value as typeof activeTab); setArchivedFilter(value === 'contacts' ? 'active' : value === 'archives' ? 'archived' : 'all'); setCurrentPage(1); }} className={`${selectedContactForDetail ? 'hidden md:flex' : 'flex'} w-full md:w-[350px] lg:w-[380px] bg-card border-r border-border flex-col shrink-0`}>
            {/* Navigation Tabs */}
            <div className="px-4 py-3 border-b border-border">
              <TabsList>
                <TabsTrigger icon={TabIconList} value="all" data-tour="pages-contacts.button.contacts.page.tabs.all">
                  {t('contacts.page.tabs.all', 'All')}
                </TabsTrigger>
                <TabsTrigger icon={TabIconContactRound} value="contacts" data-tour="pages-contacts.button.contacts.page.tabs.contacts">
                  {t('contacts.page.tabs.contacts', 'Contacts')} <span className="tab-count">{totalContacts}</span>
                </TabsTrigger>

                <TabsTrigger value="archives" data-tour="pages-contacts.button.contacts.page.tabs.archives">
                  <Archive className="h-4 w-4 inline mr-1" />
                  {t('contacts.page.tabs.archives', 'Archives')} <span className="tab-count">{archivedContactsCount}</span>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value={activeTab} className="mt-0 flex min-h-0 flex-1 flex-col">

            {/* Action Buttons */}
            <div className="px-4 py-3 border-b border-border flex justify-end space-x-2">
              <Button data-tour="pages-contacts.button.contacts.page.actions.add_contact_aria"
                onClick={() => setIsAddContactDialogOpen(true)}
                size="sm"
                className="flex items-center gap-1"
                aria-label={t('contacts.page.actions.add_contact_aria', 'Add contact')}
                title={t('contacts.page.actions.add_contact_title', 'Add New Contact')}
              >
                <AddContactIcon className="h-4 w-4" size={16} />
              </Button>
              <Button data-tour="pages-contacts.button.contacts.page.actions.import_csv"
                onClick={() => setIsImportDialogOpen(true)}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                aria-label={t('contacts.page.actions.import_csv', 'Import contacts from CSV')}
                 title={t('contacts.page.actions.import_csv', 'Import contacts from CSV')}
              >
                <ImportCsvIcon className="h-4 w-4" size={16} />
              </Button>
              <Button data-tour="pages-contacts.button.common.export"
                onClick={() => setIsExportModalOpen(true)}
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                 title={t('common.export', 'Export')}
              >
                <Download className="h-4 w-4" />
              </Button>
              {hasPermission(PERMISSIONS.MANAGE_CONTACTS) && <WhatsAppContactSyncAction />}
              <Button data-tour="pages-contacts.button.contacts.page.actions.scrape_whatsapp"
                onClick={() => setIsWhatsAppScrapingModalOpen(true)}
                variant="outline"
                size="sm"
                className="flex items-center gap-1 bg-green-500/10 dark:bg-green-500/20 border-green-500/30 dark:border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-500/20 dark:hover:bg-green-500/30"
                title={t('contacts.page.actions.scrape_whatsapp', 'Scrape WhatsApp Contacts')}
              >
                <ScrapeContactsIcon className="h-5 w-5" size={20} />
              </Button>
              <Button data-tour="pages-contacts.button.contacts.page.actions.filters"
                onClick={() => setIsFilterDialogOpen(true)}
                variant="outline"
                size="sm"
                className={`flex items-center gap-1 relative ${
                  activeFiltersCount > 0
                    ? 'bg-primary/10 dark:bg-primary/20 border-primary/30 text-primary dark:text-primary/90'
                    : ''
                }`}
                title={`${t('contacts.page.actions.filters', 'Filters')}${activeFiltersCount > 0 ? t('contacts.page.actions.filters_active_suffix', ' ({{count}} active)', { count: activeFiltersCount }) : ''}`}
              >
                <FilterIcon className="h-5 w-5" size={20} />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 w-4 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center font-medium">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            </div>

            {/* Bulk Actions Toolbar */}
            {selectedContacts.size > 0 && (
              <div className="mx-2 sm:mx-4 mb-3 p-2 bg-primary/10 dark:bg-primary/20 border border-primary/30 rounded-lg">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-medium text-primary dark:text-primary/90 whitespace-nowrap">
                    {selectedContacts.size} <span className="hidden xs:inline">{t('contacts.page.bulk.selected_label', 'selected')}</span>
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
                    <Button data-tour="pages-contacts.button.contacts.page.bulk.segment"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCreateSegmentModalOpen(true)}
                      className="text-xs h-8 px-2 sm:px-3"
                    >
                      <Users className="h-3 w-3 sm:mr-1" />
                      <span className="hidden sm:inline">{t('contacts.page.bulk.segment', 'Segment')}</span>
                    </Button>
                    <Button data-tour="pages-contacts.button.contacts.page.bulk.add_to_segment"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddToSegmentModalOpen(true)}
                      className="text-xs h-8 px-2 sm:px-3"
                    >
                      <UserPlus className="h-3 w-3 sm:mr-1" />
                      <span className="hidden md:inline">{t('contacts.page.bulk.add_to_segment', 'Add to Segment')}</span>
                    </Button>
                    {archivedFilter !== 'archived' ? (
                      <Button data-tour="pages-contacts.button.contacts.page.bulk.archive"
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkArchiveConfirm('archive')}
                        disabled={bulkArchiveMutation.isPending}
                        className="text-xs h-8 px-2 sm:px-3"
                      >
                        {bulkArchiveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3 sm:mr-1" />}
                        <span className="hidden sm:inline">{t('contacts.page.bulk.archive', 'Archive')}</span>
                      </Button>
                    ) : (
                      <Button data-tour="pages-contacts.button.contacts.page.bulk.unarchive"
                        variant="outline"
                        size="sm"
                        onClick={() => handleBulkArchiveConfirm('unarchive')}
                        disabled={bulkArchiveMutation.isPending}
                        className="text-xs h-8 px-2 sm:px-3"
                      >
                        {bulkArchiveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Archive className="h-3 w-3 sm:mr-1" />}
                        <span className="hidden sm:inline">{t('contacts.page.bulk.unarchive', 'Unarchive')}</span>
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleBulkDelete}
                      disabled={isBulkDeleting}
                      className="text-xs h-8 px-2 sm:px-3"
                    >
                      {isBulkDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Search Bar */}
            <div className="px-4 py-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <input data-tour="pages-contacts.input.contacts.page.search.placeholder"
                  type="search"
                  placeholder={t('contacts.page.search.placeholder', 'Search name, phone, email, or @username...')}
                  className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* Select All Checkbox */}
            {contacts.length > 0 && (
              <div className="px-4 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="select-all"
                      checked={selectedContacts.size === contacts.length && contacts.length > 0}
                      onCheckedChange={handleSelectAll}
                      className="h-4 w-4"
                    />
                    <label
                      htmlFor="select-all"
                      className="text-sm font-medium text-foreground cursor-pointer select-none"
                    >
                      {t('contacts.page.select_all.label', 'Select All ({{count}})', { count: contacts.length })}
                    </label>
                  </div>
                  {selectedContacts.size > 0 && (
                    <Button data-tour="pages-contacts.button.contacts.page.select_all.clear"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearSelection}
                      className="text-xs text-muted-foreground hover:text-foreground h-auto py-1 px-2"
                    >
                      {t('contacts.page.select_all.clear', 'Clear Selection')}
                    </Button>
                  )}
                </div>
              </div>
            )}





            {/* Contacts List */}
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 overflow-y-auto min-w-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                      <div className="flex items-center space-x-3 p-3">
                        <div className="h-10 w-10 bg-muted animate-pulse rounded-full"></div>
                        <div className="flex-1">
                          <div className="h-4 bg-muted animate-pulse rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-muted animate-pulse rounded w-1/2"></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : contacts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-2">{t('contacts.page.empty.title', 'No contacts found')}</h3>
                  <p className="text-muted-foreground text-sm">
                    {searchTerm
                      ? t('contacts.page.empty.search_hint', 'Try adjusting your search')
                      : t('contacts.page.empty.start_hint', 'Add your first contact to get started')}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {pinnedIds.length > 0 ? (
                      <div className="px-4 py-2 bg-muted/30 border-b border-border">
                        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                          <Pin className="h-3 w-3" />
                          {t('contacts.page.pinned.label', 'Pinned ({{count}}/{{max}})', { count: pinnedIds.length, max: PINNED_CONTACTS_MAX })}
                        </span>
                      </div>
                    ) : null}
                  {contacts.map((contact) => {
                    const contactId = typeof contact.id === 'string' ? parseInt(contact.id, 10) : contact.id;
                    const isSelected = selectedContacts.has(contactId);
                    const isDetailSelected = selectedContactForDetail?.id === contact.id;
                    
                    return (
                      <div
                        key={contact.id}
                        className={`p-4 hover:bg-accent cursor-pointer transition-colors ${
                          isDetailSelected ? 'bg-primary/10 dark:bg-primary/20 border-r-2 border-primary' : ''
                        } ${isSelected ? 'bg-primary/5 dark:bg-primary/10' : ''} ${
                          (contact as any).isArchived ? 'opacity-60 bg-muted/30' : ''
                        }`}
                        onClick={() => setSelectedContactForDetail(contact)}
                      >
                        <div className="flex items-start space-x-3">
                          <div className="flex-shrink-0 relative">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => handleSelectContact(contactId, checked as boolean)}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute -top-1 -left-1 z-10"
                            />
                            <ContactAvatar
                              contact={contact}
                              size="md"
                              showRefreshButton={false}
                              className="ml-4"
                            />
                            <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-background ${
                              contact.isActive ? 'bg-green-500 dark:bg-green-600' : 'bg-muted'
                            }`}></span>
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <h3 className={`text-sm font-medium truncate ${
                                (contact as any).isArchived ? 'text-muted-foreground' : 'text-foreground'
                              }`}>
                                {contact.name}
                              </h3>
                              {(contact as any).isArchived && (
                                <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
                                  {t('contacts.page.badges.archived', 'Archived')}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="mt-1 flex items-center space-x-2">
                              <div className="flex items-center space-x-1">
                                {contact.identifierType === 'whatsapp' && (
                                  <i className="ri-whatsapp-line text-green-500 dark:text-green-400 text-xs"></i>
                                )}
                                {contact.identifierType === 'messenger' && (
                                  <i className="ri-messenger-line text-blue-500 dark:text-blue-400 text-xs"></i>
                                )}
                                {contact.identifierType === 'instagram' && (
                                  <i className="ri-instagram-line text-pink-500 dark:text-pink-400 text-xs"></i>
                                )}
                                <span className="text-xs text-muted-foreground">
                                  {canViewContactPhone()
                                  ? (contact.phone || formatUsername((contact as any).whatsappUsername) || contact.email || t('contacts.page.no_contact_info', 'No contact info'))
                                  : (contact.phone ? '—' : (formatUsername((contact as any).whatsappUsername) || contact.email || t('contacts.page.no_contact_info', 'No contact info')))}
                                </span>
                              </div>
                            </div>
                            
                            {contact.company && (
                              <p className="mt-1 text-xs text-muted-foreground truncate">
                                {contact.company}
                              </p>
                            )}
                            
                            {contact.tags && contact.tags.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {contact.tags.slice(0, 2).map((tag, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs px-1.5 py-0.5 !bg-muted !text-muted-foreground">
                                    {tag}
                                  </Badge>
                                ))}
                                {contact.tags.length > 2 && (
                                  <Badge variant="outline" className="text-xs px-1.5 py-0.5">
                                    +{contact.tags.length - 2}
                                  </Badge>
                                )}
                              </div>
                            )}
                            <ContactCustomFieldsBadges customFields={contact.customFields} schema={contactCustomFieldsSchema} maxVisible={2} showFileName={false} className="mt-2" />
                            
                            {/* Action Buttons */}
                            <div className="mt-3 flex items-center gap-2">
                              <Button data-tour="pages-contacts.button.contacts.unpin_title"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTogglePin(contactId);
                                }}
                                size="sm"
                                variant={pinnedIds.includes(contactId) ? "secondary" : "ghost"}
                                className={`h-7 w-7 p-0 flex items-center justify-center ${pinnedIds.includes(contactId) ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                                title={pinnedIds.includes(contactId) ? t('contacts.unpin_title', 'Unpin contact') : t('contacts.pin_title', 'Pin contact to top')}
                              >
                                {pinnedIds.includes(contactId) ? (
                                  <PinOff className="h-3 w-3" />
                                ) : (
                                  <Pin className="h-3 w-3" />
                                )}
                              </Button>
                              <Button data-tour="pages-contacts.button.contacts.page.contact_actions.message"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMessageClick(contact);
                                }}
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0 flex items-center justify-center"
                                title={t('contacts.page.contact_actions.message', 'Message')}
                              >
                                <RiChatSmileAiLine className="h-3 w-3" />
                              </Button>
                              {canAccessPipeline() && (
                                <Button data-tour="pages-contacts.button.contacts.page.contact_actions.add_or_edit_deal"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSmartDealClick(contact);
                                  }}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 p-0 flex items-center justify-center"
                                  disabled={smartDealLoadingContactId !== null}
                                  title={t('contacts.page.contact_actions.add_or_edit_deal', 'Add or edit deal')}
                                  aria-label={t('contacts.page.contact_actions.add_or_edit_deal', 'Add or edit deal')}
                                >
                                  {smartDealLoadingContactId === contactId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Briefcase className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                              {showDentalPatientActions && (
                                <Button data-tour="pages-contacts.button.contacts.page.contact_actions.open_patient"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isDentalPatientContact(contact)) {
                                      handleOpenDentalPatient(contact);
                                    } else if (canManageDentalPatients) {
                                      handleMarkAsDentalPatient(contact);
                                    }
                                  }}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 w-7 p-0 flex items-center justify-center"
                                  disabled={
                                    markingPatientContactId === contactId ||
                                    (!isDentalPatientContact(contact) && !canManageDentalPatients)
                                  }
                                  title={
                                    isDentalPatientContact(contact)
                                      ? t('contacts.page.contact_actions.open_patient', 'Open patient')
                                      : t('contacts.page.contact_actions.mark_patient', 'Mark as patient')
                                  }
                                >
                                  {markingPatientContactId === contactId ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <HeartPulse className="h-3 w-3" />
                                  )}
                                </Button>
                              )}
                              <Button data-tour="pages-contacts.button.contacts.page.contact_actions.call"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCallClick(contact);
                                }}
                                size="sm"
                                variant="outline"
                                className="h-7 w-7 p-0 flex items-center justify-center"
                                disabled={initiateContactCallMutation.isPending || !canViewContactPhone()}
                                title={t('contacts.page.contact_actions.call', 'Call')}
                              >
                                {initiateContactCallMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Phone className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-4 border-t border-border">
                  <Pagination 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
              </div>
              <div
                className="w-5 shrink-0 self-stretch py-1 flex flex-col items-center justify-between text-[10px] font-bold leading-none select-none border-l border-border bg-card"
                style={{ fontFamily: 'Roboto, sans-serif' }}
              >
                {alphabetJumpKeys.map((letter) => (
                  <button data-tour="pages-contacts.button.contacts.page.jump_to"
                    key={letter}
                    type="button"
                    className={`w-4 h-4 flex items-center justify-center rounded ${
                      nameFrom === letter
                        ? 'text-primary'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => handleNameJump(letter)}
                    onMouseEnter={(e) => showJumpRailPreview(letter, e.currentTarget)}
                    onMouseLeave={hideJumpRailPreview}
                    onFocus={(e) => showJumpRailPreview(letter, e.currentTarget)}
                    onBlur={hideJumpRailPreview}
                    aria-label={t('contacts.page.jump_to', 'Jump to {{letter}}', { letter })}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>
          </Tabs>

          {jumpRailPreview &&
            createPortal(
              <div
                aria-hidden
                className="pointer-events-none fixed z-[100] flex items-center justify-center rounded-full font-bold"
                style={{
                  top: jumpRailPreview.top,
                  left: jumpRailPreview.left,
                  width: 27,
                  height: 27,
                  transform: 'translateY(-50%)',
                  backgroundColor: jumpRailPreview.backgroundColor,
                  color: '#ffffff',
                  fontFamily: 'Roboto, sans-serif',
                  fontSize: 13,
                  lineHeight: 1,
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.1)'
                }}
              >
                {jumpRailPreview.letter}
              </div>,
              document.body
            )}

          {/* Right Panel - Contact Details */}
          <div className={`${selectedContactForDetail ? 'block' : 'hidden md:block'} flex-1 bg-background overflow-y-auto min-w-0`}>
            {selectedContactForDetail ? (
              <div className="h-full p-3 sm:p-4 lg:p-5 xl:p-6 space-y-4 lg:space-y-5">
                {/* Contact Header */}
                <div className="relative overflow-hidden rounded-xl border border-border bg-card p-4 sm:p-5 lg:p-6 shadow-sm before:absolute before:inset-0 before:pointer-events-none before:bg-[radial-gradient(circle_at_76%_70%,hsl(var(--primary)/0.14),transparent_34%)]">
                  <button data-tour="pages-contacts.button.contacts.page.back_to_contacts" type="button" onClick={() => setSelectedContactForDetail(null)} className="md:hidden relative z-10 mb-4 inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted" aria-label={t('contacts.page.back_to_contacts', 'Back to contacts')}>
                    <ArrowLeft className="h-4 w-4" /> {t('contacts.page.tabs.contacts', 'Contacts')}
                  </button>
                  <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <ContactAvatar
                        contact={selectedContactForDetail}
                        size="lg"
                        showRefreshButton={false}
                        className="ring-1 ring-primary/25 rounded-full"
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h1 className="text-xl sm:text-2xl font-semibold text-foreground truncate">{selectedContactForDetail.name}</h1>
                          {selectedContactForDetail.isActive && !(selectedContactForDetail as any).isArchived && (
                            <Badge className="border-0 bg-primary/10 text-primary hover:bg-primary/10">{t('contacts.page.badges.active', 'Active')}</Badge>
                          )}
                          {(selectedContactForDetail as any).isArchived && (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground shrink-0">
                              <Archive className="h-3 w-3 mr-1" />
                              {t('contacts.page.badges.archived', 'Archived')}
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-sm sm:text-base text-foreground">
                          <span className="truncate">{canViewContactPhone() ? (selectedContactForDetail.phone || '—') : '—'}</span>
                          {selectedContactForDetail.identifierType === 'whatsapp' && <i className="ri-whatsapp-line text-primary"></i>}
                          {selectedContactForDetail.phone && canViewContactPhone() && (
                            <button data-tour="pages-contacts.button.contacts.page.phone_copied" type="button" className={isPhoneCopied ? 'text-primary' : 'text-muted-foreground hover:text-foreground'} onClick={() => handleCopyPhone(selectedContactForDetail.phone || '')} aria-label={isPhoneCopied ? t('contacts.page.phone_copied', 'Phone number copied') : t('contacts.page.copy_phone', 'Copy phone number')} title={isPhoneCopied ? t('contacts.page.phone_copied', 'Phone number copied') : t('contacts.page.copy_phone', 'Copy phone number')}>
                              {isPhoneCopied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 xl:max-w-[390px] xl:justify-end text-[11px] text-muted-foreground">
                      <span className="rounded-full border border-border bg-background/60 px-2 py-1">{t('contacts.page.detail.channel_type', 'Channel Type')}: <b className="font-medium text-primary">{formatChannelTypeLabel(selectedContactForDetail.identifierType)}</b></span>
                      {selectedContactForDetail.identifier && <span className="rounded-full border border-border bg-background/60 px-2 py-1">{t('contacts.page.detail.channel_identifier', 'Channel Identifier')}: {selectedContactForDetail.identifier}</span>}
                    </div>
                  </div>
                  <div className="relative z-10 mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                          <Button data-tour="pages-contacts.button.contacts.page.contact_actions.open_whatsapp_conversation"
                            onClick={() => handleMessageClick(selectedContactForDetail)}
                            size="sm"
                            className="h-10 w-10 p-0"
                            title={t('contacts.page.contact_actions.open_whatsapp_conversation', 'Open WhatsApp conversation')}
                            aria-label={t('contacts.page.contact_actions.open_whatsapp_conversation', 'Open WhatsApp conversation')}
                          >
                            <i className="ri-whatsapp-line text-lg" />
                          </Button>
                          <Button data-tour="pages-contacts.button.contacts.page.contact_actions.call"
                            onClick={() => handleCallClick(selectedContactForDetail)}
                            size="sm"
                            className="h-10 w-10 p-0 flex items-center justify-center shrink-0"
                            disabled={initiateContactCallMutation.isPending || !canViewContactPhone()}
                            title={t('contacts.page.contact_actions.call', 'Call')}
                            aria-label={t('contacts.page.contact_actions.call', 'Call')}
                          >
                            {initiateContactCallMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Phone className="h-4 w-4" />
                            )}
                          </Button>
                          <Button data-tour="pages-contacts.button.contacts.page.contact_actions.schedule_appointment"
                            onClick={() => handleScheduleAppointment(selectedContactForDetail)}
                            variant="outline"
                            size="sm"
                            className="h-10 w-10 p-0 flex items-center justify-center shrink-0"
                            title={t('contacts.page.contact_actions.schedule_appointment', 'Schedule Appointment')}
                            aria-label={t('contacts.page.contact_actions.schedule_appointment', 'Schedule Appointment')}
                          >
                            <Calendar className="h-4 w-4" />
                          </Button>

                          {canCreateQuotation && (
                            <Button data-tour="pages-contacts.button.contacts.sales.createQuotation"
                              onClick={() => setIsQuotationDialogOpen(true)}
                              variant="outline"
                              size="sm"
                              className="h-10 flex items-center gap-2 shrink-0"
                              disabled={Boolean((selectedContactForDetail as any).isArchived)}
                              title={t('contacts.sales.createQuotation', 'Create quotation')}
                            >
                              <FileText className="h-4 w-4" />
                              <span className="hidden sm:inline">{t('contacts.sales.createQuotation', 'Create quotation')}</span>
                            </Button>
                          )}

                          {showDentalPatientActions && (
                            <Button data-tour="pages-contacts.button.contacts.page.contact_actions.open_patient"
                              onClick={() => {
                                if (isDentalPatientContact(selectedContactForDetail)) {
                                  handleOpenDentalPatient(selectedContactForDetail);
                                } else if (canManageDentalPatients) {
                                  handleMarkAsDentalPatient(selectedContactForDetail);
                                }
                              }}
                              variant="outline"
                              size="sm"
                              className="h-10 flex items-center gap-2 shrink-0"
                              disabled={
                                markingPatientContactId === selectedContactForDetail.id ||
                                (!isDentalPatientContact(selectedContactForDetail) && !canManageDentalPatients)
                              }
                            >
                              {markingPatientContactId === selectedContactForDetail.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <HeartPulse className="h-4 w-4" />
                              )}
                              <span className="hidden sm:inline">
                                {isDentalPatientContact(selectedContactForDetail)
                                  ? t('contacts.page.contact_actions.open_patient', 'Open patient')
                                  : t('contacts.page.contact_actions.mark_patient', 'Mark as patient')}
                              </span>
                            </Button>
                          )}

                          {(selectedContactForDetail as any).isArchived ? (
                            <Button data-tour="pages-contacts.button.contacts.page.contact_actions.unarchive"
                              variant="outline"
                              size="sm"
                              className="h-10 flex items-center gap-2 shrink-0"
                              onClick={() => unarchiveContactMutation.mutate(selectedContactForDetail.id)}
                              disabled={unarchiveContactMutation.isPending}
                            >
                              {unarchiveContactMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                              {t('contacts.page.contact_actions.unarchive', 'Unarchive')}
                            </Button>
                          ) : (
                            <Button data-tour="pages-contacts.button.contacts.page.contact_actions.archive"
                              variant="outline"
                              size="sm"
                              className="flex items-center gap-2 shrink-0"
                              onClick={() => handleArchiveContact(selectedContactForDetail.id)}
                              disabled={archiveContactMutation.isPending}
                            >
                              {archiveContactMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                              {t('contacts.page.contact_actions.archive', 'Archive')}
                            </Button>
                          )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button data-tour="pages-contacts.button.contacts.unpin_title"
                        variant={pinnedIds.includes(selectedContactForDetail.id) ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => handleTogglePin(selectedContactForDetail.id)}
                        className={`h-9 w-9 p-0 shrink-0 ${pinnedIds.includes(selectedContactForDetail.id) ? 'text-primary' : 'text-foreground border-border hover:bg-muted/50 dark:hover:bg-muted/50'}`}
                        title={pinnedIds.includes(selectedContactForDetail.id) ? t('contacts.unpin_title', 'Unpin contact') : t('contacts.pin_title', 'Pin contact to top')}
                      >
                        {pinnedIds.includes(selectedContactForDetail.id) ? (
                          <PinOff className="h-4 w-4" />
                        ) : (
                          <Pin className="h-4 w-4" />
                        )}
                      </Button>
                      <Button data-tour="pages-contacts.button.contacts.page.contact_actions.edit"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditContact(selectedContactForDetail)}
                        className="h-9 w-9 p-0 text-foreground border-border hover:bg-muted/50 dark:hover:bg-muted/50 shrink-0"
                        title={t('contacts.page.contact_actions.edit', 'Edit contact')}
                      >
                        <i className="ri-edit-line h-4 w-4" />
                      </Button>
                      <Button data-tour="pages-contacts.button.contacts.page.contact_actions.delete"
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDeleteContact(selectedContactForDetail.id)}
                        className="h-9 w-9 p-0 shrink-0"
                        title={t('contacts.page.contact_actions.delete', 'Delete contact')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    </div>
                  </div>
                {/* Contact Details */}
                <div className="space-y-4 sm:space-y-5">


                  {/* Contact Information */}
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <section className="flex max-h-[360px] flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <h3 className="flex items-center gap-2 text-base sm:text-lg font-medium text-foreground shrink-0">
                        <Phone className="h-5 w-5 text-muted-foreground" /> {t('contacts.page.detail.contact_information', 'Contact Information')}
                      </h3>
                    </div>
                    <div className="compact-scrollbar grid min-h-0 grid-cols-1 gap-4 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                      <div className="flex items-center gap-3 p-3 sm:p-4 rounded-lg bg-muted/30 dark:bg-muted/20 border border-border">
                        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <Label className="text-sm font-medium text-foreground">{t('contacts.page.detail.phone', 'Phone')}</Label>
                          <p className="text-sm text-foreground truncate">
                            {canViewContactPhone()
                              ? (selectedContactForDetail.phone || '—')
                              : '—'}
                          </p>
                        </div>
                      </div>
                      {(selectedContactForDetail as any).whatsappUsername && (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 dark:bg-muted/20 border border-transparent">
                          <AtSign className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <Label className="text-sm font-medium text-foreground">{t('contacts.page.detail.whatsapp_username', 'WhatsApp Username')}</Label>
                            <p className="text-sm text-foreground truncate">{formatUsername((selectedContactForDetail as any).whatsappUsername)}</p>
                          </div>
                        </div>
                      )}
                      {selectedContactForDetail.email && (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 dark:bg-muted/20 border border-transparent">
                          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <Label className="text-sm font-medium text-foreground">{t('contacts.page.detail.email', 'Email')}</Label>
                            <p className="text-sm text-foreground truncate">{selectedContactForDetail.email}</p>
                          </div>
                        </div>
                      )}
                      {selectedContactForDetail.company && (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 dark:bg-muted/20 border border-transparent">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <Label className="text-sm font-medium text-foreground">{t('contacts.page.detail.company', 'Company')}</Label>
                            <p className="text-sm text-foreground truncate">{selectedContactForDetail.company}</p>
                          </div>
                        </div>
                      )}
                      {Object.entries(selectedContactForDetail.customFields || {})
                        .filter(([fieldName, value]) => {
                          const schemaField = contactCustomFieldsSchema.find((field: any) => field.fieldName === fieldName);
                          if (!schemaField) return false;
                          if (schemaField.fieldType === 'file_select') return isCustomFieldFileReference(value);
                          return value !== undefined && value !== null && value !== '' && (!Array.isArray(value) || value.length > 0);
                        })
                        .map(([fieldName, value]) => {
                          const schemaField = contactCustomFieldsSchema.find((field: any) => field.fieldName === fieldName);
                          const fileReference = schemaField?.fieldType === 'file_select' && isCustomFieldFileReference(value)
                            ? value
                            : null;
                          return (
                            <div key={fieldName} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 dark:bg-muted/20 border border-transparent">
                              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                {fileReference ? (
                                  <a
                                    href={fileReference.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block truncate text-sm font-medium text-primary hover:underline"
                                    title={t('contacts.page.detail.open_custom_field_file', 'Open {{field}} file', {
                                      field: schemaField?.fieldLabel || formatCustomFieldName(fieldName),
                                    })}
                                  >
                                    {schemaField?.fieldLabel || formatCustomFieldName(fieldName)}
                                  </a>
                                ) : (
                                  <>
                                    <Label className="text-sm font-medium text-foreground">{schemaField?.fieldLabel || formatCustomFieldName(fieldName)}</Label>
                                    <p className="text-sm text-foreground break-words">{formatCustomFieldValue(value, schemaField)}</p>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </section>

                  {/* Assigned Agent */}
                  <section className="flex max-h-[360px] flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5 shadow-sm">
                    <h3 className="flex items-center gap-2 text-base sm:text-lg font-medium text-foreground"><Users className="h-5 w-5 text-muted-foreground" />{t('contacts.page.detail.agents', 'Agents')}</h3>
                    <div className="compact-scrollbar min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                      <AgentDisplay
                        assignedAgent={assignedAgentData?.assignedAgent || null}
                        isLoading={isLoadingAssignedAgent}
                        conversationId={assignedAgentData?.conversationId}
                        assignedAt={assignedAgentData?.assignedAt}
                        variant="full"
                      />
                    </div>
                  </section>
                  </div>
                 

                  {/* Navigation Tabs */}
                  <Tabs value={contactDetailTab} onValueChange={value => setContactDetailTab(value as typeof contactDetailTab)} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                    <TabsList>
                      <TabsTrigger icon={TabIconFolderOpen} value="dossier" data-tour="pages-contacts.button.contacts.page.detail_tabs.file">
                        {t('contacts.page.detail_tabs.file', 'File')}
                      </TabsTrigger>
                      <TabsTrigger icon={TabIconHistory} value="historique" data-tour="pages-contacts.button.contacts.page.detail_tabs.history">
                        {t('contacts.page.detail_tabs.history', 'History')}
                      </TabsTrigger>

                      <TabsTrigger icon={TabIconListTodo} value="tasks" data-tour="pages-contacts.button.contacts.page.detail_tabs.tasks">
                        {t('contacts.page.detail_tabs.tasks', 'Tasks')}
                      </TabsTrigger>

                      {canViewContactSales && (
                        <TabsTrigger icon={TabIconShoppingCart} value="sales" data-tour="pages-contacts.button.contacts.page.detail_tabs.sales">
                          {t('contacts.page.detail_tabs.sales', 'Sales')}
                        </TabsTrigger>
                      )}


                    </TabsList>

                  {/* Tab Content */}
                  <div className="space-y-4 p-4 sm:p-5">
                    {contactDetailTab === 'dossier' && (
                      <TabsContent value="dossier" className="space-y-6">
                        {/* Unified Document Upload */}
                        <div className="space-y-4">
                          <div className="flex flex-col gap-4">
                           <div className="flex flex-col items-center gap-3 p-3 sm:flex-row sm:p-4 border border-dashed border-primary/35 rounded-xl hover:border-primary/60 transition-colors bg-primary/[0.03] text-center sm:text-left">
                              <div className="p-2.5 bg-primary/10 dark:bg-primary/20 rounded-lg shrink-0">
                                <CloudUpload className="h-5 w-5 text-primary" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-medium text-foreground">{t('contacts.page.documents.upload_title', 'Upload Document')}</h4>
                                <p className="text-xs text-muted-foreground">
                                  {t('contacts.page.documents.upload_desc', 'Add documents with category and description')}
                                </p>
                              </div>
                            <Button data-tour="pages-contacts.button.contacts.page.documents.uploading"
                              variant="outline"
                              size="default"
                              className="h-9 w-full sm:w-auto shrink-0 px-4"
                              disabled={isUploadingDocument}
                              onClick={() => setIsDocumentUploadModalOpen(true)}
                            >
                              <FileText className="h-4 w-4 mr-2" />
                              {isUploadingDocument
                                ? t('contacts.page.documents.uploading', 'Uploading...')
                                : t('contacts.page.documents.browse_files', 'Browse Files')}
                            </Button>
                           </div>

                        {/* Uploaded Documents */}
                        <div className="flex-[1.45] rounded-xl border border-border p-3 sm:p-4 min-w-0">
                          <div className="flex items-center justify-between pb-3">
                            <h4 className="text-sm font-medium text-foreground">{t('contacts.page.documents.uploaded_documents', 'Uploaded Documents')}</h4>
                            <span className="text-xs text-muted-foreground">
                              {t('contacts.page.documents.files_count', '{{count}} files', { count: contactDocuments.length })}
                            </span>
                          </div>

                          <div className="compact-scrollbar space-y-3 max-h-[calc(55vh-3rem)] lg:max-h-[560px] overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                          {contactDocuments.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <FileText className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
                              <p className="text-sm">{t('contacts.page.documents.empty', 'No documents uploaded yet')}</p>
                            </div>
                          ) : (
                            contactDocuments.map((document: any) => {
                              const customFieldLabel = document.source === 'custom_field_attachment'
                                ? contactCustomFieldsSchema.find((field: any) => {
                                    const reference = selectedContactForDetail.customFields?.[field.fieldName];
                                    return isCustomFieldFileReference(reference) &&
                                      reference.source === 'custom_field_attachment' &&
                                      reference.id === Number(document.id);
                                  })?.fieldLabel
                                : null;
                              const getCategoryColor = (category: string) => {
                                switch (category) {
                                  case 'identity': return 'bg-primary/10 dark:bg-primary/20 text-primary';
                                  case 'address_proof': return 'bg-green-500/10 dark:bg-green-500/20 text-green-600 dark:text-green-500';
                                  case 'income': return 'bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-500';
                                  case 'general': return 'bg-muted text-muted-foreground';
                                  default: return 'bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-500'; // For custom categories
                                }
                              };

                              const getCategoryLabel = (category: string) => {
                                switch (category) {
                                  case 'identity':
                                    return t('contacts.page.documents.category.identity', 'Identity Document');
                                  case 'address_proof':
                                    return t('contacts.page.documents.category.address_proof', 'Address Proof');
                                  case 'income':
                                    return t('contacts.page.documents.category.income', 'Income Verification');
                                  case 'general':
                                    return t('contacts.page.documents.category.general', 'General');
                                  case 'xray':
                                    return t('erp.dental.clinical.category.xray', 'X-ray');
                                  case 'cbct':
                                    return t('erp.dental.clinical.category.cbct', 'CBCT');
                                  case 'intraoral':
                                    return t('erp.dental.clinical.category.intraoral', 'Intraoral photo');
                                  case 'consent':
                                    return t('erp.dental.clinical.category.consent', 'Consent');
                                  case 'clinical_report':
                                    return t('erp.dental.clinical.category.clinicalReport', 'Clinical report');
                                  case 'before_after':
                                    return t('erp.dental.clinical.category.beforeAfter', 'Before / after');
                                  case 'custom_field':
                                    return customFieldLabel || t('contacts.page.documents.category.customField', 'Contact custom field');
                                  default: return category.charAt(0).toUpperCase() + category.slice(1); // Capitalize custom categories
                                }
                              };

                              const formatFileSize = (bytes: number) => {
                                if (bytes < 1024) return bytes + ' bytes';
                                if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                                return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
                              };

                              return (
                                <Card key={`${document.source ?? 'contact_document'}:${document.id}`} className="p-4 bg-card border-border text-card-foreground">
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                      <div className={`p-2 rounded shrink-0 ${getCategoryColor(document.category)}`}>
                                        <FileText className="h-4 w-4" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2 mb-1">
                                          <p className="text-sm font-medium text-foreground truncate">{document.originalName}</p>
                                          <Badge variant="secondary" className={`${getCategoryColor(document.category)} text-xs shrink-0`}>
                                            {getCategoryLabel(document.category)}
                                          </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-1">
                                          {formatDistanceToNow(new Date(document.createdAt), { addSuffix: true })} • {formatFileSize(document.fileSize)}
                                        </p>
                                        {document.description && (
                                          <p className="text-xs text-muted-foreground bg-muted/30 dark:bg-muted/20 rounded px-2 py-1 mt-2">
                                            {document.source === 'custom_field_attachment'
                                              ? t('custom_fields.file.attachment_description', 'Custom field attachment')
                                              : document.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => window.open(document.fileUrl, '_blank')}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button data-tour="pages-contacts.button.contacts.page.documents.download_title"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDocumentDownload(document)}
                                        disabled={downloadingDocuments.has(document.id.toString())}
                                        title={t('contacts.page.documents.download_title', 'Download {{name}}', { name: document.originalName })}
                                      >
                                        {downloadingDocuments.has(document.id.toString()) ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Download className="h-4 w-4" />
                                        )}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive/80"
                                        onClick={() => handleDocumentDelete(document.id.toString(), document.source, document.originalName)}
                                        disabled={deleteDocumentMutation.isPending}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                </Card>
                              );
                            })
                          )}
                          </div>
                        </div></div>


                      </div>
                      </TabsContent>
                    )}

                    {contactDetailTab === 'historique' && (
                      <TabsContent value="historique" className="space-y-4 sm:space-y-6">
                        {/* Filter Options */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <h4 className="text-sm font-medium text-foreground">{t('contacts.page.activity.title', 'Activity Timeline')}</h4>
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Select defaultValue="all">
                              <SelectTrigger className="h-8 w-full sm:w-32 text-xs bg-background border-border text-foreground">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t('contacts.page.activity.filter_all', 'All Activities')}</SelectItem>
                                <SelectItem value="messages">{t('contacts.page.activity.filter_messages', 'Messages')}</SelectItem>
                                <SelectItem value="calls">{t('contacts.page.activity.filter_calls', 'Calls')}</SelectItem>
                                <SelectItem value="meetings">{t('contacts.page.activity.filter_meetings', 'Meetings')}</SelectItem>
                                <SelectItem value="documents">{t('contacts.page.activity.filter_documents', 'Documents')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Timeline */}
                        <div className="compact-scrollbar max-h-[55vh] lg:max-h-[560px] overflow-y-auto pr-1 [scrollbar-gutter:stable]">
                          <AuditLogTimeline
                            logs={contactActivity}
                            isLoading={isLoadingAuditLogs}
                          />
                        </div>
                      </TabsContent>
                    )}

                    {contactDetailTab === 'sales' && canViewContactSales && (
                      <ContactSalesTimeline
                        contactId={Number(selectedContactForDetail.id)}
                        archived={Boolean((selectedContactForDetail as any).isArchived)}
                        onCreateQuotation={() => setIsQuotationDialogOpen(true)}
                        onSendQuotation={setQuotationSendTarget}
                      />
                    )}

                    {contactDetailTab === 'tasks' && (
                      <TabsContent value="tasks" className="space-y-4 sm:space-y-6">
                        {/* Tasks Header */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <h4 className="text-sm font-medium text-foreground">{t('contacts.page.tasks.title', 'Task Management')}</h4>
                            <p className="text-xs text-muted-foreground mt-1">{t('contacts.page.tasks.description', 'Track and manage tasks for this contact')}</p>
                          </div>
                          <Button data-tour="pages-contacts.button.contacts.page.tasks.new_task_button"
                            size="sm"
                            className="flex items-center gap-2 w-full sm:w-auto shrink-0"
                            onClick={() => setIsCreateTaskModalOpen(true)}
                          >
                            <Plus className="h-4 w-4" />
                            {t('contacts.page.tasks.new_task_button', 'New Task')}
                          </Button>
                        </div>

                        {/* Task Filters and Search */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-1 sm:flex-wrap min-w-0">
                            <div className="relative flex-1 min-w-0 w-full sm:max-w-sm">
                              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                              <input data-tour="pages-contacts.input.contacts.page.tasks.search_placeholder"
                                type="search"
                                placeholder={t('contacts.page.tasks.search_placeholder', 'Search tasks...')}
                                className="w-full pl-10 pr-4 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent bg-background text-foreground placeholder:text-muted-foreground"
                                value={taskSearchTerm}
                                onChange={(e) => setTaskSearchTerm(e.target.value)}
                              />
                            </div>
                            <Select value={taskStatusFilter} onValueChange={setTaskStatusFilter}>
                              <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.page.tasks.select_placeholder.status" className="w-full sm:w-32 h-9 bg-background border-border text-foreground">
                                <SelectValue placeholder={t('contacts.page.tasks.select_placeholder.status', 'Status')} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t('contacts.page.tasks.select_all.status', 'All Status')}</SelectItem>
                                <SelectItem value="not_started">{t('contacts.page.tasks.status.not_started', 'Not Started')}</SelectItem>
                                <SelectItem value="in_progress">{t('contacts.page.tasks.status.in_progress', 'In Progress')}</SelectItem>
                                <SelectItem value="completed">{t('contacts.page.tasks.status.completed', 'Completed')}</SelectItem>
                                <SelectItem value="cancelled">{t('contacts.page.tasks.status.cancelled', 'Cancelled')}</SelectItem>
                              </SelectContent>
                            </Select>
                            <Select value={taskPriorityFilter} onValueChange={setTaskPriorityFilter}>
                              <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.page.tasks.select_placeholder.priority" className="w-full sm:w-32 h-9 bg-background border-border text-foreground">
                                <SelectValue placeholder={t('contacts.page.tasks.select_placeholder.priority', 'Priority')} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="all">{t('contacts.page.tasks.select_all.priority', 'All Priority')}</SelectItem>
                                <SelectItem value="low">{t('contacts.page.tasks.priority.low', 'Low')}</SelectItem>
                                <SelectItem value="medium">{t('contacts.page.tasks.priority.medium', 'Medium')}</SelectItem>
                                <SelectItem value="high">{t('contacts.page.tasks.priority.high', 'High')}</SelectItem>
                                <SelectItem value="urgent">{t('contacts.page.tasks.priority.urgent', 'Urgent')}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button data-tour="pages-contacts.button.contacts.page.tasks.sort"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setTaskSortOrder(taskSortOrder === 'asc' ? 'desc' : 'asc');
                              }}
                              className="flex items-center gap-1 border-border text-foreground hover:bg-muted/50 dark:hover:bg-muted/50"
                            >
                              {taskSortOrder === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                              {t('contacts.page.tasks.sort', 'Sort')}
                            </Button>
                          </div>
                        </div>

                        {/* Bulk Actions */}
                        {selectedTasks.size > 0 && (
                          <div className="p-3 bg-primary/10 dark:bg-primary/20 border border-primary/30 dark:border-primary/30 rounded-lg">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <span className="text-sm font-medium text-primary dark:text-primary">
                                {selectedTasks.size}{' '}
                                {selectedTasks.size > 1
                                  ? t('contacts.page.tasks.task_plural', 'tasks')
                                  : t('contacts.page.tasks.task_singular', 'task')}{' '}
                                {t('contacts.page.bulk.selected_label', 'selected')}
                              </span>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Select
                                  onValueChange={(value) => {
                                    if (value && selectedContactForDetail) {
                                      bulkUpdateTasksMutation.mutate({
                                        contactId: selectedContactForDetail.id,
                                        taskIds: Array.from(selectedTasks),
                                        updates: { status: value }
                                      });
                                    }
                                  }}
                                >
                                  <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.page.tasks.update_status_placeholder" className="w-full sm:w-32 h-8 text-xs bg-background border-border text-foreground">
                                    <SelectValue placeholder={t('contacts.page.tasks.update_status_placeholder', 'Update Status')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="not_started">{t('contacts.page.tasks.status.not_started', 'Not Started')}</SelectItem>
                                    <SelectItem value="in_progress">{t('contacts.page.tasks.status.in_progress', 'In Progress')}</SelectItem>
                                    <SelectItem value="completed">{t('contacts.page.tasks.status.completed', 'Completed')}</SelectItem>
                                    <SelectItem value="cancelled">{t('contacts.page.tasks.status.cancelled', 'Cancelled')}</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button data-tour="pages-contacts.button.contacts.page.tasks.clear_button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedTasks(new Set())}
                                  className="text-xs border-border text-foreground hover:bg-muted/50 dark:hover:bg-muted/50"
                                >
                                  {t('contacts.page.tasks.clear_button', 'Clear')}
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Task List */}
                        <div className="space-y-3">
                          {isLoadingTasks ? (
                            <div className="flex items-center justify-center py-8">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : contactTasks.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                              <CheckSquare className="h-12 w-12 mx-auto mb-2 text-muted-foreground/50" />
                              <p className="text-sm">{t('contacts.page.tasks.empty.title', 'No tasks found')}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {t('contacts.page.tasks.empty.description', 'Create a new task to get started')}
                              </p>
                            </div>
                          ) : (
                            (() => {

                              const sortedTasks = [...contactTasks].sort((a, b) => {
                                let aValue, bValue;
                                switch (taskSortBy) {
                                  case 'dueDate':
                                    aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
                                    bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
                                    break;
                                  case 'priority':
                                    const priorityOrder = { urgent: 4, high: 3, medium: 2, low: 1 };
                                    aValue = priorityOrder[a.priority as keyof typeof priorityOrder] || 0;
                                    bValue = priorityOrder[b.priority as keyof typeof priorityOrder] || 0;
                                    break;
                                  case 'status':
                                    aValue = a.status;
                                    bValue = b.status;
                                    break;
                                  default:
                                    aValue = new Date(a.createdAt).getTime();
                                    bValue = new Date(b.createdAt).getTime();
                                }

                                if (taskSortOrder === 'asc') {
                                  return aValue > bValue ? 1 : -1;
                                } else {
                                  return aValue < bValue ? 1 : -1;
                                }
                              });

                              return sortedTasks.map((task: any) => {
                                const isSelected = selectedTasks.has(task.id);
                                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'completed';
                                const isDueToday = task.dueDate && new Date(task.dueDate).toDateString() === new Date().toDateString();

                                const getPriorityColor = (priority: string) => {
                                  switch (priority) {
                                    case 'urgent': return 'bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30';
                                    case 'high': return 'bg-orange-500/10 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30';
                                    case 'medium': return 'bg-yellow-500/10 dark:bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30';
                                    case 'low': return 'bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30';
                                    default: return 'bg-muted text-foreground/90 border-border';
                                  }
                                };

                                const getStatusColor = (status: string) => {
                                  switch (status) {
                                    case 'completed': return 'bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400';
                                    case 'in_progress': return 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/90';
                                    case 'cancelled': return 'bg-muted text-foreground/90';
                                    default: return 'bg-muted text-muted-foreground';
                                  }
                                };

                                const getStatusIcon = (status: string) => {
                                  switch (status) {
                                    case 'completed': return <CheckSquare className="h-4 w-4 text-green-600 dark:text-green-400" />;
                                    case 'in_progress': return <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
                                    case 'cancelled': return <X className="h-4 w-4 text-muted-foreground" />;
                                    default: return <Square className="h-4 w-4 text-muted-foreground/70" />;
                                  }
                                };

                                return (
                                  <Card key={task.id} className={`p-4 transition-colors bg-card border-border text-card-foreground ${
                                    isSelected ? 'bg-primary/10 dark:bg-primary/20 border-primary/30 dark:border-primary/30' : ''
                                  } ${isOverdue ? 'border-l-4 border-l-red-500 dark:border-l-red-400' : ''}`}>
                                    <div className="flex items-start gap-3">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          const newSelected = new Set(selectedTasks);
                                          if (checked) {
                                            newSelected.add(task.id);
                                          } else {
                                            newSelected.delete(task.id);
                                          }
                                          setSelectedTasks(newSelected);
                                        }}
                                        className="mt-1 shrink-0"
                                      />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                          <div className="flex-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                              {getStatusIcon(task.status)}
                                              <h5 className="text-sm font-medium text-foreground truncate">
                                                {task.title}
                                              </h5>
                                              {isOverdue && (
                                                <Badge variant="destructive" className="text-xs shrink-0">
                                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                                  {t('contacts.page.tasks.badges.overdue', 'Overdue')}
                                                </Badge>
                                              )}
                                              {isDueToday && !isOverdue && (
                                                <Badge variant="secondary" className="bg-orange-100 dark:bg-orange-900/20 text-orange-800 dark:text-orange-400 text-xs shrink-0">
                                                  {t('contacts.page.tasks.badges.due_today', 'Due Today')}
                                                </Badge>
                                              )}
                                            </div>
                                            {task.description && (
                                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                {task.description}
                                              </p>
                                            )}
                                            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2">
                                              <Badge variant="outline" className={`text-xs shrink-0 ${getPriorityColor(task.priority)}`}>
                                                <Flag className="h-3 w-3 mr-1" />
                                                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                                              </Badge>
                                              <Badge variant="secondary" className={`${getStatusColor(task.status)} text-xs shrink-0`}>
                                                {task.status.replace('_', ' ').charAt(0).toUpperCase() + task.status.replace('_', ' ').slice(1)}
                                              </Badge>
                                              {task.dueDate && (
                                                <span className="text-xs text-muted-foreground flex items-center shrink-0">
                                                  <Calendar className="h-3 w-3 mr-1" />
                                                  {new Date(task.dueDate).toLocaleDateString()}
                                                </span>
                                              )}
                                              {task.assignedTo && (
                                                <span className="text-xs text-muted-foreground flex items-center shrink-0">
                                                  <User className="h-3 w-3 mr-1" />
                                                  {task.assignedTo}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="text-foreground hover:bg-muted/50 dark:hover:bg-muted/50"
                                              onClick={() => {
                                                setSelectedTask(task);
                                                setTaskForm({
                                                  title: task.title,
                                                  description: task.description || '',
                                                  priority: task.priority,
                                                  status: task.status,
                                                  dueDate: task.dueDate ? task.dueDate.split('T')[0] : '',
                                                  assignedTo: task.assignedTo || '',
                                                  category: task.category || '',
                                                  tags: task.tags || []
                                                });
                                                setIsEditTaskModalOpen(true);
                                              }}
                                            >
                                              <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button data-tour="pages-contacts.button.contacts.page.tasks.delete_confirm"
                                              variant="ghost"
                                              size="sm"
                                              className="text-destructive hover:text-destructive/80 hover:bg-destructive/10 dark:hover:bg-destructive/20"
                                              onClick={() => {
                                                if (
                                                  selectedContactForDetail &&
                                                  window.confirm(
                                                    t('contacts.page.tasks.delete_confirm', 'Are you sure you want to delete this task?')
                                                  )
                                                ) {
                                                  deleteTaskMutation.mutate({
                                                    contactId: selectedContactForDetail.id,
                                                    taskId: task.id
                                                  });
                                                }
                                              }}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </Card>
                                );
                              });
                            })()
                          )}
                        </div>

                        {/* Task Statistics */}
                        {contactTasks.length > 0 && (
                          <Card className="p-4 bg-muted/50 dark:bg-muted/30 border-border text-foreground">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{t('contacts.page.tasks.summary', 'Task Summary')}</p>
                                <div className="flex flex-wrap gap-4 sm:gap-6 mt-2">
                                  <div className="text-center min-w-[4rem]">
                                    <p className="text-lg font-bold text-foreground">{contactTasks.length}</p>
                                    <p className="text-xs text-muted-foreground">{t('contacts.page.tasks.summary.total', 'Total')}</p>
                                  </div>
                                  <div className="text-center min-w-[4rem]">
                                    <p className="text-lg font-bold text-green-600 dark:text-green-400">
                                      {contactTasks.filter((t: any) => t.status === 'completed').length}
                                    </p>
                                    <p className="text-xs text-green-600 dark:text-green-400">{t('contacts.page.tasks.summary.completed', 'Completed')}</p>
                                  </div>
                                  <div className="text-center min-w-[4rem]">
                                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                                      {contactTasks.filter((t: any) => t.status === 'in_progress').length}
                                    </p>
                                    <p className="text-xs text-blue-600 dark:text-blue-400">{t('contacts.page.tasks.summary.in_progress', 'In Progress')}</p>
                                  </div>
                                  <div className="text-center min-w-[4rem]">
                                    <p className="text-lg font-bold text-red-600 dark:text-red-400">
                                      {contactTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'completed').length}
                                    </p>
                                    <p className="text-xs text-red-600 dark:text-red-400">{t('contacts.page.tasks.summary.overdue', 'Overdue')}</p>
                                  </div>
                                </div>
                              </div>
                              <div className="text-left sm:text-right shrink-0">
                                <div className="text-sm text-muted-foreground">
                                  {t('contacts.page.tasks.completion_rate', 'Completion Rate')}
                                </div>
                                <div className="text-2xl font-bold text-foreground">
                                  {contactTasks.length > 0
                                    ? Math.round((contactTasks.filter((t: any) => t.status === 'completed').length / contactTasks.length) * 100)
                                    : 0}%
                                </div>
                              </div>
                            </div>
                          </Card>
                        )}
                      </TabsContent>
                    )}

                  </div>
                </Tabs>
              </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full min-h-[200px] p-4">
                <div className="text-center max-w-sm">
                  <Users className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mx-auto mb-3 sm:mb-4" />
                  <h3 className="text-base sm:text-lg font-medium text-foreground mb-2">{t('contacts.page.detail.empty.title', 'Select a contact')}</h3>
                  <p className="text-sm text-muted-foreground">{t('contacts.page.detail.empty.description', 'Choose a contact from the list to view details')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>


      
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        setIsDeleteDialogOpen(open);
        if (!open) setForceSingleDelete(false);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('contacts.delete_contact', 'Delete Contact')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('contacts.delete_warning', 'This will permanently delete this contact and all associated conversations, messages, and notes. This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {canForceDeleteContacts && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <Checkbox
                id="force-single-contact-delete"
                checked={forceSingleDelete}
                onCheckedChange={(checked) => setForceSingleDelete(checked === true)}
              />
              <Label htmlFor="force-single-contact-delete" className="font-normal leading-5 cursor-pointer">
                {t('contacts.force_delete.confirm', 'Force delete related patient records, clinical history, billing data, appointments, documents, and media.')}
              </Label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={documentPendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !deleteDocumentMutation.isPending) setDocumentPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('contacts.page.documents.delete_confirm_title', 'Delete document?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'contacts.page.documents.delete_confirm_description',
                'This will permanently delete “{{name}}”. This action cannot be undone.',
                { name: documentPendingDelete?.name ?? '' },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDocumentMutation.isPending}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteDocumentMutation.isPending || !documentPendingDelete}
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (!documentPendingDelete) return;
                deleteDocumentMutation.mutate({
                  contactId: documentPendingDelete.contactId,
                  documentId: documentPendingDelete.documentId,
                  source: documentPendingDelete.source,
                });
                setDocumentPendingDelete(null);
              }}
            >
              {deleteDocumentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={isBulkDeleteDialogOpen} onOpenChange={(open) => {
        setIsBulkDeleteDialogOpen(open);
        if (!open) setForceBulkDelete(false);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('contacts.bulk_delete.title', 'Delete {{count}} Contacts', { count: selectedContacts.size })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('contacts.bulk_delete.warning', 'This will permanently delete these contacts and all associated conversations, messages, and notes. This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {canForceDeleteContacts && (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <Checkbox
                id="force-bulk-contact-delete"
                checked={forceBulkDelete}
                onCheckedChange={(checked) => setForceBulkDelete(checked === true)}
              />
              <Label htmlFor="force-bulk-contact-delete" className="font-normal leading-5 cursor-pointer">
                {t('contacts.force_delete.bulk_confirm', 'Force delete all related patient records and other data for the selected contacts.')}
              </Label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={isBulkDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('contacts.bulk_delete.deleting', 'Deleting...')}
                </>
              ) : (
                t('contacts.bulk_delete.confirm', 'Delete {{count}} Contacts', { count: selectedContacts.size })
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <EditContactModal
        contact={selectedContact}
        isOpen={isEditModalOpen}
        onClose={handleEditModalClose}
        onUpdated={(updatedContact) => {
          setSelectedContactForDetail((current) =>
            current?.id === updatedContact.id ? { ...current, ...updatedContact } : current,
          );
        }}
      />

      {/* Add New Contact Dialog */}
      <Dialog open={isAddContactDialogOpen} onOpenChange={setIsAddContactDialogOpen}>
        <DialogContent data-tour="pages-contacts.dialogcontent.contacts.add.title" className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('contacts.add.title', 'Add New Contact')}</DialogTitle>
            <DialogDescription>
              {t('contacts.add.description', 'Create a new contact with the information below.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 pt-4">
            {/* Contact Avatar Upload Section */}
            <div className="flex flex-col items-center space-y-3 p-4 border-2 border-dashed border-border rounded-lg hover:border-input transition-colors">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {addContactForm.avatarPreview ? (
                  <img
                    src={addContactForm.avatarPreview}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <i className="ri-user-line text-2xl text-muted-foreground"></i>
                )}
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">{t('contacts.add.avatar_upload', 'Upload contact photo')}</p>
                <p className="text-xs text-muted-foreground">{t('contacts.add.avatar_optional', 'Optional - JPG, PNG up to 5MB')}</p>
              </div>
              <div className="flex space-x-2">
                <Button data-tour="pages-contacts.button.contacts.add.choose_photo"
                  variant="outline"
                  size="sm"
                  disabled={isSubmittingContact}
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) handleAvatarUpload(file);
                    };
                    input.click();
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {t('contacts.add.choose_photo', 'Choose Photo')}
                </Button>
                {addContactForm.avatarPreview && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSubmittingContact}
                    onClick={() => setAddContactForm(prev => ({ ...prev, avatarFile: null, avatarPreview: '' }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-name">{t('contacts.add.name_label', 'Name')} *</Label>
                <Input data-tour="pages-contacts.input.contacts.add.name_placeholder"
                  id="add-name"
                  value={addContactForm.name}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t('contacts.add.name_placeholder', 'Enter contact name')}
                  disabled={isSubmittingContact}
                  className="focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-email">{t('contacts.add.email_label', 'Email')}</Label>
                <div className="relative">
                  <Input data-tour="pages-contacts.input.contacts.add.email_placeholder"
                    id="add-email"
                    type="email"
                    value={addContactForm.email}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder={t('contacts.add.email_placeholder', 'Enter email address')}
                    disabled={isSubmittingContact}
                    className="focus:ring-2 focus:ring-primary-500"
                  />
                  {addContactForm.email && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      {addContactForm.email.includes('@') && addContactForm.email.includes('.') ? (
                        <i className="ri-check-line text-green-500 dark:text-green-400"></i>
                      ) : (
                        <i className="ri-error-warning-line text-orange-500 dark:text-orange-400"></i>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-phone">{t('contacts.add.phone_label', 'Phone')}</Label>
                <div className="relative">
                  <LocalizedPhoneInput
                    id="add-phone"
                    value={addContactForm.phone}
                    onChange={(phone) => setAddContactForm(prev => ({ ...prev, phone }))}
                    placeholder={t('contacts.add.phone_placeholder', '+1234567890')}
                    disabled={isSubmittingContact}
                    className={`pr-10 focus-within:ring-primary-500 ${
                      addContactForm.phone && !validatePhoneNumber(addContactForm.phone).isValid
                        ? 'border-red-500 focus-within:border-red-500'
                        : addContactForm.phone && checkForDuplicatePhone(addContactForm.phone, contacts || []).isDuplicate
                        ? 'border-yellow-500 focus-within:border-yellow-500'
                        : ''
                    }`}
                  />
                  {addContactForm.phone && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      {validatePhoneNumber(addContactForm.phone).isValid ? (
                        <i className="ri-check-line text-green-500"></i>
                      ) : (
                        <i className="ri-error-warning-line text-red-500"></i>
                      )}
                    </div>
                  )}
                </div>
                {addContactForm.phone && (
                  <div className="text-xs">
                    {(() => {
                      const phoneValidation = validatePhoneNumber(addContactForm.phone);
                      if (!phoneValidation.isValid) {
                        return (
                          <div className="flex items-center text-red-600">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {phoneValidation.error}
                          </div>
                        );
                      }

                      const duplicateCheck = checkForDuplicatePhone(addContactForm.phone, contacts || []);
                      if (duplicateCheck.isDuplicate) {
                        return (
                          <div className="flex items-center text-yellow-600">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            {t('contacts.add.existing_phone_notice', 'This contact already exists. Adding it will give you access without changing its details.')}
                          </div>
                        );
                      }

                      return (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Valid phone number
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-whatsapp-username">{t('contacts.add.whatsapp_username_label', 'WhatsApp Username')}</Label>
                <Input data-tour="pages-contacts.input.contacts.add.whatsapp_username_placeholder"
                  id="add-whatsapp-username"
                  value={addContactForm.whatsappUsername}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, whatsappUsername: e.target.value }))}
                  placeholder={t('contacts.add.whatsapp_username_placeholder', '@username')}
                  disabled={isSubmittingContact}
                />
              </div>

              <div className="col-span-2 text-xs text-muted-foreground">
                {t('contacts.creation.identity_help', 'Enter at least a phone number or WhatsApp username. You may provide both.')}
              </div>

              {addContactForm.whatsappUsername.trim() ? (
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="add-whatsapp-username-key">
                    {t('contacts.creation.username_key_label', 'Username key (optional)')}
                  </Label>
                  <Input data-tour="pages-contacts.input.contacts.creation.username_key_placeholder"
                    id="add-whatsapp-username-key"
                    value={addContactForm.whatsappUsernameKey}
                    onChange={(e) => setAddContactForm(prev => ({ ...prev, whatsappUsernameKey: e.target.value }))}
                    placeholder={t('contacts.creation.username_key_placeholder', 'Key shared by the contact')}
                    autoComplete="off"
                    disabled={isSubmittingContact}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('contacts.creation.username_key_help', 'Used only to verify protected usernames and never stored.')}
                  </p>
                </div>
              ) : null}

              {addContactForm.identifierType === 'whatsapp_official' && addContactForm.whatsappUsername.trim() && !addContactForm.phone.trim() ? (
                <div className="col-span-2 text-xs text-amber-600">
                  {t('contacts.creation.official_help', 'WhatsApp Official cannot initiate by username until the contact messages you first.')}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="add-company">{t('contacts.add.company_label', 'Company')}</Label>
                <Input data-tour="pages-contacts.input.contacts.add.company_placeholder"
                  id="add-company"
                  value={addContactForm.company}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, company: e.target.value }))}
                  placeholder={t('contacts.add.company_placeholder', 'Enter company name')}
                  disabled={isSubmittingContact}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="add-channel">{t('contacts.add.channel_label', 'Channel')}</Label>
                <Select
                  value={addContactForm.identifierType}
                  onValueChange={(value) => setAddContactForm(prev => ({ ...prev, identifierType: value }))}
                  disabled={isSubmittingContact}
                >
                  <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.add.select_channel_placeholder">
                    <SelectValue placeholder={t('contacts.add.select_channel_placeholder', 'Select channel')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp_official">{t('contacts.add.channel.whatsapp_official', 'WhatsApp Official')}</SelectItem>
                    <SelectItem value="whatsapp_unofficial">{t('contacts.add.channel.whatsapp_unofficial', 'WhatsApp Unofficial')}</SelectItem>
                    <SelectItem value="messenger">{t('contacts.add.channel.messenger', 'Facebook Messenger')}</SelectItem>
                    <SelectItem value="instagram">{t('contacts.add.channel.instagram', 'Instagram')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="add-identifier">{t('contacts.add.channel_identifier_label', 'Channel Identifier')}</Label>
                <Input data-tour="pages-contacts.input.contacts.add.channel_identifier_placeholder"
                  id="add-identifier"
                  value={addContactForm.identifier}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, identifier: e.target.value }))}
                  placeholder={t('contacts.add.channel_identifier_placeholder', 'Phone number or ID')}
                  disabled={isSubmittingContact}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-tags">{t('contacts.add.tags_label', 'Tags')}</Label>
              <div className="relative">
                <Input data-tour="pages-contacts.input.contacts.add.tags_placeholder"
                  id="add-tags"
                  value={addContactForm.tags}
                  onChange={(e) => setAddContactForm(prev => ({ ...prev, tags: e.target.value }))}
                  placeholder={t('contacts.add.tags_placeholder', 'Type tags separated by commas...')}
                  disabled={isSubmittingContact}
                  className="focus:ring-2 focus:ring-primary-500"
                />
                <i className="ri-price-tag-3-line absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground"></i>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {['lead', 'customer', 'prospect', 'vip', 'partner'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      const currentTags = addContactForm.tags ? addContactForm.tags.split(',').map(t => t.trim()) : [];
                      if (!currentTags.includes(tag)) {
                        const newTags = [...currentTags, tag].join(', ');
                        setAddContactForm(prev => ({ ...prev, tags: newTags }));
                      }
                    }}
                    className="px-2 py-1 text-xs bg-muted hover:bg-accent text-foreground rounded-full transition-colors"
                    disabled={isSubmittingContact}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>

            {contactCustomFieldsSchema.length > 0 && (
              <div className="space-y-3">
                <Label>{t('contacts.add.custom_fields_label', 'Custom Fields')}</Label>
                <div className="space-y-3">
                  {contactCustomFieldsSchema.map((field: { id: number; fieldName: string; fieldLabel: string; fieldType: string; required?: boolean; options?: { value: string; label: string }[] }) => (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={`add-cf-${field.fieldName}`} className="text-sm font-medium">
                        {field.fieldLabel}
                        {field.required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
                        {field.fieldType === 'multi_select' && ' (select multiple)'}
                      </Label>
                        {field.fieldType === 'file_select' ? (
                          <CustomFieldFileSelect
                            ownerType="contact"
                            ownerId={createdContactDraft?.id}
                            value={addContactForm.customFields[field.fieldName]}
                            pendingFile={pendingContactFiles[field.fieldName]}
                            onChange={(value) => setAddContactForm(prev => ({
                              ...prev,
                              customFields: { ...prev.customFields, [field.fieldName]: value },
                            }))}
                            onPendingFileChange={(file) => setPendingContactFiles(prev => ({ ...prev, [field.fieldName]: file }))}
                            disabled={isSubmittingContact}
                          />
                        ) : field.fieldType === 'text' && (
                        <Input data-tour="pages-contacts.input.contacts.add.enter_value"
                          id={`add-cf-${field.fieldName}`}
                          value={addContactForm.customFields[field.fieldName] ?? ''}
                          onChange={(e) => setAddContactForm(prev => ({
                            ...prev,
                            customFields: { ...prev.customFields, [field.fieldName]: e.target.value }
                          }))}
                          placeholder={t('contacts.add.enter_value', 'Enter value...')}
                          disabled={isSubmittingContact}
                        />
                      )}
                      {field.fieldType === 'number' && (
                        <Input data-tour="pages-contacts.input.contacts.add.enter_value"
                          id={`add-cf-${field.fieldName}`}
                          type="number"
                          value={addContactForm.customFields[field.fieldName] ?? ''}
                          onChange={(e) => setAddContactForm(prev => {
                            const val = e.target.value === '' ? undefined : parseFloat(e.target.value);
                            return {
                              ...prev,
                              customFields: {
                                ...prev.customFields,
                                [field.fieldName]: val !== undefined && !isNaN(val) ? val : undefined
                              }
                            };
                          })}
                          placeholder={t('contacts.add.enter_value', 'Enter value...')}
                          disabled={isSubmittingContact}
                        />
                      )}
                      {field.fieldType === 'select' && (
                        <Select
                          value={addContactForm.customFields[field.fieldName] ?? ''}
                          onValueChange={(value) => setAddContactForm(prev => ({
                            ...prev,
                            customFields: { ...prev.customFields, [field.fieldName]: value }
                          }))}
                          disabled={isSubmittingContact}
                        >
                          <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.add.select_option" id={`add-cf-${field.fieldName}`}>
                            <SelectValue placeholder={t('contacts.add.select_option', 'Select...')} />
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
                            const selected = Array.isArray(addContactForm.customFields[field.fieldName])
                              ? addContactForm.customFields[field.fieldName].includes(optVal)
                              : false;
                            return (
                              <div key={optVal} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`add-cf-${field.fieldName}-${optVal}`}
                                  checked={selected}
                                  onCheckedChange={(checked) => {
                                    const current = Array.isArray(addContactForm.customFields[field.fieldName])
                                      ? addContactForm.customFields[field.fieldName]
                                      : [];
                                    const next = checked
                                      ? [...current, optVal]
                                      : current.filter((v: string) => v !== optVal);
                                    setAddContactForm(prev => ({
                                      ...prev,
                                      customFields: { ...prev.customFields, [field.fieldName]: next }
                                    }));
                                  }}
                                  disabled={isSubmittingContact}
                                />
                                <label
                                  htmlFor={`add-cf-${field.fieldName}-${optVal}`}
                                  className="text-sm cursor-pointer"
                                >
                                  {optLab}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {field.fieldType === 'date' && (
                        <Input
                          id={`add-cf-${field.fieldName}`}
                          type="date"
                          value={addContactForm.customFields[field.fieldName] ?? ''}
                          onChange={(e) => setAddContactForm(prev => ({
                            ...prev,
                            customFields: { ...prev.customFields, [field.fieldName]: e.target.value || undefined }
                          }))}
                          disabled={isSubmittingContact}
                        />
                      )}
                      {field.fieldType === 'boolean' && (() => {
                        const boolOpts = field.options && !Array.isArray(field.options) ? (field.options as { trueLabel?: string; falseLabel?: string }) : null;
                        const trueLabel = boolOpts?.trueLabel ?? t('common.yes', 'Yes');
                        const falseLabel = boolOpts?.falseLabel ?? t('common.no', 'No');
                        return (
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`add-cf-${field.fieldName}`}
                              checked={!!addContactForm.customFields[field.fieldName]}
                              onCheckedChange={(checked) => setAddContactForm(prev => ({
                                ...prev,
                                customFields: { ...prev.customFields, [field.fieldName]: !!checked }
                              }))}
                              disabled={isSubmittingContact}
                            />
                            <label htmlFor={`add-cf-${field.fieldName}`} className="text-sm">
                              {addContactForm.customFields[field.fieldName] ? trueLabel : falseLabel}
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
              <Label htmlFor="add-notes">{t('contacts.add.notes_label', 'Notes')}</Label>
              <Textarea data-tour="pages-contacts.textarea.contacts.add.notes_placeholder"
                id="add-notes"
                value={addContactForm.notes}
                onChange={(e) => setAddContactForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder={t('contacts.add.notes_placeholder', 'Additional notes about this contact...')}
                rows={3}
                disabled={isSubmittingContact}
              />
            </div>
          </div>

          <DialogFooter>
            <Button data-tour="pages-contacts.button.common.cancel"
              variant="outline"
              onClick={() => {
                setIsAddContactDialogOpen(false);
                resetAddContactForm();
              }}
              disabled={isSubmittingContact}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-contacts.button.contacts.add.creating"
              onClick={handleAddContactSubmit}
              disabled={isSubmittingContact || requiresWhatsAppContactIdentity(addContactForm)}
            >
              {isSubmittingContact ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('contacts.add.creating', 'Creating...')}
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('contacts.add.create_button', 'Create Contact')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
        <DialogContent data-tour="pages-contacts.dialogcontent.contacts.import.title" className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('contacts.import.title', 'Import Contacts from CSV')}</DialogTitle>
            <DialogDescription>
              {t('contacts.import.description', 'Upload a CSV file to import multiple contacts at once. Download the template to see the required format.')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <Button data-tour="pages-contacts.button.contacts.import.download_template"
                variant="outline"
                onClick={downloadCsvTemplate}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {t('contacts.import.download_template', 'Download Template')}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t('contacts.import.file_label', 'CSV File')}</Label>
              <FileUpload
                onFileSelected={handleFileSelected}
                fileType=".csv"
                maxSize={10} // 10MB limit
                className="w-full"
                showProgress={isImporting}
                progress={importProgress}
              />
              <p className="text-xs text-muted-foreground">
                {t('contacts.import.file_help', 'Maximum file size: 10MB. Only CSV files are supported.')}
              </p>
            </div>

            {showPreview && csvPreview.length > 0 && (
              <div className="space-y-2">
                <Label>{t('contacts.import.preview_label', 'Preview (first 5 rows)')}</Label>
                <div className="border border-border rounded-md overflow-x-auto">
                  <table className="w-full text-sm text-foreground">
                    <thead className="bg-muted">
                      <tr>
                        {Object.keys(csvPreview[0] || {}).filter(header => !header.startsWith('_')).map((header) => (
                          <th key={header} className="px-3 py-2 text-left font-medium">
                            {header}
                          </th>
                        ))}
                        <th className="px-3 py-2 text-left font-medium">{t('contacts.import.preview.validation', 'Validation')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvPreview.map((row, index) => (
                        <tr
                          key={index}
                          className={`border-t border-border${
                            row._warnings?.length > 0 ? ' bg-red-500/10 dark:bg-red-500/20' : ''
                          }`}
                        >
                          {Object.entries(row).filter(([key]) => !key.startsWith('_')).map(([, value], cellIndex) => (
                            <td key={cellIndex} className="px-3 py-2 text-foreground">
                              {value as string}
                            </td>
                          ))}
                          <td className="px-3 py-2">
                            {row._warnings?.length > 0 ? (
                              <div className="space-y-1">
                                {row._warnings.map((warning: string, wIndex: number) => (
                                  <div key={wIndex} className="flex items-center text-red-600 dark:text-red-400 text-xs">
                                    <AlertCircle className="w-3 h-3 mr-1 shrink-0" />
                                    {warning}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex items-center text-green-600 dark:text-green-400 text-xs">
                                <CheckCircle className="w-3 h-3 mr-1 shrink-0" />
                                {t('contacts.import.preview.valid', 'Valid')}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csvPreview.some(row => row._warnings?.length > 0) && (
                  <div className="bg-yellow-500/10 dark:bg-yellow-500/15 border border-yellow-500/30 rounded-md p-3">
                    <div className="flex items-center">
                      <AlertCircle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mr-2 shrink-0" />
                      <span className="text-sm text-yellow-800 dark:text-yellow-300">
                        {t(
                          'contacts.import.preview.warning',
                          'Some rows have validation issues. These contacts may be skipped or cause errors during import.'
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('contacts.import.duplicate_handling_label', 'Duplicate Handling')}</Label>
              <Select
                value={duplicateHandling}
                onValueChange={(value: 'skip' | 'update' | 'create') => setDuplicateHandling(value)}
                disabled={isImporting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">{t('contacts.import.duplicate.skip', 'Skip duplicates')}</SelectItem>
                  <SelectItem value="update">{t('contacts.import.duplicate.update', 'Update existing')}</SelectItem>
                  <SelectItem value="create">{t('contacts.import.duplicate.create', 'Create new')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('contacts.import.identity_duplicate_help', 'How to handle contacts with duplicate phone numbers, email addresses, or WhatsApp usernames')}
              </p>
            </div>

            {isImporting && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('contacts.import.importing', 'Importing...')}</span>
                  <span>{importProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {importResults && (
              <div className="space-y-2">
                <Label>{t('contacts.import.results_label', 'Import Results')}</Label>
                <div className="p-4 border rounded-md bg-muted">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>{t('contacts.import.successful', 'Successfully imported: {{count}}', { count: importResults?.successful || 0 })}</span>
                  </div>
                  {(importResults?.failed || 0) > 0 && (
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>{t('contacts.import.failed', 'Failed to import: {{count}}', { count: importResults?.failed || 0 })}</span>
                    </div>
                  )}
                  {(importResults?.errors?.length || 0) > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-foreground mb-1">{t('contacts.import.errors', 'Errors:')}</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {importResults?.errors?.slice(0, 5).map((error, index) => (
                          <li key={index}>• {localizeWhatsAppContactImportError(error, t)}</li>
                        ))}
                        {(importResults?.errors?.length || 0) > 5 && (
                          <li>• {t('contacts.import.more_errors', 'And {{count}} more errors...', { count: (importResults?.errors?.length || 0) - 5 })}</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button data-tour="pages-contacts.button.common.close"
              variant="outline"
              onClick={() => {
                setIsImportDialogOpen(false);
                resetImportForm();
              }}
              disabled={isImporting}
            >
              {importResults ? t('common.close', 'Close') : t('common.cancel', 'Cancel')}
            </Button>
            {!importResults && (
              <Button data-tour="pages-contacts.button.contacts.import.importing"
                onClick={handleImportSubmit}
                disabled={!importFile || isImporting}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('contacts.import.importing', 'Importing...')}
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    {t('contacts.import.import_button', 'Import Contacts')}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contact Export Modal */}
      <ContactExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentFilters={{
          search: debouncedSearch,
          channel: channelFilter
        }}
      />

      {/* Create Segment Modal */}
      <CreateSegmentFromContactsModal
        isOpen={isCreateSegmentModalOpen}
        onClose={() => setIsCreateSegmentModalOpen(false)}
        selectedContactIds={Array.from(selectedContacts)}
        onSegmentCreated={handleSegmentCreated}
      />

      {/* Add to Existing Segment Modal */}
      <AddToExistingSegmentModal
        isOpen={isAddToSegmentModalOpen}
        onClose={() => setIsAddToSegmentModalOpen(false)}
        selectedContactIds={Array.from(selectedContacts)}
        onContactsAdded={handleContactsAddedToSegment}
      />

      {/* WhatsApp Scraping Modal */}
      <WhatsAppScrapingModal
        isOpen={isWhatsAppScrapingModalOpen}
        onClose={() => setIsWhatsAppScrapingModalOpen(false)}
      />

      {/* Filter Dialog */}
      <Dialog open={isFilterDialogOpen} onOpenChange={setIsFilterDialogOpen}>
        <DialogContent data-tour="pages-contacts.dialogcontent.contacts.page.filter_dialog.title" className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilterIcon className="h-5 w-5" size={20} />
              {t('contacts.page.filter_dialog.title', 'Filter Contacts')}
            </DialogTitle>
            <DialogDescription>
              {t('contacts.page.filter_dialog.description', 'Apply filters to narrow down your contact list')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Channel Filter */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">{t('contacts.page.filter.channel', 'Channel')}</Label>
              <Select value={channelFilter} onValueChange={(value) => {
                setChannelFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.page.filter.all_channels">
                  <SelectValue placeholder={t('contacts.page.filter.all_channels', 'All channels')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('contacts.page.filter.all_channels', 'All channels')}</SelectItem>
                  <SelectItem value="whatsapp_official">{t('contacts.page.filter.whatsapp_official', 'WhatsApp Official')}</SelectItem>
                  <SelectItem value="whatsapp_unofficial">{t('contacts.page.filter.whatsapp_unofficial', 'WhatsApp Unofficial')}</SelectItem>
                  <SelectItem value="messenger">{t('contacts.page.filter.messenger', 'Facebook Messenger')}</SelectItem>
                  <SelectItem value="instagram">{t('contacts.page.filter.instagram', 'Instagram')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Archived Filter */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">{t('contacts.page.filter.archived_status', 'Archived Status')}</Label>
              <Select value={archivedFilter} onValueChange={(value) => {
                setArchivedFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.page.filter.active_contacts_placeholder">
                  <SelectValue placeholder={t('contacts.page.filter.active_contacts_placeholder', 'Active contacts')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('contacts.page.filter.active_only', 'Active only')}</SelectItem>
                  <SelectItem value="archived">{t('contacts.page.filter.archived_only', 'Archived only')}</SelectItem>
                  <SelectItem value="all">{t('contacts.page.filter.all_contacts', 'All contacts')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Filter */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">{t('contacts.page.filter.period', 'Period')}</Label>
              <Select value={dateFilter} onValueChange={(value) => {
                setDateFilter(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.page.filter.all_periods">
                  <SelectValue placeholder={t('contacts.page.filter.all_periods', 'All periods')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('contacts.page.filter.all_periods', 'All periods')}</SelectItem>
                  <SelectItem value="today">{t('contacts.page.filter.today', 'Today')}</SelectItem>
                  <SelectItem value="yesterday">{t('contacts.page.filter.yesterday', 'Yesterday')}</SelectItem>
                  <SelectItem value="last7days">{t('contacts.page.filter.last_7_days', 'Last 7 days')}</SelectItem>
                  <SelectItem value="last30days">{t('contacts.page.filter.last_30_days', 'Last 30 days')}</SelectItem>
                  <SelectItem value="last90days">{t('contacts.page.filter.last_90_days', 'Last 90 days')}</SelectItem>
                  <SelectItem value="thismonth">{t('contacts.page.filter.this_month', 'This month')}</SelectItem>
                  <SelectItem value="lastmonth">{t('contacts.page.filter.last_month', 'Last month')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags Filter */}
            <div>
              <Label className="text-sm font-medium text-foreground mb-2 block">{t('contacts.page.filter.tags', 'Tags')}</Label>
              <Select
                value=""
                onValueChange={(value) => {
                  if (value && !tagsFilter.includes(value)) {
                    setTagsFilter(prev => [...prev, value]);
                    setCurrentPage(1);
                  }
                }}
              >
                <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.page.filter.add_tag">
                  <SelectValue placeholder={t('contacts.page.filter.add_tag', 'Add a tag')} />
                </SelectTrigger>
                <SelectContent>
                  {availableTags.map((tag: string) => (
                    <SelectItem
                      key={tag}
                      value={tag}
                      disabled={tagsFilter.includes(tag)}
                    >
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Selected Tags */}
              {tagsFilter.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {tagsFilter.map((tag) => (
                    <Badge
                      key={tag}
                      variant="secondary"
                      className="text-xs px-2 py-0.5 flex items-center gap-1 !bg-muted !text-muted-foreground"
                    >
                      {tag}
                      <button
                        onClick={() => {
                          setTagsFilter(prev => prev.filter(t => t !== tag));
                          setCurrentPage(1);
                        }}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                  <Button data-tour="pages-contacts.button.contacts.page.filter.clear_all"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setTagsFilter([]);
                      setCurrentPage(1);
                    }}
                    className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('contacts.page.filter.clear_all', 'Clear all')}
                  </Button>
                </div>
              )}
            </div>

          </div>

          <DialogFooter className="flex gap-2">
            <Button data-tour="pages-contacts.button.contacts.page.filter.reset_all"
              onClick={() => {
                setChannelFilter('all');
                setArchivedFilter('active');
                setDateFilter('all');
                setTagsFilter([]);
                setCurrentPage(1);
              }}
              variant="outline"
            >
              {t('contacts.page.filter.reset_all', 'Reset All')}
            </Button>
            <Button data-tour="pages-contacts.button.contacts.page.filter.apply"
              onClick={() => setIsFilterDialogOpen(false)}
              className="!bg-primary !text-primary-foreground hover:!bg-primary/90"
            >
              {t('contacts.page.filter.apply', 'Apply Filters')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified Document Upload Modal */}
      <Dialog open={isDocumentUploadModalOpen} onOpenChange={setIsDocumentUploadModalOpen}>
        <DialogContent data-tour="pages-contacts.dialogcontent.contacts.page.documents.upload_modal.title" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('contacts.page.documents.upload_modal.title', 'Upload Document')}</DialogTitle>
            <DialogDescription>
              {t('contacts.page.documents.upload_modal.description', 'Add a document with category and description for {{name}}', {
                name: selectedContactForDetail?.name || ''
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* File Upload */}
            <div>
              <Label htmlFor="document-file" className="text-sm font-medium">
                {t('contacts.page.documents.upload_modal.file_label', 'Document File')}
              </Label>
              <div className="mt-1">
                <input data-tour="pages-contacts.input.contacts.page.documents.upload_modal.toast.file_too_large.title"
                  id="document-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {

                      if (file.size > 10 * 1024 * 1024) {
                        toast({
                          title: t('contacts.page.documents.upload_modal.toast.file_too_large.title', 'File too large'),
                          description: t(
                            'contacts.page.documents.upload_modal.toast.file_too_large.description',
                            'Document must be less than 10MB'
                          ),
                          variant: "destructive",
                        });
                        return;
                      }
                      setDocumentUploadForm(prev => ({ ...prev, file }));
                    }
                  }}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-blue-900/20 file:text-blue-700 dark:file:text-blue-400 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/30"
                />
              </div>
              {documentUploadForm.file && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('contacts.page.documents.upload_modal.selected_prefix', 'Selected:')} {documentUploadForm.file.name} (
                  {(documentUploadForm.file.size / 1024 / 1024).toFixed(2)} MB)
                </p>
              )}
            </div>

            {/* Category Selector */}
            <div>
              <Label htmlFor="document-category" className="text-sm font-medium">
                {t('contacts.page.documents.upload_modal.category_label', 'Category')}
              </Label>
              <Select
                value={documentUploadForm.category}
                onValueChange={(value) => setDocumentUploadForm(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.page.documents.upload_modal.select_category_placeholder" className="mt-1">
                  <SelectValue placeholder={t('contacts.page.documents.upload_modal.select_category_placeholder', 'Select category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="identity">{t('contacts.page.documents.category.identity', 'Identity Document')}</SelectItem>
                  <SelectItem value="address_proof">{t('contacts.page.documents.category.address_proof', 'Address Proof')}</SelectItem>
                  <SelectItem value="income">{t('contacts.page.documents.category.income', 'Income Verification')}</SelectItem>
                  <SelectItem value="general">{t('contacts.page.documents.category.general', 'General')}</SelectItem>
                  {isDental &&
                    DENTAL_CLINICAL_DOCUMENT_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category === 'xray'
                          ? t('erp.dental.clinical.category.xray', 'X-ray')
                          : category === 'cbct'
                            ? t('erp.dental.clinical.category.cbct', 'CBCT')
                            : category === 'intraoral'
                              ? t('erp.dental.clinical.category.intraoral', 'Intraoral photo')
                              : category === 'consent'
                                ? t('erp.dental.clinical.category.consent', 'Consent')
                                : category === 'clinical_report'
                                  ? t('erp.dental.clinical.category.clinicalReport', 'Clinical report')
                                  : t('erp.dental.clinical.category.beforeAfter', 'Before / after')}
                      </SelectItem>
                    ))}
                  <SelectItem value="custom">{t('contacts.page.documents.upload_modal.custom_category_option', 'Custom Category')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Custom Category Input */}
            {documentUploadForm.category === 'custom' && (
              <div>
                <Label htmlFor="custom-category" className="text-sm font-medium">
                  {t('contacts.page.documents.upload_modal.custom_category_name_label', 'Custom Category Name')}
                </Label>
                <Input data-tour="pages-contacts.input.contacts.page.documents.upload_modal.custom_category_name_placeholder"
                  id="custom-category"
                  value={documentUploadForm.customCategory}
                  onChange={(e) => setDocumentUploadForm(prev => ({ ...prev, customCategory: e.target.value }))}
                  placeholder={t('contacts.page.documents.upload_modal.custom_category_name_placeholder', 'Enter custom category name')}
                  className="mt-1"
                />
              </div>
            )}

            {/* Description Field */}
            <div>
              <Label htmlFor="document-description" className="text-sm font-medium">
                {t('contacts.page.documents.upload_modal.description_label', 'Description')}{' '}
                <span className="text-muted-foreground">{t('contacts.page.documents.upload_modal.optional_suffix', '(optional)')}</span>
              </Label>
              <Textarea data-tour="pages-contacts.textarea.contacts.page.documents.upload_modal.description_placeholder"
                id="document-description"
                value={documentUploadForm.description}
                onChange={(e) => setDocumentUploadForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t(
                  'contacts.page.documents.upload_modal.description_placeholder',
                  'Add notes or description about this document...'
                )}
                className="mt-1"
                rows={3}
              />
            </div>

            {/* Upload Progress */}
            {isUploadingDocument && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('contacts.page.documents.uploading', 'Uploading...')}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button data-tour="pages-contacts.button.common.cancel"
              variant="outline"
              onClick={() => {
                setIsDocumentUploadModalOpen(false);
                setDocumentUploadForm({
                  category: 'general',
                  customCategory: '',
                  description: '',
                  file: null
                });
              }}
              disabled={isUploadingDocument}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-contacts.button.contacts.page.documents.uploading"
              onClick={handleUnifiedDocumentUpload}
              disabled={!documentUploadForm.file || isUploadingDocument || (documentUploadForm.category === 'custom' && !documentUploadForm.customCategory.trim())}
            >
              {isUploadingDocument ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('contacts.page.documents.uploading', 'Uploading...')}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {t('contacts.page.documents.upload_button', 'Upload Document')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('contacts.page.archive_dialog.title', 'Archive Contact')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'contacts.page.archive_dialog.description',
                'Are you sure you want to archive this contact? Archived contacts will be hidden from the main list but can be restored later.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveContactMutation.isPending}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmArchive}
              disabled={archiveContactMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {archiveContactMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('contacts.page.archive_dialog.archiving', 'Archiving...')}
                </>
              ) : (
                t('contacts.page.archive_dialog.title', 'Archive Contact')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Archive Confirmation Dialog */}
      <AlertDialog open={isBulkArchiveDialogOpen} onOpenChange={setIsBulkArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {bulkArchiveAction === 'archive'
                ? t('contacts.page.bulk_archive.title_archive', 'Archive {{count}} Contacts', { count: selectedContacts.size })
                : t('contacts.page.bulk_archive.title_unarchive', 'Unarchive {{count}} Contacts', { count: selectedContacts.size })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkArchiveAction === 'archive'
                ? t(
                    'contacts.page.bulk_archive.description_archive',
                    'Are you sure you want to archive {{count}} contacts? They will be hidden from the main list but can be restored later.',
                    { count: selectedContacts.size }
                  )
                : t(
                    'contacts.page.bulk_archive.description_unarchive',
                    'Are you sure you want to unarchive {{count}} contacts? They will be restored to the main list.',
                    { count: selectedContacts.size }
                  )
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkArchiveMutation.isPending}>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulkArchive}
              disabled={bulkArchiveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {bulkArchiveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {bulkArchiveAction === 'archive'
                    ? t('contacts.page.bulk_archive.archiving', 'Archiving...')
                    : t('contacts.page.bulk_archive.unarchiving', 'Unarchiving...')}
                </>
              ) : (
                bulkArchiveAction === 'archive'
                  ? t('contacts.page.bulk_archive.action_archive', 'Archive Contacts')
                  : t('contacts.page.bulk_archive.action_unarchive', 'Unarchive Contacts')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Task Modal */}
      <Dialog open={isCreateTaskModalOpen} onOpenChange={setIsCreateTaskModalOpen}>
        <DialogContent data-tour="pages-contacts.dialogcontent.contacts.page.tasks.create_modal.title" className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('contacts.page.tasks.create_modal.title', 'Create New Task')}</DialogTitle>
            <DialogDescription>
              {t('contacts.page.tasks.create_modal.description', 'Create a new task for {{name}}', {
                name: selectedContactForDetail?.name || ''
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="task-title">{t('contacts.page.tasks.form.title_label', 'Title *')}</Label>
              <Input data-tour="pages-contacts.input.contacts.page.tasks.form.title_placeholder"
                id="task-title"
                value={taskForm.title}
                onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder={t('contacts.page.tasks.form.title_placeholder', 'Enter task title')}
              />
            </div>

            <div>
              <Label htmlFor="task-description">{t('contacts.page.tasks.form.description_label', 'Description')}</Label>
              <Textarea data-tour="pages-contacts.textarea.contacts.page.tasks.form.description_placeholder"
                id="task-description"
                value={taskForm.description}
                onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('contacts.page.tasks.form.description_placeholder', 'Enter task description')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-priority">{t('contacts.page.tasks.form.priority_label', 'Priority')}</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(value) => setTaskForm(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('contacts.page.tasks.priority.low', 'Low')}</SelectItem>
                    <SelectItem value="medium">{t('contacts.page.tasks.priority.medium', 'Medium')}</SelectItem>
                    <SelectItem value="high">{t('contacts.page.tasks.priority.high', 'High')}</SelectItem>
                    <SelectItem value="urgent">{t('contacts.page.tasks.priority.urgent', 'Urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="task-status">{t('contacts.page.tasks.form.status_label', 'Status')}</Label>
                <Select
                  value={taskForm.status}
                  onValueChange={(value) => setTaskForm(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">{t('contacts.page.tasks.status.not_started', 'Not Started')}</SelectItem>
                    <SelectItem value="in_progress">{t('contacts.page.tasks.status.in_progress', 'In Progress')}</SelectItem>
                    <SelectItem value="completed">{t('contacts.page.tasks.status.completed', 'Completed')}</SelectItem>
                    <SelectItem value="cancelled">{t('contacts.page.tasks.status.cancelled', 'Cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="task-due-date">{t('contacts.page.tasks.form.due_date_label', 'Due Date')}</Label>
                <Input data-tour="pages-contacts.input.task-due-date"
                  id="task-due-date"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="task-assigned-to">{t('contacts.page.tasks.form.assigned_to_label', 'Assigned To')}</Label>
                <Input data-tour="pages-contacts.input.contacts.page.tasks.form.assigned_to_placeholder"
                  id="task-assigned-to"
                  value={taskForm.assignedTo}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, assignedTo: e.target.value }))}
                  placeholder={t('contacts.page.tasks.form.assigned_to_placeholder', 'Enter assignee name')}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="task-category">{t('contacts.page.tasks.form.category_label', 'Category')}</Label>
              <Input data-tour="pages-contacts.input.contacts.page.tasks.form.category_placeholder"
                id="task-category"
                value={taskForm.category}
                onChange={(e) => setTaskForm(prev => ({ ...prev, category: e.target.value }))}
                placeholder={t('contacts.page.tasks.form.category_placeholder', 'Enter task category')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button data-tour="pages-contacts.button.common.cancel"
              variant="outline"
              onClick={() => setIsCreateTaskModalOpen(false)}
              disabled={createTaskMutation.isPending}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-contacts.button.contacts.page.tasks.create_modal.missing_required_title"
              onClick={() => {
                if (!taskForm.title.trim()) {
                  toast({
                    title: t('contacts.page.tasks.create_modal.missing_required_title', 'Missing required field'),
                    description: t('contacts.page.tasks.create_modal.missing_required_description', 'Please enter a task title'),
                    variant: "destructive",
                  });
                  return;
                }

                if (selectedContactForDetail) {
                  createTaskMutation.mutate({
                    contactId: selectedContactForDetail.id,
                    taskData: {
                      title: taskForm.title,
                      description: taskForm.description,
                      priority: taskForm.priority,
                      status: taskForm.status,
                      dueDate: taskForm.dueDate || null,
                      assignedTo: taskForm.assignedTo || null,
                      category: taskForm.category || null,
                      tags: taskForm.tags
                    }
                  });
                }
              }}
              disabled={createTaskMutation.isPending}
            >
              {createTaskMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('contacts.page.tasks.create_modal.creating', 'Creating...')}
                </>
              ) : (
                t('contacts.page.tasks.create_modal.create_button', 'Create Task')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Task Modal */}
      <Dialog open={isEditTaskModalOpen} onOpenChange={setIsEditTaskModalOpen}>
        <DialogContent data-tour="pages-contacts.dialogcontent.contacts.page.tasks.edit_modal.title" className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('contacts.page.tasks.edit_modal.title', 'Edit Task')}</DialogTitle>
            <DialogDescription>
              {t('contacts.page.tasks.edit_modal.description', 'Update task details for {{name}}', {
                name: selectedContactForDetail?.name || ''
              })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-task-title">{t('contacts.page.tasks.form.title_label', 'Title *')}</Label>
              <Input data-tour="pages-contacts.input.contacts.page.tasks.form.title_placeholder"
                id="edit-task-title"
                value={taskForm.title}
                onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder={t('contacts.page.tasks.form.title_placeholder', 'Enter task title')}
              />
            </div>

            <div>
              <Label htmlFor="edit-task-description">{t('contacts.page.tasks.form.description_label', 'Description')}</Label>
              <Textarea data-tour="pages-contacts.textarea.contacts.page.tasks.form.description_placeholder"
                id="edit-task-description"
                value={taskForm.description}
                onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t('contacts.page.tasks.form.description_placeholder', 'Enter task description')}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-task-priority">{t('contacts.page.tasks.form.priority_label', 'Priority')}</Label>
                <Select
                  value={taskForm.priority}
                  onValueChange={(value) => setTaskForm(prev => ({ ...prev, priority: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('contacts.page.tasks.priority.low', 'Low')}</SelectItem>
                    <SelectItem value="medium">{t('contacts.page.tasks.priority.medium', 'Medium')}</SelectItem>
                    <SelectItem value="high">{t('contacts.page.tasks.priority.high', 'High')}</SelectItem>
                    <SelectItem value="urgent">{t('contacts.page.tasks.priority.urgent', 'Urgent')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-task-status">{t('contacts.page.tasks.form.status_label', 'Status')}</Label>
                <Select
                  value={taskForm.status}
                  onValueChange={(value) => setTaskForm(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="not_started">{t('contacts.page.tasks.status.not_started', 'Not Started')}</SelectItem>
                    <SelectItem value="in_progress">{t('contacts.page.tasks.status.in_progress', 'In Progress')}</SelectItem>
                    <SelectItem value="completed">{t('contacts.page.tasks.status.completed', 'Completed')}</SelectItem>
                    <SelectItem value="cancelled">{t('contacts.page.tasks.status.cancelled', 'Cancelled')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-task-due-date">{t('contacts.page.tasks.form.due_date_label', 'Due Date')}</Label>
                <Input data-tour="pages-contacts.input.edit-task-due-date"
                  id="edit-task-due-date"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="edit-task-assigned-to">{t('contacts.page.tasks.form.assigned_to_label', 'Assigned To')}</Label>
                <Input data-tour="pages-contacts.input.contacts.page.tasks.form.assigned_to_placeholder"
                  id="edit-task-assigned-to"
                  value={taskForm.assignedTo}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, assignedTo: e.target.value }))}
                  placeholder={t('contacts.page.tasks.form.assigned_to_placeholder', 'Enter assignee name')}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-task-category">{t('contacts.page.tasks.form.category_label', 'Category')}</Label>
              <Input data-tour="pages-contacts.input.contacts.page.tasks.form.category_placeholder"
                id="edit-task-category"
                value={taskForm.category}
                onChange={(e) => setTaskForm(prev => ({ ...prev, category: e.target.value }))}
                placeholder={t('contacts.page.tasks.form.category_placeholder', 'Enter task category')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button data-tour="pages-contacts.button.common.cancel"
              variant="outline"
              onClick={() => {
                setIsEditTaskModalOpen(false);
                setSelectedTask(null);
              }}
              disabled={updateTaskMutation.isPending}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-contacts.button.contacts.page.tasks.create_modal.missing_required_title"
              onClick={() => {
                if (!taskForm.title.trim()) {
                  toast({
                    title: t('contacts.page.tasks.create_modal.missing_required_title', 'Missing required field'),
                    description: t('contacts.page.tasks.create_modal.missing_required_description', 'Please enter a task title'),
                    variant: "destructive",
                  });
                  return;
                }

                if (selectedContactForDetail && selectedTask) {
                  updateTaskMutation.mutate({
                    contactId: selectedContactForDetail.id,
                    taskId: selectedTask.id,
                    taskData: {
                      title: taskForm.title,
                      description: taskForm.description,
                      priority: taskForm.priority,
                      status: taskForm.status,
                      dueDate: taskForm.dueDate || null,
                      assignedTo: taskForm.assignedTo || null,
                      category: taskForm.category || null,
                      tags: taskForm.tags
                    }
                  });
                }
              }}
              disabled={updateTaskMutation.isPending}
            >
              {updateTaskMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('contacts.page.tasks.edit_modal.updating', 'Updating...')}
                </>
              ) : (
                t('contacts.page.tasks.edit_modal.update_button', 'Update Task')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Appointment Booking Modal */}
      <Dialog open={isAppointmentModalOpen} onOpenChange={setIsAppointmentModalOpen}>
        <DialogPortal>
          <DialogOverlay className="fixed inset-0 z-[9999] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogContent data-tour="pages-contacts.dialogcontent.contacts.page.appointment.dialog_title" className="sm:max-w-[600px] fixed left-[50%] top-[50%] z-[9999] translate-x-[-50%] translate-y-[-50%]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <span>{t('contacts.page.appointment.dialog_title', 'Schedule New Appointment')}</span>
              <div className="flex items-center space-x-1 text-sm font-normal">
                <span className="text-muted-foreground">{t('contacts.page.appointment.via', 'via')}</span>
                <div className="flex items-center space-x-1 px-2 py-1 bg-muted rounded-md">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      selectedProvider === 'google' ? 'bg-blue-500' :
                      selectedProvider === 'zoho' ? 'bg-orange-500' : 'bg-purple-500'
                    }`}
                  />
                  <span className="text-xs font-medium">
                    {selectedProvider === 'google' ? t('contacts.page.appointment.provider.google', 'Google Calendar') :
                     selectedProvider === 'zoho' ? t('contacts.page.appointment.provider.zoho', 'Zoho Calendar') : t('contacts.page.appointment.provider.calendly', 'Calendly')}
                  </span>
                </div>
              </div>
            </DialogTitle>
            <DialogDescription>
              {t('contacts.page.appointment.description', 'Create a new appointment on your calendar.')}
            </DialogDescription>
          </DialogHeader>
          <div className="mb-4">
            <Label className="text-sm font-medium">{t('contacts.page.appointment.calendar_provider_label', 'Calendar Provider')}</Label>
            <Select value={selectedProvider} onValueChange={(value: 'google' | 'zoho' | 'calendly') => setSelectedProvider(value)}>
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
                    {t('contacts.page.appointment.provider.google', 'Google Calendar')}
                    {isGoogleCalendarConnected && <span className="ml-2 text-green-600 text-xs">{t('contacts.page.appointment.connected_badge', '✓ Connected')}</span>}
                  </div>
                </SelectItem>
                <SelectItem value="zoho">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-orange-500 mr-2"></div>
                    {t('contacts.page.appointment.provider.zoho', 'Zoho Calendar')}
                    {isZohoCalendarConnected && <span className="ml-2 text-green-600 text-xs">{t('contacts.page.appointment.connected_badge', '✓ Connected')}</span>}
                  </div>
                </SelectItem>
                <SelectItem value="calendly">
                  <div className="flex items-center">
                    <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div>
                    {t('contacts.page.appointment.provider.calendly', 'Calendly')}
                    {isCalendlyCalendarConnected && <span className="ml-2 text-green-600 text-xs">{t('contacts.page.appointment.connected_badge', '✓ Connected')}</span>}
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            {selectedProvider === 'google' && isGoogleCalendarConnected && (
              <div className="mt-4">
                <Label className="text-sm font-medium">
                  {t('contacts.page.appointment.desired_calendar', 'Calendar')}
                </Label>
                <GoogleCalendarSelector
                  value={googleCalendarId}
                  onChange={setGoogleCalendarId}
                  className="w-full mt-1"
                  placeholder={t('contacts.page.appointment.select_calendar_placeholder', 'Select calendar')}
                />
              </div>
            )}
          </div>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="summary" className="text-right">
                {t('contacts.page.appointment.form.title_label', 'Title*')}
              </Label>
              <Input data-tour="pages-contacts.input.summary"
                id="summary"
                value={eventForm.summary}
                onChange={(e) => setEventForm({...eventForm, summary: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="description" className="text-right pt-2">
                {t('contacts.page.appointment.form.description_label', 'Description')}
              </Label>
              <div className="col-span-3 w-full min-w-0">
                <Textarea data-tour="pages-contacts.textarea.description"
                  id="description"
                  value={eventForm.description}
                  onChange={(e) => setEventForm({...eventForm, description: e.target.value})}
                  className="min-h-[96px] resize-y"
                />
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="location" className="text-right">
                {t('contacts.page.appointment.form.location_label', 'Location')}
              </Label>
              <Input data-tour="pages-contacts.input.location"
                id="location"
                value={eventForm.location}
                onChange={(e) => setEventForm({...eventForm, location: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="colorId" className="text-right">
                {t('contacts.page.appointment.form.category_label', 'Category')}
              </Label>
              <Select
                value={eventForm.colorId}
                onValueChange={(value) => setEventForm({...eventForm, colorId: value})}
              >
                <SelectTrigger data-tour="pages-contacts.selecttrigger.contacts.page.appointment.select_category_placeholder" className="col-span-3">
                  <SelectValue placeholder={t('contacts.page.appointment.select_category_placeholder', 'Select category')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                      <span>{t('contacts.page.appointment.color.blue', 'Blue')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="2">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                      <span>{t('contacts.page.appointment.color.green', 'Green')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="3">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-purple-500 mr-2"></div>
                      <span>{t('contacts.page.appointment.color.purple', 'Purple')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="4">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                      <span>{t('contacts.page.appointment.color.red', 'Red')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="5">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
                      <span>{t('contacts.page.appointment.color.yellow', 'Yellow')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="6">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
                      <span>{t('contacts.page.appointment.color.orange', 'Orange')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="7">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-cyan-500 mr-2"></div>
                      <span>{t('contacts.page.appointment.color.turquoise', 'Turquoise')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="8">
                    <div className="flex items-center">
                      <div className="w-3 h-3 rounded-full bg-muted-foreground mr-2"></div>
                      <span>{t('contacts.page.appointment.color.gray', 'Gray')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startDateTime" className="text-right">
                {t('contacts.page.appointment.form.start_time_label', 'Start Time*')}
              </Label>
              <Input data-tour="pages-contacts.input.startDateTime"
                id="startDateTime"
                type="datetime-local"
                value={eventForm.startDateTime.slice(0, 16)}
                onChange={(e) => setEventForm({...eventForm, startDateTime: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endDateTime" className="text-right">
                {t('contacts.page.appointment.form.end_time_label', 'End Time*')}
              </Label>
              <Input data-tour="pages-contacts.input.endDateTime"
                id="endDateTime"
                type="datetime-local"
                value={eventForm.endDateTime.slice(0, 16)}
                onChange={(e) => setEventForm({...eventForm, endDateTime: e.target.value})}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="attendees" className="text-right pt-2">
                {t('contacts.page.appointment.form.attendees_label', 'Attendees')}
              </Label>
              <div className="col-span-3 space-y-2">
                <div className="flex space-x-2">
                  <Input data-tour="pages-contacts.input.contacts.page.appointment.form.attendees_placeholder"
                    id="attendees"
                    placeholder={t('contacts.page.appointment.form.attendees_placeholder', 'Enter email address')}
                    value={eventForm.attendeeInput}
                    onChange={(e) => setEventForm({...eventForm, attendeeInput: e.target.value})}
                    className="flex-1"
                  />
                  <Button data-tour="pages-contacts.button.contacts.page.appointment.form.add_button" type="button" className="btn-brand-primary" onClick={handleAddAttendee}>
                    {t('contacts.page.appointment.form.add_button', 'Add')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {eventForm.attendees.map(email => (
                    <Badge key={email} variant="secondary" className="gap-1">
                      {email}
                      <button
                        type="button"
                        onClick={() => handleRemoveAttendee(email)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-contacts.button.common.cancel" type="button" variant="outline" className="btn-brand-primary" onClick={() => setIsAppointmentModalOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-contacts.button.contacts.page.appointment.form.creating"
              type="button"
              onClick={handleCreateEvent}
              disabled={createEventMutation.isPending}
            >
              {createEventMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('contacts.page.appointment.form.creating', 'Creating...')}
                </>
              ) : t('contacts.page.appointment.form.create_button', 'Create Appointment')}
            </Button>
          </DialogFooter>
        </DialogContent>
        </DialogPortal>
      </Dialog>

      {/* Call Type Selection Modal */}
      {/* Channel picker for Message -> Inbox: choose channel then navigate to /inbox */}
      <Dialog open={!!messageContactForChannel} onOpenChange={(open) => !open && setMessageContactForChannel(null)}>
        <DialogContent data-tour="pages-contacts.dialogcontent.contacts.choose_channel" className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>
              {t('contacts.choose_channel', 'Choose channel to message')}
              {messageContactForChannel && ` ${messageContactForChannel.name}`}
            </DialogTitle>
            <DialogDescription>
              {t('contacts.choose_channel_desc', 'Select a channel to open the conversation in the inbox.')}
            </DialogDescription>
          </DialogHeader>
          {activeChannelsForMessage.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              {t('inbox.no_active_channels', 'No active channels available')}
            </p>
          ) : (
            <div className="grid gap-2 py-2">
              {activeChannelsForMessage.map((channel: { id: number; channelType: string; accountName?: string; accountId?: string; status: string | null }) => (
                <Button
                  key={channel.id}
                  variant="outline"
                  className="justify-start h-auto py-3 px-3"
                  onClick={() => handleMessageChannelSelected(channel.id, channel.channelType)}
                >
                  <span className="flex items-center gap-2 w-full">
                    <span>{getChannelIcon(channel.channelType)}</span>
                    <span className="truncate">{getChannelDisplayName(channel)}</span>
                  </span>
                </Button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {canAccessPipeline() && (isAddDealModalOpen || isEditDealModalOpen || isSavedDealDetailsOpen) && (
        <PipelineProvider syncUrl={false}>
          <AddDealModal
            isOpen={isAddDealModalOpen}
            onClose={handleCloseAddDealModal}
            initialContactId={selectedContactIdForAddDeal}
            showPipelineSelector
            onDealCreated={(createdDeal) => {
              const contactIdForAddDeal = selectedContactIdForAddDeal;
              handleCloseAddDealModal();
              void handleOpenSavedDealDetails(createdDeal, { fallbackContactId: contactIdForAddDeal });
            }}
          />
          <EditDealModal
            isOpen={isEditDealModalOpen}
            onClose={handleCloseEditDealModal}
            deal={selectedDealForEdit}
            showPipelineSelector
            onDealUpdated={(updatedDeal) => {
              const previousContactId = selectedDealForEdit?.contactId ?? null;
              handleCloseEditDealModal();
              void handleOpenSavedDealDetails(updatedDeal, { previousContactId });
            }}
          />
          <DealDetailsModal
            deal={savedDealForDetails}
            isOpen={isSavedDealDetailsOpen}
            onClose={handleCloseSavedDealDetailsModal}
          />
        </PipelineProvider>
      )}

      <SalesOrderCreateDialog
        open={isQuotationDialogOpen}
        onOpenChange={setIsQuotationDialogOpen}
        mode="quotation"
        fixedContact={selectedContactForDetail ? {
          id: Number(selectedContactForDetail.id),
          name: selectedContactForDetail.name,
        } : null}
        requireLineItems
        allowCreateAndSend
        onCreated={(order: CreatedSalesOrder, intent) => {
          queryClient.invalidateQueries({ queryKey: ['/api/erp/sales-orders', 'contact-sales', order.contactId] });
          if (intent === 'send') setQuotationSendTarget(order);
        }}
      />

      <SendQuotationDialog
        open={quotationSendTarget !== null}
        onOpenChange={(open) => {
          if (!open) setQuotationSendTarget(null);
        }}
        order={quotationSendTarget}
      />

      <CallChannelWizard
        isOpen={isCallTypeModalOpen}
        onClose={() => setIsCallTypeModalOpen(false)}
        onStart={handleCallTypeSelected}
        contactId={selectedContactForCall?.id}
        contactName={selectedContactForCall?.name}
        isStarting={initiateContactCallMutation.isPending}
      />

      {/* Call Screen Modal */}
      {activeCallData?.provider === 'whatsapp' ? <WhatsAppCallScreenModal
        isOpen={isCallScreenOpen}
        onClose={() => { setIsCallScreenOpen(false); setActiveCallData(null); }}
        callId={Number(activeCallData.callId)}
        contactName={activeCallData.contactName}
        rtcSessionKey={activeCallData.rtcSessionKey}
      /> : <CallScreenModal
        isOpen={isCallScreenOpen}
        onClose={() => {
          setIsCallScreenOpen(false);
          setActiveCallData(null);
        }}
        callId={activeCallData?.callId || ''}
        contactName={activeCallData?.contactName || ''}
        contactPhone={activeCallData?.contactPhone || ''}
        contactAvatar={activeCallData?.contactAvatar}
        conferenceName={activeCallData?.conferenceName}
        channelId={activeCallData?.channelId || channelConnections.find(conn => conn.channelType === 'twilio_voice' && conn.status === 'active')?.id}
        callType={activeCallData?.callType}
        providerStack={activeCallData?.providerStack}
        supportsBrowserDirect={activeCallData?.supportsBrowserDirect}
      />}
    </div>
  );
}
