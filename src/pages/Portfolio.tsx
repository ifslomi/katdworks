import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase';
import { usePortfolioData, PortfolioData } from '../hooks/usePortfolioData';
import { uploadToLocal } from '../utils/localUpload';
import { IconPicker } from '../components/IconPicker';

export default function Portfolio() {
  const { data, loading, updateData, readError } = usePortfolioData();
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const [uploadProgress, setUploadProgress] = useState<{ [key: string]: number }>({});

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
    if (!auth.currentUser) {
      alert('Please log in before uploading files.');
      return;
    }
    setUploadProgress(prev => ({ ...prev, [key]: 0 }));
    try {
      const url = await uploadToLocal(file, path, (progress) => {
        setUploadProgress(prev => ({ ...prev, [key]: progress }));
      });
      onComplete(url);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : 'Upload failed. Please try again.');
    } finally {
      setUploadProgress(prev => { const n = {...prev}; delete n[key]; return n; });
    }
  };

  const InlineText = ({ value, onChange, className, multiline = false }: { value: string, onChange: (val: string) => void, className?: string, multiline?: boolean }) => {
    if (!isEditMode) return multiline ? <div className={`whitespace-pre-wrap ${className || ''}`}>{value}</div> : <span className={className}>{value}</span>;
    return multiline ? (
      <textarea value={value} onChange={(e) => onChange(e.target.value)} className={`bg-white/20 border border-white/50 rounded px-2 py-1 w-full min-h-[100px] ${className || ''}`} />
    ) : (
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={`bg-white/20 border border-white/50 rounded px-2 py-1 w-full ${className || ''}`} />
    );
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-surface text-primary">Loading...</div>;
  }

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

  return (
    <div className="font-body selection:bg-secondary-container selection:text-on-secondary-container relative overflow-x-hidden">
      {readError && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-error-container text-on-error-container px-4 py-2 text-xs text-center">
          Live content could not be loaded from Firestore. Showing fallback preview data.
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
        className={`origin-top-left transition-transform duration-300 ${isEditMode ? 'scale-[0.93]' : 'scale-100'}`}
        style={isEditMode ? { width: '107.53%' } : undefined}
      >

      {/* TopNavBar */}
      <motion.nav 
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="fixed top-4 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl rounded-full px-6 py-2 bg-[#faf9f6]/70 backdrop-blur-md flex justify-between items-center z-50 shadow-xl shadow-[#1a1c1a]/5"
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
        <div className="hidden md:flex gap-8 items-center">
          {data.ui.navLinks.map((item) => (
            <a key={item.id} className="text-secondary font-medium hover:text-primary transition-all duration-300 ease-in-out" href={item.href || '#'}>{item.label}</a>
          ))}
        </div>
        <Link to="/login" className="bg-primary text-on-primary px-6 py-2 rounded-lg font-label font-bold scale-95 hover:scale-100 active:scale-90 transition-transform">
          Login
        </Link>
      </motion.nav>

      {/* SideNavBar (Social) */}
      <aside className="fixed right-6 top-1/2 -translate-y-1/2 flex flex-col gap-4 z-40">
        <motion.div 
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
          className="hidden md:flex flex-col items-center gap-4"
        >
          <span className="font-label text-xs uppercase tracking-widest text-primary rotate-90 mb-8 origin-center">Connect</span>
          {data.ui.socialIcons.map((item) => (
            <a
              key={item.id}
              className="bg-surface-container text-primary rounded-full p-3 hover:bg-secondary hover:text-white transition-all duration-300 hover:translate-x-[-4px]"
              href={item.link || '#'}
              target={item.link && item.link !== '#' ? '_blank' : '_self'}
              rel="noopener noreferrer"
            >
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.icon || 'social'} className="w-6 h-6 rounded object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="material-symbols-outlined" data-icon={item.icon}>{item.icon}</span>
              )}
            </a>
          ))}
          {isEditMode && (
            <div className="mt-4 w-64 bg-white/80 rounded-lg p-3 space-y-2 border border-outline-variant/40 shadow-xl">
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
              <p className="text-[10px] text-on-surface-variant">You can keep icon text, or upload a logo image per social button.</p>
            </div>
          )}
        </motion.div>
      </aside>

      {/* Hero Section */}
      <section className="relative min-h-[100svh] flex items-center pt-28 pb-12 overflow-hidden bg-surface" id="hero">
        <div className="container mx-auto px-6 md:px-12 lg:px-20 grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="order-2 md:order-1"
          >
            <motion.span variants={fadeUp} className="inline-block px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container font-label text-xs font-bold mb-4 md:mb-6">
              Available for commissions worldwide
            </motion.span>
            <motion.h1 variants={fadeUp} className="font-headline text-4xl md:text-5xl lg:text-6xl font-black text-primary leading-tight mb-4 md:mb-6 -tracking-wider">
              <InlineText value={data.hero.headline} onChange={(val) => updateData({ hero: { ...data.hero, headline: val } })} />:<br />
              <InlineText value={data.hero.subheadline} onChange={(val) => updateData({ hero: { ...data.hero, subheadline: val } })} />
            </motion.h1>
            <motion.div variants={fadeUp} className="text-base text-on-surface-variant font-body max-w-lg mb-8 leading-relaxed">
              <InlineText multiline value={data.hero.description} onChange={(val) => updateData({ hero: { ...data.hero, description: val } })} />
            </motion.div>
            <motion.div variants={fadeUp} className="flex flex-wrap gap-3 md:gap-4">
              <a className="bg-primary text-on-primary px-6 py-3 rounded-lg font-bold text-sm hover:bg-secondary transition-colors duration-300 shadow-lg shadow-primary/10" href="#contact">Contact Me</a>
              <a 
                className="bg-surface-container-highest text-primary px-6 py-3 rounded-lg font-bold text-sm hover:bg-outline-variant transition-colors duration-300" 
                href={data.portfolioPdfUrl || "#"} 
                target={data.portfolioPdfUrl ? "_blank" : "_self"} 
                rel="noopener noreferrer" 
                download={!!data.portfolioPdfUrl}
                onClick={(e) => {
                  if (!data.portfolioPdfUrl) {
                    e.preventDefault();
                    alert("Portfolio PDF has not been uploaded yet.");
                  }
                }}
              >
                Download Portfolio
              </a>
            </motion.div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="order-1 md:order-2 relative w-full max-w-md mx-auto md:max-w-none"
          >
            <div className="aspect-square md:aspect-[4/5] max-h-[40vh] md:max-h-[60vh] rounded-xl overflow-hidden shadow-2xl z-10 relative group">
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

      {/* Skills - Bento Grid */}
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

      {/* Certifications */}
      <section className="py-16 md:py-24 bg-surface" id="certifications">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.h2 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12"
          >
            <InlineText value={data.ui.certificationsTitle} onChange={(val) => updateData({ ui: { ...data.ui, certificationsTitle: val } })} />
          </motion.h2>
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8"
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
                <div className={`aspect-[4/3] w-full flex items-center justify-center relative overflow-hidden ${cert.bgColor || 'bg-secondary-container text-on-secondary-container'}`}>
                  {cert.imageUrl ? (
                    <img src={cert.imageUrl} alt={cert.title} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="material-symbols-outlined text-6xl drop-shadow-md" data-icon={cert.iconName || 'workspace_premium'} style={{ fontVariationSettings: "'FILL' 1" }}>
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
                <div className="p-6 flex flex-col flex-1 bg-surface">
                  <h5 className="font-headline font-bold text-xl text-primary leading-tight mb-2">
                    <InlineText value={cert.title} onChange={(val) => {
                      const newCerts = [...data.certifications];
                      newCerts[i].title = val;
                      updateData({ certifications: newCerts });
                    }} />
                  </h5>
                  <p className="text-sm font-medium text-secondary mb-4">
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
              <motion.div variants={fadeUp} className="flex items-center justify-center col-span-1 md:col-span-3">
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

      {/* Projects Section */}
      <section className="py-16 md:py-24 bg-surface-container-low" id="projects">
        <div className="container mx-auto px-6 md:px-12 lg:px-20">
          <motion.h2 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="font-headline text-3xl md:text-4xl font-bold text-primary mb-8 md:mb-12"
          >
            <InlineText value={data.ui.sectionTitles.projects} onChange={(val) => updateData({ ui: { ...data.ui, sectionTitles: { ...data.ui.sectionTitles, projects: val } } })} />
          </motion.h2>
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12"
          >
            {(showAllProjects ? data.projects : data.projects.slice(0, 4)).map((project, index) => (
              <motion.div key={project.id} variants={fadeUp} className="group cursor-pointer relative">
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
                <div className="aspect-video rounded-xl overflow-hidden mb-4 md:mb-6 relative">
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
                <h3 className="font-headline text-xl md:text-2xl font-bold text-primary mb-2 group-hover:text-secondary transition-colors">
                  <InlineText value={project.title} onChange={(val) => {
                    const newProjects = [...data.projects];
                    const pIndex = newProjects.findIndex(p => p.id === project.id);
                    if (pIndex !== -1) {
                      newProjects[pIndex].title = val;
                      updateData({ projects: newProjects });
                    }
                  }} />
                </h3>
                <InlineText multiline value={project.description} className="text-on-surface-variant text-sm md:text-base leading-relaxed" onChange={(val) => {
                  const newProjects = [...data.projects];
                  const pIndex = newProjects.findIndex(p => p.id === project.id);
                  if (pIndex !== -1) {
                    newProjects[pIndex].description = val;
                    updateData({ projects: newProjects });
                  }
                }} />
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

      {/* Contact Me */}
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
              <p className="text-primary-fixed-dim mb-8 md:mb-12 text-base md:text-lg">Ready to reclaim your focus? Let's discuss how a tailored partnership can elevate your professional trajectory.</p>
              <div className="space-y-4 md:space-y-6">
                <div className="flex items-center gap-3 md:gap-4">
                  <span className="material-symbols-outlined text-secondary-fixed text-lg md:text-xl" data-icon="mail">mail</span>
                  <span className="font-medium text-sm md:text-base">curator@katrinadeleon.com</span>
                </div>
                <div className="flex items-center gap-3 md:gap-4">
                  <span className="material-symbols-outlined text-secondary-fixed text-lg md:text-xl" data-icon="call">call</span>
                  <span className="font-medium text-sm md:text-base">+1 (555) 924-1028</span>
                </div>
                <div className="flex items-center gap-3 md:gap-4">
                  <span className="material-symbols-outlined text-secondary-fixed text-lg md:text-xl" data-icon="location_on">location_on</span>
                  <span className="font-medium text-sm md:text-base">Worldwide (GMT-5 Base)</span>
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
  );
}
