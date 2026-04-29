import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, Sparkles, Building2, Phone, UserCog,
  Tag, Users, MapPin, Check, PartyPopper,
} from "lucide-react";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up your business — SikaFlow" }] }),
  component: OnboardingPage,
});

type Form = {
  business_name: string;
  phone: string;
  role: string;
  business_type: string;
  num_employees: string;
  location: string;
};

const STORAGE_KEY = "sikaflow_onboarding_draft";

const ROLES = ["Owner", "Manager", "Staff"];
const INDUSTRIES = ["Retail Shop", "Restaurant / Food", "Salon / Beauty", "Wholesale", "Services", "Other"];
const SIZES = ["Just me", "2–5", "6–20", "21–50", "50+"];

function OnboardingPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>({
    business_name: "",
    phone: "",
    role: "",
    business_type: "",
    num_employees: "",
    location: "",
  });

  // Auth gate + load existing profile / draft
  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/register" }); return; }
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("business_name, phone, role, business_type, num_employees, location, onboarding_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (data?.onboarding_completed) { navigate({ to: "/dashboard" }); return; }
      const draft = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      const parsed = draft ? (JSON.parse(draft) as Partial<Form>) : {};
      setForm((f) => ({
        ...f,
        business_name: data?.business_name ?? parsed.business_name ?? "",
        phone: data?.phone ?? parsed.phone ?? "",
        role: data?.role ?? parsed.role ?? "",
        business_type: data?.business_type ?? parsed.business_type ?? "",
        num_employees: data?.num_employees ?? parsed.num_employees ?? "",
        location: data?.location ?? parsed.location ?? "",
      }));
    })();
  }, [user, loading, navigate]);

  // Auto-save draft
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    }
  }, [form]);

  const steps = useMemo(() => [
    { kind: "welcome" as const },
    { kind: "field" as const, key: "business_name", icon: Building2, title: "What's your business name?", subtitle: "This is what we'll show across your dashboard.", placeholder: "e.g. Adwoa's Boutique" },
    { kind: "field" as const, key: "phone", icon: Phone, title: "Best phone number to reach you?", subtitle: "We'll only use it for important account updates.", placeholder: "+233 ..." },
    { kind: "choice" as const, key: "role", icon: UserCog, title: "What's your role?", subtitle: "Helps us tailor your experience.", options: ROLES },
    { kind: "choice" as const, key: "business_type", icon: Tag, title: "What type of business?", subtitle: "Pick the closest match.", options: INDUSTRIES },
    { kind: "choice" as const, key: "num_employees", icon: Users, title: "How many people work with you?", subtitle: "Including yourself.", options: SIZES },
    { kind: "field" as const, key: "location", icon: MapPin, title: "Where are you located?", subtitle: "City, region, or country — whatever feels right.", placeholder: "e.g. Accra, Ghana" },
    { kind: "summary" as const },
  ], []);

  const totalUserSteps = steps.length - 1; // excluding welcome
  const progressIndex = Math.max(0, step); // 0..steps.length-1

  function next() {
    if (step < steps.length - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }
  function back() {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    }
  }

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function finish() {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      email: user.email,
      business_name: form.business_name,
      phone: form.phone,
      role: form.role,
      business_type: form.business_type,
      num_employees: form.num_employees,
      location: form.location,
      onboarding_completed: true,
    }, { onConflict: "id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    if (typeof window !== "undefined") window.localStorage.removeItem(STORAGE_KEY);
    toast.success("You're all set! Welcome to SikaFlow.");
    navigate({ to: "/dashboard" });
  }

  const current = steps[step];
  const animClass = direction === 1 ? "animate-slide-in-right" : "animate-slide-in-left";

  // Validation per step
  const canAdvance = (() => {
    if (current.kind === "welcome" || current.kind === "summary") return true;
    const v = form[current.key as keyof Form];
    return v.trim().length > 0;
  })();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-soft">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-6 py-5">
        <Logo />
        {step > 0 && step < steps.length && (
          <span className="text-sm text-muted-foreground">
            Step {step} of {totalUserSteps}
          </span>
        )}
      </header>

      {/* Progress bar */}
      <div className="mx-auto w-full max-w-3xl px-6">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all duration-500"
            style={{ width: `${((progressIndex) / (steps.length - 1)) * 100}%` }}
          />
        </div>
      </div>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div key={step} className={`w-full max-w-xl ${animClass}`}>
          <div className="rounded-3xl border border-border bg-card p-8 shadow-elegant sm:p-10">
            {current.kind === "welcome" && (
              <div className="text-center">
                <span className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
                  <Sparkles className="h-7 w-7 text-primary-foreground" />
                </span>
                <h1 className="mt-6 text-3xl font-semibold tracking-tight">Let's set up your business</h1>
                <p className="mt-3 text-muted-foreground">
                  Just a few quick questions — takes under a minute. Your{" "}
                  <span className="font-medium text-foreground">30-day free trial</span> is already active.
                </p>
                <Button onClick={next} size="lg" className="mt-8 w-full bg-gradient-primary shadow-glow sm:w-auto">
                  Get Started <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}

            {current.kind === "field" && (
              <FieldStep
                icon={current.icon}
                title={current.title}
                subtitle={current.subtitle}
                placeholder={current.placeholder}
                value={form[current.key as keyof Form]}
                onChange={(v) => update(current.key as keyof Form, v)}
                onSubmit={() => canAdvance && next()}
              />
            )}

            {current.kind === "choice" && (
              <ChoiceStep
                icon={current.icon}
                title={current.title}
                subtitle={current.subtitle}
                options={current.options}
                value={form[current.key as keyof Form]}
                onChange={(v) => {
                  update(current.key as keyof Form, v);
                  // auto advance after a short beat
                  setTimeout(() => { setDirection(1); setStep((s) => Math.min(s + 1, steps.length - 1)); }, 220);
                }}
              />
            )}

            {current.kind === "summary" && (
              <SummaryStep form={form} onEdit={(i) => { setDirection(-1); setStep(i); }} />
            )}

            {/* Nav buttons */}
            {current.kind !== "welcome" && (
              <div className="mt-8 flex items-center justify-between gap-3">
                <Button variant="ghost" onClick={back} disabled={step === 0}>
                  <ArrowLeft className="mr-1 h-4 w-4" /> Back
                </Button>
                {current.kind === "summary" ? (
                  <Button onClick={finish} disabled={saving} className="bg-gradient-primary shadow-glow">
                    {saving ? "Saving..." : (<>Finish <Check className="ml-1 h-4 w-4" /></>)}
                  </Button>
                ) : current.kind === "choice" ? (
                  <span className="text-xs text-muted-foreground">Pick one to continue</span>
                ) : (
                  <Button onClick={next} disabled={!canAdvance} className="bg-gradient-primary shadow-glow">
                    Next <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function FieldStep({
  icon: Icon, title, subtitle, placeholder, value, onChange, onSubmit,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; subtitle: string; placeholder: string;
  value: string; onChange: (v: string) => void; onSubmit: () => void;
}) {
  return (
    <div>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="mt-6">
        <Label htmlFor="field" className="sr-only">{title}</Label>
        <Input
          id="field"
          autoFocus
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 text-base"
        />
      </form>
    </div>
  );
}

function ChoiceStep({
  icon: Icon, title, subtitle, options, value, onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string; subtitle: string; options: string[];
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {options.map((opt) => {
          const selected = value === opt;
          return (
            <button
              type="button"
              key={opt}
              onClick={() => onChange(opt)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all hover:-translate-y-0.5 ${
                selected
                  ? "border-primary bg-primary/10 text-primary shadow-glow"
                  : "border-border bg-card hover:border-primary/40"
              }`}
            >
              <span>{opt}</span>
              {selected && <Check className="h-4 w-4" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SummaryStep({ form, onEdit }: { form: Form; onEdit: (stepIndex: number) => void }) {
  const rows: { label: string; value: string; stepIndex: number }[] = [
    { label: "Business name", value: form.business_name, stepIndex: 1 },
    { label: "Phone", value: form.phone, stepIndex: 2 },
    { label: "Role", value: form.role, stepIndex: 3 },
    { label: "Business type", value: form.business_type, stepIndex: 4 },
    { label: "Team size", value: form.num_employees, stepIndex: 5 },
    { label: "Location", value: form.location, stepIndex: 6 },
  ];
  return (
    <div>
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
        <PartyPopper className="h-6 w-6" />
      </span>
      <h2 className="mt-5 text-2xl font-semibold tracking-tight">Looks good?</h2>
      <p className="mt-1 text-sm text-muted-foreground">Quick check — you can edit anything before we save.</p>
      <ul className="mt-6 divide-y divide-border rounded-2xl border border-border bg-background/40">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</p>
              <p className="truncate text-sm font-medium">{r.value || <span className="text-muted-foreground">Not set</span>}</p>
            </div>
            <button onClick={() => onEdit(r.stepIndex)} className="text-xs font-medium text-primary hover:underline">
              Edit
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
