import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { InstallPrompt } from "./components/InstallPrompt";
import { supabase } from "./integrations/supabase/client";
import { ensureReferralsSchema } from "./lib/referrals-schema-check";

// Startup check: make sure the referral columns the app depends on exist.
void ensureReferralsSchema();
supabase.auth.onAuthStateChange((event: string) => {
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    void ensureReferralsSchema();
  }
});


createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HelmetProvider>
      <App />
      <InstallPrompt />
    </HelmetProvider>
  </ErrorBoundary>
);
