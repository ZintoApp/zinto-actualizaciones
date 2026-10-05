import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Minus, Plus } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';

type PublicMenuProduct = {
  id: number;
  name: string;
  sku: string | null;
  unitPrice: string | null;
  categoryId: number | null;
  description?: string | null;
  modifiers?: unknown[] | null;
};

type PublicQrPayload = {
  company: { id: number; name: string; logo?: string | null };
  table: { id: number; label: string; code: string; capacity: number };
  categories: Array<{ id: number; name: string }>;
  products: PublicMenuProduct[];
};

type CartLine = {
  product: PublicMenuProduct;
  quantity: number;
};

function getTokenFromPath() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  return decodeURIComponent(parts[parts.length - 1] ?? '');
}

function money(value: number) {
  return `USD ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function RestaurantQROrderPage() {
  const token = getTokenFromPath();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [guestName, setGuestName] = useState('');
  const [notes, setNotes] = useState('');
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const qrQuery = useQuery<PublicQrPayload>({
    queryKey: ['/api/public/restaurant/qr', token],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/public/restaurant/qr/${encodeURIComponent(token)}`);
      const json = await res.json();
      return json.data;
    },
    enabled: !!token,
    retry: false,
  });

  const categoryById = useMemo(() => new Map((qrQuery.data?.categories ?? []).map((category) => [category.id, category.name])), [qrQuery.data]);
  const productsByCategory = useMemo(() => {
    const map = new Map<string, PublicMenuProduct[]>();
    for (const product of qrQuery.data?.products ?? []) {
      const categoryName =
        product.categoryId
          ? categoryById.get(product.categoryId) ?? t('erp.restaurant.qr.menu', 'Menu')
          : t('erp.restaurant.qr.menu', 'Menu');
      map.set(categoryName, [...(map.get(categoryName) ?? []), product]);
    }
    return Array.from(map.entries());
  }, [categoryById, qrQuery.data]);
  const total = cart.reduce((sum, line) => sum + line.quantity * Number(line.product.unitPrice ?? 0), 0);

  const updateQuantity = (product: PublicMenuProduct, delta: number) => {
    setCart((lines) => {
      const current = lines.find((line) => line.product.id === product.id);
      if (!current && delta > 0) return [...lines, { product, quantity: 1 }];
      return lines
        .map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + delta } : line)
        .filter((line) => line.quantity > 0);
    });
  };

  const submitOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/public/restaurant/qr/${encodeURIComponent(token)}/order`, {
        idempotencyKey: idempotencyKeyRef.current,
        guestName,
        notes,
        items: cart.map((line, index) => ({
          productId: line.product.id,
          quantity: line.quantity,
          unitPrice: Number(line.product.unitPrice ?? 0).toFixed(2),
          description: line.product.name,
          sortOrder: index,
        })),
      });
      const json = await res.json();
      return json.data as { orderNumber: string; message: string };
    },
    onSuccess: (confirmation) => {
      toast({ title: t('erp.restaurant.qr.toast.orderSubmitted', 'Order submitted'), description: confirmation.message });
      setCart([]);
      setNotes('');
      idempotencyKeyRef.current = crypto.randomUUID();
    },
    onError: (error: Error) =>
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  if (qrQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" />
        {t('erp.restaurant.qr.loadingMenu', 'Loading menu...')}
      </div>
    );
  }

  if (qrQuery.isError || !qrQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold">{t('erp.restaurant.qr.unavailableTitle', 'QR order unavailable')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('erp.restaurant.qr.unavailableDesc', 'This table QR code is invalid, inactive, or expired.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto grid max-w-6xl gap-6 p-4 md:grid-cols-[minmax(0,1fr)_360px] md:p-8">
        <section className="space-y-6">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              {qrQuery.data.company.logo ? <img src={qrQuery.data.company.logo} alt="" className="h-12 w-12 rounded object-cover" /> : null}
              <div>
                <h1 className="text-2xl font-semibold">{qrQuery.data.company.name}</h1>
                <p className="text-sm text-muted-foreground">
                  {t('erp.restaurant.qr.orderingFor', 'Ordering for {{table}}', { table: qrQuery.data.table.label })}
                </p>
              </div>
            </div>
          </div>

          {productsByCategory.map(([categoryName, products]) => (
            <section key={categoryName} className="rounded-2xl border bg-card p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-semibold">{categoryName}</h2>
              <div className="grid gap-3">
                {products.map((product) => {
                  const current = cart.find((line) => line.product.id === product.id);
                  return (
                    <article key={product.id} className="flex items-center justify-between gap-4 rounded-lg border p-4">
                      <div>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {product.description ?? product.sku ?? t('erp.restaurant.qr.menuItemFallback', 'Menu item')}
                        </div>
                        {product.modifiers && Array.isArray(product.modifiers) && product.modifiers.length > 0 ? (
                          <Badge className="mt-2" variant="secondary">
                            {t('erp.restaurant.qr.modifierGroups', '{{count}} modifier groups', { count: String(product.modifiers.length) })}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="mr-2 text-sm font-medium">{money(Number(product.unitPrice ?? 0))}</div>
                        <Button size="icon" variant="outline" onClick={() => updateQuantity(product, -1)} disabled={!current}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-6 text-center">{current?.quantity ?? 0}</span>
                        <Button size="icon" onClick={() => updateQuantity(product, 1)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </section>

        <aside className="h-fit rounded-2xl border bg-card p-5 shadow-sm md:sticky md:top-6">
          <h2 className="text-lg font-semibold">{t('erp.restaurant.qr.yourOrder', 'Your Order')}</h2>
          <div className="mt-4 space-y-3">
            {cart.map((line) => (
              <div key={line.product.id} className="flex justify-between gap-3 text-sm">
                <span>{line.quantity} x {line.product.name}</span>
                <span>{money(line.quantity * Number(line.product.unitPrice ?? 0))}</span>
              </div>
            ))}
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('erp.restaurant.qr.addItemsHint', 'Add items from the menu.')}</p>
            ) : null}
          </div>
          <div className="mt-4 border-t pt-4">
            <div className="flex justify-between text-lg font-semibold">
              <span>{t('erp.common.total', 'Total')}</span>
              <span>{money(total)}</span>
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <Input
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder={t('erp.restaurant.qr.yourNameOptional', 'Your name (optional)')}
            />
            <Input
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t('erp.restaurant.qr.kitchenNotes', 'Notes for the kitchen')}
            />
            <Button className="w-full" disabled={cart.length === 0 || submitOrderMutation.isPending} onClick={() => submitOrderMutation.mutate()}>
              {submitOrderMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t('erp.restaurant.qr.submitOrder', 'Submit Order')}
            </Button>
          </div>
        </aside>
      </main>
    </div>
  );
}
