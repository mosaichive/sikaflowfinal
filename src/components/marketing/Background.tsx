import { motion } from 'framer-motion';

/** Soft animated gradient blobs that float behind sections. Pointer-events disabled. */
export function GradientBlobs({ className = '' }: { className?: string }) {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      <motion.div
        animate={{ x: [0, 40, -20, 0], y: [0, -30, 20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-violet-600/30 blur-[120px]"
      />
      <motion.div
        animate={{ x: [0, -50, 30, 0], y: [0, 40, -20, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-1/3 -right-32 w-[480px] h-[480px] rounded-full bg-cyan-500/25 blur-[120px]"
      />
      <motion.div
        animate={{ x: [0, 30, -40, 0], y: [0, -20, 30, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -bottom-40 left-1/3 w-[500px] h-[500px] rounded-full bg-emerald-500/20 blur-[120px]"
      />
    </div>
  );
}

/** Subtle dotted grid backdrop. */
export function GridBackdrop({ className = '' }: { className?: string }) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none opacity-[0.18] ${className}`}
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)',
        backgroundSize: '32px 32px',
        maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)',
      }}
    />
  );
}
