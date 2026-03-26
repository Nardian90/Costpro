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
    Settings,
    ChevronRight, ArrowRight,
    Database,
    Download,
    Upload,
    CheckCircle2,
    HelpCircle,
    RefreshCw,
    PlayCircle,
    Package,
    Network,
    ShieldCheck,
    Workflow,
    PackageSearch,
    Table2,
    Cpu,
    Zap,
    BarChart4,
    FileSearch,
    Receipt,
    ArrowRightLeft,
    QrCode, Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { exportFullBackup } from '@/lib/ipv/backup';
import { db } from '@/lib/dexie';
import { motion } from 'framer-motion';



const ActionCard = ({ title, description, icon, onClick, id, variant = 'dark' }: any) => (
    <Card
        onClick={() => onClick(id)}
        className={`group relative p-8 flex items-center gap-6 border-none cursor-pointer overflow-hidden transition-all hover:scale-[1.02] rounded-[2.5rem] ${variant === 'primary' ? 'bg-primary text-primary-foreground shadow-2xl shadow-primary/20' : 'bg-card/50 backdrop-blur-sm border border-border/50 hover:bg-card/80'}`}
    >
        {variant === 'primary' && (
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2" />
        )}
        <div className={`p-5 rounded-[2rem] transition-transform group-hover:scale-110 ${variant === 'primary' ? 'bg-white/20' : 'bg-primary/10 text-primary'}`}>
            {React.cloneElement(icon, { className: 'w-8 h-8' })}
        </div>
        <div className="space-y-1 text-left relative z-10">
            <h3 className="text-lg font-black uppercase tracking-tight">{title}</h3>
            <p className={`text-xs font-medium leading-snug max-w-[200px] ${variant === 'primary' ? 'text-white/80' : 'text-muted-foreground'}`}>
                {description}
            </p>
        </div>
        <ChevronRight className={`ml-auto w-6 h-6 transition-all group-hover:translate-x-1 ${variant === 'primary' ? 'text-foreground' : 'text-primary opacity-50 group-hover:opacity-100'}`} />
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
            if (event.target) event.target.value = '';
        }
    };


    const mainActions = [
        {
            id: 'dashboard',
            title: 'Flujo',
            description: 'Panel de control con acceso directo a todos los módulos del sistema.',
            icon: <Workflow />,
            variant: 'primary'
        },
        {
            id: 'analytics',
            title: 'Dashboard',
            description: 'Cuadro de mando institucional con KPIs financieros y liquidez.',
            icon: <TrendingUp />,
            variant: 'dark'
        },
        {
            id: 'ingestion',
            title: 'Extracto',
            description: 'Importación y procesamiento de archivos bancarios.',
            icon: <Database />,
            variant: 'dark'
        },
        {
            id: 'catalog',
            title: 'Catálogo',
            description: 'Gestión de productos, precios y prioridades de inventario.',
            icon: <PackageSearch />,
            variant: 'dark'
        },
        {
            id: 'transactions',
            title: 'Transacciones',
            description: 'Listado completo de movimientos bancarios y estados.',
            icon: <Table2 />,
            variant: 'dark'
        },
        {
            id: 'rules',
            title: 'Reglas',
            description: 'Configuración de algoritmos de matching y límites.',
            icon: <Cpu />,
            variant: 'dark'
        },
        {
            id: 'sim',
            title: 'Simulación',
            description: 'Modelado de escenarios y distribución de metas globales.',
            icon: <Zap />,
            variant: 'dark'
        },
        {
            id: 'breakdown',
            title: 'Desglose',
            description: 'Análisis detallado de la venta real y conciliada.',
            icon: <BarChart4 />,
            variant: 'dark'
        },
        {
            id: 'pivot',
            title: 'Consolidado',
            description: 'Vista pivot de movimientos bancarios por categoría.',
            icon: <FileSearch />,
            variant: 'dark'
        },
        {
            id: 'errors',
            title: 'Errores',
            description: 'Bitácora de fallos durante la ingesta para corrección.',
            icon: <AlertCircle />,
            variant: 'dark'
        },
        {
            id: 'reports',
            title: 'Reportes IPV',
            description: 'Generación de informes oficiales IPV diarios y mensuales.',
            icon: <FileText />,
            variant: 'dark'
        },
        {
            id: 'receipts',
            title: 'Recibos',
            description: 'Generación de modelos SC-3-01 de ingresos en efectivo.',
            icon: <Receipt />,
            variant: 'dark'
        },
        {
            id: 'transfers',
            title: 'Transferencias',
            description: 'Reporte especializado de ingresos vía transferencias.',
            icon: <ArrowRightLeft />,
            variant: 'dark'
        },
        {
            id: 'qr',
            title: 'Pagos QR',
            description: 'Reporte especializado de pagos por Código QR.',
            icon: <QrCode />,
            variant: 'dark'
        },
        {
            id: 'mvt',
            title: 'Exportación MVT',
            description: 'Generación de archivos contables .mvt configurables.',
            icon: <FileText />,
            variant: 'dark'
        },
        {
            id: 'customers',
            title: 'Clientes',
            description: 'Catálogo maestro de identidad y resolución inteligente.',
            icon: <Users />,
            variant: 'dark'
        }
    ];

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">

            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-8 bg-primary rounded-full hidden sm:block" />
                        <h2 className="text-3xl font-black uppercase tracking-tighter text-foreground flex items-center gap-3">
                            IPV Builder
                            <HelpCircle className="w-5 h-5 text-muted-foreground opacity-50 cursor-help" />
                        </h2>
                    </div>
                    <p className="text-sm text-muted-foreground font-medium ml-0 sm:ml-5">Conciliación bancaria y generación de IPV institucional.</p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <Button
                        variant="outline"
                        onClick={() => onSelect('ingestion')}
                        className="rounded-2xl h-12 px-6 font-black uppercase tracking-widest text-xs gap-2 border-2"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Sincronizar IPV
                    </Button>
                    <Button
                        variant="outline"
                        onClick={() => onSelect('rules')}
                        className="rounded-2xl h-12 px-6 font-black uppercase tracking-widest text-xs gap-2 border-2"
                    >
                        <Settings className="w-4 h-4" />
                        Reglas
                    </Button>
                    <Button
                        onClick={() => onSelect('transactions')}
                        className="rounded-2xl h-12 px-8 font-black uppercase tracking-widest text-xs gap-2 shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90"
                    >
                        <Play className="w-4 h-4 fill-current" />
                        Ejecutar Matching
                    </Button>
                </div>
            </div>



            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 ipv-control-panel">
                {mainActions.map(action => (
                    <ActionCard
                        key={action.id}
                        {...action}
                        onClick={onSelect}
                    />
                ))}
            </div>

            <Card className="p-8 bg-gradient-to-br from-primary/10 via-background to-transparent border-2 border-primary/5 rounded-[3rem] flex flex-col xl:flex-row items-center justify-between gap-8 overflow-hidden relative">
                <div className="absolute -left-10 top-0 bottom-0 w-40 bg-primary/5 blur-[100px] rounded-full" />
                <div className="space-y-3 relative z-10 flex-1 text-center xl:text-left">
                    <div className="flex items-center justify-center xl:justify-start gap-4">
                        <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                            <Database className="w-7 h-7" />
                        </div>
                        <h3 className="text-xl font-black uppercase tracking-tight">Base de Datos Local</h3>
                    </div>
                    <p className="text-xs text-muted-foreground font-medium max-w-xl mx-auto xl:mx-0">
                        Toda la información reside exclusivamente en su navegador bajo el motor DexieDB. Se recomienda realizar respaldos periódicos si planea limpiar su caché de navegación o cambiar de dispositivo.
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-8 relative z-10">
                    <div className="flex gap-6">
                        <div className="text-center">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 opacity-60">Caché</p>
                            <Badge variant="outline" className="font-black text-primary border-primary/30 px-3 py-1 bg-primary/5">ACTIVA</Badge>
                        </div>
                        <div className="text-center">
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2 opacity-60">Seguridad</p>
                            <Badge variant="outline" className="font-black text-blue-500 border-blue-500/30 px-3 py-1 bg-blue-500/5">CIFRADO LOCAL</Badge>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            onClick={onExportBackup}
                            className="h-12 px-6 text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm hover:bg-primary hover:text-foreground transition-all border-2 rounded-2xl"
                        >
                            <Download className="w-4 h-4" />
                            Respaldar
                        </Button>

                        <Button
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            className="h-12 px-6 text-[10px] font-black uppercase tracking-widest gap-2 bg-background/50 shadow-sm hover:bg-emerald-500 hover:text-foreground transition-all border-2 border-emerald-500/20 rounded-2xl"
                        >
                            <Upload className="w-4 h-4" />
                            Importar
                        </Button>
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
