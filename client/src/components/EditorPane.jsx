import { useCallback, useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { EditorView } from '@codemirror/view';
import Editor from './Editor.jsx';
import LiveEditor from './LiveEditor.jsx';
import Preview from './Preview.jsx';
import NoteInfoSidebar from './NoteInfoSidebar.jsx';

export default function EditorPane({ showMenu, onCloseMenu, menuActions }) {
    const { activeTab, editMode, setEditMode, updateTabContent, canEdit, sidebarOpen, setSidebarOpen, saveActiveFile, zoomLevel, setZoomLevel, liveEdit, setLiveEdit, readOnly, setReadOnly } = useApp();
    const [focusMode, setFocusMode] = useState(false);
    const [showNoteInfo, setShowNoteInfo] = useState(false);
    const [noteInfoWidth, setNoteInfoWidth] = useState(280);
    const [lightboxSrc, setLightboxSrc] = useState(null);
    const sidebarWasOpenRef = useRef(true);
    const editorRef = useRef(null);
    const previewRef = useRef(null);
    const isSyncingRef = useRef(false);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveActiveFile();
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                toggleFocusMode();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [saveActiveFile]); // eslint-disable-line

    // Listen for exiting fullscreen
    useEffect(() => {
        const handleFSChange = () => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                setFocusMode(false);
                setSidebarOpen(sidebarWasOpenRef.current);
            }
        };
        document.addEventListener('fullscreenchange', handleFSChange);
        document.addEventListener('webkitfullscreenchange', handleFSChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFSChange);
            document.removeEventListener('webkitfullscreenchange', handleFSChange);
        };
    }, []); // eslint-disable-line

    // Handle three-dots menu actions
    useEffect(() => {
        if (!menuActions) return;
        const action = menuActions;
        switch (action) {
            case 'copy':
                if (activeTab?.content) {
                    navigator.clipboard.writeText(activeTab.content);
                }
                break;
            case 'zoomIn': setZoomLevel(prev => Math.min(prev + 10, 200)); break;
            case 'zoomOut': setZoomLevel(prev => Math.max(prev - 10, 50)); break;
            case 'fitScreen': setZoomLevel(100); break;
            case 'liveEdit':
                setLiveEdit(!liveEdit);
                if (!liveEdit) { setReadOnly(false); setEditMode(true); }
                break;
            case 'readOnly':
                setReadOnly(!readOnly);
                if (!readOnly) setLiveEdit(false);
                break;
            case 'fullScreen': toggleFocusMode(); break;
            case 'noteInfo': setShowNoteInfo(!showNoteInfo); break;
            case 'save': saveActiveFile(); break;
            default: break;
        }
    }, [menuActions]); // eslint-disable-line

    const toggleFocusMode = useCallback(() => {
        setFocusMode(prev => {
            const entering = !prev;
            if (entering) {
                sidebarWasOpenRef.current = sidebarOpen;
                setSidebarOpen(false);
                const el = document.documentElement;
                (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el).catch(() => { });
            } else {
                (document.exitFullscreen || document.webkitExitFullscreen)?.call(document).catch(() => { });
                setSidebarOpen(sidebarWasOpenRef.current);
            }
            return entering;
        });
    }, [sidebarOpen, setSidebarOpen]);

    const handleContentChange = useCallback((content) => {
        if (activeTab) updateTabContent(activeTab.id, content);
    }, [activeTab, updateTabContent]);

    // Scroll sync: editor -> preview
    const handleEditorScroll = useCallback((pct) => {
        if (isSyncingRef.current) return;
        const previewEl = previewRef.current;
        if (!previewEl) return;
        isSyncingRef.current = true;

        const editorView = editorRef.current?.getView?.();
        if (editorView) {
            const topLine = editorView.state.doc.lineAt(
                editorView.lineBlockAtHeight(editorView.scrollDOM.scrollTop).from
            ).number;

            const sourceLine = previewEl.querySelector(`[data-source-line="${topLine - 1}"]`);
            if (sourceLine) {
                sourceLine.scrollIntoView({ block: 'start', behavior: 'auto' });
                requestAnimationFrame(() => { isSyncingRef.current = false; });
                return;
            }

            const allSourceLines = previewEl.querySelectorAll('[data-source-line]');
            let closest = null;
            let closestDist = Infinity;
            allSourceLines.forEach(el => {
                const line = parseInt(el.getAttribute('data-source-line'));
                const dist = Math.abs(line - (topLine - 1));
                if (dist < closestDist) { closestDist = dist; closest = el; }
            });
            if (closest) {
                closest.scrollIntoView({ block: 'start', behavior: 'auto' });
                requestAnimationFrame(() => { isSyncingRef.current = false; });
                return;
            }
        }

        const maxScroll = previewEl.scrollHeight - previewEl.clientHeight;
        previewEl.scrollTop = maxScroll * pct;
        requestAnimationFrame(() => { isSyncingRef.current = false; });
    }, []);

    // Scroll sync: preview -> editor
    const handlePreviewScroll = useCallback((e) => {
        if (isSyncingRef.current) return;
        const el = e.target;
        const maxScroll = el.scrollHeight - el.clientHeight;
        if (maxScroll <= 0) return;
        const pct = el.scrollTop / maxScroll;
        isSyncingRef.current = true;
        editorRef.current?.scrollToPercent(pct);
        requestAnimationFrame(() => { isSyncingRef.current = false; });
    }, []);

    // Heading click handler for NoteInfoSidebar — works in both split-view and live edit
    const handleHeadingClick = useCallback((id) => {
        // Try preview pane first (split-view / read-only mode)
        const previewEl = previewRef.current;
        if (previewEl) {
            const heading = previewEl.querySelector(`#${CSS.escape(id)}`);
            if (heading) {
                heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                return;
            }
        }
        // Live edit mode — scroll the CM6 editor to the heading via __cmView
        const liveEditorEl = document.querySelector('.live-editor-container');
        const cmViewRef = liveEditorEl?.__cmView;
        const cmView = cmViewRef?.current;
        if (cmView) {
            const doc = cmView.state.doc;
            for (let i = 1; i <= doc.lines; i++) {
                const line = doc.line(i);
                const match = line.text.match(/^#{1,6}\s+(.+)/);
                if (match) {
                    const hId = match[1].trim().toLowerCase().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
                    if (hId === id) {
                        cmView.dispatch({
                            effects: EditorView.scrollIntoView(line.from, { y: 'start' })
                        });
                        return;
                    }
                }
            }
        }
    }, []);

    // Image click handler for lightbox (event delegation)
    const handlePreviewClick = useCallback((e) => {
        if (e.target.tagName === 'IMG' && e.target.src) {
            setLightboxSrc(e.target.src);
        }
    }, []);

    if (!activeTab) {
        return (
            <div className="empty-state">
                <div className="empty-icon">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.3, color: 'var(--accent-color)' }}>
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                </div>
                <h3>No file open</h3>
                <p>Select a file from the sidebar or create a new one to get started.</p>
            </div>
        );
    }

    const showEditor = canEdit && editMode && !readOnly && !liveEdit;

    return (
        <div className="editor-outer-wrapper">
            <div className="editor-pane" style={{ zoom: zoomLevel / 100 }}>
                {liveEdit ? (
                    <div className="preview-side live-edit-pane" style={{ borderLeft: 'none', flex: 1 }}>
                        <LiveEditor content={activeTab.content} onChange={handleContentChange} />
                    </div>
                ) : showEditor ? (
                    <>
                        <div className="editor-side">
                            <Editor
                                ref={editorRef}
                                key={activeTab.fileId}
                                content={activeTab.content}
                                onChange={handleContentChange}
                                onScroll={handleEditorScroll}
                            />
                        </div>
                        <div className="preview-side" ref={previewRef} onScroll={handlePreviewScroll} onClick={handlePreviewClick}>
                            <Preview content={activeTab.content} />
                        </div>
                    </>
                ) : (
                    <div className="preview-side" style={{ borderLeft: 'none', flex: 1 }} ref={previewRef} onClick={handlePreviewClick}>
                        <Preview content={activeTab.content} />
                    </div>
                )}
            </div>

            {/* Image Lightbox */}
            {lightboxSrc && (
                <div className="image-lightbox" onClick={() => setLightboxSrc(null)}>
                    <button className="image-lightbox-close" onClick={() => setLightboxSrc(null)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                    <img src={lightboxSrc} alt="Expanded" onClick={e => e.stopPropagation()} />
                </div>
            )}

            {showNoteInfo && (
                <>
                    <div
                        className="right-sidebar-resize-handle"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const startX = e.clientX;
                            const startW = noteInfoWidth;
                            const onMove = (ev) => {
                                const delta = startX - ev.clientX;
                                setNoteInfoWidth(Math.max(200, Math.min(600, startW + delta)));
                            };
                            const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                            window.addEventListener('mousemove', onMove);
                            window.addEventListener('mouseup', onUp);
                        }}
                    />
                    <NoteInfoSidebar
                        content={activeTab.content}
                        fileName={activeTab.name}
                        fileData={activeTab}
                        onClose={() => setShowNoteInfo(false)}
                        onHeadingClick={handleHeadingClick}
                        width={noteInfoWidth}
                    />
                </>
            )}
        </div>
    );
}

// Export menu state helpers for Layout to use
export function getMenuItems(activeTab, canEdit, liveEdit, readOnly, zoomLevel) {
    return [
        { id: 'save', label: 'Save', shortcut: '⌘S', icon: 'save', disabled: !canEdit || !activeTab, show: canEdit },
        { type: 'separator' },
        { id: 'copy', label: 'Copy as Plain Text', icon: 'copy', disabled: !activeTab },
        { type: 'separator' },
        { id: 'zoomRow', label: 'Zoom', type: 'zoom', zoomLevel },
        { type: 'separator' },
        { id: 'liveEdit', label: 'Live Edit', icon: 'edit', active: liveEdit, show: canEdit },
        { id: 'readOnly', label: 'Read Only', icon: 'eye', active: readOnly },
        { id: 'fullScreen', label: 'Full Screen', icon: 'maximize' },
        { type: 'separator' },
        { id: 'noteInfo', label: 'Note Info', icon: 'info' },
        { type: 'separator' },
        { id: 'export', label: 'Export', icon: 'download', disabled: !activeTab },
        { id: 'share', label: 'Share', icon: 'share', disabled: true },
    ];
}

