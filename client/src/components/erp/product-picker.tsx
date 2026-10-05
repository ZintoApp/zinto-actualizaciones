import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';

export type ProductPickerOption = {
  id: number;
  name: string;
  sku: string | null;
  unitPrice?: string | null;
  type?: string;
  preparationTimeMinutes?: number | null;
  modifiers?: unknown[] | null;
};

type ProductPickerProps = {
  companyId: number | null | undefined;
  value: ProductPickerOption | null;
  onChange: (product: ProductPickerOption | null) => void;
  placeholder?: string;
  disabled?: boolean;
  queryKeyScope: string;
  menuItemsOnly?: boolean;
};

const PAGE_SIZE = 25;

export function ProductPicker({
  companyId,
  value,
  onChange,
  placeholder = 'Select product',
  disabled = false,
  queryKeyScope,
  menuItemsOnly = false,
}: ProductPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['/api/erp/products', companyId, queryKeyScope, search, menuItemsOnly],
      queryFn: async ({ pageParam = 0 }) => {
        const page = Number(pageParam);
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_SIZE));
        params.set('offset', String(page * PAGE_SIZE));
        if (search.trim()) {
          params.set('search', search.trim());
        }
        if (menuItemsOnly) {
          params.set('isMenuItem', 'true');
        }
        const res = await apiRequest('GET', `/api/erp/products?${params.toString()}`);
        const json = await res.json();
        return json.data as { data: ProductPickerOption[]; total: number };
      },
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        const loaded = allPages.reduce((sum, page) => sum + page.data.length, 0);
        return loaded < lastPage.total ? allPages.length : undefined;
      },
      enabled: !!companyId && open,
    });

  const options = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled || !companyId}
        >
          <span className="truncate text-left">
            {value ? `${value.name}${value.sku ? ` (${value.sku})` : ''}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search products or variant SKU..."
            value={search}
            onValueChange={(nextValue) => {
              setSearch(nextValue);
            }}
          />
          <CommandList className="max-h-72">
            <CommandItem
              value="__clear__"
              onSelect={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear selection
            </CommandItem>
            {isLoading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading products...
              </div>
            ) : (
              <>
                <CommandEmpty>No products found.</CommandEmpty>
                {options.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={`${product.name} ${product.sku ?? ''}`}
                    onSelect={() => {
                      onChange(product);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn('h-4 w-4', value?.id === product.id ? 'opacity-100' : 'opacity-0')}
                    />
                    <div className="min-w-0">
                      <div className="truncate">{product.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[product.sku, product.preparationTimeMinutes != null ? `~${product.preparationTimeMinutes} min` : null]
                          .filter(Boolean)
                          .join(' · ') || ' '}
                      </div>
                    </div>
                  </CommandItem>
                ))}
                {hasNextPage ? (
                  <div className="border-t p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full"
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                    >
                      {isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Load more
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
