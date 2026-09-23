import quickBg from '../assets/Catagorysection_bg.webp';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { resolveQuickImageUrl } from '../utils/image';
import { useState } from 'react';
import { getQuickProductsPath } from '../utils/routes';

const categoryPalettes = [
  { from: "#F0FDF4", to: "#DCFCE7", border: "rgba(12,131,31,0.1)" }, // Green
  { from: "#EFF6FF", to: "#DBEAFE", border: "rgba(37,99,235,0.1)" }, // Blue
  { from: "#FEFCE8", to: "#FEF9C3", border: "rgba(202,138,4,0.1)" }, // Yellow
  { from: "#FFF7ED", to: "#FFEDD5", border: "rgba(234,88,12,0.1)" }, // Orange
  { from: "#FAF5FF", to: "#F3E8FF", border: "rgba(147,51,234,0.1)" }, // Purple
  { from: "#FFF1F2", to: "#FFE4E6", border: "rgba(225,29,72,0.1)" }, // Rose
];

function CategoryTileImage({ name, image }) {
  const [broken, setBroken] = useState(false);
  const candidate =
    image?.url ||
    image?.src ||
    image?.image ||
    image?.thumbnail ||
    image ||
    "";
  const src = resolveQuickImageUrl(candidate);
  const showFallback = !src || broken;

  if (showFallback) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-[32px] bg-white/40 text-xl font-black uppercase text-slate-300">
        {(name || '?').charAt(0)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-110"
      onError={() => setBroken(true)}
    />
  );
}

export default function QuickCategories({ categories = [] }) {
  const navigate = useNavigate();

  return (
    <section 
      className="mt-16 overflow-hidden rounded-[60px] border border-white/60 dark:border-white/10 bg-white/40 dark:bg-card/40 backdrop-blur-2xl shadow-[0_30px_70px_-20px_rgba(0,0,0,0.06)] relative transition-all duration-500"
    >
      {/* Decorative Blur Background */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-50 dark:bg-emerald-900/20 rounded-full blur-[80px] -mr-32 -mt-32 opacity-60" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-50 dark:bg-amber-900/20 rounded-full blur-[80px] -ml-32 -mb-32 opacity-40" />

      <div className="relative z-10 p-10 md:p-14">
        <div className="mb-12 flex items-end justify-between px-2">
          <div className="flex flex-col gap-1">
            <h2 className="text-[32px] font-black tracking-tight text-[#111827] dark:text-white md:text-[42px] font-outfit uppercase">
               Shop by <span className="text-[#0c831f]">Category</span>
            </h2>
            <p className="text-base font-semibold text-slate-400 dark:text-slate-500">Discover our meticulously curated selections.</p>
          </div>
          <div className="h-px flex-1 mx-12 bg-slate-100 dark:bg-slate-800 hidden lg:block" />
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
          {categories.map((cat, idx) => {
            const palette = categoryPalettes[idx % categoryPalettes.length];
            return (
              <motion.button
                key={cat.id || cat._id}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.02 }}
                whileHover={{ y: -8 }}
                onClick={() =>
                  navigate(
                    `${getQuickProductsPath()}?categoryId=${cat.id || cat._id}`,
                  )
                }
                className="group flex flex-col items-center focus:outline-none w-full"
              >
                <div 
                  className="relative flex flex-col items-center justify-between aspect-[3/4] w-full rounded-t-full rounded-b-[24px] p-1.5 md:p-2 shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-md border border-white dark:border-white/10 overflow-hidden"
                  style={{ 
                    background: `linear-gradient(135deg, ${palette.from}, ${palette.to})`,
                  }}
                >
                  {/* Arch-shaped inner image frame with even space outside */}
                  <div className="relative w-full h-[65%] rounded-t-full rounded-b-[14px] md:rounded-b-[18px] overflow-hidden shrink-0 flex items-center justify-center bg-white/60 dark:bg-white/10 shadow-inner">
                    <CategoryTileImage name={cat.name} image={cat.image} />
                  </div>
                  {/* Dedicated bottom title area without overlap */}
                  <div className="relative w-full px-0.5 pb-0.5 text-center flex items-center justify-center min-h-[24px]">
                    <span className="block text-[11px] md:text-[12px] font-bold text-slate-800 dark:text-slate-200 leading-tight line-clamp-2 uppercase tracking-wide group-hover:text-[#0c831f] transition-colors">
                      {cat.name}
                    </span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
