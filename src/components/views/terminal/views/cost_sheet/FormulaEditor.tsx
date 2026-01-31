
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Command } from 'lucide-react';

interface FormulaEditorProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  suggestions: { label: string; value: string; description?: string }[];
  className?: string;
}

export const FormulaEditor: React.FC<FormulaEditorProps> = ({
  initialValue,
  onSave,
  onCancel,
  suggestions,
  className
}) => {
  const [value, setValue] = useState(initialValue);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const filteredSuggestions = suggestions.filter(s => {
    const lastWord = value.slice(0, cursorPosition).split(/[\s+\-*/()%,]/).pop() || '';
    if (!lastWord) return false;
    return s.value.toLowerCase().includes(lastWord.toLowerCase()) && s.value.toLowerCase() !== lastWord.toLowerCase();
  });

  useEffect(() => {
    if (filteredSuggestions.length > 0) {
      setShowSuggestions(true);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
    }
  }, [value, cursorPosition, filteredSuggestions.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (showSuggestions && filteredSuggestions.length > 0) {
        e.preventDefault();
        applySuggestion(filteredSuggestions[selectedIndex]);
      } else {
        onSave(value);
      }
    } else if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'ArrowDown' && showSuggestions) {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % filteredSuggestions.length);
    } else if (e.key === 'ArrowUp' && showSuggestions) {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
    } else if (e.key === 'Tab' && showSuggestions && filteredSuggestions.length > 0) {
      e.preventDefault();
      applySuggestion(filteredSuggestions[selectedIndex]);
    }
  };

  const applySuggestion = (suggestion: { value: string }) => {
    const before = value.slice(0, cursorPosition);
    const after = value.slice(cursorPosition);
    const lastWordMatch = before.match(/[\s+\-*/()%,]([^\s+\-*/()%,]*)$/) || [null, before];
    const lastWord = lastWordMatch[1] || before;

    const newValue = before.slice(0, before.length - lastWord.length) + suggestion.value + after;
    setValue(newValue);
    setShowSuggestions(false);

    // Set focus back and move cursor
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = before.length - lastWord.length + suggestion.value.length;
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    }, 0);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);
  };

  const handleBlur = (e: React.FocusEvent) => {
    // Delay blur to allow clicking suggestions
    setTimeout(() => {
        if (!suggestionsRef.current?.contains(document.activeElement)) {
            onSave(value);
        }
    }, 200);
  };

  return (
    <div className={cn("relative w-full", className)}>
      <div className="flex items-center bg-white dark:bg-slate-800 border-2 border-primary rounded-md shadow-lg overflow-hidden">
        <div className="pl-2 pr-1 text-primary">
            {value.startsWith('=') ? <Command className="w-3.5 h-3.5" /> : <span className="text-xs font-bold">$</span>}
        </div>
        <input
          ref={inputRef}
          type="text"
          className="w-full h-8 px-1 py-1 text-sm bg-transparent border-none outline-none focus:ring-0 font-mono"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={(e) => setCursorPosition((e.target as HTMLInputElement).selectionStart || 0)}
        />
      </div>

      {showSuggestions && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-border rounded-md shadow-xl max-h-48 overflow-y-auto"
        >
          {filteredSuggestions.map((s, i) => (
            <button
              key={s.value}
              className={cn(
                "w-full text-left px-3 py-2 text-xs hover:bg-primary/10 flex flex-col gap-0.5 transition-colors",
                i === selectedIndex && "bg-primary/20"
              )}
              onClick={() => applySuggestion(s)}
              onMouseDown={(e) => e.preventDefault()} // Prevent blur
            >
              <div className="font-bold text-primary">{s.label}</div>
              {s.description && <div className="text-[10px] text-muted-foreground">{s.description}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
