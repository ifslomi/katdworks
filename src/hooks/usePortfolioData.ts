import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

const SAVE_DEBOUNCE_MS = 450;
const RETRY_SAVE_MS = 1200;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string;
    providerInfo?: any[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId || undefined,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export type PortfolioSectionKey =
  | 'home'
  | 'about'
  | 'experience'
  | 'skills'
  | 'education'
  | 'trainings'
  | 'projects'
  | 'contact'
  | 'certifications';

export const DEFAULT_SECTION_VISIBILITY: Record<PortfolioSectionKey, boolean> = {
  home: true,
  about: true,
  experience: true,
  skills: true,
  education: true,
  trainings: true,
  projects: true,
  contact: true,
  certifications: true,
};

export interface PortfolioData {
  ui: {
    navTitle: string;
    navLogoUrl?: string;
    footerTitle: string;
    footerLogoUrl?: string;
    expertiseTitle: string;
    certificationsTitle: string;
    sectionTitles: {
      home: string;
      about: string;
      experience: string;
      skills: string;
      education: string;
      trainings: string;
      projects: string;
      contact: string;
    };
    sectionVisibility?: Partial<Record<PortfolioSectionKey, boolean>>;
    navLinks: {
      id: string;
      label: string;
      href: string;
    }[];
    socialIcons: {
      id: string;
      icon: string;
      link: string;
      imageUrl?: string;
    }[];
  };
  hero: {
    headline: string;
    subheadline: string;
    description: string;
    imageUrl: string;
  };
  portfolioPdfUrl: string;
  contact: {
    email: string;
    phone: string;
    location: string;
    intro: string;
  };
  about: {
    quote: string;
    paragraphs: string[];
    imageUrl?: string;
    introVideoSourceMode?: 'link' | 'upload';
    introVideoUrl?: string;
    introVideoAllowDownload?: boolean;
    introVideoHeadline?: string;
    introVideoPromise?: string;
    introVideoHighlights?: string[];
    trustBadges?: ({
      label: string;
      icon?: string;
    } | string)[];
  };
  experience: {
    id: string;
    title: string;
    company: string;
    period: string;
    description: string;
  }[];
  education: {
    id: string;
    program: string;
    school: string;
    period: string;
    details: string;
  }[];
  trainings: {
    id: string;
    title: string;
    provider: string;
    date: string;
    details: string;
  }[];
  skills: string[];
  certifications: {
    id: string;
    title: string;
    issuer: string;
    details?: string;
    iconName?: string;
    imageUrl?: string;
    imageUrls?: string[];
    bgColor?: string;
  }[];
  expertiseCards: {
    id: string;
    title: string;
    description: string;
    icon: string;
  }[];
  projects: {
    id: string;
    title: string;
    description: string;
    link: string;
    imageUrl: string;
    imageUrls?: string[];
    tags?: string[];
    itemCount?: string;
    ctaLabel?: string;
  }[];
}

export function usePortfolioData() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);
  const pendingWriteRef = useRef<Partial<PortfolioData>>({});
  const hasPendingWriteRef = useRef(false);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingWrite = useCallback(async () => {
    if (!hasPendingWriteRef.current) return;

    const payload = pendingWriteRef.current;
    pendingWriteRef.current = {};
    hasPendingWriteRef.current = false;

    try {
      const docRef = doc(db, 'portfolio', 'main');
      await setDoc(docRef, payload, { merge: true });
      setReadError(null);
    } catch (error) {
      console.error('Error updating portfolio data:', error);
      pendingWriteRef.current = { ...payload, ...pendingWriteRef.current };
      hasPendingWriteRef.current = true;
      setReadError(error instanceof Error ? error.message : String(error));

      if (!writeTimerRef.current) {
        writeTimerRef.current = setTimeout(() => {
          writeTimerRef.current = null;
          void flushPendingWrite();
        }, RETRY_SAVE_MS);
      }
    }
  }, []);

  const scheduleWrite = useCallback(() => {
    if (writeTimerRef.current) {
      clearTimeout(writeTimerRef.current);
    }

    writeTimerRef.current = setTimeout(() => {
      writeTimerRef.current = null;
      void flushPendingWrite();
    }, SAVE_DEBOUNCE_MS);
  }, [flushPendingWrite]);

  useEffect(() => {
    const docRef = doc(db, 'portfolio', 'main');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const remoteData = docSnap.data() as PortfolioData;

        if (hasPendingWriteRef.current) {
          // Keep local unsaved edits visible while waiting for debounced writes.
          setData({ ...remoteData, ...pendingWriteRef.current } as PortfolioData);
        } else {
          setData(remoteData);
        }

        setReadError(null);
      } else {
        if (!hasPendingWriteRef.current) {
          setData(null);
          setReadError('Portfolio document does not exist at portfolio/main.');
        }
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching portfolio data:", error);
      setReadError(error instanceof Error ? error.message : String(error));
      setData(null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    return () => {
      if (writeTimerRef.current) {
        clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }

      void flushPendingWrite();
    };
  }, [flushPendingWrite]);

  const updateData = useCallback(async (newData: Partial<PortfolioData>) => {
    setData((prev) => {
      if (!prev) return newData as PortfolioData;
      return { ...prev, ...newData };
    });

    pendingWriteRef.current = {
      ...pendingWriteRef.current,
      ...newData,
    };
    hasPendingWriteRef.current = true;
    scheduleWrite();
  }, [scheduleWrite]);

  return { data, loading, updateData, readError };
}
