const { auth, db } = require('../config/firebase');
const FieldValue = require('firebase-admin').firestore.FieldValue; // tambahkan ini
const admin = require('firebase-admin');
const mysqlDb = require('../config/db');        // <-- tambahkan koneksi MySQL
const mysqlPromise = mysqlDb.promise();     // <-- buat koneksi MySQL dengan promise

exports.adminLogin = (req, res) => {
  const { email, password } = req.body;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@rabbani.com';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.isAdminLoggedIn = true;
    res.status(200).json({ message: 'Login admin berhasil' });
  } else {
    res.status(401).json({ message: 'Email atau password admin salah' });
  }
};

exports.adminLogout = (req, res) => {
  req.session.destroy();
  res.status(200).json({ message: 'Logout berhasil' });
};

exports.getAllUsers = async (req, res) => {
  try {
    // Sementara tanpa orderBy untuk debugging
    const snapshot = await db.collection('user').get();
    const users = [];
    snapshot.forEach(doc => {
      users.push({ id: doc.id, ...doc.data() });
    });
    console.log(`Jumlah user ditemukan: ${users.length}`); // log di server
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil data user' });
  }
};

exports.getUserByEmail = async (req, res) => {
  try {
    const email = req.params.email;
    const doc = await db.collection('user').doc(email).get();
    if (!doc.exists) return res.status(404).json({ message: 'User tidak ditemukan' });
    res.json({ id: doc.id, ...doc.data() });
  } catch (error) {
    res.status(500).json({ message: 'Error' });
  }
};


exports.createUser = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(422).json({ message: 'Nama, email dan password wajib diisi' });
  }
  if (password.length < 6) {
    return res.status(422).json({ message: 'Password minimal 6 karakter' });
  }

  try {
    // Cek apakah email sudah terdaftar di Firebase Auth
    const existingUser = await auth.getUserByEmail(email).catch(() => null);
    if (existingUser) {
      return res.status(400).json({ message: 'Email sudah terdaftar' });
    }

    // 1. Buat user di Firebase Authentication
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    // 2. Simpan ke Firestore (collection user)
    await db.collection('user').doc(email).set({
      name,
      email,
      uid: userRecord.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 3. Simpan ke MySQL (tambahan, tanpa mengganggu response jika gagal)
    try {
      await mysqlPromise.query(
        'INSERT INTO users (uid, name, email, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
        [userRecord.uid, name, email]
      );
    } catch (mysqlError) {
      console.error('❌ Gagal menyimpan user ke MySQL:', mysqlError.message);
      // Tidak mengembalikan error ke client, cukup log
    }

    res.status(201).json({
      message: 'User berhasil ditambahkan',
      user: { name, email, uid: userRecord.uid }
    });
  } catch (error) {
    console.error('Error createUser:', error);
    res.status(500).json({ message: error.message });
  }
};

exports.updateUser = async (req, res) => {
  const email = req.params.email;
  const { name, password } = req.body;
  try {
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;

    // Update di Firebase Auth
    if (name) await auth.updateUser(uid, { displayName: name });
    if (password && password.length >= 6) await auth.updateUser(uid, { password });

    // Update di Firestore
    const updateData = {};
    if (name) updateData.name = name;
    if (Object.keys(updateData).length > 0) {
      await db.collection('user').doc(email).update(updateData);
    }

    // Update di MySQL (tambahan)
    try {
      if (name) {
        await mysqlPromise.query(
          'UPDATE users SET name = ?, updated_at = NOW() WHERE uid = ?',
          [name, uid]
        );
      }
    } catch (mysqlError) {
      console.error('❌ Gagal update user di MySQL:', mysqlError.message);
    }

    res.json({ message: 'User berhasil diupdate' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteUser = async (req, res) => {
  const email = req.params.email;
  try {
    const userRecord = await auth.getUserByEmail(email);
    const uid = userRecord.uid;

    // Hapus dari Firebase Auth
    await auth.deleteUser(uid);
    // Hapus dari Firestore
    await db.collection('user').doc(email).delete();

    // Hapus dari MySQL (tambahan)
    try {
      await mysqlPromise.query('DELETE FROM users WHERE uid = ?', [uid]);
    } catch (mysqlError) {
      console.error('❌ Gagal hapus user dari MySQL:', mysqlError.message);
    }

    res.json({ message: 'User berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ========== CHAT ADMIN ==========
// ========== CHAT ADMIN (tanpa indeks) ==========
exports.getChatUsers = async (req, res) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rabbani.com';
  try {
    // Ambil SEMUA pesan (tanpa where)
    const snapshot = await db.collection('messages').get();
    const messages = [];
    snapshot.forEach(doc => messages.push({ id: doc.id, ...doc.data() }));
    
    // Filter pesan yang melibatkan admin
    const relevantMessages = messages.filter(msg => 
      msg.sender === adminEmail || msg.receiver === adminEmail
    );
    
    // Kumpulkan user unik
    const userMap = new Map();
    for (const msg of relevantMessages) {
      const userEmail = msg.sender === adminEmail ? msg.receiver : msg.sender;
      if (userEmail === adminEmail) continue;
      const msgTime = msg.timestamp?.toDate() || new Date(0);
      if (!userMap.has(userEmail) || msgTime > userMap.get(userEmail).lastTime) {
        let name = userEmail.split('@')[0];
        try {
          const userDoc = await db.collection('user').doc(userEmail).get();
          if (userDoc.exists) name = userDoc.data().name || name;
        } catch(e) {}
        userMap.set(userEmail, {
          email: userEmail,
          name: name,
          lastMessage: msg.message || '',
          lastTime: msgTime
        });
      }
    }
    const users = Array.from(userMap.values());
    users.sort((a,b) => b.lastTime - a.lastTime);
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil daftar pengguna chat' });
  }
};

exports.getMessagesWithUser = async (req, res) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rabbani.com';
  const userEmail = req.params.userEmail;
  try {
    // Ambil semua pesan, filter di memori
    const snapshot = await db.collection('messages').get();
    const messages = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if ((data.sender === adminEmail && data.receiver === userEmail) ||
          (data.sender === userEmail && data.receiver === adminEmail)) {
        messages.push({
          id: doc.id,
          text: data.message,
          isUser: data.sender === userEmail,
          time: data.timestamp?.toDate() || new Date(),
          sender: data.sender
        });
      }
    });
    // Urutkan berdasarkan waktu
    messages.sort((a,b) => a.time - b.time);
    res.json(messages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Gagal mengambil pesan' });
  }
};

exports.sendMessageToUser = async (req, res) => {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rabbani.com';
  const { userEmail, message } = req.body;
  console.log(`📨 Send to ${userEmail}: ${message}`); // cek log server

  if (!userEmail || !message || message.trim() === '') {
    return res.status(422).json({ message: 'User email dan pesan wajib diisi' });
  }

  try {
    const docRef = await db.collection('messages').add({
      sender: adminEmail,
      receiver: userEmail,
      message: message.trim(),
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`✅ Pesan terkirim, ID: ${docRef.id}`);
    res.status(201).json({ message: 'Pesan terkirim', id: docRef.id });
  } catch (error) {
    console.error('❌ Gagal kirim:', error);
    res.status(500).json({ message: error.message });
  }
};