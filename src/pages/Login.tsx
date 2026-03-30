import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, browserSessionPersistence, onAuthStateChanged } from 'firebase/auth';
import { sileo } from 'sileo';
import { auth } from '../firebase';

export default function Login() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigate('/dashboard', { replace: true });
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    sileo.info({
      title: 'Welcome back',
      description: 'Sign in to manage your dashboard content.',
      duration: 2500
    });
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      sileo.warning({
        title: 'Missing credentials',
        description: 'Please enter both email and password.'
      });
      return;
    }

    setLoading(true);
    try {
      await sileo.promise(
        (async () => {
          await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
          return signInWithEmailAndPassword(auth, email, password);
        })(),
        {
          loading: {
            title: 'Signing you in',
            description: 'Verifying your credentials...'
          },
          success: {
            title: 'Login successful',
            description: 'Redirecting to your dashboard.'
          },
          error: {
            title: 'Login failed',
            description: 'Invalid email or password. Please try again.'
          }
        }
      );
      navigate('/dashboard');
    } catch (err: any) {
      console.error(err);
      const code = err?.code || '';
      let description = 'Unable to sign in right now. Please try again.';
      if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
        description = 'Invalid email or password. Please check your credentials.';
      } else if (code.includes('too-many-requests')) {
        description = 'Too many attempts detected. Please wait and try again.';
      } else if (code.includes('network-request-failed')) {
        description = 'Network error. Check your internet connection and retry.';
      }
      sileo.warning({
        title: 'Authentication error',
        description
      });
    } finally {
      setLoading(false);
    }
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  return (
    <div className="bg-surface font-body text-on-surface min-h-screen flex flex-col">
      {/* Top Navigation */}
      <motion.header 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 left-0 w-full z-50 py-6 px-8 flex justify-between items-center glass-header"
      >
        <Link to="/" className="text-xl font-headline font-black tracking-tight text-primary">KDL.</Link>
        <Link to="/" className="text-sm font-label font-medium text-secondary hover:text-primary transition-colors duration-300 flex items-center gap-2">
          <span className="material-symbols-outlined text-sm" data-icon="arrow_back">arrow_back</span>
          Back to Portfolio
        </Link>
      </motion.header>

      <main className="flex-grow flex items-center justify-center px-6 pt-24 pb-12">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-12 gap-0 overflow-hidden rounded-xl editorial-shadow bg-surface-container-lowest"
        >
          {/* Branding/Mood Section */}
          <div className="md:col-span-5 bg-primary-container relative min-h-[300px] flex flex-col justify-end p-12 overflow-hidden">
            {/* Abstract Decorative Element */}
            <div className="absolute top-0 left-0 w-full h-full opacity-20 mix-blend-overlay">
              <div className="absolute -top-24 -left-24 w-96 h-96 bg-secondary-fixed rounded-full blur-3xl"></div>
              <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-primary-fixed-dim rounded-full blur-3xl"></div>
            </div>
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 bg-secondary-container text-on-secondary-container text-[10px] font-label uppercase tracking-widest rounded-full mb-6">Secure Access</span>
              <h1 className="text-4xl lg:text-5xl font-headline font-bold text-on-primary leading-tight mb-4 -ml-1">
                Curating your <br />digital legacy.
              </h1>
              <p className="text-on-primary-container font-body font-light max-w-xs leading-relaxed">
                Welcome back to your curated space. Sign in to manage your professional presence and client experiences.
              </p>
            </div>
            {/* Footer style pattern inside branding */}
            <div className="mt-12 pt-8 border-t border-white/10 relative z-10">
              <p className="text-[10px] text-on-primary-container/60 font-label tracking-wider uppercase">© {currentYear} KDL Works</p>
            </div>
          </div>

          {/* Form Section */}
          <div className="md:col-span-7 p-8 md:p-16 lg:p-20 flex flex-col justify-center bg-surface-container-lowest">
            <motion.div 
              initial="hidden"
              animate="visible"
              variants={{
                visible: { transition: { staggerChildren: 0.1 } }
              }}
              className="max-w-md mx-auto w-full"
            >
              <motion.div variants={fadeUp} className="mb-10">
                <h2 className="text-2xl font-headline font-bold text-primary mb-2">Member Login</h2>
                <p className="text-on-surface-variant text-sm">Enter your credentials to access the dashboard.</p>
              </motion.div>
              
              <form className="space-y-6" onSubmit={handleLogin}>
                {/* Email Field */}
                <motion.div variants={fadeUp} className="space-y-2">
                  <label className="block text-xs font-label font-bold uppercase tracking-widest text-secondary" htmlFor="email">
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-lg" data-icon="mail">mail</span>
                    <input 
                      className="w-full pl-12 pr-4 py-4 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-secondary/20 focus:bg-surface-container transition-all duration-300 text-on-surface placeholder:text-outline/50 font-body text-sm" 
                      id="email" 
                      type="email" 
                      placeholder="admin@example.com" 
                      title="Enter your admin email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </motion.div>
                {/* Password Field */}
                <motion.div variants={fadeUp} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-label font-bold uppercase tracking-widest text-secondary" htmlFor="password">
                      Password
                    </label>
                  </div>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-lg" data-icon="lock">lock</span>
                    <input 
                      className="w-full pl-12 pr-4 py-4 bg-surface-container-low border-none rounded-lg focus:ring-2 focus:ring-secondary/20 focus:bg-surface-container transition-all duration-300 text-on-surface placeholder:text-outline/50 font-body text-sm" 
                      id="password" 
                      type="password" 
                      placeholder="••••••••••••" 
                      title="Enter your account password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </motion.div>
                
                {/* Remember Me */}
                <motion.div variants={fadeUp} className="flex items-center">
                  <input
                    id="rememberMe"
                    type="checkbox"
                    title="Keep me signed in on this device"
                    className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary accent-primary"
                    checked={rememberMe}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRememberMe(checked);
                      sileo.info({
                        title: checked ? 'Remember me enabled' : 'Remember me disabled',
                        description: checked ? 'Session will persist across browser restarts.' : 'Session will end when browser closes.',
                        duration: 2200
                      });
                    }}
                  />
                  <label htmlFor="rememberMe" className="ml-2 block text-sm text-on-surface-variant font-body">
                    Remember me
                  </label>
                </motion.div>

                {/* Action */}
                <motion.button 
                  variants={fadeUp}
                  className="w-full bg-primary text-on-primary py-5 rounded-lg font-label font-bold uppercase tracking-widest text-sm hover:bg-secondary active:scale-[0.98] transition-all duration-300 shadow-lg shadow-primary/10 disabled:opacity-70" 
                  type="submit"
                  title="Sign in to open the admin dashboard"
                  disabled={loading}
                >
                  {loading ? 'Authenticating...' : 'Login to Dashboard'}
                </motion.button>
              </form>
            </motion.div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 px-8 mt-auto flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto border-t border-outline-variant/10">
        <div className="font-headline font-bold text-primary">KDL Works</div>
        <div className="text-[11px] font-label text-secondary-fixed-variant opacity-60 tracking-wider">© {currentYear} KDL Works. ALL RIGHTS RESERVED.</div>
      </footer>
    </div>
  );
}
