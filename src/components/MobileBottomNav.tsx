import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, ShoppingCart, Boxes, MoreHorizontal, Users, BarChart3, CreditCard, Settings, LogOut, Moon, Sun, X, ClipboardList, Banknote, Megaphone, Shield, PiggyBank, AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/useTheme';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { ModuleKey } from '@/lib/permissions';
import { getMobileNavLayout } from '@/lib/mobile-nav';

const PRIMARY = [
  { to: '/dashboard', label: 'Home', icon: Home, module: 'dashboard' as ModuleKey, end: true },
  { to: '/sales', label: 'POS', icon: ShoppingCart, module: 'sales' as ModuleKey },
  { to: '/orders', label: 'Orders', icon: ClipboardList, module: 'orders' as ModuleKey },
  { to: '/inventory', label: 'Inventory', icon: Boxes, module: 'inventory' as ModuleKey },
];

const MORE_ITEMS = [
  { to: '/customers', label: 'Customers', icon: Users, module: 'customers' as ModuleKey },
  { to: '/products', label: 'Products', icon: Boxes, module: 'products' as ModuleKey },
  { to: '/damaged-goods', label: 'Damaged Goods', icon: AlertTriangle, module: 'damaged_goods' as ModuleKey },
  { to: '/other-income', label: 'Other Income', icon: Banknote, module: 'other_income' as ModuleKey },
  { to: '/expenses', label: 'Expenses', icon: CreditCard, module: 'expenses' as ModuleKey },
  { to: '/savings', label: 'Savings', icon: PiggyBank, module: 'savings' as ModuleKey },
  { to: '/reports', label: 'Reports', icon: BarChart3, module: 'reports' as ModuleKey },
  { to: '/staff', label: 'Staff / Users', icon: Shield, module: 'staff' as ModuleKey },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, module: 'announcements' as ModuleKey },
  { to: '/settings', label: 'Settings', icon: Settings, alwaysVisible: true },
];

const NAV_ITEMS = [...PRIMARY, ...MORE_ITEMS];
const MAX_DIRECT_NAV_ITEMS = 5;

export function MobileBottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const { displayName, avatarUrl, profileTitle, signOut, hasModule } = useAuth();
  const { isDark, toggle } = useTheme();

  const { primaryItems, overflowItems, showMore } = getMobileNavLayout(NAV_ITEMS, hasModule, MAX_DIRECT_NAV_ITEMS);
  const navColumnCount = primaryItems.length + (showMore ? 1 : 0);

  const go = (to: string) => {
    setMoreOpen(false);
    navigate(to);
  };

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-md"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary"
      >
        <ul
          className="grid h-16"
          style={{ gridTemplateColumns: `repeat(${Math.max(navColumnCount, 1)}, minmax(0, 1fr))` }}
        >
          {primaryItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={'end' in item ? item.end : undefined}
                className={({ isActive }) =>
                  `flex h-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex items-center justify-center h-8 w-12 rounded-xl transition-all ${isActive ? 'bg-primary/10' : ''}`}>
                      <item.icon className="h-5 w-5" />
                    </span>
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          {showMore ? (
            <li>
              <button
                onClick={() => setMoreOpen(true)}
                className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center justify-center h-8 w-12 rounded-xl">
                  <MoreHorizontal className="h-5 w-5" />
                </span>
                <span>More</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl border-t border-border pb-8 max-h-[85vh] overflow-y-auto">
          <SheetHeader className="text-left">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/20 text-primary text-sm font-semibold">
                  {displayName?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <SheetTitle className="text-base">{displayName || 'User'}</SheetTitle>
                {profileTitle && <p className="text-xs text-muted-foreground">{profileTitle}</p>}
              </div>
              <button onClick={() => setMoreOpen(false)} className="p-2 rounded-lg text-muted-foreground hover:bg-secondary" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
          </SheetHeader>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {overflowItems.map((item) => (
              <button
                key={item.to}
                onClick={() => go(item.to)}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-secondary/30 hover:bg-secondary p-3 transition-colors"
              >
                <span className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <item.icon className="h-5 w-5 text-primary" />
                </span>
                <span className="text-[11px] text-foreground text-center leading-tight">{item.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={toggle}
              className="flex items-center justify-center gap-2 rounded-xl border border-border bg-secondary/30 hover:bg-secondary py-3 text-sm text-foreground transition-colors"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {isDark ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              onClick={() => { setMoreOpen(false); signOut(); }}
              className="flex items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 hover:bg-destructive/20 py-3 text-sm text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
