'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, RotateCcw, Filter, Calendar } from 'lucide-react';
import { MatchingResetService } from '@/lib/ipv/reset';
import { toast } from 'sonner';

interface ResetMatchingModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    rules: any[];
}

export function ResetMatchingModal({ open, onOpenChange, rules }: ResetMatchingModalProps) {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [selectedRule, setSelectedRule] = useState('ALL');
    const [isResetting, setIsResetting] = useState(false);

    const handleReset = async () => {
        if (!confirm("¿Está seguro de que desea resetear el matching? Esta acción borrará las líneas de conciliación y devolverá las transacciones a estado PENDIENTE.")) {
            return;
        }

        setIsResetting(true);
        try {
            const filters: any = {};
            if (startDate) filters.startDate = startDate;
            if (endDate) filters.endDate = endDate;
            if (selectedRule !== 'ALL') filters.rules = [selectedRule];

            filters.states = ['COMPLETO', 'PARCIAL'];

            const count = await MatchingResetService.resetMatching(filters);
            toast.success(`Reset completado: ${count} transacciones revertidas.`);
            onOpenChange(false);
        } catch (error) {
            toast.error("Error al resetear el matching");
        } finally {
            setIsResetting(false);
        }
    };

    const handleResetAll = async () => {
        if (!confirm("PELIGRO: Esto borrará ABSOLUTAMENTE TODA la conciliación del sistema. ¿Desea continuar?")) {
            return;
        }

        setIsResetting(true);
        try {
            await MatchingResetService.resetAll();
            toast.success("Todo el sistema ha sido reseteado.");
            onOpenChange(false);
        } catch (error) {
            toast.error("Error al resetear todo");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <RotateCcw className="w-5 h-5 text-destructive" />
                        Reset de Matching
                    </DialogTitle>
                    <DialogDescription>
                        Revierte la conciliación para volver a ejecutar el motor con nuevas reglas.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-black uppercase flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            Rango de Fechas
                        </Label>
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="text-xs"
                            />
                            <Input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="text-xs"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs font-black uppercase flex items-center gap-2">
                            <Filter className="w-3 h-3" />
                            Filtrar por Regla
                        </Label>
                        <Select value={selectedRule} onValueChange={setSelectedRule}>
                            <SelectTrigger className="w-full text-xs">
                                <SelectValue placeholder="Todas las reglas" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="ALL">Todas las reglas</SelectItem>
                                {rules.map(r => (
                                    <SelectItem key={r.id} value={r.tipo}>{r.tipo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex gap-3">
                        <AlertCircle className="w-5 h-5 text-destructive shrink-0" />
                        <p className="text-[10px] text-destructive font-medium leading-relaxed">
                            Al confirmar, se borrarán los logs de ejecución y las líneas generadas para las transacciones que coincidan con el filtro. El stock virtual se recalculará automáticamente.
                        </p>
                    </div>
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button
                        variant="ghost"
                        onClick={handleResetAll}
                        className="text-destructive hover:text-destructive hover:bg-red-50 text-xs font-black uppercase"
                        disabled={isResetting}
                    >
                        Resetear Todo
                    </Button>
                    <div className="flex-1" />
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="text-xs font-black uppercase"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleReset}
                        disabled={isResetting}
                        className="bg-destructive hover:bg-destructive text-white text-xs font-black uppercase px-6"
                    >
                        {isResetting ? "Procesando..." : "Confirmar Reset"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
