import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/admin/logs — paginated audit log viewer (admin-only)
router.get('/logs', (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(10, parseInt(req.query.limit) || 50));
        const offset = (page - 1) * limit;

        const total = db.prepare('SELECT COUNT(*) as cnt FROM audit_logs').get().cnt;

        const logs = db.prepare(`
            SELECT al.*, u.email, u.name as user_name
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);

        res.json({
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            }
        });
    } catch (err) {
        console.error('Logs error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
