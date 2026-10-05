import { Router } from 'express';
import { ERP_CUSTOM_FIELD_ENTITIES } from '@shared/erp-custom-fields';
import { createErpCustomFieldRouter } from './product-custom-fields';
const router = Router();
for (const entity of ERP_CUSTOM_FIELD_ENTITIES) router.use(`/${entity}`, createErpCustomFieldRouter(entity));
export default router;
