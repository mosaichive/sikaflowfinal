import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/lib/auth";
import { ArrowRight, BarChart3, Boxes, Receipt, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SikaFlow — Simple sales tally for growing businesses" },
      { name: "description", content: "Track sales, inventory, and expenses in one clean dashboard. Start your 30-day free trial — no credit card required." },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-soft">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-2">
          <Link to="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link to="/register">
            <Button size="sm" className="bg-gradient-primary shadow-glow">Get started</Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-10 pb-24">
        <section className="mx-auto max-w-3xl text-center animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            30-day free trial · No card required
          </span>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            The simple way to <span className="bg-gradient-primary bg-clip-text text-transparent">tally your sales</span>
          </h1>
          <p className="mt-5 text-lg text-muted-foreground">
            SikaFlow gives small businesses one calm place to record sales, watch
            inventory, and stay on top of expenses — without the spreadsheet headache.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/register">
              <Button size="lg" className="bg-gradient-primary shadow-glow">
                Start free trial <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="outline">I already have an account</Button>
            </Link>
          </div>
        </section>

        <section className="mt-20 grid gap-5 sm:grid-cols-3">
          {[
            { icon: BarChart3, title: "Daily sales at a glance", body: "See today's revenue, top items, and trends in real time." },
            { icon: Boxes, title: "Inventory you can trust", body: "Know what's in stock, what's low, and what to reorder." },
            { icon: Receipt, title: "Expenses, organized", body: "Log expenses in seconds and keep your books tidy." },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-elegant">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
