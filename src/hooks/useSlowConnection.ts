"use client";
import { useState } from "react";
export function useSlowConnection(): boolean {
  const [isSlow] = useState(() => {
    if (typeof window === "undefined") return false;
    const nav = navigator as Navigator & {
      connection?: { effectiveType?: string; saveData?: boolean };
    };
    const conn = nav.connection;
    if (!conn) return false;
    return (
      conn.saveData === true ||
      conn.effectiveType === "2g" ||
      conn.effectiveType === "slow-2g"
    );
  });
  return isSlow;
}
