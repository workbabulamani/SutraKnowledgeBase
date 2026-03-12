import { useApp } from '../context/AppContext.jsx';

export default function BottomBar() {
    const { activeTab, autoSaveStatus, zoomLevel, liveEdit, readOnly, activeCollection } = useApp();

    const wordCount = activeTab?.content
        ? activeTab.content.split(/\s+/).filter(Boolean).length
        : 0;
    const charCount = activeTab?.content?.length || 0;

    return (
        <div className="bottom-bar">
            {/* Left side: auto-save status */}
            <div className="bottom-bar-left">
                {autoSaveStatus && (
                    <span className="bottom-bar-status-msg">{autoSaveStatus}</span>
                )}
                {activeTab && (
                    <span className={`bottom-bar-saved ${activeTab.modified ? 'unsaved' : 'saved'}`}>
                        {activeTab.modified ? '● Unsaved' : '✓ Saved'}
                    </span>
                )}
            </div>

            {/* Center: spacer */}
            <div className="bottom-bar-center" />

            {/* Right side: mode badges + stats + zoom */}
            <div className="bottom-bar-right">
                {liveEdit && <span className="bottom-bar-badge">Live Edit</span>}
                {readOnly && <span className="bottom-bar-badge">Read Only</span>}
                {activeTab && (
                    <>
                        <span className="status-item">{wordCount} words</span>
                        <span className="status-item">{charCount} chars</span>
                    </>
                )}
                <span className="status-item">Zoom: {zoomLevel}%</span>
            </div>
        </div>
    );
}
