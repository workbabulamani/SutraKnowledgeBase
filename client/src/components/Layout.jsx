import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Sidebar from './Sidebar.jsx';
import TabBar from './TabBar.jsx';
import EditorPane from './EditorPane.jsx';
import BottomBar from './BottomBar.jsx';
import SettingsModal from './SettingsModal.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { renderMarkdown } from '../utils/markdown.js';
import { api } from '../api/client.js';

const SutraBaseLogoSmall = () => (
    <img src="/logo.svg" width="20" height="20" alt="Grnth Vault" style={{ borderRadius: 4 }} />
);

export default function Layout() {
    const { toasts, sidebarOpen, setSidebarOpen, sidebarWidth, setSidebarWidth, activeTab, canEdit, addToast, collections } = useApp();
    const [showSettings, setShowSettings] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [menuAction, setMenuAction] = useState(null);
    const menuRef = useRef(null);
    const menuBtnRef = useRef(null);
    const isResizingRef = useRef(false);

    // Sidebar resize
    const handleResizeStart = useCallback((e) => {
        e.preventDefault();
        isResizingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        const onMove = (ev) => {
            if (!isResizingRef.current) return;
            const newWidth = Math.max(200, Math.min(500, ev.clientX));
            setSidebarWidth(newWidth);
        };
        const onUp = () => {
            isResizingRef.current = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [setSidebarWidth]);

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    const exportAs = useCallback((format) => {
        if (!activeTab) return;
        const content = activeTab.content || '';
        const name = activeTab.name?.replace(/\.md$/, '') || 'untitled';

        if (format === 'md') {
            const blob = new Blob([content], { type: 'text/markdown' });
            downloadBlob(blob, `${name}.md`);
            addToast('Exported as Markdown');
        } else if (format === 'html') {
            const renderedHtml = renderMarkdown(content);
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title><style>
body{font-family:'Inter',system-ui,-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.7;color:#2d2d2f;background:#fafafa}
h1,h2,h3{margin-top:1.5em;color:#1a1a1a}h1{font-size:1.8em;border-bottom:1px solid #e5e5e5;padding-bottom:0.3em}
pre{background:#f5f5f7;padding:16px;border-radius:10px;overflow-x:auto;border:1px solid #e5e5e5}
code{background:#f5f5f7;padding:2px 6px;border-radius:4px;font-size:0.9em}
pre code{background:none;padding:0}img{max-width:100%;border-radius:8px}
blockquote{border-left:3px solid #6366f1;padding:8px 16px;margin:12px 0;background:#f0f0ff;border-radius:0 8px 8px 0}
table{width:100%;border-collapse:collapse;margin:12px 0}th,td{padding:8px 12px;border:1px solid #e5e5e5;text-align:left}
th{background:#f5f5f7;font-weight:600}
</style></head><body>${renderedHtml}</body></html>`;
            const blob = new Blob([html], { type: 'text/html' });
            downloadBlob(blob, `${name}.html`);
            addToast('Exported as HTML');
        } else if (format === 'pdf') {
            const renderedHtml = renderMarkdown(content);
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${name}</title><style>
body{font-family:'Inter',system-ui,-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.7;color:#2d2d2f}
h1,h2,h3{margin-top:1.5em}h1{font-size:1.8em;border-bottom:1px solid #e5e5e5;padding-bottom:0.3em}
pre{background:#f5f5f7;padding:16px;border-radius:10px;overflow-x:auto}
code{background:#f5f5f7;padding:2px 6px;border-radius:4px;font-size:0.9em}
pre code{background:none;padding:0}img{max-width:100%}
blockquote{border-left:3px solid #6366f1;padding:8px 16px;margin:12px 0}
table{width:100%;border-collapse:collapse}th,td{padding:8px 12px;border:1px solid #ddd}
@media print{body{margin:0;padding:20px;max-width:none}}
</style></head><body>${renderedHtml}</body></html>`;
            const win = window.open('', '_blank');
            win.document.write(html);
            win.document.close();
            setTimeout(() => { win.print(); }, 500);
            addToast('Opening print dialog for PDF');
        }
    }, [activeTab, addToast]);

    const handleMenuAction = useCallback((action) => {
        if (action === 'toggleMenu') {
            setShowMenu(prev => !prev);
            return;
        }

        // For zoom actions, DON'T close menu
        if (action === 'zoomIn' || action === 'zoomOut') {
            setMenuAction(action);
            setTimeout(() => setMenuAction(null), 50);
            return;
        }

        // For everything else, close menu
        setShowMenu(false);

        if (action === 'exportMd') { exportAs('md'); return; }
        if (action === 'exportHtml') { exportAs('html'); return; }
        if (action === 'exportPdf') { exportAs('pdf'); return; }

        setMenuAction(action);
        setTimeout(() => setMenuAction(null), 50);
    }, [exportAs]);

    const handleOverlayClick = useCallback(() => setShowMenu(false), []);

    return (
        <div className="app-layout">
            {!sidebarOpen && (
                <div className="sidebar-rail">
                    <button className="rail-btn rail-logo" onClick={() => setSidebarOpen(true)} title="Expand sidebar">
                        <span className="rail-logo-icon"><SutraBaseLogoSmall /></span>
                        <span className="rail-logo-expand">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
                            </svg>
                        </span>
                    </button>
                    <div className="rail-spacer" />
                    <button className="rail-btn" onClick={() => setShowSettings(true)} title="Settings">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                        </svg>
                    </button>
                </div>
            )}
            {sidebarOpen && (
                <>
                    <SidebarWrapper onOpenSettings={() => setShowSettings(true)} width={sidebarWidth} />
                    <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
                </>
            )}

            <div className="main-content">
                {collections.length === 0 ? (
                    <div className="empty-state-page">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="1" style={{ opacity: 0.5 }}>
                            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                        </svg>
                        <h2>Welcome to Grnth Vault</h2>
                        <p>No collections found. Create your first collection from the sidebar to get started.</p>
                    </div>
                ) : (
                    <>
                        <TabBar onMenuAction={handleMenuAction} />
                        <EditorPane menuActions={menuAction} />
                        <BottomBar />
                    </>
                )}
            </div>

            {showMenu && (
                <>
                    <div className="menu-overlay" onClick={handleOverlayClick} />
                    <ThreeDotsMenu onAction={handleMenuAction} activeTab={activeTab} canEdit={canEdit} />
                </>
            )}

            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}

            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className="toast">{t.message}</div>
                ))}
            </div>

            <InactivityWarning />
        </div>
    );
}

// Three dots dropdown menu component
function ThreeDotsMenu({ onAction, activeTab, canEdit }) {
    const [showExport, setShowExport] = useState(false);
    const { liveEdit, readOnly, focusMode, autoSave, setAutoSave } = useApp();
    const isFullScreen = !!document.fullscreenElement || !!document.webkitFullscreenElement;

    return (
        <div className="three-dots-menu">
            {canEdit && (
                <button className={`menu-item${autoSave ? ' menu-item-active' : ''}`} onClick={() => setAutoSave(!autoSave)}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                    <span>{autoSave ? 'Auto Save: On' : 'Auto Save: Off'}</span>
                </button>
            )}
            <div className="menu-separator" />
            <button className="menu-item" onClick={() => onAction('copy')} disabled={!activeTab}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                <span>Copy as Plain Text</span>
            </button>
            <div className="menu-separator" />
            {/* Zoom row — clicking zoom buttons does NOT close menu */}
            <div className="menu-item zoom-row-full">
                <button className="zoom-btn-full" onClick={(e) => { e.stopPropagation(); onAction('zoomOut'); }} title="Zoom out">−</button>
                <button className="zoom-btn-full zoom-fit" onClick={(e) => { e.stopPropagation(); onAction('fitScreen'); }} title="Fit to screen">Fit</button>
                <button className="zoom-btn-full" onClick={(e) => { e.stopPropagation(); onAction('zoomIn'); }} title="Zoom in">+</button>
            </div>
            <div className="menu-separator" />
            {canEdit && (
                <button className={`menu-item${liveEdit ? ' menu-item-active' : ''}`} onClick={() => onAction('liveEdit')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /><path d="M15 6l3 3" /></svg>
                    <span>{liveEdit ? 'Turn off Live Edit' : 'Live Edit'}</span>
                </button>
            )}
            <button className={`menu-item${readOnly ? ' menu-item-active' : ''}`} onClick={() => onAction('readOnly')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                <span>{readOnly ? 'Turn off Read Only' : 'Read Only'}</span>
            </button>
            <button className="menu-item" onClick={() => onAction('fullScreen')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>
                <span>{isFullScreen ? 'Turn off Full Screen' : 'Turn on Full Screen'}</span>
            </button>
            <div className="menu-separator" />
            <button className="menu-item" onClick={() => onAction('noteInfo')}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                <span>Note Info</span>
            </button>
            <div className="menu-separator" />
            <div className="menu-item menu-item-with-submenu" onClick={() => setShowExport(!showExport)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                <span>Export</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginLeft: 'auto' }}>
                    <polyline points={showExport ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
                </svg>
            </div>
            {showExport && (
                <div className="menu-submenu">
                    <button className="menu-item" onClick={() => onAction('exportMd')} disabled={!activeTab}>
                        <span>Markdown (.md)</span>
                    </button>
                    <button className="menu-item" onClick={() => onAction('exportHtml')} disabled={!activeTab}>
                        <span>HTML (.html)</span>
                    </button>
                    <button className="menu-item" onClick={() => onAction('exportPdf')} disabled={!activeTab}>
                        <span>PDF (Print)</span>
                    </button>
                </div>
            )}
            <button className="menu-item" disabled>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg>
                <span>Share</span>
                <span className="menu-badge">Coming soon</span>
            </button>
        </div>
    );
}

// Collection switcher modal with rename capability
function CollectionModal({ collections, activeCollection, switchCollection, loadCollections, addToast, canEdit, onClose }) {
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [deletingId, setDeletingId] = useState(null);

    const handleRename = async (colId) => {
        const trimmed = renameValue.trim();
        if (!trimmed) { setRenamingId(null); return; }
        try {
            const { api } = await import('../api/client.js');
            await api.updateCollection(colId, { name: trimmed });
            addToast('Collection renamed');
            loadCollections();
        } catch (err) { addToast('Failed to rename collection'); }
        setRenamingId(null);
    };

    const handleDelete = async (colId, colName) => {
        if (colId === activeCollection?.id) {
            addToast('Cannot delete the active collection');
            setDeletingId(null);
            return;
        }
        try {
            const { api } = await import('../api/client.js');
            await api.deleteCollection(colId);
            addToast(`Deleted "${colName}"`);
            loadCollections();
        } catch (err) { addToast('Failed to delete collection'); }
        setDeletingId(null);
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2500 }}>
            <div className="modal collection-modal" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>Switch Collection</h2>
                    <button className="btn-icon" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="collection-modal-list">
                    {collections.map(col => (
                        <div
                            key={col.id}
                            className={`collection-modal-item${col.id === activeCollection?.id ? ' active' : ''}`}
                        >
                            <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => { switchCollection(col); onClose(); }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" /></svg>
                                    {renamingId === col.id ? (
                                        <input
                                            className="input"
                                            value={renameValue}
                                            onChange={e => setRenameValue(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleRename(col.id); if (e.key === 'Escape') setRenamingId(null); }}
                                            onBlur={() => handleRename(col.id)}
                                            onClick={e => e.stopPropagation()}
                                            autoFocus
                                            style={{ padding: '2px 6px', fontSize: 'var(--font-size-sm)' }}
                                        />
                                    ) : (
                                        <div style={{ fontWeight: 500, fontSize: 'var(--font-size-sm)' }}>{col.name}</div>
                                    )}
                                </div>
                                {col.description && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: 2, paddingLeft: 24 }}>{col.description}</div>}
                                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginTop: 2, paddingLeft: 24 }}>{col.file_count || 0} files · {col.folder_count || 0} folders</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {col.id === activeCollection?.id && (
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                )}
                                {canEdit && renamingId !== col.id && deletingId !== col.id && (
                                    <>
                                        <button className="btn-icon" title="Rename" onClick={(e) => { e.stopPropagation(); setRenamingId(col.id); setRenameValue(col.name); }} style={{ opacity: 0.5 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                        </button>
                                        {col.id !== activeCollection?.id && (
                                            <button className="btn-icon" title="Delete" onClick={(e) => { e.stopPropagation(); setDeletingId(col.id); }} style={{ opacity: 0.5 }}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                            </button>
                                        )}
                                    </>
                                )}
                                {deletingId === col.id && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                                        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--error-color, #e55)' }}>Delete?</span>
                                        <button className="btn-icon" title="Confirm Delete" onClick={() => handleDelete(col.id, col.name)} style={{ color: 'var(--error-color, #e55)' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                        </button>
                                        <button className="btn-icon" title="Cancel" onClick={() => setDeletingId(null)} style={{ opacity: 0.6 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Upload modal with drag-drop and folder selector (#2)
function UploadModal({ tree, onClose, onUpload }) {
    const [files, setFiles] = useState([]);
    const [targetFolderId, setTargetFolderId] = useState('');
    const [dragging, setDragging] = useState(false);

    // Flatten folder tree for dropdown
    const flatFolders = useMemo(() => {
        const result = [];
        const walk = (nodes, depth = 0) => {
            nodes.forEach(n => {
                if (n.type === 'folder') {
                    result.push({ id: n.id, name: n.name, depth });
                    if (n.children) walk(n.children, depth + 1);
                }
            });
        };
        walk(tree);
        return result;
    }, [tree]);

    const isValidFile = (f) => f.name.endsWith('.md') || f.name.endsWith('.txt');

    const addFiles = (newFiles) => {
        const arr = Array.from(newFiles).map(f => ({ file: f, valid: isValidFile(f) }));
        setFiles(prev => [...prev, ...arr]);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    };

    const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

    const allValid = files.length > 0 && files.every(f => f.valid);
    const canComplete = allValid && targetFolderId;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2500 }}>
            <div className="modal upload-modal" onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h2 style={{ margin: 0 }}>Upload Files</h2>
                    <button className="btn-icon" onClick={onClose}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                {/* Drop zone */}
                <div
                    className={`upload-drop-zone${dragging ? ' dragging' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={handleDrop}
                    onClick={() => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.md,.txt'; inp.multiple = true; inp.onchange = (e) => addFiles(e.target.files); inp.click(); }}
                >
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="1.5" style={{ opacity: 0.6 }}>
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                        Drag & drop <strong>.md</strong> or <strong>.txt</strong> files here, or click to browse
                    </p>
                </div>

                {/* File list */}
                {files.length > 0 && (
                    <div className="upload-file-list">
                        {files.map((f, i) => (
                            <div key={i} className={`upload-file-item${f.valid ? '' : ' invalid'}`}>
                                <span className="upload-file-icon">{f.valid ? '✓' : '✗'}</span>
                                <span className="upload-file-name">{f.file.name}</span>
                                <span className="upload-file-size">{(f.file.size / 1024).toFixed(1)} KB</span>
                                <button className="btn-icon" onClick={() => removeFile(i)} style={{ marginLeft: 'auto' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Folder selector */}
                <div style={{ marginTop: 16 }}>
                    <label style={{ display: 'block', fontSize: 'var(--font-size-sm)', fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' }}>Upload to folder</label>
                    <select
                        className="input"
                        value={targetFolderId}
                        onChange={e => setTargetFolderId(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px' }}
                    >
                        <option value="">Select a folder...</option>
                        {flatFolders.map(f => (
                            <option key={f.id} value={f.id}>{'  '.repeat(f.depth) + f.name}</option>
                        ))}
                    </select>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20, gap: 8 }}>
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" disabled={!canComplete} onClick={() => onUpload(files.filter(f => f.valid).map(f => f.file), targetFolderId)}>
                        Complete Upload
                    </button>
                </div>
            </div>
        </div>
    );
}

function SidebarWrapper({ onOpenSettings, width }) {
    const { activeCollection, collections, switchCollection, loadCollections, loadTree, addToast, canEdit, tree, activeTab } = useApp();
    const { logout } = useAuth();
    const [showNewCollection, setShowNewCollection] = useState(false);
    const [newColName, setNewColName] = useState('');
    const [newColDesc, setNewColDesc] = useState('');
    const [showCollectionModal, setShowCollectionModal] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);

    const handleCreateCollection = async (e) => {
        e.preventDefault();
        if (!newColName.trim()) return;
        try {
            const { api } = await import('../api/client.js');
            const data = await api.createCollection(newColName.trim(), newColDesc.trim());
            await loadCollections();
            if (data.collection) await switchCollection(data.collection);
            addToast(`Created "${newColName.trim()}"`);
            setShowNewCollection(false);
            setNewColName('');
            setNewColDesc('');
        } catch (err) {
            addToast(err.message || 'Failed to create collection');
        }
    };

    const handleUploadComplete = async (files, folderId) => {
        const { api } = await import('../api/client.js');
        let uploaded = 0;
        for (const file of files) {
            try {
                const text = await file.text();
                let baseName = file.name.replace(/\.(md|txt)$/i, '');
                let finalName = baseName + '.md';
                let result = null;
                // Try creating, auto-rename on duplicate
                for (let attempt = 0; attempt < 10; attempt++) {
                    try {
                        result = await api.createFile(finalName, parseInt(folderId));
                        break;
                    } catch (err) {
                        if (err.message && err.message.includes('already exists') && attempt < 9) {
                            finalName = `${baseName}_${attempt + 1}.md`;
                        } else { throw err; }
                    }
                }
                if (result?.file?.id) { await api.updateFile(result.file.id, { content: text }); uploaded++; }
            } catch (err) { addToast(`Failed to upload ${file.name}`); }
        }
        if (uploaded > 0) { addToast(`Uploaded ${uploaded} file(s)`); await loadTree(); }
        setShowUploadModal(false);
    };

    const collectionControls = (
        <div className="sidebar-collection-controls">
            {canEdit && !showNewCollection && (
                <button className="sidebar-nav-item sidebar-nav-new-collection" onClick={() => setShowNewCollection(true)} title="New Collection">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                    <span>New Collection</span>
                </button>
            )}
            {canEdit && showNewCollection && (
                <form className="sidebar-new-col-form" onSubmit={handleCreateCollection}>
                    <input className="input" placeholder="Collection name" value={newColName} onChange={e => setNewColName(e.target.value)} autoFocus required style={{ marginBottom: 5 }} />
                    <input className="input" placeholder="Description (optional)" value={newColDesc} onChange={e => setNewColDesc(e.target.value)} style={{ marginBottom: 6 }} />
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                        <button type="button" className="btn btn-ghost" style={{ padding: '3px 8px', fontSize: 'var(--font-size-xs)' }} onClick={() => { setShowNewCollection(false); setNewColName(''); setNewColDesc(''); }}>Cancel</button>
                        <button type="submit" className="btn btn-primary" style={{ padding: '3px 8px', fontSize: 'var(--font-size-xs)' }}>Create</button>
                    </div>
                </form>
            )}
            {/* Collection switcher button */}
            <button
                className="sidebar-nav-item sidebar-nav-collection"
                onClick={() => setShowCollectionModal(true)}
                title="Switch Collection"
            >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>
                <span>Switch collection</span>
            </button>
        </div>
    );

    return (
        <>
            <div className="sidebar" style={{ width: `${width}px` }}>
                <Sidebar collectionControls={collectionControls} onUploadClick={() => setShowUploadModal(true)} />
                <div className="sidebar-bottom-nav">
                    <button className="sidebar-nav-item" onClick={onOpenSettings} title="Settings">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>
                        <span>Settings</span>
                    </button>
                    <button className="sidebar-nav-item sidebar-nav-logout" onClick={logout} title="Logout">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                        <span>Logout</span>
                    </button>
                </div>
            </div>

            {showUploadModal && (
                <UploadModal
                    tree={tree}
                    onClose={() => setShowUploadModal(false)}
                    onUpload={handleUploadComplete}
                />
            )}

            {showCollectionModal && (
                <CollectionModal
                    collections={collections}
                    activeCollection={activeCollection}
                    switchCollection={switchCollection}
                    loadCollections={loadCollections}
                    addToast={addToast}
                    canEdit={canEdit}
                    onClose={() => setShowCollectionModal(false)}
                />
            )}
        </>
    );
}

// Inactivity warning banner — shown 2 min before auto-logout
function InactivityWarning() {
    const { inactivityWarning, setInactivityWarning } = useAuth();

    if (!inactivityWarning) return null;

    const handleStayLoggedIn = async () => {
        try {
            const data = await api.refreshToken();
            if (data.token) {
                localStorage.setItem('md_viewer_token', data.token);
            }
        } catch (e) { /* will be caught by auth check */ }
        setInactivityWarning(false);
    };

    return (
        <div className="inactivity-warning">
            <div className="inactivity-warning-content">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>Your session will expire in 2 minutes due to inactivity</span>
                <button className="btn btn-primary" onClick={handleStayLoggedIn} style={{ padding: '4px 12px', fontSize: 'var(--font-size-sm)' }}>
                    Stay Logged In
                </button>
            </div>
        </div>
    );
}
