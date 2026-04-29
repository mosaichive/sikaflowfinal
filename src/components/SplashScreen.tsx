import { useEffect, useState } from "react";
import logo from "@/assets/sikaflow-logo.png";

/**
 * Branded splash screen — fintech style.
 * - Centered logo with fade-in + subtle scale animation
 * - Background follows the app theme (`bg-background`)
 * - Slim progress bar below the logo
 * - Smooth fade-out on dismiss
 */
export function SplashScreen({ minDurationMs = 1100 }: { minDurationMs?: number }) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), minDurationMs);
    const removeTimer = setTimeout(() => setVisible(false), minDurationMs + 500);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [minDurationMs]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Soft radial glow behind the logo */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_45%,color-mix(in_oklab,var(--color-primary,theme(colors.primary.DEFAULT))_18%,transparent)_0%,transparent_70%)]" />

      <div className="relative flex flex-col items-center">
        <div className="splash-logo flex h-28 w-28 items-center justify-center rounded-3xl bg-card/60 p-4 shadow-[0_20px_60px_-20px_color-mix(in_oklab,black_45%,transparent)] ring-1 ring-border/60 backdrop-blur-sm sm:h-32 sm:w-32">
          <img
            src={logo}
            alt="SikaFlow"
            className="h-full w-full object-contain"
            draggable={false}
          />
        </div>

        <p className="splash-wordmark mt-5 text-base font-semibold tracking-tight text-foreground sm:text-lg">
          SikaFlow
        </p>
        <p className="splash-tag mt-0.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Sales · Inventory · Insights
        </p>

        {/* Slim indeterminate progress bar */}
        <div className="splash-bar mt-6 h-[3px] w-40 overflow-hidden rounded-full bg-muted">
          <div className="splash-bar-fill h-full w-1/3 rounded-full bg-primary" />
        </div>
      </div>

      <style>{`
        @keyframes splashIn {
          0%   { opacity: 0; transform: scale(0.94); }
          60%  { opacity: 1; transform: scale(1.02); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splashFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
        @keyframes splashSlide {
          0%   { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        @keyframes splashFade {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .splash-logo {
          animation:
            splashIn 700ms cubic-bezier(.22,.9,.32,1) both,
            splashFloat 4s ease-in-out 800ms infinite;
        }
        .splash-wordmark { animation: splashFade 600ms ease-out 350ms both; }
        .splash-tag       { animation: splashFade 600ms ease-out 500ms both; }
        .splash-bar       { animation: splashFade 600ms ease-out 650ms both; }
        .splash-bar-fill  { animation: splashSlide 1.2s cubic-bezier(.4,0,.2,1) infinite; }
      `}</style>
    </div>
  );
}
