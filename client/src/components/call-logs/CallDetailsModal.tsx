import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import useSocket from '@/hooks/useSocket';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  Star,
  StarOff,
  Download,
  Copy,
  Play,
  Pause,
  Bot,
  User,
  Clock,
  TrendingUp,
  AlertCircle,
  FileText,
  BarChart3,
  Database,
  AudioLines as TabIconAudioLines,
  BrainCircuit as TabIconBrainCircuit,
  ChartNoAxesCombined as TabIconChartNoAxesCombined,
  FileText as TabIconFileText,
  Info as TabIconInfo,
  Tags as TabIconTags,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** ElevenLabs post-call analysis (from webhook) */
export interface ElevenLabsAnalysis {
  transcription: {
    transcript?: Array<{ role: string; message: string; time_in_call_secs?: number }>;
    metadata?: { call_duration_secs?: number; start_time_unix_secs?: number };
    analysis?: {
      transcript_summary?: string;
      call_successful?: string;
      evaluation_criteria_results?: Record<string, unknown>;
      data_collection_results?: Record<string, unknown>;
    };
  } | null;
  audio: { conversationId: string; fullAudioBase64?: string } | null;
  initiationFailure: { failureReason: string; metadata?: unknown } | null;
  events: Array<{ eventType: string; createdAt: string; payload: unknown }>;
}

interface CallDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  callId: number;
}

/** Subset of call-log fields used for recording refetch logic */
interface CallLogRecordingRefetchShape {
  status: string;
  recordingUrl?: string | null;
  recordingRequested?: boolean | null;
  recordingExpectedFrom?: string | null;
}

export function CallDetailsModal({ isOpen, onClose, callId }: CallDetailsModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { onMessage } = useSocket('/ws');
  const [activeTab, setActiveTab] = useState('overview');
  const [notesDraft, setNotesDraft] = useState('');
  const [isStarred, setIsStarred] = useState(false);

  const { data: call, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['/api/call-logs', callId],
    queryFn: async () => {
      const response = await fetch(`/api/call-logs/${callId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(t('call_logs.call_not_found', 'Call not found'));
        }
        throw new Error(t('call_logs.fetch_failed', 'Failed to fetch call: {{status}} {{statusText}}', { status: response.status, statusText: response.statusText }));
      }
      const data = await response.json();
      if (data.success) {
        return data.data;
      }
      throw new Error(data.error || t('call_logs.fetch_failed_generic', 'Failed to fetch call'));
    },
    enabled: isOpen && !!callId,
    refetchInterval: (query): number | false => {
      const c = query.state.data as CallLogRecordingRefetchShape | undefined;
      if (!c || !isOpen) return false;
      const terminal = ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(c.status);
      const awaitingTwilio =
        c.recordingRequested !== false &&
        ['twilio', 'whatsapp'].includes(c.recordingExpectedFrom || '') &&
        !c.recordingUrl &&
        terminal;
      return awaitingTwilio ? 4000 : false;
    }
  });

  const isElevenLabsCall =
    call?.provider !== 'whatsapp' && (call?.recordingExpectedFrom === 'elevenlabs' ||
    call?.recordingAudioProvider === 'elevenlabs' ||
    call?.metadata?.callType === 'ai-powered' ||
    !!call?.metadata?.elevenLabsNativeOutbound);
  const { data: elevenLabsAnalysis, isLoading: analysisLoading } = useQuery({
    queryKey: ['/api/call-logs', callId, 'elevenlabs-analysis'],
    queryFn: async (): Promise<ElevenLabsAnalysis> => {
      const response = await fetch(`/api/call-logs/${callId}/elevenlabs-analysis`);
      if (!response.ok) return { transcription: null, audio: null, initiationFailure: null, events: [] };
      const data = await response.json();
      return data.success ? data.data : { transcription: null, audio: null, initiationFailure: null, events: [] };
    },
    enabled: isOpen && !!callId && !!isElevenLabsCall
  });

  // Seed local state from fetched call
  useEffect(() => {
    if (call) {
      setNotesDraft(call.notes || '');
      setIsStarred(call.isStarred || false);
    }
  }, [call, callId]);

  useEffect(() => {
    if (!isOpen || !callId) return;
    const offStatus = onMessage('callStatusUpdate', (msg: { data?: { callId?: number } }) => {
      if (msg.data?.callId === callId) {
        queryClient.invalidateQueries({ queryKey: ['/api/call-logs', callId] });
        queryClient.invalidateQueries({ queryKey: ['/api/call-logs', callId, 'elevenlabs-analysis'] });
      }
    });
    const offDone = onMessage('callCompleted', (msg: { data?: { callId?: number } }) => {
      if (msg.data?.callId === callId) {
        queryClient.invalidateQueries({ queryKey: ['/api/call-logs', callId] });
        queryClient.invalidateQueries({ queryKey: ['/api/call-logs', callId, 'elevenlabs-analysis'] });
      }
    });
    return () => {
      offStatus();
      offDone();
    };
  }, [isOpen, callId, onMessage, queryClient]);

  // Auto-close modal on 404 errors after showing the error
  useEffect(() => {
    if (isError && error) {
      const errorMessage = error instanceof Error ? error.message : t('common.unknown_error', 'An unknown error occurred');
      const is404 = errorMessage.includes('404') || errorMessage.includes('not found');
      if (is404) {
        const timer = setTimeout(() => {
          onClose();
        }, 3000); // Show error for 3 seconds before closing
        return () => clearTimeout(timer);
      }
    }
  }, [isError, error, onClose]);

  const updateCallMutation = useMutation({
    mutationFn: async (updates: { notes?: string; isStarred?: boolean }) => {
      const response = await fetch(`/api/call-logs/${callId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!response.ok) {
        throw new Error(t('call_logs.update_failed', 'Failed to update call: {{status}} {{statusText}}', { status: response.status, statusText: response.statusText }));
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: (data, variables) => {
      // Update the detail cache immediately
      queryClient.setQueryData(['/api/call-logs', callId], data);
      // Invalidate list queries
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('call_logs.updated', 'Call log updated successfully.'),
      });
    }
  });

  const handleStarToggle = () => {
    const newStarredValue = !isStarred;
    setIsStarred(newStarredValue);
    updateCallMutation.mutate({ isStarred: newStarredValue });
  };

  const handleNotesSave = () => {
    updateCallMutation.mutate({ notes: notesDraft });
  };

  const handleNotesBlur = () => {
    // Only save if notes have changed
    if (call && notesDraft !== (call.notes || '')) {
      handleNotesSave();
    }
  };

  const handleDownloadTranscript = () => {
    if (!call?.transcript) return;
    const blob = new Blob([JSON.stringify(call.transcript, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-${callId}-transcript.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleCopyTranscript = () => {
    if (!call?.transcript) return;
    const text = JSON.stringify(call.transcript, null, 2);
    navigator.clipboard.writeText(text);
    toast({
      title: t('common.success', 'Success'),
      description: t('call_logs.transcript_copied', 'Transcript copied to clipboard.'),
    });
  };

  const formatDuration = (seconds: number | null | undefined) => {
    if (seconds === null || seconds === undefined) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isError) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    const is404 = errorMessage.includes('404') || errorMessage.includes('not found');
    
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent data-tour="components-call-logs-calldetailsmodal.dialogcontent.call_logs.call_details" className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('call_logs.call_details', 'Call Details')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div className="text-center space-y-2">
              <h3 className="text-lg font-semibold">{t('common.error', 'Error')}</h3>
              <p className="text-muted-foreground">{errorMessage}</p>
            </div>
            <div className="flex gap-2">
              <Button data-tour="components-call-logs-calldetailsmodal.button.common.retry" onClick={() => refetch()}>
                {t('common.retry', 'Retry')}
              </Button>
              {is404 && (
                <Button data-tour="components-call-logs-calldetailsmodal.button.common.close" variant="outline" onClick={onClose}>
                  {t('common.close', 'Close')}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!call) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent data-tour="components-call-logs-calldetailsmodal.dialogcontent.call_logs.call_details" className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>{t('call_logs.call_details', 'Call Details')}</DialogTitle>
            <Button data-tour="components-call-logs-calldetailsmodal.button.call_logs.unstar"
              variant="ghost"
              size="sm"
              onClick={handleStarToggle}
              disabled={updateCallMutation.isPending}
            >
              {isStarred ? (
                <>
                  <Star className="h-4 w-4 mr-2 fill-yellow-400 text-yellow-400" />
                  {t('call_logs.unstar', 'Unstar')}
                </>
              ) : (
                <>
                  <StarOff className="h-4 w-4 mr-2" />
                  {t('call_logs.star', 'Star')}
                </>
              )}
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger icon={TabIconInfo} data-tour="components-call-logs-calldetailsmodal.tabstrigger.overview" value="overview">{t('call_logs.overview', 'Overview')}</TabsTrigger>
            <TabsTrigger icon={TabIconFileText} data-tour="components-call-logs-calldetailsmodal.tabstrigger.transcript" value="transcript">{t('call_logs.transcript', 'Transcript')}</TabsTrigger>
            {call?.provider !== 'whatsapp' && call?.metadata?.callType === 'ai-powered' && (
              <TabsTrigger icon={TabIconBrainCircuit} data-tour="components-call-logs-calldetailsmodal.tabstrigger.ai-performance" value="ai-performance">{t('call_logs.ai_performance', 'AI Performance')}</TabsTrigger>
            )}
            {isElevenLabsCall && (
              <TabsTrigger icon={TabIconChartNoAxesCombined} data-tour="components-call-logs-calldetailsmodal.tabstrigger.analysis" value="analysis">{t('call_logs.analysis', 'Analysis')}</TabsTrigger>
            )}
            <TabsTrigger icon={TabIconAudioLines} data-tour="components-call-logs-calldetailsmodal.tabstrigger.recording" value="recording">{t('call_logs.recording', 'Recording')}</TabsTrigger>
            <TabsTrigger icon={TabIconTags} data-tour="components-call-logs-calldetailsmodal.tabstrigger.metadata" value="metadata">{t('call_logs.metadata', 'Metadata')}</TabsTrigger>
          </TabsList>

          <TabsContent data-tour="components-call-logs-calldetailsmodal.tabscontent.overview" value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t('call_logs.call_info', 'Call Information')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.status', 'Status')}: </span>
                    <Badge>{t(`calling.status.${call.status}`, call.status)}</Badge>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.direction', 'Direction')}: </span>
                    <Badge variant={call.direction === 'inbound' ? 'default' : 'secondary'}>
                      {call.direction === 'inbound' ? t('call_logs.direction.inbound', 'Inbound') : t('call_logs.direction.outbound', 'Outbound')}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.from', 'From')}: </span>
                    <span className="text-sm">{call.from}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.to', 'To')}: </span>
                    <span className="text-sm">{call.to}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.duration', 'Duration')}: </span>
                    <span className="text-sm">{formatDuration(call.durationSec)}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.provider', 'Provider')}: </span>
                    <span className="text-sm">{call.provider || 'twilio'}</span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.call_type', 'Call type')}: </span>
                    <span className="text-sm">{(() => {
                      const callType = call.callType || call.metadata?.callType;
                      return callType ? t(`calling.mode.${callType === 'ai-powered' ? 'ai' : 'direct'}`, callType) : '-';
                    })()}</span>
                  </div>
                  {call.aiProviderConversationId && <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.ai_conversation_id', 'AI conversation ID')}: </span>
                    <span className="break-all text-sm">{call.aiProviderConversationId}</span>
                  </div>}
                  {call.failureCode && <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.failure_code', 'Failure code')}: </span>
                    <span className="text-sm text-destructive">{t(`calling.errors.${call.failureCode}`, call.failureCode)}</span>
                  </div>}
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.cost', 'Cost')}: </span>
                    <span className="text-sm">
                      {call.cost ? `$${parseFloat(call.cost).toFixed(4)} ${call.costCurrency || 'USD'}` : '-'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">{t('call_logs.timestamps', 'Timestamps')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.started_at', 'Started At')}: </span>
                    <span className="text-sm">
                      {call.startedAt ? new Date(call.startedAt).toLocaleString() : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="text-sm text-muted-foreground">{t('call_logs.ended_at', 'Ended At')}: </span>
                    <span className="text-sm">
                      {call.endedAt ? new Date(call.endedAt).toLocaleString() : '-'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {call.contact && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t('call_logs.contact', 'Contact')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <span className="text-sm text-muted-foreground">{t('call_logs.name', 'Name')}: </span>
                      <span className="text-sm">{call.contact.name}</span>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">{t('call_logs.phone', 'Phone')}: </span>
                      <span className="text-sm">{call.contact.phone}</span>
                    </div>
                    {call.contact.email && (
                      <div>
                        <span className="text-sm text-muted-foreground">{t('call_logs.email', 'Email')}: </span>
                        <span className="text-sm">{call.contact.email}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {call.flow && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t('call_logs.flow', 'Flow')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div>
                      <span className="text-sm text-muted-foreground">{t('call_logs.flow_name', 'Flow Name')}: </span>
                      <span className="text-sm">{call.flow.name}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{t('call_logs.notes', 'Notes')}</CardTitle>
                  <Button data-tour="components-call-logs-calldetailsmodal.button.common.saving"
                    variant="outline"
                    size="sm"
                    onClick={handleNotesSave}
                    disabled={updateCallMutation.isPending || notesDraft === (call.notes || '')}
                  >
                    {updateCallMutation.isPending ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Textarea data-tour="components-call-logs-calldetailsmodal.textarea.call_logs.notes_placeholder"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={handleNotesBlur}
                  placeholder={t('call_logs.notes_placeholder', 'Add notes about this call...')}
                  rows={4}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent data-tour="components-call-logs-calldetailsmodal.tabscontent.transcript" value="transcript">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{t('call_logs.transcript', 'Transcript')}</CardTitle>
                  <div className="flex gap-2">
                    <Button data-tour="components-call-logs-calldetailsmodal.button.call_logs.download" variant="outline" size="sm" onClick={handleDownloadTranscript}>
                      <Download className="h-4 w-4 mr-2" />
                      {t('call_logs.download', 'Download')}
                    </Button>
                    <Button data-tour="components-call-logs-calldetailsmodal.button.call_logs.copy" variant="outline" size="sm" onClick={handleCopyTranscript}>
                      <Copy className="h-4 w-4 mr-2" />
                      {t('call_logs.copy', 'Copy')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {call.transcript ? (
                  <div className="space-y-4">
                    {(() => {
                      // First try to use transcript.turns if transcript is an object
                      if (typeof call.transcript === 'object' && Array.isArray(call.transcript.segments)) {
                        return call.transcript.segments.map((segment: any, index: number) => (
                          <div key={index} className="border-l-4 border-blue-500 bg-blue-50/50 py-2 pl-4">
                            <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                              <User className="h-4 w-4 text-blue-600" />
                              <span>{segment.speaker || t('call_logs.speaker', 'Speaker')}</span>
                              <Badge variant="outline" className="text-xs">{formatDuration(Math.floor(Number(segment.startMs || 0) / 1000))}</Badge>
                            </div>
                            <div className="text-sm">{segment.text}</div>
                          </div>
                        ));
                      }
                      // First try to use transcript.turns if transcript is an object
                      if (typeof call.transcript === 'object' && call.transcript.turns && Array.isArray(call.transcript.turns)) {
                        return call.transcript.turns.map((turn: any, index: number) => (
                          <div 
                            key={index} 
                            className={`border-l-4 pl-4 py-2 ${
                              turn.speaker === 'user' 
                                ? 'border-blue-500 bg-blue-50/50' 
                                : 'border-green-500 bg-green-50/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {turn.speaker === 'user' ? (
                                <User className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Bot className="h-4 w-4 text-green-600" />
                              )}
                              <span className="font-medium text-sm">
                                {turn.speaker === 'user' ? t('call_logs.user', 'User') : t('call_logs.ai', 'AI')}
                              </span>
                              {turn.turnNumber && (
                                <Badge variant="outline" className="text-xs">
                                  {t('call_logs.turn_label', 'Turn {{number}}', { number: turn.turnNumber })}
                                </Badge>
                              )}
                              {turn.responseTime && (
                                <Badge variant="secondary" className="text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {(turn.responseTime / 1000).toFixed(1)}s
                                </Badge>
                              )}
                              {turn.confidence && (
                                <Badge 
                                  variant={turn.confidence > 0.8 ? 'default' : 'secondary'} 
                                  className="text-xs"
                                >
                                  {Math.round(turn.confidence * 100)}% {t('call_logs.confidence', 'confidence')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm">{turn.text}</div>
                            {turn.timestamp && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(turn.timestamp).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ));
                      }
                      // Fall back to conversationData if transcript is not an object with turns
                      else if (call.conversationData && Array.isArray(call.conversationData)) {
                        return call.conversationData.map((turn: any, index: number) => (
                          <div 
                            key={index} 
                            className={`border-l-4 pl-4 py-2 ${
                              turn.speaker === 'user' 
                                ? 'border-blue-500 bg-blue-50/50' 
                                : 'border-green-500 bg-green-50/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {turn.speaker === 'user' ? (
                                <User className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Bot className="h-4 w-4 text-green-600" />
                              )}
                              <span className="font-medium text-sm">
                                {turn.speaker === 'user' ? t('call_logs.user', 'User') : t('call_logs.ai', 'AI')}
                              </span>
                              {turn.turnNumber && (
                                <Badge variant="outline" className="text-xs">
                                  {t('call_logs.turn_label', 'Turn {{number}}', { number: turn.turnNumber })}
                                </Badge>
                              )}
                              {turn.responseTime && (
                                <Badge variant="secondary" className="text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {(turn.responseTime / 1000).toFixed(1)}s
                                </Badge>
                              )}
                              {turn.confidence && (
                                <Badge 
                                  variant={turn.confidence > 0.8 ? 'default' : 'secondary'} 
                                  className="text-xs"
                                >
                                  {Math.round(turn.confidence * 100)}% {t('call_logs.confidence', 'confidence')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm">{turn.text}</div>
                            {turn.timestamp && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(turn.timestamp).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ));
                      }
                      // Fall back to array handling for backward compatibility
                      else if (Array.isArray(call.transcript)) {
                        return call.transcript.map((turn: any, index: number) => (
                          <div 
                            key={index} 
                            className={`border-l-4 pl-4 py-2 ${
                              turn.speaker === 'user' 
                                ? 'border-blue-500 bg-blue-50/50' 
                                : 'border-green-500 bg-green-50/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              {turn.speaker === 'user' ? (
                                <User className="h-4 w-4 text-blue-600" />
                              ) : (
                                <Bot className="h-4 w-4 text-green-600" />
                              )}
                              <span className="font-medium text-sm">
                                {turn.speaker === 'user' ? t('call_logs.user', 'User') : t('call_logs.ai', 'AI')}
                              </span>
                              {turn.turnNumber && (
                                <Badge variant="outline" className="text-xs">
                                  {t('call_logs.turn_label', 'Turn {{number}}', { number: turn.turnNumber })}
                                </Badge>
                              )}
                              {turn.responseTime && (
                                <Badge variant="secondary" className="text-xs">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {(turn.responseTime / 1000).toFixed(1)}s
                                </Badge>
                              )}
                              {turn.confidence && (
                                <Badge 
                                  variant={turn.confidence > 0.8 ? 'default' : 'secondary'} 
                                  className="text-xs"
                                >
                                  {Math.round(turn.confidence * 100)}% {t('call_logs.confidence', 'confidence')}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm">{turn.text}</div>
                            {turn.timestamp && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(turn.timestamp).toLocaleString()}
                              </div>
                            )}
                          </div>
                        ));
                      }
                      // Last resort: show raw JSON
                      else {
                        return <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(call.transcript, null, 2)}</pre>;
                      }
                    })()}
                  </div>
                ) : (
                  <p className="text-muted-foreground">{t('call_logs.no_transcript', 'No transcript available.')}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {call?.provider !== 'whatsapp' && call?.metadata?.callType === 'ai-powered' && (
            <TabsContent data-tour="components-call-logs-calldetailsmodal.tabscontent.ai-performance" value="ai-performance">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      {t('call_logs.ai_metrics', 'AI Metrics')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-muted-foreground">{t('call_logs.call_type', 'Call Type')}: </span>
                        <Badge variant="default">
                          <Bot className="h-3 w-3 mr-1" />
                          {t('call_logs.ai_powered', 'AI-Powered')}
                        </Badge>
                      </div>
                      {call.metadata?.elevenLabsConversationId && (
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.conversation_id', 'Conversation ID')}: </span>
                          <span className="text-sm font-mono">{call.metadata.elevenLabsConversationId}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {call.conversationData && Array.isArray(call.conversationData) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        {t('call_logs.conversation_stats', 'Conversation Statistics')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.total_turns', 'Total Turns')}: </span>
                          <span className="text-sm font-medium">{call.conversationData.length}</span>
                        </div>
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.user_turns', 'User Turns')}: </span>
                          <span className="text-sm font-medium">
                            {call.conversationData.filter((t: any) => t.speaker === 'user').length}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.ai_turns', 'AI Turns')}: </span>
                          <span className="text-sm font-medium">
                            {call.conversationData.filter((t: any) => t.speaker === 'ai').length}
                          </span>
                        </div>
                        <div>
                          <span className="text-sm text-muted-foreground">{t('call_logs.avg_response_time', 'Avg Response Time')}: </span>
                          <span className="text-sm font-medium">
                            {(() => {
                              const aiTurns = call.conversationData.filter((t: any) => t.speaker === 'ai' && t.responseTime);
                              if (aiTurns.length === 0) return '-';
                              const avg = aiTurns.reduce((sum: number, t: any) => sum + t.responseTime, 0) / aiTurns.length;
                              return `${(avg / 1000).toFixed(1)}s`;
                            })()}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">{t('call_logs.response_times', 'Response Times')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {call.conversationData && Array.isArray(call.conversationData) 
                        ? call.conversationData
                            .filter((turn: any) => turn.speaker === 'ai' && turn.responseTime)
                            .map((turn: any, index: number) => (
                              <div key={index} className="flex justify-between items-center">
                                <span className="text-sm">{t('call_logs.turn_label', 'Turn {{number}}', { number: turn.turnNumber || index + 1 })}</span>
                                <Badge variant="outline">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {(turn.responseTime / 1000).toFixed(1)}s
                                </Badge>
                              </div>
                            ))
                        : <p className="text-muted-foreground text-sm">{t('call_logs.no_response_data', 'No response time data available.')}</p>
                      }
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {isElevenLabsCall && (
            <TabsContent data-tour="components-call-logs-calldetailsmodal.tabscontent.analysis" value="analysis" className="space-y-4">
              {analysisLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <>
                  {elevenLabsAnalysis?.initiationFailure && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                          <AlertCircle className="h-4 w-4" />
                          {t('call_logs.initiation_failure', 'Call initiation failed')}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm">{elevenLabsAnalysis.initiationFailure.failureReason}</p>
                        {elevenLabsAnalysis.initiationFailure.metadata != null ? (
                          <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                            {JSON.stringify(elevenLabsAnalysis.initiationFailure.metadata, null, 2)}
                          </pre>
                        ) : null}
                      </CardContent>
                    </Card>
                  )}

                  {elevenLabsAnalysis?.transcription && (
                    <>
                      {elevenLabsAnalysis.transcription.analysis?.transcript_summary && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-sm flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              {t('call_logs.transcript_summary', 'Transcript summary')}
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm whitespace-pre-wrap">{elevenLabsAnalysis.transcription.analysis.transcript_summary}</p>
                            {elevenLabsAnalysis.transcription.analysis.call_successful && (
                              <Badge className="mt-2" variant={elevenLabsAnalysis.transcription.analysis.call_successful === 'success' ? 'default' : 'secondary'}>
                                {elevenLabsAnalysis.transcription.analysis.call_successful}
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Bot className="h-4 w-4" />
                            {t('call_logs.full_transcript', 'Full transcript')}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {elevenLabsAnalysis.transcription.transcript?.length ? (
                            <div className="space-y-3">
                              {elevenLabsAnalysis.transcription.transcript.map((turn: any, index: number) => (
                                <div
                                  key={index}
                                  className={`border-l-4 pl-4 py-2 rounded-r ${
                                    turn.role === 'user' ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20' : 'border-green-500 bg-green-50/50 dark:bg-green-950/20'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 mb-1">
                                    {turn.role === 'user' ? <User className="h-4 w-4 text-blue-600" /> : <Bot className="h-4 w-4 text-green-600" />}
                                    <span className="font-medium text-sm">{turn.role === 'user' ? t('call_logs.user', 'User') : t('call_logs.ai', 'AI')}</span>
                                    {turn.time_in_call_secs != null && (
                                      <span className="text-xs text-muted-foreground">{turn.time_in_call_secs}s</span>
                                    )}
                                  </div>
                                  <p className="text-sm">{turn.message}</p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-muted-foreground text-sm">{t('call_logs.no_transcript', 'No transcript available.')}</p>
                          )}
                        </CardContent>
                      </Card>

                      {elevenLabsAnalysis.transcription.analysis?.evaluation_criteria_results &&
                        Object.keys(elevenLabsAnalysis.transcription.analysis.evaluation_criteria_results).length > 0 && (
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm flex items-center gap-2">
                                <BarChart3 className="h-4 w-4" />
                                {t('call_logs.success_evaluation', 'Success evaluation')}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
                                {JSON.stringify(elevenLabsAnalysis.transcription.analysis.evaluation_criteria_results, null, 2)}
                              </pre>
                            </CardContent>
                          </Card>
                        )}

                      {elevenLabsAnalysis.transcription.analysis?.data_collection_results &&
                        Object.keys(elevenLabsAnalysis.transcription.analysis.data_collection_results).length > 0 && (
                          <Card>
                            <CardHeader>
                              <CardTitle className="text-sm flex items-center gap-2">
                                <Database className="h-4 w-4" />
                                {t('call_logs.data_collection', 'Data collection')}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-48">
                                {JSON.stringify(elevenLabsAnalysis.transcription.analysis.data_collection_results, null, 2)}
                              </pre>
                            </CardContent>
                          </Card>
                        )}
                    </>
                  )}

                  {elevenLabsAnalysis?.audio?.fullAudioBase64 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-sm">{t('call_logs.recording_from_webhook', 'Call recording (from ElevenLabs)')}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <audio
                          controls
                          className="w-full"
                          src={`data:audio/mpeg;base64,${elevenLabsAnalysis.audio.fullAudioBase64}`}
                        />
                      </CardContent>
                    </Card>
                  )}

                  {!analysisLoading && !elevenLabsAnalysis?.transcription && !elevenLabsAnalysis?.initiationFailure && !elevenLabsAnalysis?.audio?.fullAudioBase64 && (
                    <p className="text-muted-foreground text-sm py-8 text-center">
                      {t('call_logs.analysis_pending', 'No analysis data yet. Post-call webhook data will appear here after the call ends.')}
                    </p>
                  )}
                </>
              )}
            </TabsContent>
          )}

          <TabsContent data-tour="components-call-logs-calldetailsmodal.tabscontent.recording" value="recording">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('call_logs.recording', 'Recording')}</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const recordingDisabled = call.recordingRequested === false;
                  const expectEl =
                    call.recordingExpectedFrom === 'elevenlabs' ||
                    (call.recordingExpectedFrom == null &&
                      !!call.metadata?.elevenLabsNativeOutbound &&
                      call.metadata?.callType === 'ai-powered');
                  const expectTwilio = call.recordingExpectedFrom === 'twilio';
                  const terminal = ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(call.status);

                  if (recordingDisabled) {
                    return (
                      <p className="text-muted-foreground">
                        {t(
                          'call_logs.recording_disabled',
                          'Recording was not enabled for this call.'
                        )}
                      </p>
                    );
                  }

                  if (expectEl) {
                    if (elevenLabsAnalysis?.audio?.fullAudioBase64) {
                      return (
                        <div className="space-y-4">
                          <p className="text-sm text-muted-foreground">
                            {t(
                              'call_logs.recording_source_elevenlabs',
                              'Playback uses ElevenLabs post-call audio (not Twilio).'
                            )}
                          </p>
                          <audio
                            controls
                            className="w-full"
                            src={`data:audio/mpeg;base64,${elevenLabsAnalysis.audio.fullAudioBase64}`}
                          />
                        </div>
                      );
                    }
                    if (analysisLoading) {
                      return (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                        </div>
                      );
                    }
                    return (
                      <p className="text-muted-foreground">
                        {t(
                          'call_logs.recording_elevenlabs_pending',
                          'Post-call audio from ElevenLabs is not ready yet. Try again shortly or check the Analysis tab.'
                        )}
                      </p>
                    );
                  }

                  if (call.recordingUrl) {
                    return (
                      <div className="space-y-4">
                        <audio controls className="w-full">
                          <source src={`/api/call-logs/${callId}/recording`} />
                          {t('call_logs.audio_not_supported', 'Your browser does not support the audio element.')}
                        </audio>
                        <Button data-tour="components-call-logs-calldetailsmodal.button.call_logs.download_recording" variant="outline" onClick={() => {
                          window.open(`/api/call-logs/${callId}/recording`, '_blank');
                        }}>
                          <Download className="h-4 w-4 mr-2" />
                          {t('call_logs.download_recording', 'Download Recording')}
                        </Button>
                      </div>
                    );
                  }

                  if (expectTwilio && terminal && call.recordingRequested !== false) {
                    return (
                      <p className="text-muted-foreground">
                        {t(
                          'call_logs.recording_processing',
                          'Call recording is processing or uploading. This page will update when the file is ready.'
                        )}
                      </p>
                    );
                  }

                  return (
                    <p className="text-muted-foreground">{t('call_logs.no_recording', 'No recording available.')}</p>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent data-tour="components-call-logs-calldetailsmodal.tabscontent.metadata" value="metadata">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('call_logs.metadata', 'Metadata')}</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="text-sm whitespace-pre-wrap bg-muted p-4 rounded">
                  {JSON.stringify({
                    id: call.id,
                    twilioCallSid: call.twilioCallSid,
                    agentConfig: call.agentConfig,
                    metadata: call.metadata
                  }, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
