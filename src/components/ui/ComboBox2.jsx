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
import "./ComboBox2.css";

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
 * Codes (barcodes), when options have them: a digit typed (also an Arabic-Indic one) starts a code, shown in the box
 * as it's typed, with no time limit; Backspace edits it, Esc drops it. Enter or Tab ends it, as does a scanner's burst
 * of keys stopping (some scanners send neither). The code then selects the option with that code, and Enter or Tab is
 * left alone, so a form can move on to its next field; when several options share it, the list opens with just those
 * to choose from; when none has it, onUnknownCode is called (and Enter or Tab is stopped). A code that starts with a
 * letter works the same when it's followed by Enter, though it isn't shown; letters match in either case. A code
 * pasted (Ctrl+V) ends at once. Without codes, digits are type-ahead like any other key.
 *
 * The popup is rendered in a portal with position: fixed, so it is never clipped by overflow: hidden ancestors, and it
 * flips above the field when there's no room below.
 */

// The popup's height besides its rows: the footer (26) and the borders (2)
const POPUP_CHROME_HEIGHT = 28;
// Between the field and the popup, and between the popup and the window's edge
const POPUP_GAP = 4;
const WINDOW_MARGIN = 8;
// Rows rendered beyond the visible ones, above and below, so scrolling doesn't show gaps
const ROWS_BEFORE = 3;
const ROWS_AFTER = 7;

// A scanner types its keys this close together (ms); then a pause this long ends its code
const SCANNER_KEY_GAP = 50;
const SCANNER_END = 120;
const SCANNER_MIN_KEYS = 4;
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

/** The first index whose key is >= prefix (the keys must be sorted): a binary search. */
function lowerBound(keys, prefix) {
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (keys[middle] < prefix) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits as ASCII, as some keyboard layouts make a scanner type them. */
function asciiDigits(text) {
  return text.replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) & 0xf));
}

/** A code as it's looked up: its letters in either case (a scanner types them as Caps Lock has them). */
function lookupCode(text) {
  return asciiDigits(String(text).trim()).toUpperCase();
}

function isDigit(character) {
  return /^[0-9٠-٩۰-۹]$/.test(character);
}

/** Whether the key times are a scanner's burst: enough keys, each close after the one before. */
function isScannerBurst(keyTimes) {
  return keyTimes.length >= SCANNER_MIN_KEYS
    && keyTimes.every((time, index) => index === 0 || time - keyTimes[index - 1] < SCANNER_KEY_GAP);
}

/** The items sorted by their lowercase label, so a prefix can be found by binary search. */
function sortedItems(options) {
  return options
    .map((option) => ({ ...option, key: option.label.toLowerCase() }))
    .sort((a, b) => {
      if (a.key < b.key) {
        return -1;
      }
      return a.key > b.key ? 1 : 0;
    });
}

/** Each code's item indexes (several items may share a code). */
function indexesByCode(items) {
  const byCode = new Map();
  items.forEach((item, index) => {
    if (item.code == null || item.code === "") {
      return;
    }
    const code = lookupCode(item.code);
    byCode.set(code, [...(byCode.get(code) ?? []), index]);
  });
  return byCode;
}

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
  /* ---------- the value: controlled if `value` is passed, otherwise kept here ---------- */

  const controlled = valueProp !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const value = controlled ? valueProp : uncontrolledValue;
  function setValue(next) {
    if (!controlled) {
      setUncontrolledValue(next);
    }
    onChange?.(next);
  }

  /* ---------- the items ---------- */

  const items = useMemo(() => sortedItems(options), [options]);
  const keys = useMemo(() => items.map((item) => item.key), [items]);
  const codes = useMemo(() => indexesByCode(items), [items]);
  const itemCount = items.length;
  const selectedIndex = useMemo(
    () => (value == null ? -1 : items.findIndex((item) => item.value === value)),
    [items, value]
  );
  const selectedLabel = selectedIndex >= 0 ? items[selectedIndex].label : "";

  const messages = { ...DEFAULT_MESSAGES, ...messagesProp };
  // Unique ids, so several comboboxes can share a page
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index) => `${baseId}-opt-${index}`;

  /* ---------- the list's state ---------- */

  const [open, setOpen] = useState(false);
  // The list's items: all of them (null), or those sharing a code, by value: the options may change while it's open
  // (loaded again), and an index would then point at another item, or past the end
  const [filterValues, setFilterValues] = useState(null);
  const filter = useMemo(() => {
    if (!filterValues) {
      return null;
    }
    return filterValues
      .map((filterValue) => items.findIndex((item) => item.value === filterValue))
      .filter((index) => index >= 0);
  }, [filterValues, items]);
  const shownCount = filter ? filter.length : itemCount;
  const shownItem = (index) => items[filter ? filter[index] : index];

  const [activeState, setActive] = useState(0);
  // The highlighted row, within the list, which may have got shorter
  const active = Math.max(0, Math.min(activeState, shownCount - 1));
  const [scrollTop, setScrollTop] = useState(0);
  // { left, top, width, rows, dir } of the popup once placed
  const [popup, setPopup] = useState(null);
  // What type-ahead has matched so far, shown under the list
  const [hint, setHint] = useState("");

  /* ---------- the code (barcode) being typed ---------- */

  // The code being typed (shown in the box), or null; its keys' times tell a scanner's burst
  const [code, setCode] = useState(null);
  const codeRef = useRef(null);
  const codeKeyTimes = useRef([]);
  const scannerTimer = useRef(null);
  // A code a scanner's pause ended: when, and whether it selected its item (see SCANNER_LATE_ENTER)
  const pauseEnded = useRef(null);

  /* ---------- type-ahead ---------- */

  // The prefix typed so far (lowercase), which matched a label
  const typeAheadText = useRef("");
  // Everything typed since the last pause, as typed: a code that starts with a letter (typeAheadText keeps only what
  // matched)
  const typedSincePause = useRef("");
  const typeAheadTimer = useRef(null);

  const inputRef = useRef(null);
  const popupRef = useRef(null);
  const listRef = useRef(null);
  const beforeInputHandler = useRef(null);

  useImperativeHandle(ref, () => inputRef.current, []);

  // Only the rows in view (and a few around them) are rendered
  const rows = popup ? popup.rows : Math.min(visibleRows, shownCount);
  const listHeight = rows * itemHeight;
  const firstRendered = Math.max(0, Math.floor(scrollTop / itemHeight) - ROWS_BEFORE);
  const lastRendered = Math.min(shownCount, firstRendered + rows + ROWS_AFTER);

  /* ---------- positioning (portal + flip + shrink to fit) ---------- */

  /** Places the popup under the field, or above it when there's more room there, with as many rows as fit. */
  function positionPopup(count = shownCount) {
    const field = inputRef.current;
    if (!field) {
      return;
    }
    const fieldBox = field.getBoundingClientRect();
    const roomBelow = window.innerHeight - fieldBox.bottom - POPUP_GAP - WINDOW_MARGIN;
    const roomAbove = fieldBox.top - POPUP_GAP - WINDOW_MARGIN;
    const wantedHeight = Math.min(visibleRows, count) * itemHeight + POPUP_CHROME_HEIGHT;
    const above = roomBelow < wantedHeight && roomAbove > roomBelow;
    const room = above ? roomAbove : roomBelow;
    const rowsThatFit = Math.max(
      1,
      Math.min(visibleRows, count, Math.floor((room - POPUP_CHROME_HEIGHT) / itemHeight))
    );
    const height = rowsThatFit * itemHeight + POPUP_CHROME_HEIGHT;
    setPopup({
      left: fieldBox.left,
      width: fieldBox.width,
      top: above ? fieldBox.top - POPUP_GAP - height : fieldBox.bottom + POPUP_GAP,
      rows: rowsThatFit,
      // The popup is portaled to <body>, so copy the field's direction onto it: the wrapper's, as the field is left
      // to right while a code is typed in it
      dir: window.getComputedStyle(field.parentElement).direction,
    });
  }

  // The popup follows the field when the page scrolls or the window is resized
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const reposition = (event) => {
      const scrolledTheList = event.target instanceof Node && popupRef.current?.contains(event.target);
      if (!scrolledTheList) {
        positionPopup();
      }
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shownCount, visibleRows, itemHeight]);

  useEffect(
    () => () => {
      clearTimeout(typeAheadTimer.current);
      clearTimeout(scannerTimer.current);
    },
    []
  );
  useEffect(() => {
    if (disabled) {
      setOpen(false);
    }
  }, [disabled]);
  // Nothing left to list (the options changed while it was open)
  useEffect(() => {
    if (open && shownCount === 0) {
      closeList();
    }
  }, [open, shownCount]);

  /** Scrolls the row into view; centred, or just enough to show it. */
  function scrollTo(index, center = false) {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const top = index * itemHeight;
    if (center) {
      list.scrollTop = top - (listHeight - itemHeight) / 2;
    } else if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (top + itemHeight > list.scrollTop + listHeight) {
      list.scrollTop = top + itemHeight - listHeight;
    }
  }

  // Centre the current item once the popup has mounted
  useEffect(() => {
    if (open) {
      scrollTo(active, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* ---------- opening, closing, selecting ---------- */

  /** Opens the list: all the items, or only those at the indexes given (sharing a code). */
  function openList(onlyIndexes = null) {
    if (disabled || !itemCount) {
      return;
    }
    setFilterValues(onlyIndexes && onlyIndexes.map((index) => items[index].value));
    setActive(onlyIndexes ? 0 : Math.max(selectedIndex, 0));
    setScrollTop(0);
    positionPopup(onlyIndexes ? onlyIndexes.length : itemCount);
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    setFilterValues(null);
  }

  /** Selects the list's row and closes the list. */
  function selectShown(index) {
    const item = shownItem(index);
    if (item) {
      setValue(item.value);
    }
    closeList();
  }

  function clear() {
    setValue(null);
    closeList();
    inputRef.current?.focus();
  }

  /** Open: moves the highlight. Closed: changes the selection directly (like Delphi). */
  function moveTo(index) {
    if (open) {
      setActive(index);
      scrollTo(index);
    } else {
      setValue(items[index].value);
    }
  }

  /* ---------- codes ---------- */

  function setCodeText(text) {
    codeRef.current = text;
    setCode(text);
  }

  function dropCode() {
    clearTimeout(scannerTimer.current);
    codeKeyTimes.current = [];
    setCodeText(null);
  }

  /** Adds a key to the code being typed; a scanner's burst ends it by itself once it stops. */
  function addCodeKey(character) {
    const keyTimes = [...codeKeyTimes.current, Date.now()];
    codeKeyTimes.current = keyTimes;
    setCodeText((codeRef.current ?? "") + asciiDigits(character));
    clearTimeout(scannerTimer.current);
    if (isScannerBurst(keyTimes)) {
      scannerTimer.current = setTimeout(() => endCode(null, codeRef.current, true), SCANNER_END);
    }
  }

  /** Backspace in a code: the code shorter by its last character, or none. */
  function shortenCode() {
    const shorter = codeRef.current.slice(0, -1);
    if (shorter) {
      setCodeText(shorter);
    } else {
      dropCode();
    }
  }

  /**
   * The code typed, ended by Enter or Tab (event) or a scanner's pause (null, byPause): selects its item, or lists the
   * items sharing it, or reports it unknown. Only selecting leaves the key to the form.
   */
  function endCode(event, text = codeRef.current, byPause = false) {
    dropCode();
    if (!text) {
      return;
    }
    const found = codes.get(lookupCode(text)) ?? [];
    if (byPause) {
      pauseEnded.current = { at: Date.now(), selected: found.length === 1 };
    }
    if (found.length === 1) {
      setValue(items[found[0]].value);
      closeList();
      return;
    }
    event?.preventDefault();
    if (found.length > 1) {
      openList(found);
    } else {
      onUnknownCode?.(text.trim());
    }
  }

  /** A key while a code is being typed; true if it was the code's. */
  function handleCodeKey(event) {
    if (codeRef.current === null) {
      return false;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      addCodeKey(event.key);
    } else if (event.key === "Backspace") {
      event.preventDefault();
      shortenCode();
    } else if (event.key === "Enter" || event.key === "Tab") {
      endCode(event);
    } else if (event.key === "Escape") {
      event.preventDefault();
      dropCode();
    } else {
      // Any other key (an arrow...) gives up the code and does what it does
      dropCode();
      return false;
    }
    return true;
  }

  /* ---------- type-ahead ---------- */

  /** Jumps to the first label starting with `prefix` (the whole text typed); ignores it if none does. */
  function search(prefix) {
    let matched = prefix;
    if (prefix) {
      const index = lowerBound(keys, prefix);
      if (index < itemCount && keys[index].startsWith(prefix)) {
        moveTo(index);
      } else {
        matched = typeAheadText.current;
      }
    }
    typeAheadText.current = matched;
    setHint(matched);
    clearTimeout(typeAheadTimer.current);
    typeAheadTimer.current = setTimeout(resetTyping, resetMs);
    return true;
  }

  function resetTyping() {
    typeAheadText.current = "";
    typedSincePause.current = "";
    setHint("");
  }

  /**
   * A typed character or Backspace: a digit starts a code (when there are codes), anything else is type-ahead.
   * Returns whether the key was used.
   */
  function handleTypedKey(key) {
    const startsACode = codes.size > 0 && key.length === 1 && isDigit(key) && !typeAheadText.current;
    if (startsACode) {
      clearTimeout(typeAheadTimer.current);
      resetTyping();
      if (open && filter) {
        closeList();
      }
      addCodeKey(key);
      return true;
    }

    let prefix = typeAheadText.current;
    if (key === "Backspace") {
      if (!prefix && !typedSincePause.current) {
        return false;
      }
      prefix = prefix.slice(0, -1);
      typedSincePause.current = typedSincePause.current.slice(0, -1);
    } else if (key.length === 1) {
      // Includes " "
      prefix += key.toLowerCase();
      typedSincePause.current += key;
    } else {
      return false;
    }
    if (filter) {
      closeList();
    }
    return search(prefix);
  }

  /**
   * Enter or Tab after type-ahead: what was typed is a code if it isn't the start of a label (a code that starts with
   * a letter). False when it was plain type-ahead.
   */
  function endTypedCode(event) {
    const text = typedSincePause.current.trim();
    const typedALabel = typeAheadText.current === typedSincePause.current.toLowerCase();
    if (codes.size === 0 || !text || typedALabel) {
      return false;
    }
    clearTimeout(typeAheadTimer.current);
    resetTyping();
    endCode(event, text);
    return true;
  }

  /* ---------- touch keyboards and pasting (beforeinput) ---------- */

  /** A pasted code ends at once, as if Enter followed it; other text jumps like typing. */
  function handlePaste(event) {
    const text = (event.data ?? event.dataTransfer?.getData("text/plain") ?? "").trim();
    if (!text) {
      return;
    }
    clearTimeout(typeAheadTimer.current);
    resetTyping();
    dropCode();
    const isACode = codes.size > 0 && (isDigit(text[0]) || codes.has(lookupCode(text)));
    if (isACode) {
      endCode(null, text);
    } else {
      search(text.toLowerCase());
    }
  }

  // Touch/virtual keyboards often send key "Unidentified" in keydown but report the text in a native `beforeinput`
  // event, so listen for that too. No text ever lands in the field.
  beforeInputHandler.current = (event) => {
    if (disabled || !itemCount) {
      return;
    }
    // Enter: leave it alone (a form's submit)
    if (event.inputType === "insertLineBreak") {
      return;
    }
    event.preventDefault();
    if (event.inputType === "insertFromPaste") {
      handlePaste(event);
    } else if (event.inputType === "insertText" && event.data) {
      for (const character of event.data) {
        if (codeRef.current !== null) {
          addCodeKey(character);
        } else {
          handleTypedKey(character);
        }
      }
    } else if (event.inputType === "insertCompositionText" && event.data) {
      search(event.data.toLowerCase());
    } else if (event.inputType === "deleteContentBackward") {
      if (codeRef.current !== null) {
        shortenCode();
      } else {
        handleTypedKey("Backspace");
      }
    }
  };
  useEffect(() => {
    const field = inputRef.current;
    const handler = (event) => beforeInputHandler.current(event);
    field.addEventListener("beforeinput", handler);
    return () => field.removeEventListener("beforeinput", handler);
  }, []);

  /* ---------- keys ---------- */

  /** The row a navigation key moves to, or undefined for another key. */
  function navigationTarget(key) {
    const current = open ? active : selectedIndex;
    const last = (open ? shownCount : itemCount) - 1;
    const page = rows - 1;
    const targets = {
      ArrowDown: current + 1,
      ArrowUp: current - 1,
      PageDown: current + page,
      PageUp: current - page,
      Home: 0,
      End: last,
    };
    const target = targets[key];
    return target === undefined ? undefined : Math.min(last, Math.max(0, target));
  }

  function handleKeyDown(event) {
    if (disabled || !itemCount) {
      return;
    }

    // The scanner's own Enter, late after its pause ended the code: what Enter would do after the code. It moves on
    // from an item selected (left to the form); it doesn't pick the first of those sharing the code, nor move on from
    // a code no item has.
    const ended = pauseEnded.current;
    pauseEnded.current = null;
    if (event.key === "Enter" && ended && Date.now() - ended.at < SCANNER_LATE_ENTER) {
      if (!ended.selected) {
        event.preventDefault();
      }
      return;
    }

    // Open the list from the keyboard: Alt+Down, or F4 (which also closes it)
    if ((event.altKey && event.key === "ArrowDown") || event.key === "F4") {
      event.preventDefault();
      dropCode();
      if (!open) {
        openList();
      } else if (event.key === "F4") {
        closeList();
      }
      return;
    }

    // AltGr reports ctrl+alt; it types characters, so let it through
    const altGr = event.getModifierState?.("AltGraph");
    if (event.metaKey || ((event.ctrlKey || event.altKey) && !altGr)) {
      return;
    }
    if (handleCodeKey(event)) {
      return;
    }
    if (handleTypedKey(event.key)) {
      event.preventDefault();
      return;
    }

    if (event.key === "Delete" && clearable && selectedIndex >= 0) {
      event.preventDefault();
      clear();
      return;
    }

    const target = navigationTarget(event.key);
    if (target !== undefined) {
      event.preventDefault();
      moveTo(target);
    } else if ((event.key === "Enter" || event.key === "Tab") && endTypedCode(event)) {
      // A code that starts with a letter: selected, listed or reported unknown
    } else if (event.key === "Enter" && open) {
      // Closed, Enter does nothing here and is left alone (e.g. it can submit a form)
      event.preventDefault();
      selectShown(active);
    } else if (event.key === "Escape") {
      const hadTypeAhead = typeAheadText.current !== "";
      clearTimeout(typeAheadTimer.current);
      resetTyping();
      if (open || hadTypeAhead) {
        event.preventDefault();
      }
      closeList();
    }
  }

  /* ---------- rendering ---------- */

  const showClear = clearable && selectedIndex >= 0 && !disabled && code === null;
  const rootClass = [
    "tac",
    fullWidth && "tac-full",
    showClear && "tac-has-clear",
    code !== null && "tac-coding",
  ].filter(Boolean).join(" ");

  let footer = messages.typeToJump(itemCount);
  if (filter && shownCount > 0) {
    footer = messages.sameCode(shownItem(0).code, shownCount);
  } else if (hint) {
    footer = messages.jumpedBy(hint);
  }

  /** The rows in view (and a few around them), each placed at its own height in the list. */
  function renderRows() {
    const renderedRows = [];
    for (let index = firstRendered; index < lastRendered; index++) {
      const item = shownItem(index);
      renderedRows.push(
        <div
          key={index}
          id={optionId(index)}
          role="option"
          aria-selected={item.value === value}
          data-active={index === active}
          className="tac-opt"
          style={{ top: index * itemHeight, height: itemHeight }}
          onMouseMove={() => index !== active && setActive(index)}
          onClick={() => selectShown(index)}
        >
          <span className="tac-label">{item.label}</span>
          {item.detail != null && <bdi className="tac-detail">{item.detail}</bdi>}
        </div>
      );
    }
    return renderedRows;
  }

  return (
    <div className={rootClass} dir={dir}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
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
        // Display only: typing is handled as type-ahead
        onChange={() => {}}
        onClick={() => (open ? closeList() : openList())}
        onBlur={() => {
          dropCode();
          closeList();
        }}
        onKeyDown={handleKeyDown}
      />
      <span className="tac-caret" aria-hidden="true">
        ▾
      </span>
      {showClear && (
        <button
          type="button"
          className="tac-clear"
          aria-label={messages.clear}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={clear}
        >
          ×
        </button>
      )}
      {name && (
        <input type="hidden" name={name} value={value ?? ""} disabled={disabled} />
      )}

      {open &&
        popup &&
        createPortal(
          // preventDefault keeps the focus on the field while clicking or scrolling the list
          <div
            ref={popupRef}
            className="tac-pop"
            dir={popup.dir}
            style={{ left: popup.left, top: popup.top, width: popup.width }}
            onMouseDown={(event) => event.preventDefault()}
          >
            <div
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              aria-labelledby={ariaLabelledBy}
              ref={listRef}
              className="tac-list"
              style={{ height: listHeight }}
              onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
            >
              <div style={{ height: shownCount * itemHeight, position: "relative" }}>
                {renderRows()}
              </div>
            </div>
            <div className="tac-foot">{footer}</div>
          </div>,
          portalTarget ?? document.body
        )}
    </div>
  );
});
