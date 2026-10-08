'use client';

import { useEffect, useRef, useState } from "react";

const ITEM_HEIGHT = 32; // Height of each option in pixels
const VISIBLE_COUNT = 8; // Number of items visible at once
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;

export default function ComboBox({ choices = [] }) {

  const [selected, setSelected] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);

  const currentTimeout = useRef(null)
  const listRef = useRef(null);
  // Letters typed for type-ahead search. Never rendered, so a ref rather than state.
  const lettersPressed = useRef('');
  const currentChoiceIndex = choices.findIndex((choice) => choice === selectedChoice);

  // const style = !selected ?
  //   { backgroundColor: "white", color: "black" } :
  //   { backgroundColor: "darkblue", color: "white" };

  useEffect(() => {
    // Select the first choice starting with the typed letters and scroll it into view
    const selectFirstMatch = (prefix) => {
      const matchIndex = choices.findIndex((choice) => choice.text.startsWith(prefix));
      if (matchIndex === -1) {
        return;
      }
      const targetScroll = matchIndex * ITEM_HEIGHT;
      setSelectedChoice(choices[matchIndex]);
      setScrollTop(targetScroll);
      if (listRef.current) {
        listRef.current.scrollTop = targetScroll;
      }
    };

    const search = (e) => {
      if (!selected) {
        return;
      }

      if (e.key === 'Escape') {
        lettersPressed.current = '';
        setIsOpen(false);
        return;
      }

      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault(); // Prevent page scroll on Space press
      }

      if (e.key === 'ArrowUp') {
        setSelectedChoice(choices[Math.max(0, currentChoiceIndex - 1)]);
      } else if (e.key === 'ArrowDown') {
        setSelectedChoice(choices[Math.min(choices.length - 1, currentChoiceIndex + 1)]);
      } else if (e.key === 'Enter') {
        setIsOpen(false);
      }

      // Ignore modifier keys like Shift, Control, Alt
      if (e.key.length > 1) {
        return;
      }

      clearTimeout(currentTimeout.current);
      lettersPressed.current += e.key;
      currentTimeout.current = setTimeout(() => {
        lettersPressed.current = '';
      }, 2000);
      selectFirstMatch(lettersPressed.current);
    };

    window.addEventListener('keydown', search);
    return () => window.removeEventListener('keydown', search);
  }, [selected, currentChoiceIndex, choices]);

  // Sync scroll position when opening the dropdown menu
  useEffect(() => {
    if (isOpen && selectedChoice && listRef.current) {
      const initialScroll = currentChoiceIndex * ITEM_HEIGHT;
      listRef.current.scrollTop = initialScroll;
      setScrollTop(initialScroll);
    }
  }, [isOpen, selectedChoice, currentChoiceIndex]);

  // Virtualization windowing math
  const totalHeight = choices.length * ITEM_HEIGHT;
  const startIndex = Math.max(
    0,
    Math.min(choices.length - VISIBLE_COUNT, Math.floor(scrollTop / ITEM_HEIGHT) - 2)
  );
  const endIndex = Math.min(
    choices.length,
    Math.ceil((scrollTop + CONTAINER_HEIGHT) / ITEM_HEIGHT) + 2
  );
  const visibleChoices = choices.slice(startIndex, endIndex);

  return (
    <div
      tabIndex={0}
      onFocus={() => setSelected(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setSelected(false);
          setIsOpen(false);
          lettersPressed.current = '';
        }
      }}
      style={{
        position: 'relative',
        width: '100%',
        outline: 'none'
      }}
    >
      {/* Combobox Trigger Field */}
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: '36px',
          padding: '0 10px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          cursor: 'pointer',
          backgroundColor: selected ? '#f0f7ff' : 'white',
          boxSizing: 'border-box',
          userSelect: 'none',        /* Standard */
          WebkitUserSelect: 'none',  /* Safari / iOS support */
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {selectedChoice ? selectedChoice.text : ''}
        </span>

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          style={{
            flexShrink: 0,
            marginLeft: '8px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#666',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ▼
        </button>
      </div>

      {/* Virtualized Dropdown Menu */}
      {isOpen && (
        <div
          ref={listRef}
          onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          style={{
            position: 'absolute',
            top: '40px',
            left: 0,
            right: 0,
            height: `${CONTAINER_HEIGHT}px`,
            overflowY: 'auto',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: 'white',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            zIndex: 10
          }}
        >
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            {visibleChoices.map((choice, idx) => {
              const actualIndex = startIndex + idx;
              const isSelected = selectedChoice?.id === choice.id;

              return (
                <div
                  key={choice.id}
                  onClick={() => {
                    setSelectedChoice(choice);
                    setIsOpen(false);
                  }}
                  style={{
                    position: 'absolute',
                    top: `${actualIndex * ITEM_HEIGHT}px`,
                    left: 0,
                    right: 0,
                    height: `${ITEM_HEIGHT}px`,
                    lineHeight: `${ITEM_HEIGHT}px`,
                    padding: '0 10px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#2563eb' : 'transparent',
                    color: isSelected ? 'white' : 'black'
                  }}
                >
                  {choice.text}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}