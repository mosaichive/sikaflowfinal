import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, Mail, Phone, MessageCircle, ArrowRight, Send, Youtube, Instagram, Twitter, Linkedin, Facebook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Logo } from '@/components/Logo';
import contactBg from '@/assets/contact-bg.asset.json';

export function FeedbackSection() {
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [newsletter, setNewsletter] = useState('');
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
    <section
      id="contact"
      className="relative"
      style={{
        backgroundImage: `url(${contactBg.url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Soft white overlay to keep text readable across the photo */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/80 via-white/40 to-white/70 pointer-events-none" />

      <div className="relative">
        {/* Contact & Feedback */}
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pt-20 sm:pt-28 pb-24 sm:pb-32">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
            {/* Left */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-slate-900"
            >
              <h2 className="text-4xl sm:text-5xl font-bold tracking-tight">
                Contact <span className="text-emerald-600">&amp; Feedback</span>
              </h2>
              <p className="mt-4 text-base sm:text-lg text-slate-700 max-w-md">
                We'd love to hear from you. Reach out to us anytime.
              </p>

              <div className="mt-8 space-y-4 max-w-md">
                <ContactRow
                  icon={Mail}
                  label="Email Us"
                  value="hello@kuditrack.online"
                  href="mailto:hello@kuditrack.online"
                />
                <ContactRow
                  icon={Phone}
                  label="Call Us"
                  value="+233 544 909 011"
                  href="tel:+233544909011"
                />
                <ContactRow
                  icon={MessageCircle}
                  label="Live Chat"
                  value="Available in the app"
                />
              </div>

              <div className="mt-8 max-w-md rounded-2xl bg-white/85 backdrop-blur border border-emerald-100 p-5 shadow-[0_20px_50px_-30px_rgba(2,44,34,0.35)]">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                    <MessageCircle className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">Your Feedback Matters</p>
                    <p className="text-sm text-slate-600 mt-1">
                      Help us improve KudiTrack by sharing your experience.
                    </p>
                    <Button
                      asChild
                      className="mt-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <a href="#feedback-form">Send Feedback</a>
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Right — Form */}
            <motion.div
              id="feedback-form"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-3xl bg-white shadow-[0_30px_80px_-30px_rgba(2,44,34,0.35)] border border-emerald-100/60 p-6 sm:p-8"
            >
              {success ? (
                <div className="text-center py-10">
                  <div className="mx-auto h-14 w-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                    <Send className="h-6 w-6 text-emerald-700" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Thanks!</h3>
                  <p className="mt-2 text-slate-600">Your message is on its way.</p>
                  <Button onClick={() => setSuccess(false)} variant="outline" className="mt-6 rounded-full">
                    Send another
                  </Button>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Send Us a Message</h3>
                    <p className="text-sm text-slate-500 mt-1">Fill out the form below and we'll get back to you.</p>
                  </div>
                  <LightField label="Full Name" value={form.name} onChange={onChange('name')} placeholder="Enter your full name" />
                  <LightField label="Email Address" type="email" value={form.email} onChange={onChange('email')} placeholder="Enter your email" />
                  <LightField label="Subject" value={form.subject} onChange={onChange('subject')} placeholder="How can we help you?" />
                  <div>
                    <Label className="text-xs font-medium text-slate-700 mb-1.5 block">Message</Label>
                    <Textarea
                      value={form.message}
                      onChange={onChange('message')}
                      rows={5}
                      placeholder="Type your message here..."
                      className="bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500"
                      maxLength={2000}
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-base"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Send Message <Send className="ml-2 h-4 w-4" /></>}
                  </Button>
                </form>
              )}
            </motion.div>
          </div>
        </div>

        {/* Footer Card */}
        <div className="max-w-7xl mx-auto px-5 sm:px-8 pb-12 sm:pb-16">
          <div className="rounded-[32px] bg-white shadow-[0_30px_80px_-30px_rgba(2,44,34,0.4)] border border-emerald-100/60 p-8 sm:p-12">
            <div className="grid gap-10 md:grid-cols-12">
              {/* Brand */}
              <div className="md:col-span-4">
                <Link to="/" className="flex items-center gap-2.5">
                  <Logo className="h-8 w-8" />
                  <span className="font-bold text-lg text-slate-900">
                    Kudi<span className="text-emerald-600">Track</span>
                  </span>
                </Link>
                <p className="mt-4 text-sm text-slate-600 leading-relaxed max-w-xs">
                  The all-in-one business management app that helps you track sales, manage inventory, expenses, and grow your business with confidence.
                </p>
                <div className="mt-6 flex items-center gap-3 text-amber-600">
                  <SocialIcon icon={Youtube} href="#" />
                  <SocialIcon icon={Instagram} href="#" />
                  <SocialIcon icon={Twitter} href="#" />
                  <SocialIcon icon={Linkedin} href="#" />
                  <SocialIcon icon={Facebook} href="#" />
                </div>
              </div>

              {/* Columns */}
              <FooterCol
                title="Product"
                className="md:col-span-2"
                links={[
                  { label: 'Features', href: '/#features' },
                  { label: 'How It Works', href: '/#how-it-works' },
                  { label: 'Mobile App', href: '/#features' },
                ]}
              />
              <FooterCol
                title="Company"
                className="md:col-span-2"
                links={[
                  { label: 'About Us', href: '/#' },
                  { label: 'Blog', href: '/#' },
                  { label: 'Careers', href: '/#' },
                  { label: 'Contact Us', href: '/#contact' },
                ]}
              />
              <FooterCol
                title="Support"
                className="md:col-span-2"
                links={[
                  { label: 'Help Center', href: '/#' },
                  { label: 'FAQs', href: '/#faq' },
                  { label: 'Terms of Service', href: '/#' },
                  { label: 'Privacy Policy', href: '/#' },
                ]}
              />

              {/* Newsletter */}
              <div className="md:col-span-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-4">Stay Updated</h4>
                <p className="text-sm text-slate-600 mb-4">
                  Subscribe to our newsletter for tips, updates, and exclusive offers.
                </p>
                <form
                  onSubmit={(e) => { e.preventDefault(); if (newsletter.trim()) { toast.success('Subscribed!'); setNewsletter(''); } }}
                  className="relative"
                >
                  <Input
                    value={newsletter}
                    onChange={(e) => setNewsletter(e.target.value)}
                    type="email"
                    placeholder="Enter your email"
                    className="h-12 pr-12 rounded-full bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500"
                  />
                  <button
                    type="submit"
                    aria-label="Subscribe"
                    className="absolute right-1.5 top-1.5 h-9 w-9 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center text-white"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
              <div className="flex items-center gap-5">
                <Link to="/#" className="hover:text-slate-900">Terms of service</Link>
                <Link to="/#" className="hover:text-slate-900">Privacy</Link>
              </div>
              <p>Copyright © {new Date().getFullYear()}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactRow({ icon: Icon, label, value, href }: { icon: any; label: string; value: string; href?: string }) {
  const inner = (
    <div className="flex items-center gap-4">
      <div className="h-12 w-12 rounded-full bg-emerald-600 flex items-center justify-center shrink-0 shadow-[0_10px_25px_-10px_rgba(16,185,129,0.6)]">
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-base font-semibold text-slate-900">{value}</p>
      </div>
    </div>
  );
  return href ? <a href={href} className="block hover:opacity-90 transition">{inner}</a> : inner;
}

function LightField({ label, type = 'text', value, onChange, placeholder }: { label: string; type?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string }) {
  return (
    <div>
      <Label className="text-xs font-medium text-slate-700 mb-1.5 block">{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="h-11 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-emerald-500"
      />
    </div>
  );
}

function FooterCol({ title, links, className = '' }: { title: string; links: { label: string; href: string }[]; className?: string }) {
  return (
    <div className={className}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-4">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link to={l.href} className="text-sm text-slate-700 hover:text-emerald-600 transition-colors">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialIcon({ icon: Icon, href }: { icon: any; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="h-9 w-9 rounded-lg border border-amber-200 bg-amber-50/60 hover:bg-amber-100 flex items-center justify-center transition"
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}
