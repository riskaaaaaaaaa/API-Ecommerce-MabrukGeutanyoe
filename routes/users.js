const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const BASE_URL = 'http://192.168.1.3:8000';

// Inisialisasi Firebase Admin (jika belum)
if (!admin.apps.length) {
  const serviceAccount = require('../serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// Konfigurasi upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/users';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueName + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

const deleteFile = (filePath) => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
};

// Helper: cari user berdasarkan id integer atau uid string
const findUserByIdentifier = (identifier, callback) => {
    const isNumeric = /^\d+$/.test(identifier);
    let field = isNumeric ? 'id' : 'uid';
    db.query(`SELECT * FROM users WHERE ${field} = ?`, [identifier], callback);
};

// Helper: Sync ke Firebase Auth & Firestore (collection: user)
async function syncToFirebase(userData, isDelete = false) {
  try {
    if (isDelete) {
      // Hapus dari Firebase Auth
      try {
        const userRecord = await admin.auth().getUserByEmail(userData.email);
        await admin.auth().deleteUser(userRecord.uid);
        console.log(`✅ User ${userData.email} deleted from Firebase Auth`);
      } catch (e) { 
        console.log('User not found in Firebase Auth:', e.message);
      }
      
      // Hapus dari Firestore (collection: user)
      await admin.firestore().collection('user').doc(userData.email).delete();
      console.log(`✅ User ${userData.email} deleted from Firestore (user collection)`);
      return;
    }

    // Update/Create ke Firebase Auth
    let firebaseUid;
    try {
      const userRecord = await admin.auth().getUserByEmail(userData.email);
      firebaseUid = userRecord.uid;
      await admin.auth().updateUser(firebaseUid, {
        displayName: userData.name,
        emailVerified: true,
      });
      console.log(`✅ User ${userData.email} updated in Firebase Auth`);
    } catch (e) {
      // User tidak ada di Firebase Auth, buat baru
      const newUser = await admin.auth().createUser({
        email: userData.email,
        emailVerified: true,
        displayName: userData.name,
        password: userData.password || 'password123',
      });
      firebaseUid = newUser.uid;
      console.log(`✅ User ${userData.email} created in Firebase Auth`);
    }

    // Sync ke Firestore (collection: user)
    await admin.firestore().collection('user').doc(userData.email).set({
      uid: firebaseUid,
      name: userData.name,
      email: userData.email,
      phone: userData.phone || '',
      address: userData.address || '',
      photo: userData.photo || '',
      join_date: userData.join_date || new Date().toISOString(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`✅ User ${userData.email} synced to Firestore (user collection)`);

    return { success: true, firebaseUid };
  } catch (error) {
    console.error('❌ Sync to Firebase error:', error);
    return { success: false, error: error.message };
  }
}

// ==================== ROUTES ====================

// GET semua user (untuk admin panel)
router.get('/', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id DESC', (err, result) => {
        if (err) return res.status(500).json(err);
        res.json(result);
    });
});

// GET user berdasarkan id (integer) ATAU uid (string)
router.get('/:identifier', (req, res) => {
    const identifier = req.params.identifier;
    findUserByIdentifier(identifier, (err, result) => {
        if (err) return res.status(500).json(err);
        if (result.length === 0) return res.status(404).json({ message: 'User tidak ditemukan' });
        res.json(result[0]);
    });
});

// POST create user (registrasi dari Flutter atau admin)
router.post('/', upload.single('photo'), async (req, res) => {
    const { uid, name, email, phone, address, join_date, password } = req.body;
    let photo = '';
    if (req.file) photo = `${BASE_URL}/uploads/users/${req.file.filename}`;

    const finalUid = uid || `user_${Date.now()}_${Math.random().toString(36)}`;
    const finalJoinDate = join_date || new Date().toISOString();
    const finalPassword = password || 'password123';
    
    const sql = `INSERT INTO users (uid, name, email, phone, address, photo, join_date) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    
    db.query(sql, [finalUid, name, email, phone || '', address || '', photo, finalJoinDate], async (err, result) => {
        if (err) {
            console.error('MySQL Error:', err);
            return res.status(500).json({ error: err.message });
        }
        
        // Sync ke Firebase
        const syncResult = await syncToFirebase({
            name, 
            email, 
            phone: phone || '', 
            address: address || '', 
            photo, 
            join_date: finalJoinDate,
            password: finalPassword
        });
        
        res.json({ 
            success: true, 
            id: result.insertId, 
            uid: finalUid, 
            photo,
            firebaseSync: syncResult
        });
    });
});

// PUT update user (bisa pakai id integer atau uid)
router.put('/:identifier', upload.single('photo'), async (req, res) => {
    const { name, email, phone, address, join_date } = req.body;
    const identifier = req.params.identifier;

    findUserByIdentifier(identifier, async (err, users) => {
        if (err) return res.status(500).json(err);
        if (users.length === 0) return res.status(404).json({ message: 'User tidak ditemukan' });
        
        const user = users[0];
        const userId = user.id;
        let oldPhoto = user.photo || '';
        let photo = oldPhoto;

        if (req.file) {
            photo = `${BASE_URL}/uploads/users/${req.file.filename}`;
            if (oldPhoto) {
                const oldPath = path.join(__dirname, '..', oldPhoto.replace(BASE_URL + '/', ''));
                deleteFile(oldPath);
            }
        }

        const sql = `UPDATE users SET name=?, email=?, phone=?, address=?, photo=?, join_date=? WHERE id=?`;
        db.query(sql, [name, email, phone || '', address || '', photo, join_date || user.join_date, userId], async (err) => {
            if (err) return res.status(500).json(err);
            
            // Sync ke Firebase
            const syncResult = await syncToFirebase({
                name, 
                email, 
                phone: phone || '', 
                address: address || '', 
                photo, 
                join_date: join_date || user.join_date
            });
            
            res.json({ 
                success: true, 
                message: 'User berhasil diupdate', 
                photo,
                firebaseSync: syncResult
            });
        });
    });
});

// DELETE user (berdasarkan id integer atau uid)
router.delete('/:identifier', async (req, res) => {
    const identifier = req.params.identifier;
    findUserByIdentifier(identifier, async (err, users) => {
        if (err) return res.status(500).json(err);
        if (users.length === 0) return res.status(404).json({ message: 'User tidak ditemukan' });
        
        const user = users[0];
        const userId = user.id;
        const photo = user.photo;

        if (photo) {
            const filePath = path.join(__dirname, '..', photo.replace(BASE_URL + '/', ''));
            deleteFile(filePath);
        }
        
        // Sync ke Firebase (hapus)
        await syncToFirebase({ email: user.email }, true);
        
        db.query('DELETE FROM users WHERE id = ?', [userId], (err) => {
            if (err) return res.status(500).json(err);
            res.json({ success: true, message: 'User berhasil dihapus' });
        });
    });
});

module.exports = router;