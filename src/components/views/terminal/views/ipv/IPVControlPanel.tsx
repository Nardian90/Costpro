'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import {
    TrendingUp,
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { exportFullBackup } from '@/lib/ipv/backup';
import { db } from '@/lib/dexie';
import { motion } from 'framer-motion';

const SectionCard = ({ title, description, icon, color, badge, onClick, id, isHero, warning }: any) => (
    <Card
        onClick={() => onClick(id)}
        className={`group relative p-6 cursor-pointer overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl border-none ${isHero ? 'bg-primary text-primary-foreground' : 'bg-card/50 backdrop-blur-sm hover:bg-card shadow-lg'}`}
    >
        <div className={`absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-all group-hover:scale-110 ${isHero ? 'text-white' : color}`}>
            {React.cloneElement(icon as React.ReactElement<any>, { size: 80 })}
        </div>

        {badge && (
            <Badge variant="outline" className={`absolute top-4 right-4 text-[10px] font-black tracking-widest uppercase py-1 px-3 border-none ${isHero ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'}`}>
                {badge}
            </Badge>
        )}

        <div className={`mb-6 p-4 rounded-2xl w-fit ${isHero ? 'bg-white/20' : 'bg-background shadow-inner'}`}>
            {React.cloneElement(icon as React.ReactElement<any>, {
                size: 24,
                className: isHero ? 'text-white' : color
            })}
        </div>

        <div className="flex-1">
            <h3 className={`text-sm font-black uppercase tracking-widest mb-2 flex items-center gap-2 ${isHero ? 'text-white' : ''}`}>
                {title}
                <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
            </h3>
            <p className={`text-xs font-medium leading-relaxed ${isHero ? 'text-white/80' : 'text-muted-foreground'}`}>
                {description}
            </p>
        </div>

        {warning && (
            <div className="mt-4 flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-3 h-3 text-amber-500" />
                <p className="text-xs font-bold text-amber-600 uppercase tracking-tighter">{warning}</p>
            </div>
        )}
    </Card>
);

interface Props {
    onSelect: (id: string) => void;
    onExportBackup: () => void;
    onImportBackup: (file: File) => void;
    hasTransactions?: boolean;
    hasProducts?: boolean;
}

export function IPVControlPanel({ onSelect, onExportBackup, onImportBackup, hasTransactions, hasProducts }: Props) {
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
            id: 'analytics',
            title: 'Dashboard',
            description: 'Cuadro de mando institucional con KPIs financieros y tendencias de liquidez.',
            icon: <TrendingUp />,
            color: 'text-primary',
            isHero: true
        },
        {
            id: 'help',
            title: 'Guía de Flujo',
            description: 'Protocolo estándar y flujo de trabajo recomendado para una conciliación 100% precisa.',
            icon: <ClipboardList />,
            color: 'text-primary',
            isHero: true
        },
        {
            id: 'ingestion',
            title: 'Extracto',
            description: 'Importación de archivos y Carga de Transferencias (Paso 1).',
            icon: <FileUp />,
            color: 'text-rose-500',
            badge: 'Paso 1'
        },
        {
            id: 'catalog',
            title: 'Catálogo',
            description: 'Gestión de productos, precios y stock inicial (Paso 2).',
            icon: <ClipboardList />,
            color: 'text-indigo-500',
            badge: 'Paso 2'
        },
        {
            id: 'transactions',
            title: 'Transacciones',
            description: 'Ejecución de matching automático y conciliación manual (Paso 3).',
            icon: <History />,
            color: 'text-blue-500',
            badge: 'Paso 3',
            warning: !hasTransactions ? 'Cargue extractos primero' : (!hasProducts ? 'Cargue catálogo primero' : undefined)
        },
        {
            id: 'breakdown',
            title: 'Desglose',
            description: 'Vista detallada de productos que justifican cada transacción (Análisis).',
            icon: <FileText />,
            color: 'text-emerald-500',
            badge: 'Paso 4'
        },
        {
            id: 'pivot',
            title: 'Consolidado',
            description: 'Resumen agrupado por fecha y tipo de operación (Análisis).',
            icon: <LayoutGrid />,
            color: 'text-amber-500',
            badge: 'Paso 5'
        },
        {
            id: 'reports',
            title: 'Reportes IPV',
            description: 'Generación y descarga de documentos fiscales diarios y mensuales (Salida).',
            icon: <ClipboardList />,
            color: 'text-green-500',
            badge: 'Paso 6'
        },
        {
            id: 'sim',
            title: 'Simulación',
            description: 'Modelado de escenarios y distribución de metas globales (Soporte).',
            icon: <Play />,
            color: 'text-purple-500',
            badge: 'Soporte'
        },
        {
            id: 'errors',
            title: 'Errores',
            description: 'Bitácora de fallos durante la ingesta para corrección de datos (Soporte).',
            icon: <AlertCircle />,
            color: 'text-red-500',
            badge: 'Soporte'
        },
        {
            id: 'rules',
            title: 'Reglas',
            description: 'Configuración de algoritmos de matching y límites (Configuración).',
            icon: <Settings />,
            color: 'text-slate-500',
            badge: 'Config'
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
                            <p className="text-xs font-black text-muted-foreground uppercase mb-1">Caché</p>
                            <Badge variant="outline" className="font-black text-primary border-primary/20">ACTIVA</Badge>
                        </div>
                        <div className="text-center">
                            <p className="text-xs font-black text-muted-foreground uppercase mb-1">Sincronización</p>
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
                                    className="h-10 text-xs font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm hover:bg-primary hover:text-white transition-all border-primary/20 rounded-xl"
                                >
                                    <Download className="w-4 h-4" />
                                    Respaldar
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-card border-2">
                                Exporta todos los datos locales (transacciones, catálogo, reglas y reportes) a un archivo JSON para respaldo externo.
                            </TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="h-10 text-xs font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm hover:bg-emerald-500 hover:text-white transition-all border-emerald-500/20 rounded-xl"
                                >
                                    <Upload className="w-4 h-4" />
                                    Cargar Respaldo
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs font-medium p-3 bg-card border-2">
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
