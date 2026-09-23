import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { customerApi } from '../services/customerApi';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = [
    "#FDF2F2", "#F2F9F2", "#F2F2FD", "#FDFDF2",
    "#F2FDFD", "#FDF2FD", "#FFF8F0", "#F0FFF8"
];

const CategoryCard = ({ category }) => {
    return (
        <div className="flex flex-col items-center group w-full cursor-pointer h-full">
            <div className="relative w-full aspect-[3/4] rounded-t-full rounded-b-[24px] bg-[#F5F7FA] dark:bg-card shadow-sm border border-slate-100 dark:border-border flex flex-col items-center justify-between p-1.5 md:p-2 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-md overflow-hidden">
                {/* Arch-shaped inner image frame with even space outside */}
                <div className="relative w-full h-[65%] rounded-t-full rounded-b-[14px] md:rounded-b-[18px] overflow-hidden shrink-0 flex items-center justify-center bg-white/60 dark:bg-white/10 shadow-inner">
                    {category.image ? (
                        <img
                            src={category.image}
                            alt={category.name}
                            className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500"
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center text-2xl font-black uppercase text-slate-400">
                            {(category.name || "?").charAt(0)}
                        </div>
                    )}
                </div>
                {/* Dedicated bottom title area without overlap */}
                <div className="relative w-full px-0.5 pb-0.5 text-center flex items-center justify-center min-h-[26px]">
                    <span className="block text-[11px] md:text-[13px] font-bold text-foreground leading-tight line-clamp-2 transition-colors group-hover:text-emerald-600">
                        {category.name}
                    </span>
                </div>
            </div>
        </div>
    );
};

const CategoriesPage = () => {
    const [groups, setGroups] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [flippedCategoryId, setFlippedCategoryId] = useState(null);

    const fetchCategories = useCallback(async () => {
        setIsLoading(true);
        try {
            // Force tree fetching
            const res = await customerApi.getCategories({ tree: true });
            if (res.data.success) {
                const results = res.data.results || res.data.result || [];

                const allCategories = Array.isArray(results) ? results : [];

                // 1. Identify Header Categories (Top-level parents)
                const headers = allCategories.filter(cat => !cat.parentId || (cat.children && cat.children.length > 0));

                const formattedGroups = headers
                    .filter((header) => (header.name || '').trim().toLowerCase() !== 'all')
                    .map((header, idx) => {
                        let subs = header.children && header.children.length > 0
                            ? header.children
                            : allCategories.filter(cat => cat.parentId === header._id);

                        if (subs.length === 0) return null;

                        return {
                            id: header._id || idx,
                            title: header.name,
                            categories: subs.map((cat, cIdx) => ({
                                id: cat._id || `${idx}-${cIdx}`,
                                name: cat.name,
                                image: cat.image || "https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/layout-engine/2022-11/Slice-1_9.png",
                                color: COLORS[(idx + cIdx) % COLORS.length]
                            }))
                        };
                    }).filter(Boolean);

                setGroups(formattedGroups);
            }
        } catch (error) {
            console.error("Error fetching categories:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCategories();
    }, [fetchCategories]);

    useEffect(() => {
        if (!groups.length) return;

        const allSubCategories = groups.flatMap(g => g.categories);
        if (!allSubCategories.length) return;

        const interval = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * allSubCategories.length);
            const targetId = allSubCategories[randomIndex].id;

            setFlippedCategoryId(targetId);

            setTimeout(() => {
                setFlippedCategoryId(null);
            }, 1500);

        }, 3000);

        return () => clearInterval(interval);
    }, [groups]);

    return (
        <div className="min-h-screen bg-background transition-colors duration-500">
            <div className="max-w-[1400px] mx-auto px-4 pt-6 md:pt-10 pb-20">
                <h1 className="text-[28px] md:text-[32px] font-bold text-slate-900 dark:text-white mb-6 tracking-tight">Categories</h1>
                <AnimatePresence mode='wait'>
                    {isLoading ? (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center justify-center h-64"
                        >
                            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </motion.div>
                    ) : (
                        <div className="space-y-6 md:space-y-8">
                            {groups.map((group, groupIdx) => (
                                <motion.section
                                    key={group.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ delay: groupIdx * 0.1 }}
                                    className="space-y-6"
                                >
                                    <div className="mb-2 md:mb-4 pt-2">
                                        <h2 className="text-[22px] md:text-[24px] font-bold text-foreground capitalize transition-colors">
                                            {group.title}
                                        </h2>
                                    </div>

                                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-x-3 gap-y-6 md:gap-x-4 md:gap-y-8">
                                        {group.categories.map((category) => (
                                            <Link
                                                key={category.id}
                                                to={`/quick/categories/${category.id}`}
                                                state={{ categoryName: category.name }}
                                                className="block"
                                            >
                                                <CategoryCard
                                                    category={category}
                                                    isFlipped={flippedCategoryId === category.id}
                                                />
                                            </Link>
                                        ))}
                                    </div>
                                </motion.section>
                            ))}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default CategoriesPage;
