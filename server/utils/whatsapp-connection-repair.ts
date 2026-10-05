export interface WhatsAppConnectionRepairInput {
  wabaId: string;
  businessId?: string;
  accessToken?: string;
}

export function buildRepairedWhatsAppConnectionData(
  existingData: Record<string, any>,
  repair: WhatsAppConnectionRepairInput,
): Record<string, any> {
  return {
    ...existingData,
    wabaId: repair.wabaId,
    businessAccountId: repair.wabaId,
    waba_id: repair.wabaId,
    ...(repair.businessId ? { businessId: repair.businessId } : {}),
    ...(repair.accessToken ? { accessToken: repair.accessToken } : {}),
    partnerManaged: true,
  };
}

export function getEmbeddedSignupPhoneNumberIds(signupData: any): string[] {
  const ids = [
    signupData?.phoneNumberId,
    signupData?.phone_number_id,
    signupData?.data?.phone_number_id,
    ...(Array.isArray(signupData?.phone_numbers)
      ? signupData.phone_numbers.map((phone: any) => phone?.phone_number_id || phone?.phoneNumberId)
      : []),
  ];

  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}
