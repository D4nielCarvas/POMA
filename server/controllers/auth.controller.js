const AuthService = require('../services/auth.service');
const PasswordResetService = require('../services/password-reset.service');
const VerificationService = require('../services/verification.service');

const authService = new AuthService();
const resetService = new PasswordResetService();
const verificationService = new VerificationService();

class AuthController {
    static _setAuthCookie(res, token) {
        res.cookie('nexus_token', token, {
            httpOnly: true,
            signed: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 horas
        });
    }

    static async register(req, res, next) {
        try {
            const { name, email, password } = req.body;
            const result = await authService.register({ name, email, password });

            // Dispara e-mail de ativação/confirmação assincronamente
            verificationService.sendVerification(result.user).catch(err => {
                console.error('[AuthController Error] Falha no disparo de confirmação de conta:', err.message);
            });

            return res.status(201).json({
                success: true,
                message: 'Cadastro realizado com sucesso! Enviamos um link de confirmação para o seu e-mail.',
                requireVerification: true,
                data: {
                    user: result.user
                }
            });
        } catch (error) {
            next(error);
        }
    }

    static async verifyEmail(req, res) {
        try {
            const { token } = req.query;
            if (!token || typeof token !== 'string') {
                return res.redirect('/?verification_error=' + encodeURIComponent('Token de verificação inválido ou ausente.'));
            }

            const user = await verificationService.verifyToken(token);
            if (user) {
                const jwtToken = authService.generateToken(user);
                AuthController._setAuthCookie(res, jwtToken);
            }

            return res.redirect('/?verified=1');
        } catch (error) {
            return res.redirect('/?verification_error=' + encodeURIComponent(error.message));
        }
    }

    static async resendVerification(req, res, next) {
        try {
            const { email } = req.body;
            if (!email || typeof email !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Por favor, informe um e-mail válido.'
                });
            }

            await verificationService.resendVerification(email);
            return res.status(200).json({
                success: true,
                message: 'Se este e-mail estiver cadastrado e pendente de ativação, um novo link de confirmação foi enviado.'
            });
        } catch (error) {
            next(error);
        }
    }

    static async login(req, res, next) {
        try {
            const { email, password } = req.body;
            const result = await authService.login({ email, password });
            AuthController._setAuthCookie(res, result.token);
            return res.status(200).json({
                success: true,
                message: 'Autenticado com sucesso!',
                data: result
            });
        } catch (error) {
            next(error);
        }
    }

    static async logout(req, res) {
        res.clearCookie('nexus_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
        });
        return res.status(200).json({
            success: true,
            message: 'Logout realizado com sucesso.'
        });
    }

    static async me(req, res, next) {
        try {
            return res.status(200).json({
                success: true,
                data: {
                    user: req.user
                }
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/forgot-password
     * Body: { email }
     * Sempre retorna 200 para não revelar existência de contas (anti-enumeração).
     */
    static async forgotPassword(req, res, next) {
        try {
            const { email } = req.body;
            if (!email || typeof email !== 'string') {
                return res.status(400).json({
                    success: false,
                    error: 'Por favor, informe um e-mail válido.'
                });
            }
            await resetService.requestReset(email);
            return res.status(200).json({
                success: true,
                message: 'Se este e-mail estiver cadastrado, você receberá as instruções em breve.'
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /api/auth/reset-password
     * Body: { token, password }
     */
    static async resetPassword(req, res, next) {
        try {
            const { token, password } = req.body;
            await resetService.resetPassword(token, password);
            return res.status(200).json({
                success: true,
                message: 'Senha redefinida com sucesso! Faça login com sua nova senha.'
            });
        } catch (error) {
            next(error);
        }
    }
}

module.exports = AuthController;

