'use client';

import { useState, useTransition } from 'react';

import { submitShalomContactInquiryAction } from '../../app/shalom-public/contact/shalom-contact-actions';
import { validateShalomContactInquiry } from '../../lib/shalom-public-contact';
import {
  shalomBookFieldClass,
  shalomBookFieldErrorClass,
  shalomBookLabelClass,
} from './ShalomBookStaySummary';
import {
  shalomPublicButtonPrimaryClass,
  shalomPublicDisplayClass,
  shalomPublicSurfaceClass,
} from '../../lib/shalom-public-tokens';

type ContactFormState = {
  name: string;
  email: string;
  phone: string;
  message: string;
};

export default function ShalomContactForm() {
  const [form, setForm] = useState<ContactFormState>({
    name: '',
    email: '',
    phone: '',
    message: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const updateField = <K extends keyof ContactFormState>(key: K, value: ContactFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setFormError(null);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const clientValidation = validateShalomContactInquiry(form);
    if (!clientValidation.ok) {
      setFieldErrors(clientValidation.fieldErrors);
      return;
    }

    startTransition(async () => {
      const result = await submitShalomContactInquiryAction(form);
      if (!result.ok) {
        if (result.fieldErrors) {
          setFieldErrors(result.fieldErrors);
        }
        setFormError(result.error ?? 'Something went wrong. Please try again.');
        return;
      }

      setSubmitted(true);
      setForm({ name: '', email: '', phone: '', message: '' });
      setFieldErrors({});
    });
  };

  if (submitted) {
    return (
      <div className={`px-6 py-10 text-center ${shalomPublicSurfaceClass}`}>
        <p
          className={`text-2xl font-semibold text-[color:var(--shalom-text)] ${shalomPublicDisplayClass}`}
        >
          Message sent
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[color:var(--shalom-muted)]">
          Thank you for reaching out. Our team will get back to you as soon as possible.
        </p>
        <button
          type="button"
          onClick={() => setSubmitted(false)}
          className="mt-6 text-sm font-semibold text-[color:var(--shalom-accent)] hover:text-[color:var(--shalom-accent-hover)]"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={`p-6 sm:p-8 ${shalomPublicSurfaceClass}`} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="shalom-contact-name" className={shalomBookLabelClass}>
            Your name
          </label>
          <input
            id="shalom-contact-name"
            name="name"
            type="text"
            autoComplete="name"
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
            className={shalomBookFieldClass}
            disabled={isPending}
          />
          {fieldErrors.name ? (
            <p className={shalomBookFieldErrorClass}>{fieldErrors.name}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="shalom-contact-email" className={shalomBookLabelClass}>
            Email
          </label>
          <input
            id="shalom-contact-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={form.email}
            onChange={(event) => updateField('email', event.target.value)}
            className={shalomBookFieldClass}
            disabled={isPending}
          />
          {fieldErrors.email ? (
            <p className={shalomBookFieldErrorClass}>{fieldErrors.email}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="shalom-contact-phone" className={shalomBookLabelClass}>
            Phone
          </label>
          <input
            id="shalom-contact-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(event) => updateField('phone', event.target.value)}
            className={shalomBookFieldClass}
            disabled={isPending}
            placeholder="+94 75 363 2001"
          />
          {fieldErrors.phone ? (
            <p className={shalomBookFieldErrorClass}>{fieldErrors.phone}</p>
          ) : null}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="shalom-contact-message" className={shalomBookLabelClass}>
            Message
          </label>
          <textarea
            id="shalom-contact-message"
            name="message"
            rows={5}
            value={form.message}
            onChange={(event) => updateField('message', event.target.value)}
            className={`${shalomBookFieldClass} min-h-[140px] resize-y`}
            disabled={isPending}
            placeholder="Tell us about your dates, group size, or any questions you have."
          />
          {fieldErrors.message ? (
            <p className={shalomBookFieldErrorClass}>{fieldErrors.message}</p>
          ) : null}
        </div>
      </div>

      {formError ? <p className={`mt-4 ${shalomBookFieldErrorClass}`}>{formError}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className={`${shalomPublicButtonPrimaryClass} mt-6 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto`}
      >
        {isPending ? 'Sending…' : 'Send message'}
      </button>
    </form>
  );
}
