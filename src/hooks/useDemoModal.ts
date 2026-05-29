"use client";
import { useState } from "react";
export function useDemoModal() {
  const [isOpen, setIsOpen] = useState(false);
  return {
    isOpen,
    openDemo: () => setIsOpen(true),
    closeDemo: () => setIsOpen(false),
  };
}
