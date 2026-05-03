'use client';

import React from 'react';
import { Home } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useUIStore } from '@/store';
import { getBreadcrumbForView } from '@/config/navigation/navigation-map';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/config/navigation/navigation-map';

interface NavigationBreadcrumbProps {
  className?: string;
}

export const NavigationBreadcrumb: React.FC<NavigationBreadcrumbProps> = ({ className }) => {
  const { currentView, ipvActiveTab, activeCostSection, setCurrentView } = useUIStore();
  
  const items: BreadcrumbItemType[] = getBreadcrumbForView(
    currentView,
    ipvActiveTab,
    activeCostSection
  );

  // Don't show breadcrumb for dashboard/root
  if (currentView === 'dashboard' || currentView === 'occ') return null;

  const handleNavigate = (view?: string) => {
    if (view) {
      setCurrentView(view as any);
    }
  };

  if (items.length <= 1) return null;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {/* Home link */}
        <BreadcrumbItem>
          <BreadcrumbLink
            onClick={() => handleNavigate('occ')}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          >
            <Home className="w-3 h-3" />
            <span className="hidden sm:inline">Inicio</span>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <React.Fragment key={index}>
              <BreadcrumbSeparator className="text-muted-foreground/30" />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="text-foreground font-bold text-xs uppercase tracking-wider">
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    onClick={() => handleNavigate(item.view)}
                    className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors text-xs uppercase tracking-wider"
                  >
                    {item.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default NavigationBreadcrumb;
