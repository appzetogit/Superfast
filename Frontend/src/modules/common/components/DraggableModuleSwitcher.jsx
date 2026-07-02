import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowUpRight, ShoppingBag, UtensilsCrossed } from 'lucide-react';

const DraggableModuleSwitcher = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const pathname = location.pathname;

    let targetPath = "/food/user";
    let targetName = "SuperfastMart";
    let themeColor = "text-red-600";
    let bgColor = "bg-red-50";
    let icon = <UtensilsCrossed className="h-3 w-3" strokeWidth={2.6} />;

    if (pathname.startsWith('/food')) {
        targetPath = "/quick/user";
        targetName = "SuperfastMart";
        themeColor = "text-green-600";
        bgColor = "bg-green-50";
        icon = <ShoppingBag className="h-3 w-3" strokeWidth={2.6} />;
    } else if (pathname.startsWith('/quick')) {
        targetPath = "/food/user";
        targetName = "SuperfastMart";
        themeColor = "text-red-600";
        bgColor = "bg-red-50";
        icon = <UtensilsCrossed className="h-3 w-3" strokeWidth={2.6} />;
    }

    return (
        <motion.div
            drag
            dragMomentum={false}
            whileDrag={{ scale: 1.05 }}
            className="fixed z-[60] cursor-grab active:cursor-grabbing"
            style={{ bottom: '100px', left: '16px' }} 
        >
            <div 
                onClick={() => navigate(targetPath, { replace: true })}
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
