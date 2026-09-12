'use client';

import ComboBox from "@/components/ui/ComboBox";

const choices = [];

console.log('generating choices');
for (let i = 0; i < 20000; i++) {
  choices.push({ id: i, text: i.toString() });
}

export default function Home() {
  return (
    <>
      <div>
        هذه الصفحة الرئيسية
      </div>
      <div>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
        <ComboBox choices={choices}/>
      </div>
    </>
  );
}
