import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SikaFlow — Simple sales tally for daily business" },
      { name: "description", content: "Track sales, stock, and expenses in one calm dashboard. Sign in or start a 30-day free trial." },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    if (tab === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (error) return toast.error(error.message);
      toast.success("Welcome back!");
      navigate({ to: "/dashboard" });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/onboarding` },
      });
      setSubmitting(false);
      if (error) return toast.error(error.message);
      toast.success("Account created — let's set up your business.");
      navigate({ to: "/onboarding" });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-12 px-6 py-10 lg:grid-cols-2 lg:gap-16">
        {/* Left: pitch */}
        <section className="animate-fade-up">
          <Logo />
          <p className="mt-10 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Business workspace
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
            Simple sales, stock, and cash control for daily business.
          </h1>
          <p className="mt-5 max-w-md text-base text-muted-foreground">
            Sign in or start a 30-day trial. Pricing stays out of setup so you can get to the dashboard first.
          </p>

          <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Track daily sales, profit, and stock in real time
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Add products during setup and start selling immediately
            </li>
            <li className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Works on mobile, tablet, and desktop
            </li>
          </ul>
        </section>

        {/* Right: auth card */}
        <section className="animate-scale-in">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-elegant sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              {tab === "signin" ? "Welcome back" : "Get started"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {tab === "signin" ? "Sign in to SikaFlow" : "Create your SikaFlow account"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tab === "signin"
                ? "Use your existing business account to continue."
                : "30-day free trial. No card. No pricing during setup."}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm font-medium">
              <button
                type="button"
                onClick={() => setTab("signin")}
                className={`rounded-lg px-3 py-2 transition-all ${
                  tab === "signin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => setTab("signup")}
                className={`rounded-lg px-3 py-2 transition-all ${
                  tab === "signup" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                Sign up
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@business.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={tab === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-primary hover:bg-primary/90"
                size="lg"
              >
                {submitting ? (tab === "signin" ? "Signing in..." : "Creating account...") : (tab === "signin" ? "Sign in" : "Create account")}
              </Button>
            </form>

            <p className="mt-5 text-center text-xs text-muted-foreground">
              By continuing you agree to our terms and privacy policy.
            </p>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Prefer dedicated pages?{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
            {" · "}
            <Link to="/register" className="font-medium text-primary hover:underline">Sign up</Link>
          </p>
        </section>
      </div>
    </div>
  );
}
