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
      home: string;
      about: string;
      experience: string;
      skills: string;
      education: string;
      trainings: string;
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
  contact: {
    email: string;
    phone: string;
    location: string;
    intro: string;
  };
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

export const defaultPortfolioData: PortfolioData = {
  ui: {
    navTitle: "KDL Virtual Solutions",
    navLogoUrl: "",
    footerTitle: "KDL Virtual Solutions",
    footerLogoUrl: "",
    expertiseTitle: "Core Services",
    certificationsTitle: "Certifications and Credentials",
    sectionTitles: {
      home: "Home",
      about: "About Me",
      experience: "Work Experience",
      skills: "Skills and Tools",
      education: "Education",
      trainings: "Trainings and Seminars",
      projects: "Portfolio Samples",
      contact: "Let's Work Together"
    },
    navLinks: [
      { id: "home", label: "Home", href: "#hero" },
      { id: "about", label: "About", href: "#about" },
      { id: "experience", label: "Experience", href: "#experience" },
      { id: "skills", label: "Skills", href: "#skills" },
      { id: "education", label: "Education", href: "#education" },
      { id: "trainings", label: "Trainings", href: "#trainings" },
      { id: "projects", label: "Projects", href: "#projects" },
      { id: "contact", label: "Contact", href: "#contact" }
    ],
    socialIcons: [
      { id: "1", icon: "mail", link: "mailto:hello@katdworks.com" },
      { id: "2", icon: "work", link: "https://www.linkedin.com" },
      { id: "3", icon: "language", link: "https://katdworks.com" }
    ]
  },
  hero: {
    headline: "Katrina De Leon",
    subheadline: "Executive Virtual Assistant and Operations Partner",
    description: "I help founders and growing teams run smoother operations through dependable executive support, structured systems, and polished client-facing communication. From inbox and calendar management to project coordination and digital workflows, I deliver support that keeps your business moving forward.",
    imageUrl: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=800&auto=format&fit=crop"
  },
  portfolioPdfUrl: "",
  contact: {
    email: "hello@katdworks.com",
    phone: "+63 917 555 1204",
    location: "Manila, Philippines (GMT+8)",
    intro: "Ready to streamline your operations and reclaim your focus? Let's discuss how I can support your business goals."
  },
  about: {
    quote: "Reliable support is not just about checking tasks off a list. It is about creating systems that let leaders do their best work.",
    paragraphs: [
      "I am a detail-oriented Executive Virtual Assistant with strong experience in administrative support, client communication, and project coordination. Over the years, I have supported founders, consultants, and service teams in maintaining structure and consistency behind the scenes.",
      "My work focuses on building efficient workflows, reducing friction in day-to-day operations, and making sure priorities are tracked and completed. I am comfortable working across calendars, inboxes, documents, and collaboration tools while keeping communication clear and professional.",
      "I bring a calm and proactive approach to fast-moving environments, especially where trust, discretion, and reliability are essential."
    ]
  },
  experience: [
    {
      id: "1",
      title: "Executive Virtual Assistant",
      company: "Freelance / Remote",
      period: "2021 - Present",
      description: "Provide end-to-end executive and administrative support including inbox and calendar management, client follow-ups, document preparation, and meeting coordination. Built and maintained SOPs and task systems that improved consistency and turnaround times for recurring operations."
    },
    {
      id: "2",
      title: "Administrative Assistant",
      company: "Operations and Client Services Team",
      period: "2018 - 2021",
      description: "Handled daily administrative functions such as scheduling, records management, and reporting support. Coordinated with internal teams and external clients to keep projects aligned, complete, and on schedule."
    },
    {
      id: "3",
      title: "Customer Service and Back Office Support",
      company: "Business Process Support",
      period: "2015 - 2018",
      description: "Supported customer inquiries and back-office documentation with a focus on response quality and accurate processing. Developed communication habits that improved client satisfaction and reduced follow-up delays."
    }
  ],
  education: [
    {
      id: "1",
      program: "Bachelor of Science in Business Administration",
      school: "University of the East",
      period: "2011 - 2015",
      details: "Coursework emphasized management, communication, and organizational operations relevant to executive support roles."
    },
    {
      id: "2",
      program: "Senior High School - ABM Track",
      school: "Saint Louis Academy",
      period: "2009 - 2011",
      details: "Built foundational skills in accounting principles, business correspondence, and office productivity."
    }
  ],
  trainings: [
    {
      id: "1",
      title: "Virtual Assistant Masterclass",
      provider: "VA Training Philippines",
      date: "2023",
      details: "Advanced workflow design, client communication standards, and service packaging for long-term retainer engagements."
    },
    {
      id: "2",
      title: "Project Management Fundamentals",
      provider: "Google Career Certificates",
      date: "2022",
      details: "Planning, task sequencing, stakeholder updates, and practical project documentation for distributed teams."
    },
    {
      id: "3",
      title: "Social Media and Content Support Workshop",
      provider: "Coursera",
      date: "2021",
      details: "Content calendar support, basic performance tracking, and aligned client communication across social channels."
    }
  ],
  skills: [
    "Executive Assistance",
    "Calendar and Email Management",
    "Client Communication",
    "Project Coordination",
    "SOP Documentation",
    "Data Entry and Reporting",
    "Google Workspace",
    "Microsoft Office",
    "Notion",
    "Trello",
    "ClickUp",
    "Canva"
  ],
  certifications: [
    {
      id: "1",
      title: "Certified Virtual Assistant",
      issuer: "VA Training Philippines",
      iconName: "verified",
      bgColor: "bg-tertiary-container text-primary-fixed"
    },
    {
      id: "2",
      title: "Project Management Foundations",
      issuer: "Google Career Certificates",
      iconName: "workspace_premium",
      bgColor: "bg-surface-container-highest text-primary"
    },
    {
      id: "3",
      title: "Administrative Excellence and Office Productivity",
      issuer: "TESDA",
      iconName: "military_tech",
      bgColor: "bg-secondary-container text-on-secondary-container"
    }
  ],
  expertiseCards: [
    {
      id: "executive-support",
      title: "Executive Support",
      description: "Calendar oversight, inbox triage, appointment coordination, and day-to-day executive assistance.",
      icon: "event_note"
    },
    {
      id: "operations-management",
      title: "Operations Management",
      description: "Task tracking, documentation, and process building to improve team consistency and execution speed.",
      icon: "settings_suggest"
    },
    {
      id: "client-communication",
      title: "Client Communication",
      description: "Professional responses, follow-ups, and relationship support across email and collaboration channels.",
      icon: "forum"
    },
    {
      id: "digital-admin",
      title: "Digital Administration",
      description: "Document preparation, database upkeep, and reporting workflows across modern productivity tools.",
      icon: "inventory_2"
    }
  ],
  projects: [
    {
      id: "1",
      title: "Executive Inbox and Calendar System",
      description: "Implemented a structured weekly workflow for inbox triage, appointment preparation, and follow-up tracking that reduced missed tasks and response delays.",
      link: "#",
      imageUrl: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=800&auto=format&fit=crop",
      tags: ["operations", "executive support"],
      itemCount: "12 SOPs",
      ctaLabel: "View Case"
    },
    {
      id: "2",
      title: "Client Onboarding Process Kit",
      description: "Built reusable onboarding checklists, templates, and communication scripts to streamline first-touch delivery for new clients.",
      link: "#",
      imageUrl: "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?q=80&w=800&auto=format&fit=crop",
      tags: ["client success", "templates"],
      itemCount: "8 templates",
      ctaLabel: "View Sample"
    },
    {
      id: "3",
      title: "Weekly Reporting Dashboard",
      description: "Consolidated task updates, pending blockers, and key metrics into a simple recurring report format for better decision-making.",
      link: "#",
      imageUrl: "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?q=80&w=800&auto=format&fit=crop",
      tags: ["reporting", "dashboard"],
      itemCount: "3 teams",
      ctaLabel: "See Overview"
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

  const projects = Array.isArray(raw.projects)
    ? raw.projects.map((project, index) => ({
        ...defaultPortfolioData.projects[index % defaultPortfolioData.projects.length],
        ...project,
        tags: Array.isArray(project.tags) ? project.tags : (defaultPortfolioData.projects[index % defaultPortfolioData.projects.length].tags || [])
      }))
    : defaultPortfolioData.projects;

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
    contact: {
      ...defaultPortfolioData.contact,
      ...(raw.contact || {})
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
    education: Array.isArray(raw.education)
      ? raw.education
      : defaultPortfolioData.education,
    trainings: Array.isArray(raw.trainings)
      ? raw.trainings
      : defaultPortfolioData.trainings,
    skills: Array.isArray(raw.skills) ? raw.skills : defaultPortfolioData.skills,
    certifications,
    expertiseCards,
    projects
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
        // Do not auto-seed Firestore when document is missing.
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
