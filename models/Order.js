
const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    items: [
        {
            bookId: String,
            title: String,
            author: String,
            price: Number,
            quantity: Number,
            image: String
        }
    ],
    total: Number,
    status: {
        type: String,
        default: 'Order Confirmed'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Order', orderSchema);
