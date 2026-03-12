import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme, THEMES, ACCENT_COLORS } from '../context/ThemeContext.jsx';
import { api } from '../api/client.js';
import { useApp } from '../context/AppContext.jsx';
import ConfirmModal from './ConfirmModal.jsx';

const TIMEZONES = [
    'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
    'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore',
    'Australia/Sydney', 'Pacific/Auckland',
];

export default function SettingsModal({ onClose }) {
    const { user, logout } = useAuth();
    const { theme, setTheme, accentColor, setAccentColor } = useTheme();
    const { addToast, timezone, setTimezone, loadTree, loadCollections } = useApp();
    const [tab, setTab] = useState('general');
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [editingName, setEditingName] = useState(false);
    const [newName, setNewName] = useState(user?.name || '');

    // Admin state
    const [users, setUsers] = useState([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [showAddUser, setShowAddUser] = useState(false);
    const [newUserEmail, setNewUserEmail] = useState('');
    const [newUserName, setNewUserName] = useState('');
    const [newUserPassword, setNewUserPassword] = useState('');
    const [newUserRole, setNewUserRole] = useState('user');

    // Backup state
    const [backups, setBackups] = useState([]);
    const [loadingBackups, setLoadingBackups] = useState(false);
    const [creatingBackup, setCreatingBackup] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);
    const [downloadKey, setDownloadKey] = useState('');
    const [restoreFile, setRestoreFile] = useState(null);
    const [restoreFileKey, setRestoreFileKey] = useState('');
    const [restoringFile, setRestoringFile] = useState(false);
    const [showDownloadKey, setShowDownloadKey] = useState(false);

    // Logs state
    const [logs, setLogs] = useState([]);
    const [logsPage, setLogsPage] = useState(1);
    const [logsPagination, setLogsPagination] = useState(null);
    const [loadingLogs, setLoadingLogs] = useState(false);

    const isAdmin = user?.role === 'admin';

    const loadUsers = async () => {
        setLoadingUsers(true);
        try {
            const data = await api.getUsers();
            setUsers(data.users);
        } catch (err) { addToast('Failed to load users'); }
        finally { setLoadingUsers(false); }
    };

    const loadBackups = async () => {
        setLoadingBackups(true);
        try {
            const data = await api.listBackups();
            setBackups(data.backups);
        } catch (err) { addToast('Failed to load backups'); }
        finally { setLoadingBackups(false); }
    };

    const loadLogs = async (page = 1) => {
        setLoadingLogs(true);
        try {
            const data = await api.getLogs(page);
            setLogs(data.logs);
            setLogsPagination(data.pagination);
            setLogsPage(page);
        } catch (err) { addToast('Failed to load logs'); }
        finally { setLoadingLogs(false); }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        try {
            await api.changePassword(currentPassword, newPassword);
            addToast('Password updated');
            setCurrentPassword(''); setNewPassword('');
        } catch (err) { addToast(err.message || 'Failed to change password'); }
    };

    const handleAddUser = async (e) => {
        e.preventDefault();
        try {
            await api.createUser({ email: newUserEmail, name: newUserName, password: newUserPassword, role: newUserRole });
            addToast('User created');
            setShowAddUser(false); setNewUserEmail(''); setNewUserName(''); setNewUserPassword('');
            loadUsers();
        } catch (err) { addToast(err.message || 'Failed to create user'); }
    };

    const handleChangeRole = async (userId, role) => {
        try { await api.updateUser(userId, { role }); loadUsers(); }
        catch (err) { addToast('Failed to update role'); }
    };

    const handleDeleteUser = async (userId) => {
        setConfirmAction({
            title: 'Delete this user?',
            message: 'This will permanently remove the user and their access.',
            danger: true,
            confirmLabel: 'Delete',
            onConfirm: async () => {
                try { await api.deleteUser(userId); addToast('User deleted'); loadUsers(); }
                catch (err) { addToast('Failed to delete user'); }
                setConfirmAction(null);
            },
        });
    };

    const handleCreateBackup = async () => {
        setCreatingBackup(true);
        try {
            await api.createBackup();
            addToast('Backup created successfully');
            loadBackups();
        } catch (err) { addToast('Failed to create backup'); }
        finally { setCreatingBackup(false); }
    };

    const handleDownload = async () => {
        if (downloadKey.trim().length < 8) { addToast('Encryption key must be at least 8 characters'); return; }
        try { await api.downloadBackup(downloadKey.trim()); addToast('All collections and files download started successfully'); }
        catch (err) { addToast('Download failed'); }
    };

    const handleRestoreFromFile = async () => {
        if (!restoreFile || !restoreFileKey.trim()) return;
        setRestoringFile(true);
        try {
            const result = await api.restoreFromFile(restoreFile, restoreFileKey.trim());
            addToast(result.message || 'Restored successfully');
            setRestoreFile(null); setRestoreFileKey('');
            loadBackups();
            await loadCollections(); await loadTree();
        } catch (err) { addToast(err.message || 'Restore failed. Check your encryption key.'); }
        finally { setRestoringFile(false); }
    };

    const handleRestore = async (name) => {
        setConfirmAction({
            title: `Restore from "${name}"?`,
            message: 'Current data will be backed up automatically before restore. The page will reload after restoration.',
            danger: false,
            confirmLabel: 'Restore',
            onConfirm: async () => {
                try {
                    const result = await api.restoreBackup(name);
                    addToast(result.message || 'Restored successfully');
                    await loadCollections(); await loadTree();
                } catch (err) { addToast(err.message || 'Restore failed'); }
                setConfirmAction(null);
            },
        });
    };

    const handleDeleteBackup = async (name) => {
        setConfirmAction({
            title: `Delete backup "${name}"?`,
            message: 'This backup will be permanently deleted.',
            danger: true,
            confirmLabel: 'Delete',
            onConfirm: async () => {
                try { await api.deleteBackup(name); addToast('Backup deleted'); loadBackups(); }
                catch (err) { addToast('Failed to delete backup'); }
                setConfirmAction(null);
            },
        });
    };

    const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const handleSave = () => { addToast('Settings saved'); };

    return (
        <div className="modal-overlay">
            <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ margin: 0 }}>Settings</h2>
                    <button className="btn-icon" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid var(--border-primary)', paddingBottom: 8 }}>
                    <button className={`btn btn-ghost${tab === 'general' ? ' active' : ''}`} onClick={() => setTab('general')} style={{ fontSize: 'var(--font-size-sm)' }}>General</button>
                    <button className={`btn btn-ghost${tab === 'account' ? ' active' : ''}`} onClick={() => setTab('account')} style={{ fontSize: 'var(--font-size-sm)' }}>Account</button>
                    <button className={`btn btn-ghost${tab === 'backup' ? ' active' : ''}`} onClick={() => { setTab('backup'); loadBackups(); }} style={{ fontSize: 'var(--font-size-sm)' }}>Backup & Restore</button>
                    {isAdmin && (
                        <button className={`btn btn-ghost${tab === 'admin' ? ' active' : ''}`} onClick={() => { setTab('admin'); loadUsers(); }} style={{ fontSize: 'var(--font-size-sm)' }}>Users</button>
                    )}
                    {isAdmin && (
                        <button className={`btn btn-ghost${tab === 'logs' ? ' active' : ''}`} onClick={() => { setTab('logs'); loadLogs(); }} style={{ fontSize: 'var(--font-size-sm)' }}>Logs</button>
                    )}
                </div>

                <div className="settings-content-area">
                    {tab === 'general' && (
                        <div className="settings-panel">
                            <div className="settings-group">
                                <h3>Theme</h3>
                                <div className="theme-grid">
                                    {THEMES.map(t => (
                                        <button key={t.id} className={`theme-option${theme === t.id ? ' active' : ''}`} onClick={() => setTheme(t.id)} title={t.name}>
                                            <span className="theme-icon">{t.icon}</span>
                                            <span className="theme-name">{t.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="settings-group">
                                <h3>Accent Color</h3>
                                <div className="accent-grid">
                                    {ACCENT_COLORS.map(a => (
                                        <button key={a.id} className={`accent-option${accentColor === a.id ? ' active' : ''}`} onClick={() => setAccentColor(a.id)} title={a.name} style={{ '--swatch-color': a.color }}>
                                            <span className="accent-swatch" />
                                            <span className="accent-name">{a.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="settings-group">
                                <h3>Timezone</h3>
                                <select className="input" value={timezone} onChange={e => setTimezone(e.target.value)} style={{ width: '100%', padding: '8px 12px' }}>
                                    {TIMEZONES.map(tz => (
                                        <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                                    ))}
                                </select>
                                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                                    Dates throughout the app will use this timezone.
                                </p>
                            </div>
                            <div className="settings-group">
                                <h3>About</h3>
                                <div className="settings-row"><span className="label">Version</span><span>1.0.0</span></div>
                            </div>
                        </div>
                    )}

                    {tab === 'account' && (
                        <div className="settings-panel">
                            <div className="settings-group">
                                <h3>Profile</h3>
                                <div className="settings-row"><span className="label">Email</span><span>{user?.email}</span></div>
                                <div className="settings-row"><span className="label">Role</span><span className={`role-badge ${user?.role}`}>{user?.role}</span></div>
                                <div className="settings-row">
                                    <span className="label">Name</span>
                                    {editingName ? (
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <input className="input" value={newName} onChange={e => setNewName(e.target.value)} style={{ padding: '4px 8px', fontSize: 'var(--font-size-sm)', width: 160 }} autoFocus />
                                            <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 'var(--font-size-xs)' }} onClick={async () => {
                                                if (!newName.trim()) return;
                                                try {
                                                    const data = await api.changeName(newName.trim());
                                                    addToast('Name updated');
                                                    setEditingName(false);
                                                    // Update local user state
                                                    if (data.user) {
                                                        localStorage.setItem('md_viewer_user', JSON.stringify(data.user));
                                                    }
                                                } catch (err) { addToast(err.message || 'Failed to update name'); }
                                            }}>Save</button>
                                            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 'var(--font-size-xs)' }} onClick={() => { setEditingName(false); setNewName(user?.name || ''); }}>Cancel</button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <span>{user?.name}</span>
                                            <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 'var(--font-size-xs)' }} onClick={() => setEditingName(true)}>Change</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="settings-group">
                                <h3>Change Password</h3>
                                <form onSubmit={handleChangePassword}>
                                    <div className="form-group"><label>Current Password</label><input className="input" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required /></div>
                                    <div className="form-group"><label>New Password</label><input className="input" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} /></div>
                                    <button className="btn btn-primary" type="submit">Update Password</button>
                                </form>
                            </div>
                            <TwoFactorSection user={user} addToast={addToast} />
                            <div className="settings-group" style={{ marginTop: 24 }}>
                                <button className="btn btn-danger" onClick={logout}>Sign Out</button>
                            </div>
                        </div>
                    )}

                    {tab === 'backup' && (
                        <div className="settings-panel">
                            {/* Export with encryption key */}
                            <div className="settings-group">
                                <h3>Export Data</h3>
                                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                                    Download all your data as an encrypted backup file.
                                </p>
                                <div className="form-group" style={{ marginBottom: 8 }}>
                                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Secret Encryption Key</label>
                                    <input
                                        className="input"
                                        type={showDownloadKey ? 'text' : 'password'}
                                        placeholder="Enter a secret key (min 8 characters)..."
                                        value={downloadKey}
                                        onChange={e => setDownloadKey(e.target.value)}
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                                        <input
                                            type="checkbox"
                                            id="show-enc-key"
                                            checked={showDownloadKey}
                                            onChange={e => setShowDownloadKey(e.target.checked)}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        <label htmlFor="show-enc-key" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', cursor: 'pointer' }}>
                                            Show encryption key
                                        </label>
                                    </div>
                                    <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
                                        ⚠ Remember this key — it is required to restore your data. Min 8 characters.
                                    </p>
                                </div>
                                <button className="btn btn-primary" onClick={handleDownload} disabled={downloadKey.trim().length < 8}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                                    Download All Data
                                </button>
                            </div>

                            {/* Restore from downloaded file */}
                            <div className="settings-group">
                                <h3>Restore from File</h3>
                                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                                    Upload a previously downloaded encrypted backup file.
                                </p>
                                <div className="form-group" style={{ marginBottom: 8 }}>
                                    <input
                                        type="file"
                                        onChange={e => setRestoreFile(e.target.files[0])}
                                        style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: 8 }}>
                                    <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Encryption Key</label>
                                    <input
                                        className="input"
                                        type="password"
                                        placeholder="Enter the key used during export..."
                                        value={restoreFileKey}
                                        onChange={e => setRestoreFileKey(e.target.value)}
                                    />
                                </div>
                                <button className="btn btn-primary" onClick={handleRestoreFromFile} disabled={!restoreFile || !restoreFileKey.trim() || restoringFile}>
                                    {restoringFile ? 'Restoring...' : 'Restore from File'}
                                </button>
                            </div>

                            {/* Database Backup */}
                            <div className="settings-group">
                                <h3>Database Backup</h3>
                                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: '0 0 8px' }}>
                                    Create a snapshot of the current database.
                                </p>
                                <button className="btn btn-primary" onClick={handleCreateBackup} disabled={creatingBackup}>
                                    {creatingBackup ? 'Creating...' : 'Create Backup'}
                                </button>
                            </div>

                            {/* Restore from backups — available to all */}
                            <div className="settings-group">
                                <h3>Restore from Backup</h3>
                                {loadingBackups ? (
                                    <div style={{ textAlign: 'center', padding: 12 }}><span className="spinner" /></div>
                                ) : backups.length === 0 ? (
                                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>No backups available.</p>
                                ) : (
                                    <div className="backup-list">
                                        {backups.map(b => (
                                            <div key={b.name} className="backup-item">
                                                <div className="backup-info">
                                                    <span className="backup-name">{b.name}</span>
                                                    <span className="backup-meta">
                                                        {new Date(b.created_at).toLocaleDateString()} · {formatSize(b.size)}
                                                    </span>
                                                </div>
                                                <div className="backup-actions">
                                                    <button className="btn btn-ghost" onClick={() => handleRestore(b.name)} style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px' }}>
                                                        Restore
                                                    </button>
                                                    {isAdmin && (
                                                        <button className="btn-icon" onClick={() => handleDeleteBackup(b.name)} title="Delete backup">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {tab === 'admin' && isAdmin && (
                        <div className="settings-panel">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <h3 style={{ margin: 0, color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>User Management</h3>
                                <button className="btn btn-primary" onClick={() => setShowAddUser(!showAddUser)} style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}>+ Add User</button>
                            </div>
                            {showAddUser && (
                                <form onSubmit={handleAddUser} style={{ marginBottom: 16, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                                    <div className="form-group"><input className="input" type="text" placeholder="Name" value={newUserName} onChange={e => setNewUserName(e.target.value)} required /></div>
                                    <div className="form-group"><input className="input" type="email" placeholder="Email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required /></div>
                                    <div className="form-group"><input className="input" type="password" placeholder="Password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} required minLength={6} /></div>
                                    <div className="form-group">
                                        <select className="select" value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                                            <option value="user">User</option><option value="viewer">Viewer</option><option value="admin">Admin</option>
                                        </select>
                                    </div>
                                    <button className="btn btn-primary" type="submit" style={{ fontSize: 'var(--font-size-xs)' }}>Create User</button>
                                </form>
                            )}
                            {loadingUsers ? (
                                <div style={{ textAlign: 'center', padding: 20 }}><span className="spinner" /></div>
                            ) : (
                                <table className="admin-table">
                                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
                                    <tbody>
                                        {users.map(u => (
                                            <tr key={u.id}>
                                                <td>{u.name}</td>
                                                <td style={{ color: 'var(--text-tertiary)' }}>{u.email}</td>
                                                <td>
                                                    <select className="select" value={u.role} onChange={e => handleChangeRole(u.id, e.target.value)} style={{ padding: '2px 6px', fontSize: 'var(--font-size-xs)' }}>
                                                        <option value="admin">admin</option><option value="user">user</option><option value="viewer">viewer</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    {u.id !== user.id && (
                                                        <button className="btn-icon" onClick={() => handleDeleteUser(u.id)} title="Delete user">
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    )}

                    {tab === 'logs' && isAdmin && (
                        <div className="settings-panel">
                            <h3 style={{ margin: '0 0 12px', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Activity Log</h3>
                            {loadingLogs ? (
                                <div style={{ textAlign: 'center', padding: 20 }}><span className="spinner" /></div>
                            ) : logs.length === 0 ? (
                                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>No log entries yet.</p>
                            ) : (
                                <>
                                    <table className="admin-table" style={{ fontSize: 'var(--font-size-xs)' }}>
                                        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Details</th><th>IP</th></tr></thead>
                                        <tbody>
                                            {logs.map(log => (
                                                <tr key={log.id}>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(log.created_at).toLocaleString()}</td>
                                                    <td>{log.user_name || '\u2014'}</td>
                                                    <td><span className="role-badge">{log.action}</span></td>
                                                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.details}</td>
                                                    <td style={{ color: 'var(--text-tertiary)' }}>{log.ip_address || '\u2014'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {logsPagination && logsPagination.totalPages > 1 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 'var(--font-size-xs)' }}>
                                            <button className="btn btn-ghost" disabled={logsPage <= 1} onClick={() => loadLogs(logsPage - 1)} style={{ fontSize: 'var(--font-size-xs)' }}>{'\u2190'} Previous</button>
                                            <span style={{ color: 'var(--text-tertiary)' }}>Page {logsPage} of {logsPagination.totalPages}</span>
                                            <button className="btn btn-ghost" disabled={logsPage >= logsPagination.totalPages} onClick={() => loadLogs(logsPage + 1)} style={{ fontSize: 'var(--font-size-xs)' }}>Next {'\u2192'}</button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-primary)' }}>
                    <button className="btn btn-ghost" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" onClick={handleSave}>Save</button>
                </div>
            </div>

            {confirmAction && (
                <ConfirmModal
                    title={confirmAction.title}
                    message={confirmAction.message}
                    danger={confirmAction.danger}
                    confirmLabel={confirmAction.confirmLabel || 'Confirm'}
                    onConfirm={confirmAction.onConfirm}
                    onCancel={() => setConfirmAction(null)}
                />
            )}
        </div>
    );
}

// Two-Factor Authentication section for Account tab
function TwoFactorSection({ user, addToast }) {
    const [setting, setSetting] = useState(false);
    const [qrCode, setQrCode] = useState(null);
    const [secret, setSecret] = useState('');
    const [verifyCode, setVerifyCode] = useState('');
    const [disablePassword, setDisablePassword] = useState('');
    const [showDisable, setShowDisable] = useState(false);
    const [loading, setLoading] = useState(false);
    const [is2FAEnabled, setIs2FAEnabled] = useState(!!user?.totp_enabled);

    const handleSetup = async () => {
        setLoading(true);
        try {
            const data = await api.totpSetup();
            setQrCode(data.qrCodeUrl);
            setSecret(data.secret);
            setSetting(true);
        } catch (err) { addToast(err.message || 'Failed to setup 2FA'); }
        finally { setLoading(false); }
    };

    const handleVerifySetup = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.totpVerifySetup(verifyCode);
            addToast('Two-Factor Authentication enabled!');
            setIs2FAEnabled(true);
            setSetting(false);
            setQrCode(null);
            setSecret('');
            setVerifyCode('');
        } catch (err) { addToast(err.message || 'Verification failed'); }
        finally { setLoading(false); }
    };

    const handleDisable = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await api.totpDisable(disablePassword);
            addToast('Two-Factor Authentication disabled');
            setIs2FAEnabled(false);
            setShowDisable(false);
            setDisablePassword('');
        } catch (err) { addToast(err.message || 'Failed to disable 2FA'); }
        finally { setLoading(false); }
    };

    return (
        <div className="settings-group">
            <h3>Two-Factor Authentication</h3>
            {is2FAEnabled ? (
                <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)', fontWeight: 500 }}>2FA is enabled</span>
                    </div>
                    {!showDisable ? (
                        <button className="btn btn-ghost" onClick={() => setShowDisable(true)} style={{ color: '#ff3b30', fontSize: 'var(--font-size-sm)' }}>Disable 2FA</button>
                    ) : (
                        <form onSubmit={handleDisable} style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: '0 0 8px' }}>Enter your password to disable 2FA:</p>
                            <div className="form-group" style={{ marginBottom: 8 }}>
                                <input className="input" type="password" value={disablePassword} onChange={e => setDisablePassword(e.target.value)} placeholder="Enter password" required />
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn btn-danger" type="submit" disabled={loading} style={{ fontSize: 'var(--font-size-xs)' }}>
                                    {loading ? 'Disabling...' : 'Confirm Disable'}
                                </button>
                                <button type="button" className="btn btn-ghost" onClick={() => { setShowDisable(false); setDisablePassword(''); }} style={{ fontSize: 'var(--font-size-xs)' }}>Cancel</button>
                            </div>
                        </form>
                    )}
                </>
            ) : setting ? (
                <div>
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 12 }}>
                        Scan this QR code with your authenticator app (Google Authenticator, Microsoft Authenticator, Bitwarden, etc.)
                    </p>
                    {qrCode && (
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, padding: 12, background: '#fff', borderRadius: 'var(--radius-md)', width: 'fit-content', margin: '0 auto 12px' }}>
                            <img src={qrCode} alt="2FA QR Code" style={{ width: 200, height: 200 }} />
                        </div>
                    )}
                    <details style={{ marginBottom: 12, fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                        <summary style={{ cursor: 'pointer', marginBottom: 4 }}>Can't scan? Enter this key manually</summary>
                        <code style={{ wordBreak: 'break-all', background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: 'var(--radius-sm)', fontSize: 'var(--font-size-xs)' }}>{secret}</code>
                    </details>
                    <form onSubmit={handleVerifySetup}>
                        <div className="form-group" style={{ marginBottom: 8 }}>
                            <label style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>Enter verification code</label>
                            <input
                                className="input"
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={6}
                                value={verifyCode}
                                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ''))}
                                placeholder="000000"
                                autoFocus
                                required
                                style={{ textAlign: 'center', fontSize: '20px', letterSpacing: '6px', fontWeight: 600 }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-primary" type="submit" disabled={loading || verifyCode.length !== 6} style={{ fontSize: 'var(--font-size-sm)' }}>
                                {loading ? 'Verifying...' : 'Enable 2FA'}
                            </button>
                            <button type="button" className="btn btn-ghost" onClick={() => { setSetting(false); setQrCode(null); setSecret(''); setVerifyCode(''); }} style={{ fontSize: 'var(--font-size-sm)' }}>Cancel</button>
                        </div>
                    </form>
                </div>
            ) : (
                <>
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                        Add an extra layer of security to your account using an authenticator app.
                    </p>
                    <button className="btn btn-primary" onClick={handleSetup} disabled={loading} style={{ fontSize: 'var(--font-size-sm)' }}>
                        {loading ? 'Setting up...' : 'Enable Two-Factor Authentication'}
                    </button>
                </>
            )}
        </div>
    );
}
