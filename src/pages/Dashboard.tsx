import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { sileo } from 'sileo';
import { auth, db } from '../firebase';
import { doc, getDoc, collection, getDocs, orderBy, query, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { usePortfolioData, PortfolioData, DEFAULT_SECTION_VISIBILITY, PortfolioSectionKey } from '../hooks/usePortfolioData';
import { IconPicker } from '../components/IconPicker';
import { UnifiedLoadingScreen } from '../components/UnifiedLoadingScreen';
import { uploadToCloudinary } from '../utils/localUpload';

const BRAND_NAME = 'KDL Works';
const LEGAL_ENTITY = 'KatD Works';
const SUPPORT_EMAIL = 'katdworks@gmail.com';
const SUPPORT_HOURS = 'Monday-Friday, 9:00 AM - 6:00 PM (UTC+8)';
const POLICY_EFFECTIVE_DATE = '2026-03-23';
const POLICY_VERSION = 'v1.0';
const MAX_INTRO_VIDEO_SIZE_MB = 200;
const SUPPRESSED_REVIEW_ALERTS_KEY = 'katdworks_suppressed_review_alerts';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function mergeGalleryImages(primaryUrl?: string, imageUrls?: string[]) {
  const merged = [...(primaryUrl ? [primaryUrl] : []), ...(imageUrls || [])];
  return merged.filter((url, index, arr) => Boolean(url) && arr.indexOf(url) === index);
}

function getUploadProgressByPrefix(uploadProgress: Record<string, number>, prefix: string) {
  const matches = Object.entries(uploadProgress)
    .filter(([key]) => key.startsWith(prefix))
    .map(([, value]) => value);

  if (matches.length === 0) return null;

  const total = matches.reduce((sum, value) => sum + value, 0);
  return Math.round(total / matches.length);
}

type DashboardTrustBadge = {
  label: string;
  icon?: string;
};

function normalizeTrustBadges(
  badges: PortfolioData['about']['trustBadges'] | undefined
): DashboardTrustBadge[] {
  if (!Array.isArray(badges)) return [];

  return badges
    .map((badge) => {
      if (!badge) return null;
      if (typeof badge === 'string') {
        return { label: badge, icon: 'verified' };
      }
      return {
        label: badge.label || '',
        icon: badge.icon || 'verified',
      };
    })
    .filter((badge): badge is DashboardTrustBadge => Boolean(badge));
}

type AdminReviewAlert = {
  id: string;
  title: string;
  description: string;
};

function extractPhoneNumbers(values: string[]) {
  return values
    .flatMap((value) => value.match(/\+?\d[\d\s().-]{6,}\d/g) || [])
    .map((value) => value.replace(/\D/g, ''))
    .filter((value) => value.length >= 7);
}

function hasPlaceholderText(value: string) {
  return /\b(test|testing|placeholder|lorem ipsum|sample|new trust badge|new highlight)\b/i.test(value);
}

function getAdminReviewAlerts(portfolio: PortfolioData): AdminReviewAlert[] {
  const alerts: AdminReviewAlert[] = [];
  const phoneTextSources = [
    portfolio.contact.phone || '',
    portfolio.contact.intro || '',
    ...(portfolio.about.paragraphs || []),
    portfolio.hero.description || '',
  ];
  const phoneNumbers = extractPhoneNumbers(phoneTextSources);
  const configuredPhone = (portfolio.contact.phone || '').replace(/\D/g, '');

  if (!configuredPhone) {
    alerts.push({
      id: 'missing-phone',
      title: 'Contact phone is missing',
      description: 'Add a phone number or confirm that the portfolio should not display one.',
    });
  }

  if (new Set(phoneNumbers).size > 1 || (configuredPhone && phoneNumbers.some((phone) => phone !== configuredPhone))) {
    alerts.push({
      id: 'conflicting-phones',
      title: 'Phone numbers need checking',
      description: 'Different phone numbers were found across the contact and profile copy.',
    });
  }

  if (!portfolio.about.introVideoUrl?.trim()) {
    alerts.push({
      id: 'missing-intro-video',
      title: 'Introduction video is not uploaded',
      description: 'Add an introduction video before publishing the portfolio.',
    });
  }

  if (!portfolio.hero.headline?.trim() || !portfolio.hero.subheadline?.trim() || !portfolio.hero.description?.trim()) {
    alerts.push({
      id: 'incomplete-hero',
      title: 'Hero content is incomplete',
      description: 'Confirm the name, role, and introduction text are all filled in before publishing.',
    });
  }

  if (!portfolio.hero.imageUrl?.trim()) {
    alerts.push({
      id: 'missing-profile-image',
      title: 'Profile visual is missing',
      description: 'Add the main profile image or confirm that the hero should intentionally have no image.',
    });
  }

  const contactEmail = portfolio.contact.email?.trim() || '';
  if (!contactEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    alerts.push({
      id: 'invalid-contact-email',
      title: 'Contact email needs checking',
      description: 'Add a valid reply-to email address in the contact settings.',
    });
  }

  if (!portfolio.contact.intro?.trim()) {
    alerts.push({
      id: 'missing-contact-intro',
      title: 'Contact introduction is blank',
      description: 'Add a short invitation so visitors know what to contact you about.',
    });
  }

  if (!portfolio.portfolioPdfUrl?.trim()) {
    alerts.push({
      id: 'missing-portfolio-pdf',
      title: 'Portfolio PDF is not uploaded',
      description: 'Upload a PDF or remove the download expectation from the public experience.',
    });
  }

  if (!portfolio.about.quote?.trim() || !(portfolio.about.paragraphs || []).some((paragraph) => paragraph.trim())) {
    alerts.push({
      id: 'incomplete-about',
      title: 'About section needs content',
      description: 'Add the personal quote and at least one biography paragraph.',
    });
  }

  const incompleteExperience = (portfolio.experience || []).some((item) => !item.title?.trim() || !item.company?.trim() || !item.description?.trim());
  const incompleteEducation = (portfolio.education || []).some((item) => !item.program?.trim() || !item.school?.trim());
  const incompleteTraining = (portfolio.trainings || []).some((item) => !item.title?.trim() || !item.provider?.trim());
  const incompleteProject = (portfolio.projects || []).some((item) => !item.title?.trim() || !item.description?.trim());

  if (incompleteExperience || incompleteEducation || incompleteTraining || incompleteProject) {
    alerts.push({
      id: 'incomplete-records',
      title: 'Some records are incomplete',
      description: 'Check experience, education, training, and project entries for missing titles, organizations, or descriptions.',
    });
  }

  if (!portfolio.skills?.some((skill) => skill.trim())) {
    alerts.push({
      id: 'missing-skills',
      title: 'No skills are listed',
      description: 'Add at least one skill or tools tag so the expertise section is useful.',
    });
  }

  const navigationLabels = (portfolio.ui.navLinks || []).map((link) => link.label.trim().toLowerCase()).filter(Boolean);
  if (new Set(navigationLabels).size !== navigationLabels.length) {
    alerts.push({
      id: 'duplicate-navigation',
      title: 'Navigation labels are duplicated',
      description: 'Give repeated navigation links distinct labels so visitors can tell them apart.',
    });
  }

  if (portfolio.about.introVideoUrl?.trim()) {
    try {
      const videoUrl = new URL(portfolio.about.introVideoUrl);
      if (!['http:', 'https:'].includes(videoUrl.protocol)) throw new Error('Unsupported protocol');
    } catch {
      alerts.push({
        id: 'invalid-intro-video-url',
        title: 'Introduction video URL needs checking',
        description: 'Use a complete HTTPS video link or upload a supported video file.',
      });
    }
  }

  const introContext = [
    portfolio.about.introVideoHeadline || '',
    portfolio.about.introVideoPromise || '',
    ...(portfolio.about.introVideoHighlights || []),
    ...normalizeTrustBadges(portfolio.about.trustBadges).map((badge) => badge.label),
  ];
  const hasPlaceholderIntroContext = introContext.some(hasPlaceholderText);
  const hasBlankIntroContext = !portfolio.about.introVideoHeadline?.trim()
    || !portfolio.about.introVideoPromise?.trim()
    || (portfolio.about.introVideoHighlights || []).some((highlight) => !highlight.trim())
    || normalizeTrustBadges(portfolio.about.trustBadges).some((badge) => !badge.label.trim());

  if (hasPlaceholderIntroContext || hasBlankIntroContext) {
    alerts.push({
      id: 'intro-context-review',
      title: 'Introduction video details need review',
      description: 'Check the video description, highlights, and trust badges for blank or placeholder content.',
    });
  }

  const spellingText = [
    portfolio.hero.headline,
    portfolio.hero.subheadline,
    portfolio.hero.description,
    portfolio.about.quote,
    ...(portfolio.about.paragraphs || []),
    portfolio.contact.intro,
    ...introContext,
  ].join(' ');
  const possibleTypo = spellingText.match(/\b(teh|recieve|recieved|seperate|definately|occured|untill|wierd|experiance|profesional|managment|bussiness|succesful|occassion|accomodate|availble|custommer|operatons|shopfiy|marketplce)\b/i)?.[0];

  if (possibleTypo) {
    alerts.push({
      id: 'possible-spelling',
      title: 'Possible spelling issue',
      description: `Review the word "${possibleTypo}" in the portfolio copy.`,
    });
  }

  return alerts;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const currentYear = new Date().getFullYear();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { data, loading: dataLoading, updateData, readError } = usePortfolioData();
  
  // Local state for editing
  const [formData, setFormData] = useState<PortfolioData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [dismissedReviewAlerts, setDismissedReviewAlerts] = useState<string[]>([]);
  const [suppressedReviewAlerts, setSuppressedReviewAlerts] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(SUPPRESSED_REVIEW_ALERTS_KEY);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  });
  const [newSkill, setNewSkill] = useState('');
  const [activeTab, setActiveTab] = useState<'editor'|'analytics'|'pwa'>('editor');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [stats, setStats] = useState<any>({
    views: 0,
    totalViews: 0,
    uniqueVisitors: 0,
    downloads: 0,
    bottomScrolls: 0,
    referrers: { direct: 0, linkedin: 0, facebook: 0, other: 0 }
  });
  const [dailyStats, setDailyStats] = useState<Array<{ date: string; views: number; downloads: number; bottomScrolls: number }>>([]);
  const [analyticsRange, setAnalyticsRange] = useState<7 | 30 | 90>(30);
  const [activeModal, setActiveModal] = useState<null | 'userGuide' | 'prioritySupport' | 'privacy' | 'terms' | 'contact'>(null);
  const [supportSubject, setSupportSubject] = useState('Dashboard Priority Support');
  const [supportCategory, setSupportCategory] = useState<'bug' | 'incident' | 'billing' | 'account' | 'other'>('bug');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportPriority, setSupportPriority] = useState<'high' | 'urgent'>('high');
  const [supportConsent, setSupportConsent] = useState(false);
  const [supportSubmitting, setSupportSubmitting] = useState(false);
  const [showMissingDocState, setShowMissingDocState] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const lastEditToastAtRef = useRef(0);
  const uploadMilestonesRef = useRef<Record<string, number[]>>({});
  const uploadDropzoneClass = 'flex items-center gap-4 bg-surface-container-low p-3 rounded-lg border-2 border-dashed border-outline-variant/30 cursor-pointer hover:border-outline-variant/60';
  const uploadDeleteActionClass = 'ml-auto text-[10px] font-bold text-error hover:opacity-80 underline';

  const handleFileUpload = async (file: File, path: string, onComplete: (url: string) => void, progressKey?: string) => {
    if (!file) return;
    const key = progressKey || path;
    sileo.info({
      title: 'Upload started',
      description: `Uploading ${file.name} to ${path}...`
    });
    uploadMilestonesRef.current[key] = [];
    setUploadProgress(prev => ({ ...prev, [key]: 0 }));

    try {
      const url = await uploadToCloudinary(file, path, (progress) => {
        const milestones = uploadMilestonesRef.current[key] || [];
        const marks = [25, 50, 75];
        for (const mark of marks) {
          if (progress >= mark && !milestones.includes(mark)) {
            milestones.push(mark);
            sileo.info({
              title: 'Upload in progress',
              description: `${file.name}: ${mark}% uploaded`
            });
          }
        }
        uploadMilestonesRef.current[key] = milestones;
        setUploadProgress(prev => ({ ...prev, [key]: progress }));
      });
      onComplete(url);
      sileo.info({
        title: 'Upload completed',
        description: `${file.name} uploaded successfully to ${path}.`
      });
    } catch (error) {
      console.error('Upload error:', error);
      const message = error instanceof Error ? error.message : 'Unknown upload error';
      sileo.warning({
        title: 'Upload failed',
        description: `${file.name} failed to upload. ${message}`
      });
    } finally {
      delete uploadMilestonesRef.current[key];
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[key];
        return newProgress;
      });
    }
  };

  const uploadMultipleFiles = async (files: File[], path: string, progressPrefix: string) => {
    const uploadedUrls: string[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      await handleFileUpload(file, path, (url) => {
        uploadedUrls.push(url);
      }, `${progressPrefix}-${index}`);
    }

    return uploadedUrls;
  };

  const updateCertificationGallery = (certId: string, images: string[]) => {
    setFormData(prev => prev ? {
      ...prev,
      certifications: prev.certifications.map(cert => cert.id === certId
        ? { ...cert, imageUrl: images[0] || '', imageUrls: images }
        : cert)
    } : null);
  };

  const appendCertificationGallery = (certId: string, images: string[]) => {
    setFormData(prev => prev ? {
      ...prev,
      certifications: prev.certifications.map(cert => {
        if (cert.id !== certId) return cert;
        const merged = mergeGalleryImages(cert.imageUrl, [...(cert.imageUrls || []), ...images]);
        return { ...cert, imageUrl: merged[0] || '', imageUrls: merged };
      })
    } : null);
  };

  const removeCertificationGalleryImage = (certId: string, imageIndex: number) => {
    setFormData(prev => prev ? {
      ...prev,
      certifications: prev.certifications.map(cert => {
        if (cert.id !== certId) return cert;
        const merged = mergeGalleryImages(cert.imageUrl, cert.imageUrls);
        const filtered = merged.filter((_, index) => index !== imageIndex);
        return { ...cert, imageUrl: filtered[0] || '', imageUrls: filtered };
      })
    } : null);
  };

  const updateProjectGallery = (projectId: string, images: string[]) => {
    setFormData(prev => prev ? {
      ...prev,
      projects: prev.projects.map(project => project.id === projectId
        ? { ...project, imageUrl: images[0] || '', imageUrls: images }
        : project)
    } : null);
  };

  const appendProjectGallery = (projectId: string, images: string[]) => {
    setFormData(prev => prev ? {
      ...prev,
      projects: prev.projects.map(project => {
        if (project.id !== projectId) return project;
        const merged = mergeGalleryImages(project.imageUrl, [...(project.imageUrls || []), ...images]);
        return { ...project, imageUrl: merged[0] || '', imageUrls: merged };
      })
    } : null);
  };

  const removeProjectGalleryImage = (projectId: string, imageIndex: number) => {
    setFormData(prev => prev ? {
      ...prev,
      projects: prev.projects.map(project => {
        if (project.id !== projectId) return project;
        const merged = mergeGalleryImages(project.imageUrl, project.imageUrls);
        const filtered = merged.filter((_, index) => index !== imageIndex);
        return { ...project, imageUrl: filtered[0] || '', imageUrls: filtered };
      })
    } : null);
  };

  useEffect(() => {
    if (!formData || !data) return;
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(data);
    if (!hasChanges) return;

    const now = Date.now();
    if (now - lastEditToastAtRef.current > 1800) {
      sileo.info({
        title: 'Draft changed',
        description: 'Change detected. Auto-save will sync to Firestore shortly.'
      });
      lastEditToastAtRef.current = now;
    }

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await updateData(formData);
        setSaveMessage('Auto-saved');
        sileo.info({
          title: 'Auto-saved',
          description: `Dashboard changes synced at ${new Date().toLocaleTimeString()}.`
        });
        setTimeout(() => setSaveMessage(''), 2000);
      } catch (error) {
        setSaveMessage('Error saving');
        const message = error instanceof Error ? error.message : 'Unknown save error';
        sileo.warning({
          title: 'Auto-save failed',
          description: `Could not sync dashboard changes. ${message}`
        });
      } finally {
        setIsSaving(false);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [formData, data, updateData]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        navigate('/login');
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    const updateInstallState = () => {
      const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsPwaInstalled(displayModeQuery.matches || iosStandalone);
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setInstallPrompt(null);
      setIsPwaInstalled(true);
      sileo.info({ title: 'PWA installed', description: 'The admin dashboard is now available from your device home screen.' });
    };

    updateInstallState();
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    displayModeQuery.addEventListener('change', updateInstallState);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      displayModeQuery.removeEventListener('change', updateInstallState);
    };
  }, []);

  useEffect(() => {
    if (data && !formData) {
      setFormData(data);
    }
  }, [data, formData]);

  useEffect(() => {
    if (authLoading || dataLoading || formData) {
      setShowMissingDocState(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowMissingDocState(true);
    }, 1500);

    return () => clearTimeout(timer);
  }, [authLoading, dataLoading, formData, readError]);

  useEffect(() => {
    if (!readError) return;
    sileo.warning({
      title: 'Firestore read issue',
      description: `Dashboard could not fully load live data. ${readError}`
    });
  }, [readError]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      sileo.info({
        title: 'Signed out',
        description: 'You have been securely logged out.',
        duration: 1800
      });
      navigate('/login');
    } catch (error) {
      sileo.warning({
        title: 'Sign-out failed',
        description: 'Please try again.'
      });
    }
  };

  const handleInstallPwa = async () => {
    if (isPwaInstalled) return;
    if (!installPrompt) {
      sileo.info({
        title: 'Use your browser install menu',
        description: 'On iPhone use Share > Add to Home Screen. On Android or desktop use the browser menu > Install app.',
      });
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === 'accepted') {
      sileo.info({ title: 'Installing dashboard', description: 'The app shortcut will appear on your device shortly.' });
    }
  };

  const handleSuppressReviewAlert = (alertId: string) => {
    setSuppressedReviewAlerts((current) => {
      const next = current.includes(alertId) ? current : [...current, alertId];
      localStorage.setItem(SUPPRESSED_REVIEW_ALERTS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleSave = async () => {
    if (!formData) return;
    setIsSaving(true);
    setSaveMessage('');
    try {
      await updateData(formData);
      setSaveMessage('Changes published successfully!');
      sileo.info({
        title: 'Changes published',
        description: `Portfolio content published to Firestore at ${new Date().toLocaleTimeString()}.`,
        duration: 2200
      });
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Error saving changes.');
      const message = error instanceof Error ? error.message : 'Unknown publish error';
      sileo.warning({
        title: 'Publish failed',
        description: `Unable to save changes right now. ${message}`
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenUserGuide = () => {
    setActiveModal('userGuide');
  };

  const handlePrioritySupport = () => {
    setSupportCategory('bug');
    setSupportConsent(false);
    setActiveModal('prioritySupport');
  };

  const handleSubmitPrioritySupport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supportMessage.trim().length < 30) {
      sileo.warning({
        title: 'More detail required',
        description: 'Please provide at least 30 characters so support can triage accurately.'
      });
      return;
    }
    if (!supportConsent) {
      sileo.warning({
        title: 'Consent required',
        description: 'Please confirm consent for support processing before submission.'
      });
      return;
    }
    setSupportSubmitting(true);
    try {
      await addDoc(collection(db, 'support_requests'), {
        brand: BRAND_NAME,
        legalEntity: LEGAL_ENTITY,
        subject: supportSubject.trim(),
        category: supportCategory,
        message: supportMessage.trim(),
        priority: supportPriority,
        source: 'dashboard',
        status: 'open',
        consent: true,
        userId: user?.uid || null,
        userEmail: user?.email || null,
        appPath: '/dashboard',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        policyVersion: POLICY_VERSION,
        createdAt: serverTimestamp()
      });
      sileo.info({
        title: 'Support request sent',
        description: 'Your priority support request has been submitted.'
      });
      setSupportMessage('');
      setSupportSubject('Dashboard Priority Support');
      setSupportCategory('bug');
      setSupportPriority('high');
      setSupportConsent(false);
      setActiveModal(null);
    } catch (error) {
      sileo.warning({
        title: 'Submit failed',
        description: 'Unable to send your support request. Please try again.'
      });
    } finally {
      setSupportSubmitting(false);
    }
  };

  const handleHeroChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => prev ? {
      ...prev,
      hero: { ...prev.hero, [name]: value }
    } : null);
  };

  const handleExperienceChange = (id: string, field: string, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        experience: prev.experience.map(exp => 
          exp.id === id ? { ...exp, [field]: value } : exp
        )
      };
    });
  };

  const handleAddExperience = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        experience: [
          ...prev.experience,
          { id: Date.now().toString(), title: 'New Role', company: 'Company', period: 'Year', description: 'Description' }
        ]
      };
    });
  };

  const handleRemoveExperience = (id: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        experience: prev.experience.filter(exp => exp.id !== id)
      };
    });
  };

  const handleEducationChange = (id: string, field: string, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        education: prev.education.map(entry =>
          entry.id === id ? { ...entry, [field]: value } : entry
        )
      };
    });
  };

  const handleAddEducation = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        education: [
          ...prev.education,
          { id: Date.now().toString(), program: 'New Program', school: 'School Name', period: 'Year', details: 'Details' }
        ]
      };
    });
  };

  const handleRemoveEducation = (id: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        education: prev.education.filter(entry => entry.id !== id)
      };
    });
  };

  const handleTrainingChange = (id: string, field: string, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        trainings: prev.trainings.map(entry =>
          entry.id === id ? { ...entry, [field]: value } : entry
        )
      };
    });
  };

  const handleAddTraining = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        trainings: [
          ...prev.trainings,
          { id: Date.now().toString(), title: 'New Training', provider: 'Provider', date: 'Year', details: 'Details' }
        ]
      };
    });
  };

  const handleRemoveTraining = (id: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        trainings: prev.trainings.filter(entry => entry.id !== id)
      };
    });
  };

  const handleContactChange = (field: string, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        contact: { ...prev.contact, [field]: value }
      };
    });
  };

  const handleAddSkill = () => {
    if (newSkill.trim()) {
      setFormData(prev => prev ? { ...prev, skills: [...prev.skills, newSkill.trim()] } : null);
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setFormData(prev => prev ? { ...prev, skills: prev.skills.filter(s => s !== skillToRemove) } : null);
  };

  
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const statsRef = doc(db, 'analytics', 'portfolio_stats');
        const snap = await getDoc(statsRef);
        if (snap.exists()) {
          setStats(snap.data() as any);
        }
        const dailyQuery = query(collection(db, 'analytics_daily'), orderBy('date', 'desc'), limit(90));
        const dailySnap = await getDocs(dailyQuery);
        const mapped = dailySnap.docs.map((entry) => {
          const day = entry.data() as any;
          return {
            date: day.date || entry.id,
            views: day.views || 0,
            downloads: day.downloads || 0,
            bottomScrolls: day.bottomScrolls || 0,
            interactions: day.interactions || {},
            referrers: day.referrers || { direct: 0, linkedin: 0, facebook: 0, other: 0 }
          };
        }).reverse();
        setDailyStats(mapped);
      } catch(err) {}
    };
    if (activeTab === 'analytics') {
      fetchStats();
    }
  }, [activeTab]);

  const handleBrandingChange = (field: string, value: string) => {
    setFormData(prev => prev ? {
      ...prev,
      ui: { ...prev.ui, [field]: value }
    } : null);
  };

  const handleSectionTitleChange = (section: string, value: string) => {
    setFormData(prev => prev ? {
      ...prev,
      ui: {
        ...prev.ui,
        sectionTitles: { ...prev.ui.sectionTitles, [section]: value },
        navLinks: prev.ui.navLinks.map((link) =>
          link.id === section ? { ...link, label: value } : link
        ),
      }
    } : null);
  };

  const handleSectionVisibilityChange = (section: PortfolioSectionKey, isEnabled: boolean) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        ui: {
          ...prev.ui,
          sectionVisibility: {
            ...DEFAULT_SECTION_VISIBILITY,
            ...prev.ui.sectionVisibility,
            [section]: isEnabled,
          },
        },
      };
    });
  };

  const handleAddCertification = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        certifications: [
          ...prev.certifications,
          {
            id: Date.now().toString(),
            title: 'New Certification',
            issuer: 'New Issuer',
            details: '',
            iconName: 'workspace_premium',
            imageUrl: '',
            imageUrls: []
          }
        ]
      };
    });
  };

  const handleCertificationChange = (id: string, field: string, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        certifications: prev.certifications.map(cert => cert.id === id ? { ...cert, [field]: value } : cert)
      };
    });
  };

  const handleRemoveCertification = (id: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        certifications: prev.certifications.filter(cert => cert.id !== id)
      };
    });
  };
  
  
  const handleAddProject = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        projects: [
          ...prev.projects,
          { id: Date.now().toString(), title: 'New Project', description: 'Description', link: '', imageUrl: '', imageUrls: [], tags: [], itemCount: '', ctaLabel: 'View Project' }
        ]
      };
    });
  };

  const handleRemoveProject = (id: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        projects: prev.projects.filter(p => p.id !== id)
      };
    });
  };

  const handleProjectChange = (id: string, field: string, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        projects: prev.projects.map(p => p.id === id ? { ...p, [field]: value } : p)
      };
    });
  };

  const handleAddExpertiseCard = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        expertiseCards: [
          ...prev.expertiseCards,
          { id: Date.now().toString(), title: 'New Area', description: 'Description', icon: 'lightbulb' }
        ]
      };
    });
  };

  const handleRemoveExpertiseCard = (id: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        expertiseCards: prev.expertiseCards.filter(c => c.id !== id)
      };
    });
  };

  const handleExpertiseCardChange = (id: string, field: string, value: string) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        expertiseCards: prev.expertiseCards.map(c => c.id === id ? { ...c, [field]: value } : c)
      };
    });
  };

  const updateBioParagraph = (index: number, text: string) => {
      setFormData(prev => {
          if (!prev) return null;
          const paras = [...prev.about.paragraphs];
          paras[index] = text;
          return { ...prev, about: { ...prev.about, paragraphs: paras }};
      })
  }

  const addBioParagraph = () => {
      setFormData(prev => {
          if (!prev) return null;
          return { ...prev, about: { ...prev.about, paragraphs: [...prev.about.paragraphs, 'New paragraph...'] }};
      })
  }

  const removeBioParagraph = (index: number) => {
      setFormData(prev => {
          if (!prev) return null;
          return { ...prev, about: { ...prev.about, paragraphs: prev.about.paragraphs.filter((_, i) => i !== index) }};
      })
  }

  const updateIntroVideoHighlight = (index: number, text: string) => {
    setFormData(prev => {
      if (!prev) return null;
      const highlights = [...(prev.about.introVideoHighlights || [])];
      highlights[index] = text;
      return { ...prev, about: { ...prev.about, introVideoHighlights: highlights } };
    });
  };

  const addIntroVideoHighlight = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        about: {
          ...prev.about,
          introVideoHighlights: [...(prev.about.introVideoHighlights || []), 'New highlight'],
        },
      };
    });
  };

  const removeIntroVideoHighlight = (index: number) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        about: {
          ...prev.about,
          introVideoHighlights: (prev.about.introVideoHighlights || []).filter((_, i) => i !== index),
        },
      };
    });
  };

  const updateTrustBadge = (index: number, text: string) => {
    setFormData(prev => {
      if (!prev) return null;
      const badges = normalizeTrustBadges(prev.about.trustBadges);
      badges[index] = { ...(badges[index] || { icon: 'verified' }), label: text };
      return { ...prev, about: { ...prev.about, trustBadges: badges } };
    });
  };

  const updateTrustBadgeIcon = (index: number, icon: string) => {
    setFormData(prev => {
      if (!prev) return null;
      const badges = normalizeTrustBadges(prev.about.trustBadges);
      badges[index] = { ...(badges[index] || { label: '' }), icon };
      return { ...prev, about: { ...prev.about, trustBadges: badges } };
    });
  };

  const addTrustBadge = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        about: {
          ...prev.about,
            trustBadges: [...normalizeTrustBadges(prev.about.trustBadges), { label: 'New trust badge', icon: 'verified' }],
        },
      };
    });
  };

  const removeTrustBadge = (index: number) => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        about: {
          ...prev.about,
            trustBadges: normalizeTrustBadges(prev.about.trustBadges).filter((_, i) => i !== index),
        },
      };
    });
  };

  const handleIntroVideoFileSelect = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      sileo.warning({
        title: 'Invalid file type',
        description: 'Please upload a video file (MP4, MOV, WEBM, or OGG).'
      });
      return;
    }

    const maxBytes = MAX_INTRO_VIDEO_SIZE_MB * 1024 * 1024;
    if (file.size > maxBytes) {
      sileo.warning({
        title: 'Video is too large',
        description: `Please upload a file smaller than ${MAX_INTRO_VIDEO_SIZE_MB}MB.`
      });
      return;
    }

    await handleFileUpload(
      file,
      'videos',
      (url) => {
        setFormData(prev => prev ? {
          ...prev,
          about: {
            ...prev.about,
            introVideoUrl: url,
            introVideoSourceMode: 'upload',
          },
        } : null);
        sileo.info({
          title: 'Introduction video uploaded',
          description: 'The About section now uses this uploaded video.'
        });
      },
      'introVideoFile'
    );
  };

  if (authLoading || dataLoading) {
    return <UnifiedLoadingScreen title="Loading dashboard" subtitle="Syncing your admin workspace..." />;
  }

  if (!formData && !showMissingDocState) {
    return <UnifiedLoadingScreen title="Loading dashboard" subtitle="Syncing portfolio document..." />;
  }

  if (!formData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent px-6 text-center">
        <div>
          <h1 className="font-headline text-2xl font-bold text-primary mb-3">Portfolio document not found</h1>
          <p className="text-sm text-secondary">
            {readError || 'Create the Firestore document at portfolio/main before editing in the dashboard.'}
          </p>
        </div>
      </div>
    );
  }

  const selectedDailyStats = dailyStats.slice(-analyticsRange);
  const sectionVisibility = {
    ...DEFAULT_SECTION_VISIBILITY,
    ...(formData.ui.sectionVisibility || {}),
  };
  const adminSectionNames = {
    home: formData.ui.sectionTitles.home || 'Home',
    about: formData.ui.sectionTitles.about || 'About',
    experience: formData.ui.sectionTitles.experience || 'Experience',
    skills: formData.ui.sectionTitles.skills || 'Skills',
    education: formData.ui.sectionTitles.education || 'Education',
    trainings: formData.ui.sectionTitles.trainings || 'Trainings',
    projects: formData.ui.sectionTitles.projects || 'Projects',
    contact: formData.ui.sectionTitles.contact || 'Contact',
    certifications: formData.ui.certificationsTitle || 'Certifications',
  };
  const introVideoHighlights = formData.about.introVideoHighlights || [];
  const trustBadges = normalizeTrustBadges(formData.about.trustBadges);
  const introVideoSourceMode = formData.about.introVideoSourceMode === 'upload' ? 'upload' : 'link';
  const introVideoAllowDownload = formData.about.introVideoAllowDownload !== false;
  const reviewAlerts = getAdminReviewAlerts(formData).filter((alert) => (
    !dismissedReviewAlerts.includes(alert.id) && !suppressedReviewAlerts.includes(alert.id)
  ));
  const rangeViews = selectedDailyStats.reduce((sum, day) => sum + (day.views || 0), 0);
  const rangeDownloads = selectedDailyStats.reduce((sum, day) => sum + (day.downloads || 0), 0);
  const rangeBottomScrolls = selectedDailyStats.reduce((sum, day) => sum + (day.bottomScrolls || 0), 0);
  const rangeInteractions = selectedDailyStats.reduce(
    (acc, day: any) => {
      Object.entries(day?.interactions || {}).forEach(([key, value]) => {
        acc[key] = (acc[key] || 0) + Number(value || 0);
      });
      return acc;
    },
    {} as Record<string, number>
  );
  const rangeReferrers = selectedDailyStats.reduce(
    (acc, day: any) => {
      acc.direct += day?.referrers?.direct || 0;
      acc.linkedin += day?.referrers?.linkedin || 0;
      acc.facebook += day?.referrers?.facebook || 0;
      acc.other += day?.referrers?.other || 0;
      return acc;
    },
    { direct: 0, linkedin: 0, facebook: 0, other: 0 }
  );

  return (
    <div className="min-h-screen relative">
      {/* Sidebar Navigation */}
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className={`fixed inset-y-0 left-0 z-40 w-[280px] max-w-[85vw] bg-surface-container border-r border-outline-variant/10 flex flex-col p-8 overflow-y-auto transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="mb-12 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-headline font-black text-2xl text-primary tracking-tighter">KDL Works.</h1>
            <p className="font-body text-[10px] uppercase tracking-[0.2em] text-secondary mt-1">Admin Control Suite</p>
          </div>
          <button
            type="button"
            onClick={() => setIsSidebarOpen(false)}
            className="text-secondary hover:text-primary"
            aria-label="Hide dashboard navigation"
            title="Hide navigation"
          >
            <span className="material-symbols-outlined">left_panel_close</span>
          </button>
        </div>
        <nav className="flex-1 flex flex-col gap-2">
          <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('editor'); }} className={`flex items-center gap-4 p-3 rounded-lg transition-all duration-300 ${activeTab === 'editor' ? 'bg-primary text-on-primary' : 'text-secondary hover:bg-surface-container-high'}`}>
            <span className="material-symbols-outlined" data-icon="edit_note">edit_note</span>
            <span className="font-body font-semibold text-sm">Content Editor</span>
          </a>
          <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('analytics'); }} className={`flex items-center gap-4 p-3 rounded-lg transition-all duration-300 ${activeTab === 'analytics' ? 'bg-primary text-on-primary' : 'text-secondary hover:bg-surface-container-high'}`}>
            <span className="material-symbols-outlined" data-icon="analytics">analytics</span>
            <span className="font-body font-medium text-sm">Analytics</span>
          </a>
          <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('pwa'); }} className={`flex items-center gap-4 p-3 rounded-lg transition-all duration-300 ${activeTab === 'pwa' ? 'bg-primary text-on-primary' : 'text-secondary hover:bg-surface-container-high'}`}>
            <span className="material-symbols-outlined" data-icon="install_mobile">install_mobile</span>
            <span className="font-body font-medium text-sm">PWA</span>
          </a>
          
        </nav>
        <div className="mt-auto pt-8 border-t border-outline-variant/20">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary-container overflow-hidden border border-outline-variant/30 flex items-center justify-center">
                {formData.hero.imageUrl ? (
                  <img
                    src={formData.hero.imageUrl}
                    alt="Admin profile"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="font-headline font-bold text-on-secondary-container">{user?.email?.charAt(0).toUpperCase() || 'A'}</span>
                )}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-primary truncate">{user?.email}</p>
                <p className="text-[10px] text-secondary">Administrator</p>
              </div>
            </div>
            <button onClick={handleSignOut} className="flex items-center gap-2 text-secondary hover:text-primary transition-colors text-xs font-bold uppercase tracking-widest px-1">
              <span className="sr-only">Sign out</span>
              <span className="material-symbols-outlined text-sm" data-icon="logout">logout</span>
              Logout
            </button>
          </div>
        </div>
      </motion.aside>

      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container-highest text-primary shadow-lg border border-outline-variant/30"
            aria-label="Show dashboard navigation"
            title="Show navigation"
          >
            <span className="material-symbols-outlined">left_panel_open</span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reviewAlerts.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="fixed right-6 bottom-6 z-[60] w-[min(24rem,calc(100vw-3rem))] max-h-[min(34rem,calc(100vh-3rem))] overflow-y-auto rounded-xl border border-secondary/40 bg-surface-container-lowest p-4 shadow-2xl"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="font-body text-[10px] uppercase tracking-[0.18em] text-secondary">Review before publishing</p>
                <h2 className="font-headline text-lg font-bold text-primary">{reviewAlerts.length} item{reviewAlerts.length === 1 ? '' : 's'} to check</h2>
              </div>
              <span className="material-symbols-outlined text-secondary" aria-hidden="true">fact_check</span>
            </div>
            <div className="space-y-2">
              {reviewAlerts.map((alert) => (
                <div key={alert.id} className="flex items-start gap-3 rounded-lg bg-surface-container-high p-3">
                  <span className="material-symbols-outlined text-secondary text-lg mt-0.5" aria-hidden="true">warning</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-primary">{alert.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-on-surface-variant">{alert.description}</p>
                    <button
                      type="button"
                      onClick={() => handleSuppressReviewAlert(alert.id)}
                      className="mt-2 text-[10px] font-bold uppercase tracking-wider text-secondary underline decoration-secondary/50 underline-offset-2 hover:text-primary"
                    >
                      Don&apos;t show again
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDismissedReviewAlerts((current) => [...current, alert.id])}
                    className="text-secondary hover:text-primary"
                    aria-label={`Dismiss ${alert.title}`}
                    title="Dismiss reminder"
                  >
                    <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Main Workspace */}
      <motion.main
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className={`${isSidebarOpen ? 'lg:ml-[280px]' : 'ml-0'} p-6 md:p-12 overflow-x-hidden w-auto min-w-0 transition-[margin] duration-300`}
      >
        {/* Header Section */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: 'easeOut' }}
          className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-16"
        >
          <div>
            <h2 className="font-headline text-4xl md:text-5xl font-black text-primary -ml-1 tracking-tight">{activeTab === 'editor' ? 'Content Editor' : activeTab === 'analytics' ? 'Analytics' : 'PWA'}</h2>
            <p className="font-body text-secondary mt-2 max-w-md">
              {activeTab === 'editor'
                ? "Update your digital atelier's presence. Every change reflects your professional standard."
                : activeTab === 'analytics'
                  ? "Live behavioral analytics from your public portfolio traffic and interactions."
                  : "Install a private shortcut to check your portfolio from your phone."}
            </p>
          </div>
          {activeTab === 'editor' && (
            <div className="flex flex-col items-end gap-2 w-full md:w-auto">
              {saveMessage && (
                  <span className={`text-sm font-medium ${saveMessage.includes('Error') ? 'text-error' : 'text-emerald-600'}`}>
                    {saveMessage}
                  </span>
              )}
              <div className="flex gap-4">
                  <Link to="/?adminPreview=1" className="flex-1 md:flex-none px-6 py-2 rounded-lg bg-surface-container-highest text-primary font-bold text-sm hover:bg-secondary transition-all duration-300 hover:text-on-primary flex items-center justify-center">
                  Preview Site
                  </Link>
                  <button disabled={isSaving} onClick={handleSave} title="Publish your latest content changes" className="flex-1 md:flex-none px-6 py-2 rounded-lg bg-primary text-on-primary font-bold text-sm shadow-xl shadow-primary/10 active:scale-95 transition-all flex items-center justify-center gap-2">
                  {isSaving ? 'Saving...' : 'Publish Changes'}
                  </button>
              </div>
            </div>
          )}
        </motion.header>

        <div className="grid grid-cols-12 gap-8">

          {activeTab === 'analytics' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="col-span-12 flex flex-col gap-6 w-full"
            >
                <div className="flex justify-end">
                  <div className="inline-flex rounded-lg bg-surface-container-high p-1 border border-outline-variant/20">
                    {[7, 30, 90].map((range) => (
                      <button
                        key={range}
                        onClick={() => setAnalyticsRange(range as 7 | 30 | 90)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${analyticsRange === range ? 'bg-primary text-on-primary' : 'text-secondary hover:bg-surface-container-highest'}`}
                      >
                        {range}d
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="bg-surface-container p-6 rounded-lg relative overflow-hidden group border border-outline-variant/10 shadow-sm">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="material-symbols-outlined text-4xl">group</span>
                        </div>
                        <p className="text-secondary text-xs font-medium tracking-widest uppercase mb-2">Visits ({analyticsRange}d)</p>
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-3xl font-headline font-bold text-on-surface">{rangeViews}</h3>
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-1 italic">Selected date range</p>
                    </div>
                    <div className="bg-surface-container p-6 rounded-lg relative overflow-hidden group border border-outline-variant/10 shadow-sm">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="material-symbols-outlined text-4xl">arrow_downward</span>
                        </div>
                        <p className="text-secondary text-xs font-medium tracking-widest uppercase mb-2">Unique Visitors</p>
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-3xl font-headline font-bold text-on-surface">{stats?.uniqueVisitors || 0}</h3>
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-1 italic">Lifetime estimated unique browsers</p>
                    </div>
                    <div className="bg-surface-container p-6 rounded-lg relative overflow-hidden group border border-outline-variant/10 shadow-sm">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="material-symbols-outlined text-4xl">download_for_offline</span>
                        </div>
                        <p className="text-secondary text-xs font-medium tracking-widest uppercase mb-2">Downloads ({analyticsRange}d)</p>
                        <div className="flex items-baseline gap-2">
                          <h3 className="text-3xl font-headline font-bold text-on-surface">{rangeDownloads}</h3>
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-1 italic">Selected date range</p>
                    </div>
                    <div className="bg-surface-container p-6 rounded-lg relative overflow-hidden group border border-outline-variant/10 shadow-sm">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span className="material-symbols-outlined text-4xl">trending_up</span>
                        </div>
                      <p className="text-secondary text-xs font-medium tracking-widest uppercase mb-2">Scroll Depth ({analyticsRange}d)</p>
                        <div className="flex items-baseline gap-2">
                        <h3 className="text-3xl font-headline font-bold text-on-surface">{rangeViews ? Math.round((rangeBottomScrolls / rangeViews) * 100) : 0}%</h3>
                        </div>
                      <p className="text-[10px] text-secondary mt-1 italic">Reached page bottom</p>
                    </div>
                </div>
                <div className="bg-surface-container p-6 md:p-8 rounded-lg border border-outline-variant/10 shadow-sm">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div>
                      <h2 className="font-headline text-2xl font-bold text-on-surface mb-1">Interaction Clicks</h2>
                      <p className="text-xs text-on-surface-variant uppercase tracking-widest">Selected date range</p>
                    </div>
                    <span className="material-symbols-outlined text-secondary text-3xl">ads_click</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { key: 'introVideo', label: 'Introduction video', icon: 'play_circle' },
                      { key: 'portfolioPdf', label: 'Portfolio PDF', icon: 'picture_as_pdf' },
                      { key: 'contact', label: 'Contact', icon: 'mail' },
                      { key: 'contactSubmit', label: 'Contact submissions', icon: 'send' },
                    ].map((item) => (
                      <div key={item.key} className="bg-surface-container-highest rounded-lg p-4 flex items-center gap-3">
                        <span className="material-symbols-outlined text-secondary">{item.icon}</span>
                        <div>
                          <p className="text-xs text-secondary uppercase tracking-wider">{item.label}</p>
                          <p className="font-headline text-2xl font-bold text-primary">{rangeInteractions[item.key] || 0}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 bg-surface-container p-10 rounded-lg flex flex-col h-[450px] border border-outline-variant/10 shadow-sm">
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h2 className="font-noto-serif text-2xl font-bold text-on-surface mb-1">Visitor Trends</h2>
                                <p className="text-xs text-on-surface-variant uppercase tracking-widest">{analyticsRange}-Day Atmospheric Traffic</p>
                            </div>
                        </div>
                        <div className="flex-1 relative mt-4">
                            <div className="absolute inset-0 flex flex-col justify-between">
                                <div className="w-full h-px bg-outline-variant/10"></div>
                                <div className="w-full h-px bg-outline-variant/10"></div>
                                <div className="w-full h-px bg-outline-variant/10"></div>
                                <div className="w-full h-px bg-outline-variant/10"></div>
                                <div className="w-full h-px bg-outline-variant/10"></div>
                            </div>
                            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                                {(() => {
                                  const points = selectedDailyStats.length ? selectedDailyStats : [{ date: 'N/A', views: 0, downloads: 0, bottomScrolls: 0 }];
                                  const maxViews = Math.max(...points.map((p) => p.views || 0), 1);
                                  const maxDownloads = Math.max(...points.map((p) => p.downloads || 0), 1);
                                  const width = 700;
                                  const height = 220;
                                  const step = points.length > 1 ? width / (points.length - 1) : width;
                                  const viewsPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(i * step)} ${Math.round(height - ((p.views || 0) / maxViews) * height)}`).join(' ');
                                  const downloadsPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(i * step)} ${Math.round(height - ((p.downloads || 0) / maxDownloads) * height)}`).join(' ');
                                  return (
                                    <>
                                      <path d={viewsPath} fill="none" stroke="currentColor" className="text-primary opacity-85" strokeLinecap="round" strokeWidth="2"></path>
                                      <path d={downloadsPath} fill="none" stroke="currentColor" className="text-secondary opacity-80" strokeDasharray="5 4" strokeLinecap="round" strokeWidth="2"></path>
                                    </>
                                  );
                                })()}
                            </svg>
                        </div>
                        <div className="flex justify-between mt-4 text-[10px] text-on-surface-variant uppercase tracking-tighter">
                            {dailyStats.length > 0 ? (
                              <>
                                <span>{selectedDailyStats[0]?.date?.slice(5) || 'N/A'}</span>
                                <span>{selectedDailyStats[Math.max(0, Math.floor((selectedDailyStats.length - 1) * 0.25))]?.date?.slice(5) || 'N/A'}</span>
                                <span>{selectedDailyStats[Math.max(0, Math.floor((selectedDailyStats.length - 1) * 0.5))]?.date?.slice(5) || 'N/A'}</span>
                                <span>{selectedDailyStats[Math.max(0, Math.floor((selectedDailyStats.length - 1) * 0.75))]?.date?.slice(5) || 'N/A'}</span>
                                <span>{selectedDailyStats[selectedDailyStats.length - 2]?.date?.slice(5) || 'N/A'}</span>
                                <span>{selectedDailyStats[selectedDailyStats.length - 1]?.date?.slice(5) || 'Today'}</span>
                              </>
                            ) : (
                              <><span>N/A</span><span>N/A</span><span>N/A</span><span>N/A</span><span>N/A</span><span>Today</span></>
                            )}
                        </div>
                    </div>
                    
                    <div className="bg-surface-container p-10 rounded-lg flex flex-col border border-outline-variant/10 shadow-sm">
                        <h2 className="font-noto-serif text-2xl font-bold text-on-surface mb-1">Top Referrers</h2>
                        <p className="text-xs text-on-surface-variant uppercase tracking-widest mb-8">Traffic Acquisition</p>
                        <div className="space-y-8 flex-1">
                            {(() => {
                              const referrers = rangeReferrers;
                              const entries: Array<{ label: string; key: string; value: number }> = [
                                { label: 'LinkedIn', key: 'linkedin', value: referrers.linkedin || 0 },
                                { label: 'Direct Access', key: 'direct', value: referrers.direct || 0 },
                                { label: 'Facebook', key: 'facebook', value: referrers.facebook || 0 },
                                { label: 'Others', key: 'other', value: referrers.other || 0 }
                              ];
                              const total = entries.reduce((sum, item) => sum + item.value, 0);
                              return entries.map((item) => {
                                const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
                                return (
                                  <div className="space-y-2" key={item.key}>
                                    <div className="flex justify-between items-end">
                                      <span className="text-sm font-medium">{item.label}</span>
                                      <span className="text-xs text-on-surface-variant">{pct}%</span>
                                    </div>
                                    <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                                      <div className="h-full bg-primary" style={{ width: `${pct}%` }}></div>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                        </div>
                    </div>
                </div>
            </motion.div>
          )}

          {activeTab === 'pwa' && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="col-span-12 space-y-6"
            >
              <section className="bg-primary text-on-primary rounded-xl p-6 md:p-10 relative overflow-hidden">
                <div className="relative z-10 max-w-2xl">
                  <p className="text-xs uppercase tracking-[0.2em] text-on-primary/70 mb-3">Progressive Web App</p>
                  <h2 className="font-headline text-3xl md:text-4xl font-bold mb-4">Your portfolio, one tap away.</h2>
                  <p className="text-on-primary/80 leading-relaxed max-w-xl">
                    Install the dashboard as an app on your phone so you can quickly review content, check analytics, and catch publishing issues without searching for the website each time.
                  </p>
                  <button
                    type="button"
                    onClick={handleInstallPwa}
                    disabled={isPwaInstalled}
                    className="mt-6 inline-flex items-center gap-2 rounded-lg bg-on-primary px-5 py-3 text-sm font-bold text-primary transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-60"
                  >
                    <span className="material-symbols-outlined text-lg">{isPwaInstalled ? 'check_circle' : 'install_mobile'}</span>
                    {isPwaInstalled ? 'Installed on this device' : 'Install dashboard app'}
                  </button>
                </div>
                <span className="material-symbols-outlined absolute -right-4 -bottom-8 !text-[180px] text-on-primary/10">install_mobile</span>
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <section className="lg:col-span-2 bg-surface-container p-6 md:p-8 rounded-xl border border-outline-variant/10">
                  <h3 className="font-headline text-2xl font-bold text-primary mb-2">How it works</h3>
                  <p className="text-sm text-on-surface-variant leading-relaxed mb-6">The installed shortcut opens this dashboard in its own app window. Your portfolio data and analytics still use the same secure account and live Firestore connection.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      ['1', 'Open the site', 'Sign in to the dashboard in your phone browser.'],
                      ['2', 'Install it', 'Use the install button or your browser’s Add to Home Screen action.'],
                      ['3', 'Review quickly', 'Open the new icon to check content, analytics, and reminders.'],
                    ].map(([step, title, description]) => (
                      <div key={step} className="bg-surface-container-highest rounded-lg p-4">
                        <span className="font-headline text-2xl font-bold text-secondary">{step}</span>
                        <h4 className="font-bold text-primary mt-2 mb-1">{title}</h4>
                        <p className="text-xs text-on-surface-variant leading-relaxed">{description}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="bg-surface-container-lowest p-6 md:p-8 rounded-xl border border-outline-variant/10">
                  <h3 className="font-headline text-2xl font-bold text-primary mb-5">Install on your phone</h3>
                  <div className="space-y-5 text-sm">
                    <div>
                      <h4 className="font-bold text-primary flex items-center gap-2"><span className="material-symbols-outlined text-secondary">phone_iphone</span>iPhone</h4>
                      <p className="text-on-surface-variant leading-relaxed mt-2">Open the site in Safari, tap Share, choose Add to Home Screen, then tap Add.</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-primary flex items-center gap-2"><span className="material-symbols-outlined text-secondary">phone_android</span>Android</h4>
                      <p className="text-on-surface-variant leading-relaxed mt-2">Open the site in Chrome, tap the menu, choose Install app or Add to Home screen, then confirm.</p>
                    </div>
                    <div>
                      <h4 className="font-bold text-primary flex items-center gap-2"><span className="material-symbols-outlined text-secondary">laptop_mac</span>Desktop</h4>
                      <p className="text-on-surface-variant leading-relaxed mt-2">Use the install icon in the browser address bar, or open the browser menu and choose Install.</p>
                    </div>
                  </div>
                </section>
              </div>

              <section className="bg-surface-container-highest rounded-xl border border-outline-variant/20 p-5 flex items-start gap-3">
                <span className="material-symbols-outlined text-secondary mt-0.5">security</span>
                <p className="text-sm text-on-surface-variant leading-relaxed">The PWA is a shortcut and app-like window, not a second account. Keep your normal sign-in protection enabled and sign out on shared devices.</p>
              </section>
            </motion.div>
          )}

          {activeTab === 'editor' && (
            <>

          {/* Left Column: Editorial Sections */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            
            {/* 1. Branding & Navigation */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden" open>
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="branding_watermark">branding_watermark</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">Branding &amp; Navigation</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Edit the brand labels and logos used in the top navigation and footer.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Navigation Title</label>
                    <input value={formData.ui.navTitle} onChange={(e) => handleBrandingChange('navTitle', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary focus:ring-2 focus:ring-secondary/20" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Navigation Logo</label>
                    <div onClick={() => fileInputRefs.current['navLogo']?.click()} className={uploadDropzoneClass}>
                      {formData.ui.navLogoUrl ? (
                         <img src={formData.ui.navLogoUrl} className="h-6 w-auto object-contain" alt="Nav Logo"/>
                      ) : (
                         <img src="/favicon.svg" className="h-6 w-6 rounded-md object-cover border border-outline-variant/20" alt="Default Nav Logo" />
                      )}
                      <span className="text-xs text-secondary">
                        {uploadProgress['navLogo'] !== undefined
                          ? `Uploading... ${Math.round(uploadProgress['navLogo'])}%`
                          : (formData.ui.navLogoUrl ? 'Change Logo' : 'Upload Logo (.svg, .png)')}
                      </span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" ref={(el) => { fileInputRefs.current['navLogo'] = el; }} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'logos', (url) => handleBrandingChange('navLogoUrl', url), 'navLogo');
                      e.currentTarget.value = '';
                    }} />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Footer Title</label>
                    <input value={formData.ui.footerTitle} onChange={(e) => handleBrandingChange('footerTitle', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary focus:ring-2 focus:ring-secondary/20" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Footer Logo</label>
                    <div onClick={() => fileInputRefs.current['footerLogo']?.click()} className={uploadDropzoneClass}>
                      {formData.ui.footerLogoUrl ? (
                        <img src={formData.ui.footerLogoUrl} className="h-6 w-auto object-contain" alt="Footer Logo" />
                      ) : (
                        <img src="/favicon.svg" className="h-6 w-6 rounded-md object-cover border border-outline-variant/20" alt="Default Footer Logo" />
                      )}
                      <span className="text-xs text-secondary">
                        {uploadProgress['footerLogo'] !== undefined
                          ? `Uploading... ${Math.round(uploadProgress['footerLogo'])}%`
                          : (formData.ui.footerLogoUrl ? 'Change Logo' : 'Upload Logo (.svg, .png)')}
                      </span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" ref={(el) => { fileInputRefs.current['footerLogo'] = el; }} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'logos', (url) => handleBrandingChange('footerLogoUrl', url), 'footerLogo');
                      e.currentTarget.value = '';
                    }} />
                  </div>
                </div>
              </div>
            </details>

            {/* 2. Section Headings */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="label">label</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">Section Headings</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Set section titles and use each slider to show or hide that section on the public site.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">{adminSectionNames.about} Heading</label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-[10px] font-body uppercase tracking-widest text-secondary">Show</span>
                        <input type="checkbox" checked={sectionVisibility.about} onChange={(e) => handleSectionVisibilityChange('about', e.target.checked)} className="sr-only peer" />
                        <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                    <input value={formData.ui.sectionTitles.about} onChange={(e) => handleSectionTitleChange('about', e.target.value)} className="w-full bg-transparent border-none rounded-lg px-0 py-1 text-2xl md:text-3xl leading-tight font-headline font-bold text-primary focus:ring-0" type="text" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">{adminSectionNames.experience} Heading</label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-[10px] font-body uppercase tracking-widest text-secondary">Show</span>
                        <input type="checkbox" checked={sectionVisibility.experience} onChange={(e) => handleSectionVisibilityChange('experience', e.target.checked)} className="sr-only peer" />
                        <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                    <input value={formData.ui.sectionTitles.experience} onChange={(e) => handleSectionTitleChange('experience', e.target.value)} className="w-full bg-transparent border-none rounded-lg px-0 py-1 text-2xl md:text-3xl leading-tight font-headline font-bold text-primary focus:ring-0" type="text" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">{adminSectionNames.skills} Heading</label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-[10px] font-body uppercase tracking-widest text-secondary">Show</span>
                        <input type="checkbox" checked={sectionVisibility.skills} onChange={(e) => handleSectionVisibilityChange('skills', e.target.checked)} className="sr-only peer" />
                        <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                    <input value={formData.ui.sectionTitles.skills} onChange={(e) => handleSectionTitleChange('skills', e.target.value)} className="w-full bg-transparent border-none rounded-lg px-0 py-1 text-2xl md:text-3xl leading-tight font-headline font-bold text-primary focus:ring-0" type="text" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">{adminSectionNames.education} Heading</label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-[10px] font-body uppercase tracking-widest text-secondary">Show</span>
                        <input type="checkbox" checked={sectionVisibility.education} onChange={(e) => handleSectionVisibilityChange('education', e.target.checked)} className="sr-only peer" />
                        <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                    <input value={formData.ui.sectionTitles.education} onChange={(e) => handleSectionTitleChange('education', e.target.value)} className="w-full bg-transparent border-none rounded-lg px-0 py-1 text-2xl md:text-3xl leading-tight font-headline font-bold text-primary focus:ring-0" type="text" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">{adminSectionNames.trainings} Heading</label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-[10px] font-body uppercase tracking-widest text-secondary">Show</span>
                        <input type="checkbox" checked={sectionVisibility.trainings} onChange={(e) => handleSectionVisibilityChange('trainings', e.target.checked)} className="sr-only peer" />
                        <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                    <input value={formData.ui.sectionTitles.trainings} onChange={(e) => handleSectionTitleChange('trainings', e.target.value)} className="w-full bg-transparent border-none rounded-lg px-0 py-1 text-2xl md:text-3xl leading-tight font-headline font-bold text-primary focus:ring-0" type="text" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">{adminSectionNames.projects} Heading</label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-[10px] font-body uppercase tracking-widest text-secondary">Show</span>
                        <input type="checkbox" checked={sectionVisibility.projects} onChange={(e) => handleSectionVisibilityChange('projects', e.target.checked)} className="sr-only peer" />
                        <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                    <input value={formData.ui.sectionTitles.projects} onChange={(e) => handleSectionTitleChange('projects', e.target.value)} className="w-full bg-transparent border-none rounded-lg px-0 py-1 text-2xl md:text-3xl leading-tight font-headline font-bold text-primary focus:ring-0" type="text" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">{adminSectionNames.contact} Heading</label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-[10px] font-body uppercase tracking-widest text-secondary">Show</span>
                        <input type="checkbox" checked={sectionVisibility.contact} onChange={(e) => handleSectionVisibilityChange('contact', e.target.checked)} className="sr-only peer" />
                        <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                    <input value={formData.ui.sectionTitles.contact} onChange={(e) => handleSectionTitleChange('contact', e.target.value)} className="w-full bg-transparent border-none rounded-lg px-0 py-1 text-2xl md:text-3xl leading-tight font-headline font-bold text-primary focus:ring-0" type="text" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">{adminSectionNames.certifications} Heading</label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <span className="text-[10px] font-body uppercase tracking-widest text-secondary">Show</span>
                        <input type="checkbox" checked={sectionVisibility.certifications} onChange={(e) => handleSectionVisibilityChange('certifications', e.target.checked)} className="sr-only peer" />
                        <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                      </label>
                    </div>
                    <input value={formData.ui.certificationsTitle} onChange={(e) => handleBrandingChange('certificationsTitle', e.target.value)} className="w-full bg-transparent border-none rounded-lg px-0 py-1 text-2xl md:text-3xl leading-tight font-headline font-bold text-primary focus:ring-0" type="text" />
                  </div>
                </div>
              </div>
            </details>

            {/* 3. Hero & Identity */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="auto_awesome">auto_awesome</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">Hero &amp; Identity</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Control the homepage headline, sub-headline, intro, profile visual, and downloadable portfolio PDF.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 space-y-6">
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">{adminSectionNames.home} Heading</label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <span className="text-[10px] font-body uppercase tracking-widest text-secondary">Show</span>
                      <input type="checkbox" checked={sectionVisibility.home} onChange={(e) => handleSectionVisibilityChange('home', e.target.checked)} className="sr-only peer" />
                      <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                    </label>
                  </div>
                  <input
                    name="headline"
                    value={formData.hero.headline}
                    onChange={handleHeroChange}
                    className="w-full bg-transparent border-none rounded-lg p-0 font-headline text-4xl md:text-5xl lg:text-6xl font-black text-primary leading-tight -tracking-wider focus:ring-0"
                    type="text"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Sub-headline</label>
                    <input
                      name="subheadline"
                      value={formData.hero.subheadline}
                      onChange={handleHeroChange}
                      className="w-full bg-transparent border-none rounded-lg px-0 py-1 font-body text-base md:text-lg font-semibold uppercase tracking-widest text-secondary leading-relaxed focus:ring-0"
                      type="text"
                    />
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mt-4 mb-2" htmlFor="subheadline-size">Sub-headline size</label>
                    <select
                      id="subheadline-size"
                      name="subheadlineSize"
                      value={formData.hero.subheadlineSize || 'medium'}
                      onChange={handleHeroChange}
                      className="w-full bg-surface-container-highest border border-outline-variant/60 rounded-lg px-3 py-2 text-sm font-body font-semibold text-primary focus:border-secondary focus:ring-2 focus:ring-secondary/30"
                      style={{ colorScheme: 'dark' }}
                    >
                      <option className="bg-surface-container-highest text-primary" value="small">Small</option>
                      <option className="bg-surface-container-highest text-primary" value="medium">Medium</option>
                      <option className="bg-surface-container-highest text-primary" value="large">Large</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Portfolio PDF</label>
                    <div
                      onClick={() => fileInputRefs.current['portfolioPdf']?.click()}
                      className={uploadDropzoneClass}
                    >
                      <span className="material-symbols-outlined text-secondary" data-icon="upload_file">upload_file</span>
                      <span className="text-xs text-secondary truncate">
                        {uploadProgress['portfolioPdf'] !== undefined
                          ? `Uploading PDF... ${Math.round(uploadProgress['portfolioPdf'])}%`
                          : (formData.portfolioPdfUrl ? 'Change Portfolio PDF (.pdf)' : 'Upload Portfolio PDF (.pdf)')}
                      </span>
                      <div className="ml-auto flex items-center gap-3">
                        {formData.portfolioPdfUrl && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              event.preventDefault();
                              setFormData(prev => prev ? { ...prev, portfolioPdfUrl: '' } : null);
                              sileo.info({
                                title: 'Portfolio PDF removed',
                                description: 'The linked PDF has been removed from this draft.'
                              });
                            }}
                            className={uploadDeleteActionClass}
                            type="button"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        ref={(el) => { fileInputRefs.current['portfolioPdf'] = el; }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            handleFileUpload(file, 'pdfs', (url) => {
                              setFormData(prev => prev ? { ...prev, portfolioPdfUrl: url } : null);
                            }, 'portfolioPdf');
                          }
                          e.currentTarget.value = '';
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Description</label>
                  <textarea
                    name="description"
                    value={formData.hero.description}
                    onChange={handleHeroChange}
                    className="w-full bg-transparent border-none rounded-lg p-0 font-body text-base leading-relaxed text-on-surface-variant focus:ring-0"
                    rows={3}
                  ></textarea>
                </div>
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Profile Visual</label>
                  <div
                    onClick={() => fileInputRefs.current['heroImage']?.click()}
                    className={uploadDropzoneClass}
                  >
                    {formData.hero.imageUrl ? (
                      <img src={formData.hero.imageUrl} className="h-9 w-9 rounded object-cover" alt="Profile Visual" />
                    ) : (
                      <span className="material-symbols-outlined text-secondary" data-icon="upload_file">upload_file</span>
                    )}
                    <span className="text-xs text-secondary truncate">
                      {uploadProgress['heroImage'] !== undefined
                        ? `Uploading... ${Math.round(uploadProgress['heroImage'])}%`
                        : (formData.hero.imageUrl ? 'Change Profile Image (.png, .jpg)' : 'Upload Profile Image (.png, .jpg)')}
                    </span>
                    {formData.hero.imageUrl && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          setFormData(prev => prev ? { ...prev, hero: { ...prev.hero, imageUrl: '' } } : null);
                        }}
                        className={uploadDeleteActionClass}
                      >
                        Delete
                      </button>
                    )}
                    <input type="file" accept="image/*" className="hidden" ref={(el) => { fileInputRefs.current['heroImage'] = el; }} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'images', (url) => setFormData(prev => prev ? {...prev, hero: {...prev.hero, imageUrl: url}} : null), 'heroImage');
                      e.currentTarget.value = '';
                    }} />
                  </div>
                  <p className="mt-2 text-[10px] text-secondary">Recommended: 1200x1500px high-contrast portrait.</p>
                </div>
              </div>
            </details>

            {/* 4. About & Philosophy */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="history_edu">history_edu</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">{adminSectionNames.about}</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Update your personal quote and biography paragraphs shown in the About section.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 space-y-6">
                <div className="mt-6">
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Philosophy Quote</label>
                  <textarea value={formData.about.quote} onChange={(e) => setFormData(prev => prev ? {...prev, about: {...prev.about, quote: e.target.value}} : null)} className="w-full bg-surface-container-low border-none rounded-lg p-4 font-headline italic text-primary focus:ring-2 focus:ring-secondary/20" rows={2}></textarea>
                </div>
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">About Me Picture</label>
                  <div
                    onClick={() => fileInputRefs.current['aboutImage']?.click()}
                    className={uploadDropzoneClass}
                  >
                    {formData.about.imageUrl ? (
                      <img src={formData.about.imageUrl} className="h-9 w-9 rounded object-cover" alt="About Me" />
                    ) : (
                      <span className="material-symbols-outlined text-secondary" data-icon="upload_file">upload_file</span>
                    )}
                    <span className="text-xs text-secondary truncate">
                      {uploadProgress['aboutImage'] !== undefined
                        ? `Uploading... ${Math.round(uploadProgress['aboutImage'])}%`
                        : (formData.about.imageUrl ? 'Change About Image (.png, .jpg)' : 'Upload About Image (.png, .jpg)')}
                    </span>
                    {formData.about.imageUrl && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          event.preventDefault();
                          setFormData(prev => prev ? { ...prev, about: { ...prev.about, imageUrl: '' } } : null);
                        }}
                        className={uploadDeleteActionClass}
                      >
                        Delete
                      </button>
                    )}
                    <input type="file" accept="image/*" className="hidden" ref={(el) => { fileInputRefs.current['aboutImage'] = el; }} onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'images', (url) => setFormData(prev => prev ? {...prev, about: {...prev.about, imageUrl: url}} : null), 'aboutImage');
                      e.currentTarget.value = '';
                    }} />
                  </div>
                  <p className="mt-2 text-[10px] text-secondary">Recommended: High-quality image that represents you or your work.</p>
                </div>
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Introduction Video Source</label>
                  <div className="inline-flex rounded-lg bg-surface-container-low p-1 border border-outline-variant/30">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => prev ? { ...prev, about: { ...prev.about, introVideoSourceMode: 'link' } } : null)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${introVideoSourceMode === 'link' ? 'bg-primary text-on-primary' : 'text-secondary hover:text-primary'}`}
                    >
                      Use Link
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => prev ? { ...prev, about: { ...prev.about, introVideoSourceMode: 'upload' } } : null)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${introVideoSourceMode === 'upload' ? 'bg-primary text-on-primary' : 'text-secondary hover:text-primary'}`}
                    >
                      Upload File
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-secondary">Choose Link for YouTube/Drive URLs, or Upload File to send a local video to Cloudinary.</p>
                </div>
                {introVideoSourceMode === 'link' ? (
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Introduction Video URL</label>
                    <div className="flex items-center gap-3">
                      <input
                        value={formData.about.introVideoUrl || ''}
                        onChange={(e) => setFormData(prev => prev ? { ...prev, about: { ...prev.about, introVideoUrl: e.target.value } } : null)}
                        className="flex-1 bg-surface-container-low border-none rounded-lg p-3 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20"
                        type="url"
                        placeholder="Paste YouTube, Google Drive, Vimeo, or direct .mp4 link"
                      />
                      {formData.about.introVideoUrl && (
                        <button
                          type="button"
                          onClick={() => setFormData(prev => prev ? { ...prev, about: { ...prev.about, introVideoUrl: '' } } : null)}
                          className={uploadDeleteActionClass}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-[10px] text-secondary">This controls the “Watch Introduction Video” button shown below your About image.</p>
                  </div>
                ) : (
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Upload Introduction Video</label>
                    <div
                      onClick={() => fileInputRefs.current['introVideoFile']?.click()}
                      className={uploadDropzoneClass}
                    >
                      <span className="material-symbols-outlined text-secondary" data-icon="smart_display">smart_display</span>
                      <span className="text-xs text-secondary truncate">
                        {uploadProgress['introVideoFile'] !== undefined
                          ? `Uploading video... ${Math.round(uploadProgress['introVideoFile'])}%`
                          : (formData.about.introVideoUrl ? 'Change Uploaded Video' : 'Upload Video File (.mp4, .mov, .webm, .ogg)')}
                      </span>
                      {formData.about.introVideoUrl && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            event.preventDefault();
                            setFormData(prev => prev ? { ...prev, about: { ...prev.about, introVideoUrl: '' } } : null);
                          }}
                          className={uploadDeleteActionClass}
                        >
                          Remove
                        </button>
                      )}
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/ogg,video/quicktime"
                        className="hidden"
                        ref={(el) => { fileInputRefs.current['introVideoFile'] = el; }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleIntroVideoFileSelect(file);
                          }
                          e.currentTarget.value = '';
                        }}
                      />
                    </div>
                    <p className="mt-2 text-[10px] text-secondary">Max file size: {MAX_INTRO_VIDEO_SIZE_MB}MB. If upload fails, an error message will be shown and no video URL will be changed.</p>
                  </div>
                )}
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Viewer Download Permission</label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={introVideoAllowDownload}
                      onChange={(e) => setFormData(prev => prev ? { ...prev, about: { ...prev.about, introVideoAllowDownload: e.target.checked } } : null)}
                      className="sr-only peer"
                    />
                    <span className="relative h-5 w-10 rounded-full bg-outline-variant/40 transition-colors peer-checked:bg-primary after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-transform after:content-[''] peer-checked:after:translate-x-5" />
                    <span className="text-xs text-on-surface-variant">
                      {introVideoAllowDownload ? 'Download enabled for viewers' : 'Download disabled for viewers'}
                    </span>
                  </label>
                  <p className="mt-2 text-[10px] text-secondary">When disabled, the website player hides download controls. Picture-in-picture and playback speed are always disabled in the site player.</p>
                </div>
                <div>
                  {introVideoSourceMode === 'upload' && formData.about.introVideoUrl && (
                    <div className="rounded-lg bg-surface-container-low p-3 border border-outline-variant/20">
                      <p className="text-[10px] uppercase tracking-widest text-secondary mb-1">Current Uploaded Video URL</p>
                      <p className="text-xs text-on-surface-variant break-all">{formData.about.introVideoUrl}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-4 rounded-lg bg-surface-container-low p-4">
                  <div>
                    <h4 className="font-body text-xs font-bold uppercase tracking-widest text-primary">Video Context Block</h4>
                    <p className="mt-1 text-[10px] text-secondary">These details appear below the video CTA to help clients understand your value quickly.</p>
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Context Headline</label>
                    <input
                      value={formData.about.introVideoHeadline || ''}
                      onChange={(e) => setFormData(prev => prev ? { ...prev, about: { ...prev.about, introVideoHeadline: e.target.value } } : null)}
                      className="w-full bg-surface-container-lowest border-none rounded-lg p-3 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20"
                      type="text"
                      placeholder="What clients will learn from this video"
                    />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">One-line Promise</label>
                    <textarea
                      value={formData.about.introVideoPromise || ''}
                      onChange={(e) => setFormData(prev => prev ? { ...prev, about: { ...prev.about, introVideoPromise: e.target.value } } : null)}
                      className="w-full bg-surface-container-lowest border-none rounded-lg p-3 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20"
                      rows={2}
                      placeholder="Example: I explain how I streamline eCommerce operations while improving customer experience."
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">3 Key Highlights</label>
                      <button onClick={addIntroVideoHighlight} className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline" type="button">
                        <span className="material-symbols-outlined text-sm" data-icon="add">add</span> Add Highlight
                      </button>
                    </div>
                    <div className="space-y-2">
                      {introVideoHighlights.map((highlight, index) => (
                        <div key={`highlight-${index}`} className="flex items-center gap-2">
                          <input
                            value={highlight}
                            onChange={(e) => updateIntroVideoHighlight(index, e.target.value)}
                            className="flex-1 bg-surface-container-lowest border-none rounded-lg p-2.5 text-sm text-on-surface-variant"
                            type="text"
                            placeholder={`Highlight ${index + 1}`}
                          />
                          <button onClick={() => removeIntroVideoHighlight(index)} className="text-secondary hover:text-error" type="button" aria-label={`Remove highlight ${index + 1}`}>
                            <span className="material-symbols-outlined text-sm" data-icon="close">close</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">Trust Badges</label>
                      <button onClick={addTrustBadge} className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline" type="button">
                        <span className="material-symbols-outlined text-sm" data-icon="add">add</span> Add Badge
                      </button>
                    </div>
                    <div className="space-y-2">
                      {trustBadges.map((badge, index) => (
                        <div key={`badge-${index}`} className="rounded-lg border border-outline-variant/30 bg-surface-container-lowest p-2.5">
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-[220px_1fr_auto] md:items-center">
                            <IconPicker
                              value={badge.icon || 'verified'}
                              onChange={(val) => updateTrustBadgeIcon(index, val)}
                              label="Badge Icon"
                              className="w-full"
                            />
                            <input
                              value={badge.label}
                              onChange={(e) => updateTrustBadge(index, e.target.value)}
                              className="w-full bg-surface-container-low border-none rounded-lg p-2.5 text-sm text-on-surface-variant"
                              type="text"
                              placeholder={`Badge ${index + 1}`}
                            />
                            <button onClick={() => removeTrustBadge(index)} className="justify-self-end text-secondary hover:text-error" type="button" aria-label={`Remove badge ${index + 1}`}>
                              <span className="material-symbols-outlined text-sm" data-icon="close">close</span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">Biography Paragraphs</label>
                    <button onClick={addBioParagraph} className="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline">
                      <span className="material-symbols-outlined text-sm" data-icon="add">add</span> Add Paragraph
                    </button>
                  </div>
                  <div className="space-y-3">
                    {formData.about.paragraphs.map((para, index) => (
                      <div key={index} className="relative">
                        <textarea value={para} onChange={(e) => updateBioParagraph(index, e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-4 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20" rows={3}></textarea>
                        <button onClick={() => removeBioParagraph(index)} className="absolute top-2 right-2 text-secondary hover:text-error transition-colors">
                          <span className="material-symbols-outlined text-sm" data-icon="close">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>

            {/* 5. Experience */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="work">work</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">{adminSectionNames.experience}</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Manage timeline entries like role title, company, period, and description.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-4">
                  {formData.experience.map((exp, index) => (
                    <div key={exp.id} className="bg-surface-container-low p-4 rounded-lg flex gap-4">
                      <div className="flex-1 space-y-2">
                        <input value={exp.title} onChange={(e) => handleExperienceChange(exp.id, 'title', e.target.value)} className="w-full bg-surface-container-lowest border-none rounded p-2 font-bold text-sm text-primary" type="text" placeholder="Job Title" />
                        <div className="flex gap-2">
                            <input value={exp.company} onChange={(e) => handleExperienceChange(exp.id, 'company', e.target.value)} className="flex-1 bg-surface-container-lowest border-none rounded p-2 text-xs text-secondary" type="text" placeholder="Company" />
                            <input value={exp.period} onChange={(e) => handleExperienceChange(exp.id, 'period', e.target.value)} className="w-1/3 bg-surface-container-lowest border-none rounded p-2 text-xs text-secondary" type="text" placeholder="Period" />
                        </div>
                        <textarea value={exp.description} onChange={(e) => handleExperienceChange(exp.id, 'description', e.target.value)} className="w-full bg-surface-container-lowest border-none rounded p-2 text-xs text-on-surface-variant" rows={2} placeholder="Description"></textarea>
                      </div>
                      <div className="flex flex-col justify-between items-center">
                        <button onClick={() => handleRemoveExperience(exp.id)} className="text-secondary hover:text-error"><span className="material-symbols-outlined" data-icon="delete">delete</span></button>
                        <button className="text-secondary cursor-grab"><span className="material-symbols-outlined" data-icon="drag_handle">drag_handle</span></button>
                      </div>
                    </div>
                  ))}
                  <button onClick={handleAddExperience} className="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                    + Add Experience Item
                  </button>
                </div>
              </div>
            </details>

            {/* 6. Education */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="school">school</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">{adminSectionNames.education}</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Edit academic entries including program, school, date range, and details.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-4">
                  {formData.education.map((entry) => (
                    <div key={entry.id} className="bg-surface-container-low p-4 rounded-lg flex gap-4">
                      <div className="flex-1 space-y-2">
                        <input value={entry.program} onChange={(e) => handleEducationChange(entry.id, 'program', e.target.value)} className="w-full bg-surface-container-lowest border-none rounded p-2 font-bold text-sm text-primary" type="text" placeholder="Program" />
                        <div className="flex gap-2">
                          <input value={entry.school} onChange={(e) => handleEducationChange(entry.id, 'school', e.target.value)} className="flex-1 bg-surface-container-lowest border-none rounded p-2 text-xs text-secondary" type="text" placeholder="School" />
                          <input value={entry.period} onChange={(e) => handleEducationChange(entry.id, 'period', e.target.value)} className="w-1/3 bg-surface-container-lowest border-none rounded p-2 text-xs text-secondary" type="text" placeholder="Period" />
                        </div>
                        <textarea value={entry.details} onChange={(e) => handleEducationChange(entry.id, 'details', e.target.value)} className="w-full bg-surface-container-lowest border-none rounded p-2 text-xs text-on-surface-variant" rows={2} placeholder="Details"></textarea>
                      </div>
                      <div className="flex flex-col justify-between items-center">
                        <button onClick={() => handleRemoveEducation(entry.id)} className="text-secondary hover:text-error"><span className="material-symbols-outlined" data-icon="delete">delete</span></button>
                      </div>
                    </div>
                  ))}
                  <button onClick={handleAddEducation} className="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                    + Add Education Item
                  </button>
                </div>
              </div>
            </details>

            {/* 7. Trainings and Seminars */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="workspace_premium">workspace_premium</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">{adminSectionNames.trainings}</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Maintain training records with provider, date, and supporting notes.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-4">
                  {formData.trainings && formData.trainings.length > 0 && formData.trainings.map((entry) => (
                    <div key={entry.id} className="bg-surface-container-low p-4 rounded-lg flex gap-4">
                      <div className="flex-1 space-y-2">
                        <input value={entry.title} onChange={(e) => handleTrainingChange(entry.id, 'title', e.target.value)} className="w-full bg-surface-container-lowest border-none rounded p-2 font-bold text-sm text-primary" type="text" placeholder="Training Title" />
                        <div className="flex gap-2">
                          <input value={entry.provider} onChange={(e) => handleTrainingChange(entry.id, 'provider', e.target.value)} className="flex-1 bg-surface-container-lowest border-none rounded p-2 text-xs text-secondary" type="text" placeholder="Provider" />
                          <input value={entry.date} onChange={(e) => handleTrainingChange(entry.id, 'date', e.target.value)} className="w-1/3 bg-surface-container-lowest border-none rounded p-2 text-xs text-secondary" type="text" placeholder="Date" />
                        </div>
                        <textarea value={entry.details} onChange={(e) => handleTrainingChange(entry.id, 'details', e.target.value)} className="w-full bg-surface-container-lowest border-none rounded p-2 text-xs text-on-surface-variant" rows={2} placeholder="Details"></textarea>
                      </div>
                      <div className="flex flex-col justify-between items-center">
                        <button onClick={() => handleRemoveTraining(entry.id)} className="text-secondary hover:text-error"><span className="material-symbols-outlined" data-icon="delete">delete</span></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <button onClick={handleAddTraining} className="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                    + Add Training or Seminar
                  </button>
                </div>
              </div>
            </details>

            {/* 8. Contact Details */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="contact_phone">contact_phone</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">{adminSectionNames.contact}</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Set the public contact intro and the core channels visitors can use to reach you.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 space-y-4">
                <div className="mt-6">
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Intro</label>
                  <textarea value={formData.contact.intro} onChange={(e) => handleContactChange('intro', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-4 text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20" rows={3}></textarea>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Email</label>
                    <input value={formData.contact.email} onChange={(e) => handleContactChange('email', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary focus:ring-2 focus:ring-secondary/20" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Phone</label>
                    <input value={formData.contact.phone} onChange={(e) => handleContactChange('phone', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary focus:ring-2 focus:ring-secondary/20" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Location</label>
                    <input value={formData.contact.location} onChange={(e) => handleContactChange('location', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary focus:ring-2 focus:ring-secondary/20" type="text" />
                  </div>
                </div>
              </div>
            </details>

            {/* 9. Key Expertise Tags */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="verified">verified</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">{adminSectionNames.skills} Tags</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Add short skill tags used in your expertise and tech stack presentation.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 mb-4">
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Tech Arsenal Title</label>
                  <input
                    value={formData.ui.expertiseTitle || ''}
                    onChange={(e) => handleBrandingChange('expertiseTitle', e.target.value)}
                    className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary focus:ring-2 focus:ring-secondary/20"
                    type="text"
                    placeholder="Tech Arsenal"
                  />
                </div>
                <div className="mt-6 flex flex-wrap gap-2 items-center">
                  {formData.skills.map((skill, i) => (
                      <span key={i} className="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold flex items-center gap-2">
                        {skill} <span onClick={() => handleRemoveSkill(skill)} className="material-symbols-outlined text-[14px] cursor-pointer hover:text-error" data-icon="close">close</span>
                      </span>
                  ))}
                  <input type="text" value={newSkill} onChange={e => setNewSkill(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddSkill()} className="px-3 py-1 text-xs border border-outline-variant/50 rounded-full bg-transparent focus:ring-0 focus:border-secondary w-24" placeholder="New skill..." />
                  <button onClick={handleAddSkill} className="px-3 py-1 border-2 border-dashed border-outline-variant text-secondary rounded-full text-xs font-bold hover:border-secondary transition-all">
                    + Add Skill
                  </button>
                </div>
              </div>
            </details>

            
            {/* 7. Certifications */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="workspace_premium">workspace_premium</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">{adminSectionNames.certifications}</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Manage certification cards, icon style, color theme, and image proof uploads.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-6">
                  {formData.certifications.map((cert) => {
                    const certImages = mergeGalleryImages(cert.imageUrl, cert.imageUrls);
                    const certUploadProgress = getUploadProgressByPrefix(uploadProgress, `cert-${cert.id}-`);

                    return (
                      <div key={cert.id} className="bg-surface-container-low p-6 rounded-lg space-y-4 relative">
                        <button onClick={() => handleRemoveCertification(cert.id)} className="absolute top-4 right-4 text-secondary hover:text-error">
                          <span className="material-symbols-outlined" data-icon="delete">delete</span>
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pr-8">
                          <div>
                            <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Certification Name</label>
                            <input
                              value={cert.title}
                              onChange={(e) => handleCertificationChange(cert.id, 'title', e.target.value)}
                              className="w-full bg-surface-container-lowest border-none rounded p-3 text-sm text-primary"
                              type="text"
                            />
                          </div>
                          <div>
                            <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Issuer</label>
                            <input
                              value={cert.issuer || ''}
                              onChange={(e) => handleCertificationChange(cert.id, 'issuer', e.target.value)}
                              className="w-full bg-surface-container-lowest border-none rounded p-3 text-sm text-primary"
                              type="text"
                              placeholder="Google Career Certificates"
                            />
                          </div>
                          <div>
                            <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Background Color Theme</label>
                            <select value={cert.bgColor || 'bg-secondary-container text-on-secondary-container'} onChange={(e) => handleCertificationChange(cert.id, 'bgColor', e.target.value)} className="w-full bg-surface-container-lowest border-none rounded p-3 text-sm text-primary">
                              <option value="bg-tertiary-container text-primary-fixed">Soft Gold &amp; Brown</option>
                              <option value="bg-surface-container-highest text-primary">Slate &amp; Dark</option>
                              <option value="bg-secondary-container text-on-secondary-container">Warm Gray &amp; Espresso</option>
                              <option value="bg-primary/10 text-primary">Classic Brand</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Details (Shown in View Details)</label>
                          <textarea
                            value={cert.details || ''}
                            onChange={(e) => handleCertificationChange(cert.id, 'details', e.target.value)}
                            className="w-full bg-surface-container-lowest border-none rounded p-3 text-sm text-on-surface-variant"
                            rows={3}
                            placeholder="Add full certification details here."
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Icon Picker</label>
                            <div className="flex items-center gap-3 bg-surface-container-lowest p-2 rounded relative">
                              <div className="flex-1">
                                <IconPicker value={cert.iconName || 'workspace_premium'} onChange={(val) => handleCertificationChange(cert.id, 'iconName', val)} label="Choose Icon" className="w-full" />
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Certificate Gallery Upload</label>
                            <div
                              onClick={() => document.getElementById(`cert-img-upload-${cert.id}`)?.click()}
                              className={uploadDropzoneClass}
                            >
                              {certImages[0] ? (
                                <img src={certImages[0]} className="h-9 w-9 rounded object-cover" alt="Certificate" />
                              ) : (
                                <span className="material-symbols-outlined text-secondary" data-icon="upload_file">upload_file</span>
                              )}
                              <span className="text-xs text-secondary truncate">
                                {certUploadProgress !== null
                                  ? `Uploading... ${certUploadProgress}%`
                                  : (certImages.length > 0 ? `Add More Certificate Images (${certImages.length})` : 'Upload Certificate Images (.png, .jpg)')}
                              </span>
                              {certImages.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    event.preventDefault();
                                    updateCertificationGallery(cert.id, []);
                                  }}
                                  className={uploadDeleteActionClass}
                                >
                                  Clear All
                                </button>
                              )}
                              <input type="file" accept="image/*" multiple className="hidden" id={`cert-img-upload-${cert.id}`} onChange={async (e) => {
                                const files = Array.from(e.target.files || []) as File[];
                                if (files.length > 0) {
                                  const uploadedUrls = await uploadMultipleFiles(files, 'certificates', `cert-${cert.id}`);
                                  appendCertificationGallery(cert.id, uploadedUrls);
                                }
                                e.currentTarget.value = '';
                              }} />
                            </div>
                          </div>
                        </div>

                        {certImages.length > 0 && (
                          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
                            {certImages.map((image, imageIndex) => (
                              <div key={`${cert.id}-gallery-${imageIndex}`} className="relative group/thumb rounded-md overflow-hidden border border-outline-variant/20 bg-surface-container-lowest">
                                <img src={image} className="w-full h-14 object-cover" alt={`Certification ${imageIndex + 1}`} />
                                <button
                                  type="button"
                                  onClick={() => removeCertificationGalleryImage(cert.id, imageIndex)}
                                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-surface-dim/70 text-on-surface text-[10px] opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={handleAddCertification} className="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                    + Add New Certification
                  </button>
                </div>
              </div>
            </details>

            {/* 8. Expertise Cards */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="grid_view">grid_view</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">{adminSectionNames.skills} Cards</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Edit featured capability cards with icon, title, and descriptive copy.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-4">
                  {formData.expertiseCards && formData.expertiseCards.map((card) => (
                    <div key={card.id} className="bg-surface-container-low p-4 rounded-lg flex items-start gap-4">
                      <div className="w-12 h-12 bg-surface-container-lowest rounded flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary" data-icon={card.icon}>{card.icon}</span>
                      </div>
                      <div className="flex-1 space-y-2">
                        <input type="text" className="w-full bg-surface-container-lowest border-none rounded p-2 text-sm font-bold text-primary" value={card.title} onChange={(e) => handleExpertiseCardChange(card.id, 'title', e.target.value)} placeholder="Card Title" />
                        <textarea className="w-full bg-surface-container-lowest border-none rounded p-2 text-xs text-secondary" rows={2} value={card.description} onChange={(e) => handleExpertiseCardChange(card.id, 'description', e.target.value)} placeholder="Description"></textarea>
                        <div className="w-full relative"><IconPicker value={card.icon} onChange={(val) => handleExpertiseCardChange(card.id, 'icon', val)} label="Change Icon" /></div>
                      </div>
                      <button onClick={() => handleRemoveExpertiseCard(card.id)} className="text-secondary hover:text-error mt-2"><span className="material-symbols-outlined" data-icon="delete">delete</span></button>
                    </div>
                  ))}
                  <button onClick={handleAddExpertiseCard} className="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                    + Add Expertise Card
                  </button>
                </div>
              </div>
            </details>

            {/* 9. Featured Projects */}
            <details className="group bg-surface-container-lowest rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="folder_special">folder_special</span>
                  <div>
                    <h3 className="font-headline font-bold text-lg text-primary">{adminSectionNames.projects}</h3>
                    <p className="mt-0.5 text-xs text-secondary leading-relaxed">Maintain project showcase content including images, links, tags, metrics, and CTA labels.</p>
                  </div>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-6">
                  {formData.projects && formData.projects.map((project) => {
                    const projectImages = mergeGalleryImages(project.imageUrl, project.imageUrls);
                    const projectUploadProgress = getUploadProgressByPrefix(uploadProgress, `project-${project.id}-`);

                    return (
                      <div key={project.id} className="bg-surface-container-lowest border border-outline-variant/20 p-4 rounded-xl relative">
                        <button
                          onClick={() => handleRemoveProject(project.id)}
                          className="absolute top-3 right-3 text-secondary hover:text-error"
                          title="Delete project"
                          type="button"
                        >
                          <span className="material-symbols-outlined" data-icon="delete">delete</span>
                        </button>
                        <div className="space-y-3 pr-8">
                          <div
                            onClick={() => document.getElementById(`proj-img-${project.id}`)?.click()}
                            className={uploadDropzoneClass}
                          >
                            {projectImages[0] ? (
                              <img src={projectImages[0]} className="h-9 w-9 rounded object-cover" alt="Project" />
                            ) : (
                              <span className="material-symbols-outlined text-secondary" data-icon="upload_file">upload_file</span>
                            )}
                            <span className="text-xs text-secondary truncate">
                              {projectUploadProgress !== null
                                ? `Uploading... ${projectUploadProgress}%`
                                : (projectImages.length > 0 ? `Add More Project Images (${projectImages.length})` : 'Upload Project Images (.png, .jpg)')}
                            </span>
                            {projectImages.length > 0 && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
                                  updateProjectGallery(project.id, []);
                                }}
                                className={uploadDeleteActionClass}
                              >
                                Clear All
                              </button>
                            )}
                            <input type="file" accept="image/*" multiple className="hidden" id={`proj-img-${project.id}`} onChange={async (e) => {
                              const files = Array.from(e.target.files || []) as File[];
                              if (files.length > 0) {
                                const uploadedUrls = await uploadMultipleFiles(files, 'projects', `project-${project.id}`);
                                appendProjectGallery(project.id, uploadedUrls);
                              }
                              e.currentTarget.value = '';
                            }} />
                          </div>

                          {projectImages.length > 0 && (
                            <div className="grid grid-cols-5 md:grid-cols-7 gap-2">
                              {projectImages.map((image, imageIndex) => (
                                <div key={`${project.id}-gallery-${imageIndex}`} className="relative group/thumb rounded-md overflow-hidden border border-outline-variant/20">
                                  <img src={image} alt={`Project ${imageIndex + 1}`} className="w-full h-12 object-cover" />
                                  <button
                                    type="button"
                                    onClick={() => removeProjectGalleryImage(project.id, imageIndex)}
                                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-surface-dim/70 text-on-surface text-[10px] opacity-0 group-hover/thumb:opacity-100 transition-opacity"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          <input className="w-full bg-surface-container-low border-none rounded p-2 font-bold text-sm text-primary" type="text" value={project.title} onChange={(e) => handleProjectChange(project.id, 'title', e.target.value)} placeholder="Project Title" />
                          <textarea className="w-full bg-surface-container-low border-none rounded p-2 text-xs text-on-surface-variant" rows={2} value={project.description} onChange={(e) => handleProjectChange(project.id, 'description', e.target.value)} placeholder="Project Description"></textarea>
                          <input className="w-full bg-surface-container-low border-none rounded p-2 text-xs text-primary" type="text" value={project.link} onChange={(e) => handleProjectChange(project.id, 'link', e.target.value)} placeholder="Project Link (URL)" />
                          <div className="grid grid-cols-2 gap-2">
                            <input className="w-full bg-surface-container-low border-none rounded p-2 text-xs text-primary" type="text" value={project.itemCount || ''} onChange={(e) => handleProjectChange(project.id, 'itemCount', e.target.value)} placeholder="Metric (e.g. 12 SOPs)" />
                            <input className="w-full bg-surface-container-low border-none rounded p-2 text-xs text-primary" type="text" value={project.ctaLabel || ''} onChange={(e) => handleProjectChange(project.id, 'ctaLabel', e.target.value)} placeholder="CTA Label" />
                          </div>
                          <input
                            className="w-full bg-surface-container-low border-none rounded p-2 text-xs text-primary"
                            type="text"
                            value={(project.tags || []).join(', ')}
                            onChange={(e) => {
                              const tags = e.target.value.split(',').map(tag => tag.trim()).filter(Boolean);
                              setFormData(prev => prev ? {
                                ...prev,
                                projects: prev.projects.map(p => p.id === project.id ? { ...p, tags } : p)
                              } : null);
                            }}
                            placeholder="Tags (comma separated)"
                          />
                        </div>
                      </div>
                    );
                  })}
                  <button onClick={handleAddProject} className="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                    + Add New Project
                  </button>
                </div>
              </div>
            </details>
          </div>


          {/* Right Column: Quick Reference Panel */}
          <div className="col-span-12 lg:col-span-4">
            <div className="sticky top-12 space-y-6">
              <div className="bg-primary text-on-primary p-8 rounded-xl relative overflow-hidden">
                <div className="relative z-10">
                  <h4 className="font-headline text-xl font-bold mb-6">Editor Insights</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-on-primary/10 pb-2">
                      <span className="text-xs text-on-primary/70 font-medium">Total Experience</span>
                      <span className="font-headline font-bold text-lg">{formData.experience.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-on-primary/10 pb-2">
                      <span className="text-xs text-on-primary/70 font-medium">Total Certifications</span>
                      <span className="font-headline font-bold text-lg">{formData.certifications.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-on-primary/10 pb-2">
                      <span className="text-xs text-on-primary/70 font-medium">Total Projects</span>
                      <span className="font-headline font-bold text-lg">{formData.projects?.length || 0}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-on-primary/10 pb-2">
                      <span className="text-xs text-on-primary/70 font-medium">Education Items</span>
                      <span className="font-headline font-bold text-lg">{formData.education.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-on-primary/10 pb-2">
                      <span className="text-xs text-on-primary/70 font-medium">Trainings</span>
                      <span className="font-headline font-bold text-lg">{formData.trainings.length}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-on-primary/70 font-medium">Total Skills</span>
                      <span className="font-headline font-bold text-lg">{formData.skills.length}</span>
                    </div>
                  </div>
                </div>
                <div className="absolute -right-6 -bottom-6 opacity-10">
                  <span className="material-symbols-outlined !text-[120px]" data-icon="analytics">analytics</span>
                </div>
              </div>

              <div className="bg-surface-container-lowest p-6 rounded-xl border border-outline-variant/20 shadow-sm">
                <h4 className="font-body font-bold text-primary text-xs uppercase tracking-widest mb-4">Help &amp; Support</h4>
                <ul className="space-y-3">
                  <li>
                    <button
                      type="button"
                      onClick={handleOpenUserGuide}
                      title="Open user guide"
                      className="w-full text-left flex items-center gap-2 text-xs text-secondary hover:text-primary cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm" data-icon="menu_book">menu_book</span> User Guide
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={handlePrioritySupport}
                      title="Open priority support form"
                      className="w-full text-left flex items-center gap-2 text-xs text-secondary hover:text-primary cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm" data-icon="support_agent">support_agent</span> Priority Support
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
            </>
          )}
        </div>

        {/* Footer Meta */}
        <footer className="mt-24 py-8 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center text-secondary">
          <p className="font-body text-[10px] uppercase tracking-widest">© {currentYear} KDL Works. All rights reserved.</p>
          <div className="flex gap-8 mt-4 md:mt-0">
            <button type="button" onClick={() => setActiveModal('privacy')} className="font-body text-[10px] uppercase tracking-widest hover:text-primary transition-colors">Privacy Policy</button>
            <button type="button" onClick={() => setActiveModal('terms')} className="font-body text-[10px] uppercase tracking-widest hover:text-primary transition-colors">Terms of Service</button>
            <button type="button" onClick={() => setActiveModal('contact')} className="font-body text-[10px] uppercase tracking-widest hover:text-primary transition-colors">Contact Info</button>
          </div>
        </footer>

        <AnimatePresence>
          {activeModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[70] bg-surface-dim/40 backdrop-blur-sm flex items-center justify-center p-4"
              onClick={() => setActiveModal(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="w-full max-w-2xl bg-surface-container-lowest border border-outline-variant/20 rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 bg-surface-container-low">
                  <h3 className="font-headline text-xl font-bold text-primary">
                    {activeModal === 'userGuide' && 'User Guide'}
                    {activeModal === 'prioritySupport' && 'Priority Support'}
                    {activeModal === 'privacy' && 'Privacy Policy'}
                    {activeModal === 'terms' && 'Terms of Service'}
                    {activeModal === 'contact' && 'Contact Info'}
                  </h3>
                  <button onClick={() => setActiveModal(null)} className="text-secondary hover:text-primary">
                    <span className="material-symbols-outlined" data-icon="close">close</span>
                  </button>
                </div>

                <div className="p-6 space-y-4 text-sm text-on-surface-variant max-h-[70vh] overflow-y-auto">
                  {activeModal === 'userGuide' && (
                    <div className="space-y-3">
                      <p><span className="font-semibold text-primary">Operational Scope:</span> Use Content Editor to update public profile content, certifications, expertise, and projects. Draft edits auto-save; Publish is the release action.</p>
                      <p><span className="font-semibold text-primary">Analytics Scope:</span> Use Analytics for live metrics such as visits, downloads, scroll-depth, and referrer acquisition with 7/30/90-day range filtering.</p>
                      <p><span className="font-semibold text-primary">Asset Standards:</span> Upload optimized web assets only. Supported types: image files for logos/visuals and PDF for portfolio download.</p>
                      <p><span className="font-semibold text-primary">Governance:</span> All updates are attributable to the authenticated admin account and are subject to internal content governance.</p>
                    </div>
                  )}

                  {activeModal === 'prioritySupport' && (
                    <form onSubmit={handleSubmitPrioritySupport} className="space-y-4">
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-secondary mb-2">Subject</label>
                        <input
                          value={supportSubject}
                          onChange={(e) => setSupportSubject(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-primary"
                          type="text"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-secondary mb-2">Category</label>
                        <select
                          value={supportCategory}
                          onChange={(e) => setSupportCategory(e.target.value as 'bug' | 'incident' | 'billing' | 'account' | 'other')}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-primary"
                        >
                          <option value="bug">Bug / Functional Error</option>
                          <option value="incident">Production Incident</option>
                          <option value="billing">Billing / Subscription</option>
                          <option value="account">Account / Access</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-secondary mb-2">Priority</label>
                        <select
                          value={supportPriority}
                          onChange={(e) => setSupportPriority(e.target.value as 'high' | 'urgent')}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-primary"
                        >
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs uppercase tracking-widest text-secondary mb-2">Issue Details</label>
                        <textarea
                          value={supportMessage}
                          onChange={(e) => setSupportMessage(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-primary min-h-[130px]"
                          placeholder="Describe the issue, steps to reproduce, expected vs actual behavior..."
                          required
                        />
                        <p className="mt-2 text-[11px] text-secondary">Include impact, frequency, and affected audience to accelerate triage.</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <input
                          id="support-consent"
                          type="checkbox"
                          checked={supportConsent}
                          onChange={(e) => setSupportConsent(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-primary"
                        />
                        <label htmlFor="support-consent" className="text-xs text-on-surface-variant leading-relaxed">
                          I confirm this request is accurate and I consent to processing operational metadata for support handling under {POLICY_VERSION}.
                        </label>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setActiveModal(null)} className="px-4 py-2 rounded-lg bg-surface-container-high text-secondary font-bold text-xs uppercase tracking-widest">Cancel</button>
                        <button disabled={supportSubmitting} type="submit" className="px-4 py-2 rounded-lg bg-primary text-on-primary font-bold text-xs uppercase tracking-widest disabled:opacity-70">
                          {supportSubmitting ? 'Sending...' : 'Send Request'}
                        </button>
                      </div>
                    </form>
                  )}

                  {activeModal === 'privacy' && (
                    <div className="space-y-3">
                      <p><span className="font-semibold text-primary">Effective Date:</span> {POLICY_EFFECTIVE_DATE} • <span className="font-semibold text-primary">Version:</span> {POLICY_VERSION}</p>
                      <p>{LEGAL_ENTITY} processes limited operational data to deliver the admin dashboard, secure account access, and maintain service reliability.</p>
                      <p>Data categories include authentication identifiers, content edits, analytics aggregates, and support request metadata submitted by administrators.</p>
                      <p>We do not sell personal data. Access is restricted by Firebase authentication, authorization rules, and role-based admin access.</p>
                      <p>For privacy inquiries or data requests, contact {SUPPORT_EMAIL}.</p>
                    </div>
                  )}

                  {activeModal === 'terms' && (
                    <div className="space-y-3">
                      <p><span className="font-semibold text-primary">Effective Date:</span> {POLICY_EFFECTIVE_DATE} • <span className="font-semibold text-primary">Version:</span> {POLICY_VERSION}</p>
                      <p>By using the {BRAND_NAME} admin dashboard, you agree to lawful and authorized use of platform tools, content, and data.</p>
                      <p>You are responsible for account credential security, editorial accuracy, and preventing unauthorized access from your session.</p>
                      <p>Abuse, malicious behavior, or attempts to bypass security controls may result in access suspension and formal investigation.</p>
                      <p>Service features may evolve; continued use indicates acceptance of current published terms and policy updates.</p>
                    </div>
                  )}

                  {activeModal === 'contact' && (
                    <div className="space-y-2">
                      <p><span className="font-semibold text-primary">Brand:</span> {BRAND_NAME}</p>
                      <p><span className="font-semibold text-primary">Legal Entity:</span> {LEGAL_ENTITY}</p>
                      <p><span className="font-semibold text-primary">Support Email:</span> {SUPPORT_EMAIL}</p>
                      <p><span className="font-semibold text-primary">Support Window:</span> {SUPPORT_HOURS}</p>
                      <p><span className="font-semibold text-primary">Escalation:</span> Use Priority Support for production-impacting incidents.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.main>
    </div>
  );
}
