import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // The Lovable auth broker is only bundled when explicitly selected.
  // Any other build (external Supabase / Vercel) gets an inert stub, so no
  // Lovable authentication dependency ships to production.
  const useLovableAuth =
    (process.env.VITE_AUTH_PROVIDER ?? (mode === "development" ? "lovable" : "")).toLowerCase() ===
    "lovable";

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        ...(useLovableAuth
          ? {}
          : {
              "@lovable.dev/cloud-auth-js": path.resolve(
                __dirname,
                "./src/integrations/lovable/cloud-auth-stub.ts",
              ),
            }),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});

