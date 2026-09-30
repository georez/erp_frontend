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
 *   ref            forwarded to the <input>, so ref.current.focus() works
 *
 * The popup is rendered in a portal with position: fixed, so it is never clipped by
 * overflow: hidden ancestors, and it flips above the field when there's no room below.
 */

const CHROME = 28; // popup height besides the rows: footer (26) + borders (2)

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

  const uid = useId(); // unique ids, so several comboboxes can share a page
  const listId = `${uid}-list`;
  const optId = (i) => `${uid}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [hint, setHint] = useState("");
  const [pos, setPos] = useState(null); // { left, top, width, rows }
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
    } else if (e.key === "Enter") {
      e.preventDefault();
      open ? commit(active) : openList();
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
    <div className={rootClass}>
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
          aria-label="Clear selection"
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
              {hint ? `Jumped by “${hint}”` : `${n.toLocaleString()} items · type to jump`}
            </div>
          </div>,
          portalTarget ?? document.body
        )}
    </div>
  );
});

const css = `
.tac{position:relative;width:280px;font:14px/1.3 system-ui,sans-serif;color:#1b2733}
.tac-full{width:100%}
.tac-input{width:100%;height:36px;box-sizing:border-box;padding:0 30px 0 10px;border:1px solid #b8c1cc;
  border-radius:6px;background:#fff;color:inherit;font:inherit;text-align:left;cursor:pointer;
  caret-color:transparent;text-overflow:ellipsis}
.tac-has-clear .tac-input{padding-right:54px}
.tac-input::placeholder{color:#7a8794;opacity:1}
.tac-input::selection{background:transparent}
.tac-input:focus-visible{outline:2px solid #2f6fed;outline-offset:1px}
.tac-input:disabled{opacity:.55;cursor:not-allowed}
.tac-caret{position:absolute;right:10px;top:0;height:36px;display:flex;align-items:center;pointer-events:none}
.tac-clear{position:absolute;right:28px;top:6px;width:24px;height:24px;padding:0;border:0;border-radius:4px;
  background:transparent;color:#5b6876;font-size:16px;line-height:1;cursor:pointer}
.tac-clear:hover{background:#eef1f5}
.tac-pop{position:fixed;z-index:1000;box-sizing:border-box;background:#fff;color:#1b2733;
  font:14px/1.3 system-ui,sans-serif;border:1px solid #b8c1cc;border-radius:6px;
  box-shadow:0 8px 24px rgba(27,39,51,.14);overflow:hidden}
.tac-list{overflow-y:auto;position:relative}
.tac-opt{position:absolute;left:0;right:0;padding:0 10px;display:flex;align-items:center;
  cursor:pointer;white-space:pre;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box}
.tac-opt[data-active="true"]{background:#e6eefc}
.tac-opt[aria-selected="true"]{font-weight:600}
.tac-foot{box-sizing:border-box;height:26px;line-height:25px;padding:0 10px;font-size:12px;color:#5b6876;
  border-top:1px solid #e3e8ee;white-space:pre;overflow:hidden;text-overflow:ellipsis}
`;

/* ---------- Demo: 100,000 items ---------- */

const SYL = ["ka", "lo", "mi", "ra", "ten", "sol", "dan", "vi", "or", "el", "nu", "bar"];

function makeData(count) {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const word = () => {
    let w = "";
    for (let p = 1 + Math.floor(rnd() * 2); p > 0; p--)
      w += SYL[Math.floor(rnd() * SYL.length)];
    return w[0].toUpperCase() + w.slice(1);
  };
  // Every 5th label has a double space, every 7th a leading space (to test spaces)
  return Array.from({ length: count }, (_, id) => {
    const gap = id % 5 === 0 ? "  " : " ";
    return {
      value: id,
      label: `${id % 7 === 0 ? " " : ""}${word()}${gap}${word()}`,
    };
  });
}

export default function App() {
  const options = useMemo(() => makeData(100000), []);
  const [value, setValue] = useState(null);
  const comboRef = useRef(null);

  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", maxWidth: 360 }}>
      <label htmlFor="demo-contact" style={{ display: "block", marginBottom: 6, fontSize: 14 }}>
        Contact
      </label>
      <Combobox
        ref={comboRef}
        id="demo-contact"
        options={options}
        value={value}
        onChange={setValue}
        fullWidth
        clearable
      />
      <p style={{ fontSize: 13, color: "#5b6876" }}>
        Focus the field and type; spaces count, so “kalo mi” and “kalo  mi” match different
        labels. Delete clears. Selected id: {value ?? "none"}
      </p>
      <button type="button" onClick={() => comboRef.current?.focus()}>
        Focus combobox
      </button>
    </div>
  );
}
