const express = require('express');
const router = express.Router();
const isAdmin = require('../middleware/isAdmin');
const adminController = require('../controllers/adminController');

router.post('/login', adminController.adminLogin);
router.post('/logout', adminController.adminLogout);
router.get('/users', isAdmin, adminController.getAllUsers);
router.get('/users/:email', isAdmin, adminController.getUserByEmail);
router.post('/users', isAdmin, adminController.createUser);
router.put('/users/:email', isAdmin, adminController.updateUser);
router.delete('/users/:email', isAdmin, adminController.deleteUser);
// Di dalam routes/admin.js, setelah route yang sudah ada, tambahkan:
router.get('/chats/users', isAdmin, adminController.getChatUsers);
router.get('/chats/messages/:userEmail', isAdmin, adminController.getMessagesWithUser);
router.post('/chats/send', isAdmin, adminController.sendMessageToUser);

module.exports = router;