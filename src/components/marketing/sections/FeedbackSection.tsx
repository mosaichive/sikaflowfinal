import { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Mail, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SectionHeader } from './FeaturesSection';
import { Field, SuccessState } from './AdvertiseSection';

export function FeedbackSection() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });

  const onChange = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error('Name, email, and message are required.');
      return;
    }
    if (form.message.length > 2000) {
      toast.error('Message is too long.');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from('feedback_messages').insert({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      subject: form.subject.trim() || '(no subject)',
      message: form.message.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error('Could not send message. Please try again.');
      return;
    }
    setSuccess(true);
    setForm({ name: '', email: '', subject: '', message: '' });
    toast.success('Message sent!');
  };

  return (
    <section id="contact" className="relative py-24 sm:py-32">
      <div className="max-w-5xl mx-auto px-5 sm:px-8">
        <SectionHeader
          eyebrow="Contact & Feedback"
          title="We'd love to hear from you"
          sub="Suggest a feature, report an issue, or just say hello. Real humans read every message."
        />

        <div className="mt-12 grid md:grid-cols-[1fr_1.4fr] gap-6 items-start">
          {/* Left: contact channels */}
          <div className="space-y-3">
            <InfoCard icon={Mail} label="Email" value="hello@kuditrack.online" />
            <InfoCard icon={MessageSquare} label="WhatsApp" value="Available in app" />
            <div id="feedback" className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-5 text-xs text-white/70 leading-relaxed">
              Your message goes straight to our team and is reviewed within 1–2 business days.
            </div>
          </div>

          {/* Right: form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl p-6 sm:p-8"
          >
            {success ? (
              <SuccessState onReset={() => setSuccess(false)} message="Thanks! Your message is on its way." />
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="Name *" value={form.name} onChange={onChange('name')} />
                  <Field label="Email *" type="email" value={form.email} onChange={onChange('email')} />
                </div>
                <Field label="Subject" value={form.subject} onChange={onChange('subject')} placeholder="What's this about?" />
                <div>
                  <Label className="text-xs text-white/70 mb-1.5 block">Message *</Label>
                  <Textarea
                    value={form.message}
                    onChange={onChange('message')}
                    rows={5}
                    placeholder="Tell us what's on your mind..."
                    className="bg-white/[0.04] border-white/10 text-white placeholder:text-white/30 focus-visible:ring-violet-500"
                    maxLength={2000}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-11 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 text-black font-semibold hover:opacity-90"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Message'}
                </Button>
              </form>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function InfoCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur p-5 flex items-start gap-3">
      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-400/20 border border-white/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-white/55">{label}</p>
        <p className="text-sm font-semibold mt-0.5">{value}</p>
      </div>
    </div>
  );
}
