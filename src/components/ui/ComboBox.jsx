'use client';

import { useEffect, useRef, useState } from "react";

const choices = [];

console.log('generating choices');
for (let i = 0; i < 20000; i++) {
  choices.push({ id: i, text: i.toString() });
}

export default function ComboBox() {

  const [selected, setSelected] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [currentLettersPressed, setCurrentLettersPressed] = useState([])
  const currentTimeout = useRef(null)

  const currentLettersPressedStr = currentLettersPressed.join('');

  const style = !selected ?
    { backgroundColor: "white", color: "black" } :
    { backgroundColor: "darkblue", color: "white" };

  useEffect(() => {
    const search = (e) => {
      if (!selected) {
        return;
      }
      if (e.key === 'Escape') {
        setCurrentLettersPressed([]);
        return;
      }

      clearTimeout(currentTimeout.current)
      setCurrentLettersPressed((prevState) => [...prevState, e.key]);
      currentTimeout.current = setTimeout(() => {
        setCurrentLettersPressed([]);
      }, 2000);
    };

    window.addEventListener('keydown', search);
    return () => window.removeEventListener('keydown', search);
  }, [selected]);

  useEffect(() => {
    if (currentLettersPressedStr === '') {
      return;
    }

    console.log(currentLettersPressedStr);

    for (const choice of choices) {
      if (choice.text.startsWith(currentLettersPressedStr)) {
        setSelectedChoice(choice);
        return;
      }
    }
  }, [currentLettersPressedStr, choices])

  return <div>
    <div
      tabIndex={0}
      style={{ width: '100%', height: '20px', ...style }}
      onFocus={() => setSelected(true)}
      onBlur={() => {
        setSelected(false);
        setCurrentLettersPressed([]);
      }}
    // onClick={() => console.log("div clicked")}
    >
      {selectedChoice?.text}
    </div>
  </div>
}