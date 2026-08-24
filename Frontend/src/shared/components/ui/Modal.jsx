import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { cn } from '@/lib/utils';

const Modal = ({ isOpen, onClose, title, children, footer, size = 'md' }) => {
    const sizes = {
        sm: 'sm:max-w-md',
        md: 'sm:max-w-lg',
        lg: 'sm:max-w-2xl',
        xl: 'sm:max-w-4xl',
        full: 'sm:max-w-[95vw] h-[95vh]',
    };

    React.useEffect(() => {
        if (isOpen) {
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.overflow = 'hidden';
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        } else {
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }
        return () => {
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        };
    }, [isOpen]);
    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className={cn("overflow-hidden p-0 max-h-[92vh] flex flex-col", sizes[size])}>
                <DialogHeader className="px-6 pt-3 pb-2 border-b border-gray-100/50 bg-gray-50/10 shrink-0">
                    <DialogTitle className="text-2xl font-semibold text-gray-900">{title}</DialogTitle>
                    <DialogDescription className="sr-only">Modal content</DialogDescription>
                </DialogHeader>

                <div
                    className="px-6 pt-3 pb-5 overflow-y-auto overscroll-contain touch-pan-y flex-1"
                    tabIndex={0}
                    onWheel={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                >
                    {children}
                </div>

                {footer && (
                    <DialogFooter className="px-6 py-3 bg-gray-50/30 border-t border-gray-100/50 sm:justify-end gap-3 shrink-0">
                        {footer}
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default Modal;

