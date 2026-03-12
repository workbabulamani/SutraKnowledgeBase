import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import db from '../db.js';
import { requireRole } from '../middleware/rbac.js';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupDir = path.resolve(__dirname, '..', '..', 'data', 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

const router = Router();

// Encryption helpers — user-supplied key
function deriveKey(secret) {
    return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(data, secret) {
    const key = deriveKey(secret);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(buffer, secret) {
    const key = deriveKey(secret);
    const iv = buffer.slice(0, 16);
    const tag = buffer.slice(16, 32);
    const encrypted = buffer.slice(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

// Create a backup of the current database
router.post('/create', requireRole('admin', 'user'), (req, res) => {
    try {
        const userId = req.user.id;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backup_${userId}_${timestamp}.db`;
        const backupPath = path.join(backupDir, backupName);

        db.backup(backupPath).then(() => {
            res.json({
                message: 'Backup created successfully',
                backup: {
                    name: backupName,
                    created_at: new Date().toISOString(),
                    size: fs.statSync(backupPath).size,
                }
            });
        }).catch(err => {
            console.error('Backup error:', err);
            res.status(500).json({ error: 'Failed to create backup' });
        });
    } catch (err) {
        console.error('Backup error:', err);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// List all backups
router.get('/list', requireRole('admin', 'user'), (req, res) => {
    try {
        const files = fs.readdirSync(backupDir)
            .filter(f => f.endsWith('.db'))
            .map(f => {
                const stat = fs.statSync(path.join(backupDir, f));
                return {
                    name: f,
                    created_at: stat.mtime.toISOString(),
                    size: stat.size,
                };
            })
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json({ backups: files });
    } catch (err) {
        console.error('List backups error:', err);
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// Download all user data — encrypted with user-supplied key
router.post('/download', requireRole('admin', 'user'), async (req, res) => {
    try {
        const { encryptionKey } = req.body;
        if (!encryptionKey || encryptionKey.length < 1) {
            return res.status(400).json({ error: 'Encryption key is required' });
        }

        const userId = req.user.id;
        const collections = db.prepare(`
            SELECT c.* FROM collections c
            JOIN collection_members cm ON cm.collection_id = c.id
            WHERE cm.user_id = ?
        `).all(userId);

        const exportData = { collections: [], exported_at: new Date().toISOString(), user: req.user.email };

        for (const col of collections) {
            const folders = db.prepare('SELECT * FROM folders WHERE collection_id = ?').all(col.id);
            const folderData = [];
            for (const folder of folders) {
                const files = db.prepare('SELECT * FROM files WHERE folder_id = ?').all(folder.id);
                folderData.push({ ...folder, files });
            }
            exportData.collections.push({ ...col, folders: folderData });
        }

        exportData.bookmarks = db.prepare('SELECT * FROM bookmarks WHERE user_id = ?').all(userId);

        const jsonData = JSON.stringify(exportData, null, 2);
        const encryptedData = encrypt(jsonData, encryptionKey);

        const dateStr = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="grnth_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}"`);
        res.send(encryptedData);
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to download data' });
    }
});

// Restore from a server-side backup (available to all users, not just admin)
router.post('/restore/:name', requireRole('admin', 'user'), async (req, res) => {
    try {
        const backupName = req.params.name;
        const backupPath = path.join(backupDir, backupName);

        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const autoBackupName = `auto_pre_restore_${timestamp}.db`;
        const autoBackupPath = path.join(backupDir, autoBackupName);
        const dbPath = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'md_viewer.db');

        try { await db.backup(autoBackupPath); }
        catch (backupErr) { fs.copyFileSync(dbPath, autoBackupPath); }

        fs.copyFileSync(backupPath, dbPath);

        res.json({
            message: 'Restore completed successfully. The page will reload to apply changes.',
            autoBackup: autoBackupName,
            restoredFrom: backupName,
        });

        setTimeout(() => { process.exit(0); }, 500);
    } catch (err) {
        console.error('Restore error:', err);
        res.status(500).json({ error: 'Failed to restore backup' });
    }
});

// Restore from uploaded encrypted file
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.post('/restore-file', requireRole('admin', 'user'), upload.single('backupFile'), async (req, res) => {
    try {
        const { encryptionKey } = req.body;
        if (!encryptionKey) return res.status(400).json({ error: 'Encryption key is required' });
        if (!req.file) return res.status(400).json({ error: 'Backup file is required' });

        let importData;
        try {
            const decrypted = decrypt(req.file.buffer, encryptionKey);
            importData = JSON.parse(decrypted);
        } catch (decryptErr) {
            return res.status(400).json({ error: 'Failed to decrypt. Check your encryption key.' });
        }

        // Auto-backup before restore
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const autoBackupName = `auto_pre_file_restore_${timestamp}.db`;
        const autoBackupPath = path.join(backupDir, autoBackupName);
        const dbPath = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'md_viewer.db');

        try { await db.backup(autoBackupPath); }
        catch (err) { fs.copyFileSync(dbPath, autoBackupPath); }

        // Import data — recreate collections, folders, files
        const userId = req.user.id;
        const importTransaction = db.transaction(() => {
            for (const col of (importData.collections || [])) {
                const existing = db.prepare('SELECT id FROM collections WHERE name = ? AND owner_id = ?').get(col.name, userId);
                let colId;
                if (existing) {
                    colId = existing.id;
                } else {
                    const result = db.prepare('INSERT INTO collections (name, description, owner_id) VALUES (?, ?, ?)').run(col.name, col.description || '', userId);
                    colId = result.lastInsertRowid;
                    db.prepare('INSERT OR IGNORE INTO collection_members (collection_id, user_id, role) VALUES (?, ?, ?)').run(colId, userId, 'admin');
                }
                for (const folder of (col.folders || [])) {
                    const existingFolder = db.prepare('SELECT id FROM folders WHERE name = ? AND collection_id = ?').get(folder.name, colId);
                    let folderId;
                    if (existingFolder) {
                        folderId = existingFolder.id;
                    } else {
                        const fResult = db.prepare('INSERT INTO folders (name, collection_id, parent_folder_id) VALUES (?, ?, ?)').run(folder.name, colId, folder.parent_folder_id || null);
                        folderId = fResult.lastInsertRowid;
                    }
                    for (const file of (folder.files || [])) {
                        const existingFile = db.prepare('SELECT id FROM files WHERE name = ? AND folder_id = ?').get(file.name, folderId);
                        if (existingFile) {
                            db.prepare('UPDATE files SET content = ? WHERE id = ?').run(file.content || '', existingFile.id);
                        } else {
                            db.prepare('INSERT INTO files (name, content, folder_id) VALUES (?, ?, ?)').run(file.name, file.content || '', folderId);
                        }
                    }
                }
            }
        });
        importTransaction();

        res.json({ message: 'Data restored from file successfully', autoBackup: autoBackupName });
    } catch (err) {
        console.error('Restore from file error:', err);
        res.status(500).json({ error: 'Failed to restore from file' });
    }
});

// Delete a backup
router.delete('/:name', requireRole('admin'), (req, res) => {
    try {
        const backupPath = path.join(backupDir, req.params.name);
        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup not found' });
        }
        fs.unlinkSync(backupPath);
        res.json({ message: 'Backup deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete backup' });
    }
});

export default router;
