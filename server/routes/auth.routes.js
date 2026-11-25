const express = require('express');
const AuthController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { authLimiter, loginLimiter } = require('../middleware/rate-limit.middleware');

const router = express.Router();

router.post('/register', authLimiter, AuthController.register);
router.get('/verify-email', AuthController.verifyEmail);
router.post('/resend-verification', authLimiter, AuthController.resendVerification);
router.post('/login', loginLimiter, AuthController.login);
router.post('/logout', AuthController.logout);
router.get('/me', authMiddleware, AuthController.me);
router.post('/forgot-password', authLimiter, AuthController.forgotPassword);
router.post('/reset-password', authLimiter, AuthController.resetPassword);

module.exports = router;
