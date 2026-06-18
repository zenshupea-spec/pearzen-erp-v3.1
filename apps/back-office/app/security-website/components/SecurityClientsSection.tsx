'use client';

import { useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';
import { Camera, Loader2, Plus, Trash2 } from 'lucide-react';

import {
  clampSecurityWebsiteClientLogoZoom,
  resolveSecurityWebsiteClientLogoZoom,
  SECURITY_WEBSITE_CLIENT_LOGO_ZOOM_MAX,
  SECURITY_WEBSITE_CLIENT_LOGO_ZOOM_MIN,
  SECURITY_WEBSITE_MARQUEE_LOGO_CONTAINER_CLASS,
  SECURITY_WEBSITE_MARQUEE_LOGO_IMG_CLASS,
} from '../../../lib/security-website-brand';
import { uploadSecurityWebsiteClientLogoAction } from '../actions';
import { compressSecurityWebsiteImageFile } from '../../../lib/security-website-image-compress-client';
import type { SecurityWebsiteClient } from '../../../lib/security-website-types';

type Props = {
  clientsTitle: string;
  clientsSubtitle: string;
  clients: SecurityWebsiteClient[];
  editing?: boolean;
  onChange?: (clients: SecurityWebsiteClient[]) => void;
  onMetaChange?: (partial: { clientsTitle?: string; clientsSubtitle?: string }) => void;
};

function isVectorLogo(url: string): boolean {
  const normalized = url.split('?')[0]?.toLowerCase() ?? '';
  return normalized.endsWith('.svg');
}

function shouldServeLogoUnoptimized(url: string): boolean {
  return (
    url.startsWith('/security-brochure/') ||
    url.startsWith('data:') ||
    url.includes('supabase') ||
    isVectorLogo(url)
  );
}

function marqueeLogoPresentationClass(editing?: boolean): string {
  if (editing) return '';
  return ' opacity-90 grayscale-[25%] transition duration-300 group-hover:opacity-100 group-hover:grayscale-0';
}

function MarqueeLogoImage({
  client,
  zoom,
  editing,
  onLoadFailed,
}: {
  client: SecurityWebsiteClient;
  zoom: number;
  editing?: boolean;
  onLoadFailed?: () => void;
}) {
  if (!client.logoUrl) return null;

  const logoClass = `${SECURITY_WEBSITE_MARQUEE_LOGO_IMG_CLASS}${marqueeLogoPresentationClass(editing)}`;
  const unoptimized = shouldServeLogoUnoptimized(client.logoUrl);
  const imageStyle = {
    transform: `scale(${zoom})`,
    transformOrigin: 'center',
  } as const;

  if (isVectorLogo(client.logoUrl)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={client.logoUrl}
        alt={client.name}
        className={logoClass}
        style={imageStyle}
        loading="lazy"
        decoding="async"
        onError={onLoadFailed}
      />
    );
  }

  return (
    <Image
      src={client.logoUrl}
      alt={client.name}
      width={320}
      height={128}
      sizes="192px"
      quality={90}
      className={logoClass}
      style={imageStyle}
      unoptimized={unoptimized}
      onError={onLoadFailed}
    />
  );
}

function MarqueeLogoCard({
  client,
  editing,
  onUploaded,
  onLoadFailed,
}: {
  client: SecurityWebsiteClient;
  editing?: boolean;
  onUploaded?: (logoUrl: string) => void;
  onLoadFailed?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const zoom = resolveSecurityWebsiteClientLogoZoom(client);

  const handleFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/') || !onUploaded) return;
    setUploading(true);
    try {
      const dataUrl = await compressSecurityWebsiteImageFile(file);
      const result = await uploadSecurityWebsiteClientLogoAction(client.id, dataUrl);
      if (result.success && result.url) onUploaded(result.url);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={`group relative ${SECURITY_WEBSITE_MARQUEE_LOGO_CONTAINER_CLASS}`}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden">
        {client.logoUrl ? (
          <MarqueeLogoImage
            client={client}
            zoom={zoom}
            editing={editing}
            onLoadFailed={onLoadFailed}
          />
        ) : editing ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[10px] font-semibold text-slate-500 hover:border-slate-400 hover:bg-slate-50"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Upload logo
          </button>
        ) : null}
      </div>
      {editing && client.logoUrl ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 text-[10px] font-bold text-white opacity-0 transition hover:opacity-100"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Change'}
        </button>
      ) : null}
      {editing ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />
      ) : null}
    </div>
  );
}

function MarqueeLogoItem({
  client,
  onLoadFailed,
}: {
  client: SecurityWebsiteClient;
  onLoadFailed?: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  if (!client.logoUrl || hidden) return null;

  return (
    <MarqueeLogoCard
      client={client}
      onLoadFailed={() => {
        setHidden(true);
        onLoadFailed?.();
      }}
    />
  );
}

function ClientsMarqueeRow({
  clients,
  reverse,
}: {
  clients: SecurityWebsiteClient[];
  reverse?: boolean;
}) {
  if (clients.length === 0) return null;

  const duration = Math.max(36, clients.length * 2.8);

  return (
    <div
      className="cv-clients-marquee-row relative overflow-hidden"
      style={{ '--cv-marquee-duration': `${duration}s` } as CSSProperties}
    >
      <div
        className={`cv-clients-marquee-track gap-3 sm:gap-4${reverse ? ' cv-clients-marquee-track--reverse' : ''}`}
      >
        {[0, 1].map((copy) => (
          <div
            key={copy}
            className={`flex shrink-0 items-center gap-3 sm:gap-4${copy === 1 ? ' cv-clients-marquee-duplicate' : ''}`}
            aria-hidden={copy === 1 ? true : undefined}
          >
            {clients.map((client) => (
              <MarqueeLogoItem key={`${copy}-${client.id}`} client={client} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClientsMarquee({ clients }: { clients: SecurityWebsiteClient[] }) {
  const row1 = clients.filter((_, index) => index % 3 === 0);
  const row2 = clients.filter((_, index) => index % 3 === 1);
  const row3 = clients.filter((_, index) => index % 3 === 2);

  return (
    <div className="relative mt-8">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-white via-white/90 to-transparent sm:w-20"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-white via-white/90 to-transparent sm:w-20"
        aria-hidden
      />
      <div className="space-y-3 sm:space-y-3.5">
        <ClientsMarqueeRow clients={row1} />
        <ClientsMarqueeRow clients={row2.length > 0 ? row2 : row1} reverse />
        <ClientsMarqueeRow clients={row3.length > 0 ? row3 : row1} />
      </div>
    </div>
  );
}

function ClientLogoEditTile({
  client,
  onUpdate,
  onRemove,
}: {
  client: SecurityWebsiteClient;
  onUpdate: (patch: Partial<SecurityWebsiteClient>) => void;
  onRemove: () => void;
}) {
  const zoom = resolveSecurityWebsiteClientLogoZoom(client);
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className="flex w-[11rem] shrink-0 flex-col gap-2 sm:w-[12rem]">
      <div className="relative">
        <button
          type="button"
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 z-20 rounded-full border border-slate-200 bg-white p-1 text-slate-400 shadow-sm hover:bg-rose-50 hover:text-rose-600"
          aria-label={`Remove ${client.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <MarqueeLogoCard
          client={client}
          editing
          onUploaded={(logoUrl) => onUpdate({ logoUrl })}
        />
      </div>
      <input
        value={client.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        className="w-full rounded border border-amber-300/80 bg-amber-50/90 px-2 py-0.5 text-center text-[10px] font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-amber-400/40"
        aria-label="Client name"
      />
      <label className="space-y-1">
        <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-slate-500">
          <span>Logo zoom</span>
          <span className="tabular-nums text-slate-700">{zoomPercent}%</span>
        </div>
        <input
          type="range"
          min={SECURITY_WEBSITE_CLIENT_LOGO_ZOOM_MIN * 100}
          max={SECURITY_WEBSITE_CLIENT_LOGO_ZOOM_MAX * 100}
          step={5}
          value={zoomPercent}
          onChange={(e) =>
            onUpdate({
              logoZoom: clampSecurityWebsiteClientLogoZoom(Number(e.target.value) / 100),
            })
          }
          className="h-1.5 w-full cursor-pointer accent-red-700"
          aria-label={`Logo zoom for ${client.name}`}
        />
      </label>
    </div>
  );
}

export default function SecurityClientsSection({
  clientsTitle,
  clientsSubtitle,
  clients,
  editing,
  onChange,
  onMetaChange,
}: Props) {
  const updateClient = (index: number, patch: Partial<SecurityWebsiteClient>) => {
    if (!onChange) return;
    const next = [...clients];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeClient = (index: number) => {
    if (!onChange) return;
    onChange(clients.filter((_, i) => i !== index));
  };

  const addClient = () => {
    if (!onChange) return;
    const id = `client-${Date.now()}`;
    onChange([...clients, { id, name: 'New client', logoUrl: null }]);
  };

  const displayClients = editing ? clients : clients.filter((c) => c.logoUrl);

  return (
    <section className="border-y border-red-100 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10 md:px-6 md:py-12">
        <div className="md:flex md:items-end md:justify-between md:gap-8">
          <div className="max-w-xl">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">
              Trusted across Sri Lanka
            </p>
            {editing && onMetaChange ? (
              <div className="mt-2 space-y-2">
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Clients section title
                  </span>
                  <input
                    value={clientsTitle}
                    onChange={(e) => onMetaChange({ clientsTitle: e.target.value })}
                    className="w-full rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-2 text-slate-900 shadow-sm outline-none ring-amber-400/40 focus:ring-2"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Clients section subtitle
                  </span>
                  <textarea
                    value={clientsSubtitle}
                    onChange={(e) => onMetaChange({ clientsSubtitle: e.target.value })}
                    rows={2}
                    className="w-full resize-y rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-2 text-slate-900 shadow-sm outline-none ring-amber-400/40 focus:ring-2"
                  />
                </label>
              </div>
            ) : (
              <>
                <h2 className="cv-heading-green mt-2 text-xl font-semibold uppercase tracking-tight text-slate-900 sm:text-2xl">
                  {clientsTitle}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {clientsSubtitle}
                </p>
              </>
            )}
          </div>
          {!editing ? (
            <p className="mt-4 hidden text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400 md:mt-0 md:block md:shrink-0 md:pb-1">
              170+ partners
            </p>
          ) : null}
        </div>

        {editing ? (
          <div className="mt-8 flex flex-wrap gap-3 sm:gap-4">
            {displayClients.map((client, index) => (
              <ClientLogoEditTile
                key={client.id}
                client={client}
                onUpdate={(patch) => updateClient(index, patch)}
                onRemove={() => removeClient(index)}
              />
            ))}
          </div>
        ) : (
          <ClientsMarquee clients={displayClients} />
        )}

        {editing && onChange ? (
          <button
            type="button"
            onClick={addClient}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:bg-slate-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add client
          </button>
        ) : null}
      </div>
    </section>
  );
}
