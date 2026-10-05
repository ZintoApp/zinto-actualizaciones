import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useQuery, useMutation } from '@tanstack/react-query';
import useSocket from '@/hooks/useSocket';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Phone, PhoneOff, Mic, MicOff, Volume2, VolumeX, X, PhoneCall, PhoneIncoming, AlertCircle, ChevronDown, ChevronUp, Wifi, Download } from 'lucide-react';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { Device, Call } from '@twilio/voice-sdk';
import { checkMicrophonePermission } from '@/utils/microphone-permissions';
import { normalizeVoiceProviderStack, supportsBrowserVoiceConnection, type VoiceProviderStack } from '@shared/types/call-types';

const CONNECTION_STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_DEVICE_RECONNECT_ATTEMPTS = 5;
const POOR_QUALITY_MOS_THRESHOLD = 2.5;
const POOR_QUALITY_DURATION_MS = 30000;
const RESTORE_QUALITY_MOS_THRESHOLD = 3.5;
const RESTORE_QUALITY_DURATION_MS = 20000;
const RECONNECTION_TIMEOUT_MS = 30000;
const CALL_STATS_INTERVAL_MS = 10000;
const MAX_ERROR_LOG_COUNT = 5;

// Custom CSS for animations
const pulseRingStyles = `
  @keyframes pulse-ring {
    0% { transform: scale(0.8); opacity: 0.8; }
    50% { transform: scale(1.2); opacity: 0.3; }
    100% { transform: scale(0.8); opacity: 0.8; }
  }
  .animate-pulse-ring {
    animation: pulse-ring 2s ease-in-out infinite;
  }
`;

interface CallScreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string;
  contactName: string;
  contactPhone: string;
  contactAvatar?: string;
  conferenceName?: string; // Required for direct calls
  channelId?: number; // Required for direct calls
  callType?: 'direct' | 'ai-powered';
  providerStack?: VoiceProviderStack;
  supportsBrowserDirect?: boolean;
}

type CallStatus = 'queued' | 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'busy' | 'no-answer' | 'canceled';

const CALL_STATUS_PRIORITY: Record<CallStatus, number> = {
  queued: 0,
  initiated: 1,
  ringing: 2,
  'in-progress': 3,
  completed: 4,
  failed: 4,
  busy: 4,
  'no-answer': 4,
  canceled: 4
};

interface CallConnectionState {
  callId: string;
  conferenceName: string;
  callStatus: CallStatus;
  callStartTime: string | null;
  isMuted: boolean;
  deviceToken: string;
  timestamp: number;
}

interface CallQualityWarning {
  name: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

interface CallMetricsEvent {
  type: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

interface CallTransitionResponseData {
  callId?: number | string;
  callType?: 'direct' | 'ai-powered';
  providerStack?: VoiceProviderStack;
  supportsBrowserDirect?: boolean;
  conferenceName?: string;
  channelId?: number;
}

function CallQualityIndicator({ mos, rtt, jitter, packetLoss }: { mos: number | null; rtt: number | null; jitter: number | null; packetLoss: number | null }) {
  const score = mos ?? 0;
  const bars = score >= 4 ? 3 : score >= 3.5 ? 2 : score >= 3 ? 1 : score >= 2.5 ? 1 : 0;
  const colorClass = score >= 4 ? 'text-green-400' : score >= 3 ? 'text-yellow-400' : score >= 2.5 ? 'text-orange-400' : 'text-red-400';
  const label = score >= 4 ? 'Excellent connection' : score >= 3.5 ? 'Good connection' : score >= 3 ? 'Fair connection - may experience minor issues' : score >= 2.5 ? 'Poor connection - quality degraded' : 'Very poor connection - consider ending call';
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-md bg-black/20 ${colorClass}`} title={label}>
            <Wifi className="w-4 h-4" />
            <span className="flex items-end gap-0.5 h-4">
              {[1, 2, 3].map(i => (
                <span key={i} className={`block w-1 rounded-sm min-h-[4px] ${i <= bars ? 'bg-current flex-1' : 'bg-current/30'}`} style={{ height: `${4 + i * 2}px` }} />
              ))}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium">{label}</p>
          <p className="text-xs text-white/70 mt-1">Latency: {rtt != null ? `${rtt} ms` : '—'}</p>
          <p className="text-xs text-white/70">Jitter: {jitter != null ? `${jitter} ms` : '—'}</p>
          <p className="text-xs text-white/70">Packet Loss: {packetLoss != null ? `${packetLoss}%` : '—'}</p>
          <p className="text-xs text-white/70">Call Quality Score (MOS): {mos != null ? mos.toFixed(1) : '—'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const CallScreenModal: React.FC<CallScreenModalProps> = ({
  isOpen,
  onClose,
  callId,
  contactName,
  contactPhone,
  contactAvatar,
  conferenceName: initialConferenceName,
  channelId,
  callType = 'ai-powered',
  providerStack,
  supportsBrowserDirect
}) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { onMessage, isConnected } = useSocket('/ws');
  const initialResolvedProviderStack = normalizeVoiceProviderStack(providerStack);
  const [activeCallId, setActiveCallId] = useState(callId);
  const [activeCallType, setActiveCallType] = useState<'direct' | 'ai-powered'>(callType);
  const [activeProviderStack, setActiveProviderStack] = useState<VoiceProviderStack>(initialResolvedProviderStack);
  const [activeSupportsBrowserDirect, setActiveSupportsBrowserDirect] = useState(
    supportsBrowserDirect ?? supportsBrowserVoiceConnection(initialResolvedProviderStack)
  );
  const [activeConferenceName, setActiveConferenceName] = useState<string | undefined>(initialConferenceName);
  const [activeChannelId, setActiveChannelId] = useState<number | undefined>(channelId);
  const browserDirectSupported = activeSupportsBrowserDirect;
  const isBrowserDirectCall = activeCallType === 'direct' && browserDirectSupported;
  const [callStatus, setCallStatus] = useState<CallStatus>('ringing');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Error state management
  const [errorType, setErrorType] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<any>(null);
  const [showRetryButton, setShowRetryButton] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  // Twilio Voice SDK state for direct calls
  const [twilioDevice, setTwilioDevice] = useState<Device | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [isDeviceReady, setIsDeviceReady] = useState(false);
  const [isConnectingToConference, setIsConnectingToConference] = useState(false);
  const [micPermissionError, setMicPermissionError] = useState<string | null>(null);
  const conferenceName = activeConferenceName;
  
  // Microphone active state for visual indicator
  const [isMicrophoneActive, setIsMicrophoneActive] = useState(false);
  
  // Refs to track latest instances for cleanup
  const twilioDeviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const deviceTokenRef = useRef<string>('');
  
  // Audio output device state for speaker toggle
  const [availableSpeakers, setAvailableSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [currentSpeakerId, setCurrentSpeakerId] = useState<string | null>(null);

  // Connection state persistence
  const [isRestoringState, setIsRestoringState] = useState(false);

  // Device reconnection
  const [deviceReconnectAttempts, setDeviceReconnectAttempts] = useState(0);
  const [isDeviceReconnecting, setIsDeviceReconnecting] = useState(false);
  const isDeviceReconnectingRef = useRef(false);
  const isIntentionalDisconnect = useRef(false);

  // Voice Insights / quality
  const [callQualityWarnings, setCallQualityWarnings] = useState<CallQualityWarning[]>([]);
  const [currentRTT, setCurrentRTT] = useState<number | null>(null);
  const [currentMOS, setCurrentMOS] = useState<number | null>(null);
  const [currentJitter, setCurrentJitter] = useState<number | null>(null);
  const [currentPacketLoss, setCurrentPacketLoss] = useState<number | null>(null);
  const callStatsRef = useRef<Record<string, unknown> | null>(null);
  const callStatsIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ICE restart / media reconnection
  const [isReconnectingMedia, setIsReconnectingMedia] = useState(false);
  const reconnectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Graceful degradation
  const [isQualityDegraded, setIsQualityDegraded] = useState(false);
  const [isOptimizeForPoorNetwork, setIsOptimizeForPoorNetwork] = useState(false);
  const poorQualityStartRef = useRef<number | null>(null);
  const goodQualityStartRef = useRef<number | null>(null);

  // Network pre-check

  // Error tracking
  const errorLogRef = useRef<Array<{ type: string; message: string; timestamp: number }>>([]);

  // Connection metrics
  const callMetricsLog = useRef<CallMetricsEvent[]>([]);
  const [shiftKeyHeld, setShiftKeyHeld] = useState(false);

  useEffect(() => {
    setActiveCallId(callId);
    const nextProviderStack = normalizeVoiceProviderStack(providerStack);
    setActiveCallType(callType);
    setActiveProviderStack(nextProviderStack);
    setActiveSupportsBrowserDirect(supportsBrowserDirect ?? supportsBrowserVoiceConnection(nextProviderStack));
    setActiveConferenceName(initialConferenceName);
    setActiveChannelId(channelId);
  }, [callId, callType, providerStack, supportsBrowserDirect, initialConferenceName, channelId]);

  const applyCallTransitionData = useCallback((data?: CallTransitionResponseData) => {
    if (!data) return;

    const nextProviderStack = normalizeVoiceProviderStack(data.providerStack ?? activeProviderStack);
    setActiveProviderStack(nextProviderStack);
    setActiveCallType(data.callType === 'direct' || data.callType === 'ai-powered' ? data.callType : activeCallType);
    setActiveSupportsBrowserDirect(
      typeof data.supportsBrowserDirect === 'boolean'
        ? data.supportsBrowserDirect
        : supportsBrowserVoiceConnection(nextProviderStack)
    );

    if (typeof data.conferenceName === 'string' && data.conferenceName.length > 0) {
      setActiveConferenceName(data.conferenceName);
    }

    if (typeof data.channelId === 'number') {
      setActiveChannelId(data.channelId);
    }

    if (typeof data.callId !== 'undefined') {
      setActiveCallId(String(data.callId));
    }
  }, [activeCallType, activeProviderStack]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftKeyHeld(true); };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftKeyHeld(false); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
  }, []);

  // Fetch call details - only for status updates, not initialization data
  const { data: callData, refetch } = useQuery({
    queryKey: ['/api/call-logs', activeCallId],
    queryFn: async () => {
      const response = await fetch(`/api/call-logs/${activeCallId}`);
      const data = await response.json();
      return data.success ? data.data : null;
    },
    enabled: !!activeCallId && isOpen,
    refetchInterval: (query: any) => {
      const status = query?.data?.status;
      return ['completed', 'failed', 'no-answer', 'busy'].includes(status) 
        ? false 
        : 2000;
    }
  });

  // Hang up mutation
  const hangUpMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/call-logs/${activeCallId}/hangup`, {
        method: 'DELETE',
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to hang up');
      }
      return data;
    },
    onSuccess: () => {
      setCallStatus('completed');
      clearConnectionState(activeCallId);
      setTimeout(() => {
        onClose();
      }, 2000);
    },
    onError: (error) => {
      console.error('Hang up error:', error);
    }
  });

  // Connection state persistence
  const saveConnectionState = useCallback((state: Omit<CallConnectionState, 'timestamp'>) => {
    if (!activeCallId || !conferenceName) return;
    const payload: CallConnectionState = {
      ...state,
      callId: activeCallId,
      conferenceName: conferenceName || '',
      timestamp: Date.now()
    };
    try {
      localStorage.setItem(`twilio_call_state_${activeCallId}`, JSON.stringify(payload));
    } catch (e) {
      console.warn('[CallScreenModal] Failed to save connection state:', e);
    }
  }, [activeCallId, conferenceName]);

  const restoreConnectionState = useCallback((): CallConnectionState | null => {
    if (!activeCallId) return null;
    try {
      const raw = localStorage.getItem(`twilio_call_state_${activeCallId}`);
      if (!raw) return null;
      const state = JSON.parse(raw) as CallConnectionState;
      if (Date.now() - state.timestamp > CONNECTION_STATE_TTL_MS) {
        localStorage.removeItem(`twilio_call_state_${activeCallId}`);
        return null;
      }
      return state;
    } catch {
      return null;
    }
  }, [activeCallId]);

  const clearConnectionState = useCallback((id: string) => {
    try {
      localStorage.removeItem(`twilio_call_state_${id}`);
    } catch (e) {
      console.warn('[CallScreenModal] Failed to clear connection state:', e);
    }
  }, []);

  // Network pre-check
  // Log error for debugging
  const logError = useCallback((type: string, message: string) => {
    const entry = { type, message, timestamp: Date.now() };
    errorLogRef.current = [entry, ...errorLogRef.current].slice(0, MAX_ERROR_LOG_COUNT);
  }, []);

  // Handle call errors (including WebRTC-specific)
  const handleCallError = (data: any) => {
    const numericCallId = parseInt(activeCallId, 10);
    if (!isNaN(numericCallId) && data.data?.callId === numericCallId) {
      const error = data.data.error;
      const errType = error?.type || 'unknown';
      setErrorType(errType);
      setErrorDetails(error?.details || {});

      let userMessage = '';
      let canRetry = false;

      switch (errType) {
        case 'authentication':
          userMessage = t('call_screen.error.authentication');
          canRetry = false;
          break;
        case 'network':
          userMessage = t('call_screen.error.network');
          canRetry = true;
          break;
        case 'rate_limit':
          userMessage = t('call_screen.error.rate_limit');
          canRetry = true;
          break;
        case 'ai_unavailable':
          userMessage = t('call_screen.error.ai_unavailable');
          canRetry = false;
          break;
        case 'invalid_phone':
          userMessage = t('call_screen.error.invalid_phone');
          canRetry = false;
          break;
        case 'insufficient_balance':
          userMessage = t('call_screen.error.insufficient_balance');
          canRetry = false;
          break;
        case 'service_unavailable':
          userMessage = t('call_screen.error.service_unavailable');
          canRetry = true;
          break;
        case 'connection_failed':
          userMessage = t('call_screen.error.connection_failed');
          canRetry = true;
          break;
        case 'timeout':
          userMessage = t('call_screen.error.timeout');
          canRetry = true;
          break;
        case 'media_connection_failed':
          userMessage = 'Unable to establish media connection. Check your network and try again.';
          canRetry = true;
          break;
        case 'ice_connection_failed':
          userMessage = 'Connection setup failed. Please check your firewall settings.';
          canRetry = true;
          break;
        case 'signaling_connection_error':
          userMessage = 'Lost connection to call server. Reconnecting...';
          canRetry = true;
          break;
        case 'microphone_access_denied':
          userMessage = 'Microphone access denied. Please enable microphone permissions.';
          canRetry = false;
          break;
        case 'device_registration_failed':
          userMessage = 'Failed to register device. Please refresh and try again.';
          canRetry = true;
          break;
        default:
          userMessage = t('call_screen.error.unknown');
          canRetry = true;
      }

      logError(errType, userMessage);
      setErrorMessage(userMessage);
      setShowRetryButton(canRetry && retryCount < 2);
      setCallStatus('failed');

      if (canRetry && errType !== 'rate_limit' && retryCount < 2) {
        if (['media_connection_failed', 'ice_connection_failed', 'signaling_connection_error'].includes(errType)) {
          setTimeout(() => handleRetryCall(), 2000);
        } else {
          setTimeout(() => handleRetryCall(), 2000);
        }
      }
    }
  };

  // Handle retry call
  const handleRetryCall = async () => {
    if (isRetrying || retryCount >= 2) return;
    
    setIsRetrying(true);
    setRetryCount(prev => prev + 1);
    
    try {
      // Reset error state
      setErrorType(null);
      setErrorMessage(null);
      setErrorDetails(null);
      setShowRetryButton(false);
      setCallStatus('ringing');
      
      // Attempt to retry the call
      const response = await fetch(`/api/call-logs/${activeCallId}/retry`, {
        method: 'POST',
      });
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to retry call');
      }

      applyCallTransitionData(data.data);
      
      // Show success message
      setTimeout(() => {
        setIsRetrying(false);
      }, 1000);
    } catch (error) {
      console.error('Retry error:', error);
      setIsRetrying(false);
      setErrorMessage(t('call_screen.error.retry_failed'));
      setShowRetryButton(false);
    }
  };

  // Handle fallback to direct call
  const handleSwitchToDirect = async () => {
    try {
      const response = await fetch(`/api/call-logs/${activeCallId}/fallback-direct`, {
        method: 'POST',
      });
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to switch to direct call');
      }

      applyCallTransitionData(data.data);
      
      // Reset state and continue with direct call
      setErrorType(null);
      setErrorMessage(null);
      setErrorDetails(null);
      setShowRetryButton(false);
      setCallStatus('ringing');
    } catch (error) {
      console.error('Fallback error:', error);
      setErrorMessage(t('call_screen.error.fallback_failed'));
    }
  };

  // Initialize Twilio Device for direct calls
  const initializeTwilioDevice = useCallback(async () => {
    if (!isBrowserDirectCall) {
      console.log('[CallScreenModal] Skipping Twilio Device init - browser direct is not enabled for this call');
      return;
    }

    // Fail fast if required props are missing for direct calls
    if (!conferenceName) {
      console.error('[CallScreenModal] Missing required prop: conferenceName');
      setErrorMessage('Configuration error: Conference name not provided');
      return;
    }

    if (!activeChannelId) {
      console.error('[CallScreenModal] Missing required prop: channelId');
      setErrorMessage('Configuration error: Channel ID not provided');
      return;
    }

    try {
      console.log('[CallScreenModal] Initializing Twilio Device for direct call...');
      setMicPermissionError(null);

      // Check microphone permission - should already be granted from CallTypeSelectionModal or ConversationView
      // This is a secondary check as a fallback for edge cases (e.g., permission revoked after granting)
      const permissionStatus = await checkMicrophonePermission();
      console.log('[CallScreenModal] Microphone permission status:', permissionStatus);
      
      if (permissionStatus !== 'granted') {
        // Fallback: Request permission if not already granted (edge case)
        try {
          const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          // Stop all tracks immediately - we just needed to request permission
          permissionStream.getTracks().forEach(track => {
            track.stop();
            console.log('[CallScreenModal] Stopped fallback permission stream track:', track.kind);
          });
          console.log('[CallScreenModal] Microphone permission granted via fallback');
        } catch (permError: any) {
          console.error('[CallScreenModal] Microphone permission denied (fallback):', permError);
          // Provide specific error messages based on error type
          let errorMsg = 'Microphone access is required for direct calls. Please allow microphone access and try again.';
          if (permError.name === 'NotAllowedError') {
            errorMsg = 'Microphone permission denied. Please allow access in your browser settings and try again.';
          } else if (permError.name === 'NotFoundError') {
            errorMsg = 'No microphone found. Please connect a microphone and try again.';
          } else if (permError.name === 'NotReadableError') {
            errorMsg = 'Microphone is being used by another application. Please close other apps and try again.';
          }
          setMicPermissionError(errorMsg);
          return;
        }
      } else {
        console.log('[CallScreenModal] Microphone permission already granted - proceeding directly');
      }

      // Fetch access token from backend - channelId is required
      if (!activeChannelId) {
        throw new Error('Channel ID is required for voice token generation');
      }
      
      const tokenUrl = `/api/twilio/voice-token?channelId=${activeChannelId}`;
      const response = await fetch(tokenUrl);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get voice token');
      }

      const { token, identity } = await response.json();
      console.log(`[CallScreenModal] Got voice token for identity: ${identity}`);
      deviceTokenRef.current = token;

      // Create and configure Twilio Device
      const device = new Device(token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
        logLevel: 1 // Warnings only
      });

      // Explicitly set default microphone so the SDK attaches audio to the call (required in many browsers)
      if (device.audio) {
        try {
          await device.audio.setInputDevice('default');
          console.log('[CallScreenModal] Input device set to default - microphone attached');
        } catch (inputErr: any) {
          console.warn('[CallScreenModal] setInputDevice(default) failed, continuing:', inputErr?.message || inputErr);
        }
        try {
          if (device.audio.speakerDevices?.set) {
            await device.audio.speakerDevices.set('default');
            setCurrentSpeakerId('default');
            console.log('[CallScreenModal] Speaker set to default');
          }
        } catch (speakerErr: any) {
          console.warn('[CallScreenModal] set speaker default failed:', speakerErr?.message || speakerErr);
        }
      }
      setIsMicrophoneActive(true);

      // Reconnection with exponential backoff (same pattern as useSocket.ts)
      const reconnectDevice = async () => {
        if (isDeviceReconnectingRef.current) return;
        isDeviceReconnectingRef.current = true;
        setIsDeviceReconnecting(true);

        setDeviceReconnectAttempts(prev => {
          const attempts = prev + 1;
          if (attempts > MAX_DEVICE_RECONNECT_ATTEMPTS) {
            setErrorMessage('Unable to reconnect. Please refresh the page and try again.');
            isDeviceReconnectingRef.current = false;
            setIsDeviceReconnecting(false);
            return prev;
          }
          const delay = Math.min(1000 * Math.pow(2, attempts - 1), 30000);
          setTimeout(async () => {
            try {
              await device.register();
              isDeviceReconnectingRef.current = false;
              setDeviceReconnectAttempts(0);
              setIsDeviceReconnecting(false);
              callMetricsLog.current.push({ type: 'device_reconnect_success', timestamp: Date.now() });
            } catch (err) {
              console.warn('[CallScreenModal] Device reconnection attempt failed:', err);
              isDeviceReconnectingRef.current = false;
              reconnectDevice();
            }
          }, delay);
          return attempts;
        });
      };

      // Device event handlers
      device.on('registered', () => {
        console.log('[CallScreenModal] Twilio Device registered successfully');
        setIsDeviceReady(true);
        callMetricsLog.current.push({ type: 'device_registered', timestamp: Date.now() });
      });

      device.on('error', (error: any) => {
        console.error('[CallScreenModal] Twilio Device error:', error);
        setErrorMessage(`Voice connection error: ${error.message || 'Unknown error'}`);
        callMetricsLog.current.push({ type: 'device_error', timestamp: Date.now(), data: { message: error?.message } });
      });

      device.on('unregistered', () => {
        console.log('[CallScreenModal] Twilio Device unregistered');
        setIsDeviceReady(false);
        setIsMicrophoneActive(false);
        if (!isIntentionalDisconnect.current) {
          reconnectDevice();
        }
      });

      device.on('offline', () => {
        console.log('[CallScreenModal] Device offline');
        if (!isIntentionalDisconnect.current) {
          reconnectDevice();
        }
      });

      const refreshAudioDevices = async (dev: Device) => {
        try {
          if (dev.audio) {
            const inputs = Array.from(dev.audio.availableInputDevices.values());
            const outputs = Array.from(dev.audio.availableOutputDevices.values());
            setAvailableSpeakers(Array.isArray(outputs) ? outputs : []);
            callMetricsLog.current.push({ type: 'audio_devices_refreshed', timestamp: Date.now() });
          }
        } catch (e) {
          console.warn('[CallScreenModal] refreshAudioDevices failed:', e);
        }
      };

      // Listen for audio device changes (enhanced)
      if (device.audio) {
        device.audio.on('deviceChange', (lostActiveDevices: MediaDeviceInfo[]) => {
          console.log('[CallScreenModal] Audio device change detected', lostActiveDevices.map(d => d.label));
          if (lostActiveDevices.length > 0) {
            toast({
              title: 'Audio device disconnected',
              description: 'Switching to default device.',
              variant: 'default'
            });
            callMetricsLog.current.push({ type: 'audio_device_change', timestamp: Date.now(), data: { lost: lostActiveDevices.map(d => d.label) } });
            navigator.mediaDevices.enumerateDevices().then(devices => {
              const outputs = devices.filter(d => d.kind === 'audiooutput');
              setAvailableSpeakers(outputs);
              if (outputs.length > 0 && device.audio?.speakerDevices) {
                const defaultId = outputs[0].deviceId;
                device.audio.speakerDevices.set(defaultId).then(() => setCurrentSpeakerId(defaultId)).catch(console.warn);
              }
              if (outputs.length === 0) {
                setErrorMessage('No audio devices available. Please check your connections.');
              }
            });
          }
          refreshAudioDevices(device);
        });
      }

      // Register the device
      await device.register();
      setTwilioDevice(device);

    } catch (error) {
      console.error('[CallScreenModal] Failed to initialize Twilio Device:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to initialize voice connection');
    }
  }, [isBrowserDirectCall, conferenceName, activeChannelId, toast]);

  // Join conference when device is ready and call is in-progress
  const joinConference = useCallback(async () => {
    if (!twilioDevice || !isDeviceReady || !conferenceName || activeCall) {
      return;
    }

    const terminalStatuses = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
    if (terminalStatuses.includes(callStatus)) {
      console.log('[CallScreenModal] Not joining conference - call ended:', callStatus);
      return;
    }

    // Verify microphone is active before joining
    if (!isMicrophoneActive) {
      console.error('[CallScreenModal] Microphone not ready - cannot join conference');
      setErrorMessage('Microphone not ready - cannot join conference');
      return;
    }

    try {
      setIsConnectingToConference(true);
      console.log(`[CallScreenModal] Joining conference: ${conferenceName}`);
      callMetricsLog.current.push({ type: 'call_connect_attempt', timestamp: Date.now(), data: { conferenceName } });

      const call = await twilioDevice.connect({
        params: {
          conferenceName: conferenceName,
          ...(activeChannelId !== undefined ? { channelId: String(activeChannelId) } : {})
        }
      });

      const getCallStats = () => {
        try {
          if (typeof (call as any).getStats === 'function') {
            (call as any).getStats().then((stats: Record<string, unknown>) => {
              callStatsRef.current = stats;
            }).catch(() => {});
          }
        } catch (_) {}
      };

      call.on('accept', () => {
        console.log('[CallScreenModal] Call accepted - connected to conference');
        setIsConnectingToConference(false);
        callMetricsLog.current.push({ type: 'call_accepted', timestamp: Date.now() });
        // For direct calls, do NOT set callStatus to in-progress here. The agent joining
        // the conference ≠ callee answering. Status comes from server (Twilio status webhooks).
        if (!isBrowserDirectCall) {
          const acceptedAt = new Date();
          setCallStatus('in-progress');
          setCallStartTime(acceptedAt);
          setCallDuration(0);
          saveConnectionState({
            callId: activeCallId,
            conferenceName: conferenceName || '',
            callStatus: 'in-progress',
            callStartTime: acceptedAt.toISOString(),
            isMuted,
            deviceToken: deviceTokenRef.current
          });
        }
      });

      call.on('disconnect', () => {
        console.log('[CallScreenModal] Call disconnected');
        if (callStatsIntervalRef.current) {
          clearInterval(callStatsIntervalRef.current);
          callStatsIntervalRef.current = null;
        }
        if (reconnectionTimeoutRef.current) {
          clearTimeout(reconnectionTimeoutRef.current);
          reconnectionTimeoutRef.current = null;
        }
        setIsReconnectingMedia(false);
        setActiveCall(null);
        setIsConnectingToConference(false);
        setCallQualityWarnings([]);
        setCurrentRTT(null);
        setCurrentMOS(null);
        setCurrentJitter(null);
        setCurrentPacketLoss(null);
        callMetricsLog.current.push({ type: 'call_disconnected', timestamp: Date.now(), data: { duration: callDuration } });
        clearConnectionState(activeCallId);
      });

      call.on('error', (error: any) => {
        console.error('[CallScreenModal] Call error:', error);
        setIsConnectingToConference(false);
        setErrorMessage(`Call error: ${error.message || 'Unknown error'}`);
      });

      call.on('mute', (newIsMuted: boolean) => {
        console.log('[CallScreenModal] Mute state changed:', newIsMuted);
        setIsMuted(newIsMuted);
        saveConnectionState({
          callId: activeCallId,
          conferenceName: conferenceName || '',
          callStatus,
          callStartTime: callStartTime ? callStartTime.toISOString() : null,
          isMuted: newIsMuted,
          deviceToken: deviceTokenRef.current
        });
      });

      (call as any).on?.('warning', (warningName: string, warningData?: Record<string, unknown>) => {
        const w: CallQualityWarning = { name: warningName, data: warningData, timestamp: Date.now() };
        setCallQualityWarnings(prev => [...prev, w]);
        callMetricsLog.current.push({ type: 'quality_warning', timestamp: Date.now(), data: { name: warningName, ...warningData } });
        if (warningData?.rtt != null) setCurrentRTT(warningData.rtt as number);
        if (warningData?.mos != null) setCurrentMOS(warningData.mos as number);
        if (warningData?.jitter != null) setCurrentJitter(warningData.jitter as number);
        if (warningData?.packetLoss != null) setCurrentPacketLoss(warningData.packetLoss as number);
        console.log('[CallScreenModal] Quality warning:', warningName, warningData);
        const mos = warningData?.mos as number | undefined;
        const rtt = warningData?.rtt as number | undefined;
        if (mos != null && mos < 3.0) {
          toast({ title: 'Poor call quality', description: `Quality score low (${mos.toFixed(1)}). Connection may be unstable.`, variant: 'destructive' });
        } else if (rtt != null && rtt > 600) {
          toast({ title: 'High latency', description: `Latency is high (${Math.round(rtt)}ms). You may notice delay.`, variant: 'destructive' });
        }
      });

      (call as any).on?.('warning-cleared', (warningName: string) => {
        setCallQualityWarnings(prev => prev.filter(w => w.name !== warningName));
      });

      (call as any).on?.('reconnecting', (error?: unknown) => {
        setIsReconnectingMedia(true);
        callMetricsLog.current.push({ type: 'call_reconnecting', timestamp: Date.now(), data: { error: String(error) } });
        console.log('[CallScreenModal] Call reconnecting:', error);
        saveConnectionState({
          callId: activeCallId,
          conferenceName: conferenceName || '',
          callStatus,
          callStartTime: callStartTime ? callStartTime.toISOString() : null,
          isMuted,
          deviceToken: deviceTokenRef.current
        });
        if (reconnectionTimeoutRef.current) clearTimeout(reconnectionTimeoutRef.current);
        reconnectionTimeoutRef.current = setTimeout(() => {
          setIsReconnectingMedia(false);
          setErrorMessage('Reconnection timed out. You can retry or end the call.');
          setShowRetryButton(true);
        }, RECONNECTION_TIMEOUT_MS);
      });

      (call as any).on?.('reconnected', () => {
        setIsReconnectingMedia(false);
        if (reconnectionTimeoutRef.current) {
          clearTimeout(reconnectionTimeoutRef.current);
          reconnectionTimeoutRef.current = null;
        }
        toast({ title: 'Call reconnected', description: 'Call reconnected successfully.', variant: 'default' });
        callMetricsLog.current.push({ type: 'call_reconnected', timestamp: Date.now() });
        setCallQualityWarnings([]);
      });

      callStatsIntervalRef.current = setInterval(getCallStats, CALL_STATS_INTERVAL_MS);
      getCallStats();

      setActiveCall(call);

    } catch (error) {
      console.error('[CallScreenModal] Failed to join conference:', error);
      setIsConnectingToConference(false);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to join conference');
    }
  }, [twilioDevice, isDeviceReady, conferenceName, activeChannelId, activeCall, callStatus, saveConnectionState, clearConnectionState, activeCallId, callStartTime, isMuted, isBrowserDirectCall]);

  // Keep refs in sync with state
  useEffect(() => {
    twilioDeviceRef.current = twilioDevice;
  }, [twilioDevice]);
  
  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);
  
  // Cleanup Twilio Device on unmount or when modal closes
  useEffect(() => {
    if (!isOpen) {
      // Modal closed - cleanup immediately
      if (activeCallRef.current) {
        console.log('[CallScreenModal] Disconnecting active call on modal close');
        activeCallRef.current.disconnect();
        setActiveCall(null);
      }
      if (twilioDeviceRef.current) {
        console.log('[CallScreenModal] Cleaning up Twilio Device on modal close');
        isIntentionalDisconnect.current = true;
        try {
          if (twilioDeviceRef.current.audio) {
            twilioDeviceRef.current.audio.unsetInputDevice();
            console.log('[CallScreenModal] Input device unset successfully');
          }
        } catch (unsetError) {
          console.warn('[CallScreenModal] Failed to unset input device:', unsetError);
        }
        twilioDeviceRef.current.destroy();
        setTwilioDevice(null);
        setIsDeviceReady(false);
        setIsMicrophoneActive(false);
      }
    }
    
    return () => {
      // Component unmount - use refs to get latest instances
      if (activeCallRef.current) {
        console.log('[CallScreenModal] Disconnecting active call on unmount');
        activeCallRef.current.disconnect();
      }
      if (twilioDeviceRef.current) {
        console.log('[CallScreenModal] Cleaning up Twilio Device on unmount');
        isIntentionalDisconnect.current = true;
        try {
          if (twilioDeviceRef.current.audio) {
            twilioDeviceRef.current.audio.unsetInputDevice();
            console.log('[CallScreenModal] Input device unset on unmount');
          }
        } catch (unsetError) {
          console.warn('[CallScreenModal] Failed to unset input device on unmount:', unsetError);
        }
        twilioDeviceRef.current.destroy();
      }
    };
  }, [isOpen]);

  // Restore connection state on mount (e.g. after refresh)
  useEffect(() => {
    if (!isOpen || !isBrowserDirectCall || !activeCallId) return;
    const state = restoreConnectionState();
    if (state) {
      setIsRestoringState(true);
      setCallStatus(state.callStatus);
      if (state.callStartTime) setCallStartTime(new Date(state.callStartTime));
      setIsMuted(state.isMuted);
      const t = setTimeout(() => setIsRestoringState(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isOpen, isBrowserDirectCall, activeCallId, restoreConnectionState]);

  // Initialize Twilio Device when modal opens for direct calls
  useEffect(() => {
    if (!isOpen || !isBrowserDirectCall || !conferenceName || twilioDevice) return;
    initializeTwilioDevice();
  }, [isOpen, isBrowserDirectCall, conferenceName, twilioDevice, initializeTwilioDevice]);

  // Join conference when device is ready and call is not in a terminal state (so agent is in conference when contact answers)
  useEffect(() => {
    const terminalStatuses = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
    const canJoin = !terminalStatuses.includes(callStatus);
    const shouldJoin = !!(isBrowserDirectCall && isDeviceReady && conferenceName && !activeCall && canJoin);
    if (shouldJoin) {
      joinConference();
    }
  }, [isBrowserDirectCall, isDeviceReady, conferenceName, activeCall, callStatus, joinConference]);

  // WebSocket event listeners
  useEffect(() => {
    if (!isOpen) return;

    const handleCallStatusUpdate = (data: any) => {
      const numericCallId = parseInt(activeCallId, 10);
      console.log('[CallScreenModal][DEBUG] callStatusUpdate received:', {
        receivedCallId: data.data?.callId,
        modalCallId: activeCallId,
        parsedModalCallId: numericCallId,
        match: data.data?.callId === numericCallId,
        status: data.data?.status
      });
      if (!isNaN(numericCallId) && data.data?.callId === numericCallId) {
        const status = data.data?.status;
        setCallStatus(status);
        if (status === 'in-progress' && !callStartTime) {
          const serverStartedAt = data.data?.startedAt;
          setCallStartTime(serverStartedAt ? new Date(serverStartedAt) : new Date());
        }
        if (isBrowserDirectCall && conferenceName && status) {
          saveConnectionState({
            callId: activeCallId,
            conferenceName,
            callStatus: status as CallStatus,
            callStartTime: callStartTime ? callStartTime.toISOString() : null,
            isMuted,
            deviceToken: deviceTokenRef.current
          });
        }
      }
    };

    const handleCallCompleted = (data: any) => {
      const numericCallId = parseInt(activeCallId, 10);
      if (!isNaN(numericCallId) && data.data?.callId === numericCallId) {
        setCallStatus('completed');
        setTimeout(() => {
          onClose();
        }, 2000);
      }
    };

    const handleCallFailed = (data: any) => {
      const numericCallId = parseInt(activeCallId, 10);
      if (!isNaN(numericCallId) && data.data?.callId === numericCallId) {
        setCallStatus('failed');
        setTimeout(() => {
          onClose();
        }, 3000);
      }
    };

    const handleCallBusy = (data: any) => {
      const numericCallId = parseInt(activeCallId, 10);
      if (!isNaN(numericCallId) && data.data?.callId === numericCallId) {
        setCallStatus('busy');
        setTimeout(() => {
          onClose();
        }, 3000);
      }
    };

    const handleCallNoAnswer = (data: any) => {
      const numericCallId = parseInt(activeCallId, 10);
      if (!isNaN(numericCallId) && data.data?.callId === numericCallId) {
        setCallStatus('no-answer');
        setTimeout(() => {
          onClose();
        }, 3000);
      }
    };

    const unsubscribeStatusUpdate = onMessage('callStatusUpdate', handleCallStatusUpdate);
    const unsubscribeCompleted = onMessage('callCompleted', handleCallCompleted);
    const unsubscribeFailed = onMessage('callFailed', handleCallFailed);
    const unsubscribeBusy = onMessage('callBusy', handleCallBusy);
    const unsubscribeNoAnswer = onMessage('callNoAnswer', handleCallNoAnswer);
    const unsubscribeError = onMessage('callError', handleCallError);

    return () => {
      unsubscribeStatusUpdate();
      unsubscribeCompleted();
      unsubscribeFailed();
      unsubscribeBusy();
      unsubscribeNoAnswer();
      unsubscribeError();
    };
  }, [activeCallId, isOpen, onClose, callStartTime, onMessage, saveConnectionState, isBrowserDirectCall, conferenceName, isMuted]);

  // Watch polled call data and update status/timer
  useEffect(() => {
    if (!isOpen || !callData) return;

    // Update call status from polled data (only when polled priority >= current to avoid downgrading from stale data)
    const polledStatus = callData.status as CallStatus | undefined;
    const polledPriority = polledStatus ? (CALL_STATUS_PRIORITY[polledStatus] ?? -1) : -1;
    const currentPriority = CALL_STATUS_PRIORITY[callStatus] ?? -1;
    if (polledStatus && polledPriority >= currentPriority && polledStatus !== callStatus) {
      setCallStatus(polledStatus);
    }

    // Update call start time from polled data
    if (callData.startedAt && (!callStartTime || callStartTime.getTime() !== new Date(callData.startedAt).getTime())) {
      setCallStartTime(new Date(callData.startedAt));
    } else if (callData.status === 'in-progress' && !callStartTime && !callData.startedAt) {
      // If call is in-progress but no startedAt, set to now
      setCallStartTime(new Date());
    }

    // Duration while in-progress is driven by callStartTime + interval only — syncing from polls here
    // fights the local timer and makes the display jump every refetch.
    const durationFromLocalTimer = callStatus === 'in-progress' && callStartTime != null;
    if (!durationFromLocalTimer) {
      if (callData.durationSec !== undefined) {
        setCallDuration(prev => (callData.durationSec !== prev ? callData.durationSec! : prev));
      } else if (callData.startedAt && callData.status === 'in-progress') {
        const elapsed = Math.floor((Date.now() - new Date(callData.startedAt).getTime()) / 1000);
        if (elapsed > 0) {
          setCallDuration(prev => (elapsed !== prev ? elapsed : prev));
        }
      }
    }

    // Stop timer if status is terminal
    if (['completed', 'failed', 'no-answer', 'busy'].includes(callData.status)) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    // Auto-close for busy/no-answer statuses (similar to failed)
    if (['busy', 'no-answer'].includes(callData.status)) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [callData, isOpen, callStatus, callStartTime, onClose]);

  // Duration timer
  useEffect(() => {
    if (callStatus === 'in-progress' && callStartTime) {
      const tick = () => {
        setCallDuration(Math.floor((Date.now() - callStartTime.getTime()) / 1000));
      };
      tick();
      intervalRef.current = setInterval(tick, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [callStatus, callStartTime]);

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get status text
  const getStatusText = () => {
    switch (callStatus) {
      case 'queued':
        return t('call_screen.queued');
      case 'initiated':
        return t('call_screen.initiated');
      case 'ringing':
        return t('call_screen.ringing');
      case 'in-progress':
        return t('call_screen.connected');
      case 'completed':
        return t('call_screen.call_ended');
      case 'failed':
        return t('call_screen.call_failed');
      case 'busy':
        return t('call_screen.line_busy');
      case 'no-answer':
        return t('call_screen.no_answer');
      default:
        return '';
    }
  };

  // Get status color
  const getStatusColor = () => {
    switch (callStatus) {
      case 'queued':
      case 'initiated':
        return 'text-blue-400';
      case 'ringing':
        return 'text-yellow-400';
      case 'in-progress':
        return 'text-green-400';
      case 'completed':
        return 'text-gray-400';
      case 'failed':
      case 'busy':
      case 'no-answer':
        return 'text-red-400';
      default:
        return 'text-white';
    }
  };

  const handleHangUp = () => {
    // Disconnect Twilio call first if active
    if (activeCall) {
      console.log('[CallScreenModal] Disconnecting Twilio call');
      activeCall.disconnect();
      setActiveCall(null);
    }
    hangUpMutation.mutate();
  };

  const handleMuteToggle = () => {
    if (activeCall && isBrowserDirectCall) {
      // Use Twilio Call mute for direct calls
      const newMuteState = !isMuted;
      activeCall.mute(newMuteState);
      console.log('[CallScreenModal] Mute toggled via Twilio:', newMuteState);
      setIsMuted(newMuteState);
    } else {
      // For AI-powered calls, just toggle local state (backend handles audio)
      setIsMuted(!isMuted);
    }
  };

  const handleSpeakerToggle = async () => {
    if (!twilioDevice) {
      // No Twilio device - just toggle UI state
      setIsSpeakerOn(!isSpeakerOn);
      return;
    }
    
    try {
      // Get available audio output devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const speakers = devices.filter(d => d.kind === 'audiooutput');
      setAvailableSpeakers(speakers);
      
      if (speakers.length === 0) {
        setIsSpeakerOn(!isSpeakerOn);
        return;
      }
      
      // Find default and speakerphone devices
      const defaultDevice = speakers.find(d => d.deviceId === 'default') || speakers[0];
      const speakerDevice = speakers.find(d => 
        d.label.toLowerCase().includes('speaker') && 
        !d.label.toLowerCase().includes('headphone')
      ) || speakers.find(d => d.deviceId !== 'default') || defaultDevice;
      
      const newSpeakerOn = !isSpeakerOn;
      const targetDeviceId = newSpeakerOn ? speakerDevice?.deviceId : defaultDevice?.deviceId;
      
      if (targetDeviceId && twilioDevice.audio) {
        // Set the speaker device on Twilio Device
        await twilioDevice.audio.speakerDevices.set(targetDeviceId);
        setCurrentSpeakerId(targetDeviceId);
        setIsSpeakerOn(newSpeakerOn);
        console.log(`[CallScreenModal] Speaker toggled to: ${newSpeakerOn ? 'speakerphone' : 'default'} (${targetDeviceId})`);
      } else {
        // Fallback to just toggling state
        setIsSpeakerOn(newSpeakerOn);
      }
    } catch (error) {
      console.error('[CallScreenModal] Failed to toggle speaker:', error);
      // Fallback to just toggling UI state
      setIsSpeakerOn(!isSpeakerOn);
    }
  };

  // Graceful degradation
  const [showPoorQualityDialog, setShowPoorQualityDialog] = useState(false);
  const handlePoorQuality = useCallback(() => {
    setShowPoorQualityDialog(true);
    callMetricsLog.current.push({ type: 'poor_quality_detected', timestamp: Date.now(), data: { mos: currentMOS } });
  }, [currentMOS]);

  // Original device options for restoring after degradation (Opus preferred, no bitrate cap)
  const DEFAULT_CODEC_PREFERENCES = [Call.Codec.Opus, Call.Codec.PCMU] as Call.Codec[];
  const DEGRADED_MAX_AVERAGE_BITRATE = 16000; // Lower bitrate for poor network (RFC 7587: 6000–510000 bps)

  const applyMediaFallback = useCallback((degraded: boolean) => {
    const device = twilioDeviceRef.current;
    if (!device) return;
    try {
      if (degraded) {
        device.updateOptions({
          codecPreferences: [Call.Codec.PCMU],
          maxAverageBitrate: DEGRADED_MAX_AVERAGE_BITRATE
        });
        callMetricsLog.current.push({ type: 'media_fallback_applied', timestamp: Date.now(), data: { codec: 'PCMU', maxAverageBitrate: DEGRADED_MAX_AVERAGE_BITRATE } });
      } else {
        device.updateOptions({
          codecPreferences: DEFAULT_CODEC_PREFERENCES,
          maxAverageBitrate: undefined
        });
        callMetricsLog.current.push({ type: 'media_fallback_restored', timestamp: Date.now() });
      }
    } catch (e) {
      console.warn('[CallScreenModal] Failed to update device options for degradation:', e);
    }
  }, []);

  const degradeCallQuality = useCallback(() => {
    applyMediaFallback(true);
    setIsQualityDegraded(true);
    callMetricsLog.current.push({ type: 'quality_degraded', timestamp: Date.now() });
    toast({ title: 'Call quality optimized', description: 'Call quality optimized for poor network.', variant: 'default' });
  }, [applyMediaFallback]);

  const restoreCallQuality = useCallback(() => {
    applyMediaFallback(false);
    setIsQualityDegraded(false);
    goodQualityStartRef.current = null;
    callMetricsLog.current.push({ type: 'quality_restored', timestamp: Date.now() });
  }, [applyMediaFallback]);

  useEffect(() => {
    if (!isBrowserDirectCall || currentMOS == null) {
      poorQualityStartRef.current = null;
      goodQualityStartRef.current = null;
      return;
    }

    const mos = currentMOS ?? 0;
    if (mos < POOR_QUALITY_MOS_THRESHOLD) {
      if (poorQualityStartRef.current == null) poorQualityStartRef.current = Date.now();
      const elapsed = Date.now() - (poorQualityStartRef.current || 0);
      if (elapsed >= POOR_QUALITY_DURATION_MS && !showPoorQualityDialog) handlePoorQuality();
    } else {
      poorQualityStartRef.current = null;
      if (mos >= RESTORE_QUALITY_MOS_THRESHOLD) {
        if (goodQualityStartRef.current == null) goodQualityStartRef.current = Date.now();
        const elapsed = Date.now() - (goodQualityStartRef.current || 0);
        if (elapsed >= RESTORE_QUALITY_DURATION_MS && isQualityDegraded) restoreCallQuality();
      } else {
        goodQualityStartRef.current = null;
      }
    }
  }, [currentMOS, handlePoorQuality, restoreCallQuality, isQualityDegraded, showPoorQualityDialog, isBrowserDirectCall]);

  // Export diagnostics
  const exportCallMetrics = useCallback(() => {
    const payload = {
      callId: activeCallId,
      conferenceName: conferenceName || '',
      duration: callDuration,
      errorCount: errorLogRef.current.length,
      metrics: callMetricsLog.current,
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-diagnostics-${activeCallId}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeCallId, conferenceName, callDuration]);

  // Fallback text for translations that might not load
  const getStatusTextWithFallback = () => {
    const text = getStatusText();
    // If translation returns the key itself, provide fallback
    if (text.includes('call_screen.')) {
      switch (callStatus) {
        case 'queued': return 'Queuing...';
        case 'initiated': return 'Initiating...';
        case 'ringing': return 'Calling...';
        case 'in-progress': return 'Connected';
        case 'completed': return 'Call Ended';
        case 'failed': return 'Call Failed';
        case 'busy': return 'Line Busy';
        case 'no-answer': return 'No Answer';
        default: return '';
      }
    }
    return text;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <style>{pulseRingStyles}</style>
      <DialogContent className="w-full h-full max-w-none max-h-none m-0 p-0 border-none rounded-none overflow-hidden">
        <DialogTitle className="sr-only">
          Active Call - {contactName}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Phone call in progress with {contactName} at {contactPhone}
        </DialogDescription>

        {/* Background with animated gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
          {/* Animated background circles */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-gradient-to-r from-blue-600/20 to-purple-600/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-gradient-to-r from-green-600/10 to-blue-600/10 blur-3xl" />
        </div>

        {/* Main Content */}
        <div className="relative flex flex-col items-center justify-between h-full px-8 py-8 z-10">
          {/* Reconnecting to call banner (state restore) */}
          {isRestoringState && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm font-medium">
              Reconnecting to call...
            </div>
          )}

          {/* Device reconnection status */}
          {isBrowserDirectCall && isDeviceReconnecting && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-300 text-sm font-medium">
              Reconnecting... (Attempt {deviceReconnectAttempts}/{MAX_DEVICE_RECONNECT_ATTEMPTS})
            </div>
          )}

          {/* Quality degraded banner */}
          {isBrowserDirectCall && callStatus === 'in-progress' && isQualityDegraded && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-orange-500/20 border border-orange-500/30 text-orange-300 text-sm font-medium">
              Call quality optimized for poor network
            </div>
          )}

          {/* Center Section - Avatar and Info */}
          <div className="flex flex-col items-center space-y-6 flex-1 justify-center -mt-8">
            
            {/* Status Badge + Call Quality Indicator (top-right for quality) */}
            <div className="flex items-center justify-center gap-4 flex-wrap">
              <div className={`px-4 py-2 rounded-full backdrop-blur-md border transition-colors duration-500 ${
                isReconnectingMedia
                  ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400'
                  : callStatus === 'ringing' 
                  ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' 
                  : callStatus === 'in-progress'
                  ? 'bg-green-500/20 border-green-500/30 text-green-400'
                  : callStatus === 'completed'
                  ? 'bg-gray-500/20 border-gray-500/30 text-gray-400'
                  : 'bg-red-500/20 border-red-500/30 text-red-400'
              }`}>
                <div className="flex items-center gap-2">
                  {isReconnectingMedia && <div className="w-4 h-4 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />}
                  {!isReconnectingMedia && callStatus === 'ringing' && <PhoneCall className="w-4 h-4 animate-pulse" />}
                  {!isReconnectingMedia && callStatus === 'in-progress' && <Phone className="w-4 h-4" />}
                  {!isReconnectingMedia && callStatus === 'completed' && <PhoneOff className="w-4 h-4" />}
                  {!isReconnectingMedia && ['failed', 'busy', 'no-answer'].includes(callStatus) && <PhoneOff className="w-4 h-4" />}
                  <span className="text-sm font-medium tracking-wide">
                    {isReconnectingMedia ? 'Reconnecting...' : getStatusTextWithFallback()}
                  </span>
                </div>
              </div>
            </div>

            {/* Avatar with animated rings */}
            <div className="relative">
              {/* Pulse rings for ringing state */}
              {callStatus === 'ringing' && (
                <>
                  <div className="absolute inset-0 -m-6 rounded-full border-2 border-blue-400/40 animate-pulse-ring" />
                  <div className="absolute inset-0 -m-12 rounded-full border border-blue-400/20 animate-pulse-ring" style={{ animationDelay: '0.5s' }} />
                  <div className="absolute inset-0 -m-20 rounded-full border border-blue-400/10 animate-pulse-ring" style={{ animationDelay: '1s' }} />
                </>
              )}
              
              {/* Avatar */}
              <div className="w-32 h-32 rounded-full overflow-hidden shadow-2xl ring-4 ring-white/10 relative">
                {contactAvatar ? (
                  <img src={contactAvatar} alt={contactName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 flex items-center justify-center">
                    <span className="text-white text-4xl font-bold drop-shadow-lg">
                      {contactName?.charAt(0)?.toUpperCase() || contactPhone?.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
            </div>


            {/* Contact Info */}
            <div className="text-center space-y-1 mt-4">
              <h2 className="text-white text-2xl font-semibold tracking-tight">
                {contactName || 'Unknown'}
              </h2>
              <p className="text-white/60 text-base font-mono">{contactPhone}</p>
            </div>

            {/* Call timer - prominent when call is in progress */}
            {callStatus === 'in-progress' && (
              <div className="flex flex-col items-center gap-1 mt-2">
                <span className="text-white/50 text-xs font-medium uppercase tracking-widest">
                  Call duration
                </span>
                <div className="font-mono text-3xl font-semibold tabular-nums text-white tracking-wide">
                  {formatDuration(callDuration)}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Section - Controls */}
          <div className="w-full max-w-sm space-y-8 pb-4">
            
            {/* Control Buttons */}
            <div className="flex justify-center gap-6">
              {/* Mute Button with Recording Indicator */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="relative">
                      <button
                        onClick={handleMuteToggle}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-105 active:scale-95 ${
                          isMuted 
                            ? 'bg-red-500/30 ring-2 ring-red-500/50 text-red-400' 
                            : 'bg-white/10 hover:bg-white/20 text-white/80 hover:text-white'
                        }`}
                      >
                        {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                      </button>
                      {/* Recording indicator - pulsing red dot when microphone is active and not muted */}
                      {isMicrophoneActive && !isMuted && isBrowserDirectCall && (
                        <div className="absolute -top-1 -right-1 flex items-center justify-center">
                          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                          <div className="absolute w-3 h-3 bg-red-500 rounded-full animate-ping opacity-75" />
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>{isMuted ? 'Unmute' : isMicrophoneActive ? 'Mute (Recording)' : 'Mute'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {/* Speaker Button */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleSpeakerToggle}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-105 active:scale-95 ${
                        isSpeakerOn 
                          ? 'bg-blue-500/30 ring-2 ring-blue-500/50 text-blue-400' 
                          : 'bg-white/10 hover:bg-white/20 text-white/80 hover:text-white'
                      }`}
                    >
                      {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Speaker</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

            </div>

            {/* Hang Up Button */}
            <div className="flex flex-col items-center">
              <button
                onClick={handleHangUp}
                disabled={hangUpMutation.isPending || ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus)}
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 transform hover:scale-105 active:scale-95 shadow-lg ${
                  callStatus === 'completed' || hangUpMutation.isPending
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-red-500 hover:bg-red-600 shadow-red-500/30 hover:shadow-red-500/50'
                }`}
              >
                {hangUpMutation.isPending ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <PhoneOff className="w-7 h-7 text-white" />
                )}
              </button>
              <span className="text-white/50 text-xs mt-2 font-medium">
                {hangUpMutation.isPending ? 'Ending...' : 'End Call'}
              </span>
            </div>

          </div>
          
          {/* Reconnecting media overlay */}
          {isBrowserDirectCall && isReconnectingMedia && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-sm z-20">
              <div className="text-center p-6 rounded-2xl bg-slate-800/90 border border-yellow-500/30">
                <div className="w-12 h-12 mx-auto mb-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-white font-medium">Reconnecting call...</p>
                <p className="text-white/60 text-sm mt-1">Please wait</p>
              </div>
            </div>
          )}

          {/* Poor quality dialog */}
          {showPoorQualityDialog && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm z-20">
              <div className="text-center p-8 rounded-2xl bg-slate-800/95 border border-orange-500/30 max-w-sm mx-4">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 text-orange-400" />
                <p className="text-white font-semibold mb-2">Call quality is very poor</p>
                <p className="text-white/70 text-sm mb-4">Would you like to switch to audio-only mode?</p>
                <div className="flex flex-col gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowPoorQualityDialog(false)}>Continue</Button>
                  <Button variant="outline" size="sm" onClick={() => { degradeCallQuality(); setShowPoorQualityDialog(false); }}>Switch to Audio-Only</Button>
                  <Button variant="destructive" size="sm" onClick={() => { setShowPoorQualityDialog(false); handleHangUp(); }}>End Call</Button>
                </div>
              </div>
            </div>
          )}

          {/* Status-based overlays */}
          {['failed', 'busy', 'no-answer'].includes(callStatus) && !errorMessage && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm z-20">
              <div className="text-center p-8 rounded-2xl bg-red-950/50 border border-red-500/20 backdrop-blur-md">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                  <PhoneOff className="w-8 h-8 text-red-400" />
                </div>
                <p className="text-white text-xl font-semibold mb-2">{getStatusTextWithFallback()}</p>
                <p className="text-white/60 text-sm mb-4">The call could not be completed</p>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white text-sm font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          
          {/* Error overlay (enhanced: icon color, What you can do, Retry, End Call) */}
          {errorMessage && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm z-20">
              <div className="text-center p-8 rounded-2xl backdrop-blur-md max-w-md mx-4 border border-red-500/20 bg-red-950/50">
                <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
                  ['microphone_access_denied', 'device_registration_failed', 'signaling_connection_error', 'media_connection_failed', 'ice_connection_failed'].includes(errorType || '')
                    ? 'bg-yellow-500/20'
                    : 'bg-red-500/20'
                }`}>
                  {errorType === 'ai_unavailable' ? (
                    <PhoneCall className="w-8 h-8 text-orange-400" />
                  ) : (
                    <PhoneOff className={`w-8 h-8 ${['microphone_access_denied', 'device_registration_failed', 'signaling_connection_error'].includes(errorType || '') ? 'text-yellow-400' : 'text-red-400'}`} />
                  )}
                </div>
                <p className="text-white text-xl font-semibold mb-2">{errorMessage}</p>
                <div className="text-left mb-4 p-3 bg-black/20 rounded-lg text-sm text-white/80">
                  <p className="font-medium text-white/90 mb-1">What you can do:</p>
                  <ul className="list-disc list-inside space-y-1 text-white/70">
                    {errorType === 'microphone_access_denied' && <li>Enable microphone in browser settings and reload</li>}
                    {errorType === 'device_registration_failed' && <li>Refresh the page and try again</li>}
                    {['media_connection_failed', 'ice_connection_failed'].includes(errorType || '') && <li>Check your network and firewall, then retry</li>}
                    {errorType === 'signaling_connection_error' && <li>Connection will retry automatically; wait or refresh</li>}
                    {!['microphone_access_denied', 'device_registration_failed', 'signaling_connection_error', 'media_connection_failed', 'ice_connection_failed'].includes(errorType || '') && <li>Try again or end the call and retry later</li>}
                  </ul>
                </div>
                {errorDetails && Object.keys(errorDetails).length > 0 && (
                  <details className="text-left mb-4">
                    <summary className="text-white/60 text-sm cursor-pointer hover:text-white/80 transition-colors">
                      {t('call_screen.view_details')}
                    </summary>
                    <div className="mt-2 p-3 bg-black/30 rounded-lg text-xs text-white/50 font-mono">
                      {errorDetails.errorCode && <p>{t('call_screen.error_code')}: {errorDetails.errorCode}</p>}
                      {errorDetails.timestamp && <p>{t('call_screen.error_timestamp')}: {new Date(errorDetails.timestamp).toLocaleString()}</p>}
                      {errorDetails.originalError && <p className="mt-2">{errorDetails.originalError}</p>}
                    </div>
                  </details>
                )}
                <div className="flex flex-col gap-3">
                  {showRetryButton && (
                    <button data-tour="components-conversations-callscreenmodal.button.call_screen.retrying"
                      onClick={handleRetryCall}
                      disabled={isRetrying}
                      className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 disabled:cursor-not-allowed rounded-full text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      {isRetrying ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          {t('call_screen.retrying')}...
                        </>
                      ) : (
                        <>
                          <Phone className="w-4 h-4" />
                          {t('call_screen.retry_call')}
                        </>
                      )}
                    </button>
                  )}
                  {errorType === 'ai_unavailable' && (
                    <button data-tour="components-conversations-callscreenmodal.button.call_screen.switch_to_direct"
                      onClick={handleSwitchToDirect}
                      className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 rounded-full text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <PhoneIncoming className="w-4 h-4" />
                      {t('call_screen.switch_to_direct')}
                    </button>
                  )}
                  <button
                    onClick={handleHangUp}
                    className="px-6 py-2.5 bg-red-500/30 hover:bg-red-500/50 rounded-full text-red-200 text-sm font-medium transition-colors"
                  >
                    End Call
                  </button>
                  <button data-tour="components-conversations-callscreenmodal.button.call_screen.close"
                    onClick={onClose}
                    className="px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white text-sm font-medium transition-colors"
                  >
                    {t('call_screen.close')}
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {callStatus === 'completed' && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm z-20">
              <div className="text-center p-8 rounded-2xl bg-green-950/50 border border-green-500/20 backdrop-blur-md">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Phone className="w-8 h-8 text-green-400" />
                </div>
                <p className="text-white text-xl font-semibold mb-2">Call Ended</p>
                <p className="text-white/60 text-sm mb-4">Duration: {formatDuration(callDuration)}</p>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white text-sm font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
          
          {/* Microphone permission error overlay */}
          {micPermissionError && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm z-20">
              <div className="text-center p-8 rounded-2xl bg-orange-950/50 border border-orange-500/20 backdrop-blur-md max-w-md mx-4">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-500/20 flex items-center justify-center">
                  <MicOff className="w-8 h-8 text-orange-400" />
                </div>
                <p className="text-white text-xl font-semibold mb-2">Microphone Access Required</p>
                <p className="text-white/60 text-sm mb-4">{micPermissionError}</p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => {
                      setMicPermissionError(null);
                      initializeTwilioDevice();
                    }}
                    className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 rounded-full text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <Mic className="w-4 h-4" />
                    Try Again
                  </button>
                  <button
                    onClick={onClose}
                    className="px-6 py-2.5 bg-white/10 hover:bg-white/20 rounded-full text-white text-sm font-medium transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
          
        </div>
      </DialogContent>
    </Dialog>
  );
};
