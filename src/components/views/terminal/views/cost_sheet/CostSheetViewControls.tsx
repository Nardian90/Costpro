'use client';

import React from 'react';
import { CostSheetModeSwitcher } from './CostSheetModeSwitcher';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import { ThemeToggle } from "@/components/ThemeToggle";
import { useIsMobile } from '@/hooks/ui/useMobile';
import { cn } from '@/lib/utils';

interface CostSheetViewControlsProps {
    viewMode: 'expert' | 'assisted' | 'reading' | 'quick';
    setViewMode: (mode: 'expert' | 'assisted' | 'reading' | 'quick') => void;
    layoutMode: ViewMode;
    setLayoutMode: (mode: ViewMode) => void;
}

export const CostSheetViewControls: React.FC<CostSheetViewControlsProps> = ({
    viewMode,
    setViewMode,
    layoutMode,
    setLayoutMode
}) => {
    const isMobile = useIsMobile();

    return (
        <div className={cn(
            "flex flex-col sm:flex-row items-center gap-4 bg-background/40 backdrop-blur-xl p-3 rounded-[2rem] border border-border/40 shadow-xl transition-all duration-500",
            isMobile ? "w-full mb-6" : "w-auto"
        )}>
            <div className="flex-1 w-full min-w-0">
                <div className="flex items-center gap-2 mb-2 sm:mb-0">
                    <div className="lg:hidden shrink-0">
                        <ThemeToggle />
                    </div>
                    <CostSheetModeSwitcher viewMode={viewMode} setViewMode={setViewMode} isHorizontal={true} />
                </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                {viewMode === 'expert' && (
                    <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
                )}
                <div className="hidden lg:block">
                    <ThemeToggle />
                </div>
            </div>
        </div>
    );
};
