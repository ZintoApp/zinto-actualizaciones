import { useAuth } from '@/hooks/use-auth';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { usePermissions } from '@/hooks/usePermissions';
import type { RealEstateSection } from '@shared/real-estate';

/** Gate requests as well as rendering while company mode and permissions resolve. */
export function useRealEstateAccess(section: RealEstateSection) {
  const { company, user } = useAuth();
  const mode = useErpBusinessType();
  const permissions = usePermissions();
  const companyId = company?.id ?? user?.companyId;
  const canRead = permissions.hasAnyPermission([`view_real_estate_${section}`, `manage_real_estate_${section}`]);
  return {
    companyId,
    enabled: !!companyId && !mode.isLoading && mode.isRealEstate && !permissions.isLoading && canRead,
    canManage: permissions.hasPermission(`manage_real_estate_${section}`),
    financial: permissions.hasPermission('view_real_estate_financials'),
  };
}
