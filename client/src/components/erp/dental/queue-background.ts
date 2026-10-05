import { DEFAULT_QUEUE_BACKGROUND_IMAGE } from '@shared/types/dental-queue';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { defaultQueueBackgroundDataUrl } from './default-queue-background';

export function resolveQueueBackgroundUrl(value: string): string {
  return value === DEFAULT_QUEUE_BACKGROUND_IMAGE ? defaultQueueBackgroundDataUrl : resolveMediaUrl(value);
}
