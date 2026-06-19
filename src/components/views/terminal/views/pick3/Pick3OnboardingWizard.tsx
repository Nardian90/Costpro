"use client";
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ShieldAlert, PiggyBank, Target, ArrowRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';

interface Pick3OnboardingWizardProps {
  userId: string;
  onComplete: (bankroll: number) => void;
}

export function Pick3OnboardingWizard({ userId, onComplete }: Pick3OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [bankroll, setBankroll] = useState<string>("1000");
  const [loading, setLoading] = useState(false);

  const handleComplete = async () => {
    // FIX-BUG-LOG-003: Validate input BEFORE setLoading so the spinner doesn't flash on invalid input
    const amount = Math.round(parseFloat(bankroll) * 100); // Convert to cents
    if (isNaN(amount) || amount <= 0) {
      toast.error("Por favor, ingresa un monto válido");
      return;
    }

    setLoading(true);
    try {
      // 1. Create/Update profile
      const { error: profileError } = await supabase
        .from('pick3_profiles')
        .upsert({
          user_id: userId,
          initial_bankroll: amount,
          current_bankroll: amount,
          onboarding_completed: true,
          updated_at: new Date().toISOString()
        });

      if (profileError) throw profileError;

      // 2. Initial Ledger Entry is handled by DB trigger tr_pick3_initial_bankroll

      toast.success("¡Configuración completada con éxito!");
      onComplete(amount);
    } catch (error: unknown) {
      console.error("Error in onboarding:", error);
      toast.error("Error al guardar la configuración: " + (error instanceof Error ? error.message : String(error)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-4">
      <Card className="w-full max-w-lg rounded-[32px] border-primary/20 shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-500">
        <div className="h-2 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>

        {step === 1 && (
          <>
            <CardHeader className="text-center pt-8">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-destructive/10 flex items-center justify-center mb-4">
                <ShieldAlert className="w-8 h-8 text-destructive" />
              </div>
              <CardTitle className="text-2xl font-black italic uppercase tracking-tight">
                Advertencia de Riesgo
              </CardTitle>
              <CardDescription className="text-xs font-bold uppercase opacity-60">
                Responsabilidad en el Juego
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-center">
              <div className="p-6 rounded-2xl bg-muted/30 border border-border text-[13px] font-medium leading-relaxed italic">
                "Este sistema es una herramienta de simulación estadística. El juego conlleva riesgos financieros.
                <span className="text-destructive font-black not-italic block mt-2">NO EXISTE GARANTÍA DE LUCRO.</span>
                La probabilidad se usa para optimizar, no para predecir el futuro con certeza absoluta."
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full h-14 rounded-full font-black uppercase text-sm group"
                onClick={() => setStep(2)}
              >
                Entiendo y Acepto <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </CardFooter>
          </>
        )}

        {step === 2 && (
          <>
            <CardHeader className="text-center pt-8">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mb-4">
                <PiggyBank className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl font-black italic uppercase tracking-tight">
                Gestión de Capital
              </CardTitle>
              <CardDescription className="text-xs font-bold uppercase opacity-60">
                Presupuesto Inicial (Bankroll)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="bankroll" className="text-[10px] font-black uppercase ml-1">Monto Disponible ($)</Label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-black italic opacity-30">$</span>
                  <Input
                    id="bankroll"
                    type="number"
                    value={bankroll}
                    onChange={(e) => setBankroll(e.target.value)}
                    className="h-16 pl-10 rounded-2xl text-2xl font-black italic border-2 focus-visible:ring-primary/20"
                    placeholder="1000"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground font-bold italic ml-1">
                  Este monto será tu base para el cálculo de apuestas y retorno de inversión (ROI).
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button variant="ghost" className="h-14 rounded-full font-black uppercase flex-1" onClick={() => setStep(1)}>
                Atrás
              </Button>
              <Button className="h-14 rounded-full font-black uppercase flex-[2]" onClick={() => setStep(3)}>
                Continuar
              </Button>
            </CardFooter>
          </>
        )}

        {step === 3 && (
          <>
            <CardHeader className="text-center pt-8">
              <div className="mx-auto w-16 h-16 rounded-3xl bg-success/10 flex items-center justify-center mb-4">
                <Target className="w-8 h-8 text-success" />
              </div>
              <CardTitle className="text-2xl font-black italic uppercase tracking-tight">
                Listos para el Análisis
              </CardTitle>
              <CardDescription className="text-xs font-bold uppercase opacity-60">
                Finalizar Configuración
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/20 border border-border/50">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <div className="text-[11px] font-bold">Disclaimer Aceptado</div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/20 border border-border/50">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <div className="text-[11px] font-bold">Capital Inicial: <span className="text-primary italic">${bankroll}</span></div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-muted/20 border border-border/50">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                  <div className="text-[11px] font-bold">Algoritmo Ley del Tercio Activado</div>
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full h-14 rounded-full font-black uppercase text-sm bg-success hover:bg-emerald-700"
                onClick={handleComplete}
                disabled={loading}
              >
                {loading ? "Guardando..." : "Comenzar Simulación"}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
