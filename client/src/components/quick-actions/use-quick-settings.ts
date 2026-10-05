import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { apiRequest } from '@/lib/queryClient';
import { shortcutAvailable, type QuickShortcut } from '@shared/quick-actions';
export type QuickSettings = { shortcuts: QuickShortcut[]; availableIds: string[]; businessType: string; canManage: boolean };
export function useQuickSettings(editor = false) {
  const { user } = useAuth();
  const { permissions } = usePermissions();
  const query = useQuery<QuickSettings>({
    queryKey: ['personalization', user?.companyId, user?.id, editor ? 'editor' : 'header'],
    enabled: !!user?.companyId,
    queryFn: async () => (await apiRequest('GET', '/api/company-settings/personalization' + (editor ? '' : '/shortcuts'))).json(),
    staleTime: 0, refetchOnWindowFocus: 'always', refetchOnReconnect: 'always', retry: 1,
  });
  const available = query.isError ? [] : (query.data?.shortcuts || []).filter(s => shortcutAvailable(s, { permissions: permissions || {}, superAdmin: user?.isSuperAdmin === true, businessType: query.data?.businessType || 'general' }, window.location.origin));
  return { ...query, available };
}
