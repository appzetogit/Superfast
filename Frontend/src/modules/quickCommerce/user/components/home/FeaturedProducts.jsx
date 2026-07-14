import React from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../shared/ProductCard';

const products = [
    {
        id: 1,
        name: 'Fresh Organic Strawberry',
        category: 'Fruits',
        price: 349,
        originalPrice: 499,
        image: "",
    },
    {
        id: 2,
        name: 'Green Bell Pepper',
        category: 'Vegetables',
        price: 45,
        originalPrice: 60,
        image: "",
    },
    {
        id: 3,
        name: 'Fresh Avocado',
        category: 'Fruits',
        price: 120,
        originalPrice: 180,
        image: "",
    },
    {
        id: 4,
        name: 'Organic Broccoli',
        category: 'Vegetables',
        price: 85,
        originalPrice: 110,
        image: "",
    },
    {
        id: 5,
        name: 'Fresh Red Tomato',
        category: 'Vegetables',
        price: 35,
        originalPrice: 50,
        image: "",
    },
    {
        id: 6,
        name: 'Organic Banana Bunch',
        category: 'Fruits',
        price: 60,
        originalPrice: 80,
        image: "",
    },
];

const FeaturedProducts = () => {
    return (
        <section className="py-12 bg-white">
            <div className="container w-full max-w-[1920px] mx-auto px-4 md:px-[50px]">
                <div className="flex flex-row items-end justify-between mb-8 gap-4 text-left">
                    <div className="space-y-1">
                        <span className="text-brand-600 font-semibold tracking-wide uppercase text-sm">Best Seller</span>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Featured Products</h2>
                    </div>
                    <Link to="/categories" className="hidden md:inline-flex text-brand-600 font-medium hover:text-brand-700 hover:underline">
                        View All Products &rarr;
                    </Link>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 md:gap-6">
                    {products.map((product) => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>

                <div className="mt-8 text-center md:hidden">
                    <Link to="/categories" className="inline-flex text-brand-600 font-medium hover:text-brand-700 hover:underline">
                        View All Products &rarr;
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default FeaturedProducts;
