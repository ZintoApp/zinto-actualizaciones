import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { emitTourSignal } from '@/components/guided-tours/signals';
import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Clock,
  Zap,
  Settings2,
  Info,
  RotateCcw,
  Save,
  Eye,
} from "lucide-react";

interface TypingConfig {
  enabled: boolean;
  wordsPerMinute: number;
  minDelay: number;
  maxDelay: number;
  randomnessFactor: number;
  recordingMinDelay: number;
  recordingMaxDelay: number;
}

interface MessageSplittingConfig {
  enabled: boolean;
  maxLength: number;
  splitMethod: 'sentences' | 'paragraphs' | 'characters' | 'logical';
  delayBetweenMessages: number;
  randomDelayFactor: number;
  preserveFormatting: boolean;
  minChunkSize: number;
  smartBoundaries: boolean;
  prioritizeSentences: boolean;
  logicalSplitting: {
    enabled: boolean;
    delimiter: string;
    fallbackToCharacters: boolean;
  };
}

interface MessageDebouncingConfig {
  enabled: boolean;
  debounceDelay: number;
  maxDebounceDelay: number;
}

interface WhatsAppBehaviorConfig {
  typing: TypingConfig;
  messageSplitting: MessageSplittingConfig;
  messageDebouncing: MessageDebouncingConfig;
}

interface TypingConfigUI {
  enabled: boolean;
  wordsPerMinute: number;
  minDelay: number;
  maxDelay: number;
  randomnessFactor: number;
  recordingMinDelay: number;
  recordingMaxDelay: number;
}

interface MessageSplittingConfigUI {
  enabled: boolean;
  maxLength: number;
  splitMethod: 'sentences' | 'paragraphs' | 'characters' | 'logical';
  delayBetweenMessages: number;
  randomDelayFactor: number;
  preserveFormatting: boolean;
  minChunkSize: number;
  smartBoundaries: boolean;
  prioritizeSentences: boolean;
  logicalSplitting: {
    enabled: boolean;
    delimiter: string;
    fallbackToCharacters: boolean;
  };
}

interface MessageDebouncingConfigUI {
  enabled: boolean;
  debounceDelay: number;
  maxDebounceDelay: number;
}

interface WhatsAppBehaviorConfigUI {
  typing: TypingConfigUI;
  messageSplitting: MessageSplittingConfigUI;
  messageDebouncing: MessageDebouncingConfigUI;
}

const msToSeconds = (ms: number): number => {
  if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return 0;
  return Math.round(ms / 1000 * 10) / 10;
};

const secondsToMs = (seconds: number): number => {
  if (typeof seconds !== 'number' || isNaN(seconds) || seconds < 0) return 0;
  return Math.round(seconds * 1000);
};

const convertConfigToUI = (config: WhatsAppBehaviorConfig): WhatsAppBehaviorConfigUI => ({
  typing: {
    ...config.typing,
    minDelay: msToSeconds(config.typing.minDelay),
    maxDelay: msToSeconds(config.typing.maxDelay),
    recordingMinDelay: msToSeconds(config.typing.recordingMinDelay),
    recordingMaxDelay: msToSeconds(config.typing.recordingMaxDelay),
  },
  messageSplitting: {
    ...config.messageSplitting,
    delayBetweenMessages: msToSeconds(config.messageSplitting.delayBetweenMessages),
  },
  messageDebouncing: {
    ...config.messageDebouncing,
    debounceDelay: msToSeconds(config.messageDebouncing.debounceDelay),
    maxDebounceDelay: msToSeconds(config.messageDebouncing.maxDebounceDelay),
  }
});

const convertConfigToBackend = (config: WhatsAppBehaviorConfigUI): WhatsAppBehaviorConfig => ({
  typing: {
    ...config.typing,
    minDelay: secondsToMs(config.typing.minDelay),
    maxDelay: secondsToMs(config.typing.maxDelay),
    recordingMinDelay: secondsToMs(config.typing.recordingMinDelay),
    recordingMaxDelay: secondsToMs(config.typing.recordingMaxDelay),
  },
  messageSplitting: {
    ...config.messageSplitting,
    delayBetweenMessages: secondsToMs(config.messageSplitting.delayBetweenMessages),
  },
  messageDebouncing: {
    ...config.messageDebouncing,
    debounceDelay: secondsToMs(config.messageDebouncing.debounceDelay),
    maxDebounceDelay: secondsToMs(config.messageDebouncing.maxDebounceDelay),
  }
});

export function WhatsAppBehaviorSettings() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [config, setConfig] = useState<WhatsAppBehaviorConfigUI>({
    typing: {
      enabled: true,
      wordsPerMinute: 50,
      minDelay: 1,
      maxDelay: 5,
      randomnessFactor: 0.6,
      recordingMinDelay: 2,
      recordingMaxDelay: 4,
    },
    messageDebouncing: {
      enabled: true,
      debounceDelay: 5,
      maxDebounceDelay: 30,
    },
    messageSplitting: {
      enabled: false,
      maxLength: 300,
      splitMethod: 'sentences',
      delayBetweenMessages: 2,
      randomDelayFactor: 0.5,
      preserveFormatting: true,
      minChunkSize: 20,
      smartBoundaries: true,
      prioritizeSentences: true,
      logicalSplitting: {
        enabled: true,
        delimiter: '||',
        fallbackToCharacters: true,
      },
    }
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewText, setPreviewText] = useState("Hello! This is a sample message to demonstrate how the typing indicators and message splitting will work.||You can see how long messages will be broken down into smaller, more natural chunks.||This is especially useful for Mandarin conversations where logical splitting works better than character-based splitting.");

  useEffect(() => {
    loadConfiguration();
  }, []);

  const loadConfiguration = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/whatsapp/behavior-config', {
        credentials: 'include'
      });

      if (response.ok) {
        const data: WhatsAppBehaviorConfig = await response.json();
        setConfig(convertConfigToUI(data));
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfiguration = async () => {
    if (config.messageDebouncing.maxDebounceDelay < config.messageDebouncing.debounceDelay) {
      toast({
        title: t('auth.error', 'Error'),
        description: t(
          'settings.whatsapp.max_debounce_less_than_debounce',
          'Maximum debounce delay must be greater than or equal to the debounce delay.'
        ),
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const backendConfig = convertConfigToBackend(config);

      const response = await fetch('/api/whatsapp/behavior-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(backendConfig),
      });

      if (response.ok) {
        emitTourSignal('settings-saved');
        toast({
          title: t('settings.whatsapp.settings_saved', 'Settings Saved'),
          description: t('settings.whatsapp.settings_saved_desc', 'WhatsApp behavior settings have been updated successfully.'),
        });
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      toast({
        title: t('auth.error', 'Error'),
        description: t('settings.whatsapp.save_failed', 'Failed to save WhatsApp behavior settings. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const resetToDefaults = () => {
    setConfig({
      typing: {
        enabled: true,
        wordsPerMinute: 50,
        minDelay: 1,
        maxDelay: 5,
        randomnessFactor: 0.6,
        recordingMinDelay: 2,
        recordingMaxDelay: 4,
      },
      messageDebouncing: {
        enabled: true,
        debounceDelay: 5,
        maxDebounceDelay: 30,
      },
      messageSplitting: {
        enabled: false,
        maxLength: 300,
        splitMethod: 'sentences',
        delayBetweenMessages: 2,
        randomDelayFactor: 0.5,
        preserveFormatting: true,
        minChunkSize: 0,
        smartBoundaries: false,
        prioritizeSentences: false,
        logicalSplitting: {
          enabled: true,
          delimiter: '||',
          fallbackToCharacters: true,
        },
      }
    });
  };

  const calculateTypingTime = (text: string) => {
    if (!config.typing.enabled) return 0;
    const words = text.split(' ').length;
    const baseDelay = (words / config.typing.wordsPerMinute) * 60 * 1000;
    const randomFactor = 0.7 + Math.random() * config.typing.randomnessFactor;
    const minDelayMs = secondsToMs(config.typing.minDelay);
    const maxDelayMs = secondsToMs(config.typing.maxDelay);
    return Math.min(Math.max(baseDelay * randomFactor, minDelayMs), maxDelayMs);
  };

  const splitPreviewMessage = (text: string) => {
    if (!config.messageSplitting.enabled) {
      return [text];
    }


    if (config.messageSplitting.logicalSplitting.enabled) {
      const delimiter = config.messageSplitting.logicalSplitting.delimiter;
      if (delimiter && text.includes(delimiter)) {
        const logicalChunks = text
          .split(delimiter)
          .map(chunk => chunk.trim())
          .filter(chunk => chunk.length > 0);

        if (logicalChunks.length > 1) {
          return logicalChunks;
        }
      }


      if (!config.messageSplitting.logicalSplitting.fallbackToCharacters) {
        return [text];
      }
    }


    if (text.length <= config.messageSplitting.maxLength) {
      return [text];
    }

    const chunks: string[] = [];
    let remainingText = text.trim();

    while (remainingText.length > 0) {
      if (remainingText.length <= config.messageSplitting.maxLength) {
        chunks.push(remainingText);
        break;
      }

      const chunk = findOptimalSplitPreview(remainingText, config.messageSplitting.maxLength);
      chunks.push(chunk);
      remainingText = remainingText.substring(chunk.length).trim();
    }

    return chunks.filter(chunk => chunk.trim().length > 0);
  };

  const findOptimalSplitPreview = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
      return text;
    }

    const sentenceMatches = Array.from(text.matchAll(/[.!?]+\s+/g));
    for (const match of sentenceMatches) {
      const position = match.index! + match[0].length;
      if (position <= maxLength && position >= 20) {
        return text.substring(0, position).trim();
      }
    }

    const clauseMatches = Array.from(text.matchAll(/[;:,]\s+/g));
    for (const match of clauseMatches) {
      const position = match.index! + match[0].length;
      if (position <= maxLength && position >= 30) {
        return text.substring(0, position).trim();
      }
    }

    const words = text.split(/\s+/);
    let chunk = '';
    for (const word of words) {
      const testChunk = chunk + (chunk ? ' ' : '') + word;
      if (testChunk.length <= maxLength) {
        chunk = testChunk;
      } else {
        break;
      } 
    }

    return chunk || text.substring(0, maxLength);
  };

  const previewChunks = splitPreviewMessage(previewText);

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <InboxConversationIcon className="h-5 w-5" />
              {t('settings.whatsapp.typing_indicators', 'Typing Indicators')}
            </CardTitle>
            <CardDescription>
              {t('settings.whatsapp.typing_indicators_desc', 'Configure human-like typing indicators that appear before sending messages')}
            </CardDescription>
          </div>
          <Switch
            aria-label={t('settings.whatsapp.enable_typing', 'Enable Typing Indicators')}
            checked={config.typing.enabled}
            onCheckedChange={(checked) =>
              setConfig(prev => ({ ...prev, typing: { ...prev.typing, enabled: checked } }))
            }
          />
        </CardHeader>
        <CardContent>
          {config.typing.enabled && (
            <>
              <div className="grid grid-cols-1 overflow-hidden rounded-t-lg border border-border md:grid-cols-2 md:divide-x md:divide-border">
                <div className="space-y-2 p-4">
                  <Label htmlFor="wordsPerMinute">{t('settings.whatsapp.typing_speed', 'Typing Speed (WPM)')}</Label>
                  <div className="px-3">
                    <Slider
                      id="wordsPerMinute"
                      min={20}
                      max={100}
                      step={5}
                      value={[config.typing.wordsPerMinute]}
                      onValueChange={([value]) => 
                        setConfig(prev => ({ ...prev, typing: { ...prev.typing, wordsPerMinute: value } }))
                      }
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>20 WPM</span>
                      <span className="font-medium">{config.typing.wordsPerMinute} WPM</span>
                      <span>100 WPM</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border p-4 md:border-t-0">
                  <Label htmlFor="randomnessFactor">{t('settings.whatsapp.randomness_factor', 'Randomness Factor')}</Label>
                  <div className="px-3">
                    <Slider
                      id="randomnessFactor"
                      min={0}
                      max={1}
                      step={0.1}
                      value={[config.typing.randomnessFactor]}
                      onValueChange={([value]) => 
                        setConfig(prev => ({ ...prev, typing: { ...prev.typing, randomnessFactor: value } }))
                      }
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{t('settings.whatsapp.consistent', 'Consistent')}</span>
                      <span className="font-medium">{(config.typing.randomnessFactor * 100).toFixed(0)}%</span>
                      <span>{t('settings.whatsapp.random', 'Random')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 border-x border-b border-border md:grid-cols-2 md:divide-x md:divide-border">
                <div className="space-y-2 p-4">
                  <Label htmlFor="minDelay">{t('settings.whatsapp.min_delay', 'Minimum Delay (seconds)')}</Label>
                  <Input data-tour="components-settings-whatsappbehaviorsettings.input.minDelay"
                    id="minDelay"
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.1"
                    value={config.typing.minDelay}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const clampedValue = isNaN(value) ? 1 : Math.max(0.5, Math.min(10, value));
                      setConfig(prev => ({ ...prev, typing: { ...prev.typing, minDelay: clampedValue } }));
                    }}
                    placeholder="e.g., 1.0"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.whatsapp.min_delay_desc', 'Minimum time to show typing indicator (0.5-10 seconds)')}
                  </p>
                </div>

                <div className="space-y-2 border-t border-border p-4 md:border-t-0">
                  <Label htmlFor="maxDelay">{t('settings.whatsapp.max_delay', 'Maximum Delay (seconds)')}</Label>
                  <Input data-tour="components-settings-whatsappbehaviorsettings.input.maxDelay"
                    id="maxDelay"
                    type="number"
                    min="1"
                    max="30"
                    step="0.1"
                    value={config.typing.maxDelay}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const clampedValue = isNaN(value) ? 5 : Math.max(1, Math.min(30, value));
                      setConfig(prev => ({ ...prev, typing: { ...prev.typing, maxDelay: clampedValue } }));
                    }}
                    placeholder="e.g., 5.0"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.whatsapp.max_delay_desc', 'Maximum time to show typing indicator (1-30 seconds)')}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 overflow-hidden rounded-b-lg border-x border-b border-border md:grid-cols-2 md:divide-x md:divide-border">
                <div className="space-y-2 p-4">
                  <Label htmlFor="recordingMinDelay">Recording Min Delay (seconds)</Label>
                  <Input data-tour="components-settings-whatsappbehaviorsettings.input.recordingMinDelay"
                    id="recordingMinDelay"
                    type="number"
                    min="1"
                    max="10"
                    step="0.1"
                    value={config.typing.recordingMinDelay}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const clampedValue = isNaN(value) ? 2 : Math.max(1, Math.min(10, value));
                      setConfig(prev => ({ ...prev, typing: { ...prev.typing, recordingMinDelay: clampedValue } }));
                    }}
                    placeholder="e.g., 2.0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum time to show recording indicator (1-10 seconds)
                  </p>
                </div>

                <div className="space-y-2 border-t border-border p-4 md:border-t-0">
                  <Label htmlFor="recordingMaxDelay">Recording Max Delay (seconds)</Label>
                  <Input data-tour="components-settings-whatsappbehaviorsettings.input.recordingMaxDelay"
                    id="recordingMaxDelay"
                    type="number"
                    min="2"
                    max="15"
                    step="0.1"
                    value={config.typing.recordingMaxDelay}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const clampedValue = isNaN(value) ? 4 : Math.max(2, Math.min(15, value));
                      setConfig(prev => ({ ...prev, typing: { ...prev.typing, recordingMaxDelay: clampedValue } }));
                    }}
                    placeholder="e.g., 4.0"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum time to show recording indicator (2-15 seconds)
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Clock className="h-5 w-5" />
              {t('settings.whatsapp.message_debouncing', 'Buffered Replies')}
            </CardTitle>
            <CardDescription>
              {t('settings.whatsapp.message_debouncing_desc', 'Wait for users to finish sending messages before generating a bot reply')}
            </CardDescription>
          </div>
          <Switch
            aria-label={t('settings.whatsapp.enable_debouncing', 'Enable Buffered Replies')}
            checked={config.messageDebouncing.enabled}
            onCheckedChange={(checked) =>
              setConfig(prev => ({ ...prev, messageDebouncing: { ...prev.messageDebouncing, enabled: checked } }))
            }
          />
        </CardHeader>
        <CardContent>
          {config.messageDebouncing.enabled && (
              <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border md:grid-cols-2 md:divide-x md:divide-border">
                <div className="space-y-2 p-4">
                  <Label htmlFor="debounceDelay">{t('settings.whatsapp.debounce_delay', 'Debounce Delay (seconds)')}</Label>
                  <Input data-tour="components-settings-whatsappbehaviorsettings.input.settings.whatsapp.debounce_delay_placeholder"
                    id="debounceDelay"
                    type="number"
                    min="1"
                    max="60"
                    step="0.1"
                    value={config.messageDebouncing.debounceDelay}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const clampedValue = isNaN(value) ? 5 : Math.max(1, Math.min(60, value));
                      setConfig(prev => ({
                        ...prev,
                        messageDebouncing: {
                          ...prev.messageDebouncing,
                          debounceDelay: clampedValue,
                          // Keep the hard cap at least as long as the wait-after-last-message period
                          maxDebounceDelay: Math.max(prev.messageDebouncing.maxDebounceDelay, clampedValue),
                        },
                      }));
                    }}
                    placeholder={t('settings.whatsapp.debounce_delay_placeholder', 'e.g., 5.0')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.whatsapp.debounce_delay_desc', 'How long to wait after the last inbound message before replying')}
                  </p>
                </div>

                <div className="space-y-2 border-t border-border p-4 md:border-t-0">
                  <Label htmlFor="maxDebounceDelay">{t('settings.whatsapp.max_debounce_delay', 'Maximum Debounce Delay (seconds)')}</Label>
                  <Input data-tour="components-settings-whatsappbehaviorsettings.input.settings.whatsapp.max_debounce_delay_placeholder"
                    id="maxDebounceDelay"
                    type="number"
                    min={config.messageDebouncing.debounceDelay}
                    max="120"
                    step="0.1"
                    value={config.messageDebouncing.maxDebounceDelay}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      setConfig(prev => {
                        const minAllowed = prev.messageDebouncing.debounceDelay;
                        const clampedValue = isNaN(value)
                          ? Math.max(minAllowed, 30)
                          : Math.max(minAllowed, Math.min(120, value));
                        return {
                          ...prev,
                          messageDebouncing: {
                            ...prev.messageDebouncing,
                            maxDebounceDelay: clampedValue,
                          },
                        };
                      });
                    }}
                    placeholder={t('settings.whatsapp.max_debounce_delay_placeholder', 'e.g., 30.0')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.whatsapp.max_debounce_delay_desc', 'Maximum time to keep buffering before forcing a reply')}
                  </p>
                </div>
              </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Zap className="h-5 w-5" />
              {t('settings.whatsapp.message_splitting', 'Message Splitting')}
            </CardTitle>
            <CardDescription>
              {t('settings.whatsapp.message_splitting_desc', 'Automatically split long messages into smaller, more natural chunks')}
            </CardDescription>
          </div>
          <Switch
            aria-label={t('settings.whatsapp.enable_splitting', 'Enable Message Splitting')}
            checked={config.messageSplitting.enabled}
            onCheckedChange={(checked) =>
              setConfig(prev => ({ ...prev, messageSplitting: { ...prev.messageSplitting, enabled: checked } }))
            }
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {config.messageSplitting.enabled && (
            <>
              <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border md:grid-cols-2 md:divide-x md:divide-border">
                <div className="space-y-2 p-4">
                  <Label htmlFor="maxLength">{t('settings.whatsapp.max_message_length', 'Maximum Message Length')}</Label>
                  <div className="px-3">
                    <Slider
                      id="maxLength"
                      min={100}
                      max={1000}
                      step={50}
                      value={[config.messageSplitting.maxLength]}
                      onValueChange={([value]) =>
                        setConfig(prev => ({ ...prev, messageSplitting: { ...prev.messageSplitting, maxLength: value } }))
                      }
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>100</span>
                      <span className="font-medium">{config.messageSplitting.maxLength} chars</span>
                      <span>1000</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 border-t border-border p-4 md:border-t-0">
                  <Label htmlFor="splitMethod">{t('settings.whatsapp.split_method', 'Split Method')}</Label>
                  <Select
                    value={config.messageSplitting.splitMethod}
                    onValueChange={(value: 'sentences' | 'paragraphs' | 'characters' | 'logical') =>
                      setConfig(prev => ({
                        ...prev,
                        messageSplitting: {
                          ...prev.messageSplitting,
                          splitMethod: value,

                          logicalSplitting: {
                            ...prev.messageSplitting.logicalSplitting,
                            enabled: value === 'logical' ? true : prev.messageSplitting.logicalSplitting.enabled
                          }
                        }
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="logical">{t('settings.whatsapp.by_logical', 'By Logical Delimiter')}</SelectItem>
                      <SelectItem value="sentences">{t('settings.whatsapp.by_sentences', 'By Sentences')}</SelectItem>
                      <SelectItem value="paragraphs">{t('settings.whatsapp.by_paragraphs', 'By Paragraphs')}</SelectItem>
                      <SelectItem value="characters">{t('settings.whatsapp.by_characters', 'By Characters')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border md:grid-cols-2 md:divide-x md:divide-border">
                <div className="space-y-2 p-4">
                  <Label htmlFor="delayBetweenMessages">{t('settings.whatsapp.delay_between_chunks', 'Delay Between Message Chunks (seconds)')}</Label>
                  <Input data-tour="components-settings-whatsappbehaviorsettings.input.delayBetweenMessages"
                    id="delayBetweenMessages"
                    type="number"
                    min="0.5"
                    max="10"
                    step="0.1"
                    value={config.messageSplitting.delayBetweenMessages}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      const clampedValue = isNaN(value) ? 2 : Math.max(0.5, Math.min(10, value));
                      setConfig(prev => ({ ...prev, messageSplitting: { ...prev.messageSplitting, delayBetweenMessages: clampedValue } }));
                    }}
                    placeholder="e.g., 2.0"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.whatsapp.delay_between_chunks_desc', 'Time between split message chunks (0.5-10 seconds)')}
                  </p>
                </div>

                <div className="space-y-2 border-t border-border p-4 md:border-t-0">
                  <Label htmlFor="randomDelayFactor">Random Delay Factor</Label>
                  <div className="px-3">
                    <Slider
                      id="randomDelayFactor"
                      min={0}
                      max={1}
                      step={0.1}
                      value={[config.messageSplitting.randomDelayFactor]}
                      onValueChange={([value]) =>
                        setConfig(prev => ({ ...prev, messageSplitting: { ...prev.messageSplitting, randomDelayFactor: value } }))
                      }
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>{t('settings.whatsapp.consistent', 'Consistent')}</span>
                      <span className="font-medium">{(config.messageSplitting.randomDelayFactor * 100).toFixed(0)}%</span>
                      <span>{t('settings.whatsapp.random', 'Random')}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 overflow-hidden rounded-lg border border-border md:grid-cols-2 md:divide-x md:divide-border">
                <div className="space-y-2 p-4">
                  <Label htmlFor="minChunkSize">Minimum Chunk Size</Label>
                  <Input data-tour="components-settings-whatsappbehaviorsettings.input.minChunkSize"
                    id="minChunkSize"
                    type="number"
                    min="10"
                    max="100"
                    value={config.messageSplitting.minChunkSize}
                    onChange={(e) =>
                      setConfig(prev => ({ ...prev, messageSplitting: { ...prev.messageSplitting, minChunkSize: parseInt(e.target.value) || 20 } }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum characters per chunk to avoid very short messages
                  </p>
                </div>
              </div>

              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Preserve Formatting</Label>
                    <div className="text-sm text-muted-foreground">
                      Maintain markdown and text formatting when splitting messages
                    </div>
                  </div>
                  <Switch
                    checked={config.messageSplitting.preserveFormatting}
                    onCheckedChange={(checked) =>
                      setConfig(prev => ({ ...prev, messageSplitting: { ...prev.messageSplitting, preserveFormatting: checked } }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Smart Boundary Detection</Label>
                    <div className="text-sm text-muted-foreground">
                      Intelligently split at sentence and clause boundaries
                    </div>
                  </div>
                  <Switch
                    checked={config.messageSplitting.smartBoundaries}
                    onCheckedChange={(checked) =>
                      setConfig(prev => ({ ...prev, messageSplitting: { ...prev.messageSplitting, smartBoundaries: checked } }))
                    }
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Prioritize Sentence Boundaries</Label>
                    <div className="text-sm text-muted-foreground">
                      Prefer splitting at sentence endings over character limits
                    </div>
                  </div>
                  <Switch
                    checked={config.messageSplitting.prioritizeSentences}
                    onCheckedChange={(checked) =>
                      setConfig(prev => ({ ...prev, messageSplitting: { ...prev.messageSplitting, prioritizeSentences: checked } }))
                    }
                  />
                </div>
              </div>

              {/* Show logical splitting options when logical method is selected */}
              {config.messageSplitting.splitMethod === 'logical' && (
                <>
                  <Separator />

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="logicalDelimiter">Custom Delimiter</Label>
                        <Input data-tour="components-settings-whatsappbehaviorsettings.input.logicalDelimiter"
                          id="logicalDelimiter"
                          type="text"
                          value={config.messageSplitting.logicalSplitting.delimiter}
                          onChange={(e) =>
                            setConfig(prev => ({
                              ...prev,
                              messageSplitting: {
                                ...prev.messageSplitting,
                                logicalSplitting: {
                                  ...prev.messageSplitting.logicalSplitting,
                                  delimiter: e.target.value
                                }
                              }
                            }))
                          }
                          placeholder="e.g., ||"
                        />
                        <p className="text-xs text-muted-foreground">
                          Delimiter to split messages (e.g., || for Mandarin conversations)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Fallback to Character Splitting</Label>
                        <div className="text-sm text-muted-foreground">
                          Use character-based splitting when no delimiters are found
                        </div>
                      </div>
                      <Switch
                        checked={config.messageSplitting.logicalSplitting.fallbackToCharacters}
                        onCheckedChange={(checked) =>
                          setConfig(prev => ({
                            ...prev,
                            messageSplitting: {
                              ...prev.messageSplitting,
                              logicalSplitting: {
                                ...prev.messageSplitting.logicalSplitting,
                                fallbackToCharacters: checked
                              }
                            }
                          }))
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Logical Splitting Section */}
              <div className="space-y-4 rounded-lg border border-border p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-base">Logical Message Splitting</Label>
                    <div className="text-sm text-muted-foreground">
                      Split messages using custom delimiters (e.g., || for Mandarin conversations)
                    </div>
                  </div>
                  <Switch
                    checked={config.messageSplitting.logicalSplitting.enabled}
                    onCheckedChange={(checked) =>
                      setConfig(prev => ({
                        ...prev,
                        messageSplitting: {
                          ...prev.messageSplitting,
                          logicalSplitting: {
                            ...prev.messageSplitting.logicalSplitting,
                            enabled: checked
                          }
                        }
                      }))
                    }
                  />
                </div>

                {config.messageSplitting.logicalSplitting.enabled && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="logicalDelimiter">Custom Delimiter</Label>
                        <Input data-tour="components-settings-whatsappbehaviorsettings.input.logicalDelimiter"
                          id="logicalDelimiter"
                          type="text"
                          value={config.messageSplitting.logicalSplitting.delimiter}
                          onChange={(e) =>
                            setConfig(prev => ({
                              ...prev,
                              messageSplitting: {
                                ...prev.messageSplitting,
                                logicalSplitting: {
                                  ...prev.messageSplitting.logicalSplitting,
                                  delimiter: e.target.value
                                }
                              }
                            }))
                          }
                          placeholder="e.g., ||"
                        />
                        <p className="text-xs text-muted-foreground">
                          Delimiter to split messages (e.g., || for Mandarin conversations)
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-base">Fallback to Character Splitting</Label>
                        <div className="text-sm text-muted-foreground">
                          Use character-based splitting when no delimiters are found
                        </div>
                      </div>
                      <Switch
                        checked={config.messageSplitting.logicalSplitting.fallbackToCharacters}
                        onCheckedChange={(checked) =>
                          setConfig(prev => ({
                            ...prev,
                            messageSplitting: {
                              ...prev.messageSplitting,
                              logicalSplitting: {
                                ...prev.messageSplitting.logicalSplitting,
                                fallbackToCharacters: checked
                              }
                            }
                          }))
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Eye className="h-5 w-5" />
            {t('settings.whatsapp.preview', 'Preview')}
          </CardTitle>
          <CardDescription>
            {t('settings.whatsapp.preview_desc', 'See how your settings will affect message delivery')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="previewText">{t('settings.whatsapp.sample_message', 'Sample Message')}</Label>
            <textarea data-tour="components-settings-whatsappbehaviorsettings.textarea.settings.whatsapp.sample_message"
              id="previewText"
              className="min-h-[100px] w-full resize-none rounded-md border border-input bg-background p-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
              placeholder={t('settings.whatsapp.sample_message_placeholder', 'Enter a sample message to see how it will be split and timed...')}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">{t('settings.whatsapp.message_preview', 'Message Preview')}</Label>
              <div className="flex items-center gap-2">
                {config.typing.enabled && (
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {t('settings.whatsapp.typing_time', '~{{time}}s typing', { time: Math.round(calculateTypingTime(previewText) / 1000) })}
                  </Badge>
                )}
                {config.messageSplitting.enabled && previewChunks.length > 1 && (
                  <Badge variant="outline" className="text-xs">
                    {t('settings.whatsapp.messages_count', '{{count}} messages', { count: previewChunks.length })}
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {previewChunks.map((chunk, index) => (
                <div key={index} className="rounded-md border border-primary/20 bg-primary/5 p-3 dark:border-primary/30 dark:bg-primary/10">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-primary">
                      {t('settings.whatsapp.message_number', 'Message {{current}} of {{total}}', { current: index + 1, total: previewChunks.length })}
                    </span>
                    <span className="text-xs text-primary/80">
                      {t('settings.whatsapp.characters_count', '{{count}} characters', { count: chunk.length })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{chunk}</p>
                  {config.typing.enabled && (
                    <div className="mt-2 text-xs text-primary/80">
                      <Clock className="h-3 w-3 inline mr-1" />
                      {t('settings.whatsapp.typing_delay', 'Typing delay: ~{{time}}s', { time: Math.round(calculateTypingTime(chunk) / 1000) })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button data-tour="components-settings-whatsappbehaviorsettings.button.settings.whatsapp.reset_defaults"
          variant="outline"
          onClick={resetToDefaults}
          disabled={isLoading || isSaving}
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          {t('settings.whatsapp.reset_defaults', 'Reset to Defaults')}
        </Button>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button data-tour="components-settings-whatsappbehaviorsettings.button.settings.whatsapp.reload_config"
            variant="outline"
            onClick={loadConfiguration}
            disabled={isLoading || isSaving}
          >
            {isLoading ? (
              <Settings2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Settings2 className="h-4 w-4 mr-2" />
            )}
            {t('settings.whatsapp.reload_config', 'Reload Config')}
          </Button>

          <Button data-tour="components-settings-whatsappbehaviorsettings.button.settings.whatsapp.save_settings"
            onClick={saveConfiguration}
            disabled={isLoading || isSaving}
          >
            {isSaving ? (
              <Settings2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {t('settings.whatsapp.save_settings', 'Save Settings')}
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          These settings apply to all WhatsApp channels and take effect immediately after saving.
          Typing indicators make bot responses feel more human-like, while message splitting
          improves readability for long responses.
        </AlertDescription>
      </Alert>
    </div>
  );
}
