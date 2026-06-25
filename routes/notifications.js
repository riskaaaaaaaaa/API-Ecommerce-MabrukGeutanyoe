// FILE: routes/notifications.js (LENGKAP)
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { admin } = require('../config/firebase');

// ================= HELPER FUNCTIONS =================
function formatTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays === 1) return 'Kemarin';
    return `${diffDays} hari lalu`;
}

function formatRupiah(number) {
    return 'Rp ' + parseInt(number).toLocaleString('id-ID');
}

// Fungsi untuk membuat notifikasi (bisa dipanggil dari file lain)
function createNotification(userId, title, message, type, referenceId = null, referenceType = null, imageUrl = null) {
    return new Promise((resolve, reject) => {
        db.query(
            `INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type, image_url) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, title, message, type, referenceId, referenceType, imageUrl],
            (err, result) => {
                if (err) reject(err);
                resolve(result.insertId);
            }
        );
    });
}

// Fungsi kirim push notification via FCM
async function sendPushNotification(userEmail, title, body, data = {}) {
    try {
        // Ambil FCM token dari Firestore
        const tokenDoc = await admin.firestore().collection('fcm_tokens').doc(userEmail).get();
        const fcmToken = tokenDoc.exists ? tokenDoc.data().token : null;
        
        if (!fcmToken) {
            console.log(`No FCM token for ${userEmail}`);
            return false;
        }
        
        const message = {
            notification: { 
                title: title,
                body: body,
                clickAction: 'FLUTTER_NOTIFICATION_CLICK'
            },
            data: {
                type: data.type || 'promo',
                click_action: 'FLUTTER_NOTIFICATION_CLICK',
                ...data
            },
            token: fcmToken,
        };
        
        const response = await admin.messaging().send(message);
        console.log('Push notification sent to:', userEmail);
        return true;
    } catch (error) {
        console.error('Error sending push to', userEmail, ':', error.message);
        return false;
    }
}

// ================= API ENDPOINTS =================

// GET - Ambil semua notifikasi user
router.get('/notifications', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        // Ambil user_id dari email
        const userResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM users WHERE email = ?', [userEmail], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        if (userResult.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const userId = userResult[0].id;
        const { type, limit = 50, offset = 0 } = req.query;
        
        let query = 'SELECT * FROM notifications WHERE user_id = ?';
        let params = [userId];
        
        if (type && type !== 'all') {
            query += ' AND type = ?';
            params.push(type);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        db.query(query, params, async (err, notifications) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: err.message });
            }
            
            const formattedNotif = notifications.map(n => ({
                id: n.id.toString(),
                title: n.title,
                message: n.message,
                time: formatTimeAgo(n.created_at),
                isRead: n.is_read === 1,
                type: n.type,
                imageUrl: n.image_url,
                referenceId: n.reference_id,
                referenceType: n.reference_type,
                createdAt: n.created_at
            }));
            
            db.query(
                'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
                [userId],
                (err, unreadResult) => {
                    if (err) console.error(err);
                    res.json({
                        success: true,
                        data: formattedNotif,
                        unreadCount: unreadResult[0]?.count || 0,
                        hasMore: notifications.length === parseInt(limit)
                    });
                }
            );
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT - Tandai notifikasi dibaca
router.put('/notifications/:id/read', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const userResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM users WHERE email = ?', [userEmail], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        if (userResult.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const userId = userResult[0].id;
        const { id } = req.params;
        
        db.query(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
            [id, userId],
            (err, result) => {
                if (err) {
                    return res.status(500).json({ success: false, message: err.message });
                }
                res.json({ success: true, message: 'Notification marked as read' });
            }
        );
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT - Tandai semua dibaca
router.put('/notifications/read-all', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const userResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM users WHERE email = ?', [userEmail], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        if (userResult.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const userId = userResult[0].id;
        
        db.query(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
            [userId],
            (err, result) => {
                if (err) {
                    return res.status(500).json({ success: false, message: err.message });
                }
                res.json({ success: true, message: 'All notifications marked as read' });
            }
        );
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE - Hapus notifikasi
router.delete('/notifications/:id', async (req, res) => {
    try {
        const userEmail = req.headers['x-user-email'];
        if (!userEmail) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        const userResult = await new Promise((resolve, reject) => {
            db.query('SELECT id FROM users WHERE email = ?', [userEmail], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        if (userResult.length === 0) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const userId = userResult[0].id;
        const { id } = req.params;
        
        db.query(
            'DELETE FROM notifications WHERE id = ? AND user_id = ?',
            [id, userId],
            (err, result) => {
                if (err) {
                    return res.status(500).json({ success: false, message: err.message });
                }
                res.json({ success: true, message: 'Notification deleted' });
            }
        );
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ================= ADMIN: Kirim Notifikasi Massal =================
router.post('/admin/send-notification', async (req, res) => {
    try {
        const { title, message, type, image_url } = req.body;
        
        if (!title || !message) {
            return res.status(422).json({ success: false, message: 'Title dan message wajib diisi' });
        }
        
        // Ambil semua user
        const users = await new Promise((resolve, reject) => {
            db.query('SELECT id, email FROM users', (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        let successCount = 0;
        
        for (const user of users) {
            try {
                await createNotification(user.id, title, message, type || 'promo', null, null, image_url);
                await sendPushNotification(user.email, title, message, { type: type || 'promo' });
                successCount++;
            } catch (notifError) {
                console.error(`Failed for user ${user.id}:`, notifError);
            }
        }
        
        res.json({
            success: true,
            message: `Notifikasi dikirim ke ${successCount} user`,
            total: users.length
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ================= ADMIN: Kirim Notifikasi ke User Tertentu =================
router.post('/admin/send-notification-to-user', async (req, res) => {
    try {
        const { email, title, message, type, image_url } = req.body;
        
        if (!email || !title || !message) {
            return res.status(422).json({ success: false, message: 'Email, title, dan message wajib diisi' });
        }
        
        const userResult = await new Promise((resolve, reject) => {
            db.query('SELECT id, email FROM users WHERE email = ?', [email], (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        if (userResult.length === 0) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan' });
        }
        
        const user = userResult[0];
        
        await createNotification(user.id, title, message, type || 'promo', null, null, image_url);
        await sendPushNotification(user.email, title, message, { type: type || 'promo' });
        
        res.json({
            success: true,
            message: `Notifikasi dikirim ke ${user.email}`
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ================= ADMIN STATISTIK =================
router.get('/admin/notifications/stats', async (req, res) => {
    try {
        const [totalSent] = await new Promise((resolve, reject) => {
            db.query('SELECT COUNT(*) as count FROM notifications', (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        const [totalRead] = await new Promise((resolve, reject) => {
            db.query('SELECT COUNT(*) as count FROM notifications WHERE is_read = 1', (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        const byType = await new Promise((resolve, reject) => {
            db.query('SELECT type, COUNT(*) as count FROM notifications GROUP BY type', (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        const typeStats = {};
        byType.forEach(row => { typeStats[row.type] = row.count; });
        
        const [totalUsers] = await new Promise((resolve, reject) => {
            db.query('SELECT COUNT(*) as count FROM users', (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        res.json({
            totalSent: totalSent.count,
            totalRead: totalRead.count,
            byType: typeStats,
            totalUsers: totalUsers.count
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ================= ADMIN RIWAYAT NOTIFIKASI =================
router.get('/admin/notifications/history', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const filterType = req.query.type;
        
        let query = `
            SELECT n.*, 
                   (SELECT COUNT(*) FROM users) as total_users,
                   (SELECT COUNT(*) FROM notifications WHERE id = n.id AND is_read = 1) as read_count
            FROM notifications n
        `;
        let params = [];
        
        if (filterType && filterType !== 'all') {
            query += ' WHERE n.type = ?';
            params.push(filterType);
        }
        
        query += ' ORDER BY n.created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const notifications = await new Promise((resolve, reject) => {
            db.query(query, params, (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        const [totalCount] = await new Promise((resolve, reject) => {
            let countQuery = 'SELECT COUNT(*) as count FROM notifications';
            let countParams = [];
            if (filterType && filterType !== 'all') {
                countQuery += ' WHERE type = ?';
                countParams.push(filterType);
            }
            db.query(countQuery, countParams, (err, results) => {
                if (err) reject(err);
                resolve(results);
            });
        });
        
        res.json({
            data: notifications,
            total: totalCount.count,
            page: page,
            totalPages: Math.ceil(totalCount.count / limit)
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE admin notifikasi
router.delete('/admin/notifications/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        await new Promise((resolve, reject) => {
            db.query('DELETE FROM notifications WHERE id = ?', [id], (err, result) => {
                if (err) reject(err);
                resolve(result);
            });
        });
        
        res.json({ success: true, message: 'Notifikasi dihapus' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = { router, createNotification, sendPushNotification };