import { useEffect, useRef } from 'react';
import { EditorView, keymap, Decoration, ViewPlugin, WidgetType, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState, Prec, RangeSetBuilder, StateField } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from '../context/ThemeContext.jsx';
import { useApp } from '../context/AppContext.jsx';
import { api } from '../api/client.js';

// =====================================================================
// Minimal inline markdown → HTML for table cell content
// =====================================================================
function inlineMd(text) {
    let s = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/~~(.+?)~~/g, '<del>$1</del>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    return s;
}

// =====================================================================
// WIDGET: CodeBlock — click to edit, single styled box, copy, lang label
// =====================================================================
class CodeBlockWidget extends WidgetType {
    constructor(code, lang, blockFrom, blockTo) {
        super();
        this.code = code;
        this.lang = lang;
        this.blockFrom = blockFrom;
        this.blockTo = blockTo;
    }

    toDOM() {
        const wrapper = document.createElement('div');
        wrapper.className = 'cm-codeblock-widget';
        wrapper.setAttribute('data-block-from', this.blockFrom);

        // Header
        const header = document.createElement('div');
        header.className = 'cm-codeblock-header';

        const langLabel = document.createElement('span');
        langLabel.className = 'cm-codeblock-lang';
        langLabel.textContent = this.lang || 'text';
        header.appendChild(langLabel);

        const copyBtn = document.createElement('button');
        copyBtn.className = 'cm-codeblock-copy';
        copyBtn.title = 'Copy code';
        copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(this.code).then(() => {
                copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
                setTimeout(() => {
                    copyBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
                }, 1500);
            });
        });
        header.appendChild(copyBtn);
        wrapper.appendChild(header);

        // Code body — raw <pre><code> WITHOUT renderMarkdown to avoid double-boxing
        const pre = document.createElement('pre');
        pre.className = 'cm-codeblock-pre';
        const code = document.createElement('code');
        code.textContent = this.code;
        if (this.lang) code.className = `language-${this.lang}`;
        pre.appendChild(code);
        wrapper.appendChild(pre);

        // Click to edit: place cursor inside the code block
        wrapper.addEventListener('click', (e) => {
            if (e.target === copyBtn || copyBtn.contains(e.target)) return;
            const container = wrapper.closest('.live-editor-container');
            const view = container?.__cmView?.current;
            if (view) {
                // Place cursor on the first code line (after the opening fence)
                const fenceLine = view.state.doc.lineAt(this.blockFrom);
                const nextLine = fenceLine.number + 1;
                if (nextLine <= view.state.doc.lines) {
                    const targetLine = view.state.doc.line(nextLine);
                    view.dispatch({ selection: { anchor: targetLine.from } });
                    view.focus();
                }
            }
        });

        return wrapper;
    }

    eq(other) { return this.code === other.code && this.lang === other.lang; }
    get estimatedHeight() { return Math.max(60, this.code.split('\n').length * 22 + 44); }
}

// =====================================================================
// WIDGET: Grnth-style Table — always rendered, never raw markdown
// All mutations use local copies; never mutate this.rows in-place.
// =====================================================================
class TableWidget extends WidgetType {
    constructor(rows, alignments, blockFrom, blockTo) {
        super();
        this.rows = rows;
        this.alignments = alignments;
        this.blockFrom = blockFrom;
        this.blockTo = blockTo;
    }

    // --- Deep-copy helpers (avoid the splice-mutation / eq bug) ---
    _copyRows() { return this.rows.map(r => r ? [...r] : []); }
    _copyAligns() { return [...this.alignments]; }

    toDOM() {
        const numCols = this.rows[0]?.length || 0;
        const wrapper = document.createElement('div');
        wrapper.className = 'cm-table-widget';
        wrapper.setAttribute('data-block-from', this.blockFrom);
        wrapper.setAttribute('data-block-to', this.blockTo);

        // Scrollable container for wide tables
        const scrollBox = document.createElement('div');
        scrollBox.className = 'cm-table-scroll';

        const table = document.createElement('table');
        table.className = 'cm-grnth-table';

        // Thead: header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        this.rows[0]?.forEach((cell, ci) => {
            headerRow.appendChild(this._makeCell('th', cell.trim(), 0, ci, wrapper));
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Tbody: data rows (skip separator at index 1)
        const tbody = document.createElement('tbody');
        for (let ri = 2; ri < this.rows.length; ri++) {
            const tr = document.createElement('tr');
            for (let ci = 0; ci < numCols; ci++) {
                tr.appendChild(this._makeCell('td', (this.rows[ri]?.[ci] || '').trim(), ri, ci, wrapper));
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        scrollBox.appendChild(table);
        wrapper.appendChild(scrollBox);

        // --- Delete × icons (appear on cell focus) ---
        const delCol = document.createElement('div');
        delCol.className = 'cm-table-del-btn cm-table-del-col';
        delCol.innerHTML = '×';
        delCol.title = 'Delete column';
        delCol.style.display = 'none';
        wrapper.appendChild(delCol);

        const delRow = document.createElement('div');
        delRow.className = 'cm-table-del-btn cm-table-del-row';
        delRow.innerHTML = '×';
        delRow.title = 'Delete row';
        delRow.style.display = 'none';
        wrapper.appendChild(delRow);

        // Store refs on wrapper for _makeCell to access
        wrapper._delCol = delCol;
        wrapper._delRow = delRow;
        wrapper._table = table;

        // --- Hover "+" indicators on borders ---
        this._setupHoverIndicators(wrapper, table);

        return wrapper;
    }

    // ------------------------------------------------------------------
    // Hover indicators on table borders
    // ------------------------------------------------------------------
    _setupHoverIndicators(wrapper, table) {
        // Create indicator elements
        const hBtn = document.createElement('div');
        hBtn.className = 'cm-table-hover-btn cm-table-hover-h';
        hBtn.innerHTML = '+';
        hBtn.style.display = 'none';
        wrapper.appendChild(hBtn);

        const vBtn = document.createElement('div');
        vBtn.className = 'cm-table-hover-btn cm-table-hover-v';
        vBtn.innerHTML = '+';
        vBtn.style.display = 'none';
        wrapper.appendChild(vBtn);

        const hLine = document.createElement('div');
        hLine.className = 'cm-table-hover-line cm-table-hover-hline';
        hLine.style.display = 'none';
        wrapper.appendChild(hLine);

        const vLine = document.createElement('div');
        vLine.className = 'cm-table-hover-line cm-table-hover-vline';
        vLine.style.display = 'none';
        wrapper.appendChild(vLine);

        let hInsertPos = -1, vInsertPos = -1;
        const T = 7; // threshold pixels

        wrapper.addEventListener('mousemove', (e) => {
            const tRect = table.getBoundingClientRect();
            const wRect = wrapper.getBoundingClientRect();
            const mx = e.clientX, my = e.clientY;

            // hide all
            hBtn.style.display = 'none'; vBtn.style.display = 'none';
            hLine.style.display = 'none'; vLine.style.display = 'none';
            hInsertPos = -1; vInsertPos = -1;

            let foundH = false;

            // --- Horizontal borders (+ follows cursor X along the border) ---
            const trs = table.querySelectorAll('thead tr, tbody tr');
            for (let i = 0; i < trs.length; i++) {
                const r = trs[i].getBoundingClientRect();
                const dataRow = parseInt(trs[i].querySelector('[data-row]')?.getAttribute('data-row') ?? '0');
                // bottom edge
                if (Math.abs(my - r.bottom) < T && mx >= tRect.left - 10 && mx <= tRect.right + 10) {
                    hInsertPos = dataRow === 0 ? 2 : dataRow + 1;
                    const y = r.bottom - wRect.top;
                    const bx = Math.max(tRect.left - wRect.left, Math.min(mx - wRect.left, tRect.right - wRect.left)) - 10;
                    hBtn.style.display = 'flex'; hBtn.style.top = (y - 10) + 'px'; hBtn.style.left = bx + 'px';
                    hLine.style.display = 'block'; hLine.style.top = (y - 1) + 'px';
                    hLine.style.left = (tRect.left - wRect.left) + 'px'; hLine.style.width = tRect.width + 'px';
                    foundH = true; break;
                }
                // top edge of first row
                if (i === 0 && Math.abs(my - r.top) < T && mx >= tRect.left - 10 && mx <= tRect.right + 10) {
                    hInsertPos = 2;
                    const y = r.top - wRect.top;
                    const bx = Math.max(tRect.left - wRect.left, Math.min(mx - wRect.left, tRect.right - wRect.left)) - 10;
                    hBtn.style.display = 'flex'; hBtn.style.top = (y - 10) + 'px'; hBtn.style.left = bx + 'px';
                    hLine.style.display = 'block'; hLine.style.top = (y - 1) + 'px';
                    hLine.style.left = (tRect.left - wRect.left) + 'px'; hLine.style.width = tRect.width + 'px';
                    foundH = true; break;
                }
            }

            // --- Vertical borders only if no horizontal was found (no dual highlight at intersections) ---
            if (!foundH) {
                const hdrCells = table.querySelectorAll('thead th');
                for (let i = 0; i < hdrCells.length; i++) {
                    const cr = hdrCells[i].getBoundingClientRect();
                    // right edge
                    if (Math.abs(mx - cr.right) < T && my >= tRect.top - 10 && my <= tRect.bottom + 10) {
                        vInsertPos = i + 1;
                        const x = cr.right - wRect.left;
                        const by = Math.max(tRect.top - wRect.top, Math.min(my - wRect.top, tRect.bottom - wRect.top)) - 10;
                        vBtn.style.display = 'flex'; vBtn.style.left = (x - 10) + 'px'; vBtn.style.top = by + 'px';
                        vLine.style.display = 'block'; vLine.style.left = (x - 1) + 'px';
                        vLine.style.top = (tRect.top - wRect.top) + 'px'; vLine.style.height = tRect.height + 'px';
                        break;
                    }
                    // left edge of first col
                    if (i === 0 && Math.abs(mx - cr.left) < T && my >= tRect.top - 10 && my <= tRect.bottom + 10) {
                        vInsertPos = 0;
                        const x = cr.left - wRect.left;
                        const by = Math.max(tRect.top - wRect.top, Math.min(my - wRect.top, tRect.bottom - wRect.top)) - 10;
                        vBtn.style.display = 'flex'; vBtn.style.left = (x - 10) + 'px'; vBtn.style.top = by + 'px';
                        vLine.style.display = 'block'; vLine.style.left = (x - 1) + 'px';
                        vLine.style.top = (tRect.top - wRect.top) + 'px'; vLine.style.height = tRect.height + 'px';
                        break;
                    }
                }
            }
        });

        wrapper.addEventListener('mouseleave', () => {
            hBtn.style.display = 'none'; vBtn.style.display = 'none';
            hLine.style.display = 'none'; vLine.style.display = 'none';
        });

        hBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (hInsertPos >= 0) this._insertRowAt(wrapper, hInsertPos);
        });
        vBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (vInsertPos >= 0) this._insertColAt(wrapper, vInsertPos);
        });
    }

    // ------------------------------------------------------------------
    // Cell factory
    // ------------------------------------------------------------------
    _makeCell(tag, value, ri, ci, wrapper) {
        const el = document.createElement(tag);
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('data-row', ri.toString());
        el.setAttribute('data-col', ci.toString());
        el.setAttribute('spellcheck', 'false');
        el.innerHTML = inlineMd(value);
        el.style.textAlign = this.alignments[ci] || 'left';

        // Use a mutable ref so focus always sees the latest value
        const ref = { val: value };
        el.addEventListener('focus', () => {
            el.textContent = ref.val;
            _selectAll(el);
            // Show delete icons positioned at this cell's column/row
            this._showDeleteIcons(wrapper, ri, ci);
        });
        el.addEventListener('blur', () => {
            ref.val = el.textContent;
            if (ri === 0) { if (this.rows[0]) this.rows[0][ci] = ref.val; }
            else if (this.rows[ri]) { this.rows[ri][ci] = ref.val; }
            el.innerHTML = inlineMd(ref.val);
            this._commitToDoc(wrapper);
            // Hide delete icons after a delay (allow click to register)
            setTimeout(() => {
                if (!wrapper.querySelector('[data-row]:focus')) {
                    if (wrapper._delCol) wrapper._delCol.style.display = 'none';
                    if (wrapper._delRow) wrapper._delRow.style.display = 'none';
                }
            }, 200);
        });
        el.addEventListener('keydown', (e) => this._onKeydown(e, ri, ci, wrapper));
        return el;
    }

    _showDeleteIcons(wrapper, ri, ci) {
        const table = wrapper._table;
        const delCol = wrapper._delCol;
        const delRow = wrapper._delRow;
        if (!table || !delCol || !delRow) return;

        const wRect = wrapper.getBoundingClientRect();

        // Find the header cell for this column to get its horizontal center
        const th = table.querySelector(`[data-row="0"][data-col="${ci}"]`);
        if (th) {
            const thRect = th.getBoundingClientRect();
            const cx = (thRect.left + thRect.right) / 2 - wRect.left - 9;
            const tRect = table.getBoundingClientRect();
            delCol.style.display = 'flex';
            delCol.style.left = cx + 'px';
            delCol.style.top = (tRect.top - wRect.top - 22) + 'px';
            // Rebind click to current column
            delCol.onclick = (e) => { e.stopPropagation(); e.preventDefault(); this._deleteColAt(wrapper, ci); };
        }

        // Find the row for vertical center
        const cell = table.querySelector(`[data-row="${ri}"][data-col="0"]`);
        if (cell && ri >= 2) { // Only show row delete for data rows
            const tr = cell.closest('tr');
            if (tr) {
                const trRect = tr.getBoundingClientRect();
                const cy = (trRect.top + trRect.bottom) / 2 - wRect.top - 9;
                const tRect = table.getBoundingClientRect();
                delRow.style.display = 'flex';
                delRow.style.left = (tRect.left - wRect.left - 22) + 'px';
                delRow.style.top = cy + 'px';
                delRow.onclick = (e) => { e.stopPropagation(); e.preventDefault(); this._deleteRowAt(wrapper, ri); };
            }
        } else {
            delRow.style.display = 'none';
        }
    }

    // ------------------------------------------------------------------
    // Keyboard navigation
    // ------------------------------------------------------------------
    _onKeydown(e, row, col, wrapper) {
        const numCols = this.rows[0]?.length || 0;
        const lastDataRow = this.rows.length - 1;

        if (e.key === 'Tab') {
            e.preventDefault(); e.stopPropagation();
            wrapper.querySelector(`[data-row="${row}"][data-col="${col}"]`)?.blur();
            if (e.shiftKey) {
                let nr = row, nc = col - 1;
                if (nc < 0) { nc = numCols - 1; nr = row <= 2 ? 0 : row - 1; }
                if (nr === 1) nr = 0;
                const next = wrapper.querySelector(`[data-row="${nr}"][data-col="${nc}"]`);
                if (next) setTimeout(() => next.focus(), 0);
            } else {
                let nr = row, nc = col + 1;
                if (nc >= numCols) { nc = 0; nr = row === 0 ? 2 : row + 1; }
                if (nr === 1) nr = 2;
                if (nr > lastDataRow) { this._addRow(wrapper); return; }
                const next = wrapper.querySelector(`[data-row="${nr}"][data-col="${nc}"]`);
                if (next) setTimeout(() => next.focus(), 0);
            }
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            wrapper.querySelector(`[data-row="${row}"][data-col="${col}"]`)?.blur();
            const nr = row === 0 ? 2 : row + 1;
            if (nr > lastDataRow) { this._addRow(wrapper); return; }
            const next = wrapper.querySelector(`[data-row="${nr}"][data-col="${col}"]`);
            if (next) setTimeout(() => next.focus(), 0);
        } else if (e.key === 'Escape') {
            wrapper.querySelector(`[data-row="${row}"][data-col="${col}"]`)?.blur();
            const container = wrapper.closest('.live-editor-container');
            container?.__cmView?.current?.focus();
        } else if (e.key === 'ArrowUp' && row !== 0) {
            e.preventDefault();
            const nr = row === 2 ? 0 : row - 1;
            if (nr === 1) return;
            const next = wrapper.querySelector(`[data-row="${nr}"][data-col="${col}"]`);
            if (next) { wrapper.querySelector(`[data-row="${row}"][data-col="${col}"]`)?.blur(); setTimeout(() => next.focus(), 0); }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nr = row === 0 ? 2 : row + 1;
            if (nr > lastDataRow) return;
            const next = wrapper.querySelector(`[data-row="${nr}"][data-col="${col}"]`);
            if (next) { wrapper.querySelector(`[data-row="${row}"][data-col="${col}"]`)?.blur(); setTimeout(() => next.focus(), 0); }
        }
    }

    // ------------------------------------------------------------------
    // Read DOM cells into a fresh array (never touches this.rows)
    // ------------------------------------------------------------------
    _readDOM(wrapper) {
        const numCols = this.rows[0]?.length || 0;
        const rows = [];
        // header
        const hdr = [];
        for (let ci = 0; ci < numCols; ci++) {
            const el = wrapper.querySelector(`[data-row="0"][data-col="${ci}"]`);
            hdr.push(el ? el.textContent.trim() : (this.rows[0]?.[ci] || ''));
        }
        rows.push(hdr);
        // separator
        rows.push(this.alignments.map(a => a === 'center' ? ':---:' : a === 'right' ? '---:' : '---'));
        // body
        for (let ri = 2; ri < this.rows.length; ri++) {
            const r = [];
            for (let ci = 0; ci < numCols; ci++) {
                const el = wrapper.querySelector(`[data-row="${ri}"][data-col="${ci}"]`);
                r.push(el ? el.textContent.trim() : (this.rows[ri]?.[ci] || ''));
            }
            rows.push(r);
        }
        return rows;
    }

    // ------------------------------------------------------------------
    // Mutation helpers — all work on LOCAL copies, never touch this.rows
    // ------------------------------------------------------------------
    _buildMd(rows, aligns) {
        return rows.map((row, i) => {
            if (i === 1) return '| ' + aligns.map(a => a === 'center' ? ':---:' : a === 'right' ? '---:' : '---').join(' | ') + ' |';
            return '| ' + row.map(c => c || '').join(' | ') + ' |';
        }).join('\n');
    }

    _dispatch(wrapper, md) {
        const from = parseInt(wrapper.getAttribute('data-block-from'));
        const to = parseInt(wrapper.getAttribute('data-block-to'));
        const view = wrapper.closest('.live-editor-container')?.__cmView?.current;
        if (!view) return;
        view.dispatch({ changes: { from, to, insert: md } });
    }

    _addRow(wrapper) {
        const rows = this._readDOM(wrapper);
        const aligns = this._copyAligns();
        const numCols = rows[0]?.length || 1;
        rows.push(new Array(numCols).fill(''));
        this._dispatch(wrapper, this._buildMd(rows, aligns));
    }

    _insertRowAt(wrapper, position) {
        const rows = this._readDOM(wrapper);
        const aligns = this._copyAligns();
        const numCols = rows[0]?.length || 1;
        // clamp position to valid data range (>= 2)
        const pos = Math.max(2, Math.min(position, rows.length));
        rows.splice(pos, 0, new Array(numCols).fill(''));
        this._dispatch(wrapper, this._buildMd(rows, aligns));
    }

    _insertColAt(wrapper, position) {
        const rows = this._readDOM(wrapper);
        const aligns = this._copyAligns();
        const pos = Math.max(0, Math.min(position, (rows[0]?.length || 0)));
        for (const row of rows) row.splice(pos, 0, row === rows[1] ? '---' : '');
        aligns.splice(pos, 0, 'left');
        this._dispatch(wrapper, this._buildMd(rows, aligns));
    }

    _deleteRowAt(wrapper, ri) {
        if (ri === 0 || ri === 1) return;
        const rows = this._readDOM(wrapper);
        if (rows.length <= 3) return;
        rows.splice(ri, 1);
        this._dispatch(wrapper, this._buildMd(rows, this._copyAligns()));
    }

    _deleteColAt(wrapper, ci) {
        const rows = this._readDOM(wrapper);
        if ((rows[0]?.length || 0) <= 1) return;
        const aligns = this._copyAligns();
        for (const row of rows) row.splice(ci, 1);
        aligns.splice(ci, 1);
        this._dispatch(wrapper, this._buildMd(rows, aligns));
    }

    _commitToDoc(wrapper) {
        const from = parseInt(wrapper.getAttribute('data-block-from'));
        const to = parseInt(wrapper.getAttribute('data-block-to'));
        const view = wrapper.closest('.live-editor-container')?.__cmView?.current;
        if (!view) return;
        const md = this._buildMd(this._readDOM(wrapper), this._copyAligns());
        const current = view.state.doc.sliceString(from, to);
        if (md !== current) {
            view.dispatch({ changes: { from, to, insert: md } });
            wrapper.setAttribute('data-block-to', (from + md.length).toString());
        }
    }

    // Legacy aliases kept for _toMarkdown usage
    _toMarkdown() { return this._buildMd(this._copyRows(), this._copyAligns()); }

    eq(other) {
        return this.rows.length === other.rows.length &&
            this.rows.every((row, i) => row?.length === other.rows[i]?.length && row?.every((c, j) => c === other.rows[i]?.[j]));
    }
    get estimatedHeight() { return Math.max(50, (this.rows.length - 1) * 36 + 12); }
}

function _selectAll(el) {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
}

// =====================================================================
// Parse table
// =====================================================================
function parseTable(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return null;
    const rows = lines.map(line => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim()));
    const alignments = rows[1]?.map(cell => {
        const t = cell.trim();
        if (t.startsWith(':') && t.endsWith(':')) return 'center';
        if (t.endsWith(':')) return 'right';
        return 'left';
    }) || [];
    return { rows, alignments };
}

// =====================================================================
// StateField: Block-level decorations (code blocks + tables)
// =====================================================================
const blockDecoField = StateField.define({
    create(state) { return buildBlockDecos(state); },
    update(value, tr) {
        if (tr.docChanged || tr.selection) return buildBlockDecos(tr.state);
        return value;
    },
    provide: f => EditorView.decorations.from(f),
});

function buildBlockDecos(state) {
    const decos = [];
    const doc = state.doc;
    const sel = state.selection.main;
    const cursorStart = doc.lineAt(sel.from).number;
    const cursorEnd = doc.lineAt(sel.to).number;

    let inCode = false, cbStart = -1, cbLang = '', cbLines = [];

    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const text = line.text;

        if (/^\s*```/.test(text)) {
            if (!inCode) {
                inCode = true; cbStart = i; cbLang = text.replace(/^\s*```/, '').trim(); cbLines = [];
            } else {
                const cursorIn = cursorStart <= i && cursorEnd >= cbStart;
                if (!cursorIn) {
                    const from = doc.line(cbStart).from;
                    const to = doc.line(i).to;
                    decos.push(Decoration.replace({
                        widget: new CodeBlockWidget(cbLines.join('\n'), cbLang, from, to),
                        block: true,
                    }).range(from, to));
                }
                inCode = false; cbLines = [];
            }
            continue;
        }
        if (inCode) { cbLines.push(text); continue; }

        // Tables — ALWAYS rendered as widget (Grnth-style, never raw markdown)
        if (text.trim().startsWith('|')) {
            const tableStart = i;
            const tableTextLines = [text];
            let j = i + 1;
            while (j <= doc.lines && doc.line(j).text.trim().startsWith('|')) {
                tableTextLines.push(doc.line(j).text);
                j++;
            }
            const tableEnd = j - 1;

            if (tableTextLines.length >= 2) {
                const from = doc.line(tableStart).from;
                const to = doc.line(tableEnd).to;
                const parsed = parseTable(tableTextLines.join('\n'));
                if (parsed) {
                    decos.push(Decoration.replace({
                        widget: new TableWidget(parsed.rows, parsed.alignments, from, to),
                        block: true,
                    }).range(from, to));
                }
                i = tableEnd;
            }
        }
    }
    return Decoration.set(decos, true);
}

// =====================================================================
// ViewPlugin: Inline decorations
// =====================================================================
const hideDeco = Decoration.mark({ class: 'cm-md-hide' });
const headingDecos = [1, 2, 3, 4, 5, 6].map(l => Decoration.mark({ class: `cm-md-h${l}` }));
const boldDeco = Decoration.mark({ class: 'cm-md-bold' });
const italicDeco = Decoration.mark({ class: 'cm-md-italic' });
const boldItalicDeco = Decoration.mark({ class: 'cm-md-bold cm-md-italic' });
const linkTextDeco = Decoration.mark({ class: 'cm-md-link-text' });
const inlineCodeDeco = Decoration.mark({ class: 'cm-md-inline-code' });
const blockquoteDeco = Decoration.mark({ class: 'cm-md-blockquote' });
const strikethroughDeco = Decoration.mark({ class: 'cm-md-strikethrough' });

class HrWidget extends WidgetType {
    toDOM() { const hr = document.createElement('hr'); hr.className = 'cm-hr-widget'; return hr; }
    eq() { return true; }
}
class BulletWidget extends WidgetType {
    toDOM() { const s = document.createElement('span'); s.textContent = '•'; s.className = 'cm-md-bullet'; return s; }
    eq() { return true; }
}
class CheckboxWidget extends WidgetType {
    constructor(checked) { super(); this.checked = checked; }
    toDOM() { const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = this.checked; cb.className = 'cm-checkbox-widget'; return cb; }
    eq(other) { return this.checked === other.checked; }
}
class ImageWidget extends WidgetType {
    constructor(src, alt) { super(); this.src = src; this.alt = alt; }
    toDOM() { const w = document.createElement('div'); w.className = 'cm-image-widget'; const img = document.createElement('img'); img.src = this.src; img.alt = this.alt || ''; img.loading = 'lazy'; w.appendChild(img); return w; }
    eq(other) { return this.src === other.src; }
}

const inlinePlugin = ViewPlugin.fromClass(
    class {
        constructor(view) { this.decorations = buildInlineDecos(view); }
        update(update) {
            if (update.docChanged || update.selectionSet || update.viewportChanged) {
                this.decorations = buildInlineDecos(update.view);
            }
        }
    },
    { decorations: v => v.decorations }
);

function buildInlineDecos(view) {
    const builder = new RangeSetBuilder();
    const doc = view.state.doc;
    const sel = view.state.selection.main;
    const cS = doc.lineAt(sel.from).number;
    const cE = doc.lineAt(sel.to).number;
    let inCode = false;

    for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const text = line.text;
        const onCursor = i >= cS && i <= cE;

        if (/^\s*```/.test(text)) { inCode = !inCode; continue; }
        if (inCode) continue;
        if (text.trim().startsWith('|')) continue; // tables handled by block field
        if (onCursor) continue;

        if (/^(---|\*\*\*|___)$/.test(text.trim())) {
            builder.add(line.from, line.to, Decoration.replace({ widget: new HrWidget() }));
            continue;
        }

        const hm = text.match(/^(#{1,6})\s/);
        if (hm) {
            builder.add(line.from, line.from + hm[0].length, hideDeco);
            builder.add(line.from, line.to, headingDecos[hm[1].length - 1]);
            addInline(text, hm[0].length, line.from, builder);
            continue;
        }

        const bq = text.match(/^>\s?/);
        if (bq) {
            builder.add(line.from, line.from + bq[0].length, hideDeco);
            builder.add(line.from, line.to, blockquoteDeco);
        }

        const tk = text.match(/^(\s*[-*+]\s)\[([xX ])\]\s/);
        if (tk) {
            builder.add(line.from, line.from + tk[1].length, hideDeco);
            const cbS = line.from + tk[1].length;
            builder.add(cbS, cbS + 3, Decoration.replace({ widget: new CheckboxWidget(tk[2].toLowerCase() === 'x') }));
            addInline(text, tk[0].length, line.from, builder);
            continue;
        }

        const ul = text.match(/^(\s*)([-*+])\s/);
        if (ul && !tk) {
            const bs = line.from + ul[1].length;
            builder.add(bs, bs + ul[2].length, Decoration.replace({ widget: new BulletWidget() }));
        }

        const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let im;
        while ((im = imgRe.exec(text)) !== null) {
            const f = line.from + im.index, t = f + im[0].length;
            builder.add(f, t, Decoration.replace({ widget: new ImageWidget(im[2], im[1]) }));
        }

        addInline(text, 0, line.from, builder);
    }
    return builder.finish();
}

function addInline(text, offset, lineFrom, builder) {
    const ranges = [];
    const s = text.slice(offset);
    const o = lineFrom + offset;
    let m;

    const cRe = /`([^`]+)`/g;
    while ((m = cRe.exec(s)) !== null) { const f = o + m.index, t = f + m[0].length; ranges.push({ f, t, type: 'c', ms: f, mse: f + 1, me: t - 1, mee: t }); }
    const biRe = /(\*{3}|_{3})(?!\s)(.+?)(?<!\s)\1/g;
    while ((m = biRe.exec(s)) !== null) { const f = o + m.index, t = f + m[0].length; if (!ov(ranges, f, t)) ranges.push({ f, t, type: 'bi', ms: f, mse: f + 3, me: t - 3, mee: t }); }
    const bRe = /(\*{2}|_{2})(?!\s)(.+?)(?<!\s)\1/g;
    while ((m = bRe.exec(s)) !== null) { const f = o + m.index, t = f + m[0].length; if (!ov(ranges, f, t)) ranges.push({ f, t, type: 'b', ms: f, mse: f + 2, me: t - 2, mee: t }); }
    const iRe = /([*_])(?!\s)(.+?)(?<!\s)\1/g;
    while ((m = iRe.exec(s)) !== null) { const f = o + m.index, t = f + m[0].length; if (!ov(ranges, f, t)) ranges.push({ f, t, type: 'i', ms: f, mse: f + 1, me: t - 1, mee: t }); }
    const sRe = /~~([^~]+)~~/g;
    while ((m = sRe.exec(s)) !== null) { const f = o + m.index, t = f + m[0].length; if (!ov(ranges, f, t)) ranges.push({ f, t, type: 's', ms: f, mse: f + 2, me: t - 2, mee: t }); }
    const lRe = /(?<!!)\[([^\]]+)\]\(([^)]+)\)/g;
    while ((m = lRe.exec(s)) !== null) { const f = o + m.index, t = f + m[0].length; if (!ov(ranges, f, t)) ranges.push({ f, t, type: 'l', ts: f + 1, te: f + 1 + m[1].length }); }

    ranges.sort((a, b) => a.f - b.f);
    for (const r of ranges) {
        if (r.type === 'l') { builder.add(r.f, r.f + 1, hideDeco); builder.add(r.ts, r.te, linkTextDeco); builder.add(r.te, r.t, hideDeco); }
        else if (r.type === 'c') { builder.add(r.ms, r.mse, hideDeco); builder.add(r.mse, r.me, inlineCodeDeco); builder.add(r.me, r.mee, hideDeco); }
        else { const d = r.type === 'bi' ? boldItalicDeco : r.type === 'b' ? boldDeco : r.type === 'i' ? italicDeco : strikethroughDeco; builder.add(r.ms, r.mse, hideDeco); builder.add(r.mse, r.me, d); builder.add(r.me, r.mee, hideDeco); }
    }
}
function ov(ranges, from, to) { return ranges.some(r => from < r.t && to > r.f); }

// =====================================================================
// Checkbox click
// =====================================================================
function checkboxClick() {
    return EditorView.domEventHandlers({
        click(e, view) {
            if (e.target.classList.contains('cm-checkbox-widget')) {
                const pos = view.posAtDOM(e.target);
                const line = view.state.doc.lineAt(pos);
                const match = line.text.match(/^(\s*[-*+]\s)\[([xX ])\]/);
                if (match) {
                    view.dispatch({ changes: { from: line.from + match[1].length + 1, to: line.from + match[1].length + 2, insert: match[2].toLowerCase() === 'x' ? ' ' : 'x' } });
                    e.preventDefault(); return true;
                }
            }
            return false;
        }
    });
}

// =====================================================================
// Theme
// =====================================================================
const livePreviewTheme = EditorView.theme({
    '&': { height: '100%', fontSize: 'var(--font-size-base)' },
    '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-family)', lineHeight: '1.7', padding: '16px 24px' },
    '.cm-content': { maxWidth: '800px', margin: '0 auto', caretColor: 'var(--text-primary)' },
    '.cm-cursor': { borderLeftColor: 'var(--text-primary)' },
    '.cm-line': { padding: '1px 0' },
    '.cm-md-h1': { fontSize: '2em', fontWeight: '700', lineHeight: '1.3' },
    '.cm-md-h2': { fontSize: '1.6em', fontWeight: '600', lineHeight: '1.3' },
    '.cm-md-h3': { fontSize: '1.35em', fontWeight: '600', lineHeight: '1.4' },
    '.cm-md-h4': { fontSize: '1.15em', fontWeight: '600', lineHeight: '1.4' },
    '.cm-md-h5': { fontSize: '1.05em', fontWeight: '600', color: 'var(--text-secondary)' },
    '.cm-md-h6': { fontSize: '1em', fontWeight: '600', color: 'var(--text-tertiary)' },
    '.cm-md-hide': { fontSize: '0', letterSpacing: '0', width: '0', display: 'inline-block', overflow: 'hidden' },
    '.cm-md-bold': { fontWeight: '700' },
    '.cm-md-italic': { fontStyle: 'italic' },
    '.cm-md-strikethrough': { textDecoration: 'line-through', opacity: '0.6' },
    '.cm-md-inline-code': { fontFamily: 'var(--font-mono, monospace)', fontSize: '0.9em', background: 'var(--bg-tertiary)', padding: '1px 5px', borderRadius: '3px', color: 'var(--accent-color)' },
    '.cm-md-link-text': { color: 'var(--accent-color)', textDecoration: 'underline', cursor: 'pointer' },
    '.cm-md-blockquote': { borderLeft: '3px solid var(--accent-color)', paddingLeft: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' },
    '.cm-md-bullet': { color: 'var(--accent-color)', fontWeight: '700', marginRight: '2px' },
    '.cm-checkbox-widget': { cursor: 'pointer', width: '16px', height: '16px', verticalAlign: 'middle', marginRight: '4px', accentColor: 'var(--accent-color)' },
    '.cm-image-widget': { display: 'block', maxWidth: '100%', margin: '4px 0' },
    '.cm-image-widget img': { maxWidth: '100%', borderRadius: '6px', boxShadow: '0 1px 4px rgba(0,0,0,.1)' },
    '.cm-hr-widget': { border: 'none', borderTop: '2px solid var(--border-primary)', margin: '16px 0' },
    '.cm-activeLine': { background: 'color-mix(in srgb, var(--accent-color) 5%, transparent)' },

    // ---- Code Block Widget ----
    '.cm-codeblock-widget': {
        margin: '8px 0', borderRadius: '8px', overflow: 'hidden',
        border: '1px solid var(--border-primary)', background: 'var(--bg-tertiary)',
        cursor: 'pointer',
    },
    '.cm-codeblock-header': {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-primary)', fontSize: '0.75em',
    },
    '.cm-codeblock-lang': { color: 'var(--accent-color)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' },
    '.cm-codeblock-copy': {
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)',
        padding: '2px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center',
    },
    '.cm-codeblock-pre': {
        margin: '0', padding: '12px 16px', fontSize: '0.88em', overflow: 'auto',
        fontFamily: 'var(--font-mono, "SF Mono", "Fira Code", monospace)',
        lineHeight: '1.5', background: 'transparent', color: 'var(--text-primary)',
    },
    '.cm-codeblock-pre code': { background: 'transparent', fontSize: 'inherit', padding: '0' },

    // ---- Grnth-style Table ----
    '.cm-table-widget': { margin: '16px 0', position: 'relative', overflow: 'visible' },
    '.cm-table-scroll': { overflowX: 'auto', maxWidth: '100%' },
    '.cm-grnth-table': {
        borderCollapse: 'collapse', width: '100%', fontSize: '0.9em',
        border: '1px solid var(--border-primary)', borderRadius: '6px',
    },
    '.cm-grnth-table th': {
        background: 'var(--bg-tertiary)', fontWeight: '600', padding: '8px 12px',
        borderBottom: '2px solid var(--border-primary)', borderRight: '1px solid var(--border-primary)',
        minWidth: '60px',
    },
    '.cm-grnth-table td': {
        padding: '6px 12px', borderBottom: '1px solid var(--border-primary)',
        borderRight: '1px solid var(--border-primary)', minWidth: '60px',
    },
    '.cm-grnth-table th:last-child, .cm-grnth-table td:last-child': { borderRight: 'none' },
    '.cm-grnth-table tbody tr:last-child td': { borderBottom: 'none' },
    '.cm-grnth-table th:focus, .cm-grnth-table td:focus': {
        outline: '2px solid var(--accent-color)', outlineOffset: '-2px',
        background: 'color-mix(in srgb, var(--accent-color) 8%, transparent)',
    },
    '.cm-grnth-table code': {
        background: 'var(--bg-secondary)', padding: '1px 4px', borderRadius: '3px',
        fontSize: '0.9em', fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent-color)',
    },
    '.cm-grnth-table strong': { fontWeight: '700' },
    '.cm-grnth-table em': { fontStyle: 'italic' },
    '.cm-grnth-table a': { color: 'var(--accent-color)', textDecoration: 'underline' },
    '.cm-grnth-table del': { textDecoration: 'line-through', opacity: '0.6' },
    // Delete row/col buttons (appear on cell focus)
    '.cm-table-del-btn': {
        position: 'absolute', width: '18px', height: '18px', borderRadius: '50%',
        background: 'var(--error-color, #e55)', color: '#fff', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700',
        cursor: 'pointer', zIndex: '10', lineHeight: '1',
        boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: 'transform 0.1s, opacity 0.1s',
        opacity: '0.7',
    },
    '.cm-table-del-btn:hover': { transform: 'scale(1.25)', opacity: '1' },
    // Hover indicators on borders
    '.cm-table-hover-btn': {
        position: 'absolute', width: '20px', height: '20px', borderRadius: '50%',
        background: 'var(--accent-color)', color: '#fff', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700',
        cursor: 'pointer', zIndex: '10', lineHeight: '1',
        boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: 'transform 0.1s',
    },
    '.cm-table-hover-btn:hover': { transform: 'scale(1.2)' },
    '.cm-table-hover-line': { position: 'absolute', background: 'var(--accent-color)', zIndex: '5', pointerEvents: 'none' },
    '.cm-table-hover-hline': { height: '2px' },
    '.cm-table-hover-vline': { width: '2px' },
});

// =====================================================================
// Auto-pair keymap
// =====================================================================
const AP = { '[': ']', '(': ')', '{': '}', '"': '"', "'": "'", '`': '`' };
const SYM = new Set(['"', "'", '`']);
function makeAutoPairKeymap() {
    const b = [];
    for (const [o, c] of Object.entries(AP)) {
        b.push({
            key: o, run(v) {
                const { from, to } = v.state.selection.main;
                const s = v.state.doc.sliceString(from, to), n = v.state.doc.sliceString(from, from + 1);
                if (o === '`') { const l = v.state.doc.lineAt(from), bf = v.state.doc.sliceString(l.from, from); if (bf === '``' && n !== '`') { v.dispatch({ changes: { from: s ? l.from : from, to, insert: s ? '```\n' + s + '\n```' : '`\n\n```' }, selection: { anchor: s ? l.from + 4 : from + 2 } }); return true; } }
                if (SYM.has(o) && n === c && !s) { v.dispatch({ selection: { anchor: from + 1 } }); return true; }
                v.dispatch({ changes: { from, to, insert: s ? o + s + c : o + c }, selection: s ? { anchor: from + 1, head: to + 1 } : { anchor: from + 1 } }); return true;
            }
        });
        if (o !== c) b.push({ key: c, run(v) { const { from, to } = v.state.selection.main; if (from === to && v.state.doc.sliceString(from, from + 1) === c) { v.dispatch({ selection: { anchor: from + 1 } }); return true; } return false; } });
    }
    b.push({ key: 'Backspace', run(v) { const { from, to } = v.state.selection.main; if (from !== to || from < 1) return false; const p = v.state.doc.sliceString(from - 1, from), n = v.state.doc.sliceString(from, from + 1); if (AP[p] === n) { v.dispatch({ changes: { from: from - 1, to: from + 1, insert: '' }, selection: { anchor: from - 1 } }); return true; } return false; } });
    return Prec.highest(keymap.of(b));
}

// =====================================================================
// Component
// =====================================================================
export default function LiveEditor({ content, onChange }) {
    const editorRef = useRef(null);
    const viewRef = useRef(null);
    const { theme } = useTheme();
    const { addToast } = useApp();
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const addToastRef = useRef(addToast);
    addToastRef.current = addToast;

    useEffect(() => { if (editorRef.current) editorRef.current.__cmView = viewRef; });

    useEffect(() => {
        if (!editorRef.current) return;
        const ext = [
            lineNumbers(), highlightActiveLine(), history(), bracketMatching(),
            markdown({ base: markdownLanguage, codeLanguages: languages }),
            syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
            keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
            makeAutoPairKeymap(), blockDecoField, inlinePlugin, livePreviewTheme, checkboxClick(),
            EditorView.updateListener.of(u => { if (u.docChanged) onChangeRef.current(u.state.doc.toString()); }),
            EditorView.lineWrapping,
            EditorView.domEventHandlers({
                paste(event, view) {
                    const items = event.clipboardData?.items;
                    if (!items) return false;
                    for (const item of items) {
                        if (item.type.startsWith('image/')) {
                            event.preventDefault();
                            const file = item.getAsFile();
                            if (!file) return true;
                            api.uploadImage(file).then(d => {
                                view.dispatch({ changes: { from: view.state.selection.main.from, insert: `![image](${d.url})` } });
                                addToastRef.current('Image uploaded');
                            }).catch(() => addToastRef.current('Image upload failed'));
                            return true;
                        }
                    }
                    return false;
                }
            }),
        ];
        const dark = ['dark', 'github-dark', 'high-contrast', 'solarized-dark', 'nord'];
        if (dark.includes(theme)) ext.push(oneDark);

        const state = EditorState.create({ doc: content || '', extensions: ext });
        const view = new EditorView({ state, parent: editorRef.current });
        viewRef.current = view;
        return () => { view.destroy(); viewRef.current = null; };
    }, [theme]);

    useEffect(() => {
        if (viewRef.current) {
            const cur = viewRef.current.state.doc.toString();
            if (content !== cur) viewRef.current.dispatch({ changes: { from: 0, to: cur.length, insert: content || '' } });
        }
    }, [content]);

    return <div ref={editorRef} className="live-editor-container" style={{ height: '100%', overflow: 'hidden' }} />;
}
