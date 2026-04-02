import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type FormEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import { doc, getDoc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';
import { sileo } from 'sileo';
import { auth, db, storage } from '../firebase';
import { usePortfolioData, DEFAULT_SECTION_VISIBILITY, type PortfolioData, PortfolioSectionKey } from '../hooks/usePortfolioData';
import { uploadToCloudinary } from '../utils/localUpload';
import { IconPicker } from '../components/IconPicker';
import { Footer } from '../components/Footer';
import { UnifiedLoadingScreen } from '../components/UnifiedLoadingScreen';

const ANALYTICS_STATS_DOC = 'portfolio_stats';
const ANALYTICS_COLLECTION = 'analytics';
const ANALYTICS_DAILY_COLLECTION = 'analytics_daily';
const NAV_LOCK_ENGAGE_Y = 4;
const NAV_LOCK_RELEASE_Y = 24;
const SECTION_RENDER_ORDER: PortfolioSectionKey[] = [
  'home',
  'about',
  'experience',
  'education',
  'trainings',
  'skills',
  'certifications',
  'projects',
  'contact',
];

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

function mergeGalleryImages(primaryUrl?: string, imageUrls?: string[]) {
  const merged = [...(primaryUrl ? [primaryUrl] : []), ...(imageUrls || [])];
  return merged.filter((url, index, arr) => Boolean(url) && arr.indexOf(url) === index);
}

function getUploadProgressByPrefix(uploadProgress: Record<string, number>, prefix: string) {
  const matches = Object.entries(uploadProgress)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, progress]) => progress);

  if (matches.length === 0) return null;

  const total = matches.reduce((sum, value) => sum + value, 0);
  return Math.round(total / matches.length);
}

function normalizeText(value?: string) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function getPreviewText(value?: string, maxLength = 160) {
  const clean = normalizeText(value);
  if (!clean) return '';
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength).trimEnd()}...`;
}

function getCertificationIssuerLabel(issuer?: string) {
  const clean = normalizeText(issuer);
  if (!clean) return '';

  // Preserve short organization names; hide legacy long-form issuer text from the label.
  if (clean.length > 90 && /[.!?]/.test(clean)) return '';

  return clean;
}

function getCertificationDetailText(cert?: { issuer?: string; details?: string }) {
  const explicitDetails = normalizeText(cert?.details);
  if (explicitDetails) return explicitDetails;

  const legacyIssuer = normalizeText(cert?.issuer);
  if (!legacyIssuer) return '';

  // Backwards compatibility: some older entries stored details in the issuer field.
  if (legacyIssuer.length > 90 || (legacyIssuer.length > 70 && /[.!?]/.test(legacyIssuer))) {
    return legacyIssuer;
  }

  return '';
}

type ContactApiResponse = {
  ok?: boolean;
  error?: string;
};

const EditModeContext = createContext(false);

function InlineText({ value, onChange, className, multiline = false }: { value: string, onChange: (val: string) => void, className?: string, multiline?: boolean }) {
  const isEditMode = useContext(EditModeContext);
  if (!isEditMode) return multiline ? <div className={`whitespace-pre-wrap ${className || ''}`}>{value}</div> : <span className={className}>{value}</span>;
  return multiline ? (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} className={`bg-white/20 border border-white/50 rounded px-2 py-1 w-full min-h-[100px] text-primary ${className || ''}`} />
  ) : (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={`bg-white/20 border border-white/50 rounded px-2 py-1 w-full text-primary ${className || ''}`} />
  );
}

export default function Portfolio() {
  const { data, loading, updateData, readError } = usePortfolioData();
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authResolved, setAuthResolved] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeSection, setActiveSection] = useState('hero');
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isNavLockedTop, setIsNavLockedTop] = useState(true);
  const [isDesktopMoreOpen, setIsDesktopMoreOpen] = useState(false);
  const [isTabletMenuOpen, setIsTabletMenuOpen] = useState(false);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const navRootRef = useRef<HTMLElement | null>(null);
  const navLeftRef = useRef<HTMLDivElement | null>(null);
  const navRightRef = useRef<HTMLDivElement | null>(null);
  const desktopMoreRef = useRef<HTMLDivElement | null>(null);
  const tabletMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef<number | null>(null);
  const navMeasureRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const moreMeasureRef = useRef<HTMLSpanElement | null>(null);
  const pendingNavScrollRef = useRef<{ id: string; top: number; expiresAt: number } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const [desktopPrimaryCount, setDesktopPrimaryCount] = useState(5);
  const [activeDetailModal, setActiveDetailModal] = useState<{ type: 'project' | 'certification'; id: string } | null>(null);
  const [activeDetailImageIndex, setActiveDetailImageIndex] = useState(0);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const contactStartedAtRef = useRef(Date.now());

  const openDetailModal = useCallback((type: 'project' | 'certification', id: string) => {
    setActiveDetailModal({ type, id });
    setActiveDetailImageIndex(0);
  }, []);

  const closeDetailModal = useCallback(() => {
    setActiveDetailModal(null);
    setActiveDetailImageIndex(0);
  }, []);

  const activeProject = activeDetailModal?.type === 'project'
    ? data?.projects.find((project) => project.id === activeDetailModal.id)
    : null;
  const activeCertification = activeDetailModal?.type === 'certification'
    ? data?.certifications.find((cert) => cert.id === activeDetailModal.id)
    : null;
  const activeDetailImages = activeProject
    ? mergeGalleryImages(activeProject.imageUrl, activeProject.imageUrls)
    : activeCertification
      ? mergeGalleryImages(activeCertification.imageUrl, activeCertification.imageUrls)
      : [];
  const activeCertificationIssuer = getCertificationIssuerLabel(activeCertification?.issuer);
  const activeCertificationDetails = getCertificationDetailText(activeCertification || undefined);
  const activeProjectMeta = normalizeText(activeProject?.itemCount);
  const activeProjectDetails = normalizeText(activeProject?.description);
  const boundedDetailImageIndex = activeDetailImages.length > 0
    ? Math.min(activeDetailImageIndex, activeDetailImages.length - 1)
    : 0;

  const showNextDetailImage = useCallback(() => {
    if (activeDetailImages.length < 2) return;
    setActiveDetailImageIndex((prev) => (prev + 1) % activeDetailImages.length);
  }, [activeDetailImages.length]);

  const showPreviousDetailImage = useCallback(() => {
    if (activeDetailImages.length < 2) return;
    setActiveDetailImageIndex((prev) => (prev - 1 + activeDetailImages.length) % activeDetailImages.length);
  }, [activeDetailImages.length]);

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
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!active) return;

      if (!user) {
        setIsAdmin(false);
        setAuthResolved(true);
        return;
      }

      try {
        await user.getIdToken(true);
        if (!active) return;
        setIsAdmin(true);
      } catch (error) {
        console.warn('Failed to refresh auth token for portfolio controls.', error);
        if (!active) return;
        setIsAdmin(false);
      } finally {
        if (active) {
          setAuthResolved(true);
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
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

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim().toLowerCase();
    const message = String(formData.get('message') || '').trim();
    const website = String(formData.get('website') || '').trim();

    const localCooldownKey = 'katdworks_contact_last_submit_at';
    const previousSubmitAt = Number(localStorage.getItem(localCooldownKey) || '0');
    const now = Date.now();

    if (previousSubmitAt > 0 && now - previousSubmitAt < 20_000) {
      sileo.warning({
        title: 'Please wait a moment',
        description: 'You can send another message after 20 seconds.',
      });
      return;
    }

    if (name.length < 2) {
      sileo.warning({
        title: 'Name required',
        description: 'Please provide your name before sending.',
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      sileo.warning({
        title: 'Valid email required',
        description: 'Please enter a valid email address so I can reply.',
      });
      return;
    }

    if (message.length < 10) {
      sileo.warning({
        title: 'Message too short',
        description: 'Please include a bit more detail in your message.',
      });
      return;
    }

    setContactSubmitting(true);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          message,
          website,
          startedAt: contactStartedAtRef.current,
          submittedAt: now,
        }),
      });

      let payload: ContactApiResponse = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || 'Unable to send your message right now. Please try again shortly.');
      }

      sileo.info({
        title: 'Message sent',
        description: 'Thanks for reaching out. I will get back to you soon.',
      });

      localStorage.setItem(localCooldownKey, String(now));
      form.reset();
      contactStartedAtRef.current = Date.now();
    } catch (error) {
      sileo.warning({
        title: 'Send failed',
        description: error instanceof Error ? error.message : 'Unable to send your message right now.',
      });
    } finally {
      setContactSubmitting(false);
    }
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } }
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

  const isSectionEnabled = (section: PortfolioSectionKey) => {
    const configured = data?.ui?.sectionVisibility?.[section];
    if (typeof configured === 'boolean') return configured;
    return DEFAULT_SECTION_VISIBILITY[section];
  };

  const showHomeSection = isSectionEnabled('home');
  const showAboutSection = isSectionEnabled('about');
  const showExperienceSection = isSectionEnabled('experience') && (isEditMode || (data?.experience?.length || 0) > 0);
  const showSkillsSection = isSectionEnabled('skills') && (isEditMode || (data?.expertiseCards?.length || 0) > 0 || (data?.skills?.length || 0) > 0);
  const showEducationSection = isSectionEnabled('education') && (isEditMode || (data?.education?.length || 0) > 0);
  const showTrainingsSection = isSectionEnabled('trainings') && (isEditMode || (data?.trainings?.length || 0) > 0);
  const showCertificationsSection = isSectionEnabled('certifications') && (isEditMode || (data?.certifications?.length || 0) > 0);
  const showProjectsSection = isSectionEnabled('projects') && (isEditMode || (data?.projects?.length || 0) > 0);
  const showContactSection =
    isSectionEnabled('contact') &&
    (isEditMode ||
      Boolean(data?.contact?.intro || data?.contact?.email || data?.contact?.phone || data?.contact?.location));

  const sectionNavLabels = useMemo<Record<PortfolioSectionKey, string>>(() => ({
    home: data?.ui?.sectionTitles?.home || 'Home',
    about: data?.ui?.sectionTitles?.about || 'About',
    experience: data?.ui?.sectionTitles?.experience || 'Experience',
    skills: data?.ui?.sectionTitles?.skills || 'Skills',
    education: data?.ui?.sectionTitles?.education || 'Education',
    trainings: data?.ui?.sectionTitles?.trainings || 'Trainings',
    projects: data?.ui?.sectionTitles?.projects || 'Projects',
    contact: data?.ui?.sectionTitles?.contact || 'Contact',
    certifications: data?.ui?.certificationsTitle || 'Certifications',
  }), [
    data?.ui?.sectionTitles?.home,
    data?.ui?.sectionTitles?.about,
    data?.ui?.sectionTitles?.experience,
    data?.ui?.sectionTitles?.skills,
    data?.ui?.sectionTitles?.education,
    data?.ui?.sectionTitles?.trainings,
    data?.ui?.sectionTitles?.projects,
    data?.ui?.sectionTitles?.contact,
    data?.ui?.certificationsTitle,
  ]);

  const sectionVisibilityForNav: Record<PortfolioSectionKey, boolean> = {
    home: showHomeSection,
    about: showAboutSection,
    experience: showExperienceSection,
    skills: showSkillsSection,
    education: showEducationSection,
    trainings: showTrainingsSection,
    projects: showProjectsSection,
    contact: showContactSection,
    certifications: showCertificationsSection,
  };

  const visibleNavLinks = useMemo(() => {
    const configuredNavById = new Map<string, PortfolioData['ui']['navLinks'][number]>(
      (data?.ui?.navLinks || []).map((item) => [item.id, item] as const)
    );

    return SECTION_RENDER_ORDER
      .filter((sectionId) => sectionVisibilityForNav[sectionId])
      .map((sectionId) => {
        const configured = configuredNavById.get(sectionId);
        const fallbackHref = sectionId === 'home' ? '#hero' : `#${sectionId}`;
        const href = configured?.href?.startsWith('#') ? configured.href : fallbackHref;

        return {
          id: sectionId,
          label: sectionNavLabels[sectionId] || configured?.label || sectionId,
          href,
        };
      });
  }, [
    data?.ui?.navLinks,
    sectionNavLabels,
    sectionVisibilityForNav.home,
    sectionVisibilityForNav.about,
    sectionVisibilityForNav.experience,
    sectionVisibilityForNav.education,
    sectionVisibilityForNav.trainings,
    sectionVisibilityForNav.skills,
    sectionVisibilityForNav.certifications,
    sectionVisibilityForNav.projects,
    sectionVisibilityForNav.contact,
  ]);

  const recalculateDesktopNavFit = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (window.innerWidth < 1024) {
      setDesktopPrimaryCount(visibleNavLinks.length);
      return;
    }

    const navWidth = navRootRef.current?.clientWidth || 0;
    const leftWidth = navLeftRef.current?.offsetWidth || 0;
    const rightWidth = navRightRef.current?.offsetWidth || 0;
    const availableCenterWidth = navWidth - leftWidth - rightWidth - 56;

    if (availableCenterWidth <= 0) {
      setDesktopPrimaryCount(0);
      return;
    }

    const gap = 20; // matches `gap-5`
    const widths = visibleNavLinks.map((item) => navMeasureRefs.current[item.id]?.offsetWidth || 0);
    const moreWidth = moreMeasureRef.current?.offsetWidth || 0;
    const total = widths.length;

    let fitCount = total;
    for (let count = total; count >= 0; count -= 1) {
      const linksWidth = widths.slice(0, count).reduce((sum, w) => sum + w, 0);
      const linkGaps = count > 1 ? (count - 1) * gap : 0;
      const showMore = count < total;
      const moreBlockWidth = showMore ? (count > 0 ? gap : 0) + moreWidth : 0;
      const neededWidth = linksWidth + linkGaps + moreBlockWidth;

      if (neededWidth <= availableCenterWidth) {
        fitCount = count;
        break;
      }
    }

    setDesktopPrimaryCount(fitCount);
  }, [visibleNavLinks]);

  useEffect(() => {
    const raf = requestAnimationFrame(recalculateDesktopNavFit);
    const handleResize = () => recalculateDesktopNavFit();

    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => {
      recalculateDesktopNavFit();
    });

    if (navRootRef.current) observer.observe(navRootRef.current);
    if (navLeftRef.current) observer.observe(navLeftRef.current);
    if (navRightRef.current) observer.observe(navRightRef.current);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
    };
  }, [recalculateDesktopNavFit]);

  const primaryCount = Math.max(0, Math.min(desktopPrimaryCount, visibleNavLinks.length));
  const primaryNavLinks = visibleNavLinks.slice(0, primaryCount);
  const overflowNavLinks = visibleNavLinks.slice(primaryCount);
  const isMoreActive = overflowNavLinks.some((item) => activeSection === item.href.replace('#', ''));
  const activeNavLabel = visibleNavLinks.find((item) => activeSection === item.href.replace('#', ''))?.label || 'Sections';

  const handlePortfolioDownload = async () => {
    if (!data?.portfolioPdfUrl) {
      sileo.warning({
        title: 'PDF not available',
        description: 'No portfolio PDF has been uploaded yet. Please try again later.'
      });
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
      if (scrollRafRef.current !== null) return;

      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const scrollY = window.scrollY;

        // Hysteresis prevents flicker when hovering near the top threshold.
        setIsNavLockedTop((prevLocked) => {
          if (prevLocked) {
            return scrollY < NAV_LOCK_RELEASE_Y;
          }

          return scrollY <= NAV_LOCK_ENGAGE_Y;
        });

        setShowScrollTop((prev) => {
          const next = scrollY > 120;
          return prev === next ? prev : next;
        });

        const pendingNavScroll = pendingNavScrollRef.current;
        if (pendingNavScroll) {
          const reachedTarget = Math.abs(scrollY - pendingNavScroll.top) < 24;
          const expired = performance.now() > pendingNavScroll.expiresAt;

          if (reachedTarget || expired) {
            pendingNavScrollRef.current = null;
          }
        }
      });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  const navPositionClass = isEditMode
    ? 'relative top-0 mx-auto'
    : 'fixed top-0 left-1/2 -translate-x-1/2';

  useEffect(() => {
    const visibleIds = visibleNavLinks
      .map((item) => (item.href || '').replace('#', ''))
      .filter(Boolean);

    if (visibleIds.length > 0 && !visibleIds.includes(activeSection)) {
      setActiveSection(visibleIds[0]);
    }
  }, [activeSection, visibleNavLinks]);

  useEffect(() => {
    const sectionIds = visibleNavLinks
      .map((item) => (item.href || '').replace('#', ''))
      .filter(Boolean);

    if (sectionIds.length === 0) return;

    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (pendingNavScrollRef.current) return;

        const bestVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!bestVisible) return;
        const nextId = bestVisible.target.id;
        setActiveSection((prev) => (prev === nextId ? prev : nextId));
      },
      {
        rootMargin: '-20% 0px -45% 0px',
        threshold: [0.18, 0.32, 0.5, 0.68]
      }
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, [visibleNavLinks]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | globalThis.MouseEvent) => {
      const target = event.target as Node;

      if (isDesktopMoreOpen && desktopMoreRef.current && !desktopMoreRef.current.contains(target)) {
        setIsDesktopMoreOpen(false);
      }

      if (isTabletMenuOpen && tabletMenuRef.current && !tabletMenuRef.current.contains(target)) {
        setIsTabletMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDesktopMoreOpen(false);
        setIsTabletMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDesktopMoreOpen, isTabletMenuOpen]);

  const handleNavClick = (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const targetId = href.replace('#', '');
    const target = document.getElementById(targetId);
    if (!target) return;

    const top = Math.max(target.getBoundingClientRect().top + window.scrollY - 110, 0);
    const distance = Math.abs(window.scrollY - top);
    const guardDuration = Math.min(2200, Math.max(700, distance * 0.9));
    pendingNavScrollRef.current = {
      id: targetId,
      top,
      expiresAt: performance.now() + guardDuration,
    };

    window.scrollTo({ top, behavior: 'smooth' });
    setActiveSection(targetId);
    setIsDesktopMoreOpen(false);
    setIsTabletMenuOpen(false);
  };

  useEffect(() => {
    if (!activeDetailModal) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDetailModal();
        return;
      }
      if (event.key === 'ArrowRight') {
        showNextDetailImage();
      }
      if (event.key === 'ArrowLeft') {
        showPreviousDetailImage();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeDetailModal, closeDetailModal, showNextDetailImage, showPreviousDetailImage]);

  useEffect(() => {
    if (!activeDetailModal) return;

    const missingProject = activeDetailModal.type === 'project' && !activeProject;
    const missingCertification = activeDetailModal.type === 'certification' && !activeCertification;

    if (missingProject || missingCertification) {
      closeDetailModal();
    }
  }, [activeDetailModal, activeProject, activeCertification, closeDetailModal]);

  useEffect(() => {
    if (activeDetailImages.length === 0) {
      setActiveDetailImageIndex(0);
      return;
    }

    setActiveDetailImageIndex((prev) => Math.min(prev, activeDetailImages.length - 1));
  }, [activeDetailImages.length]);

  if (loading) {
    return (
      <UnifiedLoadingScreen
        title="Loading portfolio"
        subtitle="Curating projects, skills, and profile highlights..."
      />
    );
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

  const updateCertificationGallery = (certId: string, images: string[]) => {
    const nextCertifications = data.certifications.map((cert) => {
      if (cert.id !== certId) return cert;
      return {
        ...cert,
        imageUrl: images[0] || '',
        imageUrls: images,
      };
    });

    updateData({ certifications: nextCertifications });
  };

  const appendCertificationGallery = (certId: string, newImages: string[]) => {
    const cert = data.certifications.find((entry) => entry.id === certId);
    if (!cert) return;

    const merged = mergeGalleryImages(cert.imageUrl, [...(cert.imageUrls || []), ...newImages]);
    updateCertificationGallery(certId, merged);
  };

  const removeCertificationGalleryImage = (certId: string, imageIndex: number) => {
    const cert = data.certifications.find((entry) => entry.id === certId);
    if (!cert) return;

    const merged = mergeGalleryImages(cert.imageUrl, cert.imageUrls);
    const filtered = merged.filter((_, index) => index !== imageIndex);
    updateCertificationGallery(certId, filtered);
  };

  const updateProjectGallery = (projectId: string, images: string[]) => {
    const nextProjects = data.projects.map((project) => {
      if (project.id !== projectId) return project;
      return {
        ...project,
        imageUrl: images[0] || '',
        imageUrls: images,
      };
    });

    updateData({ projects: nextProjects });
  };

  const appendProjectGallery = (projectId: string, newImages: string[]) => {
    const project = data.projects.find((entry) => entry.id === projectId);
    if (!project) return;

    const merged = mergeGalleryImages(project.imageUrl, [...(project.imageUrls || []), ...newImages]);
    updateProjectGallery(projectId, merged);
  };

  const removeProjectGalleryImage = (projectId: string, imageIndex: number) => {
    const project = data.projects.find((entry) => entry.id === projectId);
    if (!project) return;

    const merged = mergeGalleryImages(project.imageUrl, project.imageUrls);
    const filtered = merged.filter((_, index) => index !== imageIndex);
    updateProjectGallery(projectId, filtered);
  };

  const uploadMultipleFiles = async (
    files: File[],
    path: string,
    progressPrefix: string
  ) => {
    const uploadedUrls: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      await handleFileUpload(file, path, (url) => {
        uploadedUrls.push(url);
      }, `${progressPrefix}-${index}`);
    }

    return uploadedUrls;
  };

  return (
    <EditModeContext.Provider value={isEditMode}>
    <div className="min-h-screen bg-surface font-body selection:bg-secondary-container selection:text-on-secondary-container relative overflow-x-hidden">
      {readError && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-error-container text-on-error-container px-4 py-2 text-xs text-center">
          Live content could not be loaded from Firestore.
        </div>
      )}
      {authResolved && isAdmin && (
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
        ref={navRootRef}
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: isEditMode ? 0 : isNavLockedTop ? 0 : 16, opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className={`${navPositionClass} w-[94%] sm:w-[90%] max-w-5xl rounded-full px-4 sm:px-6 py-2 bg-[#faf9f6]/70 backdrop-blur-md flex justify-between items-center z-50 shadow-xl shadow-[#1a1c1a]/5 will-change-transform`}
      >
        <div
          aria-hidden="true"
          className="hidden lg:flex absolute invisible pointer-events-none -z-10 items-center gap-5 whitespace-nowrap"
        >
          {visibleNavLinks.map((item) => (
            <span
              key={`measure-${item.id}`}
              ref={(el) => {
                navMeasureRefs.current[item.id] = el;
              }}
              className="text-[15px] leading-none font-medium"
            >
              {item.label}
            </span>
          ))}
          <span ref={moreMeasureRef} className="text-[15px] leading-none font-semibold">More</span>
        </div>

        <div ref={navLeftRef} className="min-w-0 flex-1 flex items-center gap-2 sm:gap-3 lg:min-w-[220px] lg:flex-none">
          <div className="relative group">
            <img
              src={data.ui.navLogoUrl || '/favicon.svg'}
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
          <input
            type="file"
            accept="image/*"
            ref={(el) => { fileInputRefs.current['navLogo'] = el; }}
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
          <div className="text-lg sm:text-xl font-headline font-black text-primary max-w-[150px] sm:max-w-[220px] lg:max-w-none truncate">
            <InlineText value={data.ui.navTitle} onChange={(val) => updateData({ ui: { ...data.ui, navTitle: val } })} />
          </div>
        </div>
        <div className="hidden lg:flex items-center gap-5 absolute left-1/2 -translate-x-1/2">
          {primaryNavLinks.map((item) => (
            <motion.a
              key={item.id}
              initial={false}
              whileHover={{ y: -2 }}
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
            </motion.a>
          ))}
          {overflowNavLinks.length > 0 && (
            <div ref={desktopMoreRef} className="relative">
              <button
                type="button"
                onClick={() => setIsDesktopMoreOpen((prev) => !prev)}
                className={`relative cursor-pointer select-none text-[15px] font-semibold transition-colors ${isMoreActive ? 'text-primary' : 'text-secondary hover:text-primary'}`}
                aria-haspopup="menu"
                aria-expanded={isDesktopMoreOpen}
              >
                More
                {isMoreActive && (
                  <motion.span
                    className="absolute -bottom-2 left-0 right-0 h-[2px] bg-primary rounded-full"
                    initial={{ opacity: 0, scaleX: 0.6 }}
                    animate={{ opacity: 1, scaleX: 1 }}
                    exit={{ opacity: 0, scaleX: 0.6 }}
                    transition={{ duration: 0.14, ease: 'easeOut' }}
                  />
                )}
              </button>
              <AnimatePresence>
                {isDesktopMoreOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute right-0 mt-3 w-44 rounded-xl border border-outline-variant/30 bg-white shadow-xl p-2 z-50 will-change-transform"
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
        <div ref={navRightRef} className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <motion.div
            initial={false}
            className="lg:hidden"
          >
            <div ref={tabletMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsTabletMenuOpen((prev) => !prev)}
                className="cursor-pointer flex items-center gap-1 rounded-full border border-outline-variant/35 bg-surface-container-low/90 backdrop-blur px-2.5 sm:px-3 py-1.5 shadow-sm hover:bg-surface-container transition-colors"
                aria-haspopup="menu"
                aria-expanded={isTabletMenuOpen}
              >
                <span className="material-symbols-outlined text-[16px] text-secondary" data-icon="menu">menu</span>
                <span className="max-w-[64px] sm:max-w-[92px] truncate text-[11px] sm:text-[12px] font-semibold tracking-wide text-primary">{activeNavLabel}</span>
                <motion.span
                  animate={{ rotate: isTabletMenuOpen ? 180 : 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="material-symbols-outlined text-[16px] text-secondary"
                  data-icon="expand_more"
                >
                  expand_more
                </motion.span>
              </button>
              <AnimatePresence>
                {isTabletMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute right-0 mt-3 w-[min(84vw,17rem)] rounded-2xl border border-outline-variant/30 bg-surface-container-lowest/95 backdrop-blur-md shadow-xl p-2.5 z-50 will-change-transform"
                  >
                    <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-secondary">Navigate</p>
                    {visibleNavLinks.map((item) => (
                      <a
                        key={item.id}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors ${activeSection === item.href.replace('#', '') ? 'bg-surface-container-high text-primary' : 'text-secondary hover:bg-surface-container-low hover:text-primary'}`}
                        href={item.href || '#'}
                        onClick={handleNavClick(item.href || '#')}
                      >
                        <span className="truncate pr-3">{item.label}</span>
                        {activeSection === item.href.replace('#', '') && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </a>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
          {isAdmin ? (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Link
                to="/dashboard"
                className="inline-block bg-primary text-on-primary px-3 sm:px-5 lg:px-6 py-2 rounded-lg font-label text-sm font-bold scale-95 hover:scale-100 active:scale-90 transition-transform"
              >
                Dashboard
              </Link>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <Link
                to="/login"
                className="inline-block bg-primary text-on-primary px-3 sm:px-5 lg:px-6 py-2 rounded-lg font-label text-sm font-bold scale-95 hover:scale-100 active:scale-90 transition-transform"
              >
                Login
              </Link>
            </motion.div>
          )}
        </div>
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
      {showHomeSection && (
      <section className="relative min-h-[calc(100svh-1.5rem)] flex items-center pt-20 md:pt-24 pb-8 md:pb-10 overflow-hidden bg-gradient-to-br from-surface via-surface-container-low to-surface" id="hero">
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.4, scale: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="absolute -top-40 -right-40 w-96 h-96 bg-secondary-container rounded-full blur-3xl"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.3, scale: 1 }}
            transition={{ duration: 1.4, delay: 0.2, ease: "easeOut" }}
            className="absolute -bottom-32 -left-32 w-80 h-80 bg-primary-container rounded-full blur-3xl"
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.15 }}
            transition={{ duration: 1.6, delay: 0.4, ease: "easeOut" }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-tertiary-container rounded-full blur-3xl"
          />
          
          {/* Floating Decorative Elements - Optimized */}
          <motion.div
            animate={{ 
              y: [0, -20, 0],
              rotate: [0, 5, 0]
            }}
            transition={{ 
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="absolute top-32 right-1/4 w-24 h-24 border-2 border-outline-variant/20 rounded-xl rotate-12 will-change-transform"
          />
          <motion.div
            animate={{ 
              y: [0, 25, 0],
              rotate: [0, -8, 0]
            }}
            transition={{ 
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1
            }}
            className="absolute bottom-40 left-1/4 w-32 h-32 border border-outline-variant/15 rounded-full will-change-transform"
          />
          <motion.div
            animate={{ 
              y: [0, -15, 0],
              x: [0, 10, 0]
            }}
            transition={{ 
              duration: 7,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5
            }}
            className="absolute top-1/2 right-20 w-16 h-16 bg-secondary-container/30 rounded-lg rotate-45 will-change-transform"
          />
        </div>
        
        {/* Bottom Gradient Blend */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent to-surface-container-low pointer-events-none z-[5]"></div>

        <div className="container mx-auto px-6 md:px-12 lg:px-20 grid md:grid-cols-2 gap-6 md:gap-10 items-center relative z-10">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="order-2 md:order-1 relative"
          >
            {/* Decorative accent behind text */}
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 0.1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="absolute -left-8 top-0 w-2 h-32 bg-primary rounded-full"
            />
            
            <motion.h1 variants={fadeUp} className="font-headline text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-black text-primary leading-[1.04] mb-4 md:mb-5 -tracking-wider relative">
              <span className="relative inline-block">
                <InlineText value={data.hero.headline} onChange={(val) => updateData({ hero: { ...data.hero, headline: val } })} />
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 0.8, delay: 0.6, ease: "easeOut" }}
                  className="absolute -bottom-2 left-0 h-1 bg-secondary/30 rounded-full"
                />
              </span>
              <br />
              <span className="relative inline-block">
                <InlineText value={data.hero.subheadline} onChange={(val) => updateData({ hero: { ...data.hero, subheadline: val } })} />
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.5, delay: 1, ease: "backOut" }}
                  className="absolute -right-8 top-0 w-6 h-6 bg-secondary rounded-full opacity-40"
                />
              </span>
            </motion.h1>
            <motion.div variants={fadeUp} className="text-base text-on-surface-variant font-body max-w-lg mb-6 md:mb-7 leading-relaxed">
              <InlineText multiline value={data.hero.description} onChange={(val) => updateData({ hero: { ...data.hero, description: val } })} />
            </motion.div>
            <motion.div variants={fadeUp} className="flex flex-wrap gap-3 md:gap-4">
              <motion.a
                whileHover={{ scale: 1.05, boxShadow: "0 20px 40px -10px rgba(74, 56, 40, 0.3)" }}
                whileTap={{ scale: 0.95 }}
                className="bg-primary text-on-primary px-6 py-3 rounded-lg font-bold text-sm hover:bg-secondary transition-colors duration-300 shadow-lg shadow-primary/10 relative overflow-hidden group"
                href="#contact"
                onClick={handleNavClick('#contact')}
              >
                <span className="relative z-10">Contact Me</span>
                <motion.span
                  className="absolute inset-0 bg-secondary"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.a>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                className="bg-surface-container-highest text-primary px-6 py-3 rounded-lg font-bold text-sm hover:bg-outline-variant transition-colors duration-300 relative group" 
                onClick={handlePortfolioDownload}
              >
                <span className="flex items-center gap-2">
                  Download Portfolio
                  <motion.span
                    animate={{ y: [0, 3, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                    className="material-symbols-outlined text-sm"
                  >
                    download
                  </motion.span>
                </span>
              </motion.button>
            </motion.div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="order-1 md:order-2 relative w-full max-w-md mx-auto md:max-w-none"
          >
            <div className="relative w-fit mx-auto">
              {/* Main Image Container with Enhanced Effects */}
              <div className="aspect-square md:aspect-[4/5] max-h-[38vh] md:max-h-[56vh] rounded-xl overflow-hidden shadow-2xl z-10 relative group">
                {/* Gradient Overlay on Hover */}
                <div className="absolute inset-0 bg-gradient-to-t from-primary/20 via-transparent to-transparent z-[5] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                <motion.img
                  whileHover={{ scale: 1.05 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="w-full h-full object-cover will-change-transform"
                  alt="Professional portrait"
                  src={data.hero.imageUrl}
                  referrerPolicy="no-referrer"
                />
                {isEditMode && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <input 
                      type="file"
                      accept="image/*"
                      ref={(el) => { fileInputRefs.current['heroImage'] = el; }}
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
              
              {/* Enhanced Decorative Elements */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                animate={{ opacity: 0.15, scale: 1, rotate: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="absolute -bottom-4 -left-4 md:-bottom-6 md:-left-6 w-32 h-32 md:w-48 md:h-48 bg-primary-container rounded-xl -z-10"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 0.4, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="absolute -top-4 -right-4 md:-top-6 md:-right-6 w-48 h-48 md:w-64 md:h-64 border-2 border-outline-variant rounded-full -z-10"
              />
              
              {/* Animated Corner Accent */}
              <motion.div
                initial={{ opacity: 0, x: 20, y: -20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.6, delay: 0.7 }}
                className="absolute top-0 right-0 w-20 h-20 border-t-4 border-r-4 border-secondary rounded-tr-xl -z-5"
              />
              <motion.div
                initial={{ opacity: 0, x: -20, y: 20 }}
                animate={{ opacity: 1, x: 0, y: 0 }}
                transition={{ duration: 0.6, delay: 0.8 }}
                className="absolute bottom-0 left-0 w-20 h-20 border-b-4 border-l-4 border-secondary rounded-bl-xl -z-5"
              />

              <motion.div
                initial={{ x: 16, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.45, duration: 0.55 }}
                className="hidden md:flex absolute -right-16 lg:-right-[4.75rem] top-1/2 -translate-y-1/2 flex-col items-center gap-3 z-20"
              >
                <motion.span
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.4 }}
                  className="font-label text-[10px] uppercase tracking-widest text-primary"
                >
                  Connect
                </motion.span>
                {data.ui.socialIcons.map((item, idx) => (
                  <motion.a
                    key={item.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.9 + idx * 0.1, duration: 0.4 }}
                    whileHover={{ scale: 1.15, x: -5 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-surface-container text-primary rounded-full p-2.5 shadow-md border border-outline-variant/20 hover:bg-secondary hover:text-white transition-all duration-300"
                    href={item.link || '#'}
                    target={item.link && item.link !== '#' ? '_blank' : '_self'}
                    rel="noopener noreferrer"
                  >
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.icon || 'social'} className="w-5 h-5 rounded object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="material-symbols-outlined" data-icon={item.icon}>{item.icon}</span>
                    )}
                  </motion.a>
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
                          ref={(el) => { fileInputRefs.current[`social-${item.id}`] = el; }}
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
      )}

      {/* About Me */}
      {showAboutSection && (
      <section className="py-16 md:py-24 bg-surface-container-low relative overflow-hidden" id="about">
        {/* Top Gradient Blend - Stronger */}
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-surface via-surface-container-low/80 to-transparent pointer-events-none z-[5]"></div>
        
        {/* Background Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-20 right-10 w-72 h-72 bg-primary rounded-full blur-3xl opacity-5" />
          <div className="absolute -bottom-20 -left-20 w-96 h-96 border border-outline-variant/10 rounded-full" style={{ animation: 'spin 50s linear infinite' }} />
          {/* Additional decorative elements for the right side */}
          <motion.div
            animate={{ y: [0, -30, 0], rotate: [0, 10, 0] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-32 right-20 w-40 h-40 border-2 border-secondary/10 rounded-xl rotate-12"
          />
          <motion.div
            animate={{ y: [0, 20, 0], rotate: [0, -15, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            className="absolute bottom-40 right-32 w-24 h-24 bg-tertiary-container/20 rounded-full"
          />
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            className="absolute top-1/2 right-10 w-32 h-32 bg-secondary/5 rounded-lg rotate-45"
          />
        </div>
        
        {/* Bottom Gradient Blend */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-b from-transparent to-surface pointer-events-none z-[5]"></div>

        <div className="container mx-auto px-6 md:px-12 lg:px-20 relative z-10">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="max-w-7xl mx-auto"
          >
            <motion.h2 variants={fadeUp} className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12 relative inline-block">
              <InlineText value={data.ui.sectionTitles.about} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, about: val } } })} />
              <motion.span
                initial={{ width: 0 }}
                whileInView={{ width: "60%" }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="absolute -bottom-2 left-0 h-1 bg-secondary/40 rounded-full"
              />
            </motion.h2>
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 xl:gap-16">
              <div className="flex-1 space-y-8">
                <div className="text-lg md:text-xl font-headline italic text-on-surface-variant leading-relaxed relative pl-6 border-l-4 border-secondary/30">
                  "<InlineText multiline value={data.about.quote} onChange={(val) => updateData({ about: { ...data.about, quote: val } })} />"
                </div>
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
              {data.about.imageUrl && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="relative group lg:w-[420px] xl:w-[480px] flex-shrink-0"
                >
                  {/* Decorative frame elements */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 0.15, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.6 }}
                    className="absolute -bottom-6 -right-6 w-full h-full bg-secondary-container rounded-xl -z-10"
                  />
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.8, delay: 0.5 }}
                    className="absolute -top-6 -left-6 w-32 h-32 border-4 border-primary/20 rounded-full -z-10"
                  />
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.7 }}
                    className="absolute top-0 right-0 w-24 h-24 border-t-4 border-r-4 border-secondary rounded-tr-xl"
                  />
                  <motion.div
                    initial={{ opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.8 }}
                    className="absolute bottom-0 left-0 w-24 h-24 border-b-4 border-l-4 border-secondary rounded-bl-xl"
                  />
                  
                  <div className="aspect-[3/4] rounded-xl overflow-hidden shadow-2xl relative z-10">
                    <motion.img
                      whileHover={{ scale: 1.05 }}
                      transition={{ duration: 0.4 }}
                      src={data.about.imageUrl}
                      alt="About Me"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    {isEditMode && (
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <input 
                          type="file"
                          accept="image/*"
                          ref={(el) => { fileInputRefs.current['aboutImage'] = el; }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFileUpload(file, 'images', (url) => updateData({ about: { ...data.about, imageUrl: url } }));
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                        <div className="flex flex-col gap-2">
                          <button 
                            onClick={() => fileInputRefs.current['aboutImage']?.click()}
                            className="bg-white text-primary px-4 py-2 rounded-full font-bold text-sm"
                          >
                            {uploadProgress['images'] !== undefined ? `Uploading... ${Math.round(uploadProgress['images'])}%` : 'Change'}
                          </button>
                          <button 
                            onClick={() => updateData({ about: { ...data.about, imageUrl: '' } })}
                            className="bg-error text-white px-4 py-2 rounded-full font-bold text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
              {isEditMode && !data.about.imageUrl && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="lg:w-[420px] xl:w-[480px] flex-shrink-0"
                >
                  <button 
                    onClick={() => fileInputRefs.current['aboutImage']?.click()}
                    className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-outline-variant/50 hover:border-primary transition-colors flex items-center justify-center bg-surface-container-lowest/50"
                  >
                    <div className="text-center">
                      <span className="material-symbols-outlined text-4xl text-primary mb-2 block">add_photo_alternate</span>
                      <p className="font-bold text-primary">Add About Me Picture</p>
                    </div>
                  </button>
                  <input 
                    type="file"
                    accept="image/*"
                    ref={(el) => { fileInputRefs.current['aboutImage'] = el; }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'images', (url) => updateData({ about: { ...data.about, imageUrl: url } }));
                      e.currentTarget.value = '';
                    }}
                    className="hidden"
                  />
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </section>
      )}

      {/* Experience - Timeline */}
      {showExperienceSection && (
      <section className="py-16 md:py-24 bg-surface relative overflow-hidden" id="experience">
        {/* Animated Background */}
        <motion.div
          animate={{ 
            backgroundPosition: ['0% 0%', '100% 100%'],
          }}
          transition={{ duration: 20, repeat: Infinity, repeatType: "reverse" }}
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}
        />

        <div className="container mx-auto px-6 md:px-12 lg:px-20 relative z-10">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={fadeUp}
            className="flex flex-col md:flex-row justify-between items-baseline mb-12 md:mb-16"
          >
            <h2 className="font-headline text-3xl md:text-4xl font-bold text-primary relative inline-block">
              <InlineText value={data.ui.sectionTitles.experience} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, experience: val } } })} />
              <motion.div
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-secondary to-transparent origin-left"
              />
            </h2>
        
          </motion.div>
          <div className="space-y-12 md:space-y-16 relative">
            {/* Vertical Timeline Line */}
            <motion.div
              initial={{ height: 0 }}
              whileInView={{ height: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="hidden md:block absolute left-[50%] top-0 w-[2px] bg-gradient-to-b from-secondary via-outline-variant to-transparent"
            />
            
            {data.experience.map((exp, index) => (
              <motion.div 
                key={exp.id}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                variants={fadeUp}
                className="relative pl-8 md:pl-0 group"
              >
                {/* Timeline Dot */}
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="hidden md:block absolute left-[50%] top-8 -translate-x-1/2 w-4 h-4 bg-secondary rounded-full border-4 border-surface z-10 shadow-lg"
                />
                
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
                <div className="grid md:grid-cols-2 gap-4 md:gap-8 items-start bg-surface-container-lowest rounded-xl p-6 shadow-sm border border-outline-variant/10 hover:shadow-md transition-all">
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
      <section className="py-16 md:py-24 bg-surface-container-low relative overflow-hidden" id="education">
        {/* Decorative Background */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/4 right-1/4 w-64 h-64 border-2 border-outline-variant/5 rounded-full"
          />
        </div>

        <div className="container mx-auto px-6 md:px-12 lg:px-20 relative z-10">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12 relative inline-block"
          >
            <InlineText value={data.ui.sectionTitles.education} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, education: val } } })} />
            <motion.span
              initial={{ width: 0 }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="absolute -bottom-2 left-0 h-1 bg-secondary/30 rounded-full"
            />
          </motion.h2>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            {data.education.map((entry, index) => (
              <motion.div
                key={entry.id}
                variants={fadeUp}
                whileHover={{ y: -5, boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1)" }}
                className="relative group bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/10 overflow-hidden"
              >
                {/* Decorative Corner */}
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="absolute top-0 right-0 w-20 h-20 bg-secondary/5 rounded-bl-full"
                />
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
      <section className="py-16 md:py-24 bg-surface relative overflow-hidden" id="trainings">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 0.03 }}
            viewport={{ once: true }}
            className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-primary to-transparent"
          />
        </div>

        <div className="container mx-auto px-6 md:px-12 lg:px-20 relative z-10">
          <motion.h2
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12 relative inline-block"
          >
            <InlineText value={data.ui.sectionTitles.trainings} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, trainings: val } } })} />
            <motion.span
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="absolute -bottom-2 left-0 right-0 h-1 bg-secondary/30 rounded-full origin-left"
            />
          </motion.h2>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="space-y-4"
          >
            {data.trainings.map((entry, index) => (
              <motion.div
                key={entry.id}
                variants={fadeUp}
                whileHover={{ x: 5 }}
                className="relative group bg-surface-container-lowest p-5 rounded-xl border border-outline-variant/10 hover:border-secondary/30 transition-all"
              >
                {/* Side Accent */}
                <motion.div
                  initial={{ height: 0 }}
                  whileInView={{ height: "100%" }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="absolute left-0 top-0 w-1 bg-secondary rounded-r-full"
                />
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
      <section className="py-16 md:py-24 bg-surface-container relative overflow-hidden" id="skills">
        {/* Animated Grid Background */}
        <motion.div
          animate={{ 
            backgroundPosition: ['0% 0%', '100% 100%'],
          }}
          transition={{ duration: 30, repeat: Infinity, repeatType: "reverse" }}
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: 'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '60px 60px'
          }}
        />

        <div className="container mx-auto px-6 md:px-12 lg:px-20 relative z-10">
          <motion.h2 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12 relative inline-block"
          >
            <InlineText value={data.ui.sectionTitles.skills} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, skills: val } } })} />
            <motion.span
              initial={{ width: 0 }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="absolute -bottom-2 left-0 h-1 bg-secondary/30 rounded-full"
            />
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
                <motion.div
                  key={card.id}
                  variants={fadeUp}
                  whileHover={{ y: -8, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.15)" }}
                  className={cardClassName}
                >
                  <motion.span
                    initial={{ scale: 0, rotate: -180 }}
                    whileInView={{ scale: 1, rotate: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: idx * 0.1 }}
                    className={iconClassName}
                    data-icon={card.icon}
                  >
                    {card.icon}
                  </motion.span>
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
            <motion.div
              variants={fadeUp}
              whileHover={{ scale: 1.01 }}
              className="md:col-span-3 bg-surface-container-lowest p-6 md:p-8 rounded-xl flex flex-col md:flex-row gap-4 md:items-center border border-outline-variant/10"
            >
              <span className="font-label text-xs md:text-sm font-bold text-secondary uppercase tracking-widest md:mr-4">
                <InlineText value={data.ui.expertiseTitle || 'Tech Arsenal'} onChange={(val) => updateData({ ui: { ...data.ui, expertiseTitle: val } })} />
                :
              </span>
              <div className="flex flex-wrap gap-2">
                {data.skills.map((skill, i) => (
                  <motion.span
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.05 }}
                    whileHover={{ scale: 1.1, y: -2 }}
                    className="relative group px-3 py-1.5 md:px-4 md:py-2 bg-surface-container-high rounded-full text-[10px] md:text-xs font-bold text-primary hover:bg-secondary hover:text-white transition-colors cursor-default"
                  >
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
                  </motion.span>
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
      <section className="py-14 md:py-18 bg-surface relative overflow-hidden" id="certifications">
        {/* Decorative Elements */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.03, 0.05, 0.03] }}
            transition={{ duration: 8, repeat: Infinity }}
            className="absolute top-1/4 left-1/4 w-96 h-96 bg-secondary rounded-full blur-3xl"
          />
        </div>

        <div className="container mx-auto px-6 md:px-12 lg:px-20 relative z-10">
          <motion.h2 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-6 md:mb-8 relative inline-block"
          >
            <InlineText value={data.ui.certificationsTitle} onChange={(val) => updateData({ ui: { ...data.ui, certificationsTitle: val } })} />
            <motion.span
              initial={{ width: 0 }}
              whileInView={{ width: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="absolute -bottom-2 left-0 h-1 bg-secondary/30 rounded-full"
            />
          </motion.h2>
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6"
          >
            {data.certifications.map((cert, i) => {
              const certImages = mergeGalleryImages(cert.imageUrl, cert.imageUrls);
              const certCoverImage = certImages[0];
              const certIssuerLabel = getCertificationIssuerLabel(cert.issuer);
              const certDetailPreview = getPreviewText(getCertificationDetailText(cert), 145);
              const certUploadProgress = getUploadProgressByPrefix(uploadProgress, `cert-${cert.id}-`);

              return (
                <motion.div
                  key={cert.id}
                  variants={fadeUp}
                  whileHover={{ y: -8, boxShadow: '0 20px 40px -10px rgba(0,0,0,0.1)' }}
                  className="group relative bg-surface-container-lowest rounded-xl border border-outline-variant/10 shadow-sm overflow-hidden flex flex-col hover:-translate-y-1 transition-all duration-300"
                >
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

                  <div className={`aspect-[5/3] w-full flex items-center justify-center relative overflow-hidden ${cert.bgColor || 'bg-secondary-container text-on-secondary-container'}`}>
                    {certCoverImage ? (
                      <motion.img
                        whileHover={{ scale: 1.05 }}
                        transition={{ duration: 0.4 }}
                        src={certCoverImage}
                        alt={cert.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <motion.span
                        initial={{ scale: 0, rotate: -180 }}
                        whileInView={{ scale: 1, rotate: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1, duration: 0.6 }}
                        className="material-symbols-outlined text-5xl drop-shadow-md"
                        data-icon={cert.iconName || 'workspace_premium'}
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        {cert.iconName || 'workspace_premium'}
                      </motion.span>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-primary/70 via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-between p-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetailModal('certification', cert.id);
                        }}
                        className="text-white text-xs md:text-sm font-bold bg-black/30 backdrop-blur px-3 py-1.5 rounded-full hover:bg-black/45 transition-colors"
                      >
                        View Details
                      </button>
                      {certImages.length > 0 && (
                        <span className="text-[11px] text-white/95 bg-black/25 backdrop-blur px-2 py-1 rounded-full">
                          {certImages.length} photo{certImages.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 md:p-5 flex flex-col flex-1 bg-surface">
                    <h5 className="font-headline font-bold text-lg md:text-xl text-primary leading-tight mb-1.5">
                      <InlineText value={cert.title} onChange={(val) => {
                        const newCerts = [...data.certifications];
                        newCerts[i].title = val;
                        updateData({ certifications: newCerts });
                      }} />
                    </h5>
                    {!isEditMode && certIssuerLabel && (
                      <p className="text-xs md:text-sm font-medium text-secondary mb-2">
                        {certIssuerLabel}
                      </p>
                    )}

                    {!isEditMode && certDetailPreview && (
                      <p
                        className="text-sm text-on-surface-variant leading-relaxed"
                        style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {certDetailPreview}
                      </p>
                    )}

                    {isEditMode && (
                      <div className="mt-4 pt-4 border-t border-outline-variant/20 space-y-3">
                        <div className="text-[10px] font-bold text-outline-variant uppercase">Admin Controls</div>
                        <div>
                          <div className="text-[10px] font-bold text-outline-variant uppercase mb-1">Issuer</div>
                          <input
                            type="text"
                            value={cert.issuer || ''}
                            onChange={(e) => {
                              const newCerts = [...data.certifications];
                              newCerts[i].issuer = e.target.value;
                              updateData({ certifications: newCerts });
                            }}
                            className="w-full bg-white border border-outline-variant/40 rounded px-2 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Google Career Certificates"
                          />
                        </div>
                        <div>
                          <div className="text-[10px] font-bold text-outline-variant uppercase mb-1">Details (shown in View Details)</div>
                          <textarea
                            value={cert.details || ''}
                            onChange={(e) => {
                              const newCerts = [...data.certifications];
                              newCerts[i].details = e.target.value;
                              updateData({ certifications: newCerts });
                            }}
                            className="w-full min-h-[90px] bg-white border border-outline-variant/40 rounded px-2 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
                            placeholder="Add full certification details here."
                          />
                        </div>
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
                            multiple
                            ref={(el) => { fileInputRefs.current[`cert-gallery-${cert.id}`] = el; }}
                            onChange={async (e) => {
                              const files = Array.from(e.target.files || []) as File[];
                              if (files.length > 0) {
                                const uploadedUrls = await uploadMultipleFiles(files, 'certificates', `cert-${cert.id}`);
                                appendCertificationGallery(cert.id, uploadedUrls);
                              }
                              e.currentTarget.value = '';
                            }}
                            className="hidden"
                          />
                          <button
                            onClick={() => fileInputRefs.current[`cert-gallery-${cert.id}`]?.click()}
                            className="flex-1 text-xs font-bold bg-primary/10 text-primary px-2 py-2 rounded hover:bg-primary/20 transition-colors"
                          >
                            {certUploadProgress !== null ? `Uploading ${certUploadProgress}%` : 'Upload Photos'}
                          </button>
                          {certImages.length > 0 && (
                            <button
                              onClick={() => updateCertificationGallery(cert.id, [])}
                              className="text-xs font-bold bg-error/10 text-error px-3 py-2 rounded hover:bg-error/20 transition-colors"
                            >
                              Remove All
                            </button>
                          )}
                        </div>

                        {certImages.length > 0 && (
                          <div className="grid grid-cols-4 gap-2">
                            {certImages.map((image, imageIndex) => (
                              <div key={`${cert.id}-gallery-${imageIndex}`} className="relative group/thumb rounded-md overflow-hidden border border-outline-variant/20">
                                <img
                                  src={image}
                                  alt={`${cert.title} image ${imageIndex + 1}`}
                                  className="w-full h-16 object-cover"
                                  referrerPolicy="no-referrer"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeCertificationGalleryImage(cert.id, imageIndex)}
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
            {isEditMode && (
              <motion.div variants={fadeUp} className="flex items-center justify-center col-span-1 md:col-span-3 lg:col-span-4">
                <button 
                  onClick={() => {
                    const newCerts = [...data.certifications, { id: Date.now().toString(), title: 'New Certification', issuer: 'New Issuer', details: '', iconName: 'workspace_premium', imageUrl: '', imageUrls: [] }];
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
      <section className="py-14 md:py-18 bg-surface-container-low relative overflow-hidden" id="projects">
        {/* Animated Background Pattern */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 100, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-outline-variant/5 rounded-full"
        />

        <div className="container mx-auto px-6 md:px-12 lg:px-20 relative z-10">
          <motion.h2 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-6 md:mb-8 relative inline-block"
          >
            <InlineText value={data.ui.sectionTitles.projects} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, projects: val } } })} />
            <motion.span
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="absolute -bottom-2 left-0 right-0 h-1 bg-secondary/30 rounded-full origin-left"
            />
          </motion.h2>
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-7"
          >
            {(showAllProjects ? data.projects : data.projects.slice(0, 4)).map((project) => {
              const projectImages = mergeGalleryImages(project.imageUrl, project.imageUrls);
              const projectCoverImage = projectImages[0];
              const projectUploadProgress = getUploadProgressByPrefix(uploadProgress, `project-${project.id}-`);

              return (
                <motion.div
                  key={project.id}
                  variants={fadeUp}
                  whileHover={{ y: -10 }}
                  className="group relative max-w-[24rem] w-full"
                >
                  {isEditMode && (
                    <button
                      onClick={() => {
                        const newProjects = data.projects.filter((p) => p.id !== project.id);
                        updateData({ projects: newProjects });
                      }}
                      className="absolute -right-4 -top-4 text-error hover:text-error/80 opacity-0 group-hover:opacity-100 transition-opacity z-20 bg-white rounded-full shadow-md p-1"
                      title="Remove Project"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  )}
                  <div className="aspect-[16/10] rounded-xl overflow-hidden mb-3 md:mb-4 relative shadow-lg bg-surface-container-high">
                    {projectCoverImage ? (
                      <motion.img
                        whileHover={{ scale: 1.08 }}
                        transition={{ duration: 0.6 }}
                        src={projectCoverImage}
                        alt={project.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-surface-container-high to-surface-container-highest">
                        <span className="material-symbols-outlined text-4xl text-secondary/80">photo_library</span>
                      </div>
                    )}
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      className="absolute inset-0 bg-gradient-to-t from-primary/70 via-primary/25 to-transparent flex items-end justify-between p-4"
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openDetailModal('project', project.id);
                        }}
                        className="text-white text-xs md:text-sm font-bold bg-black/30 backdrop-blur px-3 py-1.5 rounded-full hover:bg-black/45 transition-colors"
                      >
                        View Details
                      </button>
                      {projectImages.length > 0 && (
                        <span className="text-[11px] text-white/95 bg-black/25 backdrop-blur px-2 py-1 rounded-full">
                          {projectImages.length} photo{projectImages.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </motion.div>
                    {isEditMode && (
                      <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          ref={(el) => { fileInputRefs.current[`project-gallery-${project.id}`] = el; }}
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || []) as File[];
                            if (files.length > 0) {
                              const uploadedUrls = await uploadMultipleFiles(files, 'projects', `project-${project.id}`);
                              appendProjectGallery(project.id, uploadedUrls);
                            }
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            fileInputRefs.current[`project-gallery-${project.id}`]?.click();
                          }}
                          className="bg-white text-primary px-4 py-2 rounded-full font-bold text-sm shadow-lg"
                        >
                          Upload Photos
                        </button>
                      </div>
                    )}
                  </div>
                  <h3 className="font-headline text-lg md:text-xl font-bold text-primary mb-1.5 group-hover:text-secondary transition-colors">
                    <InlineText value={project.title} onChange={(val) => {
                      const newProjects = [...data.projects];
                      const pIndex = newProjects.findIndex((p) => p.id === project.id);
                      if (pIndex !== -1) {
                        newProjects[pIndex].title = val;
                        updateData({ projects: newProjects });
                      }
                    }} />
                  </h3>
                  {isEditMode ? (
                    <InlineText multiline value={project.description} className="text-on-surface-variant text-sm leading-relaxed" onChange={(val) => {
                      const newProjects = [...data.projects];
                      const pIndex = newProjects.findIndex((p) => p.id === project.id);
                      if (pIndex !== -1) {
                        newProjects[pIndex].description = val;
                        updateData({ projects: newProjects });
                      }
                    }} />
                  ) : (
                    <p
                      className="text-on-surface-variant text-sm leading-relaxed min-h-[4.5rem]"
                      style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {getPreviewText(project.description, 220)}
                    </p>
                  )}
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

                  {isEditMode && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[`project-gallery-${project.id}`]?.click()}
                          className="text-[11px] font-bold bg-primary/10 text-primary px-3 py-1.5 rounded hover:bg-primary/20 transition-colors"
                        >
                          {projectUploadProgress !== null ? `Uploading ${projectUploadProgress}%` : 'Add More Photos'}
                        </button>
                        {projectImages.length > 0 && (
                          <button
                            type="button"
                            onClick={() => updateProjectGallery(project.id, [])}
                            className="text-[11px] font-bold bg-error/10 text-error px-3 py-1.5 rounded hover:bg-error/20 transition-colors"
                          >
                            Remove All
                          </button>
                        )}
                      </div>
                      {projectImages.length > 0 && (
                        <div className="grid grid-cols-5 gap-2">
                          {projectImages.map((image, imageIndex) => (
                            <div key={`${project.id}-image-${imageIndex}`} className="relative group/thumb rounded-md overflow-hidden border border-outline-variant/20">
                              <img
                                src={image}
                                alt={`${project.title} image ${imageIndex + 1}`}
                                className="w-full h-14 object-cover"
                                referrerPolicy="no-referrer"
                              />
                              <button
                                type="button"
                                onClick={() => removeProjectGalleryImage(project.id, imageIndex)}
                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-[10px] opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {project.link && project.link !== '#' && (
                    <a
                      href={project.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex mt-4 text-xs font-bold text-primary hover:text-secondary transition-colors"
                    >
                      {project.ctaLabel || 'View Project'}
                    </a>
                  )}
                </motion.div>
              );
            })}
            {isEditMode && (
              <motion.div variants={fadeUp} className="flex items-center justify-center aspect-video rounded-xl border-2 border-dashed border-outline-variant hover:border-primary transition-colors cursor-pointer"
                onClick={() => {
                  const coverImage = 'https://picsum.photos/seed/newproject/800/600';
                  const newProjects = [...data.projects, { id: Date.now().toString(), title: 'New Project', description: 'New Description', link: '#', imageUrl: coverImage, imageUrls: [coverImage] }];
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-12 text-center"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowAllProjects(!showAllProjects)}
                className="bg-surface-container-highest text-primary px-8 py-3 rounded-lg font-bold text-sm hover:bg-outline-variant transition-colors duration-300 shadow-md"
              >
                {showAllProjects ? "Show Less" : "View more other projects"}
              </motion.button>
            </motion.div>
          )}
        </div>
      </section>
      )}

      {/* Contact Me */}
      {showContactSection && (
      <section className="py-16 md:py-24 bg-surface relative overflow-hidden" id="contact">
        {/* Animated Background */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.03, 0.06, 0.03]
            }}
            transition={{ duration: 10, repeat: Infinity }}
            className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-secondary rounded-full blur-3xl"
          />
          <motion.div
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [0.02, 0.05, 0.02]
            }}
            transition={{ duration: 12, repeat: Infinity, delay: 2 }}
            className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-primary rounded-full blur-3xl"
          />
        </div>

        <div className="container mx-auto px-6 md:px-12 lg:px-20 relative z-10">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="max-w-6xl mx-auto bg-surface-container-lowest rounded-2xl overflow-hidden shadow-2xl flex flex-col md:flex-row border border-outline-variant/20"
          >
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="md:w-1/2 p-8 md:p-12 bg-primary text-on-primary relative overflow-hidden"
            >
              {/* Decorative Elements */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="absolute -top-20 -right-20 w-40 h-40 border-2 border-white/10 rounded-full"
              />
              <motion.div
                animate={{ rotate: -360 }}
                transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
                className="absolute -bottom-10 -left-10 w-32 h-32 border border-white/10 rounded-full"
              />
              
              <div className="relative z-10">
                <h2 className="font-headline text-3xl md:text-4xl font-bold mb-6 md:mb-8">
                  <InlineText value={data.ui.sectionTitles.contact} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, contact: val } } })} />
                </h2>
                <div className="text-primary-fixed-dim mb-8 md:mb-12 text-base md:text-lg">
                  <InlineText multiline value={data.contact.intro} onChange={(val) => updateData({ contact: { ...data.contact, intro: val } })} />
                </div>
                <div className="space-y-4 md:space-y-6">
                  <motion.div
                    whileHover={{ x: 5 }}
                    className="flex items-center gap-3 md:gap-4"
                  >
                    <motion.span
                      whileHover={{ rotate: 360 }}
                      transition={{ duration: 0.6 }}
                      className="material-symbols-outlined text-secondary-fixed text-lg md:text-xl"
                      data-icon="mail"
                    >
                      mail
                    </motion.span>
                    <span className="font-medium text-sm md:text-base">
                      <InlineText value={data.contact.email} onChange={(val) => updateData({ contact: { ...data.contact, email: val } })} />
                    </span>
                  </motion.div>
                  <motion.div
                    whileHover={{ x: 5 }}
                    className="flex items-center gap-3 md:gap-4"
                  >
                    <motion.span
                      whileHover={{ rotate: 360 }}
                      transition={{ duration: 0.6 }}
                      className="material-symbols-outlined text-secondary-fixed text-lg md:text-xl"
                      data-icon="call"
                    >
                      call
                    </motion.span>
                    <span className="font-medium text-sm md:text-base">
                      <InlineText value={data.contact.phone} onChange={(val) => updateData({ contact: { ...data.contact, phone: val } })} />
                    </span>
                  </motion.div>
                  <motion.div
                    whileHover={{ x: 5 }}
                    className="flex items-center gap-3 md:gap-4"
                  >
                    <motion.span
                      whileHover={{ rotate: 360 }}
                      transition={{ duration: 0.6 }}
                      className="material-symbols-outlined text-secondary-fixed text-lg md:text-xl"
                      data-icon="location_on"
                    >
                      location_on
                    </motion.span>
                    <span className="font-medium text-sm md:text-base">
                      <InlineText value={data.contact.location} onChange={(val) => updateData({ contact: { ...data.contact, location: val } })} />
                    </span>
                  </motion.div>
                </div>
              </div>
            </motion.div>
            <motion.div
              initial={{ x: 50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="md:w-1/2 p-8 md:p-12"
            >
              <form className="space-y-4 md:space-y-6" onSubmit={handleContactSubmit}>
                <div>
                  <label className="block text-xs md:text-sm font-label font-bold text-primary mb-1 md:mb-2">Name</label>
                  <input
                    className="w-full bg-surface-container border-none rounded-lg focus:ring-2 focus:ring-secondary text-primary p-3 md:p-4 text-sm md:text-base"
                    placeholder="Julien Dupont"
                    type="text"
                    name="name"
                    required
                    minLength={2}
                    maxLength={120}
                    disabled={contactSubmitting}
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="block text-xs md:text-sm font-label font-bold text-primary mb-1 md:mb-2">Email Address</label>
                  <input
                    className="w-full bg-surface-container border-none rounded-lg focus:ring-2 focus:ring-secondary text-primary p-3 md:p-4 text-sm md:text-base"
                    placeholder="julien@agency.com"
                    type="email"
                    name="email"
                    required
                    maxLength={160}
                    disabled={contactSubmitting}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="block text-xs md:text-sm font-label font-bold text-primary mb-1 md:mb-2">How can I support you?</label>
                  <textarea
                    className="w-full bg-surface-container border-none rounded-lg focus:ring-2 focus:ring-secondary text-primary p-3 md:p-4 text-sm md:text-base"
                    placeholder="Tell me about your vision..."
                    rows={4}
                    name="message"
                    required
                    minLength={10}
                    maxLength={5000}
                    disabled={contactSubmitting}
                  />
                </div>
                <input
                  type="text"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                  aria-hidden="true"
                />
                <p className="text-[11px] md:text-xs text-secondary leading-relaxed">
                  Protected by anti-spam rate limits for faster and safer replies.
                </p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full bg-primary text-on-primary py-3 md:py-4 rounded-lg font-bold text-sm md:text-base hover:bg-secondary transition-all duration-300 shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
                  type="submit"
                  disabled={contactSubmitting}
                >
                  {contactSubmitting ? 'Sending...' : 'Send Inquiry'}
                </motion.button>
              </form>
            </motion.div>
          </motion.div>
        </div>
      </section>
      )}

      <Footer />
      </div>

      <AnimatePresence>
        {activeDetailModal && (activeProject || activeCertification) && (
          <motion.div
            className="fixed inset-0 z-[90] bg-[#111a1f]/65 backdrop-blur-sm p-3 md:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeDetailModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              transition={{ duration: 0.26, ease: 'easeOut' }}
              onClick={(event) => event.stopPropagation()}
              className="mx-auto h-full max-h-[92vh] w-full max-w-6xl rounded-3xl border border-white/15 bg-surface-container-lowest shadow-2xl overflow-hidden"
            >
              <div className="grid h-full grid-cols-1 lg:grid-cols-[1.08fr_0.92fr]">
                <div className="relative bg-[#0f171c] min-h-[280px] lg:min-h-full">
                  <AnimatePresence mode="wait">
                    {activeDetailImages[boundedDetailImageIndex] ? (
                      <motion.img
                        key={activeDetailImages[boundedDetailImageIndex]}
                        initial={{ opacity: 0, scale: 1.03 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.99 }}
                        transition={{ duration: 0.24 }}
                        src={activeDetailImages[boundedDetailImageIndex]}
                        alt={(activeProject || activeCertification)?.title || 'Detail image'}
                        className="h-full w-full object-contain p-2 md:p-4"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <motion.div
                        key="no-image"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="h-full w-full flex items-center justify-center text-white/75"
                      >
                        <div className="text-center">
                          <span className="material-symbols-outlined text-5xl mb-2">image_not_supported</span>
                          <p className="text-sm">No images uploaded yet</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {activeDetailImages.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={showPreviousDetailImage}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 transition-colors"
                        aria-label="Previous image"
                      >
                        <span className="material-symbols-outlined text-xl">chevron_left</span>
                      </button>
                      <button
                        type="button"
                        onClick={showNextDetailImage}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/35 text-white backdrop-blur hover:bg-black/50 transition-colors"
                        aria-label="Next image"
                      >
                        <span className="material-symbols-outlined text-xl">chevron_right</span>
                      </button>
                    </>
                  )}

                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/60 to-transparent">
                    <div className="flex items-center justify-between text-white text-xs">
                      <span className="font-bold tracking-wide uppercase">
                        {activeDetailModal.type === 'project' ? 'Portfolio Sample' : 'Certification'}
                      </span>
                      <span>
                        {activeDetailImages.length > 0 ? `${boundedDetailImageIndex + 1} / ${activeDetailImages.length}` : '0 / 0'}
                      </span>
                    </div>

                    {activeDetailImages.length > 1 && (
                      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                        {activeDetailImages.map((image, index) => (
                          <button
                            type="button"
                            key={`detail-thumb-${index}`}
                            onClick={() => setActiveDetailImageIndex(index)}
                            className={`shrink-0 w-16 h-12 rounded-md overflow-hidden border-2 transition-colors ${index === boundedDetailImageIndex ? 'border-white' : 'border-white/35 hover:border-white/60'}`}
                          >
                            <img src={image} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="relative flex flex-col h-full overflow-y-auto">
                  <button
                    type="button"
                    onClick={closeDetailModal}
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-surface-container-high text-primary hover:bg-outline-variant transition-colors"
                    aria-label="Close details"
                  >
                    <span className="material-symbols-outlined text-lg">close</span>
                  </button>

                  <div className="p-6 md:p-8 pt-12 md:pt-14">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold uppercase tracking-wide">
                      <span className="material-symbols-outlined text-sm">
                        {activeDetailModal.type === 'project' ? 'work' : 'workspace_premium'}
                      </span>
                      {activeDetailModal.type === 'project' ? 'Sample Work' : 'Credentials'}
                    </div>

                    <h3 className="mt-4 font-headline text-2xl md:text-3xl font-bold text-primary leading-tight">
                      {activeProject?.title || activeCertification?.title}
                    </h3>

                    {activeProject ? (
                      <p className="mt-2 text-sm md:text-base text-secondary font-semibold">
                        {activeProjectMeta || 'Portfolio project'}
                      </p>
                    ) : activeCertificationIssuer ? (
                      <p className="mt-2 text-sm md:text-base text-secondary font-semibold">
                        {activeCertificationIssuer}
                      </p>
                    ) : null}

                    {(activeProjectDetails || activeCertificationDetails) ? (
                      <p className="mt-5 text-sm md:text-base text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                        {activeProjectDetails || activeCertificationDetails}
                      </p>
                    ) : activeDetailModal.type === 'certification' ? (
                      <p className="mt-5 text-sm md:text-base text-on-surface-variant/75 leading-relaxed">
                        No additional details provided yet.
                      </p>
                    ) : null}

                    {activeProject && activeProject.tags && activeProject.tags.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {activeProject.tags.map((tag) => (
                          <span key={`detail-tag-${activeProject.id}-${tag}`} className="text-[11px] uppercase tracking-widest px-2.5 py-1 rounded-full bg-surface-container-high text-secondary">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {activeProject?.link && activeProject.link !== '#' && (
                      <a
                        href={activeProject.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex mt-7 items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-full font-bold text-sm hover:bg-secondary transition-colors"
                      >
                        {activeProject.ctaLabel || 'Open Project'}
                        <span className="material-symbols-outlined text-sm">north_east</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
    </EditModeContext.Provider>
  );
}
