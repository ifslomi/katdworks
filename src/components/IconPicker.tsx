import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const COMMON_ICONS = [
  // Social & Brands Media Equivalents
  'public', 'language', 'alternate_email', 'mail', 'link', 'share', 'tag', 'chat', 'forum', 'rss_feed', 
  'smart_display', 'play_circle', 'play_arrow', 'photo_camera', 'camera_alt', 'video_camera_front',
  'music_note', 'podcasts', 'record_voice_over', 'spatial_tracking', 'cast', 'hub', 'connect_without_contact',
  'thumb_up', 'favorite', 'favorite_border', 'bookmark', 'bookmark_border', 'ios_share', 'send',
  
  // Work & Business
  'work', 'business_center', 'cases', 'domain', 'storefront', 'schedule', 'event', 'assignment',
  'badge', 'corporate_fare', 'gavel', 'handshake', 'meeting_room', 'work_history', 'engineering',
  'agriculture', 'construction', 'volunteer_activism', 'workspace_premium', 'rocket_launch',
  
  // Finance & E-commerce
  'payments', 'shopping_cart', 'store', 'sell', 'account_balance', 'trending_up', 'receipt_long',
  'credit_card', 'attach_money', 'savings', 'account_balance_wallet', 'price_check', 'query_stats',
  'loyalty', 'shopping_bag', 'local_mall', 'redeem',
  
  // Recognition, Education & Science
  'school', 'history_edu', 'verified', 'military_tech', 'emoji_events', 'star', 'star_border',
  'psychology', 'science', 'biotech', 'architecture', 'library_books', 'local_library', 'menu_book',
  
  // Design & Media
  'brush', 'palette', 'design_services', 'mic', 'headset', 'headphones', 'draw', 
  'auto_awesome_mosaic', 'color_lens', 'format_paint', 'imagesearch_roller', 'edit',
  
  // Technology & IT
  'computer', 'smartphone', 'dns', 'cloud', 'memory', 'keyboard', 'mouse', 'gamepad',
  'terminal', 'code', 'data_object', 'developer_mode', 'bug_report', 'api', 'webhook',
  'devices', 'laptop_mac', 'desktop_windows', 'watch', 'headphones_battery',
  
  // UI / Abstract / Helpers
  'home', 'settings', 'search', 'person', 'group', 'lightbulb', 'bolt', 'info', 'help',
  'apps', 'dashboard', 'grid_view', 'layers', 'extension', 'toggle_on', 'toggle_off',
  'check_circle', 'cancel', 'warning', 'error', 'add_circle', 'remove_circle',
  'notifications', 'notifications_active', 'flag', 'place', 'location_on', 'map',
  'menu', 'more_vert', 'more_horiz', 'arrow_forward', 'arrow_back', 'arrow_upward', 'arrow_downward'
];

interface IconPickerProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  label?: string;
}

export function IconPicker({ value, onChange, className = '', label = 'Choose Icon' }: IconPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredIcons = COMMON_ICONS.filter(i => i.includes(search.toLowerCase()));

  return (
    <div className={`relative ${className}`} ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-2 py-2 bg-surface border border-outline-variant/30 rounded-lg hover:border-primary/50 hover:bg-surface-container-low transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="flex-shrink-0 w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>{value || 'star'}</span>
          </div>
          <div className="flex flex-col items-start truncate text-left">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider leading-none">{label}</span>
            <span className="text-xs font-medium text-primary truncate leading-tight mt-0.5">{value || 'Select...'}</span>
          </div>
        </div>
        <span className="material-symbols-outlined text-outline text-sm">
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full left-0 right-0 mt-2 p-3 bg-surface rounded-2xl shadow-xl shadow-black/10 border border-outline-variant/30 max-h-[300px] flex flex-col"
          >
            <div className="relative mb-3 flex-shrink-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline text-sm">search</span>
              <input 
                type="text"
                placeholder="Search icons..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-lg pl-9 pr-3 py-2 text-sm text-primary focus:ring-2 focus:ring-primary/20 placeholder:text-outline"
              />
            </div>
            
            <div className="overflow-y-auto grid grid-cols-6 gap-2 pr-1 custom-scrollbar">
              {filteredIcons.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => {
                    onChange(icon);
                    setIsOpen(false);
                  }}
                  title={icon}
                  className={`aspect-square rounded-lg flex items-center justify-center transition-colors ${
                    value === icon 
                      ? 'bg-primary text-on-primary shadow-md' 
                      : 'hover:bg-secondary-container hover:text-on-secondary-container text-on-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '1.5rem' }}>{icon}</span>
                </button>
              ))}
              {filteredIcons.length === 0 && (
                <div className="col-span-6 text-center py-4 text-sm text-outline">
                  No icons found. <br/>
                  <button 
                    type="button" 
                    className="text-primary hover:underline mt-1 font-medium"
                    onClick={() => { onChange(search); setIsOpen(false); }}
                  >
                    Use "{search}" anyway
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
