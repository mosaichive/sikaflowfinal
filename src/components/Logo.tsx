import { Link } from "@tanstack/react-router";

export function Logo({ className = "", showTagline = true }: { className?: string; showTagline?: boolean }) {
  return (
    <Link to="/" className={`inline-flex items-center gap-3 ${className}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
        <span className="text-lg" aria-hidden>💸</span>
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-semibold tracking-tight text-foreground">SikaFlow</span>
        {showTagline && (
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Sales tally system
          </span>
        )}
      </span>
    </Link>
  );
}
