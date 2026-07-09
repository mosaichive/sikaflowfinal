import { Link } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import { LegalPageLayout, LegalSection } from '@/components/marketing/LegalPageLayout';
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  RefreshCcw,
  RotateCcw,
} from 'lucide-react';

export const refundIntro = (
  <p>
    Our goal is to ensure customer satisfaction while maintaining a fair refund process. This
    policy outlines when refunds are available and how to request one.
  </p>
);

export const refundFooterNote = (
  <p>
    By subscribing to KudiTrack you acknowledge that you have read and understood this Refund
    Policy. If anything is unclear, please contact support before purchasing.
  </p>
);

export const refundSections: LegalSection[] = [
  {
    id: 'subscription-payments',
    icon: CreditCard,
    title: '1. Subscription Payments',
    body: (
      <p>Subscriptions are billed in advance and renew automatically until cancelled.</p>
    ),
  },
  {
    id: 'eligible',
    icon: CheckCircle2,
    title: '2. Eligible Refunds',
    body: (
      <>
        <p className="mb-3">Refunds may be approved for:</p>
        <ul className="space-y-1.5">
          <li>Duplicate payments.</li>
          <li>Billing errors.</li>
          <li>Verified platform-related service failures.</li>
          <li>Other exceptional cases approved by KudiTrack.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'non-refundable',
    icon: XCircle,
    title: '3. Non-Refundable Situations',
    body: (
      <>
        <p className="mb-3">Refunds are generally not provided for:</p>
        <ul className="space-y-1.5">
          <li>Change of mind.</li>
          <li>Failure to use the service.</li>
          <li>User mistakes.</li>
          <li>Partial subscription periods.</li>
          <li>Account suspension due to Terms violations.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'request',
    icon: FileText,
    title: '4. How to Request a Refund',
    body: (
      <>
        <p className="mb-3">
          Users should contact <Link to="/support">Support</Link> with:
        </p>
        <ul className="space-y-1.5">
          <li>Account email.</li>
          <li>Payment reference.</li>
          <li>Reason for the request.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'review',
    icon: Clock,
    title: '5. Review Timeline',
    body: <p>Refund requests are reviewed within 5–10 business days.</p>,
  },
  {
    id: 'processing',
    icon: RotateCcw,
    title: '6. Refund Processing',
    body: (
      <p>Approved refunds are returned through the original payment method where possible.</p>
    ),
  },
  {
    id: 'updates',
    icon: RefreshCcw,
    title: '7. Policy Updates',
    body: <p>KudiTrack may revise this policy at any time.</p>,
  },
];

export default function RefundPolicyPage() {
  return (
    <>
      <SEO
        title="Refund Policy | KudiTrack"
        description="KudiTrack Refund Policy — when subscription refunds are eligible, how to request one, and how long processing takes."
        path="/refund-policy"
      />
      <LegalPageLayout
        eyebrow="Legal"
        title="Refund Policy"
        intro={refundIntro}
        sections={refundSections}
        footerNote={refundFooterNote}
      />
    </>
  );
}
