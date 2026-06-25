require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();


app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rahasia_admin_hijab',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 3600000 }
}));

// Sajikan file statis (web admin)
app.use(express.static('public'));


// ================= API ROUTES =================
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// STATIC FILES (UPLOADS)
app.use('/uploads', express.static('uploads'));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// WEB ADMIN
// ================= BANNER ROUTES =================
const bannerRoutes = require('./routes/bannerRoutes');
app.use('/api/banner', bannerRoutes);

// ================= PRODUCT ROUTES =================
const productRoutes = require('./routes/products');
app.use('/api/products', productRoutes);


// ================= PRODUCT DETAIL ROUTES =================
const productDetailsRoutes = require('./routes/productDetails');
app.use('/api/product-details', productDetailsRoutes);

// ================= ORDER ROUTES =================
const ordersRouter = require('./routes/api/orders');
app.use('/api/orders', ordersRouter);

// ================= PAYMENT ROUTES =================
const paymentRouter = require('./routes/payment');
app.use('/api/payment', paymentRouter);

// ================= USER ROUTES =================
const userRoutes = require('./routes/users');
app.use('/api/users', userRoutes);
app.use('/uploads', express.static('uploads'));

// ================= CATEGORY ROUTES =================
const categoryRoutes = require('./routes/categories');
app.use('/api/categories', categoryRoutes);


// ================= FLASH SALE ROUTES =================
const flashSaleRoutes = require('./routes/flashsale');
app.use('/api/flashsale', flashSaleRoutes);

// ================= FAVORITES ROUTES =================
const favoritesRoutes = require('./routes/favorites');
app.use('/api/favorites', favoritesRoutes);

//cookie parser untuk baca cookie dari request (misal untuk session)
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// ================= CART ROUTES =================
const cartRoutes = require('./routes/cart');
app.use('/api/cart', cartRoutes);

// ================= ONGKIR ROUTES =================
const ongkirRoutes = require('./routes/ongkir');
app.use('/api/ongkir', ongkirRoutes);

// ================= REVIEW ROUTES =================
const reviewRoutes = require('./routes/reviews');
app.use('/api/reviews', reviewRoutes);

// ================= NOTIFICATION ROUTES =================
const notificationRoutes = require('./routes/notifications');
app.use('/api', notificationRoutes.router);

module.exports = app;
