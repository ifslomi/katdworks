import re

html_str = """
<div class="editorial-grid min-h-screen">
<!-- Sidebar Navigation -->
<aside class="bg-surface-container border-r border-outline-variant/10 flex flex-col h-screen sticky top-0 p-8 overflow-y-auto">
<div class="mb-12">
<h1 class="font-headline font-black text-2xl text-primary tracking-tighter">Virtual Curator</h1>
<p class="font-body text-[10px] uppercase tracking-[0.2em] text-secondary mt-1">Admin Control Suite</p>
</div>
<nav class="flex-1 flex flex-col gap-2">
<a class="flex items-center gap-4 p-3 bg-primary text-on-primary rounded-lg transition-all duration-300" href="#">
<span class="material-symbols-outlined" data-icon="edit_note">edit_note</span>
<span class="font-body font-semibold text-sm">Content Editor</span>
</a>
<a class="flex items-center gap-4 p-3 text-secondary hover:bg-surface-container-high rounded-lg transition-all duration-300" href="#">
<span class="material-symbols-outlined" data-icon="analytics">analytics</span>
<span class="font-body font-medium text-sm">Analytics</span>
</a>
<a class="flex items-center gap-4 p-3 text-secondary hover:bg-surface-container-high rounded-lg transition-all duration-300" href="#">
<span class="material-symbols-outlined" data-icon="settings">settings</span>
<span class="font-body font-medium text-sm">Settings</span>
</a>
</nav>
<div class="mt-auto pt-8 border-t border-outline-variant/20">
<div class="flex flex-col gap-4">
<div class="flex items-center gap-3">
<div class="w-10 h-10 rounded-full bg-secondary-container flex items-center justify-center">
<span class="font-headline font-bold text-on-secondary-container">KD</span>
</div>
<div class="overflow-hidden">
<p class="text-xs font-bold text-primary truncate">deleonkatrina13@gmail.com</p>
<p class="text-[10px] text-secondary">Administrator</p>
</div>
</div>
<button class="flex items-center gap-2 text-secondary hover:text-primary transition-colors text-xs font-bold uppercase tracking-widest px-1">
<span class="material-symbols-outlined text-sm" data-icon="logout">logout</span>
                    Logout
                </button>
</div>
</div>
</aside>
<!-- Main Workspace -->
<main class="p-6 md:p-12 overflow-x-hidden w-full">
<!-- Header Section -->
<header class="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-16">
<div>
<h2 class="font-headline text-4xl md:text-5xl font-black text-primary -ml-1 tracking-tight">Content Editor</h2>
<p class="font-body text-secondary mt-2 max-w-md">Update your digital atelier's presence. Every change reflects your professional standard.</p>
</div>
<div class="flex gap-4 w-full md:w-auto">
<button class="flex-1 md:flex-none px-6 py-2 rounded-lg bg-surface-container-highest text-primary font-bold text-sm hover:bg-secondary transition-all duration-300 hover:text-white">
                    Preview Site
                </button>
<button class="flex-1 md:flex-none px-6 py-2 rounded-lg bg-primary text-on-primary font-bold text-sm shadow-xl shadow-primary/10 active:scale-95 transition-all">
                    Publish Changes
                </button>
</div>
</header>
<div class="grid grid-cols-12 gap-8">
<!-- Left Column: Editorial Sections -->
<div class="col-span-12 lg:col-span-8 space-y-4">
<!-- 1. Branding & Navigation -->
<details class="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden" open>
<summary class="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
<div class="flex items-center gap-4">
<span class="material-symbols-outlined text-secondary" data-icon="branding_watermark">branding_watermark</span>
<h3 class="font-headline font-bold text-lg text-primary">Branding &amp; Navigation</h3>
</div>
<span class="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
</summary>
<div class="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 space-y-6">
<div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Navigation Title</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary focus:ring-2 focus:ring-secondary/20" type="text" defaultValue="Virtual Curator"/>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Navigation Logo</label>
<div class="flex items-center gap-4 bg-surface-container-low p-3 rounded-lg border-2 border-dashed border-outline-variant/30">
<span class="material-symbols-outlined text-secondary" data-icon="upload_file">upload_file</span>
<span class="text-xs text-secondary">Upload Logo (.svg, .png)</span>
</div>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Footer Title</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary focus:ring-2 focus:ring-secondary/20" type="text" defaultValue="Virtual Curator"/>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Footer Logo</label>
<div class="flex items-center gap-4 bg-surface-container-low p-3 rounded-lg border-2 border-dashed border-outline-variant/30">
<span class="material-symbols-outlined text-secondary" data-icon="upload_file">upload_file</span>
<span class="text-xs text-secondary">Upload Logo (.svg, .png)</span>
</div>
</div>
</div>
</div>
</details>
<!-- 2. Section Headings -->
<details class="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
<summary class="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
<div class="flex items-center gap-4">
<span class="material-symbols-outlined text-secondary" data-icon="label">label</span>
<h3 class="font-headline font-bold text-lg text-primary">Section Headings</h3>
</div>
<span class="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
</summary>
<div class="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
<div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">About Heading</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" defaultValue="About"/>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Experience Heading</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" defaultValue="Experience"/>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Skills Heading</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" defaultValue="Skills"/>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Projects Heading</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" defaultValue="Projects"/>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Contact Heading</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" defaultValue="Contact"/>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Certifications Heading</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" defaultValue="Certifications"/>
</div>
</div>
</div>
</details>
<!-- 3. Hero & Identity -->
<details class="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
<summary class="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
<div class="flex items-center gap-4">
<span class="material-symbols-outlined text-secondary" data-icon="auto_awesome">auto_awesome</span>
<h3 class="font-headline font-bold text-lg text-primary">Hero &amp; Identity</h3>
</div>
<span class="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
</summary>
<div class="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 space-y-6">
<div class="mt-6">
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Portfolio Headline</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-4 font-headline text-2xl text-primary focus:ring-2 focus:ring-secondary/20" type="text" defaultValue="Architecting Order, Mastering Time."/>
</div>
<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Sub-headline</label>
<input class="w-full bg-surface-container-low border-none rounded-lg p-3 text-sm text-primary" type="text" defaultValue="Elite Virtual Assistant"/>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Portfolio PDF</label>
<div class="flex items-center justify-between bg-surface-container-low p-3 rounded-lg border border-outline-variant/30">
<span class="text-xs text-primary font-medium">portfolio_2024.pdf</span>
<button class="text-[10px] font-bold text-secondary hover:text-primary underline">Replace</button>
</div>
</div>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Description</label>
<textarea class="w-full bg-surface-container-low border-none rounded-lg p-4 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20" rows="3" defaultValue="A high-end Virtual Assistant dedicated to elite professionals. I don't just manage tasks; I curate your legacy."></textarea>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Profile Visual</label>
<div class="flex items-center gap-6 p-4 bg-primary/5 border border-primary/10 rounded-xl">
<div class="w-20 h-20 rounded bg-primary/10 flex items-center justify-center border border-outline-variant/20">
<span class="material-symbols-outlined text-primary/40 text-3xl" data-icon="image">image</span>
</div>
<div class="flex flex-col gap-2">
<div class="flex gap-2">
<button class="px-4 py-1.5 bg-primary text-on-primary text-[10px] font-bold rounded uppercase tracking-wider">Change</button>
<button class="px-4 py-1.5 bg-white border border-error/20 text-error text-[10px] font-bold rounded uppercase tracking-wider hover:bg-error/5">Delete</button>
</div>
<p class="text-[10px] text-secondary">Recommended: 1200x1500px high-contrast portrait.</p>
</div>
</div>
</div>
</div>
</details>
<!-- 4. About & Philosophy -->
<details class="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
<summary class="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
<div class="flex items-center gap-4">
<span class="material-symbols-outlined text-secondary" data-icon="history_edu">history_edu</span>
<h3 class="font-headline font-bold text-lg text-primary">About &amp; Philosophy</h3>
</div>
<span class="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
</summary>
<div class="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50 space-y-6">
<div class="mt-6">
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Philosophy Quote</label>
<textarea class="w-full bg-surface-container-low border-none rounded-lg p-4 font-headline italic text-primary focus:ring-2 focus:ring-secondary/20" rows="2" defaultValue="&quot;The height of sophistication is simplicity, managed with invisible precision.&quot;"></textarea>
</div>
<div>
<div class="flex justify-between items-center mb-2">
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary">Biography Paragraphs</label>
<button class="text-[10px] font-bold text-primary flex items-center gap-1 hover:underline">
<span class="material-symbols-outlined text-sm" data-icon="add">add</span> Add Paragraph
                                </button>
</div>
<div class="space-y-3">
<div class="relative">
<textarea class="w-full bg-surface-container-low border-none rounded-lg p-4 font-body text-sm text-on-surface-variant focus:ring-2 focus:ring-secondary/20" rows="3" defaultValue="With over a decade of experience serving as the right hand to global leaders, I have developed a methodology that transcends traditional assistance. My approach is rooted in anticipation."></textarea>
<button class="absolute top-2 right-2 text-secondary hover:text-error transition-colors">
<span class="material-symbols-outlined text-sm" data-icon="close">close</span>
</button>
</div>
</div>
</div>
</div>
</details>
<!-- 5. Experience -->
<details class="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
<summary class="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
<div class="flex items-center gap-4">
<span class="material-symbols-outlined text-secondary" data-icon="work">work</span>
<h3 class="font-headline font-bold text-lg text-primary">Experience</h3>
</div>
<span class="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
</summary>
<div class="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
<div class="mt-6 space-y-4">
<div class="bg-surface-container-low p-4 rounded-lg flex gap-4">
<div class="flex-1 space-y-2">
<input class="w-full bg-white border-none rounded p-2 font-bold text-sm text-primary" type="text" defaultValue="Executive Curator"/>
<input class="w-full bg-white border-none rounded p-2 text-xs text-secondary" type="text" defaultValue="Private Client Office • 2021-Present"/>
<textarea class="w-full bg-white border-none rounded p-2 text-xs text-on-surface-variant" rows="2" defaultValue="Managing intricate scheduling and global logistics for Fortune 500 executives."></textarea>
</div>
<div class="flex flex-col justify-between items-center">
<button class="text-secondary hover:text-error"><span class="material-symbols-outlined" data-icon="delete">delete</span></button>
<button class="text-secondary cursor-grab"><span class="material-symbols-outlined" data-icon="drag_handle">drag_handle</span></button>
</div>
</div>
<button class="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                                + Add Experience Item
                            </button>
</div>
</div>
</details>
<!-- 6. Key Expertise Tags -->
<details class="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
<summary class="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
<div class="flex items-center gap-4">
<span class="material-symbols-outlined text-secondary" data-icon="verified">verified</span>
<h3 class="font-headline font-bold text-lg text-primary">Key Expertise</h3>
</div>
<span class="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
</summary>
<div class="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
<div class="mt-6 flex flex-wrap gap-2">
<span class="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold flex items-center gap-2">
                                Crisis Management <span class="material-symbols-outlined text-[14px] cursor-pointer" data-icon="close">close</span>
</span>
<span class="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold flex items-center gap-2">
                                Luxury Travel <span class="material-symbols-outlined text-[14px] cursor-pointer" data-icon="close">close</span>
</span>
<span class="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold flex items-center gap-2">
                                System Design <span class="material-symbols-outlined text-[14px] cursor-pointer" data-icon="close">close</span>
</span>
<span class="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold flex items-center gap-2">
                                Global Logistics <span class="material-symbols-outlined text-[14px] cursor-pointer" data-icon="close">close</span>
</span>
<span class="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold flex items-center gap-2">
                                Digital Discretion <span class="material-symbols-outlined text-[14px] cursor-pointer" data-icon="close">close</span>
</span>
<span class="px-3 py-1 bg-secondary-container text-on-secondary-container rounded-full text-xs font-bold flex items-center gap-2">
                                Art Curation <span class="material-symbols-outlined text-[14px] cursor-pointer" data-icon="close">close</span>
</span>
<button class="px-3 py-1 border-2 border-dashed border-outline-variant text-secondary rounded-full text-xs font-bold hover:border-secondary transition-all">
                                + Add Skill
                            </button>
</div>
</div>
</details>
<!-- 7. Certifications -->
<details class="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
<summary class="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
<div class="flex items-center gap-4">
<span class="material-symbols-outlined text-secondary" data-icon="workspace_premium">workspace_premium</span>
<h3 class="font-headline font-bold text-lg text-primary">Certifications</h3>
</div>
<span class="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
</summary>
<div class="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
<div class="mt-6 space-y-6">
<!-- Cert Item 1 -->
<div class="bg-surface-container-low p-6 rounded-lg space-y-4 relative">
<button class="absolute top-4 right-4 text-secondary hover:text-error">
<span class="material-symbols-outlined" data-icon="delete">delete</span>
</button>
<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Certification Name</label>
<input class="w-full bg-white border-none rounded p-3 text-sm text-primary" type="text" defaultValue="Certified Executive Assistant (CEA)"/>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Background Color Theme</label>
<select class="w-full bg-white border-none rounded p-3 text-sm text-primary">
<option>Soft Gold &amp; Brown</option>
<option>Slate &amp; Dark</option>
<option>Warm Mocha</option>
</select>
</div>
</div>
<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Icon Picker</label>
<div class="flex items-center gap-3 bg-white p-2 rounded">
<span class="material-symbols-outlined p-2 bg-primary/10 rounded" data-icon="verified">verified</span>
<span class="text-xs text-secondary">verified (Material Icon)</span>
<button class="ml-auto text-[10px] font-bold text-primary underline">Change</button>
</div>
</div>
<div>
<label class="block font-body text-[10px] uppercase tracking-widest text-secondary mb-2">Certificate Image Upload</label>
<div class="flex items-center justify-between bg-white p-2 rounded">
<span class="text-[10px] text-primary truncate px-2">cea_cert_verified.png</span>
<button class="text-[10px] font-bold text-secondary underline">Replace</button>
</div>
</div>
</div>
</div>
<button class="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                                + Add New Certification
                            </button>
</div>
</div>
</details>
<!-- 8. Expertise Cards -->
<details class="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
<summary class="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
<div class="flex items-center gap-4">
<span class="material-symbols-outlined text-secondary" data-icon="grid_view">grid_view</span>
<h3 class="font-headline font-bold text-lg text-primary">Expertise Cards</h3>
</div>
<span class="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
</summary>
<div class="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
<div class="mt-6 space-y-4">
<div class="bg-surface-container-low p-4 rounded-lg flex items-center gap-4">
<div class="w-12 h-12 bg-white rounded flex items-center justify-center">
<span class="material-symbols-outlined text-primary" data-icon="calendar_month">calendar_month</span>
</div>
<div class="flex-1">
<p class="text-sm font-bold text-primary">Strategic Scheduling</p>
<p class="text-[10px] text-secondary">Icon: calendar_month</p>
</div>
<button class="text-secondary hover:text-primary"><span class="material-symbols-outlined" data-icon="edit">edit</span></button>
<button class="text-secondary hover:text-error"><span class="material-symbols-outlined" data-icon="delete">delete</span></button>
</div>
<button class="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                                + Add Expertise Card
                            </button>
</div>
</div>
</details>
<!-- 9. Featured Projects -->
<details class="group bg-white rounded-xl border border-outline-variant/10 overflow-hidden">
<summary class="flex items-center justify-between p-6 cursor-pointer hover:bg-surface-container-low transition-colors">
<div class="flex items-center gap-4">
<span class="material-symbols-outlined text-secondary" data-icon="folder_special">folder_special</span>
<h3 class="font-headline font-bold text-lg text-primary">Featured Projects</h3>
</div>
<span class="material-symbols-outlined transition-transform group-open:rotate-180" data-icon="expand_more">expand_more</span>
</summary>
<div class="p-6 pt-0 border-t border-outline-variant/10 bg-surface-container-lowest/50">
<div class="mt-6 space-y-6">
<div class="bg-white border border-outline-variant/20 p-4 rounded-xl flex gap-4">
<div class="w-24 h-24 bg-surface-container-low rounded-lg overflow-hidden border border-outline-variant/10">
<!-- Project Image Placeholder -->
<div class="w-full h-full flex items-center justify-center text-outline-variant">
<span class="material-symbols-outlined" data-icon="image">image</span>
</div>
</div>
<div class="flex-1 space-y-2">
<input class="w-full bg-surface-container-low border-none rounded p-2 font-bold text-sm text-primary" type="text" defaultValue="Digital Sanctuary Revamp"/>
<textarea class="w-full bg-surface-container-low border-none rounded p-2 text-xs text-on-surface-variant" rows="2" defaultValue="End-to-end digital organization for a high-profile creative studio."></textarea>
</div>
<div class="flex flex-col justify-between">
<button class="text-secondary hover:text-error"><span class="material-symbols-outlined" data-icon="delete">delete</span></button>
<button class="text-secondary hover:text-primary"><span class="material-symbols-outlined" data-icon="upload">upload</span></button>
</div>
</div>
<button class="w-full py-4 border-2 border-dashed border-outline-variant/50 rounded-lg text-secondary font-bold text-sm hover:border-secondary hover:text-primary transition-all">
                                + Add New Project
                            </button>
</div>
</div>
</details>
</div>
<!-- Right Column: Quick Reference Panel -->
<div class="col-span-12 lg:col-span-4">
<div class="sticky top-12 space-y-6">
<div class="bg-primary text-white p-8 rounded-xl relative overflow-hidden">
<div class="relative z-10">
<h4 class="font-headline text-xl font-bold mb-6">Editor Insights</h4>
<div class="space-y-4">
<div class="flex justify-between items-center border-b border-white/10 pb-2">
<span class="text-xs text-white/70 font-medium">Total Expertise Cards</span>
<span class="font-headline font-bold text-lg">4</span>
</div>
<div class="flex justify-between items-center border-b border-white/10 pb-2">
<span class="text-xs text-white/70 font-medium">Total Certifications</span>
<span class="font-headline font-bold text-lg">3</span>
</div>
<div class="flex justify-between items-center border-b border-white/10 pb-2">
<span class="text-xs text-white/70 font-medium">Total Projects</span>
<span class="font-headline font-bold text-lg">2</span>
</div>
<div class="flex justify-between items-center">
<span class="text-xs text-white/70 font-medium">Total Skills</span>
<span class="font-headline font-bold text-lg">6</span>
</div>
</div>
</div>
<div class="absolute -right-6 -bottom-6 opacity-10">
<span class="material-symbols-outlined !text-[120px]" data-icon="analytics">analytics</span>
</div>
</div>
<div class="bg-secondary-container p-6 rounded-xl border border-secondary/10">
<h4 class="font-body font-bold text-on-secondary-container text-xs uppercase tracking-widest mb-4">Live Status</h4>
<div class="flex items-center gap-3 bg-white/40 p-4 rounded-lg">
<div class="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
<span class="text-sm font-bold text-secondary">Site is currently active</span>
</div>
<p class="mt-4 text-[10px] text-secondary-fixed-variant/70 leading-relaxed italic">
                            "Every curation is a statement of intent. Ensure your public facing persona matches your operational excellence."
                        </p>
</div>
<div class="bg-white p-6 rounded-xl border border-outline-variant/20 shadow-sm">
<h4 class="font-body font-bold text-primary text-xs uppercase tracking-widest mb-4">Help &amp; Support</h4>
<ul class="space-y-3">
<li class="flex items-center gap-2 text-xs text-secondary hover:text-primary cursor-pointer transition-colors">
<span class="material-symbols-outlined text-sm" data-icon="menu_book">menu_book</span> User Guide
                            </li>
<li class="flex items-center gap-2 text-xs text-secondary hover:text-primary cursor-pointer transition-colors">
<span class="material-symbols-outlined text-sm" data-icon="support_agent">support_agent</span> Priority Support
                            </li>
</ul>
</div>
</div>
</div>
</div>
<!-- Footer Meta -->
<footer class="mt-24 py-8 border-t border-outline-variant/10 flex flex-col md:flex-row justify-between items-center text-secondary">
<p class="font-body text-[10px] uppercase tracking-widest">© 2024 Virtual Curator. All rights reserved.</p>
<div class="flex gap-8 mt-4 md:mt-0">
<a class="font-body text-[10px] uppercase tracking-widest hover:text-primary transition-colors" href="#">Privacy Policy</a>
<a class="font-body text-[10px] uppercase tracking-widest hover:text-primary transition-colors" href="#">Terms of Service</a>
<a class="font-body text-[10px] uppercase tracking-widest hover:text-primary transition-colors" href="#">Contact Info</a>
</div>
</footer>
</main>
</div>
"""

jsx_str = html_str.replace('class=', 'className=').replace('open=""', 'open={true}').replace('open>', 'open>')

react_component = f"""import React, {{ useState }} from 'react';
import {{ Link }} from 'react-router-dom';

export default function Dashboard() {{
  return (
    {jsx_str}
  );
}}
"""

with open('src/pages/Dashboard.tsx', 'w') as f:
    f.write(react_component)
