import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { requireAnyPermission } from '../../middleware';
import {
  ERP_ONLINE_GATEWAYS,
  erpGatewayFromRouteSlug,
  type ErpManualMethodsSettings,
  type ErpOnlineGateway,
} from '@shared/erp-payment-gateway';
import {
  getAllErpGatewaySettings,
  getEnabledErpPaymentMethods,
  saveErpGatewaySettings,
  saveErpManualMethodsSettings,
} from '../../services/erp-payment-gateway-service';
import { testGatewayConnection } from '../../services/payment-gateway-core';
import { getErpGatewaySettingsRaw } from '../../services/erp-payment-gateway-service';
import { sendValidationError } from '../../utils/erp-zod-validation';

const router = Router();

const ERP_SETTINGS_READ = ['view_erp_settings', 'manage_erp_settings'];
const ERP_SETTINGS_WRITE = ['manage_erp_settings'];
const ERP_PAYMENT_METHODS_READ = [
  'view_erp_settings',
  'manage_erp_settings',
  'view_invoices',
  'manage_invoices',
  'record_payments',
];

function getBaseUrl(req: Request): string {
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('host') || 'localhost:9000';
  return `${protocol}://${host}`;
}

function handleError(res: Response, error: unknown, label: string) {
  if (error instanceof z.ZodError) return sendValidationError(res, error);
  console.error(label, error);
  const message = error instanceof Error ? error.message : 'Unexpected server error';
  return res.status(400).json({ success: false, error: message });
}

router.get(
  '/',
  requireAnyPermission(ERP_SETTINGS_READ),
  async (req: any, res) => {
    try {
      const settings = await getAllErpGatewaySettings(req.user.companyId, getBaseUrl(req));
      res.json(settings);
    } catch (error) {
      handleError(res, error, '[erp-payment-gateways] GET /');
    }
  }
);

router.get(
  '/methods',
  requireAnyPermission(ERP_PAYMENT_METHODS_READ),
  async (req: any, res) => {
    try {
      const methods = await getEnabledErpPaymentMethods(req.user.companyId);
      res.json(methods);
    } catch (error) {
      handleError(res, error, '[erp-payment-gateways] GET /methods');
    }
  }
);

const manualMethodsSchema = z.record(
  z.enum(['cash', 'check', 'credit_card', 'debit_card', 'other']),
  z.object({ enabled: z.boolean() })
);

router.post(
  '/manual-methods',
  requireAnyPermission(ERP_SETTINGS_WRITE),
  async (req: any, res) => {
    try {
      const parsed = manualMethodsSchema.parse(req.body);
      const saved = await saveErpManualMethodsSettings(req.user.companyId, parsed as ErpManualMethodsSettings);
      res.json({ message: 'Manual payment methods saved', settings: saved });
    } catch (error) {
      handleError(res, error, '[erp-payment-gateways] POST /manual-methods');
    }
  }
);

router.post(
  '/:gateway/test',
  requireAnyPermission(ERP_SETTINGS_WRITE),
  async (req: any, res) => {
    try {
      const gateway = erpGatewayFromRouteSlug(req.params.gateway) as ErpOnlineGateway | undefined;
      if (!gateway || !ERP_ONLINE_GATEWAYS.includes(gateway)) {
        return res.status(400).json({ error: 'Invalid gateway' });
      }
      const settings = await getErpGatewaySettingsRaw(req.user.companyId, gateway);
      if (!settings) {
        return res.status(400).json({ error: `${gateway} is not configured` });
      }
      const result = await testGatewayConnection(gateway, settings);
      res.json(result);
    } catch (error) {
      handleError(res, error, '[erp-payment-gateways] POST /:gateway/test');
    }
  }
);

router.post(
  '/:gateway',
  requireAnyPermission(ERP_SETTINGS_WRITE),
  async (req: any, res) => {
    try {
      const gateway = erpGatewayFromRouteSlug(req.params.gateway) as ErpOnlineGateway | undefined;
      if (!gateway || !ERP_ONLINE_GATEWAYS.includes(gateway)) {
        return res.status(400).json({ error: 'Invalid gateway' });
      }
      const saved = await saveErpGatewaySettings(
        req.user.companyId,
        gateway,
        req.body,
        getBaseUrl(req)
      );
      res.json({ message: 'Gateway settings saved', settings: saved });
    } catch (error) {
      handleError(res, error, '[erp-payment-gateways] POST /:gateway');
    }
  }
);

export default router;
