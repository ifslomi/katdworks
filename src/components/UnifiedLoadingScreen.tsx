import { motion } from 'framer-motion';

type UnifiedLoadingScreenProps = {
  title?: string;
  subtitle?: string;
  fullScreen?: boolean;
};

function SkeletonLine({ className }: { className: string }) {
  return <div className={`skeleton-line ${className}`} aria-hidden="true" />;
}

export function UnifiedLoadingScreen({
  title = 'Loading content',
  subtitle = 'Preparing your experience...',
  fullScreen = true,
}: UnifiedLoadingScreenProps) {
  return (
    <div
      className={`${fullScreen ? 'min-h-screen' : 'min-h-[55vh]'} relative overflow-hidden bg-surface text-on-surface`}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="loader-orb loader-orb-a" aria-hidden="true" />
      <div className="loader-orb loader-orb-b" aria-hidden="true" />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16 md:py-20"
      >
        <div className="mb-8 md:mb-10 flex items-start gap-4">
          <motion.div
            animate={{ scale: [1, 1.03, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="h-12 w-12 rounded-2xl bg-primary text-on-primary shadow-lg shadow-primary/20 flex items-center justify-center font-headline font-bold text-lg"
          >
            K
          </motion.div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-secondary font-bold">KDL Works</p>
            <h1 className="font-headline text-2xl md:text-3xl font-bold text-primary mt-1">{title}</h1>
            <p className="text-sm text-on-surface-variant mt-1">{subtitle}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 skeleton-panel p-5 md:p-6 space-y-4">
            <SkeletonLine className="h-4 w-2/5" />
            <SkeletonLine className="h-12 w-4/5" />
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-11/12" />
            <div className="flex flex-wrap gap-3 pt-2">
              <SkeletonLine className="h-10 w-36 rounded-xl" />
              <SkeletonLine className="h-10 w-44 rounded-xl" />
            </div>
          </div>

          <div className="lg:col-span-4 skeleton-panel p-5 md:p-6 space-y-4">
            <SkeletonLine className="h-4 w-1/3" />
            <SkeletonLine className="h-40 w-full rounded-2xl" />
            <SkeletonLine className="h-3 w-5/6" />
            <SkeletonLine className="h-3 w-3/4" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
