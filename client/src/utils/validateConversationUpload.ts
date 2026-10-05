import { mediaTypeForMime, uploadSizeError } from '@shared/conversation-media';

export async function validateConversationUpload(conversationId: number, file: File) {
  const response = await fetch(`/api/conversations/${conversationId}/capabilities`, { credentials: 'include' });
  if (!response.ok) throw new Error('Unable to check the upload limit. Please try again.');
  const data = await response.json();
  if (!data.uploadLimits) throw new Error(data.uploadLimitsError || 'Upload limits are unavailable.');
  const error = uploadSizeError(data.uploadLimits, mediaTypeForMime(file.type), file.size);
  if (error) throw new Error(error.message);
}
