import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShoppingBag, UtensilsCrossed } from 'lucide-react';

const DraggableModuleSwitcher = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const pathname = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');

    // Accurately determine if Quick Commerce (SuperfastMart) is currently active
    const isQuickActive = pathname.startsWith('/quick') || (pathname.startsWith('/food') && tabParam === 'quick');

    // Define target based on CURRENT active view
    let targetPath = "/food/user?tab=quick";
    let targetName = "SuperfastMart";
    let themeColor = "text-green-600";
    let bgColor = "bg-green-50";
    let icon = <ShoppingBag className="h-3 w-3" strokeWidth={2.6} />;

    if (isQuickActive) {
        targetPath = "/food/user?tab=food";
        targetName = "SuperfastFood";
        themeColor = "text-red-600";
        bgColor = "bg-red-50";
        icon = <UtensilsCrossed className="h-3 w-3" strokeWidth={2.6} />;
    }

    const handleClick = (e) => {
        e.stopPropagation();
        if (pathname === '/food/user' || pathname === '/food/user/') {
            const targetTab = isQuickActive ? 'food' : 'quick';
            navigate({ search: `?tab=${targetTab}` }, { replace: true });
        } else {
            navigate(targetPath);
        }
    };

    return (
        <motion.div
            drag
            dragMomentum={false}
            whileDrag={{ scale: 1.05 }}
            className="fixed z-[60] cursor-grab active:cursor-grabbing"
            style={{ bottom: '100px', left: '16px' }} 
        >
            <div 
                onClick={handleClick}
                className="flex items-center gap-2 rounded-t-[16px] rounded-b-[8px] border border-gray-200 bg-white px-3 pb-2 pt-1.5 shadow-lg active:scale-95 transition-transform"
            >
                <div className="text-left leading-none">
                    <span className={`block text-[8px] font-black uppercase tracking-[0.15em] ${themeColor}`}>
                        Switch to {targetName}
                    </span>
                </div>
                <div className={`flex h-6 w-6 items-center justify-center rounded-[8px] ${bgColor} ${themeColor}`}>
                    {icon}
                </div>
            </div>
        </motion.div>
    );
};

export default DraggableModuleSwitcher;
