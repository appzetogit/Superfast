import mongoose from 'mongoose';

const MONGODB_URI = 'mongodb://superfastfooddelivery509_db_user:bqnS1XL2ZnA8GU3I@ac-yg9vrlb-shard-00-00.ctucfae.mongodb.net:27017,ac-yg9vrlb-shard-00-01.ctucfae.mongodb.net:27017,ac-yg9vrlb-shard-00-02.ctucfae.mongodb.net:27017/?ssl=true&replicaSet=atlas-13589z-shard-0&authSource=admin&retryWrites=true&w=majority&appName=SuperFast';

mongoose.connect(MONGODB_URI).then(async () => {
    console.log('Connected');
    const db = mongoose.connection.db;
    
    // Find test seller
    const testSeller = await db.collection('quick_sellers').findOne({ name: /test/i });
    if (!testSeller) {
        console.log('Test seller not found');
        process.exit(1);
    }
    
    console.log('Found Test Seller ID:', testSeller._id);

    // Find products without seller
    const missingSellers = await db.collection('quick_products').find({
        $or: [
            { sellerId: { $exists: false } },
            { sellerId: null }
        ]
    }).toArray();
    
    console.log(`Found ${missingSellers.length} products without seller.`);
    
    // Update them
    const res = await db.collection('quick_products').updateMany(
        { $or: [{ sellerId: { $exists: false } }, { sellerId: null }] },
        { $set: { sellerId: testSeller._id } }
    );
    
    console.log('Updated count:', res.modifiedCount);
    
    process.exit(0);
}).catch(console.error);
