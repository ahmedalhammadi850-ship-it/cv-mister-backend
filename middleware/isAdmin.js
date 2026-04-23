// ============================================================
// CV-Mister — Admin Middleware
// Strict validation for admin routes only
// ============================================================

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cv-mister-luxe-secret-2026';

const isAdmin = (req, res, next) => {
  let token;
  
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Strict check: Must be admin role and ahmedyes username
      if (decoded.role === 'admin' && decoded.username === 'ahmedyes') {
        req.user = decoded; // Store admin in request
        return next();
      }
    } catch (err) {
      // Token verification failed or corrupted
      console.error('[Admin Middleware] Token Error:', err.message);
    }
  }
  
  // If we reach here, it's either no token, invalid token, or wrong user.
  // We send a 403 Forbidden with a redirect flag so the frontend can redirect to "/"
  return res.status(403).json({ 
    error: 'Access Denied', 
    redirect: '/' 
  });
};

module.exports = { isAdmin };
