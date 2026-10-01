"use client";
import {
  useState,
  useRef,
  useMemo,
  useEffect,
  useId,
  useImperativeHandle,
  forwardRef,
} from "react";
import { createPortal } from "react-dom";

/**
 * Delphi-style (csDropDownList) combobox: type letters to jump, nothing is written in the box.
 *
 * Props
 *   options        [{ value, label }]  (any order, sorted internally)
 *   value          controlled value (use null for "nothing selected")
 *   defaultValue   initial value when uncontrolled
 *   onChange       (value) => void      (called with null when cleared)
 *   placeholder, itemHeight (32), visibleRows (8), resetMs (800)
 *   fullWidth      fill the container instead of 280px
 *   disabled, clearable (Delete key or × button)
 *   name           renders a hidden <input> so the value is submitted with a <form>
 *   id, aria-label, aria-labelledby   for <label htmlFor> / screen readers
 *   portalTarget   element the popup is rendered into (default document.body)
 *   dir            "ltr" | "rtl"; default: inherit from the surrounding page
 *   messages       { clear, typeToJump(count), jumpedBy(text) } to translate the UI strings
 *   Keys: type to jump, arrows/Home/End/PageUp/PageDown, Enter selects (popup open), Esc closes,
 *         Alt+Down or F4 opens, Delete clears (clearable)
 *   ref            forwarded to the <input>, so ref.current.focus() works
 *
 * The popup is rendered in a portal with position: fixed, so it is never clipped by
 * overflow: hidden ancestors, and it flips above the field when there's no room below.
 */

const CHROME = 28; // popup height besides the rows: footer (26) + borders (2)

// UI strings. Override any of them with the `messages` prop (they may return JSX).
const DEFAULT_MESSAGES = {
  clear: "Clear selection",
  typeToJump: (count) => `${count.toLocaleString()} items · type to jump`,
  // <bdi> isolates what was typed, so it can't scramble the surrounding sentence in RTL
  jumpedBy: (text) => (
    <>
      Jumped by “<bdi>{text}</bdi>”
    </>
  ),
};

// First index whose key is >= prefix (keys must be sorted).
function lowerBound(keys, prefix) {
  let lo = 0,
    hi = keys.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export const Combobox = forwardRef(function Combobox(
  {
    options,
    value: valueProp,
    defaultValue = null,
    onChange,
    placeholder = "Select…",
    itemHeight = 32,
    visibleRows = 8,
    resetMs = 800,
    fullWidth = false,
    disabled = false,
    clearable = false,
    name,
    id,
    portalTarget,
    dir,
    messages: messagesProp,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
  },
  ref
) {
  // Controlled if `value` is passed, otherwise keep our own state.
  const controlled = valueProp !== undefined;
  const [inner, setInner] = useState(defaultValue);
  const value = controlled ? valueProp : inner;
  function setValue(v) {
    if (!controlled) setInner(v);
    onChange?.(v);
  }

  // Sort once by lowercase label so binary search is valid.
  const items = useMemo(
    () =>
      options
        .map((o) => ({ ...o, key: o.label.toLowerCase() }))
        .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)),
    [options]
  );
  const keys = useMemo(() => items.map((i) => i.key), [items]);
  const n = items.length;
  const selectedIndex = useMemo(
    () => (value == null ? -1 : items.findIndex((i) => i.value === value)),
    [items, value]
  );
  const selectedLabel = selectedIndex >= 0 ? items[selectedIndex].label : "";

  const msg = { ...DEFAULT_MESSAGES, ...messagesProp };
  const uid = useId(); // unique ids, so several comboboxes can share a page
  const listId = `${uid}-list`;
  const optId = (i) => `${uid}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [hint, setHint] = useState("");
  const [pos, setPos] = useState(null); // { left, top, width, rows, dir }
  const inputRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);
  const typed = useRef("");
  const timer = useRef(null);
  const beforeInput = useRef(null);

  useImperativeHandle(ref, () => inputRef.current, []);

  const rows = pos ? pos.rows : Math.min(visibleRows, n);
  const viewH = rows * itemHeight;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 3);
  const end = Math.min(n, start + rows + 7);

  /* ---------- positioning (portal + flip + shrink to fit) ---------- */

  function place() {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4,
      margin = 8;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const want = Math.min(visibleRows, n) * itemHeight + CHROME;
    const up = below < want && above > below;
    const room = up ? above : below;
    const fit = Math.max(
      1,
      Math.min(visibleRows, n, Math.floor((room - CHROME) / itemHeight))
    );
    const h = fit * itemHeight + CHROME;
    setPos({
      left: r.left,
      width: r.width,
      top: up ? r.top - gap - h : r.bottom + gap,
      rows: fit,
      // The popup is portaled to <body>, so copy the field's direction onto it.
      dir: window.getComputedStyle(el).direction,
    });
  }

  useEffect(() => {
    if (!open) return;
    const reposition = (e) => {
      // ignore scrolling of the popup's own list
      if (e.target instanceof Node && popRef.current?.contains(e.target)) return;
      place();
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, n, visibleRows, itemHeight]);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  function scrollTo(i, center = false) {
    const el = listRef.current;
    if (!el) return;
    const top = i * itemHeight;
    if (center) el.scrollTop = top - (viewH - itemHeight) / 2;
    else if (top < el.scrollTop) el.scrollTop = top;
    else if (top + itemHeight > el.scrollTop + viewH)
      el.scrollTop = top + itemHeight - viewH;
  }

  // Centre the current item once the popup has mounted.
  useEffect(() => {
    if (open) scrollTo(active, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---------- actions ---------- */

  function openList() {
    if (disabled || !n) return;
    setActive(Math.max(selectedIndex, 0));
    place();
    setOpen(true);
  }

  function commit(i) {
    setValue(items[i].value);
    setOpen(false);
  }

  function clear() {
    setValue(null);
    setOpen(false);
    inputRef.current?.focus();
  }

  // Open: move the highlight. Closed: change the selection directly (like Delphi).
  function go(i) {
    if (open) {
      setActive(i);
      scrollTo(i);
    } else {
      setValue(items[i].value);
    }
  }

  /* ---------- type-ahead ---------- */

  // Match `next` (the whole buffer) as a prefix; ignore it if nothing matches.
  function search(next) {
    if (next) {
      const i = lowerBound(keys, next);
      if (i < n && keys[i].startsWith(next)) go(i);
      else next = typed.current;
    }
    typed.current = next;
    setHint(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      typed.current = "";
      setHint("");
    }, resetMs);
    return true;
  }

  function typeKey(key) {
    let next = typed.current;
    if (key === "Backspace") {
      if (!next) return false;
      next = next.slice(0, -1);
    } else if (key.length === 1) next += key.toLowerCase(); // includes " "
    else return false;
    return search(next);
  }

  // Touch/virtual keyboards often send key "Unidentified" in keydown but report the
  // text in a native `beforeinput` event, so listen for that too. We never let text
  // land in the field.
  beforeInput.current = (e) => {
    if (disabled || !n) return;
    if (e.inputType === "insertLineBreak") return; // Enter: leave it alone (form submit)
    e.preventDefault();
    if (e.inputType === "insertText" && e.data) for (const ch of e.data) typeKey(ch);
    else if (e.inputType === "insertCompositionText" && e.data)
      search(e.data.toLowerCase());
    else if (e.inputType === "deleteContentBackward") typeKey("Backspace");
  };
  useEffect(() => {
    const el = inputRef.current;
    const h = (e) => beforeInput.current(e);
    el.addEventListener("beforeinput", h);
    return () => el.removeEventListener("beforeinput", h);
  }, []);

  function onKeyDown(e) {
    if (disabled || !n) return;
    // Open the list from the keyboard: Alt+Down, or F4 (which also closes it)
    if ((e.altKey && e.key === "ArrowDown") || e.key === "F4") {
      e.preventDefault();
      if (!open) openList();
      else if (e.key === "F4") setOpen(false);
      return;
    }
    // AltGr reports ctrl+alt; it types characters, so let it through.
    const altGr = e.getModifierState?.("AltGraph");
    if (e.metaKey || ((e.ctrlKey || e.altKey) && !altGr)) return;
    if (typeKey(e.key)) return e.preventDefault();

    if (e.key === "Delete" && clearable && selectedIndex >= 0) {
      e.preventDefault();
      return clear();
    }

    const cur = open ? active : selectedIndex;
    const page = rows - 1;
    const target = {
      ArrowDown: cur + 1,
      ArrowUp: cur - 1,
      PageDown: cur + page,
      PageUp: cur - page,
      Home: 0,
      End: n - 1,
    }[e.key];

    if (target !== undefined) {
      e.preventDefault();
      go(Math.min(n - 1, Math.max(0, target)));
    } else if (e.key === "Enter" && open) {
      // Closed: Enter does nothing here and is left alone (e.g. it can submit a form).
      e.preventDefault();
      commit(active);
    } else if (e.key === "Escape") {
      const hadBuffer = typed.current !== "";
      clearTimeout(timer.current);
      typed.current = "";
      setHint("");
      if (open || hadBuffer) e.preventDefault();
      setOpen(false);
    }
  }

  const showClear = clearable && selectedIndex >= 0 && !disabled;
  const rootClass = ["tac", fullWidth && "tac-full", showClear && "tac-has-clear"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClass} dir={dir}>
      <style>{css}</style>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optId(active) : undefined}
        aria-autocomplete="none"
        aria-readonly="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className="tac-input"
        value={selectedLabel}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={() => {}} // display only; typing is handled as type-ahead
        onClick={() => (open ? setOpen(false) : openList())}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      <span className="tac-caret" aria-hidden="true">
        ▾
      </span>
      {showClear && (
        <button
          type="button"
          className="tac-clear"
          aria-label={msg.clear}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
        >
          ×
        </button>
      )}
      {name && (
        <input type="hidden" name={name} value={value ?? ""} disabled={disabled} />
      )}

      {open &&
        pos &&
        createPortal(
          // preventDefault keeps focus on the field while clicking/scrolling the list
          <div
            ref={popRef}
            className="tac-pop"
            dir={pos.dir}
            style={{ left: pos.left, top: pos.top, width: pos.width }}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              ref={listRef}
              className="tac-list"
              style={{ height: viewH }}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
              <div style={{ height: n * itemHeight, position: "relative" }}>
                {items.slice(start, end).map((item, k) => {
                  const i = start + k;
                  return (
                    <div
                      key={i}
                      id={optId(i)}
                      role="option"
                      aria-selected={i === selectedIndex}
                      data-active={i === active}
                      className="tac-opt"
                      style={{ top: i * itemHeight, height: itemHeight }}
                      onMouseMove={() => i !== active && setActive(i)}
                      onClick={() => commit(i)}
                    >
                      {item.label}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="tac-foot">
              {hint ? msg.jumpedBy(hint) : msg.typeToJump(n)}
            </div>
          </div>,
          portalTarget ?? document.body
        )}
    </div>
  );
});

const css = `
.tac{position:relative;width:280px;font:14px/1.3 system-ui,sans-serif;color:#1b2733;text-align:start}
.tac-full{width:100%}
.tac-input{width:100%;height:36px;box-sizing:border-box;padding-block:0;padding-inline:10px 30px;border:1px solid #b8c1cc;
  border-radius:6px;background:#fff;color:inherit;font:inherit;text-align:start;cursor:pointer;
  caret-color:transparent;text-overflow:ellipsis}
.tac-has-clear .tac-input{padding-inline-end:54px}
.tac-input::placeholder{color:#7a8794;opacity:1}
.tac-input::selection{background:transparent}
.tac-input:focus-visible{outline:2px solid #2f6fed;outline-offset:1px}
.tac-input:disabled{opacity:.55;cursor:not-allowed}
.tac-caret{position:absolute;inset-inline-end:10px;top:0;height:36px;display:flex;align-items:center;pointer-events:none}
.tac-clear{position:absolute;inset-inline-end:28px;top:6px;width:24px;height:24px;padding:0;border:0;border-radius:4px;
  background:transparent;color:#5b6876;font-size:16px;line-height:1;cursor:pointer}
.tac-clear:hover{background:#eef1f5}
.tac-pop{position:fixed;z-index:1000;box-sizing:border-box;background:#fff;color:#1b2733;
  font:14px/1.3 system-ui,sans-serif;text-align:start;border:1px solid #b8c1cc;border-radius:6px;
  box-shadow:0 8px 24px rgba(27,39,51,.14);overflow:hidden}
.tac-list{overflow-y:auto;position:relative}
.tac-opt{position:absolute;left:0;right:0;padding-block:0;padding-inline:10px;display:flex;align-items:center;
  cursor:pointer;white-space:pre;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box}
.tac-opt[data-active="true"]{background:#e6eefc}
.tac-opt[aria-selected="true"]{font-weight:600}
.tac-foot{box-sizing:border-box;height:26px;line-height:25px;padding-block:0;padding-inline:10px;font-size:12px;color:#5b6876;
  border-top:1px solid #e3e8ee;white-space:pre;overflow:hidden;text-overflow:ellipsis}
`;
