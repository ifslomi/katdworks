import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

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
    iconName?: string;
    imageUrl?: string;
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
    tags?: string[];
    itemCount?: string;
    ctaLabel?: string;
  }[];
}

export function usePortfolioData() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    const docRef = doc(db, 'portfolio', 'main');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setData(docSnap.data() as PortfolioData);
        setReadError(null);
      } else {
        setData(null);
        setReadError('Portfolio document does not exist at portfolio/main.');
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

  const updateData = useCallback(async (newData: Partial<PortfolioData>) => {
    try {
      const docRef = doc(db, 'portfolio', 'main');
      await setDoc(docRef, newData, { merge: true });
    } catch (error) {
      console.error("Error updating portfolio data:", error);
      handleFirestoreError(error, OperationType.WRITE, 'portfolio/main');
    }
  }, []);

  return { data, loading, updateData, readError };
}
