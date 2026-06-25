const express = require('express');
const router = express.Router();
const db = require('../config/db');

// Ambil base URL dari environment atau request
function getBaseUrl(req) {
    return `${req.protocol}://${req.get('host')}`;
}

function getUserId(req) {
    if (req.query.userId) return req.query.userId;
    if (req.body.userId) return req.body.userId;
    if (req.session && req.session.userId) return req.session.userId;
    return null;
}

// GET /api/favorites
router.get('/', (req, res) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'User ID diperlukan' });

    const sql = `
        SELECT 
            f.id, 
            f.user_id, 
            f.product_id, 
            f.created_at,
            p.name, 
            p.price, 
            p.old_price, 
            p.rating, 
            p.sold,
            pd.image1 AS image_url,
            pd.weight,
            pd.stock
        FROM favorites f
        JOIN products p ON f.product_id = p.id
        LEFT JOIN product_details pd ON p.id = pd.product_id
        WHERE f.user_id = ?
        ORDER BY f.created_at DESC
    `;
    
    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error('Error fetch favorites:', err);
            return res.status(500).json({ error: 'Gagal mengambil favorit' });
        }
        
        const baseUrl = getBaseUrl(req);
        const favorites = results.map(row => ({
            id: row.product_id,
            name: row.name,
            price: row.price,
            oldPrice: row.old_price,
            imageUrl: row.image_url 
                ? `${baseUrl}/uploads/product_details/${row.image_url}` 
                : null,
            rating: row.rating || 0,
            sold: row.sold || 0,
            weight: row.weight || 500,
            stock: row.stock || 0,
            favoriteId: row.id,
            createdAt: row.created_at
        }));
        
        res.json(favorites);
    });
});

router.post('/', (req, res) => {
    const userId = getUserId(req);
    const { productId } = req.body;
    
    if (!userId || !productId) {
        return res.status(400).json({ error: 'Missing data: userId dan productId diperlukan' });
    }

    const checkProductSql = `
        SELECT p.id, pd.image1 
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

        const checkSql = 'SELECT id FROM favorites WHERE user_id = ? AND product_id = ?';
        db.query(checkSql, [userId, productId], (err, rows) => {
            if (err) {
                console.error('Error check favorite:', err);
                return res.status(500).json({ error: err.message });
            }
            
            if (rows.length > 0) {
                return res.status(409).json({ error: 'Already favorited' });
            }

            const insertSql = 'INSERT INTO favorites (user_id, product_id) VALUES (?, ?)';
            db.query(insertSql, [userId, productId], (err, result) => {
                if (err) {
                    console.error('Error insert favorite:', err);
                    return res.status(500).json({ error: err.message });
                }
                
                res.status(201).json({ 
                    success: true,
                    message: 'Berhasil ditambahkan ke favorit', 
                    favoriteId: result.insertId 
                });
            });
        });
    });
});

router.delete('/:productId', (req, res) => {
    const userId = getUserId(req);
    const productId = req.params.productId;
    
    if (!userId || !productId) {
        return res.status(400).json({ error: 'Missing data: userId dan productId diperlukan' });
    }

    const sql = 'DELETE FROM favorites WHERE user_id = ? AND product_id = ?';
    db.query(sql, [userId, productId], (err, result) => {
        if (err) {
            console.error('Error delete favorite:', err);
            return res.status(500).json({ error: err.message });
        }
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Favorit tidak ditemukan' });
        }
        
        res.json({ 
            success: true,
            message: 'Berhasil dihapus dari favorit' 
        });
    });
});

router.get('/check', (req, res) => {
    const { userId, productId } = req.query;
    
    if (!userId || !productId) {
        return res.status(400).json({ error: 'Missing data: userId dan productId diperlukan' });
    }

    const sql = 'SELECT id FROM favorites WHERE user_id = ? AND product_id = ?';
    db.query(sql, [userId, productId], (err, rows) => {
        if (err) {
            console.error('Error check favorite:', err);
            return res.status(500).json({ error: err.message });
        }
        
        res.json({ isFavorited: rows.length > 0 });
    });
});

module.exports = router;