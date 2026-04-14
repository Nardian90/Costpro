'use client';

import React, { useRef } from 'react';
import {
    TrendingUp,
    Database,
    Table2,
    Cpu,
    Zap,
    BarChart4,
    FileSearch,
    AlertCircle,
    FileText,
    Users,
    PackageSearch,
    Workflow,
    HelpCircle,
    Settings,
    Play,
    RefreshCw,
    Download,
    Upload,
    Receipt,
    ArrowRightLeft,
    QrCode
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
    onSelect: (id: string) => void;
    onExportBackup: () => void;
    onImportBackup: (file: File) => void;
    hasTransactions: boolean;
    hasProducts: boolean;
}

type ActionVariant = 'default' | 'primary' | 'dark';

interface ActionItem {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    variant: ActionVariant;
}

function ActionCard({ title, description, icon, onClick, id, variant = 'default' }: { title: string, description: string, icon: React.ReactNode, onClick: (id: string) => void, id: string, variant?: ActionVariant }) {
    return (
        <Card
            onClick={() => onClick(id)}
            className={cn(
                "p-6 group cursor-pointer transition-all duration-300 border-2 rounded-[2rem] hover:scale-[1.02] active:scale-95 shadow-xl hover:shadow-2xl flex flex-col gap-4 relative overflow-hidden",
                variant === 'primary' ? "bg-primary/5 border-primary/20 hover:border-primary/40" : "bg-card/50 backdrop-blur-sm border-transparent hover:border-primary/10"
            )}
        >
            <div className={cn(
                "p-4 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 group-hover:rotate-12",
                variant === 'primary' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground"
            )}>
                {React.cloneElement(icon as React.ReactElement<any>, { size: 28, strokeWidth: 2.5 })}
            </div>

            <div className="space-y-1.5 relative z-10">
                <h3 className="text-lg font-black uppercase tracking-tight text-foreground">{title}</h3>
                <p className="text-xs text-muted-foreground font-medium leading-relaxed opacity-70 group-hover:opacity-100 transition-opacity">
                    {description}
                </p>
            </div>

            <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity duration-500">
                {React.cloneElement(icon as React.ReactElement<any>, { size: 120, strokeWidth: 1 })}
            </div>
        </Card>
    );
}

export default function IPVControlPanel({ onSelect, onExportBackup, onImportBackup, hasTransactions, hasProducts }: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            onImportBackup(file);
            if (event.target) event.target.value = '';
        }
    };


    const mainActions: ActionItem[] = [
        {
            id: 'dashboard',
            title: 'Panel de Control',
            description: 'Panel de control con acceso directo a todos los módulos del sistema.',
            icon: <Workflow />,
            variant: 'primary'
        },
        {
            id: 'analytics',
            title: 'Dashboard Institucional',
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
                        <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter text-foreground flex items-center gap-3">
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
