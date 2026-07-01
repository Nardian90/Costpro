'use client';

import React from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
    FileText,
    Receipt,
    ArrowRightLeft,
    QrCode,
    ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
    activeTab: string;
    onSelect: (id: string) => void;
}

export function IPVReportsDropdown({ activeTab, onSelect }: Props) {
    const reportTabs = [
        { id: 'reports', label: 'Reportes IPV', icon: FileText },
        { id: 'receipts', label: 'Recibos de Ingresos', icon: Receipt },
        { id: 'transfers', label: 'Transferencias', icon: ArrowRightLeft },
        { id: 'qr', label: 'Código QR', icon: QrCode },
    ];

    const activeReport = reportTabs.find(t => t.id === activeTab);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={cn("ipv-reports-dropdown", "h-11 px-4 rounded-xl font-black uppercase tracking-widest text-[10px] gap-2 border-primary/20 hover:bg-primary/5 shrink-0",
                        activeReport && "bg-primary/10 text-primary border-primary shadow-sm"
                    )}
                >
                    {activeReport ? <activeReport.icon className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    <span>{activeReport ? activeReport.label : 'Reportes'}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2 shadow-2xl border-primary/10 bg-background/95 backdrop-blur-md z-[100]">
                {reportTabs.map((tab) => (
                    <DropdownMenuItem
                        key={tab.id}
                        onClick={() => onSelect(tab.id)}
                        className={cn("flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors mb-1 last:mb-0",
                            activeTab === tab.id ? "bg-primary/10 text-primary font-black" : "hover:bg-muted font-bold"
                        )}
                    >
                        <tab.icon className="w-4 h-4" />
                        <span className="text-[10px] uppercase tracking-widest">{tab.label}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
