import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, CalendarClock } from 'lucide-react';

export function CtaSection() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-[#C7254E]/28 via-[#D6335B]/18 to-cyan-500/24 p-10 sm:p-16 text-center"
        >
          {/* Animated bg shapes */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
            className="absolute -top-40 -left-20 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-[#C7254E]/32 to-transparent blur-3xl"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
            className="absolute -bottom-40 -right-20 w-[480px] h-[480px] rounded-full bg-gradient-to-br from-cyan-400/40 to-transparent blur-3xl"
          />

          <div className="relative">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight max-w-3xl mx-auto leading-[1.1]">
              Start managing your business smarter today.
            </h2>
            <p className="mt-5 text-base sm:text-lg text-white/75 max-w-xl mx-auto">
              Join thousands of African business owners running calmer, more profitable businesses with KudiTrack.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Button asChild className="h-12 px-7 rounded-full bg-white text-black hover:bg-white/90 font-semibold shadow-[0_0_40px_-5px_rgba(255,255,255,0.6)]">
                <Link to="/sign-up">Get Started <ArrowRight className="ml-1.5 h-4 w-4" /></Link>
              </Button>
              <Button asChild variant="outline" className="h-12 px-7 rounded-full border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
                <a href="#contact"><CalendarClock className="mr-1.5 h-4 w-4" /> Book Demo</a>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
