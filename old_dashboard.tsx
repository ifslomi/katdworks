import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { auth, storage } from '../firebase';
import { usePortfolioData, PortfolioData } from '../hooks/usePortfolioData';

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

  // Auto-save effect
  useEffect(() => {
    if (!formData || !data) return;
    
    // Check if there are actual changes
    const hasChanges = JSON.stringify(formData) !== JSON.stringify(data);
    if (!hasChanges) return;

    const timer = setTimeout(async () => {
      setIsSaving(true);
      try {
        await updateData(formData);
        setSaveMessage('Auto-saved');
        setTimeout(() => setSaveMessage(''), 2000);
      } catch (error) {
        console.error('Auto-save error:', error);
        setSaveMessage('Error saving');
      } finally {
        setIsSaving(false);
      }
    }, 1500); // 1.5 second debounce

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
    } catch (error) {
      console.error('Error signing out:', error);
    }
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
      console.error('Error saving data:', error);
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

  if (authLoading || dataLoading || !formData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const fadeUp = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
  };

  return (
    <div className="bg-surface text-on-surface">
      <div className="editorial-grid min-h-screen">
        {/* Sidebar Navigation */}
        <aside className="bg-surface-container border-r border-outline-variant/10 flex flex-col h-screen sticky top-0 p-8 z-20">
          <div className="mb-12">
            <h1 className="font-headline font-black text-2xl text-primary tracking-tighter">Virtual Curator</h1>
            <p className="font-body text-[10px] uppercase tracking-[0.2em] text-secondary mt-1">Admin Control Suite</p>
          </div>
          <nav className="flex-1 flex flex-col gap-2">
            <div className="flex items-center gap-4 p-3 bg-primary text-on-primary rounded-lg transition-all duration-300">
              <span className="material-symbols-outlined" data-icon="edit_note">edit_note</span>
              <span className="font-body font-semibold text-sm">Content Editor</span>
            </div>
          </nav>
          <div className="mt-auto pt-8 border-t border-outline-variant/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center">
                  <span className="font-headline font-bold text-on-secondary-container">
                    {user?.email?.charAt(0).toUpperCase() || 'A'}
                  </span>
                </div>
                <div className="overflow-hidden">
                  <p className="text-xs font-bold text-primary truncate max-w-[120px]">{user?.email}</p>
                  <p className="text-[10px] text-secondary">Administrator</p>
                </div>
              </div>
              <button onClick={handleSignOut} className="text-secondary hover:text-error transition-colors p-2" title="Sign Out">
                <span className="material-symbols-outlined text-lg" data-icon="logout">logout</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Workspace */}
        <main className="p-8 md:p-12 max-w-6xl w-full">
          {/* Header Section */}
          <motion.header 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6"
          >
            <div>
              <h2 className="font-headline text-4xl md:text-5xl font-black text-primary -ml-1 tracking-tight">Content Editor</h2>
              <p className="font-body text-secondary mt-2 max-w-md">Update your digital atelier's presence. Every change reflects your professional standard.</p>
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              {saveMessage && (
                <span className={`text-sm font-medium ${saveMessage.includes('Error') ? 'text-error' : 'text-emerald-600'}`}>
                  {saveMessage}
                </span>
              )}
              <Link to="/" className="px-6 py-2 rounded-lg bg-surface-container-highest text-primary font-bold text-sm hover:bg-secondary transition-all duration-300 hover:text-white">
                Preview Site
              </Link>
              <button 
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 rounded-lg bg-primary text-on-primary font-bold text-sm shadow-xl shadow-primary/10 active:scale-95 transition-all disabled:opacity-70 flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Publishing...
                  </>
                ) : 'Publish Changes'}
              </button>
            </div>
          </motion.header>

          {/* Editor Interface: Bento Grid Style */}
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={{
              visible: { transition: { staggerChildren: 0.1 } }
            }}
            className="grid grid-cols-12 gap-6"
          >
            {/* Hero Section Editor */}
            <motion.section variants={fadeUp} className="col-span-12 lg:col-span-8 bg-surface-container-lowest p-8 rounded-xl border border-outline-variant/5 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-secondary" data-icon="auto_awesome">auto_awesome</span>
                <h3 className="font-headline font-bold text-xl text-primary">Hero &amp; Identity</h3>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Portfolio Headline</label>
                  <input 
                    name="headline"
                    value={formData.hero.headline}
                    onChange={handleHeroChange}
                    className="w-full bg-surface-container-low border-none rounded-lg p-4 font-headline text-2xl text-primary focus:ring-2 focus:ring-secondary/20" 
                    type="text" 
                  />
                </div>
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Sub-headline</label>
                  <input 
                    name="subheadline"
                    value={formData.hero.subheadline}
                    onChange={handleHeroChange}
                    className="w-full bg-surface-container-low border-none rounded-lg p-4 font-headline text-lg text-primary focus:ring-2 focus:ring-secondary/20" 
                    type="text" 
                  />
                </div>
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Description</label>
                  <textarea 
                    value={formData.hero.description}
                    onChange={(e) => setFormData({ ...formData, hero: { ...formData.hero, description: e.target.value } })}
                    className="w-full bg-surface-container-low border-none rounded-lg p-4 font-body text-on-surface-variant focus:ring-2 focus:ring-secondary/20 min-h-[150px]"
                  />
                </div>
              </div>
            </motion.section>

            {/* Profile Image / Quick Actions */}
            <motion.section variants={fadeUp} className="col-span-12 lg:col-span-4 flex flex-col gap-6">
              <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant/5 shadow-sm flex-1 flex flex-col relative overflow-hidden">
                <div className="relative z-10 flex-1 flex flex-col">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="material-symbols-outlined text-secondary" data-icon="image">image</span>
                    <h4 className="font-headline font-bold text-xl text-primary">Profile Visual</h4>
                  </div>
                  <p className="text-on-surface-variant text-sm mb-6">Upload your main hero image.</p>
                  
                  <div className="flex-1 flex flex-col justify-center">
                    {formData.hero.imageUrl ? (
                      <div className="mb-6 relative rounded-lg overflow-hidden border border-outline-variant/30 group">
                        <img src={formData.hero.imageUrl} alt="Profile" className="w-full aspect-video object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              setFormData({ ...formData, hero: { ...formData.hero, imageUrl: '' } });
                            }}
                            className="bg-error text-on-error p-2 rounded-full hover:bg-error/90 transition-colors shadow-lg flex items-center justify-center"
                            title="Remove Image"
                          >
                            <span className="material-symbols-outlined text-sm">delete</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-6 aspect-video rounded-lg border-2 border-dashed border-outline-variant/50 flex flex-col items-center justify-center bg-surface-container-low/50 text-on-surface-variant">
                        <span className="material-symbols-outlined text-4xl mb-2 opacity-50">image</span>
                        <span className="text-sm font-medium opacity-70">No image selected</span>
                      </div>
                    )}
                  </div>
                  
                  <input 
                    type="file"
                    accept="image/*"
                    ref={el => fileInputRefs.current['heroImage'] = el}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, 'images', (url) => setFormData({ ...formData, hero: { ...formData.hero, imageUrl: url } }));
                    }}
                    className="hidden"
                  />
                  <button 
                    type="button"
                    onClick={() => fileInputRefs.current['heroImage']?.click()}
                    disabled={uploadProgress['images'] !== undefined}
                    className="w-full bg-primary text-on-primary hover:bg-secondary transition-colors font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-sm">upload</span>
                    {uploadProgress['images'] !== undefined ? `Uploading... ${Math.round(uploadProgress['images'])}%` : (formData.hero.imageUrl ? 'Change Image' : 'Upload Image')}
                  </button>
                </div>
              </div>

              <div className="bg-surface-container-lowest p-8 rounded-xl border border-outline-variant/5 shadow-sm flex-1 flex flex-col justify-center">
                <div className="flex items-center gap-2 mb-6">
                  <span className="material-symbols-outlined text-secondary" data-icon="picture_as_pdf">picture_as_pdf</span>
                  <h4 className="font-headline font-bold text-xl text-primary">Portfolio PDF</h4>
                </div>
                <p className="text-on-surface-variant text-sm mb-6">Upload your downloadable portfolio.</p>
                
                {formData.portfolioPdfUrl ? (
                  <div className="mb-6 flex items-center justify-between bg-surface-container-low p-4 rounded-lg border border-outline-variant/20">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="material-symbols-outlined text-error">picture_as_pdf</span>
                      <a href={formData.portfolioPdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm font-medium truncate hover:underline">View Current PDF</a>
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setFormData({ ...formData, portfolioPdfUrl: '' });
                      }}
                      className="text-on-surface-variant hover:text-error transition-colors p-2 rounded-full hover:bg-error/10 flex items-center justify-center"
                      title="Remove PDF"
                    >
                      <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                  </div>
                ) : (
                  <div className="mb-6 p-4 rounded-lg border-2 border-dashed border-outline-variant/50 flex flex-col items-center justify-center bg-surface-container-low/50 text-on-surface-variant">
                    <span className="material-symbols-outlined text-3xl mb-2 opacity-50">upload_file</span>
                    <span className="text-sm font-medium opacity-70">No PDF selected</span>
                  </div>
                )}

                <input 
                  type="file"
                  accept="application/pdf"
                  ref={el => fileInputRefs.current['portfolioPdf'] = el}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'pdfs', (url) => setFormData({ ...formData, portfolioPdfUrl: url }));
                  }}
                  className="hidden"
                />
                <button 
                  type="button"
                  onClick={() => fileInputRefs.current['portfolioPdf']?.click()}
                  disabled={uploadProgress['pdfs'] !== undefined}
                  className="w-full bg-surface-container-high text-primary hover:bg-surface-container-highest transition-colors font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 shadow-sm border border-outline-variant/20"
                >
                  <span className="material-symbols-outlined text-sm">upload</span>
                  {uploadProgress['pdfs'] !== undefined ? `Uploading... ${Math.round(uploadProgress['pdfs'])}%` : (formData.portfolioPdfUrl ? 'Change PDF' : 'Upload PDF')}
                </button>
              </div>
            </motion.section>

            {/* About Section Editor */}
            <motion.section variants={fadeUp} className="col-span-12 bg-surface-container-lowest p-8 rounded-xl border border-outline-variant/5 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-secondary" data-icon="person">person</span>
                <h3 className="font-headline font-bold text-xl text-primary">About &amp; Philosophy</h3>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Philosophy Quote</label>
                  <textarea 
                    value={formData.about.quote}
                    onChange={(e) => setFormData(prev => prev ? { ...prev, about: { ...prev.about, quote: e.target.value } } : null)}
                    className="w-full bg-surface-container-low border-none rounded-lg p-4 font-headline text-lg text-primary focus:ring-2 focus:ring-secondary/20 italic" 
                    rows={2}
                  ></textarea>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block font-body text-[10px] uppercase tracking-widest text-secondary">Biography Paragraphs</label>
                    <button 
                      onClick={() => setFormData(prev => prev ? { ...prev, about: { ...prev.about, paragraphs: [...prev.about.paragraphs, 'New paragraph...'] } } : null)}
                      className="text-secondary hover:text-primary transition-colors flex items-center gap-1 text-xs font-bold"
                    >
                      <span className="material-symbols-outlined text-sm" data-icon="add">add</span> Add Paragraph
                    </button>
                  </div>
                  <div className="space-y-3">
                    {formData.about.paragraphs.map((para, index) => (
                      <div key={index} className="relative group">
                        <textarea 
                          value={para}
                          onChange={(e) => {
                            setFormData(prev => {
                              if (!prev) return null;
                              const newParas = [...prev.about.paragraphs];
                              newParas[index] = e.target.value;
                              return { ...prev, about: { ...prev.about, paragraphs: newParas } };
                            });
                          }}
                          className="w-full bg-surface-container-low border-none rounded-lg p-4 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20 min-h-[100px] mb-4"
                        />
                        <button 
                          onClick={() => {
                            setFormData(prev => {
                              if (!prev) return null;
                              const newParas = prev.about.paragraphs.filter((_, i) => i !== index);
                              return { ...prev, about: { ...prev.about, paragraphs: newParas } };
                            });
                          }}
                          className="absolute top-2 right-2 text-outline-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-white rounded-full p-1"
                        >
                          <span className="material-symbols-outlined text-sm" data-icon="delete">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.section>

            {/* Experience List */}
            <motion.section variants={fadeUp} className="col-span-12 lg:col-span-7 bg-surface-container-low p-8 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary" data-icon="work">work</span>
                  <h3 className="font-headline font-bold text-xl text-primary">Experience</h3>
                </div>
                <button onClick={handleAddExperience} className="text-secondary hover:text-primary transition-colors flex items-center gap-1 text-sm font-bold">
                  <span className="material-symbols-outlined" data-icon="add_circle">add_circle</span> Add
                </button>
              </div>
              <div className="space-y-4">
                {formData.experience.map((exp, index) => (
                  <div key={exp.id} className="bg-surface-container-lowest p-6 rounded-lg group hover:shadow-md transition-all duration-300 relative">
                    <button 
                      onClick={() => handleRemoveExperience(exp.id)}
                      className="absolute top-4 right-4 text-outline-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span className="material-symbols-outlined text-sm" data-icon="delete">delete</span>
                    </button>
                    <div className="flex justify-between items-start mb-4 pr-8">
                      <div className="w-full space-y-2">
                        <input 
                          value={exp.title}
                          onChange={(e) => handleExperienceChange(exp.id, 'title', e.target.value)}
                          className="w-full bg-transparent border-b border-outline-variant/30 p-1 font-headline font-bold text-primary focus:border-primary focus:ring-0 outline-none" 
                          type="text" 
                          placeholder="Job Title"
                        />
                        <div className="flex gap-2">
                          <input 
                            value={exp.company}
                            onChange={(e) => handleExperienceChange(exp.id, 'company', e.target.value)}
                            className="flex-1 bg-transparent border-b border-outline-variant/30 p-1 font-body text-xs text-secondary focus:border-primary focus:ring-0 outline-none" 
                            type="text" 
                            placeholder="Company"
                          />
                          <input 
                            value={exp.period}
                            onChange={(e) => handleExperienceChange(exp.id, 'period', e.target.value)}
                            className="flex-1 bg-transparent border-b border-outline-variant/30 p-1 font-body text-xs text-secondary focus:border-primary focus:ring-0 outline-none" 
                            type="text" 
                            placeholder="Period (e.g., 2021 - Present)"
                          />
                        </div>
                      </div>
                    </div>
                    <textarea 
                      value={exp.description}
                      onChange={(e) => handleExperienceChange(exp.id, 'description', e.target.value)}
                      className="w-full bg-surface-container-low border-none rounded-lg p-4 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20 min-h-[100px]"
                      placeholder="Description"
                    />
                  </div>
                ))}
              </div>
            </motion.section>

            {/* Skills & Certifications */}
            <motion.section variants={fadeUp} className="col-span-12 lg:col-span-5 flex flex-col gap-6">
              {/* Skills */}
              <div className="bg-white p-8 rounded-xl border border-outline-variant/10 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <span className="material-symbols-outlined text-secondary" data-icon="verified">verified</span>
                  <h3 className="font-headline font-bold text-xl text-primary">Key Expertise</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.skills.map(skill => (
                    <span key={skill} className="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold flex items-center gap-2">
                      {skill} 
                      <span onClick={() => handleRemoveSkill(skill)} className="material-symbols-outlined text-[14px] cursor-pointer hover:text-error" data-icon="close">close</span>
                    </span>
                  ))}
                  <div className="flex items-center gap-2 ml-2">
                    <input 
                      type="text" 
                      value={newSkill} 
                      onChange={e => setNewSkill(e.target.value)} 
                      placeholder="New skill..."
                      className="bg-surface-container-low border-none rounded-full px-3 py-1 text-xs focus:ring-2 focus:ring-secondary/20 outline-none w-24"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSkill();
                        }
                      }}
                    />
                    <button onClick={handleAddSkill} className="px-3 py-1 border-2 border-dashed border-outline-variant text-secondary rounded-full text-xs font-bold hover:border-secondary hover:text-primary transition-all">
                      + Add
                    </button>
                  </div>
                </div>
              </div>
              {/* Certifications */}
              <div className="bg-white p-8 rounded-xl border border-outline-variant/10 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary" data-icon="workspace_premium">workspace_premium</span>
                    <h3 className="font-headline font-bold text-xl text-primary">Certifications</h3>
                  </div>
                  <button onClick={handleAddCertification} className="text-secondary hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-sm" data-icon="add">add</span>
                  </button>
                </div>
                <ul className="space-y-4">
                  {formData.certifications.map(cert => (
                    <li key={cert.id} className="flex items-center justify-between group bg-surface-container-lowest p-3 rounded border border-outline-variant/20">
                      <div className="flex-1 mr-4">
                        <input 
                          value={cert.title}
                          onChange={(e) => {
                            setFormData(prev => prev ? {
                              ...prev,
                              certifications: prev.certifications.map(c => c.id === cert.id ? { ...c, title: e.target.value } : c)
                            } : null);
                          }}
                          className="w-full bg-transparent border-none p-0 font-body text-sm font-semibold text-primary focus:ring-0 outline-none mb-1"
                          placeholder="Certification Title"
                        />
                        <input 
                          value={cert.issuer}
                          onChange={(e) => {
                            setFormData(prev => prev ? {
                              ...prev,
                              certifications: prev.certifications.map(c => c.id === cert.id ? { ...c, issuer: e.target.value } : c)
                            } : null);
                          }}
                          className="w-full bg-transparent border-none p-0 font-body text-xs text-secondary focus:ring-0 outline-none"
                          placeholder="Issuer"
                        />
                      </div>
                      <span onClick={() => handleRemoveCertification(cert.id)} className="material-symbols-outlined text-secondary hover:text-error cursor-pointer transition-colors" data-icon="delete">delete</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.section>
            {/* Projects Section */}
            <motion.section variants={fadeUp} className="col-span-12 bg-surface-container-low p-8 rounded-xl shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary" data-icon="folder_special">folder_special</span>
                  <h3 className="font-headline font-bold text-xl text-primary">Featured Projects</h3>
                </div>
                <button 
                  onClick={() => {
                    setFormData(prev => prev ? {
                      ...prev,
                      projects: [
                        ...prev.projects,
                        { id: Date.now().toString(), title: 'New Project', description: 'Description', link: '#', imageUrl: '' }
                      ]
                    } : null);
                  }} 
                  className="text-secondary hover:text-primary transition-colors flex items-center gap-1 text-sm font-bold"
                >
                  <span className="material-symbols-outlined" data-icon="add_circle">add_circle</span> Add Project
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {formData.projects.map((project, index) => (
                  <div key={project.id} className="bg-surface-container-lowest p-6 rounded-lg group hover:shadow-md transition-all duration-300 relative flex flex-col gap-4">
                    <button 
                      onClick={() => {
                        setFormData(prev => prev ? {
                          ...prev,
                          projects: prev.projects.filter(p => p.id !== project.id)
                        } : null);
                      }}
                      className="absolute top-4 right-4 text-outline-variant hover:text-error opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <span className="material-symbols-outlined text-sm" data-icon="delete">delete</span>
                    </button>
                    
                    <div className="flex gap-4">
                      <div className="w-24 h-24 bg-surface-container rounded-lg overflow-hidden shrink-0 border border-outline-variant/20 flex items-center justify-center relative">
                        {project.imageUrl ? (
                          <img src={project.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="material-symbols-outlined text-outline-variant" data-icon="image">image</span>
                        )}
                        <input 
                          type="file"
                          accept="image/*"
                          ref={el => fileInputRefs.current[`projectImage_${project.id}`] = el}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleFileUpload(file, 'images', (url) => {
                                setFormData(prev => prev ? {
                                  ...prev,
                                  projects: prev.projects.map(p => p.id === project.id ? { ...p, imageUrl: url } : p)
                                } : null);
                              });
                            }
                          }}
                          className="hidden"
                        />
                        <div 
                          className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                          onClick={() => fileInputRefs.current[`projectImage_${project.id}`]?.click()}
                        >
                          {uploadProgress['images'] !== undefined ? (
                            <span className="text-white text-xs font-bold">{Math.round(uploadProgress['images'])}%</span>
                          ) : (
                            <span className="material-symbols-outlined text-white text-sm" data-icon="upload">upload</span>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <input 
                          value={project.title}
                          onChange={(e) => {
                            setFormData(prev => prev ? {
                              ...prev,
                              projects: prev.projects.map(p => p.id === project.id ? { ...p, title: e.target.value } : p)
                            } : null);
                          }}
                          className="w-full bg-transparent border-b border-outline-variant/30 p-1 font-headline font-bold text-primary focus:border-primary focus:ring-0 outline-none" 
                          type="text" 
                          placeholder="Project Title"
                        />
                        <input 
                          value={project.link}
                          onChange={(e) => {
                            setFormData(prev => prev ? {
                              ...prev,
                              projects: prev.projects.map(p => p.id === project.id ? { ...p, link: e.target.value } : p)
                            } : null);
                          }}
                          className="w-full bg-transparent border-b border-outline-variant/30 p-1 font-body text-xs text-secondary focus:border-primary focus:ring-0 outline-none" 
                          type="text" 
                          placeholder="Project Link (URL)"
                        />
                        <input 
                          value={project.imageUrl}
                          onChange={(e) => {
                            setFormData(prev => prev ? {
                              ...prev,
                              projects: prev.projects.map(p => p.id === project.id ? { ...p, imageUrl: e.target.value } : p)
                            } : null);
                          }}
                          className="w-full bg-transparent border-b border-outline-variant/30 p-1 font-body text-xs text-secondary focus:border-primary focus:ring-0 outline-none" 
                          type="text" 
                          placeholder="Image URL"
                        />
                      </div>
                    </div>
                    <textarea 
                      value={project.description}
                      onChange={(e) => {
                        setFormData(prev => prev ? {
                          ...prev,
                          projects: prev.projects.map(p => p.id === project.id ? { ...p, description: e.target.value } : p)
                        } : null);
                      }}
                      className="w-full bg-surface-container-low border-none rounded-lg p-4 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20 min-h-[100px]"
                      placeholder="Project Description"
                    />
                  </div>
                ))}
              </div>
            </motion.section>
          </motion.div>

          {/* Footer Meta */}
          <footer className="mt-20 py-8 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center text-secondary">
            <p className="font-body text-xs">© 2024 Virtual Curator. All rights reserved.</p>
            <div className="flex gap-8 mt-4 md:mt-0">
              <a className="font-body text-xs hover:text-primary transition-colors" href="#">Privacy Policy</a>
              <a className="font-body text-xs hover:text-primary transition-colors" href="#">Terms of Service</a>
              <a className="font-body text-xs hover:text-primary transition-colors" href="#">Contact Info</a>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}
