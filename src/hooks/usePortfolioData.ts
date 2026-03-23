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

export interface PortfolioData {
  ui: {
    navTitle: string;
    navLogoUrl?: string;
    footerTitle: string;
    footerLogoUrl?: string;
    expertiseTitle: string;
    certificationsTitle: string;
    sectionTitles: {
      about: string;
      experience: string;
      skills: string;
      projects: string;
      contact: string;
    };
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
  about: {
    quote: string;
    paragraphs: string[];
  };
  experience: {
    id: string;
    title: string;
    company: string;
    period: string;
    description: string;
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
  }[];
}

export const defaultPortfolioData: PortfolioData = {
  ui: {
    navTitle: "Virtual Curator",
    navLogoUrl: "",
    footerTitle: "Virtual Curator",
    footerLogoUrl: "",
    expertiseTitle: "Expertise Spectrum",
    certificationsTitle: "Accredited Excellence",
    sectionTitles: {
      about: "Architecture of Order",
      experience: "Professional Journey",
      skills: "Expertise Spectrum",
      projects: "Featured Projects",
      contact: "Initiate Connection"
    },
    navLinks: [
      { id: "about", label: "About", href: "#about" },
      { id: "experience", label: "Experience", href: "#experience" },
      { id: "skills", label: "Skills", href: "#skills" },
      { id: "projects", label: "Projects", href: "#projects" },
      { id: "contact", label: "Contact", href: "#contact" }
    ],
    socialIcons: [
      { id: "1", icon: "public", link: "#" },
      { id: "2", icon: "group", link: "#" }
    ]
  },
  hero: {
    headline: "Katrina De Leon",
    subheadline: "Your Premier Virtual Assistant.",
    description: "Elevating business operations through meticulous curation, administrative excellence, and strategic partnership. I manage the complexity so you can focus on the vision.",
    imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=800&auto=format&fit=crop"
  },
  portfolioPdfUrl: "",
  about: {
    quote: "Efficiency is not just about doing things faster; it's about doing the right things with such precision that they seem effortless.",
    paragraphs: [
      "With over 8 years of experience in high-level executive support, I have transitioned from traditional corporate roles to becoming a \"Virtual Curator\"—an architect of digital workspaces and a guardian of my clients' most precious resource: time.",
      "I specialize in supporting creative entrepreneurs and boutique agencies who require more than just a task-runner; they require a partner who understands the nuances of brand identity and operational excellence."
    ]
  },
  experience: [
    {
      id: "1",
      title: "Lead Operations Curator",
      company: "Nexus Creative Collective",
      period: "2021 — Present",
      description: "Spearheading end-to-end operational workflows for a 20-person agency. Reduced project delivery turnaround by 30% through the implementation of customized Notion ecosystems and automated client onboarding pipelines."
    },
    {
      id: "2",
      title: "Executive Assistant to CEO",
      company: "Lumina Health Systems",
      period: "2018 — 2021",
      description: "Managed complex international travel logistics and calendar prioritization for a C-suite executive. Orchestrated quarterly board meetings and served as the primary liaison for stakeholders and high-net-worth investors."
    }
  ],
  skills: [
    "Crisis Management",
    "Luxury Travel",
    "System Design",
    "Notion",
    "Slack",
    "Google Workspace"
  ],
  certifications: [
    {
      id: "1",
      title: "Certified Virtual Assistant",
      issuer: "International Association of VAs",
      iconName: "verified",
      bgColor: "bg-tertiary-container text-primary-fixed"
    },
    {
      id: "2",
      title: "Notion Essentials Certified",
      issuer: "Notion HQ",
      iconName: "workspace_premium",
      bgColor: "bg-surface-container-highest text-primary"
    },
    {
      id: "3",
      title: "Project Mgmt Specialist",
      issuer: "Google Professional Certifications",
      iconName: "military_tech",
      bgColor: "bg-secondary-container text-on-secondary-container"
    }
  ],
  expertiseCards: [
    {
      id: "digital-curatorship",
      title: "Digital Curatorship",
      description: "Advanced ecosystem design in Notion, Asana, and Airtable. Transforming data chaos into structured actionable intelligence.",
      icon: "folder_managed"
    },
    {
      id: "strategic-comms",
      title: "Strategic Comms",
      description: "Professional ghostwriting, high-stakes inbox management, and brand voice consistency.",
      icon: "forum"
    },
    {
      id: "fiscal-oversight",
      title: "Fiscal Oversight",
      description: "Invoicing, expense tracking, and basic bookkeeping using QuickBooks and Xero.",
      icon: "payments"
    },
    {
      id: "event-logistics",
      title: "Event Logistics",
      description: "Virtual and physical event coordination, from webinar tech to boutique retreat scouting.",
      icon: "event_seat"
    }
  ],
  projects: [
    {
      id: "1",
      title: "Agency Operations Overhaul",
      description: "Complete restructuring of client onboarding and project delivery using Notion and Zapier.",
      link: "#",
      imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop"
    },
    {
      id: "2",
      title: "Executive Retreat Planning",
      description: "End-to-end logistics and vendor management for a 50-person corporate retreat in Bali.",
      link: "#",
      imageUrl: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?q=80&w=800&auto=format&fit=crop"
    }
  ]
};

function normalizePortfolioData(rawData: unknown): PortfolioData {
  const raw = (rawData || {}) as Partial<PortfolioData>;

  const certifications = Array.isArray(raw.certifications)
    ? raw.certifications.map((cert, index) => ({
        ...defaultPortfolioData.certifications[index % defaultPortfolioData.certifications.length],
        ...cert
      }))
    : defaultPortfolioData.certifications;

  const expertiseCards = Array.isArray(raw.expertiseCards)
    ? raw.expertiseCards.map((card, index) => ({
        ...defaultPortfolioData.expertiseCards[index % defaultPortfolioData.expertiseCards.length],
        ...card
      }))
    : defaultPortfolioData.expertiseCards;

  return {
    ...defaultPortfolioData,
    ...raw,
    ui: {
      ...defaultPortfolioData.ui,
      ...(raw.ui || {}),
      sectionTitles: {
        ...defaultPortfolioData.ui.sectionTitles,
        ...(raw.ui?.sectionTitles || {})
      },
      navLinks: Array.isArray(raw.ui?.navLinks)
        ? raw.ui.navLinks.map((link, index) => ({
            ...defaultPortfolioData.ui.navLinks[index % defaultPortfolioData.ui.navLinks.length],
            ...link
          }))
        : defaultPortfolioData.ui.navLinks,
      socialIcons: Array.isArray(raw.ui?.socialIcons)
        ? raw.ui.socialIcons.map((icon, index) => ({
            ...defaultPortfolioData.ui.socialIcons[index % defaultPortfolioData.ui.socialIcons.length],
            ...icon
          }))
        : defaultPortfolioData.ui.socialIcons
    },
    hero: {
      ...defaultPortfolioData.hero,
      ...(raw.hero || {})
    },
    about: {
      ...defaultPortfolioData.about,
      ...(raw.about || {}),
      paragraphs: Array.isArray(raw.about?.paragraphs)
        ? raw.about.paragraphs
        : defaultPortfolioData.about.paragraphs
    },
    experience: Array.isArray(raw.experience)
      ? raw.experience
      : defaultPortfolioData.experience,
    skills: Array.isArray(raw.skills) ? raw.skills : defaultPortfolioData.skills,
    certifications,
    expertiseCards,
    projects: Array.isArray(raw.projects) ? raw.projects : defaultPortfolioData.projects
  };
}

export function usePortfolioData() {
  const [data, setData] = useState<PortfolioData>(defaultPortfolioData);
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    const docRef = doc(db, 'portfolio', 'main');
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setData(normalizePortfolioData(docSnap.data()));
        setReadError(null);
      } else {
        // Initialize with default data if it doesn't exist
        setDoc(docRef, defaultPortfolioData).catch(err => {
          console.error('Failed to initialize portfolio document:', err);
        });
        setData(defaultPortfolioData);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching portfolio data:", error);
      setReadError(error instanceof Error ? error.message : String(error));
      // Keep the public preview usable even when Firestore read fails.
      setData(defaultPortfolioData);
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
