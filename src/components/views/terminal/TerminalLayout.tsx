'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from "@/lib/utils";
import {
  Menu, X, Bell, LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CostProLogo from '@/components/CostProLogo';
import ScrollToTop from '@/components/ui/ScrollToTop';
import { useUIStore } from '@/store';
import { useIsMobile } from '@/hooks/use-mobile';

interface TerminalLayoutProps {
  children: React.ReactNode;
  navigationItems: any[];
  currentView: string;
  onViewChange: (view: string) => void;
  onLogout: () => void;
  user: any;
  getActiveRolesLabel: () => string;
}

export default function TerminalLayout({
  children,
  navigationItems,
  currentView,
  onViewChange,
  onLogout,
  user,
  getActiveRolesLabel
}: TerminalLayoutProps) {
  const { sidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore();
  const isMobile = useIsMobile();
  const navRef = useRef<HTMLElement>(null);
  const [showSidebarLogo, setShowSidebarLogo] = useState(true);
  const [showSidebarUser, setShowSidebarUser] = useState(true);

  const handleSidebarScroll = useCallback(() => {
    if (!navRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = navRef.current;
    const scrollable = scrollHeight > clientHeight + 10;

    if (!scrollable) {
      setShowSidebarLogo(true);
      setShowSidebarUser(true);
      return;
    }

    setShowSidebarLogo(scrollTop <= 20);
    const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight - 10;
    setShowSidebarUser(isAtBottom);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (nav) {
      nav.addEventListener('scroll', handleSidebarScroll);
      handleSidebarScroll();
      window.addEventListener('resize', handleSidebarScroll);
      const observer = new MutationObserver(handleSidebarScroll);
      observer.observe(nav, { childList: true, subtree: true });
      return () => {
        nav.removeEventListener('scroll', handleSidebarScroll);
        window.removeEventListener('resize', handleSidebarScroll);
        observer.disconnect();
      };
    }
  }, [handleSidebarScroll, navigationItems]);

  return (
    <div className="min-h-screen flex bg-background text-foreground max-w-full overflow-x-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "w-64 lg:w-72 fixed lg:sticky top-0 h-screen z-40 transition-transform duration-300 ease-in-out border-r border-border bg-card",
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        <div className="h-full flex flex-col overflow-hidden">
          {/* Logo */}
          <AnimatePresence initial={false}>
            {showSidebarLogo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="p-8 shrink-0 overflow-hidden"
              >
                <CostProLogo size={50} animated={true} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <nav ref={navRef} className="flex-1 overflow-y-auto p-4 no-scrollbar">
            <div className="space-y-1">
              {navigationItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    onViewChange(item.id);
                    if (isMobile) setSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl transition-all group",
                    currentView === item.id
                      ? "bg-primary text-primary-foreground font-black shadow-lg shadow-primary/20"
                      : "hover:bg-primary/5 text-muted-foreground hover:text-foreground font-bold"
                  )}
                >
                  <item.icon className={cn("w-5 h-5", currentView === item.id ? "text-primary-foreground" : "group-hover:text-primary")} />
                  <span className="text-[11px] uppercase tracking-widest">{item.label}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* User Info */}
          <div className="p-6 border-t border-border shrink-0">
            <AnimatePresence initial={false}>
              {showSidebarUser && (
                <motion.div
                  initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                  animate={{ height: 'auto', opacity: 1, marginBottom: 16 }}
                  exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <div className="font-black text-[10px] text-primary uppercase tracking-widest truncate">{user?.full_name}</div>
                    <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">
                      {getActiveRolesLabel()}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-3 p-3 rounded-xl transition-all hover:bg-destructive/10 text-destructive font-bold text-[11px] uppercase tracking-widest"
            >
              <LogOut className="w-4 h-4" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen flex flex-col min-w-0 max-w-[100vw] overflow-x-hidden">
        <header className="bg-background/80 backdrop-blur-md p-4 sm:p-6 sticky top-0 z-30 border-b border-border w-full">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <button
                onClick={toggleSidebar}
                className="w-10 h-10 flex items-center justify-center lg:hidden shrink-0 border border-border rounded-lg"
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-lg sm:text-xl font-black uppercase tracking-tighter text-primary truncate">
                  {navigationItems.find(i => i.id === currentView)?.label || 'Terminal'}
                </h1>
                <div className="h-4 w-[1px] bg-border hidden sm:block" />
                <p className="hidden sm:block text-[9px] font-black text-muted-foreground uppercase tracking-widest truncate">
                  {user?.full_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button className="w-10 h-10 flex items-center justify-center relative border border-border rounded-lg">
                <Bell className="w-4 h-4" />
                <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
              </button>
            </div>
          </div>
        </header>

        <div className="p-4 sm:p-8 lg:p-10 pb-24 flex-1">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={toggleSidebar} />
      )}
      <ScrollToTop />
    </div>
  );
}
