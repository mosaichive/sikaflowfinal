import { useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Users, Receipt, BarChart3, Settings, LogOut, Moon, Sun, Megaphone, ClipboardList, Banknote, Shield, PiggyBank, LifeBuoy, ChevronDown, User, DollarSign, Landmark, FileClock
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '@/context/AuthContext';
import { useBusiness } from '@/context/BusinessContext';
import { useTheme } from '@/hooks/useTheme';
import { Logo } from '@/components/Logo';
import type { ModuleKey } from '@/lib/permissions';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter, useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

const allItems: { title: string; url: string; icon: any; module: ModuleKey }[] = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { title: 'Sales / POS', url: '/sales', icon: ShoppingCart, module: 'sales' },
  { title: 'Products', url: '/products', icon: Package, module: 'products' },
  { title: 'Inventory', url: '/inventory', icon: Boxes, module: 'inventory' },
  { title: 'Customers', url: '/customers', icon: Users, module: 'customers' },
  { title: 'Orders', url: '/orders', icon: ClipboardList, module: 'orders' },
  { title: 'Other Income', url: '/other-income', icon: Banknote, module: 'other_income' },
  { title: 'Expenses', url: '/expenses', icon: Receipt, module: 'expenses' },
  { title: 'Savings', url: '/savings', icon: PiggyBank, module: 'savings' },
  { title: 'Reports', url: '/reports', icon: BarChart3, module: 'reports' },
  { title: 'Staff / Users', url: '/staff', icon: Shield, module: 'staff' },
  { title: 'Announcements', url: '/announcements', icon: Megaphone, module: 'announcements' },
  { title: 'Support', url: '/support', icon: LifeBuoy, module: 'dashboard' },
  { title: 'Settings', url: '/settings', icon: Settings, module: 'settings' },
];
const settingsSubItems: { title: string; section: string; icon: any }[] = [
  { title: 'Profile', section: 'profile', icon: User },
  { title: 'Sales Settings', section: 'sales', icon: DollarSign },
  { title: 'Bank', section: 'bank', icon: Landmark },
  { title: 'Audit Log', section: 'audit', icon: FileClock },
];



export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { displayName, avatarUrl, profileTitle, signOut, hasModule } = useAuth();
  const { business } = useBusiness();
  const { isDark, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const onSettings = location.pathname.startsWith('/settings');
  const currentSection = new URLSearchParams(location.search).get('s') || '';
  const [settingsOpen, setSettingsOpen] = useState(onSettings);


  const items = allItems.filter((item) => hasModule(item.module));

  const tenantName = business?.name || 'KudiTrack';

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className="p-4 flex items-center gap-3">
        <Logo className="w-9 h-9 object-contain shrink-0" />
        {!collapsed && (
          <div>
            <h2 className="text-base font-bold text-foreground tracking-tight">{tenantName}</h2>
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest">KudiTrack</p>
          </div>
        )}
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
            {!collapsed && 'Menu'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                if (item.url === '/settings') {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        onClick={() => {
                          if (collapsed) {
                            navigate('/settings');
                          } else {
                            setSettingsOpen((o) => !o);
                          }
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:text-foreground hover:bg-secondary transition-all duration-200 ${onSettings ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'}`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 text-left">{item.title}</span>
                            <ChevronDown className={`h-4 w-4 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                          </>
                        )}
                      </SidebarMenuButton>
                      {!collapsed && settingsOpen && (
                        <div className="mt-1 ml-7 flex flex-col gap-0.5 border-l border-border/60 pl-2 animate-fade-in">
                          {settingsSubItems.map((sub) => {
                            const isActive = onSettings && currentSection === sub.section;
                            return (
                              <button
                                key={sub.section}
                                onClick={() => navigate(`/settings?s=${sub.section}`)}
                                className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors ${isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
                              >
                                <sub.icon className="h-3.5 w-3.5 shrink-0" />
                                <span>{sub.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </SidebarMenuItem>
                  );
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end={item.url === '/dashboard'}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all duration-200"
                        activeClassName="bg-primary/10 text-primary font-semibold"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>


      <SidebarFooter className="p-3 space-y-2">
        {!collapsed && (
          <>
            <button onClick={toggle} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
            <button onClick={signOut} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
              <Avatar className="h-8 w-8">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                <AvatarFallback className="bg-primary/20 text-primary text-xs font-semibold">
                  {displayName?.charAt(0)?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{displayName || 'User'}</p>
                {profileTitle && <p className="text-[10px] text-muted-foreground truncate">{profileTitle}</p>}
              </div>
            </div>
          </>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
