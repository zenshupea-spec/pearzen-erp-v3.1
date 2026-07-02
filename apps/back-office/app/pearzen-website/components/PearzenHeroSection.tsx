'use client';

import { ArrowRight, ChevronDown } from 'lucide-react';

import { Field } from './PearzenWebsiteEditProvider';
import type { PearzenWebsiteContent } from '../../../lib/pearzen-website-types';

const HERO_VIDEO_SRC = '/pearzen-website/hero-video.mp4';

type PearzenHeroSectionProps = {
  data: PearzenWebsiteContent;
  editing: boolean;
  draft: PearzenWebsiteContent;
  patch: (partial: Partial<PearzenWebsiteContent>) => void;
};

export default function PearzenHeroSection({
  data,
  editing,
  draft,
  patch,
}: PearzenHeroSectionProps) {
  return (
    <>
      <div className="pearzen-hero-video-fixed" aria-hidden>
        <video autoPlay muted loop playsInline preload="auto">
          <source src={HERO_VIDEO_SRC} type="video/mp4" />
        </video>
        <div className="pearzen-hero-cover-overlay" />
        <div className="pearzen-hero-grid" />
        <div className="pearzen-hero-video-fade" />
      </div>

      <section className="pearzen-hero relative z-10 min-h-[min(85vh,800px)] pb-20 md:pb-24">
        <div
          className="pointer-events-none absolute -left-32 top-1/4 h-[420px] w-[420px] rounded-full bg-[var(--pearzen-cyan)]/15 blur-[100px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-24 top-12 h-80 w-80 rounded-full bg-[var(--pearzen-gold)]/10 blur-[90px]"
          aria-hidden
        />

        <div className="relative mx-auto flex min-h-[min(85vh,800px)] max-w-7xl items-center px-4 pt-16 md:px-8 lg:px-10">
          <div className="ml-auto w-full max-w-2xl lg:max-w-xl xl:max-w-2xl">
            <div className="pearzen-hero-panel rounded-[2rem] p-8 md:p-10 lg:p-11">
              <div className="pearzen-hero-panel-inner">
                {editing ? (
                  <Field
                    label="Tagline"
                    value={draft.tagline}
                    editing
                    onChange={(tagline) => patch({ tagline })}
                  />
                ) : (
                  <p className="pearzen-hero-tagline text-[11px] font-bold uppercase tracking-[0.34em]">
                    {data.tagline}
                  </p>
                )}

                <h1 className="pearzen-hero-headline mt-5 text-[clamp(1.75rem,4vw,3.15rem)] font-black uppercase leading-[1.02] tracking-tight">
                  {editing ? (
                    <Field
                      label="Hero headline"
                      value={draft.heroHeadline}
                      editing
                      onChange={(heroHeadline) => patch({ heroHeadline })}
                    />
                  ) : (
                    data.heroHeadline
                  )}
                </h1>

                <p className="mt-5 text-base leading-relaxed text-[var(--pearzen-text-muted-dark)] md:text-lg">
                  {editing ? (
                    <Field
                      label="Hero subheadline"
                      value={draft.heroSubheadline}
                      editing
                      multiline
                      onChange={(heroSubheadline) => patch({ heroSubheadline })}
                    />
                  ) : (
                    data.heroSubheadline
                  )}
                </p>

                <div className="mt-9 flex flex-wrap gap-3">
                  <a
                    href="#contact"
                    className="pearzen-btn-primary group inline-flex items-center gap-2 rounded-2xl px-7 py-3.5 text-sm font-bold uppercase tracking-wider"
                  >
                    {data.heroCtaPrimary}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>
                  <a
                    href="#platform"
                    className="pearzen-btn-secondary inline-flex items-center gap-2 rounded-2xl px-7 py-3.5 text-sm font-bold uppercase tracking-wider"
                  >
                    {data.heroCtaSecondary}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {!editing ? (
          <a
            href="#platform"
            className="pearzen-scroll-indicator absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2 text-[var(--pearzen-text-muted-dark)] transition-colors hover:text-[var(--pearzen-cyan-bright)]"
            aria-label="Scroll to content"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.3em]">Explore</span>
            <ChevronDown className="h-5 w-5" />
          </a>
        ) : null}
      </section>
    </>
  );
}
