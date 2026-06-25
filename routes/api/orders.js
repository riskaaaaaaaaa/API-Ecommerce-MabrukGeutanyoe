const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { v4: uuidv4 } = require('uuid');
const { createNotification, sendPushNotification } = require('../notifications'); // <-- TAMBAHKAN INI

// Helper: generate order number
function generateOrderNumber() {
    return 'ORD-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// ================= TAMBAH: FUNGSI KIRIM NOTIFIKASI STATUS PESANAN =================
async function sendOrderStatusNotification(userId, userEmail, orderNumber, oldStatus, newStatus, orderData = {}) {
    let title = '';
    let message = '';
    let type = 'order';
    
    switch (newStatus) {
        case 'pending':
            title = '⏳ Pesanan Sedang Dikemas';
            message = `Pesanan ${orderNumber} menunggu di diproses. Segera selesaikan pembayaran Jika Memilih Metode Pembayaran Transfer agar pesanan diproses Pengiriman!`;
            break;
        case 'process':
            title = '📦 Pesanan Sedang Diproses';
            message = `Hore! Pesanan ${orderNumber} sudah kami terima dan sedang kami kemas. Terima kasih telah berbelanja!`;
            break;
        case 'shipped':
            title = '🚚 Pesanan Sedang Dikirim';
            const awbInfo = orderData.awb_number ? ` dengan No Resi: ${orderData.awb_number}` : '';
            message = `Pesanan ${orderNumber} sedang dalam perjalanan${awbInfo}. Silakan lacak pengiriman Anda.`;
            break;
        case 'completed':
            title = '✅ Pesanan Selesai';
            message = `Pesanan ${orderNumber} telah selesai. Bagaimana pengalaman belanja Anda? Beri ulasan dan dapatkan poin reward! ⭐`;
            break;
        case 'cancelled':
            title = '❌ Pesanan Dibatalkan';
            message = `Pesanan ${orderNumber} dibatalkan. Jika ada kendala, silakan hubungi customer service kami.`;
            break;
        default:
            title = `📝 Update Pesanan ${orderNumber}`;
            message = `Status pesanan Anda berhasil diperbarui menjadi ${newStatus}.`;
    }
    
    try {
        if (userId) {
            await createNotification(userId, title, message, type, orderNumber, 'order_number');
        }
        if (userEmail) {
            await sendPushNotification(userEmail, title, message, { 
                type: 'order',
                order_id: orderNumber,
                status: newStatus
            });
        }
        console.log(`✅ Notifikasi status order ${orderNumber} dikirim: ${newStatus}`);
        return true;
    } catch (error) {
        console.error('Error sending order notification:', error);
        return false;
    }
}

// ================= GET ALL ORDERS =================
router.get('/', (req, res) => {
    const sql = `
        SELECT o.*, u.name as user_name 
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.id DESC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Gagal mengambil data order' });
        }
        res.json(results);
    });
});

// ================= GET ORDER BY ID (detail + items) =================
router.get('/:id', (req, res) => {
    const orderId = req.params.id;
    const orderSql = `SELECT * FROM orders WHERE id = ?`;
    db.query(orderSql, [orderId], (err, orderRows) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Gagal mengambil detail order' });
        }
        if (orderRows.length === 0) {
            return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
        }
        const itemsSql = `SELECT * FROM order_items WHERE order_id = ?`;
        db.query(itemsSql, [orderId], (err2, itemsRows) => {
            if (err2) {
                console.error(err2);
                return res.status(500).json({ success: false, message: 'Gagal mengambil item order' });
            }
            res.json({
                success: true,
                order: orderRows[0],
                items: itemsRows
            });
        });
    });
});

// ================= CREATE ORDER (dari Flutter) =================
router.post('/', async (req, res) => {
    const {
        user_id,
        customer_name,
        phone,
        address,
        city,
        postal_code,
        shipping_method,
        shipping_cost,
        handling_fee,
        payment_method,
        subtotal,
        discount,
        total,
        message,
        items
    } = req.body;

    if (!customer_name || !phone || !address || !items || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Data tidak lengkap' });
    }

    // Helper untuk menjalankan query dalam bentuk Promise
    const query = (sql, params) => {
        return new Promise((resolve, reject) => {
            db.query(sql, params, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    };

    try {
        // 1. Validasi stok untuk setiap item
        for (const item of items) {
            const rows = await query('SELECT stock FROM product_details WHERE product_id = ?', [item.product_id]);
            if (rows.length === 0) {
                return res.status(400).json({ success: false, message: `Produk ID ${item.product_id} tidak memiliki data stok` });
            }
            const stock = rows[0].stock;
            if (stock < item.quantity) {
                return res.status(400).json({ success: false, message: `Stok produk ${item.name} tidak mencukupi (tersisa ${stock})` });
            }
        }

        // 2. Cari user_id integer dari uid jika diperlukan
        let actualUserId = null;
        let userEmail = null; // <-- TAMBAH: untuk notifikasi
        
        if (user_id) {
            if (/^\d+$/.test(String(user_id))) {
                actualUserId = parseInt(user_id);
                // TAMBAH: ambil email user
                const userRows = await query('SELECT email FROM users WHERE id = ?', [actualUserId]);
                if (userRows.length > 0) userEmail = userRows[0].email;
            } else {
                const userRows = await query('SELECT id, email FROM users WHERE uid = ?', [user_id]);
                if (userRows.length > 0) {
                    actualUserId = userRows[0].id;
                    userEmail = userRows[0].email; // TAMBAH: ambil email
                }
            }
        }

        const orderNumber = generateOrderNumber();
        
        // 🔥 Tentukan status awal berdasarkan metode pembayaran
        // COD langsung "process" (Dikemas), Transfer "pending" (Belum Bayar)
        let status = 'pending';
        if (payment_method === 'COD') {
            status = 'process';
        }

        // 3. Insert order
        const insertOrderSql = `
            INSERT INTO orders (
                order_number, user_id, customer_name, phone, address, city, postal_code,
                shipping_method, shipping_cost, handling_fee, payment_method,
                subtotal, discount, total, message, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const orderResult = await query(insertOrderSql, [
            orderNumber, actualUserId, customer_name, phone, address, city, postal_code,
            shipping_method, shipping_cost, handling_fee, payment_method,
            subtotal, discount, total, message || null, status
        ]);
        const orderId = orderResult.insertId;

        // 4. Insert order_items
        const insertItemsSql = `INSERT INTO order_items (order_id, product_id, name, quantity, price, total) VALUES ?`;
        const itemsValues = items.map(item => [orderId, item.product_id, item.name, item.quantity, item.price, item.total]);
        await query(insertItemsSql, [itemsValues]);

        // 5. Update stok dan sold
        const updatePromises = items.map(item => {
            const decStock = query('UPDATE product_details SET stock = stock - ? WHERE product_id = ?', [item.quantity, item.product_id]);
            const incSold = query('UPDATE products SET sold = sold + ? WHERE id = ?', [item.quantity, item.product_id]);
            return Promise.all([decStock, incSold]);
        });
        await Promise.all(updatePromises);

        // ========== TAMBAH: KIRIM NOTIFIKASI PESANAN BARU ==========
        if (actualUserId && userEmail) {
            await sendOrderStatusNotification(actualUserId, userEmail, orderNumber, null, status);
        }

        res.status(201).json({ success: true, message: 'Order berhasil dibuat', order_id: orderId, order_number: orderNumber });

    } catch (err) {
        console.error(err);
        // Jika error, hapus order yang sudah terlanjur insert (jika ada)
        if (err.sqlMessage) {
            // Hapus items dan order jika sudah terlanjur insert
            await query('DELETE FROM order_items WHERE order_id = ?', [orderId]).catch(()=>{});
            await query('DELETE FROM orders WHERE id = ?', [orderId]).catch(()=>{});
        }
        return res.status(500).json({ success: false, message: 'Gagal memproses pesanan: ' + err.message });
    }
});

// ================= UPDATE ORDER STATUS (DENGAN NOTIFIKASI) =================
router.put('/:id', async (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'process', 'shipped', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
        return res.status(400).json({ success: false, message: 'Status tidak valid' });
    }
    
    const orderId = req.params.id;
    
    // TAMBAH: Ambil data order sebelum update untuk mendapatkan user_id, email, dan order_number
    db.query(
        'SELECT o.*, u.email as user_email, u.id as user_id FROM orders o LEFT JOIN users u ON o.user_id = u.id WHERE o.id = ?', 
        [orderId], 
        async (err, orderRows) => {
            if (err) return res.status(500).json({ success: false, message: 'Database error' });
            if (orderRows.length === 0) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
            
            const oldOrder = orderRows[0];
            const oldStatus = oldOrder.status;
            
            // Jika status sama, tidak perlu update
            if (oldStatus === status) {
                return res.json({ success: true, message: 'Status sudah sama, tidak ada perubahan' });
            }
            
            // Update status
            const sql = `UPDATE orders SET status = ? WHERE id = ?`;
            db.query(sql, [status, orderId], async (err2, result) => {
                if (err2) return res.status(500).json({ success: false, message: 'Database error' });
                if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
                
                // ========== TAMBAH: KIRIM NOTIFIKASI PERUBAHAN STATUS ==========
                if (oldOrder.user_id && oldOrder.user_email) {
                    await sendOrderStatusNotification(
                        oldOrder.user_id, 
                        oldOrder.user_email, 
                        oldOrder.order_number, 
                        oldStatus, 
                        status,
                        { awb_number: oldOrder.awb_number }
                    );
                }
                
                res.json({ success: true, message: 'Status berhasil diupdate' });
            });
        }
    );
});

// ================= DELETE ORDER =================
router.delete('/:id', (req, res) => {
    const orderId = req.params.id;
    const sql = `DELETE FROM orders WHERE id = ?`;
    db.query(sql, [orderId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ success: false, message: 'Gagal hapus order' });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
        }
        res.json({ success: true, message: 'Order berhasil dihapus' });
    });
});

// ================= GET ORDERS BY USER UID =================
router.get('/user/:uid', (req, res) => {
    const uid = req.params.uid;
    db.query('SELECT id FROM users WHERE uid = ?', [uid], (err, rows) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Gagal cari user' });
        }
        if (rows.length === 0) {
            return res.json([]);
        }
        const userId = rows[0].id;
        const sql = `
            SELECT o.*, u.name as user_name 
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            WHERE o.user_id = ?
            ORDER BY o.id DESC
        `;
        db.query(sql, [userId], (err2, results) => {
            if (err2) {
                return res.status(500).json({ success: false, message: 'Gagal ambil order' });
            }
            res.json(results);
        });
    });
});

// ================= TRACKING ORDER (GET) =================
router.get('/:id/tracking', async (req, res) => {
    const { id } = req.params;
    
    try {
        // Cek apakah order memiliki no resi
        const orderSql = `SELECT awb_number, shipping_method, status FROM orders WHERE id = ?`;
        db.query(orderSql, [id], async (err, orderRows) => {
            if (err) {
                return res.status(500).json({ success: false, message: 'Database error' });
            }
            if (orderRows.length === 0) {
                return res.status(404).json({ success: false, message: 'Order tidak ditemukan' });
            }
            
            const order = orderRows[0];
            
            if (!order.awb_number) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'No resi belum tersedia. Pesanan masih diproses.' 
                });
            }
            
            // Untuk development: return dummy tracking
            // Nanti jika sudah pakai pro, panggil API tracking real
            const trackingData = generateDummyTracking(order.awb_number);
            
            res.json({
                success: true,
                order_id: id,
                awb_number: order.awb_number,
                shipping_method: order.shipping_method,
                tracking: trackingData
            });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Fungsi generate dummy tracking (UNTUK PENGEMBANGAN)
function generateDummyTracking(awbNumber) {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    return {
        status: 'IN_TRANSIT',
        courier: awbNumber.startsWith('JNE') ? 'JNE' : (awbNumber.startsWith('POS') ? 'POS' : 'TIKI'),
        service: 'REG',
        origin: 'Jakarta Pusat, DKI Jakarta',
        destination: 'Surabaya, Jawa Timur',
        weight: '1 kg',
        estimated_delivery: new Date(now.setDate(now.getDate() + 2)).toISOString().split('T')[0],
        history: [
            {
                date: threeDaysAgo.toISOString(),
                status: 'Paket telah diterima oleh kurir',
                location: 'Jakarta Selatan',
                description: 'Paket telah diterima oleh kurir cabang Jakarta'
            },
            {
                date: twoDaysAgo.toISOString(),
                status: 'Dalam perjalanan',
                location: 'Cikarang, Jawa Barat',
                description: 'Paket sedang dalam perjalanan menuju kota tujuan'
            },
            {
                date: yesterday.toISOString(),
                status: 'Dikirim dari pusat sortir',
                location: 'Jakarta Pusat',
                description: 'Paket telah dikirim dari pusat sortir Jakarta'
            },
            {
                date: now.toISOString(),
                status: 'Tiba di kota tujuan',
                location: 'Surabaya, Jawa Timur',
                description: 'Paket telah tiba di cabang Surabaya dan akan segera dikirim ke alamat tujuan'
            }
        ]
    };
}

module.exports = router;