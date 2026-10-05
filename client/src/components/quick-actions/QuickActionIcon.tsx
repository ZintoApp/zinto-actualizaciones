import { lazy, Suspense } from 'react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';
import { LayoutGrid } from 'lucide-react';
const cache = new Map<string, ReturnType<typeof lazy>>();
export function QuickActionIcon({ name, className = 'h-5 w-5 shrink-0' }: { name: string; className?: string }) {
  const loader = dynamicIconImports[name as keyof typeof dynamicIconImports];
  if (!loader) return <LayoutGrid className={className} aria-hidden />;
  if (!cache.has(name)) cache.set(name, lazy(loader));
  const Icon = cache.get(name)!;
  return <Suspense fallback={<LayoutGrid className={className} aria-hidden />}><Icon className={className} aria-hidden /></Suspense>;
}
