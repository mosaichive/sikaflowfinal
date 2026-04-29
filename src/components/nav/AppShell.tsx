import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LogOut, Menu, MoreHorizontal } from "lucide-react";
import { navItems, type NavItem } from "./nav-items";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

type Profile = { business_name: string | null; email?: string | null; logo_url?: string | null; avatar_url?: string | null };

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (!user) return;
    const load = () => supabase
      .from("profiles")
      .select("business_name, logo_url, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setProfile({
        business_name: data?.business_name ?? null,
        logo_url: data?.logo_url ?? null,
        avatar_url: data?.avatar_url ?? null,
        email: user.email,
      }));
    load();
    const ch = supabase.channel(`profile-${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  async function handleSignOut() {
    await signOut();
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop / Tablet sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card md:flex">
        <div className="flex h-16 items-center border-b border-border px-5">
          <Logo />
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <SidebarLinks items={navItems} />
        </nav>
        <SidebarFooter profile={profile} onSignOut={handleSignOut} />
      </aside>

      {/* Desktop top bar (with profile pill) */}
      <header className="sticky top-0 z-20 hidden h-14 items-center justify-end gap-3 border-b border-border bg-card/80 px-6 backdrop-blur md:flex md:pl-64">
        <ThemeToggle />
        <ProfilePill profile={profile} />
      </header>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border bg-card/90 px-4 backdrop-blur md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Logo />
            </SheetHeader>
            <nav className="px-3 py-4">
              <SidebarLinks items={navItems} />
            </nav>
            <SidebarFooter profile={profile} onSignOut={handleSignOut} />
          </SheetContent>
        </Sheet>
        <Logo />
        <ProfilePill profile={profile} compact />
      </header>

      {/* Main content */}
      <div className="md:pl-64">
        <main className="min-h-[calc(100vh-3.5rem)] pb-24 md:min-h-[calc(100vh-3.5rem)] md:pb-8">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <MobileBottomNav onSignOut={handleSignOut} profile={profile} />
    </div>
  );
}

function ProfilePill({ profile, compact = false }: { profile: Profile | null; compact?: boolean }) {
  const initials = getInitials(profile?.business_name || profile?.email || "U");
  return (
    <div className="flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1">
      {profile?.logo_url && (
        <img src={profile.logo_url} alt="Business logo" className="h-7 w-7 rounded-md object-contain" />
      )}
      {!compact && (
        <span className="hidden max-w-[140px] truncate text-sm font-medium sm:inline">
          {profile?.business_name || "Your business"}
        </span>
      )}
      <Avatar className="h-7 w-7">
        {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="Profile" />}
        <AvatarFallback className="bg-primary text-[10px] font-semibold text-primary-foreground">{initials}</AvatarFallback>
      </Avatar>
    </div>
  );
}

function getInitials(s: string) {
  return s.split(/[\s@.]+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function SidebarLinks({ items }: { items: NavItem[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.to || pathname.startsWith(item.to + "/");
        return (
          <li key={item.to}>
            <Link
              to={item.to}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className={`h-4.5 w-4.5 ${active ? "" : "text-muted-foreground group-hover:text-foreground"}`} />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function SidebarFooter({ profile, onSignOut }: { profile: Profile | null; onSignOut: () => void }) {
  const initials = (profile?.business_name || profile?.email || "U")
    .split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div className="border-t border-border p-3">
      <div className="flex items-center justify-between gap-2 px-1 pb-3">
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={onSignOut} className="text-muted-foreground hover:text-foreground">
          <LogOut className="mr-1 h-4 w-4" /> Sign out
        </Button>
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
        <Avatar className="h-9 w-9 shrink-0">
          {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="Profile" />}
          <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{profile?.business_name || "Your business"}</p>
          <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
        </div>
      </div>
    </div>
  );
}

function MobileBottomNav({ onSignOut, profile }: { onSignOut: () => void; profile: Profile | null }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const primary = navItems.slice(0, 4); // Dashboard, Sales, Products, Inventory
  const overflow = navItems.slice(4);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      aria-label="Bottom navigation"
    >
      {primary.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors ${
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span>{item.short}</span>
          </Link>
        );
      })}
      <Sheet>
        <SheetTrigger asChild>
          <button
            className="flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-muted-foreground hover:text-foreground"
            aria-label="More"
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl p-0">
          <SheetHeader className="border-b border-border px-5 py-4 text-left">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 p-4">
            {overflow.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background p-3 text-xs font-medium transition-colors ${
                    active ? "border-primary text-primary" : "text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-center">{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="border-t border-border p-4">
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-background p-3">
              <Avatar className="h-9 w-9 shrink-0">
                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="Profile" />}
                <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{getInitials(profile?.business_name || profile?.email || "U")}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{profile?.business_name || "Your business"}</p>
                <p className="truncate text-xs text-muted-foreground">{profile?.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <ThemeToggle />
              <Button variant="ghost" size="sm" onClick={onSignOut}>
                <LogOut className="mr-1 h-4 w-4" /> Sign out
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
