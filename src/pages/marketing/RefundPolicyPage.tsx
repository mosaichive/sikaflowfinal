import { Link } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  Mail,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

const sections = [
  {
    id: 'subscription-payments',
    icon: CreditCard,
    title: '1. Subscription Payments',
    body: (
      <ul className="space-y-2">
        <li>Monthly and annual subscription fees are billed in advance.</li>
        <li>Users may cancel their subscription at any time.</li>
        <li>
          Cancellation stops future billing but does not automatically qualify for a
          refund for the current billing period.
        </li>
      </ul>
    ),
  },
  {
    id: 'eligibility',
    icon: CheckCircle2,
    title: '2. Eligibility for Refunds',
    body: (
      <>
        <p className="mb-3">Refund requests may be considered if:</p>
        <ul className="space-y-2">
          <li>The customer was charged more than once for the same subscription.</li>
          <li>A payment was processed due to a verified system error.</li>
          <li>
            The service was unavailable for an extended period because of a platform
            issue.
          </li>
          <li>Other exceptional circumstances approved by KudiTrack Support.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'non-refundable',
    icon: XCircle,
    title: '3. Non-Refundable Cases',
    body: (
      <>
        <p className="mb-3">Refunds will generally not be provided for:</p>
        <ul className="space-y-2">
          <li>Change of mind after purchase.</li>
          <li>Failure to use the service.</li>
          <li>Lack of technical knowledge.</li>
          <li>User error or accidental purchases.</li>
          <li>
            Violation of KudiTrack's Terms of Service resulting in account suspension.
          </li>
          <li>Partial use of a subscription period.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'request-process',
    icon: FileText,
    title: '4. Refund Request Process',
    body: (
      <>
        <p className="mb-3">Users must:</p>
        <ul className="space-y-2">
          <li>
            Contact{' '}
            <Link to="/support" className="text-primary hover:underline">
              KudiTrack Support
            </Link>
            .
          </li>
          <li>Provide their account email.</li>
          <li>Include payment reference or transaction ID.</li>
          <li>Explain the reason for the refund request.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'review',
    icon: ShieldCheck,
    title: '5. Review Process',
    body: (
      <ul className="space-y-2">
        <li>Refund requests are reviewed individually.</li>
        <li>Users will receive a response within 5–10 business days.</li>
        <li>
          Approved refunds will be processed using the original payment method where
          possible.
        </li>
      </ul>
    ),
  },
  {
    id: 'processing-time',
    icon: Clock,
    title: '6. Processing Time',
    body: (
      <>
        <p className="mb-3">Approved refunds may take:</p>
        <ul className="space-y-2">
          <li>
            <span className="font-medium text-foreground">Mobile Money:</span> 1–5
            business days.
          </li>
          <li>
            <span className="font-medium text-foreground">Debit/Credit Cards:</span>{' '}
            5–10 business days.
          </li>
          <li>
            <span className="font-medium text-foreground">Bank Transfers:</span>{' '}
            depending on the financial institution.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'free-trial',
    icon: HelpCircle,
    title: '7. Free Trial',
    body: (
      <p>
        If a free trial is offered, users are encouraged to evaluate the platform
        before subscribing. Charges after the trial period are generally
        non-refundable unless covered under this policy.
      </p>
    ),
  },
  {
    id: 'changes',
    icon: RefreshCcw,
    title: '8. Changes to this Policy',
    body: (
      <p>
        KudiTrack reserves the right to update this Refund Policy at any time.
        Changes become effective once published on the website.
      </p>
    ),
  },
  {
    id: 'contact',
    icon: Mail,
    title: '9. Contact Us',
    body: (
      <>
        <p className="mb-3">For refund requests or questions, contact:</p>
        <ul className="space-y-2">
          <li>
            <span className="font-medium text-foreground">Support Email:</span>{' '}
            <a
              href="mailto:support@kuditrack.online"
              className="text-primary hover:underline"
            >
              support@kuditrack.online
            </a>
          </li>
          <li>
            <span className="font-medium text-foreground">Support Form:</span>{' '}
            <Link to="/support" className="text-primary hover:underline">
              Visit our support page
            </Link>
          </li>
          <li>
            <span className="font-medium text-foreground">Live Chat:</span> Available
            in-app when signed in.
          </li>
        </ul>
      </>
    ),
  },
];

export default function RefundPolicyPage() {
  const lastUpdated = new Date('2026-07-09').toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <SEO
        title="Refund Policy | KudiTrack"
        description="KudiTrack Refund Policy — learn when subscription refunds are eligible, how to request one, and how long processing takes."
        path="/refund-policy"
      />
      <div className="relative mx-auto max-w-4xl px-5 sm:px-8 py-16 sm:py-20 text-white/85 animate-in fade-in duration-500">
        <div className="mb-10 sm:mb-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-widest text-white/60">
            <ShieldCheck className="h-3.5 w-3.5" />
            Policy
          </div>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">
            Refund Policy
          </h1>
          <p className="mt-3 text-sm text-white/50">Last updated: {lastUpdated}</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8 mb-8">
          <p className="text-base leading-relaxed text-white/75">
            At <span className="font-semibold text-white">KudiTrack</span>, we are
            committed to providing a reliable sales, inventory, and business
            management platform. This Refund Policy outlines the conditions under
            which customers may request refunds for subscription payments or other
            paid services.
          </p>
        </div>

        <div className="space-y-6">
          {sections.map(({ id, icon: Icon, title, body }) => (
            <section
              key={id}
              id={id}
              className="group rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6 sm:p-8 transition-colors hover:border-white/20"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg sm:text-xl font-semibold text-white">
                    {title}
                  </h2>
                  <div className="mt-3 text-sm sm:text-[15px] leading-relaxed text-white/70 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-medium">
                    {body}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm text-amber-100/80">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <p>
            By subscribing to KudiTrack you acknowledge that you have read and
            understood this Refund Policy. If anything is unclear, please contact
            support before purchasing.
          </p>
        </div>

        <div className="mt-8 text-center text-xs text-white/40">
          <Link to="/" className="hover:text-white/70">
            ← Back to home
          </Link>
        </div>
      </div>
    </>
  );
}
