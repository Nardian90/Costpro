import React from 'react';
import { BaseModal } from "@/components/ui/BaseModal";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, XCircle, FileText, Plus, Info, History } from 'lucide-react';
import { ValidationResult, NormalizedProduct } from '@/lib/ipv/import-validator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Props { isOpen: boolean; onClose: () => void; onConfirm: () => void; result: ValidationResult; products: NormalizedProduct[]; fileName: string; }

export function CatalogImportPreview({ isOpen, onClose, onConfirm, result, products, fileName }: Props) {
  const previewProducts = products.slice(0, 10);
  return (
    <BaseModal isOpen={isOpen} onClose={onClose} title="Vista Previa de Importación" size="xl">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20"><div className="flex items-center gap-2 mb-1"><Plus className="w-4 h-4 text-blue-500" /><span className="text-xs font-black uppercase text-blue-500">Nuevos</span></div><div className="text-2xl font-black">{result.summary.added}</div></div>
          <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/20"><div className="flex items-center gap-2 mb-1"><History className="w-4 h-4 text-purple-500" /><span className="text-xs font-black uppercase text-purple-500">Actualizados</span></div><div className="text-2xl font-black">{result.summary.updated}</div></div>
          <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20"><div className="flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4 text-orange-500" /><span className="text-xs font-black uppercase text-orange-500">Avisos</span></div><div className="text-2xl font-black">{result.warnings.length}</div></div>
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20"><div className="flex items-center gap-2 mb-1"><XCircle className="w-4 h-4 text-red-500" /><span className="text-xs font-black uppercase text-red-500">Errores</span></div><div className="text-2xl font-black">{result.errors.length}</div></div>
        </div>
        <div className="p-3 bg-muted/30 rounded-lg border border-border/50 flex items-center justify-between">
           <div className="flex items-center gap-3"><FileText className="w-5 h-5 text-muted-foreground" /><div><div className="text-xs font-bold">{fileName}</div><div className="text-[10px] text-muted-foreground uppercase">{products.length} productos</div></div></div>
           <Badge variant={result.valid ? "outline" : "destructive"} className="font-black">{result.valid ? "VALIDADO" : "RECHAZADO"}</Badge>
        </div>
        {(result.errors.length > 0 || result.warnings.length > 0) && (
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
            {result.errors.map((err, i) => <div key={i} className="flex items-start gap-3 p-2 bg-red-500/5 border border-red-500/10 rounded text-[11px]"><XCircle className="w-3 h-3 text-red-500 mt-0.5" /><span className="font-mono text-red-500/70">Fila {err.row}:</span><span className="font-bold">{err.message}</span></div>)}
            {result.warnings.map((err, i) => <div key={i} className="flex items-start gap-3 p-2 bg-orange-500/5 border border-orange-500/10 rounded text-[11px]"><AlertTriangle className="w-3 h-3 text-orange-500 mt-0.5" /><span className="font-mono text-orange-500/70">Fila {err.row}:</span><span className="font-bold">{err.message}</span></div>)}
          </div>
        )}
        <div className="space-y-2">
          <div className="text-xs font-black uppercase flex items-center gap-2 mb-2"><Info className="w-3 h-3" />Vista Previa</div>
          <div className="border rounded-lg overflow-hidden">
            <Table><TableHeader className="bg-muted/50"><TableRow><TableHead className="text-[10px] font-black uppercase">Cod</TableHead><TableHead className="text-[10px] font-black uppercase">Descripción</TableHead><TableHead className="text-[10px] font-black uppercase text-right">Precio</TableHead></TableRow></TableHeader>
              <TableBody>{previewProducts.map((p, i) => <TableRow key={i} className="text-xs"><TableCell className="font-mono font-bold text-primary">{p.cod}</TableCell><TableCell>{p.descripcion}</TableCell><TableCell className="text-right font-black">{p.precio_cents}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </div>
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="text-[10px] text-muted-foreground italic flex items-center gap-2"><Info className="w-3 h-3" />Se guardarán movimientos de auditoría.</div>
          <div className="flex items-center gap-3"><Button variant="ghost" onClick={onClose} className="font-bold">CANCELAR</Button><Button onClick={onConfirm} disabled={!result.valid} className={`font-black uppercase gap-2 ${result.valid ? 'bg-green-600 hover:bg-green-700' : ''}`}>{result.valid ? <><CheckCircle className="w-4 h-4" />Proceder</> : 'Corregir Errores'}</Button></div>
        </div>
      </div>
    </BaseModal>
  );
}
