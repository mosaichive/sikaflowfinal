import { Helmet } from 'react-helmet-async';
import { HeroSection } from '@/components/marketing/sections/HeroSection';
import { FeaturesSection } from '@/components/marketing/sections/FeaturesSection';
import { ProblemSection } from '@/components/marketing/sections/ProblemSection';
import { DashboardShowcase } from '@/components/marketing/sections/DashboardShowcase';
import { ReviewsSection } from '@/components/marketing/sections/ReviewsSection';
import { AdvertiseSection } from '@/components/marketing/sections/AdvertiseSection';
import { PricingSection } from '@/components/marketing/sections/PricingSection';
import { FaqSection } from '@/components/marketing/sections/FaqSection';
import { CtaSection } from '@/components/marketing/sections/CtaSection';
import { FeedbackSection } from '@/components/marketing/sections/FeedbackSection';

export default function MarketingHome() {
  return (
    <>
      <h1 className="sr-only">KudiTrack — Track Sales, Control Stock, Know Your Money</h1>
      <HeroSection />
      <FeaturesSection />
      <ProblemSection />
      <DashboardShowcase />
      <ReviewsSection />
      <AdvertiseSection />
      <PricingSection />
      <FaqSection />
      <CtaSection />
      <FeedbackSection />
    </>
  );
}
