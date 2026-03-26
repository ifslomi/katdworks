import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Footer } from '../components/Footer';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-surface text-on-surface flex flex-col">
      <div className="relative overflow-hidden flex-1 flex items-center justify-center px-6 py-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-secondary-container/50 blur-3xl" />
          <div className="absolute -bottom-24 -right-16 w-80 h-80 rounded-full bg-primary-container/30 blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="relative max-w-xl w-full rounded-2xl border border-outline-variant/40 bg-surface-container-low p-8 md:p-10 editorial-shadow"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-secondary font-bold mb-3">Route Not Found</p>
          <h1 className="font-headline text-4xl md:text-5xl text-primary font-black tracking-tight mb-4">404</h1>
          <p className="text-sm md:text-base text-on-surface-variant leading-relaxed mb-8">
            This page does not exist or may have been moved. Use one of the links below to continue.
          </p>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/"
              className="px-5 py-3 rounded-lg bg-primary text-on-primary font-bold text-sm hover:bg-secondary transition-colors"
            >
              Go To Portfolio
            </Link>
            <Link
              to="/dashboard"
              className="px-5 py-3 rounded-lg bg-surface-container-highest text-primary font-bold text-sm hover:bg-outline-variant transition-colors"
            >
              Open Dashboard
            </Link>
            <Link
              to="/login"
              className="px-5 py-3 rounded-lg border border-outline text-primary font-bold text-sm hover:bg-surface-container-high transition-colors"
            >
              Admin Login
            </Link>
          </div>
        </motion.div>
      </div>

      <Footer />
    </div>
  );
}
