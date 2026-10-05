import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ERP_CUSTOM_FIELD_ENTITIES, ERP_CUSTOM_FIELD_ENTITY_LABELS, type ErpCustomFieldEntity } from '@shared/erp-custom-fields';
import ProductCustomFieldsPanel from './ProductCustomFieldsPanel';

export default function ErpCustomFieldsSettings({ canManage }: { canManage: boolean }) {
  const { company, user } = useAuth();
  const { isRealEstate } = useErpBusinessType();
  const { hasPermission } = usePermissions();
  const { t } = useTranslation();
  const [entity, setEntity] = useState<ErpCustomFieldEntity>('product');
  const canManageEntity = entity === 'product'
    ? canManage && hasPermission('manage_products')
    : canManage && hasPermission('manage_real_estate_settings');
  return <div className="space-y-4">
    {isRealEstate && <Select value={entity} onValueChange={value => setEntity(value as ErpCustomFieldEntity)}>
      <SelectTrigger className="w-full sm:w-80" aria-label={t('erp.settings.customFields.entity', 'Record type')}><SelectValue /></SelectTrigger>
      <SelectContent>{ERP_CUSTOM_FIELD_ENTITIES.map(value => <SelectItem key={value} value={value}>
        {t(`erp.settings.customFields.entities.${value}`, ERP_CUSTOM_FIELD_ENTITY_LABELS[value])}
      </SelectItem>)}</SelectContent>
    </Select>}
    <ProductCustomFieldsPanel key={`${company?.id ?? user?.companyId}-${entity}`} canManage={canManageEntity} entityType={entity} />
  </div>;
}
