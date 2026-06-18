'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';

import SecurityClientsSection from './components/SecurityClientsSection';
import SecurityHeroTrainingGallery from './components/SecurityHeroTrainingGallery';
import SecurityCompanyTimeline from './components/SecurityCompanyTimeline';
import SecurityCostEstimator from './components/SecurityCostEstimator';
import SecurityEditableImage from './components/SecurityEditableImage';
import SecurityPlatformShowcase from './components/SecurityPlatformShowcase';
import { useSecurityWebsiteEdit } from './components/SecurityWebsiteEditProvider';
import { useSecurityWebsite } from './components/SecurityWebsiteContext';
import {
  CV_BROCHURE_ABOUT_IMAGE_CROP,
  CV_BROCHURE_VISITING_OFFICERS_IMAGE_CROP,
  resolveSecurityWebsiteSlotImage,
  type SecurityWebsiteBrochureImageSlot,
} from '../../lib/security-website-brand';
import {
  resolveImageFrame,
  type SecurityWebsiteImageFrame,
} from '../../lib/security-website-image-frame';
import type { SecurityWebsiteImageSlot } from '../../lib/security-website-images';
import { pickLocalizedHero } from '../../lib/security-website-i18n';

const HEADING_CLASS = 'uppercase';

function serviceIcon(index: number) {
  const icons = [Shield, Users, ShieldCheck, Shield];
  return icons[index % icons.length];
}

function hasCustomWebsiteImage(url: string | null | undefined): boolean {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return false;
  return !trimmed.startsWith('/security-brochure/');
}

function slotImageProps(
  storedUrl: string | null,
  slot: SecurityWebsiteBrochureImageSlot,
) {
  return {
    src: resolveSecurityWebsiteSlotImage(storedUrl, slot),
    hasCustomImage: hasCustomWebsiteImage(storedUrl),
  };
}

function Field({
  label,
  value,
  editing,
  onChange,
  multiline,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  if (!editing) return <>{value}</>;
  const shared =
    'w-full rounded-lg border border-amber-300/80 bg-amber-50/90 px-3 py-2 text-slate-900 shadow-sm outline-none ring-amber-400/40 focus:ring-2 placeholder:text-slate-500';
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className={`${shared} resize-y min-h-[96px]`}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={shared} />
      )}
    </label>
  );
}

export default function SecurityWebsiteHome() {
  const { locale, ui } = useSecurityWebsite();
  const {
    editing,
    draft,
    content,
    patch,
    patchStat,
    patchService,
    patchFaq,
    addFaq,
    removeFaq,
    patchRankClientRates,
  } = useSecurityWebsiteEdit();
  const hero = pickLocalizedHero(content, locale);
  const heroImage = slotImageProps(content.heroImageUrl, 'hero');

  const patchImageFrame = (slot: SecurityWebsiteImageSlot, frame: SecurityWebsiteImageFrame) => {
    patch({
      imageFrames: {
        ...(editing ? draft.imageFrames : content.imageFrames),
        [slot]: frame,
      },
    });
  };

  const timelineImage = (
    slot: SecurityWebsiteImageSlot,
    brochureSlot: SecurityWebsiteBrochureImageSlot,
    storedUrl: string | null,
    defaultFrame: SecurityWebsiteImageFrame,
    patchUrl: (url: string) => void,
  ) => {
    const image = slotImageProps(storedUrl, brochureSlot);
    return {
      src: image.src,
      hasCustom: image.hasCustomImage,
      slot,
      frame: resolveImageFrame(content.imageFrames, slot, defaultFrame),
      defaultFrame,
      onUploaded: editing ? patchUrl : undefined,
      onFrameChange: editing ? (frame: SecurityWebsiteImageFrame) => patchImageFrame(slot, frame) : undefined,
    };
  };

  return (
    <>
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <SecurityEditableImage
          src={heroImage.src}
          alt="Classic Venture security officers"
          slot="hero"
          editing={editing}
          hasCustomImage={heroImage.hasCustomImage}
          onUploaded={(heroImageUrl) => patch({ heroImageUrl })}
          frame={resolveImageFrame(content.imageFrames, 'hero', {
            objectPosition: 'center 35%',
            scale: 1,
          })}
          defaultFrame={{ objectPosition: 'center 35%', scale: 1 }}
          onFrameChange={
            editing ? (frame) => patchImageFrame('hero', frame) : undefined
          }
          className="absolute inset-0 opacity-50"
          priority
        />
        <div className="cv-hero-gradient absolute inset-0" />
        <div className="relative mx-auto grid max-w-6xl gap-2.5 px-4 py-5 md:grid-cols-[1.1fr_0.9fr] md:gap-3.5 md:px-6 md:py-7 max-md:gap-4 max-md:py-6">
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-yellow-400 max-md:text-[10px] max-md:tracking-[0.22em]">
              Manpower + Pearzen monitoring
            </p>
            {editing ? (
              <div className="space-y-3">
                <Field
                  label="Hero headline"
                  value={draft.heroHeadline}
                  editing
                  onChange={(heroHeadline) => patch({ heroHeadline })}
                  multiline
                />
                <Field
                  label="Hero subheadline"
                  value={draft.heroSubheadline}
                  editing
                  onChange={(heroSubheadline) => patch({ heroSubheadline })}
                  multiline
                />
              </div>
            ) : (
              <>
                <h1
                  className={`max-w-2xl text-[1.35rem] font-semibold leading-snug tracking-tight md:text-[1.8rem] max-md:text-xl ${HEADING_CLASS}`}
                >
                  {hero.heroHeadline}
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-slate-300 md:text-lg max-md:text-sm">
                  {hero.heroSubheadline}
                </p>
              </>
            )}
            <div className="flex flex-wrap gap-3 pt-1 max-md:flex-col max-md:gap-2.5">
              <Link
                href="/security-website/offerings"
                className="cv-btn-primary rounded-full px-5 py-2.5 text-sm font-bold max-md:py-3 max-md:text-center"
              >
                {ui.navSolutions}
              </Link>
              <Link
                href="/security-website/pricing"
                className="cv-btn-secondary rounded-full px-5 py-2.5 text-sm font-semibold max-md:py-3 max-md:text-center"
              >
                {hero.heroCtaPrimary ?? ui.requestAssessment}
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 self-end">
            {content.stats.map((stat, index) => (
              <div
                key={index}
                className="rounded-2xl border border-white/10 bg-white/5 p-2.5 backdrop-blur-sm"
              >
                {editing ? (
                  <div className="space-y-2">
                    <Field
                      label={`Stat ${index + 1} value`}
                      value={draft.stats[index]?.value ?? ''}
                      editing
                      onChange={(value) => patchStat(index, 'value', value)}
                    />
                    <Field
                      label={`Stat ${index + 1} label`}
                      value={draft.stats[index]?.label ?? ''}
                      editing
                      onChange={(value) => patchStat(index, 'label', value)}
                    />
                  </div>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                    <p className="mt-1 text-xs leading-snug text-slate-300">{stat.label}</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <SecurityCompanyTimeline
        aboutBody={editing ? draft.aboutBody : content.aboutBody}
        editing={editing}
        aboutImage={timelineImage(
          'about',
          'about',
          editing ? draft.aboutImageUrl : content.aboutImageUrl,
          {
            objectPosition: CV_BROCHURE_ABOUT_IMAGE_CROP.objectPosition,
            scale: 1,
          },
          (aboutImageUrl) => patch({ aboutImageUrl }),
        )}
        coverageImage={timelineImage(
          'timelineCoverage',
          'coverage',
          editing ? draft.timelineCoverageImageUrl : content.timelineCoverageImageUrl,
          {
            objectPosition: CV_BROCHURE_VISITING_OFFICERS_IMAGE_CROP.objectPosition,
            scale: 1,
          },
          (timelineCoverageImageUrl) => patch({ timelineCoverageImageUrl }),
        )}
        monitoringImage={timelineImage(
          'timelineMonitoring',
          'monitoring',
          editing ? draft.timelineMonitoringImageUrl : content.timelineMonitoringImageUrl,
          { objectPosition: 'center 35%', scale: 1 },
          (timelineMonitoringImageUrl) => patch({ timelineMonitoringImageUrl }),
        )}
      />

      <SecurityPlatformShowcase />

      <SecurityClientsSection
        clientsTitle={content.clientsTitle}
        clientsSubtitle={content.clientsSubtitle}
        clients={editing ? draft.clients : content.clients}
        editing={editing}
        onChange={editing ? (clients) => patch({ clients }) : undefined}
        onMetaChange={
          editing
            ? (partial) =>
                patch({
                  ...(partial.clientsTitle !== undefined
                    ? { clientsTitle: partial.clientsTitle }
                    : {}),
                  ...(partial.clientsSubtitle !== undefined
                    ? { clientsSubtitle: partial.clientsSubtitle }
                    : {}),
                })
            : undefined
        }
      />

      <section className="mx-auto max-w-6xl px-4 py-20 md:px-6">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-red-700">
            Manpower services
          </p>
          {editing ? (
            <div className="mb-10 space-y-3">
              <Field
                label="Services title"
                value={draft.servicesTitle}
                editing
                onChange={(servicesTitle) => patch({ servicesTitle })}
              />
              <Field
                label="Services subtitle"
                value={draft.servicesSubtitle}
                editing
                onChange={(servicesSubtitle) => patch({ servicesSubtitle })}
                multiline
              />
            </div>
          ) : (
            <>
              <h2
                className={`text-3xl font-semibold tracking-tight text-slate-900 max-md:text-2xl ${HEADING_CLASS}`}
              >
                {content.servicesTitle}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                {content.servicesSubtitle}
              </p>
            </>
          )}
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          {content.services.map((service, index) => {
            const Icon = serviceIcon(index);
            const slug = service.slug ?? content.serviceDetails[index]?.slug;
            const inner = (
              <article className="rounded-2xl border border-slate-200 bg-slate-50/60 p-6 transition hover:border-slate-300 hover:bg-white">
                {editing ? (
                  <>
                    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-800 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-3">
                      <Field
                        label={`Service ${index + 1} title`}
                        value={draft.services[index]?.title ?? ''}
                        editing
                        onChange={(value) => patchService(index, 'title', value)}
                      />
                      <Field
                        label={`Service ${index + 1} description`}
                        value={draft.services[index]?.description ?? ''}
                        editing
                        onChange={(value) => patchService(index, 'description', value)}
                        multiline
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-4 flex items-center gap-3">
                      <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-800 text-white">
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className={`min-w-0 text-lg font-semibold text-slate-900 ${HEADING_CLASS}`}>
                        {service.title}
                      </h3>
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600">
                      {service.description}
                    </p>
                    {slug ? (
                      <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-red-700">
                        Learn more <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    ) : null}
                  </>
                )}
              </article>
            );
            if (slug && !editing) {
              return (
                <Link key={index} href={`/security-website/services/${slug}`}>
                  {inner}
                </Link>
              );
            }
            return <div key={index}>{inner}</div>;
          })}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/security-website/offerings"
            className="text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            View everything we offer →
          </Link>
        </div>
      </section>

      <section className="border-y border-red-100 bg-red-50/40">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 max-md:py-8">
          <SecurityCostEstimator
            showEmailCapture
            editing={editing}
            rankClientRates={editing ? draft.rateCard.rankClientRates : undefined}
            onRankClientRatesChange={editing ? patchRankClientRates : undefined}
          />
        </div>
      </section>

      {content.faq.length > 0 || editing ? (
        <section className="border-t border-slate-100 bg-slate-50">
          <div className="mx-auto max-w-3xl px-4 py-16 md:px-6">
            <h2 className={`text-2xl font-semibold text-slate-900 ${HEADING_CLASS}`}>FAQ</h2>
            <div className="mt-6 space-y-4">
              {(editing ? draft.faq : content.faq).map((item, index) => (
                <div
                  key={editing ? `faq-edit-${index}` : item.question}
                  className="relative rounded-xl border border-slate-200 bg-white p-4"
                >
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => removeFaq(index)}
                        className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Remove FAQ"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <div className="space-y-2 pr-8">
                        <Field
                          label={`FAQ ${index + 1} question`}
                          value={draft.faq[index]?.question ?? ''}
                          editing
                          onChange={(value) => patchFaq(index, 'question', value)}
                        />
                        <Field
                          label={`FAQ ${index + 1} answer`}
                          value={draft.faq[index]?.answer ?? ''}
                          editing
                          onChange={(value) => patchFaq(index, 'answer', value)}
                          multiline
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-slate-900">{item.question}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.answer}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
            {editing ? (
              <button
                type="button"
                onClick={addFaq}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:bg-white"
              >
                <Plus className="h-3.5 w-3.5" />
                Add FAQ
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="bg-red-800 px-4 py-16 text-white md:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 text-center sm:flex-row sm:items-center sm:gap-6">
          <div className="flex flex-col items-center">
            {editing ? (
              <div className="w-full max-w-2xl space-y-3 text-left">
                <Field
                  label="CTA headline"
                  value={draft.ctaHeadline}
                  editing
                  onChange={(ctaHeadline) => patch({ ctaHeadline })}
                />
                <Field
                  label="CTA body"
                  value={draft.ctaBody}
                  editing
                  onChange={(ctaBody) => patch({ ctaBody })}
                  multiline
                />
              </div>
            ) : (
              <>
                <h2 className={`text-2xl font-semibold ${HEADING_CLASS}`}>{content.ctaHeadline}</h2>
                <p className="mt-2 max-w-2xl text-red-100">{content.ctaBody}</p>
              </>
            )}
          </div>
          <Link
            href="/security-website/pricing"
            className="shrink-0 rounded-full bg-yellow-400 px-6 py-3 text-sm font-bold text-red-950 hover:bg-yellow-300 max-md:w-full max-md:py-3.5 max-md:text-center"
          >
            {ui.requestAssessment}
          </Link>
        </div>
      </section>

      <section className="cv-pre-footer relative overflow-hidden border-t border-red-900/40 bg-[var(--cv-charcoal)] pt-4 pb-2 md:pt-5 md:pb-2">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-[var(--cv-charcoal)] via-[var(--cv-charcoal)]/90 to-transparent sm:w-20"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-[var(--cv-charcoal)] via-[var(--cv-charcoal)]/90 to-transparent sm:w-20"
          aria-hidden
        />
        <SecurityHeroTrainingGallery
          images={editing ? draft.heroTrainingGallery : content.heroTrainingGallery}
          placement="strip"
          editing={editing}
          onChange={editing ? (heroTrainingGallery) => patch({ heroTrainingGallery }) : undefined}
        />
      </section>
    </>
  );
}
