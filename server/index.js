import 'dotenv/config';
import express from 'express';
import cors from 'cors';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Static files - uploads (resolve the actual upload directory)
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads', 'images');
const uploadsBase = path.resolve(uploadDir, '..');
app.use('/uploads', express.static(uploadsBase));

// Auth routes need special handling: login and signup are public, others are protected
const optionalAuth = (req, res, next) => {
    if (req.method === 'POST' && (req.path === '/login' || req.path === '/signup')) {
        return next();
    }
    if (req.method === 'GET' && req.path === '/session-info') {
        return next();
    }
    return authenticate(req, res, next);
};

app.use('/api/auth', optionalAuth, authRoutes);

// All other routes are protected
app.use('/api/collections', authenticate, collectionsRoutes);
app.use('/api/folders', authenticate, foldersRoutes);
app.use('/api/files', authenticate, filesRoutes);
app.use('/api/bookmarks', authenticate, bookmarksRoutes);
app.use('/api/upload', authenticate, uploadRoutes);
app.use('/api/admin', authenticate, adminRoutes);
app.use('/api/backup', authenticate, backupRoutes);
app.use('/api/preferences', authenticate, preferencesRoutes);
// TOTP routes: verify-login is public (uses temp token), others require auth
const totpOptionalAuth = (req, res, next) => {
    if (req.method === 'POST' && req.path === '/verify-login') {
        return next();
    }
    return authenticate(req, res, next);
};
app.use('/api/totp', totpOptionalAuth, totpRoutes);

// Serve client build in production
const clientDist = path.join(__dirname, 'public');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(clientDist, 'index.html'));
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Granth Vault server running on http://localhost:${PORT}`);
});
