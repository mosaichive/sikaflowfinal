import {
  LayoutDashboard, ShoppingCart, Package, Boxes, Users, ClipboardList,
  PiggyBank, Receipt, BarChart3, UserCog, Megaphone, Settings,
} from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
};

export const navItems: NavItem[] = [
  { to: "/dashboard",     label: "Dashboard",     short: "Home",    icon: LayoutDashboard },
  { to: "/sales",         label: "Sales / POS",   short: "Sales",   icon: ShoppingCart },
  { to: "/products",      label: "Products",      short: "Items",   icon: Package },
  { to: "/inventory",     label: "Inventory",     short: "Stock",   icon: Boxes },
  { to: "/customers",     label: "Customers",     short: "People",  icon: Users },
  { to: "/orders",        label: "Orders",        short: "Orders",  icon: ClipboardList },
  { to: "/income",        label: "Other Income",  short: "Income",  icon: PiggyBank },
  { to: "/expenses",      label: "Expenses",      short: "Costs",   icon: Receipt },
  { to: "/reports",       label: "Reports",       short: "Reports", icon: BarChart3 },
  { to: "/staff",         label: "Staff / Users", short: "Staff",   icon: UserCog },
  { to: "/announcements", label: "Announcements", short: "News",    icon: Megaphone },
  { to: "/settings",      label: "Settings",      short: "More",    icon: Settings },
];
