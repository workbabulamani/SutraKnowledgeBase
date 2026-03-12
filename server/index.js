import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import { authenticate } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import collectionsRoutes from './routes/collections.js';
import foldersRoutes from './routes/folders.js';
import filesRoutes from './routes/files.js';
import bookmarksRoutes from './routes/bookmarks.js';
import uploadRoutes from './routes/upload.js';
import adminRoutes from './routes/admin.js';
import backupRoutes from './routes/backup.js';
import preferencesRoutes from './routes/preferences.js';
import totpRoutes from './routes/totp.js';
import logsRoutes from './routes/logs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ===== Configuration =====
const ALLOW_SIGNUP = (process.env.ALLOW_SIGNUP || 'false').toLowerCase() === 'true';
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';

// Initialize database
initDB();

// ===== Security Middleware =====

// Trust proxy for correct IP behind Docker/reverse proxy
app.set('trust proxy', 1);

// Helmet — security headers (X-Frame-Options, X-Content-Type, referrer policy, etc.)
// CSP disabled: causes white-page on LAN access (different IP/hostname)
// HSTS disabled: app may run on HTTP (local/intranet)
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    strictTransportSecurity: false,
}));

// CORS — restrict origins based on ALLOWED_ORIGINS env var
function buildCorsOptions() {
    if (ALLOWED_ORIGINS === '*') {
        return { origin: true, credentials: true };
    }
    const origins = ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean);
    return {
        origin: (origin, callback) => {
            // Allow requests with no origin (mobile apps, curl, same-origin)
            if (!origin) return callback(null, true);
            if (origins.includes(origin)) return callback(null, true);
            callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
    };
}
app.use(cors(buildCorsOptions()));

// Body parser
app.use(express.json({ limit: '50mb' }));

// ===== Rate Limiting =====

// Auth rate limiter: 10 requests per minute per IP for login/signup/2FA
const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts, please try again in a minute' },
});

// General API rate limiter: 200 requests per minute
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please slow down' },
});

app.use('/api/', apiLimiter);

// ===== Static files =====
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'images');
const uploadsBase = path.resolve(uploadDir, '..');
app.use('/uploads', express.static(uploadsBase));

// ===== Public config endpoint =====
app.get('/api/config', (req, res) => {
    res.json({ allowSignup: ALLOW_SIGNUP });
});

// ===== Auth routes (mixed public/protected) =====
const authOptionalAuth = (req, res, next) => {
    if (req.method === 'POST' && (req.path === '/login' || req.path === '/signup')) {
        return next();
    }
    if (req.method === 'GET' && req.path === '/session-info') {
        return next();
    }
    return authenticate(req, res, next);
};

// Apply rate limiter specifically to login/signup/totp-verify
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/totp/verify-login', authLimiter);

app.use('/api/auth', authOptionalAuth, authRoutes);

// TOTP routes: verify-login is public (uses temp token), others require auth
const totpOptionalAuth = (req, res, next) => {
    if (req.method === 'POST' && req.path === '/verify-login') {
        return next();
    }
    return authenticate(req, res, next);
};

// All other routes are protected
app.use('/api/collections', authenticate, collectionsRoutes);
app.use('/api/folders', authenticate, foldersRoutes);
app.use('/api/files', authenticate, filesRoutes);
app.use('/api/bookmarks', authenticate, bookmarksRoutes);
app.use('/api/upload', authenticate, uploadRoutes);
app.use('/api/admin', authenticate, adminRoutes);
app.use('/api/backup', authenticate, backupRoutes);
app.use('/api/preferences', authenticate, preferencesRoutes);
app.use('/api/totp', totpOptionalAuth, totpRoutes);
app.use('/api/admin', authenticate, logsRoutes);

// Serve client build in production
const clientDist = path.join(__dirname, 'public');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(clientDist, 'index.html'));
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.message);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Grnth Vault server running on http://localhost:${PORT}`);
    console.log(`   Signup: ${ALLOW_SIGNUP ? 'ENABLED' : 'DISABLED (admin creates users)'}`);
    console.log(`   CORS origins: ${ALLOWED_ORIGINS}`);
});
