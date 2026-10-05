import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface CompanyDealCustomField {
  id: number;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } | null;
  required?: boolean;
  displayOrder: number;
}

export function useCompanyDealCustomFields() {
  return useQuery<CompanyDealCustomField[]>({
    queryKey: ['/api/company/custom-fields', 'deal'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=deal');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });
}
