import { storage } from '../../../storage';
import {
  FACTUS_DEFAULT_SETTINGS,
  FACTUS_SECRET_MASK,
  factusSettingsInputSchema,
  type FactusSettingsInput,
} from '../../../../shared/factus';
import { decryptFactusSecret, encryptFactusSecret, resolveFactusSecrets } from './factus-secrets';
export { resolveFactusSecrets as resolveFactusSecretsForTest } from './factus-secrets';

export const FACTUS_SETTINGS_KEY = 'electronic_invoicing.factus.v2';

type StoredFactusSettings = Omit<FactusSettingsInput, 'password' | 'clientSecret'> & {
  passwordEncrypted: string;
  clientSecretEncrypted: string;
  verifiedAt?: string | null;
};

async function stored(companyId: number): Promise<StoredFactusSettings | undefined> {
  const setting = await storage.getCompanySetting(companyId, FACTUS_SETTINGS_KEY);
  const value = setting?.value as StoredFactusSettings | undefined;
  return value?.provider === 'factus' ? value : undefined;
}

export async function getFactusRuntimeSettings(companyId: number): Promise<FactusSettingsInput | undefined> {
  const value = await stored(companyId);
  if (!value) return undefined;
  return { ...value, password: decryptFactusSecret(value.passwordEncrypted), clientSecret: decryptFactusSecret(value.clientSecretEncrypted) };
}

export async function getFactusSettingsForApi(companyId: number) {
  const value = await stored(companyId);
  if (!value) return { ...FACTUS_DEFAULT_SETTINGS, configured: false, verifiedAt: null };
  const { passwordEncrypted: _password, clientSecretEncrypted: _secret, ...safe } = value;
  return { ...safe, password: FACTUS_SECRET_MASK, clientSecret: FACTUS_SECRET_MASK, configured: true, verifiedAt: value.verifiedAt ?? null };
}

export async function saveFactusSettings(companyId: number, incoming: unknown, verifiedAt?: string | null) {
  const previous = await stored(companyId);
  const candidate = factusSettingsInputSchema.parse(incoming);
  const password = candidate.password === FACTUS_SECRET_MASK ? previous?.passwordEncrypted && decryptFactusSecret(previous.passwordEncrypted) : candidate.password;
  const clientSecret = candidate.clientSecret === FACTUS_SECRET_MASK ? previous?.clientSecretEncrypted && decryptFactusSecret(previous.clientSecretEncrypted) : candidate.clientSecret;
  if (candidate.enabled && (!password || !clientSecret || !candidate.numberingRangeId)) {
    throw new Error('Factus credentials and an active numbering range are required before enabling');
  }
  const value: StoredFactusSettings = {
    ...candidate,
    passwordEncrypted: encryptFactusSecret(password || ''),
    clientSecretEncrypted: encryptFactusSecret(clientSecret || ''),
    verifiedAt: verifiedAt ?? previous?.verifiedAt ?? null,
  };
  delete (value as any).password;
  delete (value as any).clientSecret;
  await storage.saveCompanySetting(companyId, FACTUS_SETTINGS_KEY, value);
  return getFactusSettingsForApi(companyId);
}
