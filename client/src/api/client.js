const API_BASE = '/api';

function getToken() {
    return localStorage.getItem('md_viewer_token');
}

async function request(endpoint, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });

    if (res.status === 401) {
        localStorage.removeItem('md_viewer_token');
        localStorage.removeItem('md_viewer_user');
        window.location.href = '/';
        throw new Error('Unauthorized');
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

export const api = {
    // Config (public)
    getConfig: () => request('/config'),

    // Auth
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    signup: (email, name, password) => request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, name, password }) }),
    me: () => request('/auth/me'),
    changePassword: (currentPassword, newPassword) => request('/auth/password', { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }),
    getSessionInfo: () => request('/auth/session-info'),

    // Collections
    getCollections: () => request('/collections'),
    createCollection: (name, description) => request('/collections', { method: 'POST', body: JSON.stringify({ name, description }) }),
    updateCollection: (id, data) => request(`/collections/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteCollection: (id) => request(`/collections/${id}`, { method: 'DELETE' }),

    // Folders
    getTree: (collectionId) => request(`/folders/collection/${collectionId}`),
    createFolder: (name, collection_id, parent_folder_id) => request('/folders', { method: 'POST', body: JSON.stringify({ name, collection_id, parent_folder_id }) }),
    renameFolder: (id, name) => request(`/folders/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    deleteFolder: (id) => request(`/folders/${id}`, { method: 'DELETE' }),

    // Files
    getFile: (id) => request(`/files/${id}`),
    createFile: (name, folder_id) => request('/files', { method: 'POST', body: JSON.stringify({ name, folder_id }) }),
    updateFile: (id, data) => request(`/files/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),
    searchFiles: (collectionId, query) => request(`/files/search/${collectionId}?q=${encodeURIComponent(query)}`),

    // Bookmarks
    getBookmarks: () => request('/bookmarks'),
    toggleBookmark: (file_id, folder_id) => request('/bookmarks/toggle', { method: 'POST', body: JSON.stringify({ file_id, folder_id }) }),

    // Upload
    uploadImage: async (file) => {
        const token = getToken();
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
    },

    // Admin
    getUsers: () => request('/admin/users'),
    updateUser: (id, data) => request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    deleteUser: (id) => request(`/admin/users/${id}`, { method: 'DELETE' }),
    createUser: (data) => request('/admin/users', { method: 'POST', body: JSON.stringify(data) }),

    // Backup
    createBackup: () => request('/backup/create', { method: 'POST' }),
    listBackups: () => request('/backup/list'),
    downloadBackup: async (encryptionKey) => {
        const token = getToken();
        const res = await fetch(`${API_BASE}/backup/download`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ encryptionKey })
        });
        if (!res.ok) throw new Error('Download failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sutra_backup_${new Date().toISOString().slice(0, 10)}`;
        a.click();
        URL.revokeObjectURL(url);
    },
    restoreBackup: (name) => request(`/backup/restore/${name}`, { method: 'POST' }),
    restoreFromFile: async (file, encryptionKey) => {
        const token = getToken();
        const formData = new FormData();
        formData.append('backupFile', file);
        formData.append('encryptionKey', encryptionKey);
        const res = await fetch(`${API_BASE}/backup/restore-file`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Restore failed');
        return data;
    },
    deleteBackup: (name) => request(`/backup/${name}`, { method: 'DELETE' }),

    // TOTP 2FA
    totpSetup: () => request('/totp/setup', { method: 'POST' }),
    totpVerifySetup: (token) => request('/totp/verify-setup', { method: 'POST', body: JSON.stringify({ token }) }),
    totpDisable: (password) => request('/totp/disable', { method: 'POST', body: JSON.stringify({ password }) }),
    totpVerifyLogin: (tempToken, token) => request('/totp/verify-login', { method: 'POST', body: JSON.stringify({ tempToken, token }) }),

    // Preferences
    getPreferences: () => request('/preferences'),
    savePreferences: (preferences) => request('/preferences', { method: 'PUT', body: JSON.stringify({ preferences }) }),
};
