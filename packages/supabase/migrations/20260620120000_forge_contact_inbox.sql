-- Forge contact inbox — inbound website email threads for info@pearzen.tech.

CREATE TABLE IF NOT EXISTS public.forge_contact_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_email text NOT NULL,
  visitor_name text,
  subject text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'archived')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.forge_contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.forge_contact_threads(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email text NOT NULL,
  to_emails text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL,
  body_text text,
  body_html text,
  message_id text,
  in_reply_to text,
  resend_email_id text,
  operator_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS forge_contact_threads_last_message_idx
  ON public.forge_contact_threads (last_message_at DESC);

CREATE INDEX IF NOT EXISTS forge_contact_messages_thread_created_idx
  ON public.forge_contact_messages (thread_id, created_at ASC);

CREATE UNIQUE INDEX IF NOT EXISTS forge_contact_messages_resend_inbound_uidx
  ON public.forge_contact_messages (resend_email_id)
  WHERE resend_email_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS forge_contact_messages_message_id_idx
  ON public.forge_contact_messages (message_id)
  WHERE message_id IS NOT NULL;

ALTER TABLE public.forge_contact_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forge_contact_messages ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.forge_contact_threads IS
  'Website contact email conversations received at info@pearzen.tech — managed in SaaS Forge.';

COMMENT ON TABLE public.forge_contact_messages IS
  'Individual inbound/outbound messages in a Forge contact thread.';
