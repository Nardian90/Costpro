
'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface CostSheetNavProps {
  sections: any[];
  annexes: any[];
  activeSection: string;
  setActiveSection: (id: string) => void;
}

const CostSheetNav: React.FC<CostSheetNavProps> = ({
  sections,
  annexes,
  activeSection,
  setActiveSection,
}) => {
  // Create a combined list of all navigable sections
  const navItems = [
    { id: 'header', label: 'Encabezado' },
    ...sections.map(s => ({ id: s.id, label: s.label })),
    ...annexes.map(a => ({ id: a.id, label: `Anexo ${a.id}: ${a.title.substring(0, 20)}...` })),
     { id: 'signature', label: 'Firmas' },
  ];

  return (
    <div className="my-4">
      <ScrollArea className="w-full whitespace-nowrap rounded-md border">
        <div className="flex w-max space-x-2 p-2">
          {navItems.map((item) => (
            <Button
              key={item.id}
              variant={activeSection === item.id ? 'default' : 'outline'}
              onClick={() => setActiveSection(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

export default CostSheetNav;
