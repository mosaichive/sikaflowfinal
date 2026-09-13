export const SITE_URL = 'https://kuditrack.online';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/kuditrack-demo-poster.png`;
export const DEFAULT_KEYWORDS = [
  'kudi track',
  'kuditrack',
  'sales tracker',
  'inventory tracker',
  'expense tracker',
  'stock management',
  'profit tracker',
  'cash flow tracker',
  'business money tracker',
  'small business app Ghana',
  'African business app',
].join(', ');

export type PageSeo = {
  title: string;
  description: string;
  path: string;
  image?: string;
  keywords?: string;
  noindex?: boolean;
};

export const DEFAULT_SEO: PageSeo = {
  title: 'KudiTrack | Sales, Inventory & Expense Tracker for African Businesses',
  description:
    'KudiTrack helps African small businesses track daily sales, stock, expenses, profit, savings and cash flow from one mobile-first dashboard.',
  path: '/',
  image: DEFAULT_OG_IMAGE,
  keywords: DEFAULT_KEYWORDS,
};

export const MARKETING_SEO: Record<string, PageSeo> = {
  '/': DEFAULT_SEO,
  '/features': {
    title: 'KudiTrack Features | Sales, Stock, Expenses & Profit Tracking',
    description:
      'Explore KudiTrack features for sales tracking, inventory management, expense logging, staff permissions, reports and real-time business analytics.',
    path: '/features',
  },
  '/reviews': {
    title: 'KudiTrack Reviews | Built for African Business Owners',
    description:
      'See why shop owners, distributors and growing teams use KudiTrack to understand sales, inventory, expenses, profit and cash flow.',
    path: '/reviews',
  },
  '/advertise': {
    title: 'Advertise on KudiTrack | Reach African Business Owners',
    description:
      'Promote your products and services to active African business owners using KudiTrack for sales, inventory and cash-flow management.',
    path: '/advertise',
  },
  '/contact': {
    title: 'Contact KudiTrack | Product Demo and Business Support',
    description:
      'Contact KudiTrack for product questions, business support, demos, feedback and help getting started with sales and inventory tracking.',
    path: '/contact',
  },
  '/feedback': {
    title: 'KudiTrack Feedback | Share Ideas and Product Requests',
    description:
      'Share feedback with the KudiTrack team and help improve the business dashboard for shops, distributors and growing teams.',
    path: '/feedback',
  },
  '/refund-policy': {
    title: 'Refund Policy | KudiTrack',
    description:
      'KudiTrack Refund Policy — learn when subscription refunds are eligible, how to request one, and how long processing takes.',
    path: '/refund-policy',
  },
  '/terms-of-service': {
    title: 'Terms of Service | KudiTrack',
    description:
      'Read the KudiTrack Terms of Service governing use of our sales, inventory, and business management platform.',
    path: '/terms-of-service',
  },
  '/privacy-policy': {
    title: 'Privacy Policy | KudiTrack',
    description:
      'Learn how KudiTrack collects, uses, and protects your personal and business information.',
    path: '/privacy-policy',
  },
};

export function absoluteUrl(path = '/') {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalized === '/' ? '/' : normalized}`;
}

export function getMarketingSeo(pathname: string): PageSeo {
  return MARKETING_SEO[pathname] || DEFAULT_SEO;
}
