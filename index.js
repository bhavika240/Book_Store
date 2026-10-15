
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const Book = require('./models/Books');
const Order = require('./models/Order');
const nodemailer = require('nodemailer');
const EMAIL_USER = 'sewanibhavika780@gmail.com';
const EMAIL_PASS = 'ivvtucdtfrhcfuku';
const CONTACT_TO = 'sewanibhavika780@gmail.com';
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    }
});
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "1234";
const app = express();
app.use(express.json());
app.use(express.static('public'));

app.use('/uploads', express.static('public/uploads'));

const port = 3000;

app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'readme-college-project-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 60 * 60 * 1000
    }
}));

app.use((req, res, next) => {
    res.locals.isAdmin = req.session.isAdmin === true;
    next();
});

function requireAdmin(req, res, next) {
    if (req.session.isAdmin === true) {
        return next();
    }
    res.redirect('/login');
}

mongoose.connect('mongodb://bhavika:bG6wcVo0pA13KmED@ac-xokuw4v-shard-00-00.apkkepj.mongodb.net:27017,ac-xokuw4v-shard-00-01.apkkepj.mongodb.net:27017,ac-xokuw4v-shard-00-02.apkkepj.mongodb.net:27017/?ssl=true&replicaSet=atlas-lr0ndf-shard-0&authSource=admin')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.log(err));

app.set('view engine', 'ejs');

app.get('/login', (req, res) => {
    res.render('login', { error: '' });
});

app.post('/login', (req, res, next) => {
    if (
        req.body.username === ADMIN_USERNAME &&
        req.body.password === ADMIN_PASSWORD
    ) {
        req.session.regenerate(err => {
            if (err) return next(err);

            req.session.isAdmin = true;
            res.redirect('/books');
        });
    } else {
        res.status(401).render('login', {
            error: 'Incorrect username or password!'
        });
    }
});

app.post('/logout', (req, res, next) => {
    req.session.destroy(err => {
        if (err) return next(err);
        res.redirect('/');
    });
});

app.get('/', (req, res) => {
    res.render('home');
});
app.get('/about', (req, res) => {
    res.render('about');
});
app.get('/contact', (req, res) => {
    res.render('contact');
});

app.get('/books', async (req, res) => {
    const books = await Book.find();
    res.render('books', { books });
});

app.post('/cart/add/:id', async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);

        if (!book) {
            return res.status(404).send('Book not found');
        }

        if (!req.session.cart) {
            req.session.cart = {};
        }

        const bookId = book._id.toString();

        if (req.session.cart[bookId]) {
            req.session.cart[bookId] += 1;
        } else {
            req.session.cart[bookId] = 1;
        }

        res.redirect('/cart');
        } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).send('Could not add book to cart.');
    }
});

app.get('/cart', async (req, res) => {
    try {
        const cart = req.session.cart || {};
        const bookIds = Object.keys(cart);

        const books = await Book.find({
            _id: { $in: bookIds }
        });

        const cartItems = books.map(book => ({
            book,
            quantity: cart[book._id.toString()]
        }));

        const total = cartItems.reduce((sum, item) => {
            return sum + (Number(item.book.price) * item.quantity);
        }, 0);

        res.render('cart', { cartItems, total });
        } catch (error) {
        console.error('Cart error:', error);
        res.status(500).send('Could not load cart.');
    }
});
app.post('/cart/remove/:id', (req, res) => {
    if (req.session.cart) {
        delete req.session.cart[req.params.id];
    }

    res.redirect('/cart');
});

app.post('/cart/buy', async (req, res) => {
    try {
        const cart = req.session.cart || {};
        const bookIds = Object.keys(cart);

        if (bookIds.length === 0) {
            return res.redirect('/cart');
        }

        const books = await Book.find({
            _id: { $in: bookIds }
        });

        const items = books.map(book => ({
            bookId: book._id.toString(),
            title: book.title,
            author: book.author,
            price: Number(book.price),
            quantity: cart[book._id.toString()],
            image: book.image
        }));

        const total = items.reduce((sum, item) => {
            return sum + item.price * item.quantity;
        }, 0);

        if (items.length === 0) {
            return res.redirect('/cart');
        }

        const order = await Order.create({
            items,
            total
        });

        req.session.cart = {};

        res.redirect('/order-confirmation/' + order._id);
    } catch (error) {
        console.error('Order error:', error);
        res.status(500).send('Could not place your order.');
    }
});

app.post('/cart/buy-from-panel', async (req, res) => {
    try {
        const panelItems = req.body.items;

        if (!Array.isArray(panelItems) || panelItems.length === 0) {
            return res.status(400).json({
                message: 'Your cart is empty.'
            });
        }

        const bookIds = panelItems.map(item => item.id);

        if (bookIds.some(id => typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) {
            return res.status(400).json({
                message: 'Invalid book in cart.'
            });
        }

        const books = await Book.find({
            _id: { $in: bookIds }
        });

        if (books.length !== new Set(bookIds).size) {
            return res.status(400).json({
                message: 'Some books are no longer available.'
            });
        }

        const items = books.map(book => {
            const cartItem = panelItems.find(
                item => item.id === book._id.toString()
            );

            const quantity = Number(cartItem.quantity);

            if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
                throw new Error('Invalid book quantity.');
            }

            return {
                bookId: book._id.toString(),
                title: book.title,
                author: book.author,
                price: Number(book.price),
                quantity,
                image: book.image
            };
        });

        const total = items.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
        );

        const order = await Order.create({ items, total });

        res.json({
            redirect: '/order-confirmation/' + order._id
        });

    } catch (error) {
        console.error('Panel order error:', error);

        res.status(500).json({
            message: 'Could not place your order. Please try again.'
        });
    }
});

app.get('/order-confirmation/:id', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);

        if (!order) {
            return res.status(404).send('Order not found.');
        }

        res.render('order-confirmation', { order });
    } catch (error) {
        console.error('Order confirmation error:', error);
        res.status(500).send('Could not load order confirmation.');
    }
});

app.post('/books/add', async (req, res) => {
    await Book.create({
        title: req.body.title,
        author: req.body.author,
        category: req.body.category,
        price: req.body.price,
        image: req.body.image
    });

    res.redirect('/books');
});
app.get('/books/edit/:id', requireAdmin, async (req, res) => {
    const book = await Book.findById(req.params.id);

    if (!book) return res.status(404).send('Book not found');

    res.render('edit-book', { book });
});
app.post('/books/update/:id', requireAdmin, async (req, res) => {
    await Book.findByIdAndUpdate(req.params.id, {
        title: req.body.title,
        author: req.body.author,
        category: req.body.category,
        price: req.body.price,
        image: req.body.image
    });

    res.redirect('/books');
});

app.post('/books/delete/:id', requireAdmin, async (req, res) => {
    await Book.findByIdAndDelete(req.params.id);
    res.redirect('/books');
});


app.get('/category', async (req, res) => {
    try {
        const books = await Book.find();
        const categories = await Book.distinct('category');

        res.render('categories', {
            books,
            categories,
            isAdmin: req.session.isAdmin === true
        });
    } catch (error) {
        console.error('Category error:', error);
        res.status(500).send('Could not load categories.');
    }
});

app.get('/category/:category', async (req, res) => {
    try {
        const category = req.params.category;
        const books = await Book.find({ category });
        const categories = await Book.distinct('category');

        res.render('categories', {
            books,
            categories,
            isAdmin: req.session.isAdmin === true
        });
    } catch (error) {
        console.error('Category error:', error);
        res.status(500).send('Could not load category.');
    }
});



app.post('/contact', async (req, res) => {
    const { name, email, message } = req.body;

    try {
        await transporter.sendMail({
            from: EMAIL_USER,
            to: CONTACT_TO,
            replyTo: email,
            subject: `Read Me Contact Message from ${name}`,
            text: `Name: ${name}\nEmail: ${email}\nMessage:\n${message}`
        });

        res.send('Your message has been sent successfully!');
    } catch (error) {
        console.error('Email sending failed:', error);
        res.status(500).send('Email could not be sent. Please try again.');
    }
});

app.get('/delete-alchemist', requireAdmin, async (req, res) => {
    await Book.deleteMany({ title: 'The Alchemist' });
    res.send('All Alchemist books deleted');
});

app.listen(port, () => {
    console.log('Listening on ' + port);
});
