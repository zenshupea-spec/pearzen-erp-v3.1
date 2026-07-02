-- Atomic direct guest booking insert with property-level lock + overlap check.

CREATE OR REPLACE FUNCTION public.create_shalom_direct_booking(
  p_property_id uuid,
  p_company_id uuid,
  p_check_in date,
  p_check_out date,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_notes text,
  p_nights int,
  p_rate_per_night numeric,
  p_total_revenue numeric,
  p_pending_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id uuid;
BEGIN
  IF p_check_out <= p_check_in THEN
    RAISE EXCEPTION 'invalid_stay_range: Check-out must be after check-in.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM shalom_properties
    WHERE id = p_property_id
      AND company_id = p_company_id
      AND public_published = true
      AND trim(public_slug) <> ''
  ) THEN
    RAISE EXCEPTION 'property_unavailable: This property is not available to book.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_property_id::text));

  SELECT b.id
  INTO v_existing_id
  FROM shalom_bookings b
  WHERE b.property_id = p_property_id
    AND b.company_id = p_company_id
    AND b.check_in = p_check_in
    AND b.check_out = p_check_out
    AND lower(trim(b.guest_email)) = lower(trim(p_guest_email))
    AND b.channel = 'DIRECT'
    AND b.booking_status = 'PENDING_PAYMENT'
    AND b.pending_payment_expires_at IS NOT NULL
    AND b.pending_payment_expires_at > now()
  ORDER BY b.created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM shalom_bookings b
    WHERE b.property_id = p_property_id
      AND b.company_id = p_company_id
      AND NOT (
        b.booking_status IN ('CANCELLED', 'EXPIRED')
        OR (
          b.booking_status = 'PENDING_PAYMENT'
          AND b.pending_payment_expires_at IS NOT NULL
          AND b.pending_payment_expires_at <= now()
        )
      )
      AND (
        (b.check_in >= p_check_in AND b.check_in < p_check_out)
        OR (b.check_out > p_check_in AND b.check_out <= p_check_out)
        OR (b.check_in < p_check_in AND b.check_out > p_check_out)
      )
  ) THEN
    RAISE EXCEPTION 'dates_unavailable: Those dates are no longer available.';
  END IF;

  INSERT INTO shalom_bookings (
    property_id,
    company_id,
    guest_name,
    guest_email,
    guest_phone,
    channel,
    check_in,
    check_out,
    nights,
    rate_per_night,
    total_revenue,
    paid,
    notes,
    booking_status,
    pending_payment_expires_at
  )
  VALUES (
    p_property_id,
    p_company_id,
    trim(p_guest_name),
    lower(trim(p_guest_email)),
    trim(p_guest_phone),
    'DIRECT',
    p_check_in,
    p_check_out,
    p_nights,
    p_rate_per_night,
    p_total_revenue,
    false,
    COALESCE(trim(p_notes), ''),
    'PENDING_PAYMENT',
    p_pending_expires_at
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_shalom_direct_booking(
  uuid, uuid, date, date, text, text, text, text, int, numeric, numeric, timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_shalom_direct_booking(
  uuid, uuid, date, date, text, text, text, text, int, numeric, numeric, timestamptz
) TO service_role;
