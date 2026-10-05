import { z } from 'zod';

export const FACTUS_SECRET_MASK = '••••••••';
export const FACTUS_PAYMENT_FORMS = ['1', '2'] as const;

export const colombiaCustomerFiscalProfileSchema = z.object({
  identificationDocumentCode: z.string().trim().min(1),
  identification: z.string().trim().min(1),
  dv: z.string().trim().optional(),
  legalOrganizationCode: z.enum(['1', '2']),
  legalName: z.string().trim().min(1),
  tradeName: z.string().trim().optional(),
  tributeCode: z.string().trim().default('ZZ'),
  responsibilities: z.array(z.string().trim().min(1)).default(['R-99-PN']),
  address: z.string().trim().optional(),
  countryCode: z.string().trim().length(2).default('CO'),
  municipalityCode: z.string().trim().optional(),
});

export const colombiaProductFiscalProfileSchema = z.object({
  codeReference: z.string().trim().optional(),
  unitMeasureCode: z.string().trim().min(1),
  standardCode: z.string().trim().min(1),
  taxCode: z.string().trim().min(1),
  isExcluded: z.boolean().default(false),
});

export type ColombiaCustomerFiscalProfile = z.infer<typeof colombiaCustomerFiscalProfileSchema>;
export type ColombiaProductFiscalProfile = z.infer<typeof colombiaProductFiscalProfileSchema>;

export const factusSettingsInputSchema = z.object({
  enabled: z.boolean(),
  country: z.literal('CO').default('CO'),
  provider: z.literal('factus').default('factus'),
  environment: z.enum(['sandbox', 'production']).default('sandbox'),
  username: z.union([z.string().trim().email(), z.literal('')]),
  password: z.string(),
  clientId: z.string().trim(),
  clientSecret: z.string(),
  numberingRangeId: z.number().int().positive().nullable(),
  defaults: z.object({
    unitMeasureCode: z.string().trim().min(1).default('94'),
    standardCode: z.string().trim().min(1).default('999'),
    taxCode: z.string().trim().min(1).default('01'),
    paymentForm: z.enum(FACTUS_PAYMENT_FORMS).default('1'),
    paymentMethodCode: z.string().trim().min(1).default('10'),
    sendEmail: z.literal(false).default(false),
  }),
}).superRefine((value, ctx) => {
  if (!value.enabled) return;
  for (const key of ['username', 'password', 'clientId', 'clientSecret'] as const) {
    if (!value[key]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Required when Factus is enabled' });
  }
  if (!value.numberingRangeId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['numberingRangeId'], message: 'Select an active numbering range' });
});

export type FactusSettingsInput = z.infer<typeof factusSettingsInputSchema>;

export const FACTUS_DEFAULT_SETTINGS: FactusSettingsInput = {
  enabled: false,
  country: 'CO',
  provider: 'factus',
  environment: 'sandbox',
  username: '',
  password: '',
  clientId: '',
  clientSecret: '',
  numberingRangeId: null,
  defaults: {
    unitMeasureCode: '94',
    standardCode: '999',
    taxCode: '01',
    paymentForm: '1',
    paymentMethodCode: '10',
    sendEmail: false,
  },
};

export const FACTUS_PAYMENT_METHODS = [
  ['10', 'Cash'],
  ['20', 'Check'],
  ['42', 'Deposit'],
  ['47', 'Transfer'],
  ['48', 'Credit card'],
  ['49', 'Debit card'],
  ['71', 'Bonds'],
  ['72', 'Vouchers'],
  ['1', 'Undefined'],
  ['ZZZ', 'Other'],
] as const;
