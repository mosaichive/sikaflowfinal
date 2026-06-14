/** Flat backdrop helpers. Glow/blob effects have been removed app-wide for
 *  a cleaner enterprise SaaS look. These components now render nothing and are
 *  kept so existing imports don't break. */
export function GradientBlobs({ className = '' }: { className?: string }) {
  return <div className={`absolute inset-0 pointer-events-none ${className}`} aria-hidden="true" />;
}

export function GridBackdrop({ className = '' }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none opacity-[0.05] ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.3) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }}
      aria-hidden="true"
    />
  );
}
