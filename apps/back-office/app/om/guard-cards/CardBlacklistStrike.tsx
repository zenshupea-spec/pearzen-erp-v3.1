/** Bold diagonal strike shown when a guard is blacklisted. */
export function CardBlacklistStrike() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      <div className="absolute left-1/2 top-1/2 h-[3px] w-[155%] -translate-x-1/2 -translate-y-1/2 -rotate-[26deg] bg-black" />
    </div>
  );
}
