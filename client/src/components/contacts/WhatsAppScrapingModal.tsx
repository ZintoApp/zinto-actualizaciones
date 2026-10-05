import { readContactAddResult, refreshContactQueries } from './contact-add-result';
import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from '@/hooks/use-translation';
import { CompanyContactCustomField, useCompanyContactCustomFields } from '@/hooks/use-company-contact-custom-fields';
import { Loader2, CheckCircle, User, ChevronDown, ChevronUp, Square } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import {
  addScrapedContactTag,
  buildScrapedContactPayload,
  parseScrapedContactTags,
  SCRAPING_TAG_SUGGESTIONS,
  sanitizeScrapedContactCustomFields,
  toggleScrapedContactTag
} from './scraped-contact-utils';
import {
  buildStoppedScrapingStats,
  hasScrapingResultsFooter,
  isScrapeAbortError,
  ScrapingProgressStats,
} from './scraping-flow-utils';


const GOOGLE_MAPS_SCRAPE_MAX_RESULTS = 700;

interface ScrapedContact {
  phoneNumber: string;
  jid: string;
  profilePicture?: string;
  name?: string;
  email?: string | null;
}

interface WhatsAppConnection {
  id: number;
  accountName: string;
  status: string;
  channelType: string;
}

interface WhatsAppScrapingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WhatsAppScrapingModal({ isOpen, onClose }: WhatsAppScrapingModalProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [scrapingSource, setScrapingSource] = useState<'whatsapp' | 'googlemaps'>('whatsapp');
  const [startingNumber, setStartingNumber] = useState('');
  const [count, setCount] = useState('100');
  const [searchTerm, setSearchTerm] = useState('');
  const [maxResults, setMaxResults] = useState('20');
  const [location, setLocation] = useState('');
  const [selectedTagsInput, setSelectedTagsInput] = useState('');
  const [isTagSectionExpanded, setIsTagSectionExpanded] = useState(false);
  const [selectedCustomFields, setSelectedCustomFields] = useState<Record<string, any>>({});
  const [isCustomFieldsSectionExpanded, setIsCustomFieldsSectionExpanded] = useState(false);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(null);


  const [isScrapingInProgress, setIsScrapingInProgress] = useState(false);
  const [scrapingResults, setScrapingResults] = useState<ScrapedContact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [scrapingStats, setScrapingStats] = useState<ScrapingProgressStats | null>(null);


  const [scrapingStatus, setScrapingStatus] = useState<string>('');
  const [recentlyFound, setRecentlyFound] = useState<ScrapedContact[]>([]);
  const activeScrapeAbortControllerRef = useRef<AbortController | null>(null);
  const activeScrapeReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const stopScrapeRequestedRef = useRef(false);


  const { data: connections = [], isLoading: isLoadingConnections } = useQuery({
    queryKey: ['/api/channel-connections'],

    select: (data: WhatsAppConnection[]) => {


      const filtered = data.filter((conn: WhatsAppConnection) =>
        (conn.channelType === 'whatsapp_unofficial' || conn.channelType === 'whatsapp') &&
        conn.status === 'active'
      );

      return filtered;
    },
    enabled: isOpen
  });

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
    staleTime: 5 * 60 * 1000,
    enabled: isOpen
  });

  const { data: contactCustomFieldsSchema = [] } = useCompanyContactCustomFields({
    enabled: isOpen
  });

  const scrapingModalTitle = scrapingSource === 'whatsapp'
    ? t('contacts.scraping.title', 'Scrape WhatsApp Contacts')
    : t('contacts.scraping.google_maps_title', 'Scrape Google Maps Contacts');

  const scrapingModalDescription = scrapingSource === 'whatsapp'
    ? t('contacts.scraping.description', 'Check sequential phone numbers for active WhatsApp accounts and add them to your contacts.')
    : t('contacts.scraping.google_maps_description', 'Search Google Maps for businesses and validate their phone numbers on WhatsApp.');

  const unknownErrorMessage = t('contacts.scraping.unknown_error', 'Unknown error');


  useEffect(() => {
    if (connections.length === 1 && !selectedConnectionId) {

      setSelectedConnectionId(connections[0].id);
    }
  }, [connections, selectedConnectionId]);

  const stopActiveScrapeRequest = () => {
    stopScrapeRequestedRef.current = true;

    const activeReader = activeScrapeReaderRef.current;
    if (activeReader) {
      void activeReader.cancel().catch(() => undefined);
    }

    activeScrapeReaderRef.current = null;
    activeScrapeAbortControllerRef.current?.abort();
    activeScrapeAbortControllerRef.current = null;
  };


  const startScrapingWithSSE = async (data: { startingNumber?: string; count?: number; searchTerm?: string; maxResults?: number; connectionId: number; location?: string }) => {
    const abortController = new AbortController();
    stopScrapeRequestedRef.current = false;
    activeScrapeAbortControllerRef.current = abortController;

    try {
      setIsScrapingInProgress(true);
      setScrapingResults([]);
      setSelectedContacts(new Set());
      setRecentlyFound([]);
      setSelectedTagsInput('');
      setIsTagSectionExpanded(false);
      setSelectedCustomFields({});
      setIsCustomFieldsSectionExpanded(false);
      setScrapingStats({
        totalChecked: 0,
        validCount: 0,
        errors: [],
        totalToCheck: scrapingSource === 'whatsapp' ? (data.count || 100) : (data.maxResults || 20),
        progress: 0,
        isCompleted: false,
        wasStopped: false
      });
      setScrapingStatus(t('contacts.scraping.connecting_status', 'Connecting...'));

      const endpoint = scrapingSource === 'whatsapp' 
        ? '/api/contacts/scrape-whatsapp'
        : '/api/contacts/scrape-google-maps';

      const requestBody = scrapingSource === 'whatsapp'
        ? { startingNumber: data.startingNumber, count: data.count, connectionId: data.connectionId }
        : { searchTerm: data.searchTerm, maxResults: data.maxResults, connectionId: data.connectionId, location: data.location };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || t('contacts.scraping.start_failed', 'Failed to start scraping'));
      }

      if (!response.body) {
        throw new Error(t('contacts.scraping.no_response_body', 'No response body received'));
      }

      const reader = response.body.getReader();
      activeScrapeReaderRef.current = reader;
      const decoder = new TextDecoder();
      let bufferedChunk = '';

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          bufferedChunk += decoder.decode(value, { stream: true });
          const lines = bufferedChunk.split('\n');
          bufferedChunk = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const eventData = JSON.parse(line.slice(6));
                handleScrapingUpdate(eventData);
              } catch (parseError) {

              }
            }
          }
        }

        const trailingLine = bufferedChunk.trim();
        if (trailingLine.startsWith('data: ')) {
          const eventData = JSON.parse(trailingLine.slice(6));
          handleScrapingUpdate(eventData);
        }
      } finally {
        activeScrapeReaderRef.current = null;
        reader.releaseLock();
      }

    } catch (error) {
      setIsScrapingInProgress(false);

      if (stopScrapeRequestedRef.current || isScrapeAbortError(error)) {
        setScrapingStatus(t('contacts.scraping.stopped_status', 'Scraping stopped.'));
        setScrapingStats((prev) => buildStoppedScrapingStats(prev));
        return;
      }

      setScrapingStatus(t('contacts.scraping.failed_status', 'Scraping failed'));

      toast({
        title: t('contacts.scraping.error_title', 'Scraping failed'),
        description: error instanceof Error ? error.message : unknownErrorMessage,
        variant: "destructive",
      });
    } finally {
      activeScrapeReaderRef.current = null;
      activeScrapeAbortControllerRef.current = null;
      stopScrapeRequestedRef.current = false;
    }
  };


  const handleScrapingUpdate = (update: any) => {
    switch (update.type) {
      case 'started':
        setScrapingStatus(t('contacts.scraping.started_status', 'Scraping started...'));
        setScrapingStats(prev => ({
          ...prev,
          totalToCheck: update.totalToCheck,
          totalChecked: 0,
          validCount: 0,
          errors: [],
          progress: 0
        }));
        break;

      case 'query_expanded':
        setScrapingStatus(t('contacts.scraping.expanding_search_status', 'Expanding search...'));
        break;

      case 'place_found':
        setScrapingStatus(t('contacts.scraping.processing_place_status', 'Processing: {{place}}', {
          place: update.placeName || t('contacts.scraping.unknown_place', 'Unknown place')
        }));
        setScrapingStats(prev => ({
          ...prev,
          totalChecked: update.totalChecked,
          validCount: update.validCount,
          progress: update.progress,
          errors: prev?.errors || []
        }));
        break;

      case 'batch_started':
        setScrapingStatus(t('contacts.scraping.processing_batch_status', 'Processing batch {{current}} of {{total}}...', {
          current: update.batchNumber,
          total: update.totalBatches
        }));
        setScrapingStats(prev => ({
          ...prev,
          currentBatch: update.batchNumber,
          totalBatches: update.totalBatches,
          totalChecked: update.totalChecked,
          validCount: update.validCount,
          errors: prev?.errors || []
        }));
        break;

      case 'checking_number':
        setScrapingStatus(
          update.phoneNumber
            ? t('contacts.scraping.checking_status', 'Checking {{phone}}...', {
                phone: update.phoneNumber
              })
            : t('contacts.scraping.checking_number_status', 'Checking phone number...')
        );
        setScrapingStats(prev => ({
          ...prev,
          currentPhoneNumber: update.phoneNumber,
          totalChecked: update.totalChecked,
          validCount: update.validCount,
          progress: update.progress,
          errors: prev?.errors || []
        }));
        break;

      case 'contact_found':

        setScrapingResults(prev => [...prev, update.contact]);
        setScrapingStats(prev => ({
          ...prev,
          totalChecked: update.totalChecked,
          validCount: update.validCount,
          progress: update.progress,
          errors: prev?.errors || []
        }));
        setScrapingStatus(t('contacts.scraping.found_status', 'Found: {{name}}', {
          name: update.contact.name || update.contact.phoneNumber
        }));


        setRecentlyFound(prev => {
          const newRecent = [update.contact, ...prev.slice(0, 4)]; // Keep last 5
          return newRecent;
        });


        setTimeout(() => {
          setRecentlyFound(prev => prev.filter(c => c.phoneNumber !== update.contact.phoneNumber));
        }, 3000);
        break;

      case 'number_invalid':
        setScrapingStats(prev => ({
          ...prev,
          totalChecked: update.totalChecked,
          validCount: update.validCount,
          progress: update.progress,
          errors: prev?.errors || []
        }));
        break;

      case 'number_error':
        setScrapingStats(prev => ({
          ...prev,
          totalChecked: update.totalChecked,
          validCount: update.validCount,
          errors: update.error ? [...(prev?.errors || []), update.error] : (prev?.errors || []),
          progress: update.progress
        }));
        break;

      case 'batch_completed':
        setScrapingStatus(t('contacts.scraping.completed_batch_status', 'Completed batch {{current}} of {{total}}', {
          current: update.batchNumber,
          total: update.totalBatches
        }));
        break;

      case 'batch_delay':
        setScrapingStatus(t('contacts.scraping.waiting_for_next_batch_status', 'Waiting before batch {{current}} of {{total}}...', {
          current: update.nextBatchNumber,
          total: update.totalBatches
        }));
        break;

      case 'completed':
        setIsScrapingInProgress(false);
        setScrapingStats(prev => ({
          ...prev,
          totalChecked: update.totalChecked,
          validCount: update.validCount,
          errors: update.errors,
          progress: 100,
          isCompleted: true,
          wasStopped: false
        }));
        setScrapingStatus(t('contacts.scraping.completed_status', 'Scraping completed!'));

        toast({
          title: t('contacts.scraping.success_title', 'Scraping completed'),
          description: scrapingSource === 'whatsapp'
            ? t('contacts.scraping.success_description', 'Found {{count}} valid WhatsApp numbers', {
                count: update.validCount || 0
              })
            : t('contacts.scraping.google_maps_success_description', 'Found {{count}} Google Maps contacts with valid WhatsApp numbers', {
                count: update.validCount || 0
              }),
        });
        break;

      case 'error':
        setIsScrapingInProgress(false);
        setScrapingStatus(t('contacts.scraping.failed_status', 'Scraping failed'));
        toast({
          title: t('contacts.scraping.error_title', 'Scraping failed'),
          description: update.error || unknownErrorMessage,
          variant: "destructive",
        });
        break;

      default:

        break;
    }
  };


  const addContactsMutation = useMutation({
    mutationFn: async (contacts: ScrapedContact[]) => {
      const contactsData = contacts.map((contact) =>
        buildScrapedContactPayload(contact, scrapingSource, selectedTagsInput, selectedCustomFields)
      );

      const promises = contactsData.map((contactData) =>
        apiRequest('POST', '/api/contacts', contactData).then(response => readContactAddResult<{ id: number; isArchived?: boolean }>(response))
      );

      const responses = await Promise.allSettled(promises);
      const successful = responses.filter(result => result.status === 'fulfilled').length;
      const failed = responses.filter(result => result.status === 'rejected').length;

      if (successful === 0) {
        throw new Error(t('contacts.scraping.add_selected_failed', 'Failed to add selected contacts'));
      }

      const added = responses.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      return { successful, failed, total: contacts.length,
        created: added.filter(result => result.created).length,
        existing: added.filter(result => !result.created).length,
        archived: added.filter(result => result.contact.isArchived).length,
      };
    },
    onSuccess: (data) => {
      refreshContactQueries(queryClient);
      toast({
        title: t('contacts.scraping.add_success_title', 'Contacts added'),
        description: t('contacts.scraping.add_result', '{{created}} created, {{existing}} existing contacts added, {{failed}} failed. {{archived}} are archived; use the Archived filter to find them.', data),
      });


      resetModal();
      onClose();
    },
    onError: (error: Error) => {
      toast({
        title: t('contacts.scraping.add_error_title', 'Failed to add contacts'),
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const resetModal = () => {
    stopActiveScrapeRequest();
    setScrapingSource('whatsapp');
    setStartingNumber('');
    setCount('100');
    setSearchTerm('');
    setMaxResults('20');
    setLocation('');
    setSelectedTagsInput('');
    setIsTagSectionExpanded(false);
    setSelectedCustomFields({});
    setIsCustomFieldsSectionExpanded(false);
    setSelectedConnectionId(null);
    setIsScrapingInProgress(false);
    setScrapingResults([]);
    setSelectedContacts(new Set());
    setScrapingStats(null);
    setScrapingStatus('');
    setRecentlyFound([]);
  };

  const handleStopScraping = () => {
    if (!isScrapingInProgress) {
      return;
    }

    stopActiveScrapeRequest();
    setIsScrapingInProgress(false);
    setScrapingStatus(t('contacts.scraping.stopped_status', 'Scraping stopped.'));
    setScrapingStats((prev) => buildStoppedScrapingStats(prev));
  };

  const handleStartScraping = () => {
    if (!selectedConnectionId) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.scraping.connection_required', 'Please select a WhatsApp connection'),
        variant: 'destructive'
      });
      return;
    }

    if (scrapingSource === 'whatsapp') {
      if (!startingNumber.trim()) {
        toast({
          title: t('common.error', 'Error'),
          description: t('contacts.scraping.starting_number_required', 'Starting phone number is required'),
          variant: 'destructive'
        });
        return;
      }

      const phoneRegex = /^\d{10,15}$/;
      if (!phoneRegex.test(startingNumber)) {
        toast({
          title: t('common.error', 'Error'),
          description: t('contacts.scraping.invalid_phone_format', 'Invalid phone number format. Use digits only (10-15 digits)'),
          variant: 'destructive'
        });
        return;
      }

      const countNum = parseInt(count);
      if (isNaN(countNum) || countNum < 1 || countNum > 1000) {
        toast({
          title: t('common.error', 'Error'),
          description: t('contacts.scraping.invalid_count', 'Count must be between 1 and 1000'),
          variant: 'destructive'
        });
        return;
      }

      startScrapingWithSSE({
        startingNumber: startingNumber.trim(),
        count: countNum,
        connectionId: selectedConnectionId,
        location: undefined
      });
    } else {

      if (!searchTerm.trim()) {
        toast({
          title: t('common.error', 'Error'),
          description: t('contacts.scraping.search_term_required', 'Search term is required'),
          variant: 'destructive'
        });
        return;
      }

      if (searchTerm.length > 200) {
        toast({
          title: t('common.error', 'Error'),
          description: t('contacts.scraping.search_term_too_long', 'Search term cannot exceed 200 characters'),
          variant: 'destructive'
        });
        return;
      }

      const maxResultsNum = parseInt(maxResults);
      if (isNaN(maxResultsNum) || maxResultsNum < 1 || maxResultsNum > GOOGLE_MAPS_SCRAPE_MAX_RESULTS) {
        toast({
          title: t('common.error', 'Error'),
          description: t('contacts.scraping.max_results_invalid', 'Max results must be between 1 and {{max}}', {
            max: GOOGLE_MAPS_SCRAPE_MAX_RESULTS
          }),
          variant: 'destructive'
        });
        return;
      }

      startScrapingWithSSE({
        searchTerm: searchTerm.trim(),
        maxResults: maxResultsNum,
        connectionId: selectedConnectionId,
        location: location.trim() || undefined
      });
    }
  };

  const handleContactToggle = (phoneNumber: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(phoneNumber)) {
      newSelected.delete(phoneNumber);
    } else {
      newSelected.add(phoneNumber);
    }
    setSelectedContacts(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedContacts.size === scrapingResults.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(scrapingResults.map(contact => contact.phoneNumber)));
    }
  };

  const handleAddSelectedContacts = () => {
    const contactsToAdd = scrapingResults.filter(contact => 
      selectedContacts.has(contact.phoneNumber)
    );

    if (contactsToAdd.length === 0) {
      toast({
        title: t('common.error', 'Error'),
        description: t('contacts.scraping.no_contacts_selected', 'Please select at least one contact to add'),
        variant: 'destructive'
      });
      return;
    }

    addContactsMutation.mutate(contactsToAdd);
  };

  const handleClose = () => {
    if (isScrapingInProgress) {
      toast({
        title: t('common.warning', 'Warning'),
        description: t('contacts.scraping.scraping_in_progress', 'Scraping is in progress. Please wait for it to complete.'),
        variant: 'destructive'
      });
      return;
    }
    resetModal();
    onClose();
  };


  useEffect(() => {
    if (isOpen) {
      resetModal();
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      stopActiveScrapeRequest();
    };
  }, []);

  const showScrapingResultsActions = hasScrapingResultsFooter(isScrapingInProgress, scrapingResults.length);
  const wasScrapingStopped = Boolean(scrapingStats?.wasStopped && !scrapingStats?.isCompleted);

  const selectedTagValues = parseScrapedContactTags(selectedTagsInput);
  const sanitizedCustomFieldValues = sanitizeScrapedContactCustomFields(selectedCustomFields);
  const availableTagOptions = Array.from(
    new Set(
      availableTags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );

  const selectedCustomFieldCount = Object.keys(sanitizedCustomFieldValues).length;

  const updateSelectedCustomField = (fieldName: string, value: any) => {
    setSelectedCustomFields((prev) => ({
      ...prev,
      [fieldName]: value
    }));
  };

  const renderTagSelection = () => (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3 sm:p-4">
      <button data-tour="components-contacts-whatsappscrapingmodal.button.contacts.scraping.tags_label"
        type="button"
        onClick={() => setIsTagSectionExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={isTagSectionExpanded}
      >
        <div className="min-w-0">
          <div className="text-sm sm:text-base font-medium text-foreground">
            {t('contacts.scraping.tags_label', 'Contact Tags')}
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {isTagSectionExpanded
              ? t('contacts.scraping.tags_help', 'These tags will be applied to every selected contact you add to the database.')
              : t('contacts.scraping.tags_collapsed_help', 'Expand to assign tags before adding contacts to the database.')}
          </p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground flex-shrink-0">
          {selectedTagValues.length > 0 && (
            <span className="text-xs rounded-full bg-background px-2 py-1 border border-border text-foreground">
              {t('contacts.scraping.tags_selected_count', '{{count}} selected', { count: selectedTagValues.length })}
            </span>
          )}
          {isTagSectionExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {isTagSectionExpanded && (
        <>
          <div className="space-y-2">
            <div className="relative">
              <Input data-tour="components-contacts-whatsappscrapingmodal.input.contacts.scraping.tags_placeholder"
                id="scraping-contact-tags"
                value={selectedTagsInput}
                onChange={(e) => setSelectedTagsInput(e.target.value)}
                placeholder={t('contacts.scraping.tags_placeholder', 'Type tags separated by commas...')}
                disabled={addContactsMutation.isPending}
                className="focus:ring-2 focus:ring-primary-500"
              />
              <i className="ri-price-tag-3-line absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"></i>
            </div>
          </div>

          <div className="flex flex-wrap gap-1">
            {SCRAPING_TAG_SUGGESTIONS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTagsInput((prev) => addScrapedContactTag(prev, tag))}
                className="px-2 py-1 text-xs bg-muted hover:bg-accent text-foreground rounded-full transition-colors"
                disabled={addContactsMutation.isPending}
              >
                + {tag}
              </button>
            ))}
          </div>

          {availableTagOptions.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">
                {t('contacts.scraping.available_tags', 'Available tags:')}
              </div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {availableTagOptions.map((tag) => {
                  const isSelected = selectedTagValues.includes(tag);

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTagsInput((prev) => toggleScrapedContactTag(prev, tag))}
                      className={`px-2 py-1 text-xs rounded border transition-colors ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted hover:bg-muted/80 border-border'
                      }`}
                      disabled={addContactsMutation.isPending}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  const renderCustomFieldsSelection = () => {
    if (contactCustomFieldsSchema.length === 0) {
      return null;
    }

    return (
      <div className="space-y-3 rounded-lg border bg-muted/30 p-3 sm:p-4">
        <button data-tour="components-contacts-whatsappscrapingmodal.button.contacts.scraping.custom_fields_label"
          type="button"
          onClick={() => setIsCustomFieldsSectionExpanded((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={isCustomFieldsSectionExpanded}
        >
          <div className="min-w-0">
            <div className="text-sm sm:text-base font-medium text-foreground">
              {t('contacts.scraping.custom_fields_label', 'Custom Fields')}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">
              {isCustomFieldsSectionExpanded
                ? t('contacts.scraping.custom_fields_help', 'These custom field values will be applied to every selected contact you add to the database.')
                : t('contacts.scraping.custom_fields_collapsed_help', 'Expand to assign custom fields before adding contacts to the database.')}
            </p>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground flex-shrink-0">
            {selectedCustomFieldCount > 0 && (
              <span className="text-xs rounded-full bg-background px-2 py-1 border border-border text-foreground">
                {t('contacts.scraping.custom_fields_selected_count', '{{count}} selected', { count: selectedCustomFieldCount })}
              </span>
            )}
            {isCustomFieldsSectionExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {isCustomFieldsSectionExpanded && (
          <div className="space-y-3">
            {contactCustomFieldsSchema.map((field: CompanyContactCustomField) => (
              <div key={field.id} className="space-y-2">
                <Label htmlFor={`scraping-cf-${field.fieldName}`} className="text-sm font-medium">
                  {field.fieldLabel}
                  {field.required ? <span className="ml-0.5 text-destructive" aria-hidden="true">*</span> : null}
                  {field.fieldType === 'multi_select' && (
                    <span className="text-muted-foreground"> {t('contacts.scraping.select_multiple_hint', '(select multiple)')}</span>
                  )}
                </Label>

                {field.fieldType === 'text' && (
                  <Input data-tour="components-contacts-whatsappscrapingmodal.input.contacts.add.enter_value"
                    id={`scraping-cf-${field.fieldName}`}
                    value={selectedCustomFields[field.fieldName] ?? ''}
                    onChange={(e) => updateSelectedCustomField(field.fieldName, e.target.value)}
                    placeholder={t('contacts.add.enter_value', 'Enter value...')}
                    disabled={addContactsMutation.isPending}
                  />
                )}

                {field.fieldType === 'number' && (
                  <Input data-tour="components-contacts-whatsappscrapingmodal.input.contacts.add.enter_value"
                    id={`scraping-cf-${field.fieldName}`}
                    type="number"
                    value={selectedCustomFields[field.fieldName] ?? ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? undefined : parseFloat(e.target.value);
                      updateSelectedCustomField(field.fieldName, value !== undefined && !Number.isNaN(value) ? value : undefined);
                    }}
                    placeholder={t('contacts.add.enter_value', 'Enter value...')}
                    disabled={addContactsMutation.isPending}
                  />
                )}

                {field.fieldType === 'select' && (
                  <Select
                    value={selectedCustomFields[field.fieldName] ?? ''}
                    onValueChange={(value) => updateSelectedCustomField(field.fieldName, value)}
                    disabled={addContactsMutation.isPending}
                  >
                    <SelectTrigger data-tour="components-contacts-whatsappscrapingmodal.selecttrigger.contacts.add.select_option" id={`scraping-cf-${field.fieldName}`}>
                      <SelectValue placeholder={t('contacts.add.select_option', 'Select...')} />
                    </SelectTrigger>
                    <SelectContent>
                      {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                        const value = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                        const label = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');

                        return (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                )}

                {field.fieldType === 'multi_select' && (
                  <div className="flex flex-wrap gap-2">
                    {(field.options && Array.isArray(field.options) ? field.options : []).map((opt: { value?: string; label?: string } | string) => {
                      const value = typeof opt === 'string' ? opt : (opt.value ?? opt.label ?? '');
                      const label = typeof opt === 'string' ? opt : (opt.label ?? opt.value ?? '');
                      const selected = Array.isArray(selectedCustomFields[field.fieldName])
                        ? selectedCustomFields[field.fieldName].includes(value)
                        : false;

                      return (
                        <div key={value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`scraping-cf-${field.fieldName}-${value}`}
                            checked={selected}
                            onCheckedChange={(checked) => {
                              const current = Array.isArray(selectedCustomFields[field.fieldName])
                                ? selectedCustomFields[field.fieldName]
                                : [];
                              const next = checked
                                ? [...current, value]
                                : current.filter((entry: string) => entry !== value);
                              updateSelectedCustomField(field.fieldName, next);
                            }}
                            disabled={addContactsMutation.isPending}
                          />
                          <label htmlFor={`scraping-cf-${field.fieldName}-${value}`} className="text-sm cursor-pointer">
                            {label}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}

                {field.fieldType === 'date' && (
                  <Input
                    id={`scraping-cf-${field.fieldName}`}
                    type="date"
                    value={selectedCustomFields[field.fieldName] ?? ''}
                    onChange={(e) => updateSelectedCustomField(field.fieldName, e.target.value || undefined)}
                    disabled={addContactsMutation.isPending}
                  />
                )}

                {field.fieldType === 'boolean' && (() => {
                  const boolOptions = field.options && !Array.isArray(field.options)
                    ? (field.options as { trueLabel?: string; falseLabel?: string })
                    : null;
                  const trueLabel = boolOptions?.trueLabel ?? t('common.yes', 'Yes');
                  const falseLabel = boolOptions?.falseLabel ?? t('common.no', 'No');

                  return (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id={`scraping-cf-${field.fieldName}`}
                        checked={!!selectedCustomFields[field.fieldName]}
                        onCheckedChange={(checked) => updateSelectedCustomField(field.fieldName, !!checked)}
                        disabled={addContactsMutation.isPending}
                      />
                      <label htmlFor={`scraping-cf-${field.fieldName}`} className="text-sm">
                        {selectedCustomFields[field.fieldName] ? trueLabel : falseLabel}
                      </label>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderContactAssignmentSections = () => (
    <div className="space-y-3">
      {renderTagSelection()}
      {renderCustomFieldsSelection()}
    </div>
  );

  const renderScrapedContactEmailLine = (contact: ScrapedContact) => {
    if (contact.email) {
      return (
        <div className="text-xs text-muted-foreground truncate">
          {contact.email}
        </div>
      );
    }

    if (scrapingSource === 'googlemaps') {
      return (
        <div className="text-xs text-muted-foreground truncate">
          {t('contacts.scraping.no_email_found', 'No email found')}
        </div>
      );
    }

    return null;
  };

  const renderSelectAllControls = (checkboxId: string) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
      <div className="flex items-center gap-2">
        <Checkbox
          id={checkboxId}
          checked={selectedContacts.size === scrapingResults.length && scrapingResults.length > 0}
          onCheckedChange={handleSelectAll}
        />
        <Label htmlFor={checkboxId} className="cursor-pointer text-xs sm:text-sm">
          {selectedContacts.size === scrapingResults.length && scrapingResults.length > 0
            ? t('contacts.scraping.deselect_all', 'Deselect All')
            : t('contacts.scraping.select_all', 'Select All')
          }
        </Label>
      </div>
      <span className="text-xs sm:text-sm text-muted-foreground">
        {t('contacts.scraping.selected_count', '{{selected}} of {{total}} selected', {
          selected: selectedContacts.size,
          total: scrapingResults.length
        })}
      </span>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent contentNoScroll className="w-[98vw] max-w-7xl max-h-[90vh] overflow-hidden p-0 gap-0 [&>div]:overflow-hidden [&>div]:p-0 [&>div]:pr-0">
        <div className="flex flex-col h-full max-h-[90vh] overflow-hidden">
        <DialogHeader className="px-4 sm:px-6 py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            {scrapingModalTitle}
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base">
            {scrapingModalDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 min-h-0">

          {!isScrapingInProgress && scrapingResults.length === 0 && (
            <div className="space-y-4 sm:space-y-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div className="space-y-4 rounded-xl border bg-muted/20 p-4 sm:p-5">
                  <div className="space-y-2">
                    <Label htmlFor="scrapingSource" className="text-sm sm:text-base font-medium">
                      {t('contacts.scraping.source_label', 'Scraping Source')}
                    </Label>
                    <Select value={scrapingSource} onValueChange={(value: 'whatsapp' | 'googlemaps') => setScrapingSource(value)}>
                      <SelectTrigger data-tour="components-contacts-whatsappscrapingmodal.selecttrigger.scrapingSource" id="scrapingSource" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="whatsapp">{t('contacts.scraping.source_whatsapp', 'WhatsApp Sequential Numbers')}</SelectItem>
                        <SelectItem value="googlemaps">{t('contacts.scraping.source_google_maps', 'Google Maps Businesses')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="connection" className="text-sm sm:text-base font-medium">
                      {t('contacts.scraping.connection_label', 'WhatsApp Connection')}
                    </Label>
                    {isLoadingConnections ? (
                      <div className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('contacts.scraping.loading_connections', 'Loading connections...')}
                      </div>
                    ) : connections.length === 0 ? (
                      <div className="text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-900">
                        {t('contacts.scraping.no_connections', 'No active WhatsApp connections found. Please set up a WhatsApp connection first.')}
                      </div>
                    ) : (
                      <select data-tour="components-contacts-whatsappscrapingmodal.select.contacts.scraping.select_connection"
                        id="connection"
                        className="w-full p-3 text-sm sm:text-base border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-primary bg-background text-foreground"
                        value={selectedConnectionId || ''}
                        onChange={(e) => setSelectedConnectionId(e.target.value ? parseInt(e.target.value) : null)}
                      >
                        <option value="">{t('contacts.scraping.select_connection', 'Select a connection...')}</option>
                        {connections.map((conn: WhatsAppConnection) => (
                          <option key={conn.id} value={conn.id}>
                            {conn.accountName} ({conn.status})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border p-4 sm:p-5">
                  {scrapingSource === 'whatsapp' ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-1">
                        <Label htmlFor="startingNumber" className="text-sm sm:text-base font-medium">
                          {t('contacts.scraping.starting_number_label', 'Starting Phone Number')}
                        </Label>
                        <Input data-tour="components-contacts-whatsappscrapingmodal.input.contacts.scraping.starting_number_placeholder"
                          id="startingNumber"
                          type="text"
                          placeholder={t('contacts.scraping.starting_number_placeholder', '923059002132')}
                          value={startingNumber}
                          onChange={(e) => setStartingNumber(e.target.value.replace(/\D/g, ''))}
                          className="font-mono text-sm sm:text-base p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {t('contacts.scraping.starting_number_help', 'Enter the starting phone number (digits only, including country code)')}
                        </p>
                      </div>

                      <div className="space-y-2 sm:col-span-1">
                        <Label htmlFor="count" className="text-sm sm:text-base font-medium">
                          {t('contacts.scraping.count_label', 'Number of Contacts to Check')}
                        </Label>
                        <Input data-tour="components-contacts-whatsappscrapingmodal.input.count"
                          id="count"
                          type="number"
                          min="1"
                          max="1000"
                          value={count}
                          onChange={(e) => setCount(e.target.value)}
                          className="text-sm sm:text-base p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {t('contacts.scraping.count_help', 'How many sequential numbers to check (maximum 1000)')}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="searchTerm" className="text-sm sm:text-base font-medium">
                          {t('contacts.scraping.search_term_label', 'Search Term')}
                        </Label>
                        <Input data-tour="components-contacts-whatsappscrapingmodal.input.contacts.scraping.search_term_placeholder"
                          id="searchTerm"
                          type="text"
                          placeholder={t('contacts.scraping.search_term_placeholder', 'Software Companies In Argentina')}
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="text-sm sm:text-base p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {t('contacts.scraping.search_term_help', 'Enter a search query to find businesses on Google Maps (e.g., "Restaurants in Buenos Aires")')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location" className="text-sm sm:text-base font-medium">
                          {t('contacts.scraping.location_label', 'Location (Optional)')}
                        </Label>
                        <Input data-tour="components-contacts-whatsappscrapingmodal.input.contacts.scraping.location_placeholder"
                          id="location"
                          type="text"
                          placeholder={t('contacts.scraping.location_placeholder', 'e.g., Buenos Aires, Argentina')}
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          className="text-sm sm:text-base p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {t('contacts.scraping.location_help', 'Add a city or country to expand the search with multiple query variations for broader coverage.')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="maxResults" className="text-sm sm:text-base font-medium">
                          {t('contacts.scraping.max_results_label', 'Max Results')}
                        </Label>
                        <Input data-tour="components-contacts-whatsappscrapingmodal.input.maxResults"
                          id="maxResults"
                          type="number"
                          min="1"
                          max={GOOGLE_MAPS_SCRAPE_MAX_RESULTS}
                          value={maxResults}
                          onChange={(e) => setMaxResults(e.target.value)}
                          className="text-sm sm:text-base p-3 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                        />
                        <p className="text-xs sm:text-sm text-muted-foreground">
                          {t('contacts.scraping.max_results_help', 'Choose how many businesses to validate (1-{{max}}). Google Maps may limit single queries, so adding a location can improve coverage.', {
                            max: GOOGLE_MAPS_SCRAPE_MAX_RESULTS
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Real-time Scraping Progress */}
          {isScrapingInProgress && (
            <div className="space-y-4 sm:space-y-6">
              {/* Progress Header */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 py-4">
                <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 animate-spin text-green-600" />
                <div className="text-center sm:text-left">
                  <h3 className="text-base sm:text-lg font-medium">{t('contacts.scraping.in_progress', 'Scraping in progress...')}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground break-words">{scrapingStatus}</p>
                </div>
              </div>

              {/* Progress Bar */}
              {scrapingStats && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="w-full bg-muted rounded-full h-2 sm:h-3">
                    <div
                      className="bg-green-600 dark:bg-green-500 h-2 sm:h-3 rounded-full transition-all duration-300"
                      style={{ width: `${scrapingStats.progress || 0}%` }}
                    ></div>
                  </div>

                  {/* Live Statistics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                    <div className="text-center p-2 bg-muted rounded-lg">
                      <div className="font-medium text-foreground text-sm sm:text-base">{scrapingStats.totalChecked || 0}</div>
                      <div className="text-muted-foreground text-xs">{t('contacts.scraping.checked', 'Checked')}</div>
                    </div>
                    <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <div className="font-medium text-green-600 dark:text-green-400 text-sm sm:text-base">{scrapingStats.validCount || 0}</div>
                      <div className="text-muted-foreground text-xs">{t('contacts.scraping.found', 'Found')}</div>
                    </div>
                    <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <div className="font-medium text-red-600 dark:text-red-400 text-sm sm:text-base">{scrapingStats.errors?.length || 0}</div>
                      <div className="text-muted-foreground text-xs">{t('contacts.scraping.errors', 'Errors')}</div>
                    </div>
                    <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <div className="font-medium text-blue-600 dark:text-blue-400 text-sm sm:text-base">{scrapingStats.progress || 0}%</div>
                      <div className="text-muted-foreground text-xs">{t('contacts.scraping.progress', 'Progress')}</div>
                    </div>
                  </div>

                  {/* Batch Progress */}
                  {scrapingStats.currentBatch && scrapingStats.totalBatches && (
                    <div className="text-center text-xs sm:text-sm text-muted-foreground bg-muted p-2 rounded-lg">
                      {t('contacts.scraping.batch_progress', 'Batch {{current}} of {{total}}', {
                        current: scrapingStats.currentBatch,
                        total: scrapingStats.totalBatches
                      })}
                    </div>
                  )}

                  {/* Current Phone Number */}
                  {scrapingStats.currentPhoneNumber && (
                    <div className="text-center text-xs sm:text-sm text-muted-foreground font-mono bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg break-all">
                      {t('contacts.scraping.checking', 'Checking: +{{phone}}', {
                        phone: scrapingStats.currentPhoneNumber
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Real-time Results Display */}
              {scrapingResults.length > 0 && (
                <div className="space-y-3 sm:space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h4 className="font-medium text-foreground text-sm sm:text-base">
                      {t('contacts.scraping.found_contacts', 'Found Contacts ({{count}})', {
                        count: scrapingResults.length
                      })}
                    </h4>
                  </div>

                  {renderContactAssignmentSections()}

                  {renderSelectAllControls('selectAllLive')}

                  {/* Live Contact List */}
                  <div className="max-h-48 sm:max-h-64 overflow-y-auto border rounded-lg">
                    {scrapingResults.map((contact) => {
                      const isRecentlyFound = recentlyFound.some(r => r.phoneNumber === contact.phoneNumber);
                      return (
                        <div
                          key={contact.phoneNumber}
                          className={`flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border-b last:border-b-0 transition-all duration-500 ${
                            isRecentlyFound
                              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900 animate-pulse'
                              : 'hover:bg-accent'
                          }`}
                        >
                          <Checkbox
                            checked={selectedContacts.has(contact.phoneNumber)}
                            onCheckedChange={() => handleContactToggle(contact.phoneNumber)}
                          />

                          {/* Profile Picture */}
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                            {contact.profilePicture ? (
                              <img
                                src={contact.profilePicture}
                                alt={contact.name || contact.phoneNumber}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <User className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                            )}
                          </div>

                          {/* Contact Info */}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-xs sm:text-sm truncate text-foreground">
                              {contact.name || contact.phoneNumber}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono truncate">
                              +{contact.phoneNumber}
                            </div>
                            {renderScrapedContactEmailLine(contact)}
                          </div>

                          {/* WhatsApp Status & New Indicator */}
                          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                            <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <CheckCircle className="h-2 w-2 sm:h-3 sm:w-3" />
                              <span className="text-xs hidden sm:inline">{t('contacts.scraping.whatsapp_badge', 'WhatsApp')}</span>
                            </div>

                            {/* Recently Found Indicator */}
                            {isRecentlyFound && (
                              <div className="text-xs bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-1 sm:px-2 py-1 rounded-full">
                                {t('contacts.scraping.new', 'New!')}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        )}

          {/* Scraping Results */}
          {!isScrapingInProgress && scrapingResults.length > 0 && (
            <div className="space-y-4 sm:space-y-6">
              {/* Results Summary */}
              <div className="bg-muted p-3 sm:p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  {wasScrapingStopped ? (
                    <Square className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-green-600 dark:text-green-400" />
                  )}
                  <h3 className="font-medium text-sm sm:text-base text-foreground">
                    {wasScrapingStopped
                      ? t('contacts.scraping.results_stopped_title', 'Scraping Stopped')
                      : t('contacts.scraping.results_title', 'Scraping Results')}
                  </h3>
                </div>
                {wasScrapingStopped && (
                  <p className="mb-3 text-xs sm:text-sm text-muted-foreground">
                    {t('contacts.scraping.results_stopped_description', 'Showing the partial results found before you stopped scraping.')}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
                  <div className="flex justify-between sm:block">
                    <span className="text-muted-foreground">{t('contacts.scraping.total_checked', 'Total Checked:')}</span>
                    <span className="ml-2 font-medium text-foreground">{scrapingStats?.totalChecked || 0}</span>
                  </div>
                  <div className="flex justify-between sm:block">
                    <span className="text-muted-foreground">{t('contacts.scraping.valid_found', 'Valid Found:')}</span>
                    <span className="ml-2 font-medium text-green-600 dark:text-green-400">{scrapingStats?.validCount || 0}</span>
                  </div>
                  <div className="flex justify-between sm:block">
                    <span className="text-muted-foreground">{t('contacts.scraping.errors', 'Errors:')}</span>
                    <span className="ml-2 font-medium text-red-600 dark:text-red-400">{scrapingStats?.errors?.length || 0}</span>
                  </div>
                </div>
                {scrapingStats?.errors && scrapingStats.errors.length > 0 && (
                  <div className="mt-3">
                    <details className="text-xs sm:text-sm">
                      <summary className="cursor-pointer text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">
                        {t('contacts.scraping.view_errors', 'View Errors')}
                      </summary>
                      <div className="mt-2 max-h-24 sm:max-h-32 overflow-y-auto bg-red-50 dark:bg-red-900/20 p-2 rounded text-red-700 dark:text-red-400">
                        {scrapingStats.errors.map((error, index) => (
                          <div key={index} className="text-xs break-words">{error}</div>
                        ))}
                      </div>
                    </details>
                  </div>
                )}
              </div>

              {renderContactAssignmentSections()}

              {renderSelectAllControls('selectAll')}

              {/* Results List */}
              <div className="max-h-64 sm:max-h-96 overflow-y-auto border rounded-lg">
                {scrapingResults.map((contact) => (
                  <div
                    key={contact.phoneNumber}
                    className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 border-b last:border-b-0 hover:bg-accent"
                  >
                    <Checkbox
                      checked={selectedContacts.has(contact.phoneNumber)}
                      onCheckedChange={() => handleContactToggle(contact.phoneNumber)}
                    />

                    {/* Profile Picture */}
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
                      {contact.profilePicture ? (
                        <img
                          src={contact.profilePicture}
                          alt={contact.name || contact.phoneNumber}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <User className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                      )}
                    </div>

                    {/* Contact Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs sm:text-sm truncate text-foreground">
                        {contact.name || contact.phoneNumber}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        +{contact.phoneNumber}
                      </div>
                      {renderScrapedContactEmailLine(contact)}
                    </div>

                    {/* WhatsApp Status */}
                    <div className="flex items-center gap-1 text-green-600 dark:text-green-400 flex-shrink-0">
                      <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span className="text-xs hidden sm:inline">{t('contacts.scraping.whatsapp_badge', 'WhatsApp')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          </div>

          <DialogFooter className="px-4 sm:px-6 py-3 border-t flex-shrink-0 mt-auto">
            {!isScrapingInProgress && scrapingResults.length === 0 && (
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                <Button data-tour="components-contacts-whatsappscrapingmodal.button.common.cancel" variant="outline" onClick={handleClose} className="w-full sm:w-auto">
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button data-tour="components-contacts-whatsappscrapingmodal.button.contacts.scraping.start_scraping"
                  onClick={handleStartScraping}
                  disabled={
                    !selectedConnectionId || 
                    connections.length === 0 ||
                    (scrapingSource === 'whatsapp' && !startingNumber.trim()) ||
                    (scrapingSource === 'googlemaps' && !searchTerm.trim())
                  }
                  className="bg-green-600 dark:bg-green-500 hover:bg-green-700 dark:hover:bg-green-600 w-full sm:w-auto"
                >
                  {t('contacts.scraping.start_scraping', 'Start Scraping')}
                </Button>
              </div>
            )}

            {showScrapingResultsActions && (
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                <Button data-tour="components-contacts-whatsappscrapingmodal.button.contacts.scraping.start_new" variant="outline" onClick={() => {
                  setScrapingResults([]);
                  setSelectedContacts(new Set());
                  setScrapingStats(null);
                  setScrapingStatus('');
                  setRecentlyFound([]);
                  setSelectedTagsInput('');
                  setIsTagSectionExpanded(false);
                  setSelectedCustomFields({});
                  setIsCustomFieldsSectionExpanded(false);
                }} className="w-full sm:w-auto order-2 sm:order-1">
                  {t('contacts.scraping.start_new', 'Start New Scraping')}
                </Button>
                <Button data-tour="components-contacts-whatsappscrapingmodal.button.common.close" variant="outline" onClick={handleClose} className="w-full sm:w-auto order-3 sm:order-2">
                  {t('common.close', 'Close')}
                </Button>
                <Button data-tour="components-contacts-whatsappscrapingmodal.button.contacts.scraping.adding"
                  onClick={handleAddSelectedContacts}
                  disabled={selectedContacts.size === 0 || addContactsMutation.isPending}
                  className="bg-green-600 hover:bg-green-700 w-full sm:w-auto order-1 sm:order-3"
                >
                  {addContactsMutation.isPending ? (
                    <>
                      <Loader2 className="h-3 w-3 sm:h-4 sm:w-4 mr-2 animate-spin" />
                      {t('contacts.scraping.adding', 'Adding...')}
                    </>
                  ) : (
                    <>
                      <User className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                      <span className="hidden sm:inline">
                        {t('contacts.scraping.add_selected', 'Add Selected Contacts ({{count}})', {
                          count: selectedContacts.size
                        })}
                      </span>
                      <span className="sm:hidden">
                        {t('contacts.scraping.add_selected_short', 'Add ({{count}})', {
                          count: selectedContacts.size
                        })}
                      </span>
                    </>
                  )}
                </Button>
              </div>
            )}

            {isScrapingInProgress && (
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto sm:items-center">
                <div className="flex-1 text-xs sm:text-sm text-muted-foreground order-2 sm:order-1">
                  {scrapingStats && (
                    <span className="break-words">
                      <span className="hidden sm:inline">
                        {t('contacts.scraping.live_progress', 'Progress: {{checked}}/{{total}} checked, {{found}} found', {
                          checked: scrapingStats.totalChecked || 0,
                          total: scrapingStats.totalToCheck || 0,
                          found: scrapingStats.validCount || 0
                        })}
                      </span>
                      <span className="sm:hidden">
                        {t('contacts.scraping.live_progress_short', '{{checked}}/{{total}} • {{found}} found', {
                          checked: scrapingStats.totalChecked || 0,
                          total: scrapingStats.totalToCheck || 0,
                          found: scrapingStats.validCount || 0
                        })}
                      </span>
                    </span>
                  )}
                </div>
                <div className="flex gap-2 order-1 sm:order-2">
                  {scrapingResults.length > 0 && (
                    <Button data-tour="components-contacts-whatsappscrapingmodal.button.contacts.scraping.adding"
                      onClick={handleAddSelectedContacts}
                      disabled={selectedContacts.size === 0 || addContactsMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 flex-1 sm:flex-none"
                      size="sm"
                    >
                      {addContactsMutation.isPending ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          {t('contacts.scraping.adding', 'Adding...')}
                        </>
                      ) : (
                        <>
                          <User className="h-3 w-3 mr-1" />
                          {t('contacts.scraping.add_selected_short', 'Add ({{count}})', {
                            count: selectedContacts.size
                          })}
                        </>
                      )}
                    </Button>
                  )}
                  <Button data-tour="components-contacts-whatsappscrapingmodal.button.contacts.scraping.stop_scraping" variant="destructive" onClick={handleStopScraping} className="flex-1 sm:flex-none">
                    <Square className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                    <span className="hidden sm:inline">{t('contacts.scraping.stop_scraping', 'Stop Scraping')}</span>
                    <span className="sm:hidden">{t('contacts.scraping.stop_scraping_short', 'Stop')}</span>
                  </Button>
                </div>
              </div>
            )}
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
