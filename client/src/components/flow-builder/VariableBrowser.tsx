import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import {
  Variable,
  Search,
  Copy,
  CheckCircle,
  Database,
  User,
  Settings,
  Workflow,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
  Bot,
  Wrench,
  History,
  Image,
  Braces as TabIconBraces,
  Variable as TabIconVariable,
} from 'lucide-react';
import { useFlowVariables, getCategoryLabel, type FlowVariable } from '@/hooks/useFlowVariables';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';

interface FlowSession {
  sessionId: string;
  status: string;
  startedAt: string;
  lastActivityAt: string;
  completedAt?: string;
  contactName?: string;
  contactPhone?: string;
  conversationId: number;
  variableCount: number;
}

interface VariableBrowserProps {
  flowId?: number;
  sessionId?: string;
  onVariableSelect?: (variable: FlowVariable) => void;
  className?: string;
  customVariables?: FlowCustomVariable[];
  additionalVariables?: FlowVariable[];
}

export function VariableBrowser({ flowId, sessionId, onVariableSelect, className, customVariables, additionalVariables = [] }: VariableBrowserProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedVariable, setCopiedVariable] = useState<string | null>(null);
  const [sessionVariables, setSessionVariables] = useState<Record<string, any>>({});
  const [sessionVariablesList, setSessionVariablesList] = useState<Array<{key: string, value: any}>>([]);
  const [loadingSessionVars, setLoadingSessionVars] = useState(false);
  const [loadingMoreVars, setLoadingMoreVars] = useState(false);
  const [hasMoreVars, setHasMoreVars] = useState(false);
  const [varsOffset, setVarsOffset] = useState(0);
  const [totalVarsCount, setTotalVarsCount] = useState(0);


  const [availableSessions, setAvailableSessions] = useState<FlowSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(sessionId || null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);


  const [clearingSessionData, setClearingSessionData] = useState(false);
  const [clearingAllSessions, setClearingAllSessions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();


  const loadMoreRef = useRef<HTMLDivElement>(null);

  const customVarNames = useMemo(
    () => new Set((customVariables ?? []).map((v) => v.name)),
    [customVariables]
  );

  const getCategoryLabelI18n = (category: FlowVariable['category']) => {
    switch (category) {
      case 'contact':
        return t('flow_builder.variable_category_contact', 'Contact Information');
      case 'message':
        return t('flow_builder.variable_category_message', 'Message Data');
      case 'system':
        return t('flow_builder.variable_category_system', 'System Variables');
      case 'flow':
        return t('flow_builder.variable_category_flow', 'Flow Variables');
      case 'captured':
        return t('flow_builder.variable_category_captured', 'Captured Variables');
      case 'custom':
        return t('flow_builder.variable_category_custom', 'Custom Variables');
      case 'media':
        return t('flow_builder.variable_category_media', 'Media Gallery');
      default:
        return getCategoryLabel(category);
    }
  };

  const getVariableLabel = (variable: FlowVariable) => {
    switch (variable.value) {
      case 'contact.name':
        return t('flow_builder.variable_contact_name_label', 'Contact Name');
      case 'contact.phone':
        return t('flow_builder.variable_contact_phone_label', 'Contact Phone');
      case 'contact.email':
        return t('flow_builder.variable_contact_email_label', 'Contact Email');
      case 'contact.username':
        return t('flow_builder.variable_contact_username_label', 'Contact WhatsApp Username');
      case 'contact.company':
        return t('flow_builder.variable_contact_company_label', 'Contact Company');
      case 'message.content':
        return t('flow_builder.variable_message_content_label', 'Message Content');
      case 'message.type':
        return t('flow_builder.variable_message_type_label', 'Message Type');
      case 'message.timestamp':
        return t('flow_builder.variable_message_timestamp_label', 'Message Timestamp');
      case 'current.timestamp':
        return t('flow_builder.variable_current_timestamp_label', 'Current Timestamp');
      case 'current.date':
        return t('flow_builder.variable_current_date_label', 'Current Date');
      case 'current.time':
        return t('flow_builder.variable_current_time_label', 'Current Time');
      case 'flow.result':
        return t('flow_builder.variable_flow_result_label', 'Flow Result');
      case 'database_query_output':
        return t('flow_builder.variable_database_query_output_label', 'Database Query Output');
      case 'code_execution_output':
        return t('flow_builder.variable_code_execution_output_label', 'Code Execution Output');
      default:
        return variable.label;
    }
  };

  const getVariableDescription = (variable: FlowVariable) => {
    switch (variable.value) {
      case 'contact.name':
        return t('flow_builder.variable_contact_name_desc', 'Full name of the contact');
      case 'contact.phone':
        return t('flow_builder.variable_contact_phone_desc', 'Phone number of the contact');
      case 'contact.email':
        return t('flow_builder.variable_contact_email_desc', 'Email address of the contact');
      case 'contact.username':
        return t('flow_builder.variable_contact_username_desc', 'WhatsApp @username of the contact');
      case 'contact.company':
        return t('flow_builder.variable_contact_company_desc', 'Company name of the contact');
      case 'message.content':
        return t('flow_builder.variable_message_content_desc', 'Text content of the message');
      case 'message.type':
        return t('flow_builder.variable_message_type_desc', 'Type of message (text, image, etc.)');
      case 'message.timestamp':
        return t('flow_builder.variable_message_timestamp_desc', 'When the message was sent');
      case 'current.timestamp':
        return t('flow_builder.variable_current_timestamp_desc', 'Current date and time');
      case 'current.date':
        return t('flow_builder.variable_current_date_desc', 'Current date (YYYY-MM-DD)');
      case 'current.time':
        return t('flow_builder.variable_current_time_desc', 'Current time (HH:MM:SS)');
      case 'flow.result':
        return t('flow_builder.variable_flow_result_desc', 'Result from previous flow node');
      case 'database_query_output':
        return t(
          'flow_builder.variable_database_query_output_desc',
          'Query result from a Database node (rows, rowCount, fields, durationMs, etc.)'
        );
      case 'code_execution_output':
        return t('flow_builder.variable_code_execution_output_desc', 'Output variables from a Code Execution node');
      default:
        return variable.description;
    }
  };

  const {
    variables,
    loading,
    error,
    fetchCapturedVariables
  } = useFlowVariables(flowId, customVariables, additionalVariables);


  const fetchAvailableSessions = async () => {
    if (!flowId) return;

    setLoadingSessions(true);
    setSessionsError(null);
    try {
      const response = await fetch(`/api/flows/${flowId}/sessions?limit=20`);
      if (response.ok) {
        const data = await response.json();
        setAvailableSessions(data.sessions || []);
      } else {
        throw new Error(`Failed to fetch sessions: ${response.status}`);
      }
    } catch (error) {
      console.error('Error fetching available sessions:', error);
      setSessionsError(error instanceof Error ? error.message : 'Failed to load sessions');
      setAvailableSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  };


  const fetchSessionVariables = async (targetSessionId?: string, reset: boolean = true) => {
    const sessionToFetch = targetSessionId || selectedSessionId;
    if (!sessionToFetch) return;

    if (reset) {
      setLoadingSessionVars(true);
      setVarsOffset(0);
      setSessionVariablesList([]);
      setSessionVariables({});
    } else {
      setLoadingMoreVars(true);
    }

    try {
      const currentOffset = reset ? 0 : varsOffset;
      const response = await fetch(`/api/sessions/${sessionToFetch}/variables?limit=30&offset=${currentOffset}`);

      if (response.ok) {
        const data = await response.json();
        const newVariables = data.variables || {};
        const newVariablesList = Object.entries(newVariables).map(([key, value]) => ({ key, value }));

        if (reset) {
          setSessionVariables(newVariables);
          setSessionVariablesList(newVariablesList);
        } else {
          setSessionVariables(prev => ({ ...prev, ...newVariables }));
          setSessionVariablesList(prev => [...prev, ...newVariablesList]);
        }

        setTotalVarsCount(data.meta?.totalCount || 0);
        setHasMoreVars(data.meta?.hasMore || false);
        setVarsOffset(currentOffset + newVariablesList.length);
      }
    } catch (error) {
      console.error('Error fetching session variables:', error);
    } finally {
      setLoadingSessionVars(false);
      setLoadingMoreVars(false);
    }
  };


  const loadMoreVariables = () => {
    if (!loadingMoreVars && hasMoreVars && selectedSessionId) {
      fetchSessionVariables(selectedSessionId, false);
    }
  };


  const handleSessionChange = (newSessionId: string) => {
    setSelectedSessionId(newSessionId);
    fetchSessionVariables(newSessionId);
  };


  const handleClearSessionData = async () => {
    if (!selectedSessionId) return;

    setClearingSessionData(true);
    try {
      const response = await fetch(`/api/sessions/${selectedSessionId}/variables`, {
        method: 'DELETE',
      });

      if (response.ok) {

        setSessionVariables({});
        setSessionVariablesList([]);
        setVarsOffset(0);
        setHasMoreVars(false);
        setTotalVarsCount(0);


        toast({
          title: t('flow_builder.variable_browser_clear_session_toast_title', 'Session data cleared'),
          description: t('flow_builder.variable_browser_clear_session_toast_desc', 'All variable data for this session has been successfully cleared.'),
        });


        fetchAvailableSessions();
      } else {
        throw new Error(`Failed to clear session data: ${response.status}`);
      }
    } catch (error) {
      console.error('Error clearing session data:', error);
      toast({
        title: t('flow_builder.variable_browser_clear_session_error_title', 'Error clearing session data'),
        description: error instanceof Error ? error.message : t('flow_builder.variable_browser_unexpected_error', 'An unexpected error occurred'),
        variant: "destructive",
      });
    } finally {
      setClearingSessionData(false);
    }
  };


  const handleClearAllSessions = async () => {
    if (!flowId || availableSessions.length === 0) return;

    setClearingAllSessions(true);
    try {
      const response = await fetch(`/api/flows/${flowId}/sessions`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const data = await response.json();


        setAvailableSessions([]);
        setSelectedSessionId(null);
        setSessionVariables({});
        setSessionVariablesList([]);
        setVarsOffset(0);
        setHasMoreVars(false);
        setTotalVarsCount(0);


        toast({
          title: t('flow_builder.variable_browser_clear_all_toast_title', 'All sessions cleared'),
          description: t('flow_builder.variable_browser_clear_all_toast_desc', 'Successfully deleted all sessions for this flow.', { count: data.deletedCount }),
        });


        fetchAvailableSessions();
      } else {
        throw new Error(`Failed to clear all sessions: ${response.status}`);
      }
    } catch (error) {
      console.error('Error clearing all sessions:', error);
      toast({
        title: t('flow_builder.variable_browser_clear_all_error_title', 'Error clearing sessions'),
        description: error instanceof Error ? error.message : t('flow_builder.variable_browser_unexpected_error', 'An unexpected error occurred'),
        variant: "destructive",
      });
    } finally {
      setClearingAllSessions(false);
    }
  };


  const handleRefreshAll = async () => {
    if (!flowId) return;

    setRefreshing(true);
    try {

      const refreshPromises: Promise<any>[] = [];


      refreshPromises.push(fetchCapturedVariables());


      refreshPromises.push(fetchAvailableSessions());


      if (selectedSessionId) {
        refreshPromises.push(fetchSessionVariables(selectedSessionId, true)); // reset=true
      }


      await Promise.all(refreshPromises);


      toast({
        title: t('flow_builder.variable_browser_refresh_toast_title', 'Data refreshed'),
        description: t('flow_builder.variable_browser_refresh_toast_desc', 'All variable data has been successfully refreshed.'),
      });

    } catch (error) {
      console.error('Error refreshing data:', error);
      toast({
        title: t('flow_builder.variable_browser_refresh_error_title', 'Error refreshing data'),
        description: error instanceof Error ? error.message : t('flow_builder.variable_browser_refresh_error_desc', 'An unexpected error occurred while refreshing data'),
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAvailableSessions();
  }, [flowId]);

  useEffect(() => {
    fetchSessionVariables();
  }, [selectedSessionId]);


  useEffect(() => {
    if (sessionId && sessionId !== selectedSessionId) {
      setSelectedSessionId(sessionId);
    }
  }, [sessionId]);


  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMoreVars && !loadingMoreVars) {
          loadMoreVariables();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMoreVars, loadingMoreVars]);

  const filteredVariables = variables.filter(variable => {
    const matchesSearch = searchTerm === '' || 
      variable.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      variable.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
      variable.description.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || variable.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const groupedVariables = filteredVariables.reduce((acc, variable) => {
    if (!acc[variable.category]) {
      acc[variable.category] = [];
    }
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, FlowVariable[]>);

  const categories = ['all', ...Array.from(new Set(variables.map(v => v.category)))];

  const copyToClipboard = async (text: string, variableKey: string) => {
    try {
      await navigator.clipboard.writeText(`{{${text}}}`);
      setCopiedVariable(variableKey);
      setTimeout(() => setCopiedVariable(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const getCategoryIconComponent = (category: FlowVariable['category']) => {
    switch (category) {
      case 'contact': return <User className="w-4 h-4" />;
      case 'message': return <InboxConversationIcon className="w-4 h-4" />;
      case 'system': return <Settings className="w-4 h-4" />;
      case 'flow': return <Workflow className="w-4 h-4" />;
      case 'captured': return <Database className="w-4 h-4" />;
      case 'observed': return <History className="w-4 h-4" />;
      case 'custom': return <Wrench className="w-4 h-4" />;
      case 'media': return <Image className="w-4 h-4" />;
      default: return <Variable className="w-4 h-4" />;
    }
  };



  const hasVariableValue = (variableKey: string) => {
    return variableKey in sessionVariables;
  };

  return (
    <Card className={cn("w-full h-full flex flex-col overflow-hidden min-w-0", className)}>
      <CardHeader className="pb-3 flex-shrink-0 min-w-0">
        {/* Title and Refresh Button Row */}
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0 flex-1 pr-2">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2 truncate">
              <Variable className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{t('flow_builder.variable_browser_title', 'Variable Browser')}</span>
            </CardTitle>
            <CardDescription className="text-xs truncate">
              {t('flow_builder.variable_browser_description', 'Browse and manage flow variables')}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRefreshAll}
                    disabled={refreshing || loading || loadingSessions || loadingSessionVars}
                    className="h-8 w-8 p-0 flex-shrink-0"
                  >
                    {(refreshing || loading || loadingSessions || loadingSessionVars) ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{t('flow_builder.variable_browser_refresh', 'Refresh all variable data')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Session Selector Row */}
        {flowId && (
          <div className="mb-3 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <Database className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground truncate">
                  {t('flow_builder.variable_browser_session_data', 'Session Data')}
                </span>
              </div>
              {availableSessions.length > 0 && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <AlertDialog>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20 flex-shrink-0"
                              disabled={clearingAllSessions || loadingSessions}
                            >
                              {clearingAllSessions ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Trash2 className="w-3 h-3" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{t('flow_builder.variable_browser_clear_all_tooltip', 'Clear all sessions for this flow')}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('flow_builder.variable_browser_clear_all_title', 'Clear All Sessions')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('flow_builder.variable_browser_clear_all_description', 'Are you sure you want to delete all sessions for this flow? This will permanently remove all session data and cannot be undone.', { count: availableSessions.length })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleClearAllSessions}
                          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                          {t('flow_builder.variable_browser_clear_all_confirm', 'Delete All Sessions')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
            {loadingSessions ? (
              <div className="flex items-center gap-2 h-8 px-3 border rounded-md text-xs text-muted-foreground w-full min-w-0">
                <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                <span className="truncate">
                  {t('flow_builder.variable_browser_loading_sessions', 'Loading sessions...')}
                </span>
              </div>
            ) : sessionsError ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 h-8 px-3 border rounded-md text-xs text-destructive bg-destructive/10 w-full cursor-help min-w-0">
                      <span className="truncate">
                        {t('flow_builder.variable_browser_error_loading_sessions', 'Error loading sessions')}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs break-words">{sessionsError}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : availableSessions.length > 0 ? (
              <Select value={selectedSessionId || ''} onValueChange={handleSessionChange}>
                <SelectTrigger data-tour="components-flow-builder-variablebrowser.selecttrigger.flow_builder.variable_browser_select_session" className="h-8 w-full text-xs min-w-0">
                  <SelectValue placeholder={t('flow_builder.variable_browser_select_session', 'Select session...')} />
                </SelectTrigger>
                <SelectContent
                  className="w-[var(--radix-select-trigger-width)] max-w-[min(350px,calc(100vw-2rem))]"
                  position="popper"
                  sideOffset={4}
                  align="start"
                >
                  {availableSessions.map((session) => (
                    <SelectItem key={session.sessionId} value={session.sessionId} className="p-2">
                      <div className="flex flex-col w-full min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate flex-1 min-w-0 text-left text-xs">
                            {session.contactName || session.contactPhone || 'Unknown Contact'}
                          </span>
                          <Badge variant="secondary" className="text-xs px-1 py-0 flex-shrink-0">
                            {session.variableCount}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {new Date(session.lastActivityAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric'
                          })} • {session.status}
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="h-8 px-3 border rounded-md text-xs text-muted-foreground flex items-center w-full min-w-0">
                <span className="truncate">
                  {t('flow_builder.variable_browser_no_sessions', 'No sessions available')}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2 mt-3 min-w-0">
          <div className="relative min-w-0">
            <Search className="absolute left-2 top-2.5 h-3 w-3 text-muted-foreground flex-shrink-0" />
            <Input data-tour="components-flow-builder-variablebrowser.input.flow_builder.variable_browser_search_placeholder"
              placeholder={t('flow_builder.variable_browser_search_placeholder', 'Search variables...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-7 h-8 text-xs sm:text-sm w-full min-w-0"
            />
          </div>
          <select data-tour="components-flow-builder-variablebrowser.select.flow_builder.variable_browser_all_categories"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-2 py-1.5 border rounded-md text-xs bg-background min-w-0 truncate"
          >
            <option value="all">
              {t('flow_builder.variable_browser_all_categories', 'All Categories')}
            </option>
            {categories.filter(cat => cat !== 'all').map(category => (
              <option key={category} value={category}>
                {getCategoryLabelI18n(category as FlowVariable['category'])}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-3 min-h-0 min-w-0">
        <Tabs defaultValue="available" className="w-full h-full flex flex-col overflow-hidden min-w-0">
          <TabsList className="mb-3">
            <TabsTrigger icon={TabIconVariable} data-tour="components-flow-builder-variablebrowser.tabstrigger.available" value="available">
              {t('flow_builder.variable_browser_tab_available', 'Available Variables')}
            </TabsTrigger>
            <TabsTrigger icon={TabIconBraces} data-tour="components-flow-builder-variablebrowser.tabstrigger.values" value="values" disabled={!selectedSessionId}>
              {t('flow_builder.variable_browser_tab_values', 'Current Values')}
              {selectedSessionId && (
                <Badge variant="secondary" className="tab-count">
                  {Object.keys(sessionVariables).length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent data-tour="components-flow-builder-variablebrowser.tabscontent.available" value="available" className="flex-1 mt-0 overflow-hidden">
            <div className="h-full overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 300px)' }}>
              {error && (
                <div className="text-center py-4">
                  <p className="text-xs text-destructive">
                    {t('flow_builder.variable_browser_error_loading_variables', 'Error loading variables')}
                  </p>
                  <p className="text-xs text-muted-foreground">{error}</p>
                </div>
              )}

              {!error && filteredVariables.length === 0 && (
                <div className="text-center py-6">
                  <Variable className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-xs text-muted-foreground">
                    {searchTerm
                      ? t('flow_builder.variable_browser_no_search_results', 'No variables match your search')
                      : t('flow_builder.variable_browser_no_variables', 'No variables available')}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {Object.entries(groupedVariables).map(([category, categoryVariables]) => (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      {getCategoryIconComponent(category as FlowVariable['category'])}
                      <span>{getCategoryLabelI18n(category as FlowVariable['category'])}</span>
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        {categoryVariables.length}
                      </Badge>
                    </div>

                    <div className="space-y-1">
                      {categoryVariables.map((variable) => (
                        <div
                          key={variable.value}
                          className="flex items-start justify-between p-2 border rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col gap-1">
                              <span className="font-medium text-xs truncate">
                                {getVariableLabel(variable)}
                              </span>
                              <div className="flex flex-wrap gap-1">
                                {variable.dataType && (
                                  <Badge variant="secondary" className="text-xs px-1 py-0">
                                    {variable.dataType}
                                  </Badge>
                                )}
                                    {hasVariableValue(variable.value) && (
                                  <Badge variant="default" className="text-xs px-1 py-0 bg-primary/10 text-primary border border-primary/20">
                                    {t('flow_builder.variable_browser_has_value', 'Has Value')}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            {variable.description && (
                              <p className="text-xs text-muted-foreground mt-1 overflow-hidden" style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical'
                              }}>
                                {getVariableDescription(variable)}
                              </p>
                            )}
                            <code className="text-xs font-mono text-primary bg-primary/10 px-1 py-0.5 rounded mt-1 block truncate">
                              {`{{${variable.value}}}`}
                            </code>
                          </div>

                          <div className="flex flex-col gap-1 ml-1 flex-shrink-0">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0"
                                    onClick={() => copyToClipboard(variable.value, variable.value)}
                                  >
                                    {copiedVariable === variable.value ? (
                                      <CheckCircle className="w-3 h-3 text-primary" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{t('flow_builder.variable_browser_copy_variable', 'Copy variable')}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>

                            {onVariableSelect && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
                                      onClick={() => onVariableSelect(variable)}
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>{t('flow_builder.variable_browser_select_variable', 'Select variable')}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent data-tour="components-flow-builder-variablebrowser.tabscontent.values" value="values" className="flex-1 mt-0 overflow-hidden">
            <div className="h-full overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 300px)' }}>
              {!selectedSessionId ? (
                <div className="text-center py-6">
                  <Database className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.variable_browser_no_session_selected', 'No session selected')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {availableSessions.length > 0
                      ? t('flow_builder.variable_browser_select_session_hint', 'Select a session above to view variable values')
                      : t('flow_builder.variable_browser_no_sessions_flow', 'No sessions available for this flow')
                    }
                  </p>
                </div>
              ) : (
                <>
                  {/* Session Metadata Header */}
                  {(() => {
                    const selectedSession = availableSessions.find(s => s.sessionId === selectedSessionId);
                    return selectedSession ? (
                      <div className="mb-4 p-3 border rounded-md bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium truncate">
                            {t('flow_builder.variable_browser_session_info', 'Session Information')}
                          </h4>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant={selectedSession.status === 'completed' ? 'default' : 'secondary'} className="text-xs">
                              {selectedSession.status}
                            </Badge>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                                  disabled={clearingSessionData || selectedSession.variableCount === 0}
                                >
                                  {clearingSessionData ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Clear Session Data</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to clear all variable data for this session? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={handleClearSessionData}
                                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                  >
                                    Clear Data
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                          <div className="min-w-0">
                            <span className="text-muted-foreground">
                              {t('flow_builder.variable_browser_contact_label', 'Contact:')}
                            </span>
                            <div className="font-medium truncate">
                              {selectedSession.contactName || selectedSession.contactPhone || t('flow_builder.variable_browser_unknown_contact', 'Unknown')}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <span className="text-muted-foreground">
                              {t('flow_builder.variable_browser_variables_label', 'Variables:')}
                            </span>
                            <div className="font-medium">{selectedSession.variableCount}</div>
                          </div>
                          <div className="min-w-0">
                            <span className="text-muted-foreground">
                              {t('flow_builder.variable_browser_started_label', 'Started:')}
                            </span>
                            <div className="font-medium truncate">
                              {new Date(selectedSession.startedAt).toLocaleString(undefined, {
                                dateStyle: 'short',
                                timeStyle: 'short'
                              })}
                            </div>
                          </div>
                          <div className="min-w-0">
                            <span className="text-muted-foreground">
                              {t('flow_builder.variable_browser_last_activity_label', 'Last Activity:')}
                            </span>
                            <div className="font-medium truncate">
                              {new Date(selectedSession.lastActivityAt).toLocaleString(undefined, {
                                dateStyle: 'short',
                                timeStyle: 'short'
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}

                  {loadingSessionVars ? (
                <div className="text-center py-6">
                  <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.variable_browser_loading_values', 'Loading variable values...')}
                  </p>
                </div>
              ) : sessionVariablesList.length === 0 ? (
                <div className="text-center py-6">
                  <Database className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.variable_browser_no_values', 'No variable values found')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('flow_builder.variable_browser_no_values_hint', 'Variables will appear here once captured')}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Variables List */}
                  {sessionVariablesList.map(({ key, value }) => (
                    <div
                      key={key}
                      className="flex items-start justify-between p-2 border rounded-md"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-xs truncate flex items-center gap-1.5 flex-wrap">
                          {customVarNames.has(key) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center gap-1 shrink-0">
                                    <Bot className="w-3 h-3 text-emerald-500" aria-hidden />
                                    <Badge
                                      variant="secondary"
                                      className="h-5 px-1.5 text-[10px] font-normal border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                                    >
                                      AI
                                    </Badge>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>
                                    {t(
                                      'flow_builder.variable_browser_ai_written_tooltip',
                                      'Value written by AI assistant'
                                    )}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <span className="truncate">{key}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 break-words">
                          {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 flex-shrink-0 ml-1"
                        onClick={() => copyToClipboard(key, key)}
                      >
                        {copiedVariable === key ? (
                          <CheckCircle className="w-3 h-3 text-primary" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  ))}

                  {/* Load More / Infinite Scroll */}
                  {hasMoreVars && (
                    <div className="pt-2">
                      {loadingMoreVars ? (
                        <div className="text-center py-4">
                          <Loader2 className="w-4 h-4 mx-auto mb-2 animate-spin" />
                          <p className="text-xs text-muted-foreground">
                            {t('flow_builder.variable_browser_loading_more', 'Loading more variables...')}
                          </p>
                        </div>
                      ) : (
                        <>
                          <Button data-tour="components-flow-builder-variablebrowser.button.flow_builder.variable_browser_load_more"
                            variant="outline"
                            size="sm"
                            onClick={loadMoreVariables}
                            className="w-full text-xs"
                          >
                            {t('flow_builder.variable_browser_load_more', 'Load More')} ({totalVarsCount - sessionVariablesList.length} {t('flow_builder.variable_browser_remaining', 'remaining')})
                          </Button>
                          {/* Invisible element for intersection observer */}
                          <div ref={loadMoreRef} className="h-1 w-full" />
                        </>
                      )}
                    </div>
                  )}

                  {/* Variables Count Info */}
                  {totalVarsCount > 0 && (
                    <div className="text-center pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        {t('flow_builder.variable_browser_showing_count', 'Showing')} {sessionVariablesList.length} {t('flow_builder.variable_browser_of', 'of')} {totalVarsCount} {t('flow_builder.variable_browser_variables', 'variables')}
                      </p>
                    </div>
                  )}
                </div>
              )}
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}


interface VariableBrowserDialogProps {
  flowId?: number;
  sessionId?: string;
  onVariableSelect?: (variable: FlowVariable) => void;
  trigger?: React.ReactNode;
}

export function VariableBrowserDialog({
  flowId,
  sessionId,
  onVariableSelect,
  trigger
}: VariableBrowserDialogProps) {
  const [open, setOpen] = useState(false);

  const handleVariableSelect = (variable: FlowVariable) => {
    if (onVariableSelect) {
      onVariableSelect(variable);
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            <Variable className="w-4 h-4 mr-2" />
            Browse Variables
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Variable Browser</DialogTitle>
          <DialogDescription>
            Browse and select variables to use in your flow
          </DialogDescription>
        </DialogHeader>
        <VariableBrowser
          flowId={flowId}
          sessionId={sessionId}
          onVariableSelect={handleVariableSelect}
          className="border-0 shadow-none"
        />
      </DialogContent>
    </Dialog>
  );
}
