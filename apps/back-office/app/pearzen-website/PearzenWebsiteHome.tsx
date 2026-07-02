'use client';

import {
  ArrowRight,
  Code2,
  Layout,
  Sparkles,
  Users,
} from 'lucide-react';

import PearzenHeroSection from './components/PearzenHeroSection';
import PearzenScrollReveal from './components/PearzenScrollReveal';
import { Field, usePearzenWebsiteEdit } from './components/PearzenWebsiteEditProvider';
import { usePearzenWebsite } from './components/PearzenWebsiteContext';

const PLATFORM_ICONS = [Users, Code2, Layout, Sparkles];

function PearzenWebsiteHomeInner() {
  const { content } = usePearzenWebsite();
  const {
    editing,
    draft,
    patch,
    patchStat,
    patchPlatformBullet,
  } = usePearzenWebsiteEdit();
  const data = editing ? draft : content;

  return (
    <>
      <PearzenHeroSection data={data} editing={editing} draft={draft} patch={patch} />

      <section id="platform" className="pearzen-section-light relative z-20 scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
          <PearzenScrollReveal>
            <p className="pearzen-section-label">Engineering</p>
            <h2 className="pearzen-section-title max-w-3xl">
              {editing ? (
                <Field
                  label="Platform title"
                  value={draft.platformTitle}
                  editing
                  onChange={(platformTitle) => patch({ platformTitle })}
                />
              ) : (
                data.platformTitle
              )}
            </h2>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[var(--pearzen-navy-muted)] md:text-lg">
              {editing ? (
                <Field
                  label="Platform body"
                  value={draft.platformBody}
                  editing
                  onChange={(platformBody) => patch({ platformBody })}
                  multiline
                />
              ) : (
                data.platformBody
              )}
            </p>
          </PearzenScrollReveal>
          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {data.platformBullets.map((item, index) => {
              const Icon = PLATFORM_ICONS[index % PLATFORM_ICONS.length];
              const pillar = data.stats[index];
              const isGold = index % 2 === 0;
              return (
                <PearzenScrollReveal key={index} delay={index * 70} variant="up">
                  <article className="pearzen-glass-card flex h-full flex-col rounded-2xl p-6 md:p-7">
                    <div className="flex items-start gap-4">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                          isGold ? 'pearzen-icon-tile-gold' : 'pearzen-icon-tile'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--pearzen-navy-muted)]">
                          {editing ? (
                            <Field
                              label={`Pillar ${index + 1} label`}
                              value={draft.stats[index]?.label ?? ''}
                              editing
                              onChange={(value) => patchStat(index, 'label', value)}
                            />
                          ) : (
                            pillar?.label ?? `Pillar ${index + 1}`
                          )}
                        </p>
                        <h3 className="mt-1 text-base font-bold uppercase tracking-tight text-[var(--pearzen-navy-deep)]">
                          {editing ? (
                            <Field
                              label={`Pillar ${index + 1} name`}
                              value={draft.stats[index]?.value ?? ''}
                              editing
                              onChange={(value) => patchStat(index, 'value', value)}
                            />
                          ) : (
                            pillar?.value ?? `Pillar ${index + 1}`
                          )}
                        </h3>
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-[var(--pearzen-navy-muted)]">
                      {editing ? (
                        <Field
                          label={`Pillar ${index + 1} engineering focus`}
                          value={draft.platformBullets[index] ?? ''}
                          editing
                          onChange={(value) => patchPlatformBullet(index, value)}
                          multiline
                        />
                      ) : (
                        item
                      )}
                    </p>
                  </article>
                </PearzenScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      <section id="contact" className="pearzen-section-contact relative z-20 scroll-mt-28">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
          <PearzenScrollReveal variant="scale">
            <div className="pearzen-contact-card relative overflow-hidden rounded-[2rem] border border-[var(--pearzen-cyan)]/25 bg-gradient-to-br from-[var(--pearzen-navy)] via-[var(--pearzen-midnight)] to-[var(--pearzen-ink)] p-8 shadow-[0_40px_80px_-32px_rgb(0_0_0_/0.6)] md:p-14">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--pearzen-gold)]/15 blur-3xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-white/5 blur-2xl"
              aria-hidden
            />
            <div className="relative">
            <p className="pearzen-section-label">
              Contact
            </p>
            <h2 className="pearzen-section-title mt-4">
              {editing ? (
                <Field
                  label="Contact headline"
                  value={draft.contactHeadline}
                  editing
                  onChange={(contactHeadline) => patch({ contactHeadline })}
                />
              ) : (
                data.contactHeadline
              )}
            </h2>
            <p className="pearzen-contact-body mt-4 max-w-xl text-base leading-relaxed">
              {editing ? (
                <Field
                  label="Contact body"
                  value={draft.contactBody}
                  editing
                  onChange={(contactBody) => patch({ contactBody })}
                  multiline
                />
              ) : (
                data.contactBody
              )}
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <a
                href={`mailto:${data.contactEmail}`}
                className="pearzen-btn-primary inline-flex items-center gap-2 rounded-2xl px-7 py-3.5 text-sm font-bold uppercase tracking-wider"
              >
                {editing ? (
                  <Field
                    label="Contact email"
                    value={draft.contactEmail}
                    editing
                    onChange={(contactEmail) => patch({ contactEmail })}
                  />
                ) : (
                  data.contactEmail
                )}
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
            </div>
            </div>
          </PearzenScrollReveal>
        </div>
      </section>
    </>
  );
}

export default function PearzenWebsiteHome() {
  return <PearzenWebsiteHomeInner />;
}
