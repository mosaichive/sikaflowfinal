import { Link } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import { LegalPageLayout, LegalSection } from '@/components/marketing/LegalPageLayout';
import {
  Database,
  Settings2,
  Lock,
  Share2,
  Cookie,
  UserCheck,
  Baby,
  RefreshCcw,
  Mail,
} from 'lucide-react';

export const privacyIntro = (
  <p>
    At <span className="font-semibold text-white">KudiTrack</span>, we value your privacy. This
    policy explains what information we collect, how we use it, and the choices you have.
  </p>
);

export const privacySections: LegalSection[] = [
  {
    id: 'information',
    icon: Database,
    title: '1. Information We Collect',
    body: (
      <ul className="space-y-1.5">
        <li>Name</li>
        <li>Email</li>
        <li>Phone Number</li>
        <li>Business Information</li>
        <li>Transaction Records</li>
        <li>Inventory Data</li>
        <li>Device Information</li>
        <li>Browser Information</li>
        <li>Usage Analytics</li>
      </ul>
    ),
  },
  {
    id: 'use',
    icon: Settings2,
    title: '2. How We Use Information',
    body: (
      <ul className="space-y-1.5">
        <li>Provide platform services.</li>
        <li>Improve the application.</li>
        <li>Process subscriptions.</li>
        <li>Respond to support requests.</li>
        <li>Send security notifications.</li>
        <li>Prevent fraud.</li>
      </ul>
    ),
  },
  {
    id: 'security',
    icon: Lock,
    title: '3. Data Security',
    body: (
      <p>Business data is encrypted and protected using industry best practices.</p>
    ),
  },
  {
    id: 'sharing',
    icon: Share2,
    title: '4. Data Sharing',
    body: (
      <p>
        We do not sell customer data. Information is shared only with trusted service providers
        necessary to operate the platform or where required by law.
      </p>
    ),
  },
  {
    id: 'cookies',
    icon: Cookie,
    title: '5. Cookies',
    body: (
      <>
        <p className="mb-3">We use cookies to:</p>
        <ul className="space-y-1.5">
          <li>Keep users signed in.</li>
          <li>Improve performance.</li>
          <li>Analyze usage.</li>
          <li>Personalize the experience.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'rights',
    icon: UserCheck,
    title: '6. User Rights',
    body: (
      <>
        <p className="mb-3">Users may:</p>
        <ul className="space-y-1.5">
          <li>View their data.</li>
          <li>Update their information.</li>
          <li>Request deletion where legally permitted.</li>
          <li>Export their data.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'children',
    icon: Baby,
    title: "7. Children's Privacy",
    body: <p>KudiTrack is not intended for children under 13.</p>,
  },
  {
    id: 'changes',
    icon: RefreshCcw,
    title: '8. Changes',
    body: <p>Privacy Policy updates will be published on this page.</p>,
  },
  {
    id: 'contact',
    icon: Mail,
    title: '9. Contact',
    body: (
      <ul className="space-y-1.5">
        <li>
          <span className="font-medium text-white">Support Email:</span>{' '}
          <a href="mailto:support@kuditrack.online">support@kuditrack.online</a>
        </li>
        <li>
          <span className="font-medium text-white">Support Form:</span>{' '}
          <Link to="/support">Visit our support page</Link>
        </li>
      </ul>
    ),
  },
];

export default function PrivacyPolicyPage() {
  return (
    <>
      <SEO
        title="Privacy Policy | KudiTrack"
        description="Learn how KudiTrack collects, uses, and protects your personal and business information."
        path="/privacy-policy"
      />
      <LegalPageLayout
        eyebrow="Legal"
        title="Privacy Policy"
        intro={
          <p>
            At <span className="font-semibold text-white">KudiTrack</span>, we value your privacy.
            This policy explains what information we collect, how we use it, and the choices you
            have.
          </p>
        }
        sections={sections}
      />
    </>
  );
}
