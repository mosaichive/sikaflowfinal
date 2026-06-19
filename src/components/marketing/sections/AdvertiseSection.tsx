import { useState } from 'react';
import { motion } from 'framer-motion';
import { Megaphone, Users, Target, Eye, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SectionHeader } from './FeaturesSection';

const BENEFITS = [
  { icon: Users, title: 'Targeted Audience', desc: 'Reach 2,500+ active African business owners and decision-makers.' },
  { icon: Eye, title: 'Premium Placements', desc: 'Dashboard banners, sidebar ads, and announcement spots.' },
  { icon: Target, title: 'Niche Categories', desc: 'Choose retail, wholesale, salons, food, electronics, and more.' },
  { icon: Megaphone, title: 'Real Engagement', desc: 'Average 14k+ monthly impressions per active campaign.' },
];

export function AdvertiseSection() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    business_name: '', contact_name: '', email: '', phone: '',
    business_type: '', ad_goal: '', budget: '', message: '',
  });

  const onChange = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.business_name.trim() || !form.contact_name.trim() || !form.email.trim()) {
      toast.error('Business name, contact name, and email are required.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('ad_applications').insert({
      business_name: form.business_name.trim(),
      contact_name: form.contact_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      business_type: form.business_type.trim() || null,
      ad_goal: form.ad_goal.trim() || null,
      budget: form.budget.trim() || null,
      message: form.message.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error('Could not send application. Please try again.');
      return;
    }
    setSuccess(true);
    setForm({ business_name: '', contact_name: '', email: '', phone: '', business_type: '', ad_goal: '', budget: '', message: '' });
    toast.success('Application sent! We will be in touch.');
  };

  return (
    <section id="advertise" className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="Advertise"
          title="Advertise on KudiTrack"
          sub="Put your brand in front of thousands of business owners using KudiTrack every day."
        />

        <div className="mt-14 grid lg:grid-cols-[1fr_1.1fr] gap-8 items-start">
          {/* Benefits */}
          <div className="grid sm:grid-cols-2 gap-4">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur"
              >
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#51C11F]/24 to-cyan-400/16 border border-white/10 flex items-center justify-center mb-3">
                  <b.icon className="h-4 w-4 text-white" />
                </div>
                <p className="text-sm font-semibold">{b.title}</p>
                <p className="text-xs text-white/60 mt-1.5 leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
            <div className="sm:col-span-2 rounded-2xl border border-[rgba(81,193,31,0.25)] bg-gradient-to-br from-[#51C11F]/10 to-cyan-400/5 p-5">
              <p className="text-xs uppercase tracking-widest text-[#7BDF58]">Estimated reach</p>
              <p className="text-3xl font-bold mt-1">14,000+ <span className="text-sm font-normal text-white/60">monthly impressions</span></p>
            </div>
          </div>

          {/* Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6 sm:p-8 shadow-[0_8px_24px_rgba(81,193,31,0.12)]"
          >
            {success ? (
              <SuccessState onReset={() => setSuccess(false)} />
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <h3 className="text-lg font-semibold">Apply to advertise</h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Business Name *" value={form.business_name} onChange={onChange('business_name')} />
                  <Field label="Contact Name *" value={form.contact_name} onChange={onChange('contact_name')} />
                  <Field label="Email *" type="email" value={form.email} onChange={onChange('email')} />
                  <Field label="Phone Number" value={form.phone} onChange={onChange('phone')} />
                  <Field label="Business Type" value={form.business_type} onChange={onChange('business_type')} placeholder="Retail, Food, Salon..." />
                  <Field label="Ad Goal" value={form.ad_goal} onChange={onChange('ad_goal')} placeholder="Awareness, Leads, Signups..." />
                  <Field className="sm:col-span-2" label="Budget" value={form.budget} onChange={onChange('budget')} placeholder="e.g. GHS 2,000 / month" />
                </div>
                <div>
                  <Label className="text-xs text-white/70 mb-1.5 block">Message</Label>
                  <Textarea
                    value={form.message}
                    onChange={onChange('message')}
                    rows={4}
                    placeholder="Tell us about your campaign..."
                    className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#51C11F]"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 rounded-full bg-gradient-to-r from-[#51C11F] to-[#45A91A] text-white font-semibold hover:opacity-90"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit Application'}
                </Button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function Field({
  label, value, onChange, type = 'text', placeholder, className = '',
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-white/70 mb-1.5 block">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-[#51C11F]"
      />
    </div>
  );
}

export function SuccessState({ onReset, message = 'Thanks! We received your message.' }: { onReset: () => void; message?: string }) {
  return (
    <div className="py-10 text-center">
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200 }}
        className="mx-auto h-14 w-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center"
      >
        <CheckCircle2 className="h-7 w-7 text-emerald-300" />
      </motion.div>
      <p className="mt-5 text-lg font-semibold">{message}</p>
      <p className="mt-1 text-sm text-white/60">We'll get back to you within 1–2 business days.</p>
      <Button onClick={onReset} variant="outline" className="mt-6 rounded-full border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white">
        Send another
      </Button>
    </div>
  );
}
