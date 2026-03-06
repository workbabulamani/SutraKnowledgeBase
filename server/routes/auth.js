import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { generateToken, getSessionTimeout } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

const router = Router();

// Public endpoint: returns session timeout config
router.get('/session-info', (req, res) => {
    res.json({ sessionTimeout: getSessionTimeout() });
});

router.post('/signup', (req, res) => {
    try {
        // Check if signup is allowed
        const allowSignup = (process.env.ALLOW_SIGNUP || 'false').toLowerCase() === 'true';
        if (!allowSignup) {
            return res.status(403).json({ error: 'Signup is disabled. Contact the administrator.' });
        }
        const { email, password, name } = req.body;
        if (!email || !password || !name) {
            return res.status(400).json({ error: 'Email, password, and name are required' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }
        const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
        if (existing) {
            return res.status(409).json({ error: 'Email already registered' });
        }
        const hash = bcrypt.hashSync(password, 10);
        const result = db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)').run(
            email, name, hash, 'user'
        );
        const user = { id: result.lastInsertRowid, email, name, role: 'user' };
        // Create a default collection for new users
        const colResult = db.prepare('INSERT INTO collections (name, description, owner_id) VALUES (?, ?, ?)').run(
            'My Notes', 'Default collection', user.id
        );
        db.prepare('INSERT INTO collection_members (collection_id, user_id, role) VALUES (?, ?, ?)').run(
            colResult.lastInsertRowid, user.id, 'admin'
        );
        const token = generateToken(user);
        res.status(201).json({ token, user });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/login', (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        if (!user || !bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // If 2FA is enabled, return a temp token instead of a real one
        if (user.totp_enabled) {
            const tempToken = jwt.sign(
                { id: user.id, email: user.email, pending2FA: true },
                JWT_SECRET,
                { expiresIn: '2m' }
            );
            return res.json({ requires2FA: true, tempToken });
        }

        const token = generateToken({ id: user.id, email: user.email, role: user.role, name: user.name });
        res.json({
            token,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/me', (req, res) => {
    // This route is protected by auth middleware at the app level
    try {
        const user = db.prepare('SELECT id, email, name, role, created_at, totp_enabled FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ user: { ...user, totp_enabled: !!user.totp_enabled } });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/password', (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current and new passwords are required' });
        }
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters' });
        }
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }
        const hash = bcrypt.hashSync(newPassword, 10);
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
        res.json({ message: 'Password updated successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
