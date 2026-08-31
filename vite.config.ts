import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => {
  // The Lovable auth broker is dropped from the bundle as soon as the build
  // opts into native Supabase Auth (VITE_AUTH_PROVIDER=supabase — the cutover
  // setting on Vercel). Current Lovable builds are unaffected.
  const useLovableAuth = (process.env.VITE_AUTH_PROVIDER ?? "").toLowerCase() !== "supabase";


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

