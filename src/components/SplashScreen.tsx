import { useEffect, useState } from "react";
import logo from "@/assets/sikaflow-logo.png";

/**
 * Splash screen shown briefly on first app load.
 * Centers the logo, fades in, then fades out smoothly.
 * Background follows the app theme via `bg-background`.
 */
export function SplashScreen({ minDurationMs = 900 }: { minDurationMs?: number }) {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), minDurationMs);
    const removeTimer = setTimeout(() => setVisible(false), minDurationMs + 450);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [minDurationMs]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <img
        src={logo}
        alt=""
        className="h-32 w-32 animate-[fade-in_0.6s_ease-out] object-contain sm:h-40 sm:w-40"
      />
    </div>
  );
}
