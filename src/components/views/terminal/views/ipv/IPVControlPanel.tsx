'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import {
    History,
    Play,
    FileText,
    LayoutGrid,
    FileUp,
    AlertCircle,
    ClipboardList,
    SlidersHorizontal,
    Settings,
    ChevronRight,
    ArrowRightCircle,
    Database,
    Download,
    Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface SectionCardProps {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    onClick: (id: string) => void;
    color: string;
}

const SectionCard = ({ id, title, description, icon, onClick, color }: SectionCardProps) => (
    <Card
        onClick={() => onClick(id)}
        className="group p-6 border-2 border-transparent hover:border-primary/20 bg-card/50 backdrop-blur-sm transition-all cursor-pointer relative overflow-hidden flex flex-col h-full shadow-md hover:shadow-xl active:scale-95"
    >
        <div className={`absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity ${color}`}>
            {React.cloneElement(icon as React.ReactElement<any>, { size: 80 })}
        </div>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${color} bg-opacity-10 shadow-inner`}>
            {React.cloneElement(icon as React.ReactElement<any>, { size: 24, className: color })}
        </div>
        <h3 className="text-sm font-black uppercase tracking-widest mb-2 flex items-center gap-2">
            {title}
            <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
        </h3>
        <p className="text-xs text-muted-foreground font-medium leading-relaxed flex-1">
            {description}
        </p>
    </Card>
);

interface Props {
    onSelect: (id: string) => void;
    onExportBackup: () => void;
    onImportBackup: (file: File) => void;
}

export function IPVControlPanel({ onSelect, onExportBackup, onImportBackup }: Props) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onImportBackup(file);
            // Reset input
            if (event.target) event.target.value = '';
        }
    };
    const sections = [
        {
            id: 'transactions',
            title: 'Transacciones',
            description: 'Gestión y validación de movimientos bancarios. Aquí se realiza la conciliación manual y automática.',
            icon: <History />,
            color: 'text-blue-500'
        },
        {
            id: 'sim',
            title: 'Simulación',
            description: 'Modelado de escenarios y distribución de metas globales con ajuste de caja justificado.',
            icon: <Play />,
            color: 'text-purple-500'
        },
        {
            id: 'breakdown',
            title: 'Desglose',
            description: 'Vista detallada de productos que justifican cada transacción conciliada.',
            icon: <FileText />,
            color: 'text-emerald-500'
        },
        {
            id: 'pivot',
            title: 'Consolidado',
            description: 'Resumen agrupado por fecha y tipo de operación para cierres contables.',
            icon: <LayoutGrid />,
            color: 'text-amber-500'
        },
        {
            id: 'catalog',
            title: 'Catálogo',
            description: 'Maestro de productos con inteligencia de precios y reglas de prioridad.',
            icon: <ClipboardList />,
            color: 'text-indigo-500'
        },
        {
            id: 'ingestion',
            title: 'Extracto',
            description: 'Importación de archivos bancarios y carga de catálogo desde Excel/CSV.',
            icon: <FileUp />,
            color: 'text-rose-500'
        },
        {
            id: 'reports',
            title: 'Reportes IPV',
            description: 'Generación y descarga de documentos fiscales diarios y mensuales.',
            icon: <ClipboardList />,
            color: 'text-green-500'
        },
        {
            id: 'errors',
            title: 'Errores',
            description: 'Bitácora de fallos durante la ingesta para corrección de datos origen.',
            icon: <AlertCircle />,
            color: 'text-red-500'
        },
        {
            id: 'rules',
            title: 'Reglas',
            description: 'Configuración de algoritmos de matching y límites de tolerancia.',
            icon: <Settings />,
            color: 'text-slate-500'
        }
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <ArrowRightCircle className="w-5 h-5 text-primary" />
                        <h2 className="text-xl font-black uppercase tracking-tighter text-primary">Centro de Control IPV</h2>
                    </div>
                    <p className="text-sm text-muted-foreground font-medium">Seleccione una sección para comenzar el flujo de trabajo.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sections.map(section => (
                    <SectionCard
                        key={section.id}
                        {...section}
                        onClick={onSelect}
                    />
                ))}
            </div>

            <Card className="p-6 bg-gradient-to-r from-primary/10 to-transparent border-none rounded-3xl flex flex-col xl:flex-row items-center justify-between gap-6 overflow-hidden relative">
                <div className="absolute -left-4 top-0 bottom-0 w-24 bg-primary/5 blur-3xl rounded-full" />
                <div className="space-y-2 relative z-10 flex-1">
                    <div className="flex items-center gap-3">
                        <Database className="w-6 h-6 text-primary" />
                        <h3 className="text-lg font-black uppercase tracking-tight">Base de Datos Local</h3>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium max-w-xl">
                        Toda la información reside exclusivamente en su navegador. Se recomienda realizar respaldos periódicos si planea limpiar su caché de navegación.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-6 relative z-10">
                    <div className="flex gap-4">
                        <div className="text-center">
                            <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Caché</p>
                            <Badge variant="outline" className="font-black text-primary border-primary/20">ACTIVA</Badge>
                        </div>
                        <div className="text-center">
                            <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Sincronización</p>
                            <Badge variant="outline" className="font-black text-blue-500 border-blue-200">LOCAL-ONLY</Badge>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={onExportBackup}
                                    className="h-10 text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm hover:bg-primary hover:text-white transition-all border-primary/20 rounded-xl"
                                >
                                    <Download className="w-4 h-4" />
                                    Respaldar
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-[10px] font-medium p-3 bg-card border-2">
                                Exporta todos los datos locales (transacciones, catálogo, reglas y reportes) a un archivo JSON para respaldo externo.
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="h-10 text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm hover:bg-emerald-500 hover:text-white transition-all border-emerald-500/20 rounded-xl"
                                >
                                    <Upload className="w-4 h-4" />
                                    Cargar Respaldo
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-[10px] font-medium p-3 bg-card border-2">
                                Importa un archivo de respaldo JSON. ¡Atención! Esto sobreescribirá todos los datos actuales de su base de datos local.
                            </TooltipContent>
                        </Tooltip>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".json"
                            className="hidden"
                        />
                    </div>
                </div>
            </Card>
        </div>
    );
}
