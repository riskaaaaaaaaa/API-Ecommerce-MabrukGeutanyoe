const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Helper get user id
function getUserId(req) {
    if (req.query.userId) return req.query.userId;
    if (req.body.userId) return req.body.userId;
    if (req.session && req.session.userId) return req.session.userId;
    return null;
}

// GET /api/cart?userId=xxx
router.get('/', (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'User ID diperlukan' });

     // ✅ PERBAIKAN: Ambil gambar dari product_details.image1
    const sql = `
        SELECT 
            c.id, 
            c.user_id, 
            c.product_id, 
            c.quantity,
            p.name, 
            p.price, 
            p.old_price, 
            p.rating, 
            p.sold,
            pd.image1 AS image_url,
            pd.weight,
            pd.stock
        FROM carts c
        JOIN products p ON c.product_id = p.id
        LEFT JOIN product_details pd ON p.id = pd.product_id
        WHERE c.user_id = ?
        ORDER BY c.created_at DESC
    `;
    
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Error fetch cart:', err);
            return res.status(500).json({ error: err.message });
        }
        
        const cartItems = results.map(row => ({
            id: row.product_id,
            name: row.name,
            price: row.price,
            oldPrice: row.old_price,
            // ✅ Perbaikan: Gunakan image_url dari product_details.image1
            imageUrl: row.image_url 
                ? `http://192.168.1.3:8000/uploads/product_details/${row.image_url}` 
                : null,
            rating: row.rating || 0,
            sold: row.sold || 0,
            quantity: row.quantity,
            weight: row.weight || 500,
            stock: row.stock || 0,
            cartId: row.id
        }));
        
        res.json(cartItems);
    });
});

// POST /api/cart - tambah atau update quantity
// POST /api/cart - tambah atau update quantity
router.post('/', (req, res) => {
    const userId = getUserId(req);
    let { productId, quantity } = req.body;
    quantity = quantity || 1;
    
    if (!userId || !productId) {
        return res.status(400).json({ error: 'Missing data: userId dan productId diperlukan' });
    }

    // ✅ Perbaikan: Cek apakah produk exist dan ambil stok
    const checkProductSql = `
        SELECT p.id, pd.stock 
        FROM products p 
        LEFT JOIN product_details pd ON p.id = pd.product_id 
        WHERE p.id = ?
    `;
    
    db.query(checkProductSql, [productId], (err, productRows) => {
        if (err) {
            console.error('Error check product:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (productRows.length === 0) {
            return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }

        // Cek apakah sudah ada di cart
        const checkSql = 'SELECT id, quantity FROM carts WHERE user_id = ? AND product_id = ?';
        db.query(checkSql, [userId, productId], (err, rows) => {
            if (err) {
                console.error('Error check cart:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (rows.length > 0) {
                // Update quantity
                const newQty = rows[0].quantity + quantity;
                const updateSql = 'UPDATE carts SET quantity = ? WHERE id = ?';
                db.query(updateSql, [newQty, rows[0].id], (err) => {
                    if (err) {
                        console.error('Error update cart:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({ 
                        success: true,
                        message: 'Cart updated', 
                        quantity: newQty 
                    });
                });
            } else {
                // Insert baru
                const insertSql = 'INSERT INTO carts (user_id, product_id, quantity) VALUES (?, ?, ?)';
                db.query(insertSql, [userId, productId, quantity], (err, result) => {
                    if (err) {
                        console.error('Error insert cart:', err);
                        return res.status(500).json({ error: err.message });
                    }
                    res.status(201).json({ 
                        success: true,
                        message: 'Added to cart', 
                        cartId: result.insertId 
                    });
                });
            }
        });
    });
});

// PUT /api/cart/:productId - update quantity langsung (misal user ubah jumlah)
router.put('/:productId', (req, res) => {
    const userId = getUserId(req);
    const productId = req.params.productId;
    let { quantity } = req.body;
    
    if (!userId || !productId) {
        return res.status(400).json({ error: 'Missing data' });
    }
    
    if (quantity === undefined || quantity < 0) {
        return res.status(400).json({ error: 'Quantity required' });
    }

    if (quantity === 0) {
        // Hapus jika quantity 0
        const delSql = 'DELETE FROM carts WHERE user_id = ? AND product_id = ?';
        db.query(delSql, [userId, productId], (err) => {
            if (err) {
                console.error('Error delete cart:', err);
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'Item removed' });
        });
    } else {
        const updateSql = 'UPDATE carts SET quantity = ? WHERE user_id = ? AND product_id = ?';
        db.query(updateSql, [quantity, userId, productId], (err, result) => {
            if (err) {
                console.error('Error update cart:', err);
                return res.status(500).json({ error: err.message });
            }
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: 'Item not found' });
            }
            res.json({ success: true, message: 'Quantity updated' });
        });
    }
});

// DELETE /api/cart/:productId
router.delete('/:productId', (req, res) => {
    const userId = getUserId(req);
    const productId = req.params.productId;
    
    if (!userId || !productId) {
        return res.status(400).json({ error: 'Missing data: userId dan productId diperlukan' });
    }

    const sql = 'DELETE FROM carts WHERE user_id = ? AND product_id = ?';
    db.query(sql, [userId, productId], (err, result) => {
        if (err) {
            console.error('Error delete cart:', err);
            return res.status(500).json({ error: err.message });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }
        res.json({ success: true, message: 'Item removed from cart' });
    });
});

module.exports = router;