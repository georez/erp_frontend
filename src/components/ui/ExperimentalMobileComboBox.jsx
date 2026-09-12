'use client';

import { useRef, useState } from "react";

const ITEM_HEIGHT = 32;
const VISIBLE_COUNT = 8;
const CONTAINER_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;

export default function MobileComboBox({ choices = [] }) {
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);

  const listRef = useRef(null);
  const inputRef = useRef(null);

  // Filter choices based on input string
  const filteredChoices = inputValue
    ? choices.filter((c) => c.text.startsWith(inputValue))
    : choices;

  // Handle typing inside the real input
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    setIsOpen(true);
    setScrollTop(0);
    if (listRef.current) listRef.current.scrollTop = 0;
  };

  // Virtualization calculations
  const totalHeight = filteredChoices.length * ITEM_HEIGHT;
  const startIndex = Math.max(
    0,
    Math.min(
      Math.max(0, filteredChoices.length - VISIBLE_COUNT),
      Math.floor(scrollTop / ITEM_HEIGHT) - 2
    )
  );
  const endIndex = Math.min(
    filteredChoices.length,
    Math.ceil((scrollTop + CONTAINER_HEIGHT) / ITEM_HEIGHT) + 2
  );
  const visibleChoices = filteredChoices.slice(startIndex, endIndex);

  return (
    <div
      onBlur={(e) => {
        // Prevent closing when clicking inside the component dropdown
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setIsOpen(false);
        }
      }}
      style={{
        position: 'relative',
        width: '100%',
        outline: 'none'
      }}
    >
      {/* Trigger Box with Real Input */}
      <div
        onClick={() => {
          setIsOpen(true);
          inputRef.current?.focus();
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: '36px',
          padding: '0 10px',
          border: '1px solid #ccc',
          borderRadius: '4px',
          backgroundColor: 'white',
          boxSizing: 'border-box'
        }}
      >
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder="Select or search..."
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            fontSize: '14px',
            backgroundColor: 'transparent'
          }}
        />

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
            justify: 'center'
          }}
        >
          ▼
        </button>
      </div>

      {/* Dropdown List */}
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
            zIndex: 10,
            WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
          }}
        >
          <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
            {visibleChoices.map((choice, idx) => {
              const actualIndex = startIndex + idx;
              const isSelected = selectedChoice?.id === choice.id;

              return (
                <div
                  key={choice.id}
                  // onMouseDown prevents input blur on mobile before selection triggers
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setSelectedChoice(choice);
                    setInputValue(choice.text);
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