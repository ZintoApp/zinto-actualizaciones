import { assertAppSumoAccess } from './appsumo-policy';
import OpenAI from 'openai';
import * as fs from 'fs/promises';
import * as path from 'path';
import { storage } from '../storage';
import { aiCredentialsService } from './ai-credentials-service';
import serverI18n from '../utils/server-i18n';

/**
 * Transcribe audio file to text using OpenAI Whisper
 */
async function transcribeWithWhisper(
  apiKey: string,
  audioPath: string,
  whisperLanguage?: string
): Promise<string> {
  const client = new OpenAI({ apiKey });

  const audioFile = await fs.readFile(audioPath);
  const audioBuffer = Buffer.from(audioFile);

  const fileExtension = path.extname(audioPath).toLowerCase();
  let tempFileName = `temp_audio_${Date.now()}`;

  if (fileExtension === '.ogg' || fileExtension === '.oga') {
    tempFileName += '.ogg';
  } else if (fileExtension === '.mp3') {
    tempFileName += '.mp3';
  } else if (fileExtension === '.wav') {
    tempFileName += '.wav';
  } else if (fileExtension === '.m4a') {
    tempFileName += '.m4a';
  } else {
    tempFileName += '.mp3';
  }

  const tempPath = path.join(process.cwd(), 'temp', tempFileName);

  await fs.mkdir(path.dirname(tempPath), { recursive: true });
  await fs.writeFile(tempPath, audioBuffer);

  try {
    const fs_node = await import('fs');

    let transcription = '';
    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await client.audio.transcriptions.create({
          file: await OpenAI.toFile(fs_node.createReadStream(tempPath), path.basename(tempPath)),
          model: 'whisper-1',
          response_format: 'text',
          ...(whisperLanguage && whisperLanguage !== 'auto' ? { language: whisperLanguage } : {})
        });

        transcription = result;
        break;
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw lastError;
        }

        const waitTime = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    await fs.unlink(tempPath).catch(() => {});

    return transcription;
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

/**
 * Resolve media URL to local file path
 */
function resolveMediaPath(mediaUrl: string): string {
  let audioPath = mediaUrl;

  if (audioPath.startsWith('/media/')) {
    return path.join(process.cwd(), 'public', audioPath.slice(1));
  }
  if (audioPath.startsWith('media/')) {
    return path.join(process.cwd(), 'public', audioPath);
  }
  if (path.isAbsolute(audioPath)) {
    return audioPath;
  }
  return path.join(process.cwd(), audioPath);
}

export interface TranscriptionResult {
  transcription: string;
  provider: string;
  credentialId?: number;
}

export interface TranscriptionSettings {
  enabled: boolean;
  provider: string;
  credentialSource: 'auto' | 'company' | 'system' | 'manual';
  credentialId?: number | null;
  manualApiKey?: string;
}

/**
 * Get transcription settings for a company
 */
export async function getTranscriptionSettings(companyId: number): Promise<TranscriptionSettings> {
  await assertAppSumoAccess(companyId);
  const enabledSetting = await storage.getCompanySetting(companyId, 'inbox_audio_transcription_enabled');
  const providerSetting = await storage.getCompanySetting(companyId, 'inbox_audio_transcription_provider');
  const credentialSourceSetting = await storage.getCompanySetting(companyId, 'inbox_audio_transcription_credential_source');
  const credentialIdSetting = await storage.getCompanySetting(companyId, 'inbox_audio_transcription_credential_id');
  const manualKeySetting = await storage.getCompanySetting(companyId, 'inbox_audio_transcription_manual_api_key');

  return {
    enabled: enabledSetting?.value === true,
    provider: (providerSetting?.value as string) || 'openai',
    credentialSource: (credentialSourceSetting?.value as 'auto' | 'company' | 'system' | 'manual') || 'auto',
    credentialId: credentialIdSetting?.value != null ? Number(credentialIdSetting.value) : null,
    manualApiKey: (manualKeySetting?.value as string) || ''
  };
}

/**
 * Transcribe an audio message
 */
export async function transcribeMessage(
  messageId: number,
  companyId: number
): Promise<TranscriptionResult> {
  const message = await storage.getMessageById(messageId);
  if (!message) {
    throw new Error('Message not found');
  }

  const conversation = await storage.getConversation(message.conversationId);
  if (!conversation || conversation.companyId !== companyId) {
    throw new Error('Message not found');
  }

  if (message.type !== 'audio') {
    throw new Error('Message is not an audio message');
  }

  if (message.direction !== 'inbound') {
    throw new Error('Only inbound audio messages can be transcribed');
  }

  let audioPath: string | null = null;

  const metadata = message.metadata
    ? typeof message.metadata === 'string'
      ? JSON.parse(message.metadata)
      : message.metadata
    : {};

  if (metadata.mediaUrl) {
    audioPath = metadata.mediaUrl;
  } else if (metadata.audioPath) {
    audioPath = metadata.audioPath;
  } else if (message.mediaUrl) {
    audioPath = message.mediaUrl;
  }

  if (!audioPath) {
    throw new Error('No audio file available for transcription');
  }

  const fullAudioPath = resolveMediaPath(audioPath);

  try {
    await fs.access(fullAudioPath);
  } catch {
    throw new Error(`Audio file not found: ${fullAudioPath}`);
  }

  const settings = await getTranscriptionSettings(companyId);
  if (!settings.enabled) {
    throw new Error('Audio transcription is not enabled');
  }

  let apiKey: string;
  let credentialId: number | undefined;

  if (settings.credentialSource === 'manual' && settings.manualApiKey) {
    apiKey = settings.manualApiKey;
  } else {
    const credentialSource = settings.credentialSource === 'manual' ? 'auto' : settings.credentialSource;
    const credentialData = await aiCredentialsService.getCredentialWithPreference(
      companyId,
      settings.provider,
      credentialSource as 'company' | 'system' | 'auto'
    );

    if (!credentialData || !credentialData.apiKey) {
      const errorMessage = await serverI18n.t(
        'ai_assistant.error_no_api_key',
        'en',
        'No API key available for transcription. Please configure credentials in Inbox Settings.',
        {}
      );
      throw new Error(errorMessage);
    }

    apiKey = credentialData.apiKey;
    credentialId = credentialData.credential?.id;
  }

  let transcription: string;
  try {
    transcription = await transcribeWithWhisper(apiKey, fullAudioPath);
  } catch (error) {
    console.error('Transcription service: Error transcribing audio:', error);
    const errorMessage = await serverI18n.t(
      'ai_assistant.error_transcription_failed',
      'en',
      `Audio transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { error: error instanceof Error ? error.message : 'Unknown error' }
    );
    throw new Error(errorMessage);
  }

  const updatedMetadata = {
    ...metadata,
    transcription,
    transcriptionProvider: settings.provider,
    transcriptionCredentialId: credentialId ?? null,
    transcriptionAt: new Date().toISOString()
  };

  await storage.updateMessage(messageId, {
    metadata: JSON.stringify(updatedMetadata)
  });

  return {
    transcription,
    provider: settings.provider,
    credentialId
  };
}

/**
 * Summarize text using the same credentials as inbox transcription (OpenAI)
 */
export async function summarizeTranscription(companyId: number, text: string): Promise<string> {
  if (!text || !text.trim()) {
    throw new Error('No text to summarize');
  }

  const settings = await getTranscriptionSettings(companyId);
  let apiKey: string;

  if (settings.credentialSource === 'manual' && settings.manualApiKey) {
    apiKey = settings.manualApiKey;
  } else {
    const credentialSource = settings.credentialSource === 'manual' ? 'auto' : settings.credentialSource;
    const credentialData = await aiCredentialsService.getCredentialWithPreference(
      companyId,
      'openai',
      credentialSource as 'company' | 'system' | 'auto'
    );

    if (!credentialData || !credentialData.apiKey) {
      throw new Error('No API key available for summarization. Please configure OpenAI credentials in Inbox Settings.');
    }

    apiKey = credentialData.apiKey;
  }

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant. Summarize the following text in 1-3 concise sentences. Respond with only the summary, no preamble.'
      },
      {
        role: 'user',
        content: text.slice(0, 12000)
      }
    ],
    max_tokens: 300,
    temperature: 0.3
  });

  const summary = response.choices[0]?.message?.content?.trim() || '';
  if (!summary) {
    throw new Error('Summarization returned no result');
  }

  return summary;
}
