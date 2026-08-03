import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    ClipboardList,
    Box,
    Wallet,
    MoreHorizontal,
    ChevronDown,
    X
} from 'lucide-react';

import { useAuth } from '@/core/context/AuthContext';

const BottomNav = ({ navItems }) => {
    const { role } = useAuth();
    const location = useLocation();

    // Define the primary bottom nav items based on user role
    const primaryItems = role === 'admin' ? [
        { label: 'Dashboard', path: '/admin', icon: LayoutDashboard, end: true },
        { label: 'Orders', path: '/admin/orders/all', icon: ClipboardList },
        { label: 'Products', path: '/admin/products', icon: Box },
        { label: 'Wallet', path: '/admin/wallet', icon: Wallet },
    ] : [
        { label: 'Dashboard', path: '/seller', icon: LayoutDashboard, end: true },
        { label: 'Orders', path: '/seller/orders', icon: ClipboardList },
        { label: 'Products', path: '/seller/products', icon: Box },
        { label: 'Earnings', path: '/seller/earnings', icon: Wallet },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[60] md:hidden px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex w-full max-w-md items-end gap-2 mt-2">
                <div className="flex-1 min-w-0">
                    <div className="relative overflow-visible rounded-[30px] bg-[#0a0c10] py-2 pl-2 pr-2 shadow-[0_16px_40px_rgba(0,0,0,0.4)] border border-white/5">
                        <div className="relative flex items-center justify-around gap-1 min-h-[3rem]">
            {primaryItems.map((item) => (
                <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) => cn(
                        "flex flex-col items-center justify-center space-y-1 w-16 transition-all duration-300",
                        isActive ? "text-primary" : "text-gray-500 hover:text-gray-300"
                    )}
                >
                    <item.icon className="h-5 w-5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
                </NavLink>
            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BottomNav;

