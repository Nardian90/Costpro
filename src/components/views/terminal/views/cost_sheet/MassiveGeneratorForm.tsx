'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Play, FileSpreadsheet, CheckCircle2, RotateCcw, Download, Upload, X as XIcon } from 'lucide-react';
import { ExportOptions } from './CostSheetExportModal';
import { exportMassiveTemplate } from '@/services/excel-service';
import { MassiveResult, MappingConfig, ProductItem } from './MassiveGenerator.types';

import { useTranslations } from 'next-intl';
interface MassiveGeneratorFormProps {
  importedProducts: ProductItem[];
  isProcessing: boolean;
  products: ProductItem[];
  onImportClick: () => void;
  onSwitchToSystem: () => void;
  onRemoveImport: () => void;
  onStartGeneration: () => void;
  exportOptions: ExportOptions;
  onExportOptionsChange: React.Dispatch<React.SetStateAction<ExportOptions>>;
  annexes: { id: string; title?: string }[];
  mappingConfig: MappingConfig;
  onMappingConfigChange: React.Dispatch<React.SetStateAction<MappingConfig>>;
  showMapping: boolean;
  onCloseMapping: () => void;
  results: MassiveResult[];
  initialProducts?: ProductItem[];
}

export const MassiveGeneratorForm: React.FC<MassiveGeneratorFormProps> = ({
  importedProducts,
  isProcessing,
  products,
  onImportClick,
  onSwitchToSystem,
  onRemoveImport,
  onStartGeneration,
  exportOptions,
  onExportOptionsChange,
  annexes,
  mappingConfig,
  onMappingConfigChange,
  showMapping,
  onCloseMapping,
  results,
  initialProducts,
}) => {
  const t = useTranslations('costSheet');
  const hasImported = importedProducts.length > 0;

  return (
    <>
      {/* Source Selection */}
      <div className="space-y-4">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 mb-2 px-1">
          Selección de Catálogo (Origen de Datos)
        </div>

        <Tabs
          defaultValue={hasImported ? 'imported' : 'system'}
          value={hasImported ? 'imported' : 'system'}
          onValueChange={(v) => {
            if (v === 'system') {
              onSwitchToSystem();
            }
          }}
          className="w-full"
        >
          <TabsList className="grid grid-cols-2 h-14 bg-sidebar/40 p-1 rounded-2xl border border-sidebar-border/50">
            <TabsTrigger
              value="system"
              className="rounded-xl font-black uppercase tracking-widest text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-none transition-all"
            >
              Catálogo del Sistema
            </TabsTrigger>
            <TabsTrigger
              value="imported"
              className="rounded-xl font-black uppercase tracking-widest text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground shadow-none transition-all"
            >
              Listado Importado (Excel)
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            {!hasImported ? (
              <div className="p-6 rounded-2xl border border-dashed border-primary/20 bg-primary/5 flex flex-col items-center justify-center text-center gap-3">
                <div className="p-3 rounded-full bg-primary/10">
                  <FileSpreadsheet className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold">Usando Catálogo del Sistema</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                    Se procesarán los productos activos de la tienda actual.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onImportClick}
                  className="mt-2 rounded-xl text-xs font-black uppercase tracking-widest border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Upload className="w-3 h-3 mr-2" />
                  ¿Prefieres importar un Excel?
                </Button>

                <div className="mt-4 pt-4 border-t border-primary/10 w-full flex justify-center">
                  <Button
                    onClick={onStartGeneration}
                    disabled={isProcessing || products.length === 0}
                    className="rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest px-12 h-12 shadow-lg shadow-primary/20 scale-110"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Comenzar Procesamiento
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl border border-success/20 bg-success/5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-full bg-success/10">
                    <CheckCircle2 className="w-6 h-6 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-success">Listado Importado Exitosamente</p>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                      Se han cargado {importedProducts.length} productos{' '}
                      {initialProducts && initialProducts.length > 0
                        ? 'desde el Modo Rápido'
                        : 'desde el archivo'}
                      .
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onImportClick}
                    className="h-10 rounded-xl text-xs font-black uppercase tracking-widest"
                  >
                    <RotateCcw className="w-3 h-3 mr-2" />
                    Cambiar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRemoveImport}
                    className="h-10 rounded-xl text-xs font-black uppercase tracking-widest text-danger hover:bg-danger/10"
                  >
                    <XIcon className="w-3 h-3 mr-2" />
                    Quitar
                  </Button>
                </div>
                <div className="ml-4 pl-4 border-l border-success/20">
                  <Button
                    onClick={onStartGeneration}
                    disabled={isProcessing || products.length === 0}
                    className="rounded-2xl bg-success hover:bg-success/90 text-success-foreground font-black uppercase tracking-widest px-8 h-12 shadow-lg shadow-success/20"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Procesar Importados
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Tabs>

        {!hasImported && (
          <div className="flex justify-end px-1">
            <Button
              variant="link"
              size="sm"
              onClick={exportMassiveTemplate}
              className="text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary h-auto p-0"
            >
              <Download className="w-3 h-3 mr-2" />
              Descargar Plantilla de Importación
            </Button>
          </div>
        )}
      </div>

      {/* Export Options */}
      <div className="p-4 rounded-2xl bg-sidebar/40 border border-sidebar-border/50 space-y-4">
        <div className="text-xs font-black uppercase tracking-[0.2em] text-primary/70 px-1">
          Opciones de Exportación (PDF)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="m-includeFC"
              checked={exportOptions.includeFC}
              onCheckedChange={(c) => onExportOptionsChange((prev) => ({ ...prev, includeFC: !!c }))}
            />
            <Label htmlFor="m-includeFC" className="text-xs font-bold uppercase cursor-pointer">
              Ficha (FC)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="m-includeAudit"
              checked={exportOptions.includeAudit}
              onCheckedChange={(c) => onExportOptionsChange((prev) => ({ ...prev, includeAudit: !!c }))}
            />
            <Label htmlFor="m-includeAudit" className="text-xs font-bold uppercase cursor-pointer">
              Auditoría
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="m-skipZeros"
              checked={exportOptions.skipZeros}
              onCheckedChange={(c) => onExportOptionsChange((prev) => ({ ...prev, skipZeros: c }))}
            />
            <Label htmlFor="m-skipZeros" className="text-xs font-bold uppercase cursor-pointer">
              Omitir Ceros
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="m-consolidated"
              checked={exportOptions.consolidated}
              onCheckedChange={(c) => onExportOptionsChange((prev) => ({ ...prev, consolidated: c }))}
            />
            <Label htmlFor="m-consolidated" className="text-xs font-bold uppercase cursor-pointer">
              Consolidar
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="m-includeUtilityNote"
              checked={exportOptions.includeUtilityNote}
              onCheckedChange={(c) =>
                onExportOptionsChange((prev) => ({ ...prev, includeUtilityNote: c }))
              }
            />
            <Label
              htmlFor="m-includeUtilityNote"
              className="text-xs font-bold uppercase cursor-pointer"
            >
              Nota Util.
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="m-alwaysZip"
              checked={exportOptions.alwaysZip}
              onCheckedChange={(c) => onExportOptionsChange((prev) => ({ ...prev, alwaysZip: c }))}
            />
            <Label htmlFor="m-alwaysZip" className="text-xs font-bold uppercase cursor-pointer">
              ZIP
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="m-showDateTime"
              checked={exportOptions.showDateTime}
              onCheckedChange={(c) => onExportOptionsChange((prev) => ({ ...prev, showDateTime: c }))}
            />
            <Label htmlFor="m-showDateTime" className="text-xs font-bold uppercase cursor-pointer">
              Fecha/Hora
            </Label>
          </div>
        </div>

        {annexes && annexes.length > 0 && (
          <div className="pt-2 border-t border-sidebar-border/30">
            <div className="text-xs font-bold uppercase text-muted-foreground mb-2">
              Anexos a incluir:
            </div>
            <div className="flex flex-wrap gap-3">
              {annexes.map((a) => (
                <div key={a.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`m-annex-${a.id}`}
                    checked={exportOptions.includeAnnexes?.includes(a.id)}
                    onCheckedChange={(checked) => {
                      onExportOptionsChange((prev) => ({
                        ...prev,
                        includeAnnexes: checked
                          ? [...(prev.includeAnnexes || []), a.id]
                          : prev.includeAnnexes?.filter((id) => id !== a.id),
                      }));
                    }}
                  />
                  <Label htmlFor={`m-annex-${a.id}`} className="text-xs font-medium cursor-pointer">
                    {a.id}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mapping Configuration */}
      {showMapping && results.length > 0 && (
        <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-black uppercase tracking-wider text-primary">
              Configuración de Procesamiento
            </div>
            <Button variant="ghost" size="sm" onClick={onCloseMapping}>
              <XIcon className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase">Columna Objetivo</Label>
              <select
                className="w-full h-10 rounded-xl bg-background border border-input px-3 text-sm"
                value={mappingConfig.targetColumn}
                onChange={(e) =>
                  onMappingConfigChange((prev) => ({
                    ...prev,
                    targetColumn: e.target.value as MappingConfig['targetColumn'],
                  }))
                }
              >
                <option value="none">Ninguna (Usar fórmulas actuales)</option>
                <option value="price">Precio de Venta</option>
                <option value="cost">Precio de Costo</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase" htmlFor="modification-row">Fila a Ajustar (ID)</Label>
              <div className="flex gap-2">
                <input
                  id="modification-row"
                  className="flex-1 h-10 rounded-xl bg-background border border-input px-3 text-sm"
                  placeholder="Ej: 13.1"
                  value={mappingConfig.modificationRow}
                  onChange={(e) =>
                    onMappingConfigChange((prev) => ({ ...prev, modificationRow: e.target.value }))
                  }
                  aria-label="Fila a Ajustar (ID)"
                />
                <div className="flex items-center text-xs text-muted-foreground uppercase font-black bg-sidebar/50 px-2 rounded-lg">
                  Default: 13.1 (Utilidad)
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
