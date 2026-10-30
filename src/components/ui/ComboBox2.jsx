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
 *   options        [{ value, label, code?, detail? }]  (any order, sorted internally). code: e.g. a barcode,
 *                  which several options may share; detail: shown beside the label in the list (e.g. a price)
 *   value          controlled value (use null for "nothing selected")
 *   defaultValue   initial value when uncontrolled
 *   onChange       (value) => void      (called with null when cleared)
 *   onUnknownCode  (code) => void       a code was entered that no option has (see Codes below)
 *   placeholder, itemHeight (32), visibleRows (8), resetMs (800)
 *   fullWidth      fill the container instead of 280px
 *   disabled, clearable (Delete key or × button)
 *   name           renders a hidden <input> so the value is submitted with a <form>
 *   id, aria-label, aria-labelledby   for <label htmlFor> / screen readers
 *   portalTarget   element the popup is rendered into (default document.body)
 *   dir            "ltr" | "rtl"; default: inherit from the surrounding page
 *   messages       { clear, typeToJump(count), jumpedBy(text), sameCode(code, count) } to translate the UI strings
 *   Keys: type to jump, arrows/Home/End/PageUp/PageDown, Enter selects (popup open), Esc closes,
 *         Alt+Down or F4 opens, Delete clears (clearable)
 *   ref            forwarded to the <input>, so ref.current.focus() works
 *
 * Codes (barcodes), when options have them: a digit typed (also an Arabic-Indic one) starts a code, shown in the box as it's typed, with no
 * time limit; Backspace edits it, Esc drops it. Enter or Tab ends it, as does a scanner's burst of keys stopping
 * (some scanners send neither). The code then selects the option with that code, and Enter or Tab is left alone, so
 * a form can move on to its next field; when several options share it, the list opens with just those to choose
 * from; when none has it, onUnknownCode is called (and Enter or Tab is stopped). A code that starts with a letter
 * works the same when it's followed by Enter, though it isn't shown; letters match in either case. A code pasted
 * (Ctrl+V) ends at once. Without codes, digits are type-ahead like any other key.
 *
 * The popup is rendered in a portal with position: fixed, so it is never clipped by
 * overflow: hidden ancestors, and it flips above the field when there's no room below.
 */

const CHROME = 28; // popup height besides the rows: footer (26) + borders (2)
// A scanner types its keys this close together (ms); then a pause this long ends its code
const SCANNER_KEY_GAP = 50;
const SCANNER_END = 120;
// The Enter a scanner sends after its code, when the pause ended the code first: as late as this (ms) after it
const SCANNER_LATE_ENTER = 400;

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
  sameCode: (code, count) => (
    <>
      {count} items with code <bdi>{code}</bdi>
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

// Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits as ASCII, as some keyboard layouts make a scanner type them
const asciiDigits = (text) =>
  text.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 0xf));
// A code as it's looked up: its letters in either case (a scanner types them as Caps Lock has them)
const lookupCode = (text) => asciiDigits(String(text).trim()).toUpperCase();
const isDigit = (ch) => /^[0-9٠-٩۰-۹]$/.test(ch);

export const Combobox = forwardRef(function Combobox(
  {
    options,
    value: valueProp,
    defaultValue = null,
    onChange,
    onUnknownCode,
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
  // Each code's item indexes (several items may share a code)
  const codes = useMemo(() => {
    const byCode = new Map();
    items.forEach((item, i) => {
      if (item.code == null || item.code === "") return;
      const code = lookupCode(item.code);
      byCode.set(code, [...(byCode.get(code) ?? []), i]);
    });
    return byCode;
  }, [items]);
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
  // The list's items: all of them (null), or those sharing a code, by value: the options may change while it's open
  // (loaded again), and an index would then point at another item, or past the end
  const [filterValues, setFilterValues] = useState(null);
  const filter = useMemo(
    () =>
      filterValues &&
      filterValues.map((v) => items.findIndex((item) => item.value === v)).filter((i) => i >= 0),
    [filterValues, items]
  );
  const shown = filter ? filter.length : n;
  const itemAt = (i) => items[filter ? filter[i] : i];
  const [activeState, setActive] = useState(0);
  // Within the list, which may have got shorter
  const active = Math.max(0, Math.min(activeState, shown - 1));
  const [scrollTop, setScrollTop] = useState(0);
  const [hint, setHint] = useState("");
  const [pos, setPos] = useState(null); // { left, top, width, rows, dir }
  // A code being typed (shown in the box), or null; its keys' times tell a scanner's burst
  const [code, setCode] = useState(null);
  const codeRef = useRef(null);
  const codeKeyTimes = useRef([]);
  const codeTimer = useRef(null);
  // A code a scanner's pause ended: when, and whether it selected its item (see SCANNER_LATE_ENTER)
  const pauseEnded = useRef(null);
  const inputRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);
  const typed = useRef("");
  // Everything typed since the last pause, as typed: a code that starts with a letter (typed keeps only what matched)
  const scanned = useRef("");
  const timer = useRef(null);
  const beforeInput = useRef(null);

  useImperativeHandle(ref, () => inputRef.current, []);

  const rows = pos ? pos.rows : Math.min(visibleRows, shown);
  const viewH = rows * itemHeight;
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - 3);
  const end = Math.min(shown, start + rows + 7);

  /* ---------- positioning (portal + flip + shrink to fit) ---------- */

  function place(count = shown) {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4,
      margin = 8;
    const below = window.innerHeight - r.bottom - gap - margin;
    const above = r.top - gap - margin;
    const want = Math.min(visibleRows, count) * itemHeight + CHROME;
    const up = below < want && above > below;
    const room = up ? above : below;
    const fit = Math.max(
      1,
      Math.min(visibleRows, count, Math.floor((room - CHROME) / itemHeight))
    );
    const h = fit * itemHeight + CHROME;
    setPos({
      left: r.left,
      width: r.width,
      top: up ? r.top - gap - h : r.bottom + gap,
      rows: fit,
      // The popup is portaled to <body>, so copy the field's direction onto it: the wrapper's, as the field is left
      // to right while a code is typed in it
      dir: window.getComputedStyle(el.parentElement).direction,
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
  }, [open, shown, visibleRows, itemHeight]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(codeTimer.current);
    },
    []
  );
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  // Nothing left to list (the options changed while it was open)
  useEffect(() => {
    if (open && shown === 0) closeList();
  }, [open, shown]);

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

  /** Opens the list: all the items, or only those at the indexes given (sharing a code). */
  function openList(only = null) {
    if (disabled || !n) return;
    setFilterValues(only && only.map((i) => items[i].value));
    setActive(only ? 0 : Math.max(selectedIndex, 0));
    setScrollTop(0);
    place(only ? only.length : n);
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    setFilterValues(null);
  }

  function commit(i) {
    const item = itemAt(i);
    if (item) setValue(item.value);
    closeList();
  }

  function clear() {
    setValue(null);
    closeList();
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

  /* ---------- codes ---------- */

  function setCodeText(text) {
    codeRef.current = text;
    setCode(text);
  }

  function dropCode() {
    clearTimeout(codeTimer.current);
    codeKeyTimes.current = [];
    setCodeText(null);
  }

  /** Adds a key to the code being typed; a scanner's burst ends it by itself once it stops. */
  function codeKey(ch) {
    const now = Date.now();
    const times = [...codeKeyTimes.current, now];
    codeKeyTimes.current = times;
    setCodeText((codeRef.current ?? "") + asciiDigits(ch));
    clearTimeout(codeTimer.current);
    const burst =
      times.length >= 4 && times.every((t, i) => i === 0 || t - times[i - 1] < SCANNER_KEY_GAP);
    if (burst) codeTimer.current = setTimeout(() => endCode(null, codeRef.current, true), SCANNER_END);
  }

  /**
   * The code typed, ended by Enter or Tab (event) or a scanner's pause (null, byPause): selects its item, or lists the
   * items sharing it, or reports it unknown. Only selecting leaves the key to the form.
   */
  function endCode(e, text = codeRef.current, byPause = false) {
    dropCode();
    if (!text) return;
    const found = codes.get(lookupCode(text)) ?? [];
    if (byPause) pauseEnded.current = { at: Date.now(), selected: found.length === 1 };
    if (found.length === 1) {
      setValue(items[found[0]].value);
      closeList();
      return;
    }
    e?.preventDefault();
    if (found.length > 1) openList(found);
    else onUnknownCode?.(text.trim());
  }

  /** A key while a code is being typed; true if it was the code's. */
  function codeModeKey(e) {
    if (codeRef.current === null) return false;
    if (e.key.length === 1) {
      e.preventDefault();
      codeKey(e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      const shorter = codeRef.current.slice(0, -1);
      if (shorter) setCodeText(shorter);
      else dropCode();
    } else if (e.key === "Enter" || e.key === "Tab") {
      endCode(e);
    } else if (e.key === "Escape") {
      e.preventDefault();
      dropCode();
    } else {
      // Any other key (an arrow...) gives up the code and does what it does
      dropCode();
      return false;
    }
    return true;
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
    timer.current = setTimeout(resetTyping, resetMs);
    return true;
  }

  function resetTyping() {
    typed.current = "";
    scanned.current = "";
    setHint("");
  }

  /** A typed character or Backspace: a digit starts a code (when there are codes), anything else is type-ahead. */
  function typeKey(key) {
    if (codes.size > 0 && key.length === 1 && isDigit(key) && !typed.current) {
      clearTimeout(timer.current);
      resetTyping();
      if (open && filter) closeList();
      codeKey(key);
      return true;
    }
    let next = typed.current;
    if (key === "Backspace") {
      if (!next && !scanned.current) return false;
      next = next.slice(0, -1);
      scanned.current = scanned.current.slice(0, -1);
    } else if (key.length === 1) {
      next += key.toLowerCase(); // includes " "
      scanned.current += key;
    } else return false;
    if (filter) closeList();
    return search(next);
  }

  /**
   * Enter after type-ahead: what was typed is a code if it isn't the start of a label (a code that starts with a
   * letter). False when it was plain type-ahead.
   */
  function enterAfterTyping(e) {
    const text = scanned.current.trim();
    const typedALabel = typed.current === scanned.current.toLowerCase();
    if (codes.size === 0 || !text || typedALabel) return false;
    clearTimeout(timer.current);
    resetTyping();
    endCode(e, text);
    return true;
  }

  // Touch/virtual keyboards often send key "Unidentified" in keydown but report the
  // text in a native `beforeinput` event, so listen for that too. We never let text
  // land in the field.
  beforeInput.current = (e) => {
    if (disabled || !n) return;
    if (e.inputType === "insertLineBreak") return; // Enter: leave it alone (form submit)
    e.preventDefault();
    const typeText = (text) => {
      for (const ch of text) {
        if (codeRef.current !== null) codeKey(ch);
        else typeKey(ch);
      }
    };
    if (e.inputType === "insertFromPaste") {
      // A pasted code ends at once, as if Enter followed it; other text jumps like typing
      const text = (e.data ?? e.dataTransfer?.getData("text/plain") ?? "").trim();
      if (!text) return;
      clearTimeout(timer.current);
      resetTyping();
      dropCode();
      if (codes.size > 0 && (isDigit(text[0]) || codes.has(lookupCode(text)))) endCode(null, text);
      else search(text.toLowerCase());
    } else if (e.inputType === "insertText" && e.data) typeText(e.data);
    else if (e.inputType === "insertCompositionText" && e.data)
      search(e.data.toLowerCase());
    else if (e.inputType === "deleteContentBackward") {
      if (codeRef.current !== null) {
        const shorter = codeRef.current.slice(0, -1);
        if (shorter) setCodeText(shorter);
        else dropCode();
      } else typeKey("Backspace");
    }
  };
  useEffect(() => {
    const el = inputRef.current;
    const h = (e) => beforeInput.current(e);
    el.addEventListener("beforeinput", h);
    return () => el.removeEventListener("beforeinput", h);
  }, []);

  function onKeyDown(e) {
    if (disabled || !n) return;
    // The scanner's own Enter, late after its pause ended the code: what Enter would do after the code. It moves on
    // from an item selected (left to the form); it doesn't pick the first of those sharing the code, nor move on from
    // a code no item has.
    const ended = pauseEnded.current;
    pauseEnded.current = null;
    if (e.key === "Enter" && ended && Date.now() - ended.at < SCANNER_LATE_ENTER) {
      if (!ended.selected) e.preventDefault();
      return;
    }
    // Open the list from the keyboard: Alt+Down, or F4 (which also closes it)
    if ((e.altKey && e.key === "ArrowDown") || e.key === "F4") {
      e.preventDefault();
      dropCode();
      if (!open) openList();
      else if (e.key === "F4") closeList();
      return;
    }
    // AltGr reports ctrl+alt; it types characters, so let it through.
    const altGr = e.getModifierState?.("AltGraph");
    if (e.metaKey || ((e.ctrlKey || e.altKey) && !altGr)) return;
    if (codeModeKey(e)) return;
    if (typeKey(e.key)) return e.preventDefault();

    if (e.key === "Delete" && clearable && selectedIndex >= 0) {
      e.preventDefault();
      return clear();
    }

    const cur = open ? active : selectedIndex;
    const last = (open ? shown : n) - 1;
    const page = rows - 1;
    const target = {
      ArrowDown: cur + 1,
      ArrowUp: cur - 1,
      PageDown: cur + page,
      PageUp: cur - page,
      Home: 0,
      End: last,
    }[e.key];

    if (target !== undefined) {
      e.preventDefault();
      go(Math.min(last, Math.max(0, target)));
    } else if ((e.key === "Enter" || e.key === "Tab") && enterAfterTyping(e)) {
      // A code that starts with a letter: selected, listed or reported unknown
    } else if (e.key === "Enter" && open) {
      // Closed: Enter does nothing here and is left alone (e.g. it can submit a form).
      e.preventDefault();
      commit(active);
    } else if (e.key === "Escape") {
      const hadBuffer = typed.current !== "";
      clearTimeout(timer.current);
      resetTyping();
      if (open || hadBuffer) e.preventDefault();
      closeList();
    }
  }

  const showClear = clearable && selectedIndex >= 0 && !disabled && code === null;
  const rootClass = ["tac", fullWidth && "tac-full", showClear && "tac-has-clear", code !== null && "tac-coding"]
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
        // A code being typed is shown instead of the selection
        value={code ?? selectedLabel}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={() => {}} // display only; typing is handled as type-ahead
        onClick={() => (open ? closeList() : openList())}
        onBlur={() => {
          dropCode();
          closeList();
        }}
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
              <div style={{ height: shown * itemHeight, position: "relative" }}>
                {Array.from({ length: Math.max(0, end - start) }, (_, k) => {
                  const i = start + k;
                  const item = itemAt(i);
                  return (
                    <div
                      key={i}
                      id={optId(i)}
                      role="option"
                      aria-selected={item.value === value}
                      data-active={i === active}
                      className="tac-opt"
                      style={{ top: i * itemHeight, height: itemHeight }}
                      onMouseMove={() => i !== active && setActive(i)}
                      onClick={() => commit(i)}
                    >
                      <span className="tac-label">{item.label}</span>
                      {item.detail != null && <bdi className="tac-detail">{item.detail}</bdi>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="tac-foot">
              {filter && shown > 0 ? msg.sameCode(itemAt(0).code, shown) : hint ? msg.jumpedBy(hint) : msg.typeToJump(n)}
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
.tac-coding .tac-input{direction:ltr;text-align:end;letter-spacing:.04em;background:#fffbe6;border-color:#d4a72c}
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
.tac-opt{position:absolute;left:0;right:0;padding-block:0;padding-inline:10px;display:flex;align-items:center;gap:8px;
  cursor:pointer;white-space:pre;overflow:hidden;box-sizing:border-box}
.tac-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.tac-detail{flex-shrink:0;color:#5b6876;font-size:13px;direction:ltr}
.tac-opt[data-active="true"]{background:#e6eefc}
.tac-opt[aria-selected="true"]{font-weight:600}
.tac-foot{box-sizing:border-box;height:26px;line-height:25px;padding-block:0;padding-inline:10px;font-size:12px;color:#5b6876;
  border-top:1px solid #e3e8ee;white-space:pre;overflow:hidden;text-overflow:ellipsis}
`;
