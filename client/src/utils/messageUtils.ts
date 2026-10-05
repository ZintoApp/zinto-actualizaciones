/**
 * Utility functions for message handling and display
 */

/**
 * Strips agent signature from message content for display purposes.
 * Agent signatures have the format: > *[Agent Name]*\n\n[message content]
 *
 * @param content - The original message content
 * @returns The message content without the agent signature
 */
export const stripAgentSignature = (content: string): string => {
  if (!content) return content;

  const signaturePattern = /^> \*[^*]+\*\n\n/;

  return content.replace(signaturePattern, '');
};

/**
 * Checks if a message content contains an agent signature
 *
 * @param content - The message content to check
 * @returns True if the content contains an agent signature
 */
export const hasAgentSignature = (content: string): boolean => {
  if (!content) return false;

  const signaturePattern = /^> \*[^*]+\*\n\n/;
  return signaturePattern.test(content);
};

/**
 * Extracts the agent name from a message with agent signature
 *
 * @param content - The message content with agent signature
 * @returns The agent name or null if no signature found
 */
export const extractAgentName = (content: string): string | null => {
  if (!content) return null;

  const signaturePattern = /^> \*([^*]+)\*\n\n/;
  const match = content.match(signaturePattern);

  return match ? match[1] : null;
};
