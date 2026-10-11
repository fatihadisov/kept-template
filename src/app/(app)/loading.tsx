/**
 * Shown the instant a tab is tapped, while the page itself is being read from the database. Without it the
 * old page just sits there until the new one arrives, and the bottom bar feels dead.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse">
      <div className="mt-6 h-9 w-2/3 rounded-xl bg-ink/[0.07]" />
      <div className="mt-3 h-4 w-1/2 rounded-lg bg-ink/[0.05]" />
      <div className="mt-8 h-44 rounded-3xl bg-surface shadow-card ring-1 ring-line" />
      <div className="mt-4 h-28 rounded-3xl bg-surface shadow-card ring-1 ring-line" />
      <div className="mt-4 h-28 rounded-3xl bg-surface shadow-card ring-1 ring-line" />
    </div>
  );
}
