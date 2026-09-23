import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

import ProductCard from '../components/shared/ProductCard';
import ProductDetailSheet from '../components/shared/ProductDetailSheet';
import { useProductDetail } from '../context/ProductDetailContext';
import { customerApi } from '../services/customerApi';
import MiniCart from '../components/shared/MiniCart';
import { useLocation as useAppLocation } from '../context/LocationContext';

const StoreProductsPage = () => {
    const { storeId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { currentLocation } = useAppLocation();
    const { isOpen: isProductDetailOpen } = useProductDetail();
    
    const [store, setStore] = useState(null);
    const [products, setProducts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = async () => {
        setIsLoading(true);

        try {
            // Fetch Store Details
            const storeRes = await customerApi.getStoreDetails(storeId);
            if (storeRes?.data?.success) {
                setStore(storeRes.data.result);
            }

            // Fetch Products for this store
            const prodRes = await customerApi.getProducts({ storeId });
            if (prodRes?.data?.success) {
                const rawResult = prodRes.data.result;
                const dbProds = Array.isArray(prodRes.data.results)
                    ? prodRes.data.results
                    : Array.isArray(rawResult?.items)
                        ? rawResult.items
                        : Array.isArray(rawResult)
                            ? rawResult
                            : [];

                const formattedProds = dbProds.map(p => ({
                    ...p,
                    id: p._id,
                    image: p.mainImage || p.image,
                    price: p.salePrice || p.price,
                    originalPrice: p.price,
                    weight: p.weight || "1 unit",
                    deliveryTime: "8-15 mins"
                }));
                setProducts(formattedProds);
            }
        } catch (error) {
            console.error("Error fetching store products:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [storeId, currentLocation?.latitude, currentLocation?.longitude]);

    const safeProducts = Array.isArray(products) ? products : [];

    return (
        <div className="flex min-h-screen flex-col bg-white dark:bg-background font-sans pt-0 transition-colors duration-500">
            <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col">
                {/* Store Header */}
                <header className={cn(
                    "sticky top-0 z-30 px-4 py-4 flex items-center justify-between border-b border-gray-100 dark:border-border shadow-sm backdrop-blur-md bg-white/90 dark:bg-card/90",
                    isProductDetailOpen && "hidden md:flex"
                )}>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-white/10 rounded-full transition-colors"
                        >
                            <ChevronLeft size={24} className="text-foreground" />
                        </button>
                        <div className="flex items-center gap-3">
                            {store?.image ? (
                                <img src={store.image} alt={store.name} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                            ) : (
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-xl">🏪</div>
                            )}
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                                    Store Products
                                </span>
                                <h1 className="text-[18px] font-bold text-foreground tracking-tight">
                                    {store?.name || location.state?.storeName || 'Store'}
                                </h1>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex flex-1 relative items-start">
                    <main className="flex-1 px-4 pt-6 pb-24 bg-white dark:bg-background transition-colors w-full">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-3 gap-y-6 md:gap-4 lg:gap-6">
                            {isLoading ? (
                                Array.from({ length: 12 }).map((_, i) => (
                                    <div key={i} className="animate-pulse bg-gray-100 dark:bg-white/5 rounded-2xl aspect-[3/4] w-full border border-gray-200/50 dark:border-white/10"></div>
                                ))
                            ) : (
                                safeProducts.map((product) => (
                                    <ProductCard key={product.id} product={product} compact={true} />
                                ))
                            )}
                            {safeProducts.length === 0 && !isLoading && (
                                <div className="col-span-full py-20 text-center">
                                    <p className="text-gray-400 font-bold italic">No products found for this store</p>
                                </div>
                            )}
                        </div>
                    </main>
                </div>

                <MiniCart />
                <ProductDetailSheet />
            </div>
        </div>
    );
};

export default StoreProductsPage;
