import { useQuery } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/queryClient';

export type VariantOption = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  status: string | null;
  attributes?: Record<string, unknown> | null;
};

type VariantPickerProps = {
  productId: number | null | undefined;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  includeBaseOption?: boolean;
  disabled?: boolean;
};

export function VariantPicker({
  productId,
  value,
  onChange,
  placeholder = 'Select variant',
  includeBaseOption = false,
  disabled = false,
}: VariantPickerProps) {
  const { data: variants = [] } = useQuery({
    queryKey: ['/api/erp/products', productId, 'variants', 'picker'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/products/${productId}/variants`);
      const json = await res.json();
      return (json.data ?? []) as VariantOption[];
    },
    enabled: !!productId,
  });

  const hasVariants = variants.length > 0;
  const resolvedValue = value || (includeBaseOption ? 'none' : '');
  const isDisabled = disabled || !productId || (!hasVariants && !includeBaseOption);

  return (
    <Select value={resolvedValue} onValueChange={(next) => onChange(next === 'none' ? '' : next)} disabled={isDisabled}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent searchable>
        {includeBaseOption && <SelectItem value="none">Base product (no variant)</SelectItem>}
        {variants.map((variant) => (
          <SelectItem key={variant.id} value={String(variant.id)}>
            {variant.name}
            {variant.sku ? ` · ${variant.sku}` : ''}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
