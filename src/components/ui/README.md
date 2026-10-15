# ComboBox2
# react-typeahead-combobox

A select combobox for React that works like a Delphi `csDropDownList`: **you type letters to jump to an item, and nothing is written in the box.** No filtering, no text field to clear, no flicker. The highlight just moves to the first item that starts with what you typed.

It is built for long lists. The list is virtualized and matching uses a binary search, so 100,000+ options stay instant.

## Features

- **Type to jump.** Letters build a search buffer that resets after 800 ms. Spaces count as characters. Backspace shortens the buffer, Esc clears it.
- **Fast on huge lists.** Prefix matching is O(log n), and only the visible rows are rendered.
- **Keyboard first.** ↑ ↓ PageUp PageDown Home End, Enter to select, Alt+↓ or F4 to open, Esc to close, Delete to clear.
- **Popup that behaves.** Rendered in a portal, so `overflow: hidden` parents can't clip it. It flips above the field near the bottom of the screen and follows the field when the page scrolls.
- **Forms and accessibility.** `name` submits the value with a `<form>`, `id` works with `<label htmlFor>`, plus `aria-label`, `aria-labelledby` and the combobox/listbox ARIA pattern.
- **Right-to-left ready.** Layout mirrors automatically (caret, clear button, padding, text alignment), and the portaled popup follows the field's direction. Arabic and Hebrew typing work. UI strings can be translated.
- **Controlled or uncontrolled**, `disabled`, `clearable`, `fullWidth`, and a forwarded `ref` for `focus()`.
- **Zero dependencies** apart from React. Styles are built in and use `tac-` prefixed class names. TypeScript types included. Works with the Next.js App Router (`"use client"` is set).

## Usage

```jsx
import { useState } from "react";
import { Combobox } from "react-typeahead-combobox";

const options = [
  { value: 1, label: "Alice Johnson" },
  { value: 2, label: "Bob Smith" },
  // ...100,000 more
];

export function Example() {
  const [id, setId] = useState(null);
  return (
    <Combobox
      options={options}
      value={id}
      onChange={setId}
      placeholder="Select a person…"
      clearable
      aria-label="Person"
    />
  );
}
```

Focus it from code:

```jsx
const ref = useRef(null);
<Combobox ref={ref} options={options} />;
ref.current?.focus(); // ref is the underlying <input>
```

In a form (uncontrolled):

```jsx
<label htmlFor="city">City</label>
<Combobox id="city" name="city" options={cities} defaultValue={2} />
```

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `options` | `{ value, label }[]` | required | Items. Any order; sorted internally. `value` is a string or number. |
| `value` | `V \| null` | | Controlled value. `null` means nothing selected. |
| `defaultValue` | `V \| null` | `null` | Initial value when uncontrolled. |
| `onChange` | `(value: V \| null) => void` | | Called on selection, and with `null` when cleared. |
| `placeholder` | `string` | `"Select…"` | Shown when nothing is selected. |
| `itemHeight` | `number` | `32` | Row height in px. Must be fixed. |
| `visibleRows` | `number` | `8` | Maximum rows shown before scrolling. |
| `resetMs` | `number` | `800` | Silence (ms) before the search buffer resets. |
| `fullWidth` | `boolean` | `false` | Fill the container instead of 280px. |
| `disabled` | `boolean` | `false` | Disable the field. It is not submitted with forms. |
| `clearable` | `boolean` | `false` | Show a × button and enable the Delete key. |
| `name` | `string` | | Adds a hidden input so the value is submitted with a form. |
| `id` | `string` | | Id of the field, for `<label htmlFor>`. |
| `aria-label`, `aria-labelledby` | `string` | | Accessible name for the field and its listbox. |
| `dir` | `"ltr" \| "rtl"` | inherited | Text direction. By default the field follows the page (`<html dir>` or any ancestor). |
| `messages` | `{ clear?, typeToJump?, jumpedBy? }` | English | Translate the built-in strings (see Right-to-left below). |
| `portalTarget` | `Element` | `document.body` | Where the popup is rendered. |

## Keyboard

| Key | Popup closed | Popup open |
| --- | --- | --- |
| Letters, space | Selects the first item starting with what you typed | Moves the highlight |
| ↑ ↓ PageUp PageDown Home End | Changes the selection | Moves the highlight |
| Enter | Does nothing (not consumed, so it can still submit a form) | Selects the highlighted item |
| Alt+↓ or F4 | Opens the list | F4 closes it |
| Esc | Clears the search buffer | Closes the list and clears the buffer |
| Delete | Clears the selection (`clearable`) | Clears the selection (`clearable`) |

Selection is prefix-based and case-insensitive. If a keystroke matches nothing it is ignored, and the highlight stays where it was.

## Right-to-left

The component follows the direction of the page, so with `<html dir="rtl">` (or any `dir="rtl"` ancestor) it mirrors on its own. You can also force it per field:

```jsx
<Combobox dir="rtl" options={options} placeholder="اختر…" />
```

The popup is rendered in a portal outside the field's ancestors, so the component copies the field's direction onto it. The popup always lines up with the field.

The built-in text (the clear button's label and the line under the list) is English by default. Translate it with `messages`. Any key you leave out keeps its default:

```jsx
<Combobox
  dir="rtl"
  options={options}
  clearable
  messages={{
    clear: "مسح الاختيار",
    typeToJump: (count) => `${count} عنصر · اكتب للانتقال`,
    jumpedBy: (text) => <>قفزة إلى «<bdi>{text}</bdi>»</>,
  }}
/>
```

Wrap the typed text in `<bdi>` in `jumpedBy`, as above. It keeps text in the opposite direction from scrambling the sentence.

Matching compares characters exactly, so typing `ا` finds labels starting with `ا` but not `أ` or `إ`, and diacritics are not ignored. If you need looser Arabic matching, normalize your labels before passing them in.

## Good to know

- **Prefix search, not filtering.** If you need "contains" matching or a text input, use a filtering autocomplete instead.
- **Dialogs.** The popup lives outside the dialog's DOM. Some dialog libraries treat a click on an option as an outside click. If that happens, pass the dialog element as `portalTarget`.
- **Touch keyboards.** They are supported through the `beforeinput` event. This was tested with emulated input rather than on physical phones, so please report any device that misbehaves.
- **Styling.** The default styles are injected by the component, so they load after your stylesheet. To override a `tac-*` class, use a more specific selector than a single class, for example `.tac .tac-input { … }` for the field, or `body .tac-pop { … }` and `body .tac-opt { … }` for the popup (which is rendered in a portal, outside `.tac`).

## License

MIT
