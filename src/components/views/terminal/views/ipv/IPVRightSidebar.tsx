'use client';

import React from 'react';
import {
    History,
    Play,
    FileText,
    LayoutGrid,
    FileUp,
    AlertCircle,
    ClipboardList,
    Settings,
    Home,
    PlusCircle,
    Download
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface Props {
    onRunMatching?: () => void;
    isMatching?: boolean;
    activeTab: string;
    onSelect: (id: string) => void;
}

export function IPVRightSidebar({ activeTab, onSelect, onRunMatching, isMatching }: Props) {
    const items = [
        { id: 'dashboard', icon: <Home />, label: 'Inicio' },
        { id: 'transactions', icon: <History />, label: 'Transacciones' },
        { id: 'sim', icon: <Play />, label: 'Simulación' },
        { id: 'breakdown', icon: <FileText />, label: 'Desglose' },
        { id: 'pivot', icon: <LayoutGrid />, label: 'Consolidado' },
        { id: 'catalog', icon: <PlusCircle />, label: 'Catálogo' },
        { id: 'ingestion', icon: <FileUp />, label: 'Extracto' },
        { id: 'reports', icon: <ClipboardList />, label: 'Reportes' },
        { id: 'errors', icon: <AlertCircle />, label: 'Errores' },
        { id: 'rules', icon: <Settings />, label: 'Reglas' },
    ];

    return (
        <div className="fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col gap-2 p-2 bg-background/80 backdrop-blur-md border rounded-2xl shadow-2xl animate-in slide-in-from-right-8 duration-500">
            <TooltipProvider>
                {items.map((item) => (
                    <Tooltip key={item.id}>
                        <TooltipTrigger asChild>
                            <Button
                                variant={activeTab === item.id ? 'default' : 'ghost'}
                                size="icon"
                                onClick={() => onSelect(item.id)}
                                className={`w-10 h-10 rounded-xl transition-all ${
                                    activeTab === item.id
                                        ? 'shadow-lg shadow-primary/20 scale-110'
                                        : 'hover:bg-primary/10 hover:text-primary'
                                }`}
                            >
                                {React.cloneElement(item.icon as React.ReactElement<any>, { size: 18 })}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left">
                            <p className="text-xs font-black uppercase tracking-widest">{item.label}</p>
                        </TooltipContent>
                    </Tooltip>
                ))}

            </TooltipProvider>
        </div>
    );
}
