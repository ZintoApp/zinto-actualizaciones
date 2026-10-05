-- Make ERP flow automation dispatch idempotency tenant-safe: include company_id in the uniqueness key.

ALTER TABLE erp_flow_event_dispatches
  DROP CONSTRAINT IF EXISTS unique_erp_flow_event_dispatch;

ALTER TABLE erp_flow_event_dispatches
  DROP CONSTRAINT IF EXISTS unique_erp_flow_event_dispatch_company;

ALTER TABLE erp_flow_event_dispatches
  ADD CONSTRAINT unique_erp_flow_event_dispatch_company
    UNIQUE (company_id, event_key, flow_id, node_id);
