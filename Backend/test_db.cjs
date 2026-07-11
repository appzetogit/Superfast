const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://superfastfooddelivery509_db_user:bqnS1XL2ZnA8GU3I@superfast.ctucfae.mongodb.net/SuperFast?retryWrites=true&w=majority');
mongoose.connection.on('connected', async () => {
    try {
        const r = await mongoose.connection.db.collection('food_restaurants').findOne({ restaurantName: 'Test Restaurant' });
        console.log('RESTAURANT ID:', r._id);
        const items = await mongoose.connection.db.collection('food_items').find({ restaurantId: r._id }).toArray();
        console.log('ITEMS COUNT:', items.length);
        if (items.length > 0) {
            console.log('ITEM 1 approvalStatus:', items[0].approvalStatus);
            console.log('ITEM 1 isAvailable:', items[0].isAvailable);
            console.log('ITEM 1 image:', items[0].image);
            console.log('ITEM 1 imageUrl:', items[0].imageUrl);
            console.log('ITEM 1 isRecommended:', items[0].isRecommended);
            console.log('ITEM 1 isBestSeller:', items[0].isBestSeller);
        }
    } catch(err) {
        console.error(err);
    } finally {
        process.exit(0);
    }
});
