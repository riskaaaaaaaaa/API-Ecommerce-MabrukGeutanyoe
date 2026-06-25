function isAdmin(req, res, next) {
  if (req.session.isAdminLoggedIn) {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized, silakan login admin terlebih dahulu' });
  }
}

module.exports = isAdmin;