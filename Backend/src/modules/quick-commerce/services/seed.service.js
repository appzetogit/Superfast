import { QuickCategory } from '../models/category.model.js';
import { QuickProduct } from '../models/product.model.js';

const categoriesSeed = [
  {
    name: 'Fruits & Vegetables',
    slug: 'fruits-vegetables',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/layout_item/2022-09/44889.png',
    accentColor: '#66bb6a',
    sortOrder: 1,
  },
  {
    name: 'Dairy, Bread & Eggs',
    slug: 'dairy-bread-eggs',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/layout_item/2022-09/44910.png',
    accentColor: '#f7ca4d',
    sortOrder: 2,
  },
  {
    name: 'Cold Drinks & Juices',
    slug: 'cold-drinks-juices',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/layout_item/2023-01/44907.png',
    accentColor: '#80deea',
    sortOrder: 3,
  },
  {
    name: 'Snacks & Munchies',
    slug: 'snacks-munchies',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/layout_item/2023-01/44908.png',
    accentColor: '#ffcc80',
    sortOrder: 4,
  },
  {
    name: 'Bakery & Biscuits',
    slug: 'bakery-biscuits',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/layout_item/2022-09/44901.png',
    accentColor: '#bcaaa4',
    sortOrder: 5,
  },
  {
    name: 'Instant & Frozen Food',
    slug: 'instant-frozen-food',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=270/layout_item/2022-09/44917.png',
    accentColor: '#a5d6a7',
    sortOrder: 6,
  },
];

const productSeeds = [
  {
    name: 'Fresh Bananas Robusta',
    slug: 'fresh-bananas-robusta',
    categorySlug: 'fruits-vegetables',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/494a.jpg',
    price: 39,
    mrp: 49,
    unit: '1 kg',
    badge: 'Bestseller',
  },
  {
    name: 'Farm Fresh Tomato',
    slug: 'farm-fresh-tomato',
    categorySlug: 'fruits-vegetables',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/299a.jpg',
    price: 32,
    mrp: 40,
    unit: '500 g',
    badge: 'Fresh',
  },
  {
    name: 'Amul Taaza Toned Milk',
    slug: 'amul-taaza-toned-milk',
    categorySlug: 'dairy-bread-eggs',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/10012a.jpg',
    price: 32,
    mrp: 34,
    unit: '500 ml',
    badge: 'Daily',
  },
  {
    name: 'Country Delight Paneer',
    slug: 'country-delight-paneer',
    categorySlug: 'dairy-bread-eggs',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/482436a.jpg',
    price: 105,
    mrp: 120,
    unit: '200 g',
    badge: 'Popular',
  },
  {
    name: 'Coca Cola Soft Drink',
    slug: 'coca-cola-soft-drink',
    categorySlug: 'cold-drinks-juices',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/1210a.jpg',
    price: 40,
    mrp: 45,
    unit: '750 ml',
    badge: 'Chilled',
  },
  {
    name: 'Tropicana Mixed Fruit Juice',
    slug: 'tropicana-mixed-fruit-juice',
    categorySlug: 'cold-drinks-juices',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/117234a.jpg',
    price: 120,
    mrp: 135,
    unit: '1 L',
    badge: 'No Added Color',
  },
  {
    name: 'Lay\'s Classic Salted Chips',
    slug: 'lays-classic-salted-chips',
    categorySlug: 'snacks-munchies',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/123a.jpg',
    price: 20,
    mrp: 25,
    unit: '52 g',
    badge: 'Crunchy',
  },
  {
    name: 'Haldiram\'s Aloo Bhujia',
    slug: 'haldirams-aloo-bhujia',
    categorySlug: 'snacks-munchies',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/352019a.jpg',
    price: 55,
    mrp: 65,
    unit: '150 g',
    badge: 'Top Pick',
  },
  {
    name: 'Britannia Good Day Cashew',
    slug: 'britannia-good-day-cashew',
    categorySlug: 'bakery-biscuits',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/136a.jpg',
    price: 35,
    mrp: 40,
    unit: '200 g',
    badge: 'Tea Time',
  },
  {
    name: 'Harvest Gold White Bread',
    slug: 'harvest-gold-white-bread',
    categorySlug: 'bakery-biscuits',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/17349a.jpg',
    price: 45,
    mrp: 50,
    unit: '400 g',
    badge: 'Soft',
  },
  {
    name: 'McCain French Fries',
    slug: 'mccain-french-fries',
    categorySlug: 'instant-frozen-food',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/5169a.jpg',
    price: 135,
    mrp: 160,
    unit: '420 g',
    badge: 'Frozen',
  },
  {
    name: 'ITC Yippee Noodles',
    slug: 'itc-yippee-noodles',
    categorySlug: 'instant-frozen-food',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/456675a.jpg',
    price: 76,
    mrp: 85,
    unit: '280 g',
    badge: 'Instant',
  },
  // Fruits & Vegetables
  {
    name: 'Fresh Potato',
    slug: 'fresh-potato',
    categorySlug: 'fruits-vegetables',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/301a.jpg',
    price: 24,
    mrp: 30,
    unit: '1 kg',
    badge: 'Fresh',
  },
  {
    name: 'Fresh Onion',
    slug: 'fresh-onion',
    categorySlug: 'fruits-vegetables',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/302a.jpg',
    price: 35,
    mrp: 45,
    unit: '1 kg',
    badge: 'Fresh',
  },
  {
    name: 'Green Coriander',
    slug: 'green-coriander',
    categorySlug: 'fruits-vegetables',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/303a.jpg',
    price: 12,
    mrp: 15,
    unit: '100 g',
    badge: 'Fresh',
  },
  // Dairy, Bread & Eggs
  {
    name: 'Amul Butter',
    slug: 'amul-butter',
    categorySlug: 'dairy-bread-eggs',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/10015a.jpg',
    price: 56,
    mrp: 58,
    unit: '100 g',
    badge: 'Bestseller',
  },
  {
    name: 'Mother Dairy Dahi',
    slug: 'mother-dairy-dahi',
    categorySlug: 'dairy-bread-eggs',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/10016a.jpg',
    price: 35,
    mrp: 35,
    unit: '400 g',
    badge: 'Fresh',
  },
  {
    name: 'Brown Eggs',
    slug: 'brown-eggs',
    categorySlug: 'dairy-bread-eggs',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/10017a.jpg',
    price: 85,
    mrp: 95,
    unit: '6 pcs',
    badge: 'Healthy',
  },
  // Cold Drinks & Juices
  {
    name: 'Sprite Soft Drink',
    slug: 'sprite-soft-drink',
    categorySlug: 'cold-drinks-juices',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/1211a.jpg',
    price: 40,
    mrp: 45,
    unit: '750 ml',
    badge: 'Chilled',
  },
  {
    name: 'Red Bull Energy Drink',
    slug: 'red-bull-energy-drink',
    categorySlug: 'cold-drinks-juices',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/1212a.jpg',
    price: 125,
    mrp: 125,
    unit: '250 ml',
    badge: 'Popular',
  },
  {
    name: 'Real Cranberry Juice',
    slug: 'real-cranberry-juice',
    categorySlug: 'cold-drinks-juices',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/1213a.jpg',
    price: 130,
    mrp: 140,
    unit: '1 L',
    badge: 'Popular',
  },
  // Snacks & Munchies
  {
    name: 'Kurkure Masala Munch',
    slug: 'kurkure-masala-munch',
    categorySlug: 'snacks-munchies',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/124a.jpg',
    price: 20,
    mrp: 20,
    unit: '90 g',
    badge: 'Spicy',
  },
  {
    name: 'Act II Classic Salted Popcorn',
    slug: 'act-ii-classic-salted-popcorn',
    categorySlug: 'snacks-munchies',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/125a.jpg',
    price: 45,
    mrp: 50,
    unit: '150 g',
    badge: 'Snack',
  },
  {
    name: 'Uncle Chipps Spicy Treat',
    slug: 'uncle-chipps-spicy-treat',
    categorySlug: 'snacks-munchies',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/126a.jpg',
    price: 20,
    mrp: 20,
    unit: '52 g',
    badge: 'Classic',
  },
  // Bakery & Biscuits
  {
    name: 'Britannia Bourbon Biscuits',
    slug: 'britannia-bourbon-biscuits',
    categorySlug: 'bakery-biscuits',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/137a.jpg',
    price: 30,
    mrp: 35,
    unit: '150 g',
    badge: 'Choco',
  },
  {
    name: 'Oreo Original Biscuits',
    slug: 'oreo-original-biscuits',
    categorySlug: 'bakery-biscuits',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/138a.jpg',
    price: 35,
    mrp: 40,
    unit: '120 g',
    badge: 'Kids Favorite',
  },
  {
    name: 'English Oven Garlic Bread',
    slug: 'english-oven-garlic-bread',
    categorySlug: 'bakery-biscuits',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/139a.jpg',
    price: 55,
    mrp: 60,
    unit: '200 g',
    badge: 'Freshly Baked',
  },
  // Instant & Frozen Food
  {
    name: 'Maggi 2-Minute Masala Noodles',
    slug: 'maggi-2-minute-masala-noodles',
    categorySlug: 'instant-frozen-food',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/5170a.jpg',
    price: 14,
    mrp: 14,
    unit: '70 g',
    badge: 'Favorite',
  },
  {
    name: 'Keventer Frozen Green Peas',
    slug: 'keventer-frozen-green-peas',
    categorySlug: 'instant-frozen-food',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/5171a.jpg',
    price: 90,
    mrp: 110,
    unit: '500 g',
    badge: 'Frozen',
  },
  {
    name: 'Haldiram\'s Frozen Aloo Tikki',
    slug: 'haldirams-frozen-aloo-tikki',
    categorySlug: 'instant-frozen-food',
    image: 'https://cdn.grofers.com/cdn-cgi/image/f=auto,fit=scale-down,q=70,metadata=none,w=300/app/images/products/sliding_image/5172a.jpg',
    price: 140,
    mrp: 165,
    unit: '400 g',
    badge: 'Frozen Snack',
  },
];

let isSeedingVerified = false;
let seedingPromise = null;

export const ensureQuickCommerceSeedData = async () => {
  if (isSeedingVerified) return;
  if (seedingPromise) return seedingPromise;

  seedingPromise = (async () => {
    try {
      // 1. Ensure all seed categories exist in DB
      for (const catSeed of categoriesSeed) {
        const match = await QuickCategory.findOne({ slug: catSeed.slug });
        if (!match) {
          await QuickCategory.create(catSeed);
        }
      }

      const categories = await QuickCategory.find({}).lean();
      const categoryBySlug = categories.reduce((acc, category) => {
        acc[category.slug] = category;
        return acc;
      }, {});

      // 2. Ensure all seed products exist in DB by slug
      for (const prodSeed of productSeeds) {
        const match = await QuickProduct.findOne({ slug: prodSeed.slug });
        if (!match) {
          const category = categoryBySlug[prodSeed.categorySlug];
          if (category) {
            await QuickProduct.create({
              name: prodSeed.name,
              slug: prodSeed.slug,
              image: prodSeed.image,
              categoryId: category._id,
              price: prodSeed.price,
              mrp: prodSeed.mrp,
              unit: prodSeed.unit,
              deliveryTime: '10 mins',
              badge: prodSeed.badge,
              rating: 4.2,
              isActive: true,
            });
          }
        }
      }
      isSeedingVerified = true;
    } catch (err) {
      console.error('Quick Commerce seeding failed:', err);
    } finally {
      seedingPromise = null;
    }
  })();

  return seedingPromise;
};
