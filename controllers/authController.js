const { auth, db, admin } = require('../config/firebase');
const { signInWithEmailPassword } = require('../utils/firebaseRest');

exports.register = async (req, res) => {
  const { name, email, password, password_confirmation } = req.body;
  // validasi sama seperti sebelumnya
  if (!name || !email || !password || !password_confirmation) {
    return res.status(422).json({ errors: { message: 'Semua field harus diisi' } });
  }
  if (password !== password_confirmation) {
    return res.status(422).json({ errors: { password_confirmation: 'Konfirmasi password tidak cocok' } });
  }
  if (password.length < 6) {
    return res.status(422).json({ errors: { password: 'Password minimal 6 karakter' } });
  }
  try {
    const userRecord = await auth.createUser({ email, password, displayName: name });
    await db.collection('user').doc(email).set({
      name, email, uid: userRecord.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.status(201).json({ message: 'Registrasi berhasil', user: { name, email } });
  } catch (error) {
    let errorMessage = 'Registrasi gagal';
    if (error.code === 'auth/email-already-exists') errorMessage = 'Email sudah terdaftar';
    res.status(400).json({ errors: { message: errorMessage } });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(422).json({ message: 'Email dan password harus diisi' });
  }
  try {
    // 1. Verifikasi kredensial ke Firebase Auth via REST
    await signInWithEmailPassword(email, password);

    // 2. Dapatkan data user dari Firestore (collection user)
    let userDoc = await db.collection('user').doc(email).get();
    let name = '';
    let uid = '';

    if (userDoc.exists) {
      name = userDoc.data().name;
      uid = userDoc.data().uid;
    } else {
      // Jika belum ada di Firestore, ambil dari Firebase Auth
      const userRecord = await auth.getUserByEmail(email);
      name = userRecord.displayName || email.split('@')[0];
      uid = userRecord.uid;
      // Simpan ke Firestore
      await db.collection('user').doc(email).set({
        name,
        email,
        uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 3. Kirim response tanpa JWT (cukup name, email, uid)
    res.status(200).json({ name, email, uid });
  } catch (error) {
    console.error(error);
    res.status(401).json({ message: error.message || 'Email atau password salah' });
  }
};