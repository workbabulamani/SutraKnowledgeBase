import { useState, useCallback, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import ConfirmModal from './ConfirmModal.jsx';

// SVG Icons
const ChevronRight = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>;
const FolderIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" opacity="0.8"><path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" /></svg>;
const FileIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;
const StarIcon = ({ filled }) => filled
    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
    : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>;

const ExpandAllIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18" />
        <polyline points="7 8 12 3 17 8" />
        <polyline points="7 16 12 21 17 16" />
    </svg>
);

const CollapseAllIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18" />
        <polyline points="7 5 12 10 17 5" />
        <polyline points="7 19 12 14 17 19" />
    </svg>
);

// Find the folder that contains a given file ID
function findFolderContainingFile(nodes, fileId) {
    for (const node of nodes) {
        if (node.type === 'folder' && node.children) {
            for (const child of node.children) {
                if (child.type === 'file' && child.id === fileId) return node.id;
            }
            const found = findFolderContainingFile(node.children, fileId);
            if (found) return found;
        }
    }
    return null;
}

function FileTreeNode({ node, depth = 0, expandedFolders, toggleFolder, onContextMenu, renamingId, renameValue, setRenameValue, submitRename, cancelRename, selectedFolderId, activeFolderId }) {
    const { openFile, activeTabId, tabs, toggleBookmark, bookmarks, canEdit } = useApp();
    const isFolder = node.type === 'folder';
    const isExpanded = expandedFolders.has(node.id);
    const isActive = !isFolder && tabs.find(t => t.fileId === node.id && t.id === activeTabId);
    const isBookmarked = bookmarks.some(b => isFolder ? b.folder_id === node.id : b.file_id === node.id);
    const isRenaming = renamingId === `${node.type}-${node.id}`;
    const isSelected = isFolder && selectedFolderId === node.id;
    const isFolderActive = isFolder && activeFolderId === node.id;
    const renameRef = useRef(null);

    useEffect(() => {
        if (isRenaming && renameRef.current) {
            renameRef.current.focus();
            renameRef.current.select();
        }
    }, [isRenaming]);

    const handleClick = () => {
        if (isRenaming) return;
        if (isFolder) {
            toggleFolder(node.id);
        } else {
            openFile(node.id, node.name);
        }
    };

    return (
        <div className="tree-node">
            <div
                className={`tree-node-row${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}${isFolderActive ? ' folder-active' : ''}`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={handleClick}
                onContextMenu={(e) => onContextMenu(e, node)}
            >
                {isFolder && (
                    <span className={`chevron${isExpanded ? ' expanded' : ''}`}>
                        <ChevronRight />
                    </span>
                )}
                {!isFolder && <span style={{ width: 18, flexShrink: 0 }} />}
                <span className={`icon ${isFolder ? 'folder-icon' : 'file-icon'}`}>
                    {isFolder ? <FolderIcon /> : <FileIcon />}
                </span>
                {isRenaming ? (
                    <input
                        ref={renameRef}
                        className="tree-rename-input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') submitRename();
                            if (e.key === 'Escape') cancelRename();
                        }}
                        onBlur={submitRename}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span className="name" title={node.name}>{node.name}</span>
                )}
                {!isRenaming && !isFolder && (
                    <button
                        className={`btn-icon bookmark-icon${isBookmarked ? ' bookmarked' : ''}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleBookmark(node.id, null);
                        }}
                        title={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
                    >
                        <StarIcon filled={isBookmarked} />
                    </button>
                )}
            </div>
            {isFolder && isExpanded && node.children && (
                <div className="tree-node-children">
                    {node.children.map(child => (
                        <FileTreeNode
                            key={`${child.type}-${child.id}`}
                            node={child}
                            depth={depth + 1}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            onContextMenu={onContextMenu}
                            renamingId={renamingId}
                            renameValue={renameValue}
                            setRenameValue={setRenameValue}
                            submitRename={submitRename}
                            cancelRename={cancelRename}
                            selectedFolderId={selectedFolderId}
                            activeFolderId={activeFolderId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default function FileTree({ onUploadClick, collectionControls }) {
    const { tree, activeCollection, loadTree, canEdit, addToast, openFile, bookmarks, activeTab, tabs, activeTabId, closeTab } = useApp();
    const [expandedFolders, setExpandedFolders] = useState(new Set());
    const [bookmarksExpanded, setBookmarksExpanded] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [selectedFolderId, setSelectedFolderId] = useState(null);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [confirmAction, setConfirmAction] = useState(null);
    const renameMetaRef = useRef(null);

    // Find active file's parent folder
    const activeFolderId = activeTab ? findFolderContainingFile(tree, activeTab.fileId) : null;

    // Auto-expand folder of active file (e.g., on session restore after login)
    useEffect(() => {
        if (activeFolderId && !expandedFolders.has(activeFolderId)) {
            setExpandedFolders(prev => new Set([...prev, activeFolderId]));
        }
    }, [activeFolderId, tree]);

    const toggleFolder = useCallback((folderId) => {
        setSelectedFolderId(folderId);
        setExpandedFolders(prev => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
    }, []);

    const expandAll = useCallback(() => {
        const allFolders = new Set();
        const collectFolders = (nodes) => {
            nodes.forEach(n => {
                if (n.type === 'folder') {
                    allFolders.add(n.id);
                    if (n.children) collectFolders(n.children);
                }
            });
        };
        collectFolders(tree);
        setExpandedFolders(allFolders);
        setBookmarksExpanded(true);
    }, [tree]);

    const collapseAll = useCallback(() => {
        setExpandedFolders(new Set());
        setBookmarksExpanded(false);
    }, []);

    const handleContextMenu = useCallback((e, node) => {
        e.preventDefault();
        if (node.type === 'folder') setSelectedFolderId(node.id);
        if (!canEdit) return;
        setContextMenu({ x: e.clientX, y: e.clientY, node });
    }, [canEdit]);

    const closeContextMenu = useCallback(() => setContextMenu(null), []);

    const startRename = useCallback((type, id, currentName) => {
        setRenamingId(`${type}-${id}`);
        setRenameValue(currentName);
        renameMetaRef.current = { type, id, isNew: false };
    }, []);

    const submitRename = useCallback(async () => {
        const meta = renameMetaRef.current;
        if (!meta) { setRenamingId(null); return; }
        const trimmed = renameValue.trim();
        if (!trimmed) {
            if (meta.isNew) {
                try {
                    if (meta.type === 'folder') await api.deleteFolder(meta.id);
                    else await api.deleteFile(meta.id);
                } catch (_) { }
            }
            setRenamingId(null);
            renameMetaRef.current = null;
            loadTree();
            return;
        }
        try {
            if (meta.type === 'folder') {
                await api.renameFolder(meta.id, trimmed);
            } else {
                const fileName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
                await api.updateFile(meta.id, { name: fileName });
            }
            await loadTree();
            if (meta.isNew && meta.type === 'file') {
                openFile(meta.id, trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`);
            }
        } catch (err) {
            addToast('Failed to rename');
        }
        setRenamingId(null);
        renameMetaRef.current = null;
    }, [renameValue, loadTree, addToast, openFile]);

    const cancelRename = useCallback(async () => {
        const meta = renameMetaRef.current;
        if (meta?.isNew) {
            try {
                if (meta.type === 'folder') await api.deleteFolder(meta.id);
                else await api.deleteFile(meta.id);
            } catch (_) { }
            loadTree();
        }
        setRenamingId(null);
        renameMetaRef.current = null;
    }, [loadTree]);

    const handleDelete = useCallback(async (node) => {
        closeContextMenu();
        setConfirmAction({
            title: `Delete "${node.name}"?`,
            message: `This will permanently delete this ${node.type}. This action cannot be undone.`,
            danger: true,
            onConfirm: async () => {
                try {
                    if (node.type === 'folder') {
                        await api.deleteFolder(node.id);
                        // Close tabs for files that were in this folder
                        tabs.forEach(t => {
                            if (findFolderContainingFile(tree, t.fileId) === node.id) {
                                closeTab(t.id);
                            }
                        });
                    } else {
                        await api.deleteFile(node.id);
                        // Close the tab for this file if it's open
                        const openTab = tabs.find(t => t.fileId === node.id);
                        if (openTab) closeTab(openTab.id);
                    }
                    loadTree();
                    addToast(`Deleted "${node.name}"`);
                } catch (err) {
                    addToast('Failed to delete');
                }
                setConfirmAction(null);
            },
        });
    }, [loadTree, addToast, closeContextMenu, tabs, closeTab, tree]);

    const handleNewFile = useCallback(async (parentFolder) => {
        closeContextMenu();
        const targetFolder = parentFolder
            || (selectedFolderId ? findFolderById(tree, selectedFolderId) : null)
            || (tree.length > 0 ? tree.find(n => n.type === 'folder') : null);
        if (!targetFolder || !targetFolder.id) {
            addToast('Create a folder first');
            return;
        }
        try {
            const tempName = 'Untitled.md';
            const result = await api.createFile(tempName, targetFolder.id);
            const newId = result.file?.id ?? result.id;
            if (!newId) {
                addToast('Failed to create file (no ID returned)');
                return;
            }
            await loadTree();
            setExpandedFolders(prev => new Set([...prev, targetFolder.id]));
            setRenamingId(`file-${newId}`);
            setRenameValue('Untitled');
            renameMetaRef.current = { type: 'file', id: newId, isNew: true };
        } catch (err) {
            addToast('Failed to create file');
        }
    }, [loadTree, addToast, closeContextMenu, selectedFolderId, tree]);

    const handleNewFolder = useCallback(async (parentFolder) => {
        closeContextMenu();
        if (!activeCollection) {
            addToast('Select a collection first');
            return;
        }
        try {
            const tempName = `New Folder`;
            const result = await api.createFolder(tempName, activeCollection.id, parentFolder?.id || null);
            await loadTree();
            if (parentFolder && !expandedFolders.has(parentFolder.id)) {
                setExpandedFolders(prev => new Set([...prev, parentFolder.id]));
            }
            const newId = result.folder?.id ?? result.id;
            if (newId) {
                setRenamingId(`folder-${newId}`);
                setRenameValue(tempName);
                renameMetaRef.current = { type: 'folder', id: newId, isNew: true };
            }
        } catch (err) {
            addToast('Failed to create folder');
        }
    }, [activeCollection, loadTree, addToast, closeContextMenu, expandedFolders]);

    const handleRename = useCallback((node) => {
        closeContextMenu();
        startRename(node.type, node.id, node.name);
    }, [closeContextMenu, startRename]);

    return (
        <>
            <div className="sidebar-actions">
                {canEdit && (
                    <>
                        <button className="btn-icon" title="New File" onClick={() => handleNewFile(null)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" /></svg>
                        </button>
                        <button className="btn-icon" title="New Folder" onClick={() => handleNewFolder(null)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /><line x1="12" y1="11" x2="12" y2="17" /><line x1="9" y1="14" x2="15" y2="14" /></svg>
                        </button>
                        {onUploadClick && (
                            <button className="btn-icon" title="Upload .md / .txt files" onClick={onUploadClick}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                            </button>
                        )}
                    </>
                )}
                <button className="btn-icon" title="Expand All" onClick={expandAll}>
                    <ExpandAllIcon />
                </button>
                <button className="btn-icon" title="Collapse All" onClick={collapseAll}>
                    <CollapseAllIcon />
                </button>
                <button className="btn-icon" title="Refresh" onClick={async () => { await loadTree(); addToast('Refreshed'); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                    </svg>
                </button>
            </div>

            {collectionControls}

            <div className="sidebar-tree">
                <BookmarksFolder bookmarks={bookmarks} openFile={openFile} expanded={bookmarksExpanded} setExpanded={setBookmarksExpanded} />

                {tree.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                        {canEdit ? 'No files yet. Create a folder to get started.' : 'No files available.'}
                    </div>
                ) : (
                    tree.map(node => (
                        <FileTreeNode
                            key={`${node.type}-${node.id}`}
                            node={node}
                            depth={0}
                            expandedFolders={expandedFolders}
                            toggleFolder={toggleFolder}
                            onContextMenu={handleContextMenu}
                            renamingId={renamingId}
                            renameValue={renameValue}
                            setRenameValue={setRenameValue}
                            submitRename={submitRename}
                            cancelRename={cancelRename}
                            selectedFolderId={selectedFolderId}
                            activeFolderId={activeFolderId}
                        />
                    ))
                )}
            </div>

            {contextMenu && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={closeContextMenu} />
                    <div className="dropdown-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
                        {contextMenu.node.type === 'folder' && canEdit && (
                            <>
                                <button className="dropdown-item" onClick={() => handleNewFile(contextMenu.node)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /></svg>
                                    New File Here
                                </button>
                                <button className="dropdown-item" onClick={() => handleNewFolder(contextMenu.node)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                                    New Subfolder
                                </button>
                                <div className="dropdown-separator" />
                            </>
                        )}
                        {canEdit && (
                            <>
                                <button className="dropdown-item" onClick={() => handleRename(contextMenu.node)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                    Rename
                                </button>
                                <button className="dropdown-item danger" onClick={() => handleDelete(contextMenu.node)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
                                    Delete
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}

            {confirmAction && (
                <ConfirmModal
                    title={confirmAction.title}
                    message={confirmAction.message}
                    danger={confirmAction.danger}
                    confirmLabel="Delete"
                    onConfirm={confirmAction.onConfirm}
                    onCancel={() => setConfirmAction(null)}
                />
            )}
        </>
    );
}

// Bookmarks virtual folder — expanded state lifted from parent
function BookmarksFolder({ bookmarks, openFile, expanded, setExpanded }) {
    if (!bookmarks || bookmarks.length === 0) {
        return (
            <div className="tree-node bookmarks-folder">
                <div className="tree-node-row" onClick={() => setExpanded(!expanded)} style={{ paddingLeft: 8 }}>
                    <span className={`chevron${expanded ? ' expanded' : ''}`}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                    </span>
                    <span className="icon" style={{ color: 'var(--accent-color)' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent-color)" stroke="var(--accent-color)" strokeWidth="1.5">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                    </span>
                    <span className="name" style={{ fontWeight: 500, opacity: 0.6 }}>Bookmarks</span>
                </div>
            </div>
        );
    }

    return (
        <div className="tree-node bookmarks-folder">
            <div className="tree-node-row" onClick={() => setExpanded(!expanded)} style={{ paddingLeft: 8 }}>
                <span className={`chevron${expanded ? ' expanded' : ''}`}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                </span>
                <span className="icon" style={{ color: 'var(--accent-color)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent-color)" stroke="var(--accent-color)" strokeWidth="1.5">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                </span>
                <span className="name" style={{ fontWeight: 500 }}>Bookmarks</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginLeft: 6 }}>{bookmarks.length}</span>
            </div>
            {expanded && (
                <div className="tree-node-children">
                    {bookmarks.map(bm => (
                        <div
                            key={bm.id || bm.file_id}
                            className="tree-node-row bookmark-item"
                            style={{ paddingLeft: 36 }}
                            onClick={() => openFile(bm.file_id || bm.id, bm.file_name || bm.name || 'Untitled')}
                        >
                            <span className="icon file-icon">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                            </span>
                            <span className="name" title={bm.file_name || bm.name || 'Untitled'}>{bm.file_name || bm.name || 'Untitled'}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function findFolderById(nodes, id) {
    for (const node of nodes) {
        if (node.type === 'folder' && node.id === id) return node;
        if (node.children) {
            const found = findFolderById(node.children, id);
            if (found) return found;
        }
    }
    return null;
}

