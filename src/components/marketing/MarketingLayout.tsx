import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { LegalDialog } from '@/components/marketing/LegalDialog';
import { termsIntro, termsSections } from '@/pages/marketing/TermsOfServicePage';
import { privacyIntro, privacySections } from '@/pages/marketing/PrivacyPolicyPage';
import { refundIntro, refundSections, refundFooterNote } from '@/pages/marketing/RefundPolicyPage';

const NAV_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'Reviews', href: '/#reviews' },
  { label: 'Advertise', href: '/#advertise' },
  { label: 'Contact', href: '/#contact' },
];

function scrollToHash(hash: string) {
  if (!hash) return;
  const id = hash.replace('#', '');
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function MarketingLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (location.hash) {
      // give DOM a tick
      setTimeout(() => scrollToHash(location.hash), 50);
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [location.pathname, location.hash]);

  const handleNav = (href: string) => {
    setOpen(false);
    if (href.startsWith('/#')) {
      if (location.pathname !== '/') {
        navigate(href);
      } else {
        scrollToHash(href.replace('/', ''));
      }
    } else {
      navigate(href);
    }
  };

  return (
    <div className="kt-marketing min-h-screen bg-[#0b0f15] text-white antialiased overflow-x-hidden">
      {/* Sticky Navbar */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-5">
        <div
          className={cn(
            'mx-auto flex h-[72px] max-w-7xl items-center justify-between rounded-full bg-white px-4 text-slate-950 shadow-[0_18px_45px_-28px_rgba(0,0,0,0.65)] transition-all duration-300 sm:h-20 sm:px-7',
            scrolled && 'shadow-[0_22px_60px_-30px_rgba(0,0,0,0.75)]',
          )}
        >
          <button onClick={() => handleNav('/')} className="flex items-center gap-2.5 group">
            <Logo className="h-8 w-8 sm:h-9 sm:w-9" />
            <span className="font-bold text-lg tracking-tight text-slate-950 sm:text-xl">
              KudiTrack
            </span>
          </button>

          <nav className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <button
                key={l.href}
                onClick={() => handleNav(l.href)}
                className="text-[15px] font-medium text-slate-700 transition-colors hover:text-slate-950"
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-4">
            {user ? (
              <Button
                onClick={() => navigate('/dashboard')}
                className="h-14 rounded-full bg-[#ffcc00] px-8 text-base font-bold text-slate-950 hover:bg-[#f1bd00]"
              >
                Open Dashboard <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/sign-in')}
                  className="h-14 rounded-full bg-slate-100 px-8 text-base font-semibold text-slate-950 transition-colors hover:bg-slate-200"
                >
                  Login
                </button>
                <Button
                  onClick={() => navigate('/sign-up')}
                  className="h-14 rounded-full bg-[#ffcc00] px-8 text-base font-bold text-slate-950 shadow-none hover:bg-[#f1bd00]"
                >
                  Get started
                </Button>
              </>
            )}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-full p-3 text-slate-950 transition-colors hover:bg-slate-100 lg:hidden"
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mx-auto mt-2 max-w-7xl overflow-hidden rounded-[2rem] bg-white text-slate-950 shadow-[0_18px_45px_-28px_rgba(0,0,0,0.65)] lg:hidden"
            >
              <div className="px-5 py-4 space-y-1">
                {NAV_LINKS.map((l) => (
                  <button
                    key={l.href}
                    onClick={() => handleNav(l.href)}
                    className="block w-full rounded-2xl px-4 py-3 text-left font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950"
                  >
                    {l.label}
                  </button>
                ))}
                <div className="pt-3 grid grid-cols-2 gap-2">
                  {user ? (
                    <Button
                      onClick={() => { setOpen(false); navigate('/dashboard'); }}
                      className="col-span-2 h-12 rounded-full bg-[#ffcc00] font-bold text-slate-950 hover:bg-[#f1bd00]"
                    >
                      Open Dashboard
                    </Button>
                  ) : (
                    <>
                      <Button
                        onClick={() => { setOpen(false); navigate('/sign-in'); }}
                        className="h-12 rounded-full bg-slate-100 font-semibold text-slate-950 hover:bg-slate-200"
                      >
                        Login
                      </Button>
                      <Button
                        onClick={() => { setOpen(false); navigate('/sign-up'); }}
                        className="h-12 rounded-full bg-[#ffcc00] font-bold text-slate-950 hover:bg-[#f1bd00]"
                      >
                        Get started
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="pt-24 sm:pt-28">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}

type LegalKey = 'terms' | 'privacy' | 'refund' | null;

function Footer() {
  const [openLegal, setOpenLegal] = useState<LegalKey>(null);
  return (
    <footer className="relative border-t border-white/10 mt-20">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#2C8603]/14 pointer-events-none" />
      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 py-14">
        <div className="grid md:grid-cols-4 gap-10">
          <div>
            <Link to="/" className="flex items-center gap-2.5 mb-4">
              <Logo className="h-8 w-8" />
              <span className="font-bold text-lg">KudiTrack</span>
            </Link>
            <p className="text-sm text-white/60 leading-relaxed">
              The smart way for African businesses to track sales, stock, and money in one place.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              { label: 'Features', href: '/#features' },
              { label: 'Reviews', href: '/#reviews' },
              { label: 'FAQ', href: '/#faq' },
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              { label: 'Advertise', href: '/#advertise' },
              { label: 'Contact', href: '/#contact' },
              { label: 'Feedback', href: '/feedback' },
            ]}
          />
          <div>
            <h4 className="text-sm font-semibold mb-4 text-white">Legal</h4>
            <ul className="space-y-2.5">
              <li>
                <button
                  onClick={() => setOpenLegal('terms')}
                  className="text-sm text-white/60 hover:text-white transition-colors text-left"
                >
                  Terms of Service
                </button>
              </li>
              <li>
                <button
                  onClick={() => setOpenLegal('privacy')}
                  className="text-sm text-white/60 hover:text-white transition-colors text-left"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  onClick={() => setOpenLegal('refund')}
                  className="text-sm text-white/60 hover:text-white transition-colors text-left"
                >
                  Refund Policy
                </button>
              </li>
              <li>
                <Link
                  to="/sign-in"
                  className="text-sm text-white/60 hover:text-white transition-colors"
                >
                  Login
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/50">
          <p>© {new Date().getFullYear()} KudiTrack. Built for African businesses.</p>
          <p>Made with care in Ghana 🇬🇭</p>
        </div>
      </div>

      <LegalDialog
        open={openLegal === 'terms'}
        onOpenChange={(o) => !o && setOpenLegal(null)}
        title="Terms of Service"
        intro={termsIntro}
        sections={termsSections}
      />
      <LegalDialog
        open={openLegal === 'privacy'}
        onOpenChange={(o) => !o && setOpenLegal(null)}
        title="Privacy Policy"
        intro={privacyIntro}
        sections={privacySections}
      />
      <LegalDialog
        open={openLegal === 'refund'}
        onOpenChange={(o) => !o && setOpenLegal(null)}
        title="Refund Policy"
        intro={refundIntro}
        sections={refundSections}
        footerNote={refundFooterNote}
      />
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-4 text-white">{title}</h4>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.label}>
            <Link to={l.href} className="text-sm text-white/60 hover:text-white transition-colors">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
