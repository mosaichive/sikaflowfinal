import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

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
    <div className="kt-marketing min-h-screen bg-[#05060f] text-white antialiased overflow-x-hidden">
      {/* Sticky Navbar */}
      <header
        className={cn(
          'fixed top-0 inset-x-0 z-50 transition-all duration-300',
          scrolled
            ? 'backdrop-blur-xl bg-[#05060f]/70 border-b border-white/10'
            : 'bg-transparent',
        )}
      >
        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <button onClick={() => handleNav('/')} className="flex items-center gap-2.5 group">
            <Logo className="h-8 w-8" />
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              KudiTrack
            </span>
          </button>

          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <button
                key={l.href}
                onClick={() => handleNav(l.href)}
                className="px-4 py-2 text-sm text-white/70 hover:text-white transition-colors rounded-lg hover:bg-white/5"
              >
                {l.label}
              </button>
            ))}
          </nav>

          <div className="hidden lg:flex items-center gap-3">
            {user ? (
              <Button
                onClick={() => navigate('/dashboard')}
                className="bg-white text-black hover:bg-white/90 rounded-full px-5 h-10 font-semibold"
              >
                Open Dashboard <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/sign-in')}
                  className="text-sm text-white/80 hover:text-white px-4 py-2"
                >
                  Login
                </button>
                <Button
                  onClick={() => navigate('/sign-up')}
                  className="bg-gradient-to-r from-violet-500 to-cyan-400 text-black hover:opacity-90 rounded-full px-5 h-10 font-semibold shadow-[0_0_30px_-5px_rgba(139,92,246,0.6)]"
                >
                  Get Started
                </Button>
              </>
            )}
          </div>

          <button
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden p-2 rounded-lg text-white/80 hover:bg-white/5"
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
              className="lg:hidden overflow-hidden bg-[#05060f]/95 backdrop-blur-xl border-t border-white/10"
            >
              <div className="px-5 py-4 space-y-1">
                {NAV_LINKS.map((l) => (
                  <button
                    key={l.href}
                    onClick={() => handleNav(l.href)}
                    className="block w-full text-left px-4 py-3 rounded-lg text-white/80 hover:bg-white/5"
                  >
                    {l.label}
                  </button>
                ))}
                <div className="pt-3 grid grid-cols-2 gap-2">
                  {user ? (
                    <Button
                      onClick={() => { setOpen(false); navigate('/dashboard'); }}
                      className="col-span-2 bg-white text-black hover:bg-white/90 rounded-full"
                    >
                      Open Dashboard
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => { setOpen(false); navigate('/sign-in'); }}
                        className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/5"
                      >
                        Login
                      </Button>
                      <Button
                        onClick={() => { setOpen(false); navigate('/sign-up'); }}
                        className="rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 text-black"
                      >
                        Get Started
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="pt-16">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <footer className="relative border-t border-white/10 mt-20">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-violet-950/20 pointer-events-none" />
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
          <FooterCol
            title="Legal"
            links={[
              { label: 'Privacy Policy', href: '/#' },
              { label: 'Terms of Service', href: '/#' },
              { label: 'Login', href: '/sign-in' },
            ]}
          />
        </div>
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/50">
          <p>© {new Date().getFullYear()} KudiTrack. Built for African businesses.</p>
          <p>Made with care in Ghana 🇬🇭</p>
        </div>
      </div>
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
