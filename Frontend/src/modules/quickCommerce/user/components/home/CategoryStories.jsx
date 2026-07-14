import React from 'react';

const stories = [
    { id: 1, title: 'Big Savings', image: "", color: 'border-[var(--primary-theme)]' },
    { id: 2, title: 'New Arrival', image: "", color: 'border-[#0c831f]' },
    { id: 3, title: 'Organic', image: "", color: 'border-green-400' },
    { id: 4, title: 'Under ₹99', image: "", color: 'border-blue-500' },
    { id: 5, title: 'Snacks', image: "", color: 'border-purple-500' },
    { id: 6, title: 'Superfast', image: "", color: 'border-red-500' },
    { id: 7, title: 'Trending', image: "", color: 'border-yellow-500' },
    { id: 8, title: 'Freshness', image: "", color: 'border-cyan-500' },
];

const CategoryStories = () => {
    return (
        <section className="pt-32 pb-4 md:pt-40 md:pb-6 overflow-hidden">
            <div className="container w-full max-w-[1920px] mx-auto px-4 md:px-[50px]">
                <div className="flex gap-4 md:gap-8 overflow-x-auto pb-2 scrollbar-hide snap-x">
                    {stories.map((story) => (
                        <div key={story.id} className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group snap-start">
                            <div className={`p-1 rounded-full border-2 ${story.color} transition-transform duration-300 group-hover:scale-110 group-active:scale-95`}>
                                <div className="h-16 w-16 md:h-20 md:w-20 rounded-full overflow-hidden border-2 border-white shadow-md">
                                    <img src={story.image} alt={story.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                </div>
                            </div>
                            <span className="text-[10px] md:text-xs font-black text-slate-700 tracking-tight uppercase group-hover:text-[#0c831f] transition-colors">{story.title}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};

export default CategoryStories;
