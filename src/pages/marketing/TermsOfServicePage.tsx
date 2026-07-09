import { Link } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import { LegalPageLayout, LegalSection } from '@/components/marketing/LegalPageLayout';
import {
  CheckCircle2,
  Layers,
  UserCircle2,
  CreditCard,
  ShieldAlert,
  Database,
  Activity,
  Scale,
  Ban,
  RefreshCcw,
  Mail,
} from 'lucide-react';

export const termsIntro = (
  <p>
    Welcome to <span className="font-semibold text-white">KudiTrack</span>. By accessing or using
    our website, web application, or mobile application, you agree to these Terms of Service.
  </p>
);

export const termsSections: LegalSection[] = [
  {
    id: 'acceptance',
    icon: CheckCircle2,
    title: '1. Acceptance of Terms',
    body: <p>By creating an account or using KudiTrack, you agree to comply with these Terms.</p>,
  },
  {
    id: 'services',
    icon: Layers,
    title: '2. Services',
    body: (
      <>
        <p className="mb-3">KudiTrack provides:</p>
        <ul className="space-y-1.5">
          <li>Sales Tracking</li>
          <li>Inventory Management</li>
          <li>Expense Tracking</li>
          <li>Profit Analytics</li>
          <li>Business Reports</li>
          <li>Team Management</li>
          <li>Cloud Data Synchronization</li>
          <li>Financial Statements</li>
          <li>Receipt &amp; Invoice Generation</li>
        </ul>
      </>
    ),
  },
  {
    id: 'accounts',
    icon: UserCircle2,
    title: '3. User Accounts',
    body: (
      <>
        <p className="mb-3">Users are responsible for:</p>
        <ul className="space-y-1.5">
          <li>Keeping login credentials secure.</li>
          <li>Providing accurate information.</li>
          <li>All activity performed under their account.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'billing',
    icon: CreditCard,
    title: '4. Subscription & Billing',
    body: (
      <ul className="space-y-1.5">
        <li>Paid subscriptions renew automatically unless cancelled.</li>
        <li>Pricing may change with prior notice.</li>
        <li>Taxes may apply where required.</li>
      </ul>
    ),
  },
  {
    id: 'acceptable-use',
    icon: ShieldAlert,
    title: '5. Acceptable Use',
    body: (
      <>
        <p className="mb-3">Users may not:</p>
        <ul className="space-y-1.5">
          <li>Upload malicious software.</li>
          <li>Attempt unauthorized access.</li>
          <li>Abuse the platform.</li>
          <li>Violate applicable laws.</li>
          <li>Share or resell accounts without permission.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'data-ownership',
    icon: Database,
    title: '6. Data Ownership',
    body: (
      <p>
        Users retain ownership of their business data. KudiTrack only processes data to provide the
        service.
      </p>
    ),
  },
  {
    id: 'availability',
    icon: Activity,
    title: '7. Availability',
    body: (
      <p>
        We strive for maximum uptime but cannot guarantee uninterrupted service due to maintenance
        or unforeseen circumstances.
      </p>
    ),
  },
  {
    id: 'liability',
    icon: Scale,
    title: '8. Limitation of Liability',
    body: (
      <p>
        KudiTrack is not liable for indirect, incidental, or consequential damages resulting from
        the use of the platform.
      </p>
    ),
  },
  {
    id: 'suspension',
    icon: Ban,
    title: '9. Account Suspension',
    body: (
      <p>
        Accounts may be suspended for fraud, abuse, illegal activities, or violation of these
        Terms.
      </p>
    ),
  },
  {
    id: 'changes',
    icon: RefreshCcw,
    title: '10. Changes',
    body: (
      <p>
        These Terms may be updated periodically. Continued use constitutes acceptance of any
        changes.
      </p>
    ),
  },
  {
    id: 'contact',
    icon: Mail,
    title: '11. Contact',
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
        <li>
          <span className="font-medium text-white">Address:</span> KudiTrack, Accra, Ghana.
        </li>
      </ul>
    ),
  },
];

export default function TermsOfServicePage() {
  return (
    <>
      <SEO
        title="Terms of Service | KudiTrack"
        description="Read the KudiTrack Terms of Service governing use of our sales, inventory, and business management platform."
        path="/terms-of-service"
      />
      <LegalPageLayout
        eyebrow="Legal"
        title="Terms of Service"
        intro={termsIntro}
        sections={termsSections}
        footerNote={
          <p>
            By continuing to use KudiTrack you acknowledge that you have read and agreed to these
            Terms of Service.
          </p>
        }
      />
    </>
  );
}
