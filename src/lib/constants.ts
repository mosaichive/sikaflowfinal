export const CURRENCIES = [
  { code: "GHS", label: "Ghanaian Cedi (GHS)" },
  { code: "NGN", label: "Nigerian Naira (NGN)" },
  { code: "USD", label: "US Dollar (USD)" },
  { code: "EUR", label: "Euro (EUR)" },
  { code: "GBP", label: "British Pound (GBP)" },
  { code: "KES", label: "Kenyan Shilling (KES)" },
  { code: "ZAR", label: "South African Rand (ZAR)" },
  { code: "XOF", label: "West African CFA (XOF)" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const STAFF_PERMISSIONS = [
  { key: "sales", label: "Record sales / POS" },
  { key: "products", label: "Manage products" },
  { key: "inventory", label: "Manage inventory" },
  { key: "customers", label: "Manage customers" },
  { key: "orders", label: "Manage orders" },
  { key: "expenses", label: "Manage expenses" },
  { key: "income", label: "Manage other income" },
  { key: "reports", label: "View reports" },
] as const;

export type PermissionKey = (typeof STAFF_PERMISSIONS)[number]["key"];
export type PermissionMap = Partial<Record<PermissionKey, boolean>>;
