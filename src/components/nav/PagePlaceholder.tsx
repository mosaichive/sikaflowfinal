import { type ComponentType } from "react";

export function PagePlaceholder({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-primary">
          <Icon className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Coming soon</h2>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          We're putting the finishing touches on {title}. Check back shortly.
        </p>
      </div>
    </div>
  );
}
