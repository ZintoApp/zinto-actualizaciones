-- Allow stock count / set-quantity import movements
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type IN ('in', 'out', 'transfer', 'adjustment', 'count'));
