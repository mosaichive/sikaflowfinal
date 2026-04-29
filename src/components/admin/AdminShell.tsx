import { type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LayoutDashboard, Users, CreditCard, Wallet, Megaphone, Shield, LogOut, Menu } from "lucide-react";

const adminItems = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/payment-methods", label: "Payment Methods", icon: Wallet },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/" });
  }

  const Links = () => (
    <ul className="space-y-1">
      {adminItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.to;
        return (
          <li key={item.to}>
            <Link
              to={item.to}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-border px-5">
          <Logo />
        </div>
        <div className="border-b border-border px-5 py-3">
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
            <Shield className="h-3.5 w-3.5" /> Super Admin
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4"><Links /></nav>
        <div className="border-t border-border p-3">
          <div className="flex items-center justify-between gap-2 px-1 pb-3">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-1 h-4 w-4" /> Sign out
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-background p-3 text-xs">
            <p className="font-medium text-foreground">{user?.email}</p>
            <p className="text-muted-foreground">Platform administrator</p>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-card/90 px-4 backdrop-blur md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <SheetTitle className="sr-only">Admin Menu</SheetTitle>
              <Logo />
            </SheetHeader>
            <nav className="px-3 py-4"><Links /></nav>
            <div className="border-t border-border p-3">
              <div className="flex items-center justify-between">
                <ThemeToggle />
                <Button variant="ghost" size="sm" onClick={handleSignOut}>
                  <LogOut className="mr-1 h-4 w-4" /> Sign out
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <Logo />
        <ThemeToggle />
      </header>

      <div className="md:pl-64">
        <main className="min-h-[calc(100vh-3.5rem)] md:min-h-screen">{children}</main>
      </div>
    </div>
  );
}
