'use client';

import { useEffect, useRef, useState } from 'react';
import {
  applyCafeCustomerDiscount,
  isCafePhoneLookupReady,
  type CafeCustomerLookup,
} from './customer-phone';

type LookupFn = (phone: string) => Promise<CafeCustomerLookup | null>;

export function useCafeCustomerPhoneLookup(lookup: LookupFn) {
  const [customerPhone, setCustomerPhoneRaw] = useState('');
  const [customerName, setCustomerNameRaw] = useState('');
  const [discountPct, setDiscountPct] = useState(0);
  const [lookupLoading, setLookupLoading] = useState(false);
  const nameFromLookupRef = useRef(false);
  const customerNameRef = useRef('');
  const lookupRef = useRef(lookup);
  lookupRef.current = lookup;
  customerNameRef.current = customerName;

  useEffect(() => {
    const phone = customerPhone.trim();
    if (!isCafePhoneLookupReady(phone)) {
      setDiscountPct(0);
      if (nameFromLookupRef.current) {
        setCustomerNameRaw('');
        nameFromLookupRef.current = false;
      }
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLookupLoading(true);
      void lookupRef
        .current(phone)
        .then((row) => {
          if (cancelled) return;
          if (row) {
            if (nameFromLookupRef.current || customerNameRef.current.trim() === '') {
              setCustomerNameRaw(row.customerName);
              nameFromLookupRef.current = true;
            }
            setDiscountPct(row.discountPct);
          } else {
            setDiscountPct(0);
          }
        })
        .finally(() => {
          if (!cancelled) setLookupLoading(false);
        });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerPhone]);

  const setCustomerPhone = (value: string) => {
    setCustomerPhoneRaw(value);
  };

  const setCustomerName = (value: string) => {
    nameFromLookupRef.current = false;
    setCustomerNameRaw(value);
  };

  const resetCustomerFields = () => {
    setCustomerPhoneRaw('');
    setCustomerNameRaw('');
    setDiscountPct(0);
    nameFromLookupRef.current = false;
  };

  return {
    customerPhone,
    setCustomerPhone,
    customerName,
    setCustomerName,
    discountPct,
    lookupLoading,
    resetCustomerFields,
    applyDiscount: (totalLkr: number) => applyCafeCustomerDiscount(totalLkr, discountPct),
  };
}
