ALTER TABLE erp_invoice_posting_contexts DROP CONSTRAINT IF EXISTS erp_invoice_posting_contexts_treatment_check;
ALTER TABLE erp_invoice_posting_contexts ADD CONSTRAINT erp_invoice_posting_contexts_treatment_check
 CHECK(treatment IN('revenue','owner_funds','deposit','advance','expense','asset'));
