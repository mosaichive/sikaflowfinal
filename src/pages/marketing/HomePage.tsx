
import { useLocation } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import { HeroSection } from '@/components/marketing/sections/HeroSection';
import { FeaturesSection } from '@/components/marketing/sections/FeaturesSection';
import { ProblemSection } from '@/components/marketing/sections/ProblemSection';
import { DashboardShowcase } from '@/components/marketing/sections/DashboardShowcase';
import { ReviewsSection } from '@/components/marketing/sections/ReviewsSection';
import { AdvertiseSection } from '@/components/marketing/sections/AdvertiseSection';
import { FaqSection } from '@/components/marketing/sections/FaqSection';
import { CtaSection } from '@/components/marketing/sections/CtaSection';
import { FeedbackSection } from '@/components/marketing/sections/FeedbackSection';
import { getMarketingSeo } from '@/lib/seo';

export default function MarketingHome() {
  const location = useLocation();
  const seo = getMarketingSeo(location.pathname);

  return (
    <>
      <SEO {...seo} />
      <h1 className="sr-only">KudiTrack — Track Sales, Control Stock, Know Your Money</h1>
      <HeroSection />
      <FeaturesSection />
      <ProblemSection />
      <DashboardShowcase />
      <ReviewsSection />
      <AdvertiseSection />
      <FaqSection />
      <CtaSection />
      <FeedbackSection />
    </>
  );
}
