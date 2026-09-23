import React from 'react';
import { ArrowRight } from 'lucide-react';

const categories = [
    { id: 1, name: 'Fruits', image: "", color: 'bg-red-50' },
    { id: 2, name: 'Vegetables', image: "", color: 'bg-green-50' },
    { id: 3, name: 'Dairy', image: "", color: 'bg-blue-50' },
    { id: 4, name: 'Meat', image: "", color: 'bg-orange-50' },
    { id: 5, name: 'Bakery', image: "", color: 'bg-yellow-50' },
    { id: 6, name: 'Drinks', image: "", color: 'bg-purple-50' },
    { id: 7, name: 'Snacks', image: "", color: 'bg-pink-50' },
    { id: 8, name: 'Personal Care', image: "", color: 'bg-teal-50' },
    { id: 9, name: 'Baby Care', image: "", color: 'bg-indigo-50' },
    { id: 10, name: 'Pet Food', image: "", color: 'bg-amber-50' },
];

const Categories = () => {
    return (
        <section className="py-8 bg-white">
            <div className="container w-full max-w-[1920px] mx-auto px-4 md:px-[50px]">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-[#0c831f]">Shop by Category</h2>
                    <a href="/categories" className="text-sm font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors">
                        See All <ArrowRight size={16} />
                    </a>
                </div>

                <div className="flex gap-6 overflow-x-auto pb-4 scrollbar-hide snap-x -mx-4 px-4 md:mx-0 md:px-0 md:flex md:flex-wrap md:gap-8 md:justify-start">
                    {categories.slice(0, 8).map((category) => (
                        <a
                            key={category.id}
                            href={`/category/${category.name.toLowerCase()}`}
                            className="flex flex-col items-center gap-4 min-w-[140px] snap-start group cursor-pointer"
                        >
                            <div className={`h-36 w-36 rounded-full ${category.color} p-4 flex items-center justify-center shadow-lg transition-all duration-300 group-hover:scale-110 group-hover:shadow-xl border border-slate-100`}>
                                <img
                                    src={category.image}
                                    alt={category.name}
                                    className="w-full h-full object-contain drop-shadow-sm mix-blend-multiply"
                                />
                            </div>
                            <span className="text-lg font-medium text-slate-700 group-hover:text-brand-600 transition-colors">
                                {category.name}
                            </span>
                        </a>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default Categories;
