"use client";
import React, { useState, useSyncExternalStore } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';
import { Pick3Result } from '@/types/pick3';
import { AlertTriangle, TrendingUp, TrendingDown, Target } from 'lucide-react';

const noopSubscribe = () => () => {};

interface BetEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onSuccess: () => void;
  history: Pick3Result[];
}

export function BetEntryDialog({ open, onOpenChange, userId, onSuccess, history }: BetEntryDialogProps) {
  const clientTodayISO = useSyncExternalStore(noopSubscribe, () => new Date().toISOString().split('T')[0], () => '');
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<'midday' | 'evening'>('midday');
  const [combination, setCombination] = useState<string>("");
  const [amount, setAmount] = useState<string>("1");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const centAmount = Math.round(parseFloat(amount) * 100);
      const combArray = combination.split('').map(Number);

      if (combArray.length !== 3 || combArray.some(isNaN)) {
        toast.error("Ingresa una combinación de 3 dígitos válida");
        return;
      }

      // 1. Audit check: Does this draw already have a result?
      const official = history.find(h => h.date === date && h.draw_time === time);
      let winAmount = 0;
      let status = 'pending';

      if (official) {
         const won = official.result.every((v, i) => v === combArray[i]);
         if (won) {
           winAmount = centAmount * 500; // Standard 500x payout
           status = 'won';
         } else {
           status = 'lost';
         }
      }

      // 2. Transactional Ledger process via RPC
      const { data, error } = await supabase.rpc('process_pick3_transaction', {
        p_user_id: userId,
        p_type: 'bet',
        p_amount: centAmount,
        p_notes: `Apuesta manual: ${combination} (${time})`,
        p_metadata: { combination, date, time }
      });

      if (error) throw error;

      // 3. If won, process win immediately
      if (status === 'won') {
         await supabase.rpc('process_pick3_transaction', {
          p_user_id: userId,
          p_type: 'win',
          p_amount: winAmount,
          p_notes: `Premio cobrado: ${combination}`,
          p_metadata: { combination, date, time, bet_id: data.id }
        });
        toast.success("¡FELICIDADES! Has acertado el número.");
      } else if (status === 'lost') {
         toast.info("Apuesta registrada. El número oficial no coincidió.");
      } else {
         toast.success("Apuesta registrada como pendiente.");
      }

      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Error al registrar apuesta: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[32px] sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-xl font-black italic uppercase flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" /> Registrar Apuesta
          </DialogTitle>
          <DialogDescription className="text-[10px] font-bold uppercase opacity-60">
            Control transaccional de bankroll
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Fecha</Label>
              <Input type="date" value={date || clientTodayISO} onChange={(e) => setDate(e.target.value)} className="h-10 rounded-xl font-bold" />
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase">Turno</Label>
              <Select value={time} onValueChange={(v: any) => setTime(v)}>
                <SelectTrigger className="h-10 rounded-xl font-bold uppercase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="midday">Mediodía</SelectItem>
                  <SelectItem value="evening">Noche</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase">Combinación (3 dígitos)</Label>
            <Input
              maxLength={3}
              placeholder="723"
              value={combination}
              onChange={(e) => setCombination(e.target.value.replace(/\D/g, '').slice(0,3))}
              className="h-14 text-2xl font-black italic text-center tracking-[1rem] rounded-2xl border-2 border-primary/20 focus:border-primary"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase">Monto Apostado ($)</Label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 text-lg font-black rounded-xl"
            />
          </div>

          {history.find(h => h.date === date && h.draw_time === time) && (
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 flex gap-3 items-center">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
              <p className="text-[9px] font-bold text-amber-700 uppercase leading-tight">
                Ya existe un resultado oficial para esta fecha/turno. La apuesta se liquidará inmediatamente.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" className="rounded-full font-black uppercase" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="rounded-full font-black uppercase px-8" onClick={handleSave} disabled={loading}>
            {loading ? "Procesando..." : "Registrar Transacción"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
