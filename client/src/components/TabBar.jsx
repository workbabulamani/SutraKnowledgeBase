import { useRef, useEffect, useState, useCallback, Fragment } from 'react';
import { useApp } from '../context/AppContext.jsx';

export default function TabBar({ onMenuAction, menuState }) {
    const { tabs, activeTabId, setActiveTabId, closeTab } = useApp();
    const scrollRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const checkScroll = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 2);
        setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        checkScroll();
        el.addEventListener('scroll', checkScroll, { passive: true });
        const ro = new ResizeObserver(checkScroll);
        ro.observe(el);
        return () => {
            el.removeEventListener('scroll', checkScroll);
            ro.disconnect();
        };
    }, [tabs.length, checkScroll]);

    // Scroll active tab into view
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const activeEl = el.querySelector('.tab.active');
        if (activeEl) {
            activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        }
    }, [activeTabId]);

    const scrollBy = (dir) => {
        scrollRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
    };

    if (tabs.length === 0) return (
        <div className="tab-bar">
            <div className="tab-bar-spacer" />
            <button className="tab-bar-menu-btn btn-icon" onClick={() => onMenuAction?.('toggleMenu')} title="Menu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                </svg>
            </button>
        </div>
    );

    return (
        <div className="tab-bar">
            {canScrollLeft && (
                <button className="tab-scroll-btn tab-scroll-left" onClick={() => scrollBy(-1)} title="Scroll left">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
            )}
            <div className="tab-scroll-container" ref={scrollRef}>
                {tabs.map((tab, idx) => (
                    <Fragment key={tab.id}>
                        <div
                            className={`tab${tab.id === activeTabId ? ' active' : ''}`}
                            onClick={() => setActiveTabId(tab.id)}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ flexShrink: 0, opacity: 0.5 }}>
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                            <span className="tab-name" title={tab.name}>{tab.name}</span>
                            {tab.modified && <span className="tab-modified" />}
                            <span
                                className="tab-close"
                                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                                title="Close"
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </span>
                        </div>
                        {idx < tabs.length - 1 && <div className="tab-divider" />}
                    </Fragment>
                ))}
            </div>
            {canScrollRight && (
                <button className="tab-scroll-btn tab-scroll-right" onClick={() => scrollBy(1)} title="Scroll right">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            )}
            {/* Three dots menu button */}
            <button className="tab-bar-menu-btn btn-icon" onClick={() => onMenuAction?.('toggleMenu')} title="Menu">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                </svg>
            </button>
        </div>
    );
}
