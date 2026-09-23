import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { customerApi } from '../services/customerApi';
import { motion, AnimatePresence } from 'framer-motion';

const StoreCard = ({ store }) => {
    return (
        <div className="flex flex-col items-center group w-full cursor-pointer h-full">
            <div className="w-full aspect-square bg-[#F5F7FA] dark:bg-card rounded-[16px] md:rounded-[20px] shadow-sm flex items-center justify-center p-3 md:p-4 mb-2 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-md border border-transparent dark:border-border overflow-hidden relative">
                {store.image ? (
                    <img
                        src={store.image}
                        alt={store.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 rounded-[12px]"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300 dark:text-gray-600">
                        🏪
                    </div>
                )}
            </div>
            <span className="text-[12px] md:text-[14px] font-medium md:font-semibold text-foreground text-center leading-tight line-clamp-2 px-1 mt-1">
                {store.name}
            </span>
        </div>
    );
};

const StoresPage = () => {
    const [stores, setStores] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchStores = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await customerApi.getStores();
            if (res.data && res.data.success) {
                setStores(res.data.results || []);
            }
        } catch (error) {
            console.error("Error fetching stores:", error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStores();
    }, [fetchStores]);

    return (
        <div className="min-h-screen bg-background transition-colors duration-500">
            <div className="max-w-[1400px] mx-auto px-4 pt-6 md:pt-10 pb-20">
                <h1 className="text-[28px] md:text-[32px] font-bold text-slate-900 dark:text-white mb-6 tracking-tight">Stores</h1>
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
                    ) : stores.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-24 h-24 mb-4 text-gray-300">🏪</div>
                            <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400">No stores found</h2>
                            <p className="text-gray-500 mt-2">There are currently no active stores.</p>
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-x-3 gap-y-6 md:gap-x-4 md:gap-y-8"
                        >
                            {stores.map((store) => (
                                <Link
                                    key={store.id}
                                    to={`/quick/stores/${store.id}`}
                                    state={{ storeName: store.name }}
                                    className="block"
                                >
                                    <StoreCard store={store} />
                                </Link>
                            ))}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default StoresPage;
