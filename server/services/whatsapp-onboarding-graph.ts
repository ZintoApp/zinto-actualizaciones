import axios from 'axios';
import { WHATSAPP_ONBOARDING_API_VERSION } from '../../shared/whatsapp-onboarding';

export class WhatsAppOnboardingError extends Error {
  constructor(message: string, public status = 400, public messageCode: string = 'SETUP_UNKNOWN_ERROR', public messageParams?: Record<string, string | number>) { super(message); }
}
export async function whatsappGraph(path: string, token: string, method: 'GET' | 'POST' = 'GET', data?: unknown): Promise<any> {
  try {
    const response = await axios.request({
      url: `https://graph.facebook.com/${WHATSAPP_ONBOARDING_API_VERSION}/${path}`,
      method, headers: { Authorization: `Bearer ${token}` },
      ...(method === 'GET' ? { params: data } : { data }), timeout: 20_000,
    });
    return response.data;
  } catch (error: any) {
    // Axios errors contain Authorization headers. Never return or log the raw error.
    const code = error.response?.data?.error?.code;
    throw new WhatsAppOnboardingError(`Meta request failed${code ? ` (code ${code})` : ''}. ${error.response ? 'Check account permissions and configuration, then retry.' : 'The outcome is unknown because Meta did not respond. Check connection status before retrying.'}`, 502, 'SETUP_UNKNOWN_ERROR');
  }
}
export async function discoverWhatsAppPhones(wabaId: string, token: string): Promise<any[]> {
  const phones: any[] = [];
  let after: string | undefined;
  do {
    const page = await whatsappGraph(`${encodeURIComponent(wabaId)}/phone_numbers`, token, 'GET', {
      fields: 'id,display_phone_number,verified_name,is_on_biz_app,platform_type', limit: 100, ...(after ? { after } : {}),
    });
    phones.push(...(page.data || []));
    after = page.paging?.next ? page.paging?.cursors?.after : undefined;
  } while (after);
  return phones;
}
