import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { auth, storage, db } from '../firebase';
import { doc, getDoc, collection, getDocs, orderBy, query, limit } from 'firebase/firestore';
import { usePortfolioData, PortfolioData } from '../hooks/usePortfolioData';
import { IconPicker } from '../components/IconPicker';

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { data, loading: dataLoading, updateData } = usePortfolioData();
  
  // Local state for editing
  const [formData, setFormData] = useState<PortfolioData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [activeTab, setActiveTab] = useState<'editor'|'analytics'>('editor');
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
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const handleFileUpload = async (file: File, path: string, onComplete: (url: string) => void) => {
    if (!file) return;
    const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    setUploadProgress(prev => ({ ...prev, [path]: 0 }));

    uploadTask.on('state_changed', 
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(prev => ({ ...prev, [path]: progress }));
      }, 
      (error) => {
        console.error("Upload error:", error);
        alert("Failed to upload file. Please try again.");
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[path];
          return newProgress;
        });
      }, 
      async () => {
        const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
        onComplete(downloadURL);
        setUploadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[path];
          return newProgress;
        });
      }
    );
  };

  useEffect(() => {
    if (!formData || !data) return;
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(data);
    if (!hasChanges) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await updateData(formData);
        setSaveMessage('Auto-saved');
        setTimeout(() => setSaveMessage(''), 2000);
      } catch (error) {
        setSaveMessage('Error saving');
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
    if (data && !formData) {
      setFormData(data);
    }
  }, [data, formData]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {}
  };

  const handleSave = async () => {
    if (!formData) return;
    setIsSaving(true);
    setSaveMessage('');
    try {
      await updateData(formData);
      setSaveMessage('Changes published successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      setSaveMessage('Error saving changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleHeroChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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
      ui: { ...prev.ui, sectionTitles: { ...prev.ui.sectionTitles, [section]: value } }
    } : null);
  };

  const handleAddCertification = () => {
    setFormData(prev => {
      if (!prev) return null;
      return {
        ...prev,
        certifications: [
          ...prev.certifications,
          { id: Date.now().toString(), title: 'New Certification', issuer: 'Issuer' }
        ]
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
          { id: Date.now().toString(), title: 'New Project', description: 'Description', link: '', imageUrl: '' }
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

  if (authLoading || dataLoading || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const selectedDailyStats = dailyStats.slice(-analyticsRange);
  const rangeViews = selectedDailyStats.reduce((sum, day) => sum + (day.views || 0), 0);
  const rangeDownloads = selectedDailyStats.reduce((sum, day) => sum + (day.downloads || 0), 0);
  const rangeBottomScrolls = selectedDailyStats.reduce((sum, day) => sum + (day.bottomScrolls || 0), 0);
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
    <div className="editorial-grid min-h-screen">
      {/* Sidebar Navigation */}
      <aside className="bg-surface-container border-r border-outline-variant/10 flex flex-col h-screen sticky top-0 p-8 overflow-y-auto">
        <div className="mb-12">
          <h1 className="font-headline font-black text-2xl text-primary tracking-tighter">Virtual Curator</h1>
          <p className="font-body text-[10px] uppercase tracking-[0.2em] text-secondary mt-1">Admin Control Suite</p>
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
          
        </nav>
        <div className="mt-auto pt-8 border-t border-outline-variant/20">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center">
                <span className="font-headline font-bold text-on-secondary-container">{user?.email?.charAt(0).toUpperCase() || 'A'}</span>
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-primary truncate">{user?.email}</p>
                <p className="text-[10px] text-secondary">Administrator</p>
              </div>
            </div>
            <button onClick={handleSignOut} className="flex items-center gap-2 text-secondary hover:text-primary transition-colors text-xs font-bold uppercase tracking-widest px-1">
              <span className="material-symbols-outlined text-sm" data-icon="logout">logout</span>
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main Workspace */}
      <main className="p-6 md:p-12 overflow-x-hidden w-full">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-16">
          <div>
            <h2 className="font-headline text-4xl md:text-5xl font-black text-primary -ml-1 tracking-tight">{activeTab === 'editor' ? 'Content Editor' : 'Analytics'}</h2>
            <p className="font-body text-secondary mt-2 max-w-md">
              {activeTab === 'editor'
                ? "Update your digital atelier's presence. Every change reflects your professional standard."
                : "Live behavioral analytics from your public portfolio traffic and interactions."}
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
                  <Link to="/" className="flex-1 md:flex-none px-6 py-2 rounded-lg bg-surface-container-highest text-primary font-bold text-sm hover:bg-secondary transition-all duration-300 hover:text-white flex items-center justify-center">
                  Preview Site
                  </Link>
                  <button disabled={isSaving} onClick={handleSave} className="flex-1 md:flex-none px-6 py-2 rounded-lg bg-primary text-on-primary font-bold text-sm shadow-xl shadow-primary/10 active:scale-95 transition-all flex items-center justify-center gap-2">
                  {isSaving ? 'Saving...' : 'Publish Changes'}
                  </button>
              </div>
            </div>
          )}
        </header>

        <div className="grid grid-cols-12 gap-8">

          {activeTab === 'analytics' && (
            <div className="col-span-12 flex flex-col gap-8 w-full p-4 lg:p-10 max-w-7xl mx-auto">
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
            </div>
          )}

          {activeTab === 'editor' && (
            <>

          {/* Left Column: Editorial Sections */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            
            {/* 1. Branding & Navigation */}
            <details className="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden" open>
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="branding_watermark">branding_watermark</span>
                  <h3 className="font-headline font-bold text-lg text-primary">Branding &amp; Navigation</h3>
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
                    <div onClick={() => fileInputRefs.current['navLogo']?.click()} className="flex items-center gap-4 bg-surface-container-low p-3 rounded-lg border-2 border-dashed border-outline-variant/30 cursor-pointer hover:border-outline-variant/60">
                      {formData.ui.navLogoUrl ? (
                         <img src={formData.ui.navLogoUrl} className="h-6 w-auto object-contain" alt="Nav Logo"/>
                      ) : (
                         <span className="material-symbols-outlined text-secondary" data-icon="upload_file">upload_file</span>
                      )}
                      <span className="text-xs text-secondary">{uploadProgress['logos'] ? `Uploading...` : (formData.ui.navLogoUrl ? 'Change Logo' : 'Upload Logo (.svg, .png)')}</span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" ref={el => fileInputRefs.current['navLogo'] = el} onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'logos', (url) => handleBrandingChange('navLogoUrl', url))} />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Footer Title</label>
                    <input value={formData.ui.footerTitle} onChange={(e) => handleBrandingChange('footerTitle', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary focus:ring-2 focus:ring-secondary/20" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Footer Logo</label>
                    <div onClick={() => fileInputRefs.current['footerLogo']?.click()} className="flex items-center gap-4 bg-surface-container-low p-3 rounded-lg border-2 border-dashed border-outline-variant/30 cursor-pointer hover:border-outline-variant/60">
                      {formData.ui.footerLogoUrl ? (
                        <img src={formData.ui.footerLogoUrl} className="h-6 w-auto object-contain" alt="Footer Logo" />
                      ) : (
                        <span className="material-symbols-outlined text-secondary" data-icon="upload_file">upload_file</span>
                      )}
                      <span className="text-xs text-secondary">{uploadProgress['logos'] ? `Uploading...` : (formData.ui.footerLogoUrl ? 'Change Logo' : 'Upload Logo (.svg, .png)')}</span>
                    </div>
                    <input type="file" accept="image/*" className="hidden" ref={el => fileInputRefs.current['footerLogo'] = el} onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'logos', (url) => handleBrandingChange('footerLogoUrl', url))} />
                  </div>
                </div>
              </div>
            </details>

            {/* 2. Section Headings */}
            <details className="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="label">label</span>
                  <h3 className="font-headline font-bold text-lg text-primary">Section Headings</h3>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">About Heading</label>
                    <input value={formData.ui.sectionTitles.about} onChange={(e) => handleSectionTitleChange('about', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Experience Heading</label>
                    <input value={formData.ui.sectionTitles.experience} onChange={(e) => handleSectionTitleChange('experience', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Skills Heading</label>
                    <input value={formData.ui.sectionTitles.skills} onChange={(e) => handleSectionTitleChange('skills', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Projects Heading</label>
                    <input value={formData.ui.sectionTitles.projects} onChange={(e) => handleSectionTitleChange('projects', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Contact Heading</label>
                    <input value={formData.ui.sectionTitles.contact} onChange={(e) => handleSectionTitleChange('contact', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Certifications Heading</label>
                    <input value={formData.ui.certificationsTitle} onChange={(e) => handleBrandingChange('certificationsTitle', e.target.value)} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" />
                  </div>
                </div>
              </div>
            </details>

            {/* 3. Hero & Identity */}
            <details className="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="auto_awesome">auto_awesome</span>
                  <h3 className="font-headline font-bold text-lg text-primary">Hero &amp; Identity</h3>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 space-y-6">
                <div className="mt-6">
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Portfolio Headline</label>
                  <input name="headline" value={formData.hero.headline} onChange={handleHeroChange} className="w-full bg-surface-container-low border-none rounded-lg p-4 font-headline text-2xl text-primary focus:ring-2 focus:ring-secondary/20" type="text" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Sub-headline</label>
                    <input name="subheadline" value={formData.hero.subheadline} onChange={handleHeroChange} className="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" />
                  </div>
                  <div>
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Portfolio PDF</label>
                    <div className="flex items-center justify-between bg-surface-container-low p-3 rounded-lg border border-outline-variant/30">
                      <span className="text-xs text-primary font-medium truncate w-4/5">{formData.portfolioPdfUrl ? "Linked PDF (Active)" : "No PDF Uploaded"}</span>
                      <button onClick={() => fileInputRefs.current['portfolioPdf']?.click()} className="text-[10px] font-bold text-secondary hover:text-primary underline">Replace</button>
                      <input type="file" accept=".pdf" className="hidden" ref={el => fileInputRefs.current['portfolioPdf'] = el} onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'pdfs', (url) => setFormData(prev => prev ? {...prev, portfolioPdfUrl: url} : null))} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Description</label>
                  <textarea name="description" value={formData.hero.description} onChange={handleHeroChange} className="w-full bg-surface-container-low border-none rounded-lg p-4 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20" rows={3}></textarea>
                </div>
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Profile Visual</label>
                  <div className="flex items-center gap-6 p-4 bg-primary/5 border border-primary/10 rounded-xl">
                    <div className="w-20 h-20 rounded bg-primary/10 flex items-center justify-center border border-outline-variant/20 overflow-hidden">
                      {formData.hero.imageUrl ? (
                        <img src={formData.hero.imageUrl} className="w-full h-full object-cover" alt="Profile Visual" />
                      ) : (
                        <span className="material-symbols-outlined text-primary/40 text-3xl" data-icon="image">image</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button onClick={() => fileInputRefs.current['heroImage']?.click()} className="px-4 py-1.5 bg-primary text-on-primary text-[10px] font-bold rounded uppercase tracking-wider">{formData.hero.imageUrl ? 'Change' : 'Upload'}</button>
                        <button onClick={() => setFormData(prev => prev ? {...prev, hero: {...prev.hero, imageUrl: ''}} : null)} className="px-4 py-1.5 bg-white border border-error/20 text-error text-[10px] font-bold rounded uppercase tracking-wider hover:bg-error/5">Delete</button>
                        <input type="file" accept="image/*" className="hidden" ref={el => fileInputRefs.current['heroImage'] = el} onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'images', (url) => setFormData(prev => prev ? {...prev, hero: {...prev.hero, imageUrl: url}} : null))} />
                      </div>
                      <p className="text-[10px] text-secondary">Recommended: 1200x1500px high-contrast portrait.</p>
                    </div>
                  </div>
                </div>
              </div>
            </details>

            {/* 4. About & Philosophy */}
            <details className="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="history_edu">history_edu</span>
                  <h3 className="font-headline font-bold text-lg text-primary">About &amp; Philosophy</h3>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 space-y-6">
                <div className="mt-6">
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Philosophy Quote</label>
                  <textarea value={formData.about.quote} onChange={(e) => setFormData(prev => prev ? {...prev, about: {...prev.about, quote: e.target.value}} : null)} className="w-full bg-surface-container-low border-none rounded-lg p-4 font-headline italic text-primary focus:ring-2 focus:ring-secondary/20" rows={2}></textarea>
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
            <details className="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="work">work</span>
                  <h3 className="font-headline font-bold text-lg text-primary">Experience</h3>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-4">
                  {formData.experience.map((exp, index) => (
                    <div key={exp.id} className="bg-surface-container-low p-4 rounded-lg flex gap-4">
                      <div className="flex-1 space-y-2">
                        <input value={exp.title} onChange={(e) => handleExperienceChange(exp.id, 'title', e.target.value)} className="w-full bg-white border-none rounded p-2 font-bold text-sm text-primary" type="text" placeholder="Job Title" />
                        <div className="flex gap-2">
                            <input value={exp.company} onChange={(e) => handleExperienceChange(exp.id, 'company', e.target.value)} className="flex-1 bg-white border-none rounded p-2 text-xs text-secondary" type="text" placeholder="Company" />
                            <input value={exp.period} onChange={(e) => handleExperienceChange(exp.id, 'period', e.target.value)} className="w-1/3 bg-white border-none rounded p-2 text-xs text-secondary" type="text" placeholder="Period" />
                        </div>
                        <textarea value={exp.description} onChange={(e) => handleExperienceChange(exp.id, 'description', e.target.value)} className="w-full bg-white border-none rounded p-2 text-xs text-on-surface-variant" rows={2} placeholder="Description"></textarea>
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

            {/* 6. Key Expertise Tags */}
            <details className="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="verified">verified</span>
                  <h3 className="font-headline font-bold text-lg text-primary">Key Expertise</h3>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
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
            <details className="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="workspace_premium">workspace_premium</span>
                  <h3 className="font-headline font-bold text-lg text-primary">Certifications</h3>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-6">
                  {formData.certifications.map((cert) => (
                      <div key={cert.id} className="bg-surface-container-low p-6 rounded-lg space-y-4 relative">
                        <button onClick={() => handleRemoveCertification(cert.id)} className="absolute top-4 right-4 text-secondary hover:text-error">
                          <span className="material-symbols-outlined" data-icon="delete">delete</span>
                        </button>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pr-8">
                          <div>
                            <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Certification Name</label>
                            <input value={cert.title} onChange={(e) => setFormData(prev => prev ? {...prev, certifications: prev.certifications.map(c => c.id === cert.id ? {...c, title: e.target.value} : c)} : null)} className="w-full bg-white border-none rounded p-3 text-sm text-primary" type="text" />
                          </div>
                          <div>
                            <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Background Color Theme</label>
                            <select value={cert.bgColor || ''} onChange={(e) => setFormData(prev => prev ? {...prev, certifications: prev.certifications.map(c => c.id === cert.id ? {...c, bgColor: e.target.value} : c)} : null)} className="w-full bg-white border-none rounded p-3 text-sm text-primary">
                              <option value="bg-tertiary-container text-primary-fixed">Soft Gold &amp; Brown</option>
                              <option value="bg-surface-container-highest text-primary">Slate &amp; Dark</option>
                              <option value="bg-secondary-container text-on-secondary-container">Warm Mocha</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Icon Picker</label>
                            <div className="flex items-center gap-3 bg-white p-2 rounded relative">
                              <div className="flex-1">
                                <IconPicker value={cert.iconName || 'verified'} onChange={(val) => setFormData(prev => prev ? {...prev, certifications: prev.certifications.map(c => c.id === cert.id ? {...c, iconName: val} : c)} : null)} label="Choose Icon" className="w-full" />
                              </div>
                            </div>
                          </div>
                          <div>
                            <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Certificate Image Upload</label>
                            <div className="flex items-center justify-between bg-white p-2 rounded">
                              <span className="text-[10px] text-primary truncate px-2">{cert.imageUrl ? 'Certificate Uploaded' : 'No Image'}</span>
                              <input type="file" accept="image/*" className="hidden" id={`cert-img-upload-${cert.id}`} onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleFileUpload(file, 'certificates', (url) => setFormData(prev => prev ? {...prev, certifications: prev.certifications.map(c => c.id === cert.id ? {...c, imageUrl: url} : c)} : null));
                              }} />
                              <button onClick={() => document.getElementById(`cert-img-upload-${cert.id}`)?.click()} className="text-[10px] font-bold text-secondary underline">{cert.imageUrl ? 'Replace' : 'Upload'}</button>
                            </div>
                          </div>
                        </div>
                      </div>
                  ))}
                  <button onClick={handleAddCertification} className="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                    + Add New Certification
                  </button>
                </div>
              </div>
            </details>

            {/* 8. Expertise Cards */}
            <details className="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="grid_view">grid_view</span>
                  <h3 className="font-headline font-bold text-lg text-primary">Expertise Cards</h3>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-4">
                  {formData.expertiseCards && formData.expertiseCards.map((card) => (
                    <div key={card.id} className="bg-surface-container-low p-4 rounded-lg flex items-start gap-4">
                      <div className="w-12 h-12 bg-white rounded flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-primary" data-icon={card.icon}>{card.icon}</span>
                      </div>
                      <div className="flex-1 space-y-2">
                        <input type="text" className="w-full bg-white border-none rounded p-2 text-sm font-bold text-primary" value={card.title} onChange={(e) => handleExpertiseCardChange(card.id, 'title', e.target.value)} placeholder="Card Title" />
                        <textarea className="w-full bg-white border-none rounded p-2 text-xs text-secondary" rows={2} value={card.description} onChange={(e) => handleExpertiseCardChange(card.id, 'description', e.target.value)} placeholder="Description"></textarea>
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
            <details className="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
              <summary className="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary" data-icon="folder_special">folder_special</span>
                  <h3 className="font-headline font-bold text-lg text-primary">Featured Projects</h3>
                </div>
                <span className="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
              </summary>
              <div className="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
                <div className="mt-6 space-y-6">
                  {formData.projects && formData.projects.map((project) => (
                    <div key={project.id} className="bg-white border border-outline-variant/20 p-4 rounded-xl flex gap-4">
                      <div className="w-24 h-24 bg-surface-container-low rounded-lg overflow-hidden border border-outline-variant/10 relative group">
                        {project.imageUrl ? (
                          <img src={project.imageUrl} className="w-full h-full object-cover" alt="Project" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-outline-variant">
                            <span className="material-symbols-outlined" data-icon="image">image</span>
                          </div>
                        )}
                        <input type="file" accept="image/*" className="hidden" id={`proj-img-${project.id}`} onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, 'projects', (url) => handleProjectChange(project.id, 'imageUrl', url));
                        }} />
                      </div>
                      <div className="flex-1 space-y-2">
                        <input className="w-full bg-surface-container-low border-none rounded p-2 font-bold text-sm text-primary" type="text" value={project.title} onChange={(e) => handleProjectChange(project.id, 'title', e.target.value)} placeholder="Project Title" />
                        <textarea className="w-full bg-surface-container-low border-none rounded p-2 text-xs text-on-surface-variant" rows={2} value={project.description} onChange={(e) => handleProjectChange(project.id, 'description', e.target.value)} placeholder="Project Description"></textarea>
                        <input className="w-full bg-surface-container-low border-none rounded p-2 text-xs text-primary" type="text" value={project.link} onChange={(e) => handleProjectChange(project.id, 'link', e.target.value)} placeholder="Project Link (URL)" />
                      </div>
                      <div className="flex flex-col justify-between">
                        <button onClick={() => document.getElementById(`proj-img-${project.id}`)?.click()} className="text-secondary hover:text-primary"><span className="material-symbols-outlined" data-icon="upload">upload</span></button>
                        <button onClick={() => handleRemoveProject(project.id)} className="text-secondary hover:text-error"><span className="material-symbols-outlined" data-icon="delete">delete</span></button>
                      </div>
                    </div>
                  ))}
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
              <div className="bg-primary text-white p-8 rounded-xl relative overflow-hidden">
                <div className="relative z-10">
                  <h4 className="font-headline text-xl font-bold mb-6">Editor Insights</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                      <span className="text-xs text-white/70 font-medium">Total Experience</span>
                      <span className="font-headline font-bold text-lg">{formData.experience.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                      <span className="text-xs text-white/70 font-medium">Total Certifications</span>
                      <span className="font-headline font-bold text-lg">{formData.certifications.length}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/10 pb-2">
                      <span className="text-xs text-white/70 font-medium">Total Projects</span>
                      <span className="font-headline font-bold text-lg">{formData.projects?.length || 0}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-white/70 font-medium">Total Skills</span>
                      <span className="font-headline font-bold text-lg">{formData.skills.length}</span>
                    </div>
                  </div>
                </div>
                <div className="absolute -right-6 -bottom-6 opacity-10">
                  <span className="material-symbols-outlined !text-[120px]" data-icon="analytics">analytics</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm">
                <h4 className="font-body font-bold text-primary text-xs uppercase tracking-widest mb-4">Help &amp; Support</h4>
                <ul className="space-y-3">
                  <li className="flex items-center gap-2 text-xs text-secondary hover:text-primary cursor-pointer transition-colors">
                    <span className="material-symbols-outlined text-sm" data-icon="menu_book">menu_book</span> User Guide
                  </li>
                  <li className="flex items-center gap-2 text-xs text-secondary hover:text-primary cursor-pointer transition-colors">
                    <span className="material-symbols-outlined text-sm" data-icon="support_agent">support_agent</span> Priority Support
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
          <p className="font-body text-[10px] uppercase tracking-widest">© 2024 Virtual Curator. All rights reserved.</p>
          <div className="flex gap-8 mt-4 md:mt-0">
            <Link className="font-body text-[10px] uppercase tracking-widest hover:text-primary transition-colors" to="#">Privacy Policy</Link>
            <Link className="font-body text-[10px] uppercase tracking-widest hover:text-primary transition-colors" to="#">Terms of Service</Link>
            <Link className="font-body text-[10px] uppercase tracking-widest hover:text-primary transition-colors" to="#">Contact Info</Link>
          </div>
        </footer>

      </main>
    </div>
  );
}
