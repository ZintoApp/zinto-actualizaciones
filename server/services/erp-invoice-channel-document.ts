/** Channels where outbound invoice PDF via URL is supported (Flow sendMedia / sendDirectMessage paths). */
export function channelSupportsInvoicePdfAttachment(channelType: string): boolean {
  return (
    channelType === 'whatsapp' ||
    channelType === 'whatsapp_unofficial' ||
    channelType === 'whatsapp_official' ||
    channelType === 'telegram' ||
    channelType === 'email' ||
    channelType === 'messenger' ||
    channelType === 'webchat'
  );
}
