import React, { useRef } from 'react';
import {
  Copy, Trash2, Download, Upload, Plus,
  FileJson, AlertCircle, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/dexie";
import { MVTTemplate } from "@/lib/ipv/mvt/types";
import { STANDARD_MVT_TEMPLATE } from "@/lib/ipv/mvt/defaults";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow
} from "@/components/ui/table";

interface TemplateManagerProps {
  templates: MVTTemplate[];
  onSelect: (template: MVTTemplate) => void;
  currentTemplateId: string;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({
  templates,
  onSelect,
  currentTemplateId
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDuplicate = async (template: MVTTemplate) => {
    try {
      const newTemplate: MVTTemplate = {
        ...JSON.parse(JSON.stringify(template)),
        id: crypto.randomUUID(),
        name: `Copia de ${template.name}`,
        isDefault: false,
        version: template.version || 1
      };

      await db.mvt_templates.add(newTemplate);
      toast.success("Plantilla duplicada correctamente");
      onSelect(newTemplate);
    } catch (error) {
      console.error(error);
      toast.error("Error al duplicar la plantilla");
    }
  };

  const handleDelete = async (id: string) => {
    if (id === STANDARD_MVT_TEMPLATE.id) {
      toast.error("La plantilla estándar no se puede eliminar");
      return;
    }

    if (!confirm("¿Estás seguro de que deseas eliminar esta plantilla?")) return;

    try {
      await db.mvt_templates.delete(id);
      toast.success("Plantilla eliminada");
      if (currentTemplateId === id) {
        onSelect(STANDARD_MVT_TEMPLATE);
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al eliminar la plantilla");
    }
  };

  const handleExportAll = () => {
    try {
      const exportData = templates.filter(t => t.id !== STANDARD_MVT_TEMPLATE.id);
      if (exportData.length === 0) {
        toast.info("No hay plantillas personalizadas para exportar");
        return;
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mvt_templates_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Exportación completada");
    } catch (error) {
      console.error(error);
      toast.error("Error al exportar plantillas");
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const importedTemplates = JSON.parse(content) as MVTTemplate[];

        if (!Array.isArray(importedTemplates)) {
          throw new Error("Formato de archivo inválido");
        }

        let addedCount = 0;
        for (const template of importedTemplates) {
          if (!template.name || !template.sections) continue;

          const newTemplate = {
             ...template,
             id: crypto.randomUUID(),
             isDefault: false
          };

          await db.mvt_templates.add(newTemplate);
          addedCount++;
        }

        toast.success(`Se importaron ${addedCount} plantillas correctamente`);
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (error) {
        console.error(error);
        toast.error("Error al importar el archivo JSON");
      }
    };
    reader.readAsText(file);
  };

  const allTemplates = [STANDARD_MVT_TEMPLATE, ...templates];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">Gestión de Plantillas MVT</h3>
          <p className="text-xs text-slate-500">Administra tus estructuras de exportación personalizadas.</p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept=".json"
            className="hidden"
            ref={fileInputRef}
            onChange={handleImport}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-3.5 h-3.5 mr-2" />
            Importar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={handleExportAll}
          >
            <Download className="w-3.5 h-3.5 mr-2" />
            Exportar Todo
          </Button>
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Nombre</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider">Estado</TableHead>
              <TableHead className="text-[10px] font-bold uppercase tracking-wider text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allTemplates.map((t) => (
              <TableRow key={t.id} className={currentTemplateId === t.id ? "bg-indigo-50/30" : ""}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-slate-900">{t.name}</span>
                    <span className="text-[10px] text-slate-500 truncate max-w-[200px]">{t.description || 'Sin descripción'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {t.id === STANDARD_MVT_TEMPLATE.id ? (
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">Sistema</Badge>
                  ) : (
                    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-100 text-[10px]">Personalizada</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50"
                      title="Duplicar"
                      onClick={() => handleDuplicate(t)}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    {t.id !== STANDARD_MVT_TEMPLATE.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-500 hover:text-destructive hover:bg-destructive/10"
                        title="Eliminar"
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 ml-1"
                      disabled={currentTemplateId === t.id}
                      onClick={() => onSelect(t)}
                    >
                      Activar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-100 rounded-lg flex gap-3">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
        <div className="space-y-1">
          <p className="text-xs font-semibold text-amber-900">Nota sobre la Plantilla Estándar</p>
          <p className="text-[11px] text-amber-800/80 leading-relaxed">
            La plantilla de sistema es de solo lectura para asegurar la compatibilidad con Versat.
            Si necesitas personalizarla, usa el botón de <strong>Duplicar</strong> para crear una copia editable.
          </p>
        </div>
      </div>
    </div>
  );
};
