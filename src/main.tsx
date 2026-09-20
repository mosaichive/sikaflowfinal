import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { InstallPrompt } from "./components/InstallPrompt";
import { registerSW } from "virtual:pwa-register";

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    if (navigator.onLine) void registration.update();
    window.setInterval(() => {
      if (navigator.onLine) void registration.update();
    }, 60 * 60 * 1000);
  },
  onRegisterError(error) {
    console.error("[offline] service worker registration failed", error);
  },
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <HelmetProvider>
      <App />
      <InstallPrompt />
    </HelmetProvider>
  </ErrorBoundary>
);
