import React from 'react';
import { useAuth } from '@core/context/AuthContext';
import {
    HiOutlineLogout,
    HiOutlineUserCircle,
    HiOutlineBell,
    HiOutlineSearch,
    HiOutlineMenu,
    HiOutlineCode
} from 'react-icons/hi';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { sellerApi } from '@/modules/seller/services/sellerApi';
import { adminAPI } from '@food/api';
import { clearGlobalHomeCache } from '@food/hooks/useFoodHomeData';
import { AnimatePresence } from 'framer-motion';
import NotificationPopup from './NotificationPopup';
import { toast } from 'sonner';

const Topbar = ({ onMenuClick }) => {
    const { user, logout, role } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    const [searchQuery, setSearchQuery] = React.useState('');
    const [notifications, setNotifications] = React.useState([]);
    const [unreadCount, setUnreadCount] = React.useState(0);
    const [showNotifications, setShowNotifications] = React.useState(false);
    const [devModeEnabled, setDevModeEnabled] = React.useState(false);
    const [updatingDevMode, setUpdatingDevMode] = React.useState(false);
    const notificationRef = React.useRef(null);

    const isSeller = location.pathname.startsWith('/seller');
    const isAdmin = location.pathname.startsWith('/admin') || role === 'admin' || user?.role === 'admin';

    const fetchDevModeStatus = React.useCallback(async () => {
        if (!isAdmin) return;
        try {
            const res = await adminAPI.getBusinessSettings().catch(() => null);
            const data = res?.data?.data || res?.data || {};
            if (data.developerMode) {
                setDevModeEnabled(Boolean(data.developerMode.enabled));
            }
        } catch (err) {
            console.error("Error fetching dev mode status in topbar:", err);
        }
    }, [isAdmin]);

    React.useEffect(() => {
        fetchDevModeStatus();
        const handleSettingsUpdated = (e) => {
            if (e?.detail?.developerMode?.enabled !== undefined) {
                setDevModeEnabled(Boolean(e.detail.developerMode.enabled));
            } else {
                fetchDevModeStatus();
            }
        };
        window.addEventListener('businessSettingsUpdated', handleSettingsUpdated);
        return () => window.removeEventListener('businessSettingsUpdated', handleSettingsUpdated);
    }, [fetchDevModeStatus]);

    const handleToggleDevMode = async () => {
        try {
            setUpdatingDevMode(true);
            const nextStatus = !devModeEnabled;
            await adminAPI.updateBusinessSettings({
                developerMode: { enabled: nextStatus }
            });
            setDevModeEnabled(nextStatus);
            clearGlobalHomeCache();
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("businessSettingsUpdated", {
                    detail: { developerMode: { enabled: nextStatus } }
                }));
            }
            toast.success(nextStatus ? "Developer Mode ENABLED (Demo Data Mode)" : "Developer Mode DISABLED (Live Mode)");
        } catch (err) {
            toast.error("Failed to update Developer Mode");
        } finally {
            setUpdatingDevMode(false);
        }
    };

    const handleSearchSubmit = (e) => {
        e?.preventDefault();
        const q = (searchQuery || '').trim();
        if (isSeller) {
            navigate(q ? `/seller/products?q=${encodeURIComponent(q)}` : '/seller/products');
        }
    };

    React.useEffect(() => {
        if (isSeller) {
            const params = new URLSearchParams(location.search);
            const q = params.get('q') || '';
            setSearchQuery(q);
        }
    }, [location.search, isSeller]);

    const fetchNotifications = async () => {
        try {
            // Only fetch for sellers for now as per request
            if (!isSeller) return;

            const response = await sellerApi.getNotifications();
            if (response.data.success) {
                setNotifications(response.data.result.notifications);
                setUnreadCount(response.data.result.unreadCount);
            }
        } catch (error) {
            console.error("Notif Fetch Error:", error);
        }
    };

    React.useEffect(() => {
        fetchNotifications();
        // Polling every 30 seconds
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, [isSeller]);

    // Handle Click Outside
    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (notificationRef.current && !notificationRef.current.contains(event.target)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleMarkAsRead = async (id) => {
        try {
            await sellerApi.markNotificationRead(id);
            fetchNotifications();
        } catch (error) {
            toast.error("Failed to mark as read");
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await sellerApi.markAllNotificationsRead();
            fetchNotifications();
            toast.success("All caught up!");
        } catch (error) {
            toast.error("Failed to mark all as read");
        }
    };

    const handleLogout = () => {
        logout();
    };

    return (
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between shadow-sm transition-all duration-300 h-14 md:h-16 px-4 md:px-6">
            <div className="flex items-center flex-1 mr-4 overflow-hidden">
                <button
                    onClick={onMenuClick}
                    className="p-2.5 mr-2 bg-gray-100/80 hover:bg-white rounded-xl text-gray-600 hover:text-primary transition-all duration-300 md:hidden border border-transparent hover:border-primary/20 shadow-sm"
                >
                    <HiOutlineMenu className="h-5 w-5" />
                </button>

                <form onSubmit={handleSearchSubmit} className="relative w-full md:w-[400px] group">
                    <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 group-focus-within:text-slate-900 transition-all duration-300 pointer-events-none" />
                    <input
                        type="text"
                        placeholder={isSeller ? "Search products by name or SKU..." : "Search anything..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
                        className="w-full pl-10 pr-4 py-2 bg-slate-100/90 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-500 placeholder:font-medium focus:bg-white focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 transition-all duration-300 outline-none shadow-inner"
                    />
                </form>
            </div>

            <div className="flex items-center space-x-3 md:space-x-4">
                {isAdmin && (
                    <button
                        type="button"
                        onClick={handleToggleDevMode}
                        disabled={updatingDevMode}
                        title={devModeEnabled ? "Developer Mode is ON - Click to switch to Live Mode" : "Developer Mode is OFF - Click to enable Demo Reviewer Mode"}
                        className={cn(
                            "flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all duration-300 shadow-sm cursor-pointer",
                            devModeEnabled
                                ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600 ring-2 ring-amber-400/30"
                                : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                        )}
                    >
                        <HiOutlineCode className="h-4 w-4 shrink-0" />
                        <span className="hidden sm:inline font-semibold">Dev Mode</span>
                        <span className={cn(
                            "px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider",
                            devModeEnabled ? "bg-white text-amber-800" : "bg-slate-200 text-slate-700"
                        )}>
                            {devModeEnabled ? "ON" : "OFF"}
                        </span>
                    </button>
                )}

                <div className="relative" ref={notificationRef}>
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={cn(
                            "p-2 hover:bg-primary/5 text-gray-500 hover:text-primary rounded-xl transition-all duration-300 relative group",
                            showNotifications && "bg-primary/5 text-primary"
                        )}
                    >
                        <HiOutlineBell className="h-5 w-5" />
                        {unreadCount > 0 && (
                            <span className="absolute top-2 right-2 h-2 w-2 bg-rose-500 rounded-full ring-2 ring-white shadow-sm"></span>
                        )}
                    </button>

                    <AnimatePresence>
                        {showNotifications && (
                            <NotificationPopup
                                notifications={notifications}
                                onMarkAsRead={handleMarkAsRead}
                                onMarkAllAsRead={handleMarkAllAsRead}
                                onClose={() => setShowNotifications(false)}
                            />
                        )}
                    </AnimatePresence>
                </div>

                <div className="h-8 w-px bg-gray-100 mx-1"></div>
                <button
                    onClick={() => {
                        if (location.pathname.startsWith('/admin')) {
                            navigate('/admin/profile');
                        } else if (location.pathname.startsWith('/seller')) {
                            navigate('/seller/profile');
                        } else if (location.pathname.startsWith('/delivery')) {
                            navigate('/delivery/profile');
                        } else {
                            navigate('/profile');
                        }
                    }}
                    className="flex items-center space-x-2.5 p-1 pr-3 hover:bg-gray-50 rounded-xl transition-all duration-300 group ring-1 ring-transparent hover:ring-gray-100 shadow-sm hover:shadow-md"
                >
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-primary/20 group-hover:scale-105 transition-transform">
                        {user?.name?.[0] || 'A'}
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-900 leading-tight">{user?.name || 'Demo User'}</p>
                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">{user?.role || 'Member'}</p>
                    </div>
                </button>
                {!isSeller && (
                    <button
                        onClick={handleLogout}
                        className="flex items-center space-x-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-all duration-300 font-bold text-xs shadow-sm hover:shadow-rose-100/50"
                    >
                        <HiOutlineLogout className="h-4 w-4" />
                        <span className="hidden lg:block">Sign Out</span>
                    </button>
                )}
            </div>
        </header>
    );
};

export default Topbar;

