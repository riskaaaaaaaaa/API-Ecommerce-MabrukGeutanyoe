const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/products';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Di product.js, ubah endpoint GET / (semua produk)
router.get('/', (req, res) => {
    const { category } = req.query;
    let sql = `
        SELECT 
            p.id,
            p.name,
            p.price,
            p.old_price,
            p.rating,
            p.sold,
            p.created_at,
            pd.image1 AS main_image,
            pd.weight  -- ✅ TAMBAHKAN INI
        FROM products p
        LEFT JOIN product_details pd ON p.id = pd.product_id
        WHERE 1=1
    `;
    const params = [];
    
    if (category) {
        sql += ` AND pd.category = ?`;
        params.push(category);
    }
    sql += ` ORDER BY p.id DESC`;
    
    db.query(sql, params, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err });
        }
        
        const products = results.map(item => ({
            id: item.id,
            name: item.name,
            price: item.price,
            old_price: item.old_price,
            rating: item.rating,
            sold: item.sold,
            weight: item.weight ?? 500, // ✅ TAMBAHKAN WEIGHT
            image: item.main_image 
                ? `http://192.168.1.3:8000/uploads/product_details/${item.main_image}` 
                : null,
            created_at: item.created_at
        }));
        
        res.json(products);
    });
});

router.get('/:id', (req, res) => {
    const id = req.params.id;
    const sql = `
        SELECT 
            p.id,
            p.name,
            p.price,
            p.old_price,
            p.rating,
            p.sold,
            p.created_at,
            pd.image1 AS main_image,
            pd.description,
            pd.material,
            pd.brand,
            pd.category,
            pd.stock,
            pd.weight,
            pd.sizes,
            pd.shipping_info,
            pd.specifications,
            pd.image1, pd.image2, pd.image3, pd.image4
        FROM products p
        LEFT JOIN product_details pd ON p.id = pd.product_id
        WHERE p.id = ?
    `;
    
    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err });
        }
        if (results.length === 0) {
            return res.status(404).json({ message: 'Produk tidak ditemukan' });
        }
        
        const product = results[0];
        res.json({
            id: product.id,
            name: product.name,
            price: product.price,
            old_price: product.old_price,
            rating: product.rating,
            sold: product.sold,
            image: product.main_image 
                ? `http://192.168.1.3:8000/uploads/product_details/${product.main_image}` 
                : null,
            details: product.description ? {
                description: product.description,
                material: product.material,
                brand: product.brand,
                category: product.category,
                stock: product.stock,
                weight: product.weight,
                sizes: product.sizes,
                shipping_info: product.shipping_info,
                specifications: product.specifications,
                images: [product.image1, product.image2, product.image3, product.image4].filter(Boolean)
            } : null
        });
    });
});


router.post('/', (req, res) => {
    const { name, price, old_price, rating, sold } = req.body;
    
    if (!name || !price) {
        return res.status(400).json({ message: 'Nama dan harga wajib diisi' });
    }
    
    const sql = `INSERT INTO products (name, price, old_price, rating, sold) VALUES (?, ?, ?, ?, ?)`;
    
    db.query(sql, [name, price, old_price || 0, rating || 0, sold || 0], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err });
        }
        res.json({ 
            success: true, 
            message: 'Produk berhasil ditambahkan',
            product_id: result.insertId 
        });
    });
});

router.put('/:id', (req, res) => {
    const id = req.params.id;
    const { name, price, old_price, rating, sold } = req.body;
    
    if (!name || !price) {
        return res.status(400).json({ message: 'Nama dan harga wajib diisi' });
    }
    
    const sql = `UPDATE products SET name=?, price=?, old_price=?, rating=?, sold=? WHERE id=?`;
    
    db.query(sql, [name, price, old_price || 0, rating || 0, sold || 0, id], (err) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: err });
        }
        res.json({ success: true, message: 'Produk berhasil diupdate' });
    });
});

// DELETE produk
router.delete('/:id', (req, res) => {
    const id = req.params.id;
    
    // Hapus detail terlebih dahulu (termasuk gambarnya)
    db.query('SELECT image1, image2, image3, image4 FROM product_details WHERE product_id=?', [id], (err, detailResult) => {
        if (err) {
            console.error(err);
            return res.status(500).json(err);
        }
        
        // Hapus file gambar detail jika ada
        if (detailResult.length > 0) {
            const images = [detailResult[0].image1, detailResult[0].image2, detailResult[0].image3, detailResult[0].image4];
            images.forEach(img => {
                if (img && fs.existsSync('uploads/product_details/' + img)) {
                    fs.unlinkSync('uploads/product_details/' + img);
                }
            });
        }
        
        db.query('DELETE FROM product_details WHERE product_id=?', [id], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).json(err);
            }
            
            db.query('DELETE FROM products WHERE id=?', [id], (err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json(err);
                }
                res.json({ success: true, message: 'Produk berhasil dihapus' });
            });
        });
    });
});

module.exports = router;