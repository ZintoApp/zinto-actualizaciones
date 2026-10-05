import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

export interface CompanyContactCustomField {
  id: number;
  fieldName: string;
  fieldLabel: string;
  fieldType: 'text' | 'number' | 'select' | 'multi_select' | 'date' | 'boolean' | 'file_select';
  options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } | null;
  required?: boolean;
  displayOrder: number;
}

export function useCompanyContactCustomFields(options?: { enabled?: boolean }) {
  return useQuery<CompanyContactCustomField[]>({
    queryKey: ['/api/company/custom-fields', 'contact'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company/custom-fields?entity=contact');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: options?.enabled,
  });
}
