import { createContext, useContext, useState, useEffect, useRef, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { sileo } from 'sileo';
import { auth, db, storage } from '../firebase';
import { usePortfolioData, PortfolioData } from '../hooks/usePortfolioData';
import { uploadToCloudinary } from '../utils/localUpload';
import { IconPicker } from '../components/IconPicker';

const ANALYTICS_STATS_DOC = 'portfolio_stats';
const ANALYTICS_COLLECTION = 'analytics';
const ANALYTICS_DAILY_COLLECTION = 'analytics_daily';

const getTodayKey = () => new Date().toISOString().slice(0, 10);

const getReferrerSource = () => {
  const ref = document.referrer.toLowerCase();
  if (!ref) return 'direct';
  if (ref.includes('linkedin')) return 'linkedin';
  if (ref.includes('facebook')) return 'facebook';
  return 'other';
};

function extractFilenameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const rawName = parts[parts.length - 1] || 'portfolio.pdf';
    return decodeURIComponent(rawName.includes('.') ? rawName : `${rawName}.pdf`);
  } catch {
    return 'portfolio.pdf';
  }
}

function toRawDeliveryUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('cloudinary.com')) {
      return url;
    }
    parsed.pathname = parsed.pathname.replace('/image/upload/', '/raw/upload/');
    parsed.pathname = parsed.pathname.replace('/auto/upload/', '/raw/upload/');
    return parsed.toString();
  } catch {
    return url;
  }
}

const EditModeContext = createContext(false);

function InlineText({ value, onChange, className, multiline = false }: { value: string, onChange: (val: string) => void, className?: string, multiline?: boolean }) {
  const isEditMode = useContext(EditModeContext);
  if (!isEditMode) return multiline ? <div className={`whitespace-pre-wrap ${className || ''}`}>{value}</div> : <span className={className}>{value}</span>;
  return multiline ? (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} className={`bg-white/20 border border-white/50 rounded px-2 py-1 w-full min-h-[100px] ${className || ''}`} />
  ) : (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={`bg-white/20 border border-white/50 rounded px-2 py-1 w-full ${className || ''}`} />
  );
}

export default function Portfolio() {
  const location = useLocation();
  const { data, loading, updateData, readError } = usePortfolioData();
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const isAdminPreview = new URLSearchParams(location.search).get('adminPreview') === '1';

  
  // ANALYTICS TRACKING
  useEffect(() => {
    const ensureDocs = async () => {
      const statsRef = doc(db, ANALYTICS_COLLECTION, ANALYTICS_STATS_DOC);
      const dailyRef = doc(db, ANALYTICS_DAILY_COLLECTION, getTodayKey());
      await setDoc(statsRef, {
        views: 0,
        totalViews: 0,
        uniqueVisitors: 0,
        downloads: 0,
        bottomScrolls: 0,
        referrers: { direct: 0, linkedin: 0, facebook: 0, other: 0 },
        updatedAt: serverTimestamp()
      }, { merge: true });
      await setDoc(dailyRef, {
        date: getTodayKey(),
        views: 0,
        downloads: 0,
        bottomScrolls: 0,
        referrers: { direct: 0, linkedin: 0, facebook: 0, other: 0 },
        updatedAt: serverTimestamp()
      }, { merge: true });
      return { statsRef, dailyRef };
    };

    const trackView = async () => {
      try {
        const { statsRef, dailyRef } = await ensureDocs();
        const source = getReferrerSource();
        const visitorKey = 'katdworks_visitor_id';
        const knownVisitor = localStorage.getItem(visitorKey);
        if (!knownVisitor) {
          localStorage.setItem(visitorKey, `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`);
        }
        const updates: Record<string, any> = {
          views: increment(1),
          totalViews: increment(1),
          [`referrers.${source}`]: increment(1),
          updatedAt: serverTimestamp()
        };
        if (!knownVisitor) {
          updates.uniqueVisitors = increment(1);
        }
        await updateDoc(statsRef, updates);
        await updateDoc(dailyRef, {
          views: increment(1),
          [`referrers.${source}`]: increment(1),
          updatedAt: serverTimestamp()
        });
      } catch (err) { }
    };
    trackView();

    let scrolled = false;
    const handleScroll = async () => {
      if (scrolled) return;
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
        scrolled = true;
        try {
          const { statsRef, dailyRef } = await ensureDocs();
          await updateDoc(statsRef, { bottomScrolls: increment(1), updatedAt: serverTimestamp() });
          await updateDoc(dailyRef, { bottomScrolls: increment(1), updatedAt: serverTimestamp() });
        } catch (e) {}
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const trackDownload = async () => {
    try {
      const statsRef = doc(db, ANALYTICS_COLLECTION, ANALYTICS_STATS_DOC);
      const dailyRef = doc(db, ANALYTICS_DAILY_COLLECTION, getTodayKey());
      await setDoc(statsRef, { downloads: 0, updatedAt: serverTimestamp() }, { merge: true });
      await setDoc(dailyRef, { date: getTodayKey(), downloads: 0, updatedAt: serverTimestamp() }, { merge: true });
      await updateDoc(statsRef, { downloads: increment(1), updatedAt: serverTimestamp() });
      await updateDoc(dailyRef, { downloads: increment(1), updatedAt: serverTimestamp() });
    } catch (e) {}
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user);
    });
    return () => unsubscribe();
  }, []);

  const handleFileUpload = async (
    file: File,
    path: string,
    onComplete: (url: string) => void,
    progressKey?: string
  ) => {
    const key = progressKey || path;
    if (!file) return;

    setUploadProgress(prev => ({ ...prev, [key]: 0 }));

    try {
      const url = await uploadToCloudinary(file, path, (progress) => {
        setUploadProgress(prev => ({ ...prev, [key]: progress }));
      });
      onComplete(url);
    } catch (error) {
      console.warn('Local upload failed; falling back to Firebase Storage.', error);
      if (!auth.currentUser) {
        alert('Upload failed. Please log in and try again.');
        return;
      }
      try {
        const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        const url = await new Promise<string>((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const progress = snapshot.totalBytes
                ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
                : 0;
              setUploadProgress(prev => ({ ...prev, [key]: progress }));
            },
            (uploadError) => reject(uploadError),
            async () => {
              try {
                const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                resolve(downloadUrl);
              } catch (downloadError) {
                reject(downloadError);
              }
            }
          );
        });

        onComplete(url);
      } catch (fallbackError) {
        console.error(fallbackError);
        alert(fallbackError instanceof Error ? fallbackError.message : 'Upload failed. Please try again.');
      }
    } finally {
      setUploadProgress(prev => { const n = {...prev}; delete n[key]; return n; });
    }
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const showExperienceSection = isEditMode || (data?.experience?.length || 0) > 0;
  const showSkillsSection = isEditMode || (data?.expertiseCards?.length || 0) > 0 || (data?.skills?.length || 0) > 0;
  const showEducationSection = isEditMode || (data?.education?.length || 0) > 0;
  const showTrainingsSection = isEditMode || (data?.trainings?.length || 0) > 0;
  const showCertificationsSection = isEditMode || (data?.certifications?.length || 0) > 0;
  const showProjectsSection = isEditMode || (data?.projects?.length || 0) > 0;
  const showContactSection =
    isEditMode ||
    Boolean(data?.contact?.intro || data?.contact?.email || data?.contact?.phone || data?.contact?.location);

  const visibleNavLinks = (data?.ui?.navLinks || []).filter((item) => {
    if (item.id === 'experience') return showExperienceSection;
    if (item.id === 'skills') return showSkillsSection;
    if (item.id === 'education') return showEducationSection;
    if (item.id === 'trainings') return showTrainingsSection;
    if (item.id === 'projects') return showProjectsSection;
    if (item.id === 'contact') return showContactSection;
    return true;
  });

  const primaryNavLinks = visibleNavLinks.slice(0, 5);
  const overflowNavLinks = visibleNavLinks.slice(5);

  const handlePortfolioDownload = async () => {
    if (!data?.portfolioPdfUrl) {
      alert('Portfolio PDF has not been uploaded yet.');
      return;
    }

    await trackDownload();
    const sourceUrl = data.portfolioPdfUrl;
    const candidateUrls = [sourceUrl, toRawDeliveryUrl(sourceUrl)].filter((url, idx, arr) => arr.indexOf(url) === idx);

    try {
      let blob: Blob | null = null;
      let lastStatus = 0;
      for (const candidateUrl of candidateUrls) {
        const response = await fetch(candidateUrl);
        lastStatus = response.status;
        if (response.ok) {
          blob = await response.blob();
          break;
        }
      }

      if (!blob) {
        throw new Error(`Download request failed with status ${lastStatus}`);
      }

      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = extractFilenameFromUrl(sourceUrl);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);

      sileo.info({
        title: 'Download started',
        description: 'Your portfolio PDF is being downloaded.'
      });
    } catch (error) {
      console.error('Portfolio download failed:', error);
      const message = error instanceof Error ? error.message : 'Unknown download error';
      sileo.warning({
        title: 'PDF delivery blocked',
        description: `${message}. Check Cloudinary asset access control and allow delivery for PDFs, then re-upload the file.`
      });
    }
  };

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 120);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const sectionIds = visibleNavLinks
      .map((item) => (item.href || '').replace('#', ''))
      .filter(Boolean)
      .map((id) => (id === 'hero' ? id : id));

    if (sectionIds.length === 0) return;

    const observers: IntersectionObserver[] = [];

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting) {
            setActiveSection(id);
          }
        },
        {
          rootMargin: '-32% 0px -58% 0px',
          threshold: 0.01
        }
      );

      observer.observe(el);
      observers.push(observer);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [visibleNavLinks]);

  const handleNavClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const targetId = href.replace('#', '');
    const target = document.getElementById(targetId);
    if (!target) return;

    const top = Math.max(target.getBoundingClientRect().top + window.scrollY - 110, 0);
    window.scrollTo({ top, behavior: 'smooth' });
    setActiveSection(targetId);

    const opened = document.querySelectorAll('details[open]') as NodeListOf<HTMLDetailsElement>;
    opened.forEach((detail) => detail.removeAttribute('open'));
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-surface text-primary">Loading...</div>;
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-primary px-6 text-center">
        <div>
          <h1 className="font-headline text-2xl font-bold mb-3">Portfolio data unavailable</h1>
          <p className="text-sm text-on-surface-variant">
            {readError || 'No Firestore portfolio document found at portfolio/main.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <EditModeContext.Provider value={isEditMode}>
    <div className="font-body selection:bg-secondary-container selection:text-on-secondary-container relative overflow-x-hidden">
      {readError && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-error-container text-on-error-container px-4 py-2 text-xs text-center">
          Live content could not be loaded from Firestore.
        </div>
      )}
      {isAdmin && (
        <div className="fixed bottom-4 left-4 z-50 flex gap-2">
          <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-4 py-2 rounded-full font-bold text-sm shadow-lg transition-colors ${isEditMode ? 'bg-error text-white' : 'bg-primary text-white'}`}
          >
            {isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
          </button>
          <Link to="/dashboard" className="px-4 py-2 rounded-full font-bold text-sm shadow-lg bg-surface-container-highest text-primary hover:bg-outline-variant transition-colors">
            Dashboard
          </Link>
        </div>
      )}

      <div
        className={`origin-top-left transition-transform duration-300 ${isEditMode ? 'scale-[0.93]' : ''}`}
        style={isEditMode ? { width: '107.53%' } : undefined}
      >

      {/* TopNavBar */}
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`${isEditMode ? 'relative top-0' : 'sticky top-4'} mx-auto w-[90%] max-w-5xl rounded-full px-6 py-2 bg-[#faf9f6]/70 backdrop-blur-md flex justify-between items-center relative z-50 shadow-xl shadow-[#1a1c1a]/5`}
      >
        <div className="min-w-[220px] flex items-center gap-3">
          {data.ui.navLogoUrl && (
            <div className="relative group">
              <img
                src={data.ui.navLogoUrl}
                alt="Brand"
                className="w-9 h-9 rounded-xl object-cover border border-outline-variant/30 bg-white"
                referrerPolicy="no-referrer"
              />
              {isEditMode && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl z-10">
                  <button
                    onClick={() => fileInputRefs.current['navLogo']?.click()}
                    className="text-[10px] font-bold bg-white text-primary px-2 py-1 rounded hover:bg-surface-container-low transition-colors"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>
          )}
          {isEditMode && !data.ui.navLogoUrl && (
            <button
              onClick={() => fileInputRefs.current['navLogo']?.click()}
              className="text-[10px] font-bold bg-white/20 text-white px-2 py-1 rounded hover:bg-white/30 transition-colors border border-white/30"
            >
              + Logo
            </button>
          )}
          <input
            type="file"
            accept="image/*"
            ref={el => fileInputRefs.current['navLogo'] = el}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileUpload(file, 'logos', (url) => {
                  updateData({ ui: { ...data.ui, navLogoUrl: url } });
                }, 'navLogo');
              }
              e.currentTarget.value = '';
            }}
            className="hidden"
          />
          <div className="text-xl font-headline font-black text-primary">
            <InlineText value={data.ui.navTitle} onChange={(val) => updateData({ ui: { ...data.ui, navTitle: val } })} />
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-5 absolute left-1/2 -translate-x-1/2">
          {primaryNavLinks.map((item) => (
            <a
              key={item.id}
              className={`relative text-[15px] leading-none font-medium transition-all duration-300 ease-in-out whitespace-nowrap ${activeSection === item.href.replace('#', '') ? 'text-primary' : 'text-secondary hover:text-primary'}`}
              href={item.href || '#'}
              onClick={handleNavClick(item.href || '#')}
            >
              {item.label}
              {activeSection === item.href.replace('#', '') && (
                <motion.span
                  layoutId="active-nav-pill"
                  className="absolute -bottom-2 left-0 right-0 h-[2px] bg-primary rounded-full"
                  transition={{ type: 'spring', stiffness: 520, damping: 38 }}
                />
              )}
            </a>
          ))}
          {overflowNavLinks.length > 0 && (
            <details className="relative group">
              <summary className="list-none cursor-pointer select-none text-secondary text-[15px] font-semibold hover:text-primary transition-colors">
                More
              </summary>
              <div className="absolute right-0 mt-3 w-44 rounded-xl border border-outline-variant/30 bg-white shadow-xl p-2 z-50">
                {overflowNavLinks.map((item) => (
                  <a
                    key={item.id}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${activeSection === item.href.replace('#', '') ? 'bg-surface-container-high text-primary' : 'text-secondary hover:bg-surface-container-low hover:text-primary'}`}
                    href={item.href || '#'}
                    onClick={handleNavClick(item.href || '#')}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="hidden md:block lg:hidden absolute left-1/2 -translate-x-1/2">
          <details className="relative">
            <summary className="list-none cursor-pointer bg-surface-container-highest text-primary px-4 py-2 rounded-lg text-sm font-bold">
              Menu
            </summary>
            <div className="absolute right-0 mt-3 w-48 rounded-xl border border-outline-variant/30 bg-white shadow-xl p-2 z-50">
              {visibleNavLinks.map((item) => (
                <a
                  key={item.id}
                  className={`block rounded-lg px-3 py-2 text-sm transition-colors ${activeSection === item.href.replace('#', '') ? 'bg-surface-container-high text-primary' : 'text-secondary hover:bg-surface-container-low hover:text-primary'}`}
                  href={item.href || '#'}
                  onClick={handleNavClick(item.href || '#')}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </details>
        </div>
        {isAdmin && isAdminPreview ? (
          <button
            type="button"
            onClick={() => {
              sileo.info({
                title: 'Already logged in',
                description: 'You are in admin preview mode. Return to Dashboard to continue editing or logout.'
              });
            }}
            className="bg-primary/70 text-on-primary px-6 py-2 rounded-lg font-label font-bold transition-transform cursor-not-allowed"
          >
            Login
          </button>
        ) : (
          <Link to="/login" className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label font-bold scale-95 hover:scale-100 active:scale-90 transition-transform">
            Login
          </Link>
        )}
      </motion.nav>

      <motion.button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        initial={{ opacity: 0, y: 16, scale: 0.9 }}
        animate={showScrollTop ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.9 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className={`fixed right-6 bottom-6 z-50 w-12 h-12 rounded-full bg-primary text-on-primary shadow-xl shadow-primary/20 hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${showScrollTop ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-label="Scroll to top"
      >
        <span className="material-symbols-outlined text-xl" data-icon="north">north</span>
      </motion.button>

      {/* Hero Section */}
      <section className="relative min-h-[calc(100svh-1.5rem)] flex items-center pt-20 md:pt-24 pb-8 md:pb-10 overflow-hidden bg-surface" id="hero">
        <div className="container mx-auto px-6 md:px-12 lg:px-20 grid md:grid-cols-2 gap-6 md:gap-10 items-center">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="order-2 md:order-1"
          >
            <motion.span variants={fadeUp} className="inline-block px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container font-label text-xs font-bold mb-4 md:mb-6">
              Available for commissions worldwide
            </motion.span>
            <motion.h1 variants={fadeUp} className="font-headline text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-black text-primary leading-[1.04] mb-4 md:mb-5 -tracking-wider">
              <InlineText value={data.hero.headline} onChange={(val) => updateData({ hero: { ...data.hero, headline: val } })} />:<br />
              <InlineText value={data.hero.subheadline} onChange={(val) => updateData({ hero: { ...data.hero, subheadline: val } })} />
            </motion.h1>
            <motion.div variants={fadeUp} className="text-base text-on-surface-variant font-body max-w-lg mb-6 md:mb-7 leading-relaxed">
              <InlineText multiline value={data.hero.description} onChange={(val) => updateData({ hero: { ...data.hero, description: val } })} />
            </motion.div>
            <motion.div variants={fadeUp} className="flex flex-wrap gap-3 md:gap-4">
              <a className="bg-primary text-on-primary px-6 py-3 rounded-lg font-bold text-sm hover:bg-secondary transition-colors duration-300 shadow-lg shadow-primary/10" href="#contact">Contact Me</a>
              <button
                type="button"
                className="bg-surface-container-highest text-primary px-6 py-3 rounded-lg font-bold text-sm hover:bg-outline-variant transition-colors duration-300" 
                onClick={handlePortfolioDownload}
              >
                Download Portfolio
              </button>
            </motion.div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="order-1 md:order-2 relative w-full max-w-md mx-auto md:max-w-none"
          >
            <div className="relative w-fit mx-auto">
              <div className="aspect-square md:aspect-[4/5] max-h-[38vh] md:max-h-[56vh] rounded-xl overflow-hidden shadow-2xl z-10 relative group">
                <img className="w-full h-full object-cover" alt="Professional portrait" src={data.hero.imageUrl} referrerPolicy="no-referrer" />
                {isEditMode && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <input 
                      type="file"
                      accept="image/*"
                      ref={el => fileInputRefs.current['heroImage'] = el}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file, 'images', (url) => updateData({ hero: { ...data.hero, imageUrl: url } }));
                        e.currentTarget.value = '';
                      }}
                      className="hidden"
                    />
                    <button 
                      onClick={() => fileInputRefs.current['heroImage']?.click()}
                      className="bg-white text-primary px-4 py-2 rounded-full font-bold text-sm"
                    >
                      {uploadProgress['images'] !== undefined ? `Uploading... ${Math.round(uploadProgress['images'])}%` : 'Change Image'}
                    </button>
                  </div>
                )}
              </div>
              <div className="absolute -bottom-4 -left-4 md:-bottom-6 md:-left-6 w-32 h-32 md:w-48 md:h-48 bg-primary-container rounded-xl -z-10 opacity-10"></div>
              <div className="absolute -top-4 -right-4 md:-top-6 md:-right-6 w-48 h-48 md:w-64 md:h-64 border-2 border-outline-variant rounded-full -z-10 opacity-30"></div>

              <motion.div
                initial={{ x: 16, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.55 }}
                className="hidden md:flex absolute -right-16 lg:-right-[4.75rem] top-1/2 -translate-y-1/2 flex-col items-center gap-3 z-20"
              >
                <span className="font-label text-[10px] uppercase tracking-widest text-primary">Connect</span>
                {data.ui.socialIcons.map((item) => (
                  <a
                    key={item.id}
                    className="bg-surface-container text-primary rounded-full p-2.5 shadow-md border border-outline-variant/20 hover:bg-secondary hover:text-white transition-all duration-300 hover:translate-x-[-3px]"
                    href={item.link || '#'}
                    target={item.link && item.link !== '#' ? '_blank' : '_self'}
                    rel="noopener noreferrer"
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.icon || 'social'} className="w-5 h-5 rounded object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="material-symbols-outlined" data-icon={item.icon}>{item.icon}</span>
                    )}
                  </a>
                ))}
                {isEditMode && (
                  <div className="mt-2 w-64 bg-white/90 rounded-lg p-3 space-y-2 border border-outline-variant/40 shadow-xl">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-primary">Social Icons</p>
                    {data.ui.socialIcons.map((item, idx) => (
                      <div key={item.id} className="grid grid-cols-1 gap-1">
                        <IconPicker
                          value={item.icon}
                          onChange={(val) => {
                            const next = [...data.ui.socialIcons];
                            next[idx] = { ...next[idx], icon: val };
                            updateData({ ui: { ...data.ui, socialIcons: next } });
                          }}
                          label="Social Icon"
                        />
                        <input
                          value={item.link}
                          onChange={(e) => {
                            const next = [...data.ui.socialIcons];
                            next[idx] = { ...next[idx], link: e.target.value };
                            updateData({ ui: { ...data.ui, socialIcons: next } });
                          }}
                          className="text-xs bg-white border border-outline-variant/40 rounded px-2 py-1"
                          placeholder="https://..."
                        />
                        <input
                          type="file"
                          accept="image/*"
                          ref={el => fileInputRefs.current[`social-${item.id}`] = el}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleFileUpload(file, 'logos', (url) => {
                                const next = [...data.ui.socialIcons];
                                next[idx] = { ...next[idx], imageUrl: url };
                                updateData({ ui: { ...data.ui, socialIcons: next } });
                              }, `social-${item.id}`);
                            }
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => fileInputRefs.current[`social-${item.id}`]?.click()}
                            className="text-[10px] px-2 py-1 rounded bg-primary/10 text-primary hover:bg-primary/20"
                          >
                            {uploadProgress[`social-${item.id}`] !== undefined ? `Uploading ${Math.round(uploadProgress[`social-${item.id}`])}%` : 'Upload Logo'}
                          </button>
                          {item.imageUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                const next = [...data.ui.socialIcons];
                                next[idx] = { ...next[idx], imageUrl: '' };
                                updateData({ ui: { ...data.ui, socialIcons: next } });
                              }}
                              className="text-[10px] px-2 py-1 rounded bg-error/10 text-error hover:bg-error/20"
                            >
                              Remove Logo
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* About Me */}
      <section className="py-16 md:py-24 bg-surface-container-low" id="about">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="max-w-4xl"
          >
            <motion.h2 variants={fadeUp} className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12">
              <InlineText value={data.ui.sectionTitles.about} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, about: val } } })} />
            </motion.h2>
            <div className="grid md:grid-cols-2 gap-8 md:gap-12">
              <motion.div variants={fadeUp} className="text-lg md:text-xl font-headline italic text-on-surface-variant leading-relaxed">
                "<InlineText multiline value={data.about.quote} onChange={(val) => updateData({ about: { ...data.about, quote: val } })} />"
              </motion.div>
              <motion.div variants={fadeUp} className="space-y-4 md:space-y-6 text-on-surface text-base leading-relaxed">
                {data.about.paragraphs.map((p, i) => (
                  <div key={i} className="relative group">
                    <InlineText multiline value={p} onChange={(val) => {
                      const newParas = [...data.about.paragraphs];
                      newParas[i] = val;
                      updateData({ about: { ...data.about, paragraphs: newParas } });
                    }} />
                    {isEditMode && (
                      <button 
                        onClick={() => {
                          const newParas = data.about.paragraphs.filter((_, idx) => idx !== i);
                          updateData({ about: { ...data.about, paragraphs: newParas } });
                        }}
                        className="absolute -right-10 top-0 text-error hover:text-error/80 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove Paragraph"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    )}
                  </div>
                ))}
                {isEditMode && (
                  <button 
                    onClick={() => {
                      updateData({ about: { ...data.about, paragraphs: [...data.about.paragraphs, "New paragraph..."] } });
                    }}
                    className="text-primary font-bold text-sm hover:underline flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">add</span> Add Paragraph
                  </button>
                )}
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Experience - Timeline */}
      {showExperienceSection && (
      <section className="py-16 md:py-24 bg-surface" id="experience">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
            className="flex flex-col md:flex-row justify-between items-baseline mb-12 md:mb-16"
          >
            <h2 className="font-headline text-3xl md:text-4xl font-bold text-primary">
              <InlineText value={data.ui.sectionTitles.experience} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, experience: val } } })} />
            </h2>
        
          </motion.div>
          <div className="space-y-12 md:space-y-16">
            {data.experience.map((exp, index) => (
              <motion.div 
                key={exp.id}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={fadeUp}
                className="relative pl-8 md:pl-0 group"
              >
                {isEditMode && (
                  <button 
                    onClick={() => {
                      const newExp = data.experience.filter((_, idx) => idx !== index);
                      updateData({ experience: newExp });
                    }}
                    className="absolute -right-10 top-0 text-error hover:text-error/80 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    title="Remove Experience"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                )}
                {index === 0 && <div className="hidden md:block absolute left-[50%] top-0 bottom-0 w-[1px] bg-outline-variant"></div>}
                <div className="grid md:grid-cols-2 gap-4 md:gap-8 items-start">
                  <div className="md:text-right md:pr-12">
                    <h3 className="font-headline text-xl md:text-2xl font-bold text-primary">
                      <InlineText value={exp.title} onChange={(val) => {
                        const newExp = [...data.experience];
                        newExp[index].title = val;
                        updateData({ experience: newExp });
                      }} />
                    </h3>
                    <p className="text-secondary font-bold mb-1 md:mb-2">
                      <InlineText value={exp.company} onChange={(val) => {
                        const newExp = [...data.experience];
                        newExp[index].company = val;
                        updateData({ experience: newExp });
                      }} />
                    </p>
                    <span className="text-xs md:text-sm font-label text-on-surface-variant">
                      <InlineText value={exp.period} onChange={(val) => {
                        const newExp = [...data.experience];
                        newExp[index].period = val;
                        updateData({ experience: newExp });
                      }} />
                    </span>
                  </div>
                  <div className="md:pl-12">
                    <InlineText multiline value={exp.description} className="text-on-surface text-base leading-relaxed" onChange={(val) => {
                      const newExp = [...data.experience];
                      newExp[index].description = val;
                      updateData({ experience: newExp });
                    }} />
                  </div>
                </div>
              </motion.div>
            ))}
            {isEditMode && (
              <div className="text-center mt-8">
                <button 
                  onClick={() => {
                    const newExp = [...data.experience, { id: Date.now().toString(), title: "New Title", company: "New Company", period: "New Period", description: "New Description" }];
                    updateData({ experience: newExp });
                  }}
                  className="bg-primary/10 text-primary px-6 py-2 rounded-lg font-bold text-sm hover:bg-primary/20 transition-colors"
                >
                  + Add Experience
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      )}

      {/* Education */}
      {showEducationSection && (
      <section className="py-16 md:py-24 bg-surface-container-low" id="education">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12"
          >
            <InlineText value={data.ui.sectionTitles.education} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, education: val } } })} />
          </motion.h2>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {data.education.map((entry, index) => (
              <motion.div key={entry.id} variants={fadeUp} className="relative group bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10">
                {isEditMode && (
                  <button
                    onClick={() => {
                      const next = data.education.filter((_, idx) => idx !== index);
                      updateData({ education: next });
                    }}
                    className="absolute right-3 top-3 text-error hover:text-error/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove Education"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                )}
                <h3 className="font-headline text-xl font-bold text-primary mb-1">
                  <InlineText value={entry.program} onChange={(val) => {
                    const next = [...data.education];
                    next[index] = { ...next[index], program: val };
                    updateData({ education: next });
                  }} />
                </h3>
                <p className="text-secondary font-semibold mb-1">
                  <InlineText value={entry.school} onChange={(val) => {
                    const next = [...data.education];
                    next[index] = { ...next[index], school: val };
                    updateData({ education: next });
                  }} />
                </p>
                <p className="text-xs uppercase tracking-widest text-on-surface-variant mb-3">
                  <InlineText value={entry.period} onChange={(val) => {
                    const next = [...data.education];
                    next[index] = { ...next[index], period: val };
                    updateData({ education: next });
                  }} />
                </p>
                <InlineText multiline value={entry.details} className="text-sm text-on-surface-variant leading-relaxed" onChange={(val) => {
                  const next = [...data.education];
                  next[index] = { ...next[index], details: val };
                  updateData({ education: next });
                }} />
              </motion.div>
            ))}
            {isEditMode && (
              <motion.div variants={fadeUp} className="flex items-center justify-center min-h-[220px] rounded-xl border-2 border-dashed border-outline-variant/50 hover:border-primary transition-colors">
                <button
                  onClick={() => {
                    updateData({
                      education: [
                        ...data.education,
                        {
                          id: Date.now().toString(),
                          program: "New Program",
                          school: "School Name",
                          period: "Year",
                          details: "Program details"
                        }
                      ]
                    });
                  }}
                  className="text-primary font-bold"
                >
                  + Add Education
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>
      )}

      {/* Trainings and Seminars */}
      {showTrainingsSection && (
      <section className="py-16 md:py-24 bg-surface" id="trainings">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12"
          >
            <InlineText value={data.ui.sectionTitles.trainings} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, trainings: val } } })} />
          </motion.h2>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="space-y-4"
          >
            {data.trainings.map((entry, index) => (
              <motion.div key={entry.id} variants={fadeUp} className="relative group bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10">
                {isEditMode && (
                  <button
                    onClick={() => {
                      const next = data.trainings.filter((_, idx) => idx !== index);
                      updateData({ trainings: next });
                    }}
                    className="absolute right-3 top-3 text-error hover:text-error/80 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove Training"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                )}
                <div className="grid md:grid-cols-[2fr_1fr] gap-4">
                  <div>
                    <h3 className="font-headline text-lg font-bold text-primary mb-1">
                      <InlineText value={entry.title} onChange={(val) => {
                        const next = [...data.trainings];
                        next[index] = { ...next[index], title: val };
                        updateData({ trainings: next });
                      }} />
                    </h3>
                    <p className="text-secondary font-semibold text-sm mb-2">
                      <InlineText value={entry.provider} onChange={(val) => {
                        const next = [...data.trainings];
                        next[index] = { ...next[index], provider: val };
                        updateData({ trainings: next });
                      }} />
                    </p>
                    <InlineText multiline value={entry.details} className="text-sm text-on-surface-variant" onChange={(val) => {
                      const next = [...data.trainings];
                      next[index] = { ...next[index], details: val };
                      updateData({ trainings: next });
                    }} />
                  </div>
                  <div className="md:text-right">
                    <span className="inline-block text-xs uppercase tracking-widest bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full">
                      <InlineText value={entry.date} onChange={(val) => {
                        const next = [...data.trainings];
                        next[index] = { ...next[index], date: val };
                        updateData({ trainings: next });
                      }} />
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
            {isEditMode && (
              <motion.div variants={fadeUp} className="text-center">
                <button
                  onClick={() => {
                    updateData({
                      trainings: [
                        ...data.trainings,
                        {
                          id: Date.now().toString(),
                          title: "New Training",
                          provider: "Provider",
                          date: "Year",
                          details: "Training details"
                        }
                      ]
                    });
                  }}
                  className="bg-primary/10 text-primary px-6 py-2 rounded-lg font-bold text-sm hover:bg-primary/20 transition-colors"
                >
                  + Add Training or Seminar
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>
      )}

      {/* Skills - Bento Grid */}
      {showSkillsSection && (
      <section className="py-16 md:py-24 bg-surface-container" id="skills">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.h2 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12"
          >
            <InlineText value={data.ui.sectionTitles.skills} onChange={(val) => updateData({ ui: { ...data.ui, expertiseTitle: val, sectionTitles: { ...data.ui.sectionTitles, skills: val } } })} />
          </motion.h2>
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-4 gap-4"
          >
            {data.expertiseCards.map((card, idx) => {
              const cardClassName = [
                'md:col-span-2 bg-surface-container-lowest p-6 md:p-8 rounded-xl shadow-sm border border-outline-variant/10 hover:-translate-y-1 transition-transform duration-300',
                'bg-primary text-on-primary p-6 md:p-8 rounded-xl hover:-translate-y-1 transition-transform duration-300',
                'bg-surface-container-highest p-6 md:p-8 rounded-xl hover:-translate-y-1 transition-transform duration-300',
                'bg-secondary-container p-6 md:p-8 rounded-xl hover:-translate-y-1 transition-transform duration-300'
              ][idx] || 'bg-surface-container-lowest p-6 md:p-8 rounded-xl shadow-sm border border-outline-variant/10 hover:-translate-y-1 transition-transform duration-300';

              const iconClassName = [
                'material-symbols-outlined text-secondary text-3xl mb-3 md:mb-4',
                'material-symbols-outlined text-primary-fixed-dim text-3xl mb-3 md:mb-4',
                'material-symbols-outlined text-secondary text-3xl mb-3 md:mb-4',
                'material-symbols-outlined text-on-secondary-container text-3xl mb-3 md:mb-4'
              ][idx] || 'material-symbols-outlined text-secondary text-3xl mb-3 md:mb-4';

              const titleClassName = [
                'font-headline text-xl md:text-2xl font-bold text-primary mb-2 md:mb-3',
                'font-headline text-lg md:text-xl font-bold mb-2 md:mb-3',
                'font-headline text-lg md:text-xl font-bold text-primary mb-2 md:mb-3',
                'font-headline text-lg md:text-xl font-bold text-on-secondary-container mb-2 md:mb-3'
              ][idx] || 'font-headline text-lg md:text-xl font-bold text-primary mb-2 md:mb-3';

              const descriptionClassName = [
                'text-on-surface-variant text-sm md:text-base',
                'text-on-primary/80 text-xs md:text-sm',
                'text-on-surface-variant text-xs md:text-sm',
                'text-on-secondary-container/80 text-xs md:text-sm'
              ][idx] || 'text-on-surface-variant text-xs md:text-sm';

              return (
                <motion.div key={card.id} variants={fadeUp} className={cardClassName}>
                  <span className={iconClassName} data-icon={card.icon}>{card.icon}</span>
                  {isEditMode && (
                    <div className="mb-3 w-full">
                      <IconPicker
                        value={card.icon}
                        onChange={(val) => {
                          const next = [...data.expertiseCards];
                          next[idx] = { ...next[idx], icon: val };
                          updateData({ expertiseCards: next });
                        }}
                        label="Card Icon"
                      />
                    </div>
                  )}
                  <h4 className={titleClassName}>
                    <InlineText value={card.title} onChange={(val) => {
                      const next = [...data.expertiseCards];
                      next[idx] = { ...next[idx], title: val };
                      updateData({ expertiseCards: next });
                    }} />
                  </h4>
                  <InlineText multiline className={descriptionClassName} value={card.description} onChange={(val) => {
                    const next = [...data.expertiseCards];
                    next[idx] = { ...next[idx], description: val };
                    updateData({ expertiseCards: next });
                  }} />
                </motion.div>
              );
            })}
            {/* Tech Stack */}
            <motion.div variants={fadeUp} className="md:col-span-3 bg-surface-container-lowest p-6 md:p-8 rounded-xl flex flex-col md:flex-row gap-4 md:items-center">
              <span className="font-label text-xs md:text-sm font-bold text-secondary uppercase tracking-widest md:mr-4">Tech Arsenal:</span>
              <div className="flex flex-wrap gap-2">
                {data.skills.map((skill, i) => (
                  <span key={i} className="relative group px-3 py-1.5 md:px-4 md:py-2 bg-surface-container-high rounded-full text-[10px] md:text-xs font-bold text-primary hover:bg-secondary hover:text-white transition-colors cursor-default">
                    <InlineText value={skill} onChange={(val) => {
                      const newSkills = [...data.skills];
                      newSkills[i] = val;
                      updateData({ skills: newSkills });
                    }} />
                    {isEditMode && (
                      <button 
                        onClick={() => {
                          const newSkills = data.skills.filter((_, idx) => idx !== i);
                          updateData({ skills: newSkills });
                        }}
                        className="absolute -top-2 -right-2 bg-error text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {isEditMode && (
                  <button 
                    onClick={() => {
                      updateData({ skills: [...data.skills, "New Skill"] });
                    }}
                    className="px-3 py-1.5 md:px-4 md:py-2 bg-primary/10 text-primary rounded-full text-[10px] md:text-xs font-bold hover:bg-primary/20 transition-colors"
                  >
                    + Add Skill
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>
      )}

      {/* Certifications */}
      {showCertificationsSection && (
      <section className="py-14 md:py-18 bg-surface" id="certifications">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.h2 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-6 md:mb-8"
          >
            <InlineText value={data.ui.certificationsTitle} onChange={(val) => updateData({ ui: { ...data.ui, certificationsTitle: val } })} />
          </motion.h2>
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6"
          >
            {data.certifications.map((cert, i) => (
              <motion.div key={cert.id} variants={fadeUp} className="group relative bg-surface-container-lowest rounded-xl border border-outline-variant/10 shadow-sm overflow-hidden flex flex-col hover:-translate-y-1 transition-transform duration-300">
                {isEditMode && (
                  <button 
                    onClick={() => {
                      const newCerts = data.certifications.filter((_, idx) => idx !== i);
                      updateData({ certifications: newCerts });
                    }}
                    className="absolute right-2 top-2 text-error bg-white rounded-full p-1 hover:text-error/80 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow border border-error/10"
                    title="Remove Certification"
                  >
                    <span className="material-symbols-outlined text-sm">delete</span>
                  </button>
                )}
                
                {/* Visual Header Part */}
                <div className={`aspect-[5/3] w-full flex items-center justify-center relative overflow-hidden ${cert.bgColor || 'bg-secondary-container text-on-secondary-container'}`}>
                  {cert.imageUrl ? (
                    <img src={cert.imageUrl} alt={cert.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="material-symbols-outlined text-5xl drop-shadow-md" data-icon={cert.iconName || 'workspace_premium'} style={{ fontVariationSettings: "'FILL' 1" }}>
                      {cert.iconName || 'workspace_premium'}
                    </span>
                  )}
                  {isEditMode && !cert.imageUrl && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 backdrop-blur-[2px]">
                      <button
                        onClick={() => fileInputRefs.current[`cert-${cert.id}`]?.click()}
                        className="text-xs font-bold bg-white text-primary px-4 py-2 rounded-full hover:bg-surface-container-low transition-colors shadow-lg"
                      >
                        Upload Image Proof
                      </button>
                    </div>
                  )}
                </div>

                {/* Content Floor */}
                <div className="p-4 md:p-5 flex flex-col flex-1 bg-surface">
                  <h5 className="font-headline font-bold text-lg md:text-xl text-primary leading-tight mb-1.5">
                    <InlineText value={cert.title} onChange={(val) => {
                      const newCerts = [...data.certifications];
                      newCerts[i].title = val;
                      updateData({ certifications: newCerts });
                    }} />
                  </h5>
                  <p className="text-xs md:text-sm font-medium text-secondary mb-3">
                    <InlineText value={cert.issuer} onChange={(val) => {
                      const newCerts = [...data.certifications];
                      newCerts[i].issuer = val;
                      updateData({ certifications: newCerts });
                    }} />
                  </p>
                  
                  {isEditMode && (
                    <div className="mt-auto pt-4 border-t border-outline-variant/20 space-y-3">
                      <div className="text-[10px] font-bold text-outline-variant uppercase">Admin Controls</div>
                      <IconPicker
                        value={cert.iconName || ''}
                        onChange={(val) => {
                          const newCerts = [...data.certifications];
                          newCerts[i].iconName = val;
                          updateData({ certifications: newCerts });
                        }}
                        label="Certification Icon"
                      />
                      <select
                        value={cert.bgColor || 'bg-secondary-container text-on-secondary-container'}
                        onChange={(e) => {
                          const newCerts = [...data.certifications];
                          newCerts[i].bgColor = e.target.value;
                          updateData({ certifications: newCerts });
                        }}
                        className="w-full bg-white border border-outline-variant/40 rounded px-2 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none"
                      >
                        <option value="bg-tertiary-container text-primary-fixed">Soft Gold & Brown</option>
                        <option value="bg-surface-container-highest text-primary">Slate & Dark</option>
                        <option value="bg-secondary-container text-on-secondary-container">Warm Gray & Espresso</option>
                        <option value="bg-primary/10 text-primary">Classic Brand</option>
                      </select>
                      
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          accept="image/*"
                          ref={el => fileInputRefs.current[`cert-${cert.id}`] = el}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleFileUpload(file, 'certificates', (url) => {
                                const newCerts = [...data.certifications];
                                newCerts[i].imageUrl = url;
                                updateData({ certifications: newCerts });
                              }, `cert-${cert.id}`);
                            }
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRefs.current[`cert-${cert.id}`]?.click()}
                          className="flex-1 text-xs font-bold bg-primary/10 text-primary px-2 py-2 rounded hover:bg-primary/20 transition-colors"
                        >
                          {uploadProgress[`cert-${cert.id}`] !== undefined ? `Uploading ${Math.round(uploadProgress[`cert-${cert.id}`])}%` : (cert.imageUrl ? 'Change Image' : 'Upload Image')}
                        </button>
                        {cert.imageUrl && (
                          <button
                            onClick={() => {
                              const newCerts = [...data.certifications];
                              newCerts[i].imageUrl = '';
                              updateData({ certifications: newCerts });
                            }}
                            className="text-xs font-bold bg-error/10 text-error px-3 py-2 rounded hover:bg-error/20 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {isEditMode && (
              <motion.div variants={fadeUp} className="flex items-center justify-center col-span-1 md:col-span-3 lg:col-span-4">
                <button 
                  onClick={() => {
                    const newCerts = [...data.certifications, { id: Date.now().toString(), title: "New Certification", issuer: "New Issuer", iconName: "workspace_premium", imageUrl: "" }];
                    updateData({ certifications: newCerts });
                  }}
                  className="bg-primary/10 text-primary px-6 py-2 rounded-lg font-bold text-sm hover:bg-primary/20 transition-colors"
                >
                  + Add Certification
                </button>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>
      )}

      {/* Projects Section */}
      {showProjectsSection && (
      <section className="py-14 md:py-18 bg-surface-container-low" id="projects">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.h2 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-6 md:mb-8"
          >
            <InlineText value={data.ui.sectionTitles.projects} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, projects: val } } })} />
          </motion.h2>
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-7"
          >
            {(showAllProjects ? data.projects : data.projects.slice(0, 4)).map((project, index) => (
              <motion.div key={project.id} variants={fadeUp} className="group cursor-pointer relative max-w-[24rem] w-full">
                {isEditMode && (
                  <button 
                    onClick={() => {
                      const newProjects = data.projects.filter(p => p.id !== project.id);
                      updateData({ projects: newProjects });
                    }}
                    className="absolute -right-4 -top-4 text-error hover:text-error/80 opacity-0 group-hover:opacity-100 transition-opacity z-20 bg-white rounded-full shadow-md p-1"
                    title="Remove Project"
                  >
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                )}
                <div className="aspect-[16/10] rounded-xl overflow-hidden mb-3 md:mb-4 relative">
                  <img src={project.imageUrl} alt={project.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" referrerPolicy="no-referrer" />
                  {isEditMode && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <input 
                        type="file"
                        accept="image/*"
                        ref={el => fileInputRefs.current[`project-${project.id}`] = el}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'images', (url) => {
                            const newProjects = [...data.projects];
                            const pIndex = newProjects.findIndex(p => p.id === project.id);
                            if (pIndex !== -1) {
                              newProjects[pIndex].imageUrl = url;
                              updateData({ projects: newProjects });
                            }
                          });
                          e.currentTarget.value = '';
                        }}
                        className="hidden"
                      />
                      <button 
                        onClick={() => fileInputRefs.current[`project-${project.id}`]?.click()}
                        className="bg-white text-primary px-4 py-2 rounded-full font-bold text-sm"
                      >
                        Change Image
                      </button>
                    </div>
                  )}
                </div>
                <h3 className="font-headline text-lg md:text-xl font-bold text-primary mb-1.5 group-hover:text-secondary transition-colors">
                  <InlineText value={project.title} onChange={(val) => {
                    const newProjects = [...data.projects];
                    const pIndex = newProjects.findIndex(p => p.id === project.id);
                    if (pIndex !== -1) {
                      newProjects[pIndex].title = val;
                      updateData({ projects: newProjects });
                    }
                  }} />
                </h3>
                <InlineText multiline value={project.description} className="text-on-surface-variant text-sm leading-relaxed" onChange={(val) => {
                  const newProjects = [...data.projects];
                  const pIndex = newProjects.findIndex(p => p.id === project.id);
                  if (pIndex !== -1) {
                    newProjects[pIndex].description = val;
                    updateData({ projects: newProjects });
                  }
                }} />
                {(project.itemCount || (project.tags && project.tags.length > 0)) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {project.itemCount && (
                      <span className="text-[10px] uppercase tracking-widest bg-secondary-container text-on-secondary-container px-2 py-1 rounded-full">
                        {project.itemCount}
                      </span>
                    )}
                    {(project.tags || []).map((tag) => (
                      <span key={`${project.id}-${tag}`} className="text-[10px] uppercase tracking-widest bg-surface-container-high px-2 py-1 rounded-full text-secondary">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {project.link && project.link !== '#' && (
                  <a href={project.link} target="_blank" rel="noopener noreferrer" className="inline-flex mt-4 text-xs font-bold text-primary hover:text-secondary transition-colors">
                    {project.ctaLabel || 'View Project'}
                  </a>
                )}
              </motion.div>
            ))}
            {isEditMode && (
              <motion.div variants={fadeUp} className="flex items-center justify-center aspect-video rounded-xl border-2 border-dashed border-outline-variant hover:border-primary transition-colors cursor-pointer"
                onClick={() => {
                  const newProjects = [...data.projects, { id: Date.now().toString(), title: "New Project", description: "New Description", link: "#", imageUrl: "https://picsum.photos/seed/newproject/800/600" }];
                  updateData({ projects: newProjects });
                }}
              >
                <div className="text-center">
                  <span className="material-symbols-outlined text-4xl text-primary mb-2">add_circle</span>
                  <p className="font-bold text-primary">Add Project</p>
                </div>
              </motion.div>
            )}
          </motion.div>
          
          {data.projects.length > 4 && (
            <div className="mt-12 text-center">
              <button 
                onClick={() => setShowAllProjects(!showAllProjects)}
                className="bg-surface-container-highest text-primary px-8 py-3 rounded-lg font-bold text-sm hover:bg-outline-variant transition-colors duration-300"
              >
                {showAllProjects ? "Show Less" : "View more other projects"}
              </button>
            </div>
          )}
        </div>
      </section>
      )}

      {/* Contact Me */}
      {showContactSection && (
      <section className="py-16 md:py-24 bg-surface" id="contact">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="max-w-6xl mx-auto bg-surface-container-lowest rounded-xl overflow-hidden shadow-2xl flex flex-col md:flex-row"
          >
            <div className="md:w-1/2 p-8 md:p-12 bg-primary text-on-primary">
              <h2 className="font-headline text-3xl md:text-4xl font-bold mb-6 md:mb-8">
                <InlineText value={data.ui.sectionTitles.contact} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, contact: val } } })} />
              </h2>
              <div className="text-primary-fixed-dim mb-8 md:mb-12 text-base md:text-lg">
                <InlineText multiline value={data.contact.intro} onChange={(val) => updateData({ contact: { ...data.contact, intro: val } })} />
              </div>
              <div className="space-y-4 md:space-y-6">
                <div className="flex items-center gap-3 md:gap-4">
                  <span className="material-symbols-outlined text-secondary-fixed text-lg md:text-xl" data-icon="mail">mail</span>
                  <span className="font-medium text-sm md:text-base">
                    <InlineText value={data.contact.email} onChange={(val) => updateData({ contact: { ...data.contact, email: val } })} />
                  </span>
                </div>
                <div className="flex items-center gap-3 md:gap-4">
                  <span className="material-symbols-outlined text-secondary-fixed text-lg md:text-xl" data-icon="call">call</span>
                  <span className="font-medium text-sm md:text-base">
                    <InlineText value={data.contact.phone} onChange={(val) => updateData({ contact: { ...data.contact, phone: val } })} />
                  </span>
                </div>
                <div className="flex items-center gap-3 md:gap-4">
                  <span className="material-symbols-outlined text-secondary-fixed text-lg md:text-xl" data-icon="location_on">location_on</span>
                  <span className="font-medium text-sm md:text-base">
                    <InlineText value={data.contact.location} onChange={(val) => updateData({ contact: { ...data.contact, location: val } })} />
                  </span>
                </div>
              </div>
            </div>
            <div className="md:w-1/2 p-8 md:p-12">
              <form action="#" className="space-y-4 md:space-y-6" method="POST">
                <div>
                  <label className="block text-xs md:text-sm font-label font-bold text-primary mb-1 md:mb-2">Name</label>
                  <input className="w-full bg-surface-container border-none rounded-lg focus:ring-2 focus:ring-secondary text-primary p-3 md:p-4 text-sm md:text-base" placeholder="Julien Dupont" type="text" />
                </div>
                <div>
                  <label className="block text-xs md:text-sm font-label font-bold text-primary mb-1 md:mb-2">Email Address</label>
                  <input className="w-full bg-surface-container border-none rounded-lg focus:ring-2 focus:ring-secondary text-primary p-3 md:p-4 text-sm md:text-base" placeholder="julien@agency.com" type="email" />
                </div>
                <div>
                  <label className="block text-xs md:text-sm font-label font-bold text-primary mb-1 md:mb-2">How can I support you?</label>
                  <textarea className="w-full bg-surface-container border-none rounded-lg focus:ring-2 focus:ring-secondary text-primary p-3 md:p-4 text-sm md:text-base" placeholder="Tell me about your vision..." rows={4}></textarea>
                </div>
                <button className="w-full bg-primary text-on-primary py-3 md:py-4 rounded-lg font-bold text-sm md:text-base hover:bg-secondary transition-all duration-300" type="submit">Send Inquiry</button>
              </form>
            </div>
          </motion.div>
        </div>
      </section>
      )}

      {/* Footer */}
      <footer className="w-full py-8 md:py-12 px-6 md:px-8 mt-12 md:mt-20 bg-surface-container border-t border-outline-variant/30">
        <div className="flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto gap-8">
          <div className="text-center md:text-left">
            <div className="font-headline font-bold text-2xl text-primary mb-2 flex items-center justify-center md:justify-start gap-3">
              {data.ui.footerLogoUrl && (
                <div className="relative group">
                  <img
                    src={data.ui.footerLogoUrl}
                    alt="Footer brand"
                    className="w-8 h-8 rounded-lg object-cover border border-outline-variant/20"
                    referrerPolicy="no-referrer"
                  />
                  {isEditMode && (
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg z-10">
                      <button
                        onClick={() => fileInputRefs.current['footerLogo']?.click()}
                        className="text-[10px] font-bold bg-white text-primary px-2 py-1 rounded hover:bg-surface-container-low transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              )}
              {isEditMode && !data.ui.footerLogoUrl && (
                <button
                  onClick={() => fileInputRefs.current['footerLogo']?.click()}
                  className="text-[10px] font-bold bg-surface-container-highest text-primary px-2 py-1 rounded hover:bg-outline-variant transition-colors border border-outline-variant/20"
                >
                  + Logo
                </button>
              )}
              <input
                type="file"
                accept="image/*"
                ref={el => fileInputRefs.current['footerLogo'] = el}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleFileUpload(file, 'logos', (url) => {
                      updateData({ ui: { ...data.ui, footerLogoUrl: url } });
                    }, 'footerLogo');
                  }
                  e.currentTarget.value = '';
                }}
                className="hidden"
              />
              <InlineText value={data.ui.footerTitle} onChange={(val) => updateData({ ui: { ...data.ui, footerTitle: val } })} />
            </div>
            <p className="text-secondary font-body text-sm">© 2024 {data.ui.footerTitle}. All rights reserved.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            <a className="text-secondary font-medium hover:text-primary transition-colors" href="#">Privacy Policy</a>
            <a className="text-secondary font-medium hover:text-primary transition-colors" href="#">Terms of Service</a>
            <a className="text-secondary font-medium hover:text-primary transition-colors" href="#">Contact Info</a>
          </div>
        </div>
      </footer>
      </div>
    </div>
    </EditModeContext.Provider>
  );
}
