-- Cash-at-counter option for pickup / dine-in café orders.

ALTER TABLE cafe_customer_orders
  DROP CONSTRAINT IF EXISTS cafe_customer_orders_payment_method_check;

ALTER TABLE cafe_customer_orders
  ADD CONSTRAINT cafe_customer_orders_payment_method_check
    CHECK (payment_method IN ('card_online', 'cash_at_counter'));
