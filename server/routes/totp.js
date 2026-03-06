import { Router } from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { generateToken } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const router = Router();

// ===== Native TOTP implementation using Node.js crypto =====
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generateBase32Secret(length = 20) {
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (const byte of bytes) {
        result += BASE32_CHARS[byte % 32];
    }
    return result;
}

function base32Decode(encoded) {
    const cleaned = encoded.replace(/=+$/, '').toUpperCase();
    let bits = '';
    for (const char of cleaned) {
        const val = BASE32_CHARS.indexOf(char);
        if (val === -1) continue;
        bits += val.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.substring(i, i + 8), 2));
    }
    return Buffer.from(bytes);
}

function generateTOTP(secret, timeStep = 30, digits = 6) {
    const time = Math.floor(Date.now() / 1000 / timeStep);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(0, 0);
    timeBuffer.writeUInt32BE(time, 4);

    const key = base32Decode(secret);
    const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();

    const offset = hmac[hmac.length - 1] & 0xf;
    const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** digits);

    return code.toString().padStart(digits, '0');
}

function verifyTOTP(token, secret, window = 1) {
    for (let i = -window; i <= window; i++) {
        const time = Math.floor(Date.now() / 1000 / 30) + i;
        const timeBuffer = Buffer.alloc(8);
        timeBuffer.writeUInt32BE(0, 0);
        timeBuffer.writeUInt32BE(time, 4);

        const key = base32Decode(secret);
        const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
        const offset = hmac[hmac.length - 1] & 0xf;
        const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % (10 ** 6);
        const expected = code.toString().padStart(6, '0');

        if (expected === token) return true;
    }
    return false;
}

function buildOTPAuthURI(secret, email, issuer = 'GranthVault') {
    return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ===== Routes =====

// POST /api/totp/setup — Generate TOTP secret + QR code
router.post('/setup', (req, res) => {
    try {
        const user = db.prepare('SELECT id, email, totp_enabled FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.totp_enabled) return res.status(400).json({ error: '2FA is already enabled' });

        const secret = generateBase32Secret();
        const otpauth = buildOTPAuthURI(secret, user.email);

        // Store secret but don't enable yet (user must verify first)
        db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, req.user.id);

        QRCode.toDataURL(otpauth, (err, qrCodeUrl) => {
            if (err) return res.status(500).json({ error: 'Failed to generate QR code' });
            res.json({ secret, qrCodeUrl });
        });
    } catch (err) {
        console.error('TOTP setup error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/totp/verify-setup — Verify first code and enable 2FA
router.post('/verify-setup', (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'Verification code is required' });

        const user = db.prepare('SELECT id, totp_secret, totp_enabled FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.totp_enabled) return res.status(400).json({ error: '2FA is already enabled' });
        if (!user.totp_secret) return res.status(400).json({ error: 'Please run setup first' });

        const isValid = verifyTOTP(token, user.totp_secret);
        if (!isValid) return res.status(400).json({ error: 'Invalid verification code. Please try again.' });

        db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(req.user.id);
        res.json({ message: '2FA enabled successfully' });
    } catch (err) {
        console.error('TOTP verify-setup error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/totp/disable — Disable 2FA (requires password)
router.post('/disable', (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: 'Password is required' });

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?').run(req.user.id);
        res.json({ message: '2FA disabled successfully' });
    } catch (err) {
        console.error('TOTP disable error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/totp/verify-login — Verify TOTP code during login (uses temp token)
router.post('/verify-login', (req, res) => {
    try {
        const { tempToken, token } = req.body;
        if (!tempToken || !token) return res.status(400).json({ error: 'Temp token and verification code required' });

        let decoded;
        try {
            decoded = jwt.verify(tempToken, JWT_SECRET);
        } catch (e) {
            return res.status(401).json({ error: 'Expired or invalid session. Please login again.' });
        }
        if (!decoded.pending2FA) return res.status(400).json({ error: 'Invalid token type' });

        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!user.totp_enabled || !user.totp_secret) {
            return res.status(400).json({ error: '2FA is not enabled for this account' });
        }

        const isValid = verifyTOTP(token, user.totp_secret);
        if (!isValid) return res.status(401).json({ error: 'Invalid verification code' });

        const realToken = generateToken({ id: user.id, email: user.email, role: user.role, name: user.name });
        res.json({
            token: realToken,
            user: { id: user.id, email: user.email, name: user.name, role: user.role }
        });
    } catch (err) {
        console.error('TOTP verify-login error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
