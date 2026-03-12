import { useState, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api/client.js';
import FileTree from './FileTree.jsx';

const SutraBaseLogo = () => (
    <img src="/logo.svg" width="28" height="28" alt="Grnth Vault" style={{ borderRadius: 6 }} />
);

export default function Sidebar({ collectionControls, onUploadClick }) {
    const { setSidebarOpen, activeCollection, addToast } = useApp();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const { openFile, tree } = useApp();

    const handleSearch = useCallback(async (query) => {
        setSearchQuery(query);
        if (!query.trim() || !activeCollection) {
            setSearchResults([]);
            return;
        }
        try {
            const data = await api.searchFiles(activeCollection.id, query.trim());
            setSearchResults(data.files || []);
        } catch (err) {
            setSearchResults([]);
        }
    }, [activeCollection]);

    const handleSearchResultClick = useCallback((result) => {
        openFile(result.id, result.name);
        setSearchQuery('');
        setSearchResults([]);
    }, [openFile]);

    return (
        <>
            {/* Header */}
            <div className="sidebar-header">
                <SutraBaseLogo />
                <span className="sidebar-app-name">GRNTH VAULT</span>
                <button className="btn-icon sidebar-close" onClick={() => setSidebarOpen(false)} title="Close sidebar">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                </button>
            </div>

            {/* Active collection name */}
            {activeCollection && (
                <div className="sidebar-collection-name">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ opacity: 0.6, flexShrink: 0 }}>
                        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                    </svg>
                    <span style={{ fontWeight: 700, fontStyle: 'italic' }}>{activeCollection.name}</span>
                </div>
            )}

            {/* Search */}
            <div className="sidebar-search">
                <div className="search-input-wrapper">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search files & folders..."
                        value={searchQuery}
                        onChange={e => handleSearch(e.target.value)}
                    />
                </div>
                {searchQuery && searchResults.length > 0 && (
                    <div className="search-results">
                        {searchResults.map(r => (
                            <div
                                key={r.id}
                                className="search-result-item"
                                onClick={() => handleSearchResultClick(r)}
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                </svg>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="result-name">{r.name}</div>
                                    {r.folder_name && <div className="result-folder">{r.folder_name}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {searchQuery && searchResults.length === 0 && (
                    <div className="search-results" style={{ padding: '10px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                        No results found
                    </div>
                )}
            </div>

            {/* File tree */}
            <FileTree onUploadClick={onUploadClick} collectionControls={collectionControls} />
        </>
    );
}
