import React from 'react';
import { MapPinOff, AlertCircle, RefreshCw, Construction } from 'lucide-react';
import { Button } from '@food/components/ui/button';
import { motion } from 'framer-motion';

const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 7) % 100}%`,
  delay: (i % 7) * 0.45,
  duration: 3.2 + (i % 5) * 0.6,
  size: 14 + (i % 4) * 6,
  glyph: ['✨', '🎆', '⭐', '🪔'][i % 4],
}));

const BURSTS = [
  { top: '8%', left: '12%', delay: 0, color: '#f59e0b' },
  { top: '14%', left: '82%', delay: 0.9, color: '#ef4444' },
  { top: '4%', left: '48%', delay: 1.7, color: '#ec4899' },
];

/** Admin-written closure message (e.g. Diwali) with a festive animation. Text is auto-translated by the app's i18n layer. */
function FestiveNotice({ notice, onRefresh }) {
  const festive = notice.theme !== 'none';
  const diwali = notice.theme !== 'festival';
  return (
    <div className="relative flex-1 flex flex-col items-center justify-center min-h-[60vh] px-6 py-10 text-center overflow-hidden">
      {festive && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {BURSTS.map((b, i) => (
            <div key={i} className="absolute" style={{ top: b.top, left: b.left }}>
              {Array.from({ length: 12 }).map((_, k) => (
                <motion.span
                  key={k}
                  className="absolute block w-1.5 h-1.5 rounded-full"
                  style={{ background: b.color }}
                  initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
                  animate={{
                    x: Math.cos((k / 12) * Math.PI * 2) * 46,
                    y: Math.sin((k / 12) * Math.PI * 2) * 46,
                    opacity: [0, 1, 0],
                    scale: [0, 1.2, 0],
                  }}
                  transition={{ duration: 1.6, delay: b.delay, repeat: Infinity, repeatDelay: 2.4, ease: 'easeOut' }}
                />
              ))}
            </div>
          ))}
          {SPARKS.map((s, i) => (
            <motion.span
              key={i}
              className="absolute bottom-0"
              style={{ left: s.left, fontSize: s.size }}
              initial={{ y: 0, opacity: 0 }}
              animate={{ y: -420, opacity: [0, 0.9, 0], rotate: [0, 20, -20, 0] }}
              transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, ease: 'easeOut' }}
            >
              {s.glyph}
            </motion.span>
          ))}
        </div>
      )}

      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotate: -10 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', damping: 10 }}
        className="relative z-10 w-32 h-32 rounded-full bg-gradient-to-br from-amber-100 to-orange-200 flex items-center justify-center mb-8 shadow-lg"
      >
        <motion.span
          className="text-6xl select-none"
          animate={{ scale: [1, 1.12, 1], filter: ['drop-shadow(0 0 6px #f59e0b)', 'drop-shadow(0 0 18px #f97316)', 'drop-shadow(0 0 6px #f59e0b)'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          {diwali ? '🪔' : '🎉'}
        </motion.span>
      </motion.div>

      {notice.title && (
        <motion.h2
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="relative z-10 text-3xl md:text-4xl font-black mb-3 tracking-tight bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 bg-clip-text text-transparent"
        >
          {notice.title}
        </motion.h2>
      )}

      {notice.message && (
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="relative z-10 text-gray-700 dark:text-gray-300 text-base md:text-lg max-w-sm mb-8 leading-relaxed font-medium whitespace-pre-line"
        >
          {notice.message}
        </motion.p>
      )}

      {onRefresh && (
        <motion.div className="relative z-10" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.45 }}>
          <Button onClick={onRefresh} variant="outline" className="rounded-xl px-6 h-12 font-bold shadow-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Check Again
          </Button>
        </motion.div>
      )}
    </div>
  );
}

export default function ServiceUnavailable({ type = "zone", moduleName = "", notice = null, onRefresh }) {
  if (notice && (notice.title || notice.message)) {
    return <FestiveNotice notice={notice} onRefresh={onRefresh} />;
  }

  // Unique taglines based on module and type
  const getMessage = () => {
    if (type === "module") {
      const name = moduleName.toLowerCase();
      if (name.includes('quick') || name.includes('mart')) {
        return {
          title: "Under Maintenance",
          desc: "SuperfastMart is currently under maintenance. We're making things better and will be back very soon. Thank you for your patience!",
          icon: <Construction className="w-16 h-16 text-orange-400" />
        };
      }
      return {
        title: "Currently Unavailable",
        desc: `${moduleName} is temporarily unavailable in your area. We're working hard to bring it to you soon.`,
        icon: <Construction className="w-16 h-16 text-orange-400" />
      };
    }

    // type === "zone"
    if (moduleName.toLowerCase().includes('food')) {
      return {
        title: "Coming Soon to Your Area!",
        desc: "We're expanding fast! Superfast Food delivery isn't available at your location yet — but we're on our way. Stay tuned!",
        icon: <MapPinOff className="w-16 h-16 text-red-500" />
      };
    }
    if (moduleName.toLowerCase().includes('quick') || moduleName.toLowerCase().includes('mart')) {
      return {
        title: "Coming Soon to Your Area!",
        desc: "SuperfastMart isn't live at your location just yet. We're expanding quickly — check back soon for 15-minute deliveries near you!",
        icon: <MapPinOff className="w-16 h-16 text-green-500" />
      };
    }

    return {
      title: "Coming Soon!",
      desc: "We're not in your area yet, but we're growing fast. Superfast will be with you very soon!",
      icon: <MapPinOff className="w-16 h-16 text-gray-400" />
    };
  };

  const content = getMessage();

  return (
    <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        transition={{ type: 'spring', damping: 15 }}
        className="w-32 h-32 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mb-8 shadow-inner"
      >
        {content.icon}
      </motion.div>
      
      <motion.h2 
        initial={{ y: 20, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }} 
        transition={{ delay: 0.1 }}
        className="text-2xl md:text-3xl font-black text-gray-900 dark:text-white mb-3 tracking-tight"
      >
        {content.title}
      </motion.h2>
      
      <motion.p 
        initial={{ y: 20, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }} 
        transition={{ delay: 0.2 }}
        className="text-gray-600 dark:text-gray-400 text-base md:text-lg max-w-sm mb-8 leading-relaxed font-medium"
      >
        {content.desc}
      </motion.p>

      {onRefresh && (
        <motion.div
          initial={{ y: 20, opacity: 0 }} 
          animate={{ y: 0, opacity: 1 }} 
          transition={{ delay: 0.3 }}
        >
          <Button 
            onClick={onRefresh}
            variant="outline" 
            className="rounded-xl px-6 h-12 font-bold shadow-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <RefreshCw className="w-4 h-4" />
            Check Again
          </Button>
        </motion.div>
      )}
    </div>
  );
}
