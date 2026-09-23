import React from 'react';
import { cn } from '@/lib/utils';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const Pagination = ({
    page = 1,
    totalPages: propTotalPages,
    total = 0,
    pageSize = 25,
    onPageChange,
    onPageSizeChange,
    loading = false,
    className,
}) => {
    // If totalPages is not provided, calculate it
    const totalPages = propTotalPages !== undefined ? propTotalPages : Math.ceil(total / pageSize) || 1;

    if (total === 0) return null;

    const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);

    return (
        <div className={cn("px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4", className)}>
            <div className="text-sm text-slate-600 flex items-center gap-4">
                <div>
                    Showing <span className="font-semibold text-slate-800">{start}</span> to{" "}
                    <span className="font-semibold text-slate-800">{end}</span> of{" "}
                    <span className="font-semibold text-slate-800">{total}</span> entries
                </div>
                
                {onPageSizeChange && (
                    <div className="flex items-center gap-2 border-l pl-4 border-slate-300">
                        <span className="text-slate-500 hidden sm:inline">Rows per page:</span>
                        <select 
                            value={pageSize} 
                            onChange={(e) => {
                                onPageSizeChange(Number(e.target.value));
                            }}
                            disabled={loading}
                            className="bg-white border border-slate-300 text-slate-700 text-sm rounded-md focus:ring-emerald-500 focus:border-emerald-500 block p-1 disabled:opacity-50"
                        >
                            {PAGE_SIZE_OPTIONS.map((size) => (
                                <option key={size} value={size}>{size}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page <= 1 || loading}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    Previous
                </button>
                <div className="flex items-center gap-1 hidden sm:flex">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum;
                        if (totalPages <= 5) {
                            pageNum = i + 1;
                        } else if (page <= 3) {
                            pageNum = i + 1;
                        } else if (page >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                        } else {
                            pageNum = page - 2 + i;
                        }
                        return (
                            <button
                                key={pageNum}
                                onClick={() => onPageChange(pageNum)}
                                disabled={loading}
                                className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all ${
                                    page === pageNum
                                        ? "bg-emerald-500 text-white shadow-md"
                                        : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {pageNum}
                            </button>
                        );
                    })}
                </div>
                <button
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page >= totalPages || loading}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    Next
                </button>
            </div>
        </div>
    );
};

export default Pagination;
