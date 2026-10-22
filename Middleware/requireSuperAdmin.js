module.exports = function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.platformRole !== 'super_admin') {
    return res.status(403).json({ success: false, message: 'Super Admin access required.' });
  }
  next();
};
