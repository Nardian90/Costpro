'use client';

import React from 'react';
import { useCostSheets } from '@/hooks/api/useCostSheets';
import { FileText, Plus, ArrowRight, Sparkles } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useUIStore } from '@/store';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';

export const RecentCostSheets = () => {
  const t = useTranslations('dashboard.storeDashboard');
    const { data: costSheets, isLoading } = useCostSheets();
    const prefersReducedMotion = useReducedMotion();
    const { setCurrentView } = useUIStore();
    const { setSheet } = useCostSheetStore();

    if (isLoading) return <div className="h-40 bg-muted/5 animate-pulse rounded-3xl" />;
    if (!costSheets || costSheets.length === 0) return null;

    const handleSelect = (sheet: any) => {
        setSheet(sheet.data);
        setCurrentView('cost-sheets');
    };

    return (
        <section className="space-y-4">
            <div className="flex justify-between items-end px-1">
                <h2 className="text-sm font-bold tracking-widest uppercase text-muted-foreground">{t('recentCostSheets.title')}</h2>
                <button type="button"
                    onClick={() => setCurrentView('cost-sheets')}
                    className="text-sm font-black uppercase tracking-widest text-primary hover:underline flex items-center gap-1 min-h-[44px] px-2"
                >
                    Ver Todas <ArrowRight className="w-3 h-3" />
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {costSheets.slice(0, 4).map((sheet: any) => {
                    const totalCost = sheet.data?.metadata?.calculationSnapshot?.values?.['12']?.total || 0;
                    const salePrice = sheet.data?.metadata?.calculationSnapshot?.values?.['14']?.total || 0;

                    return (
                        <motion.div
                            key={sheet.id}
                            whileHover={prefersReducedMotion ? undefined : { y: -2 }}
                            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
                            onClick={() => handleSelect(sheet)}
                            className="p-5 rounded-[2rem] bg-card/50 border border-border/50 hover:border-primary/30 transition-all cursor-pointer group"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="p-3 rounded-2xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                    {sheet.data?.metadata?.generatedBy === 'Darian AI' ? <Sparkles className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                </div>
                                <span className="text-sm font-black uppercase tracking-widest text-muted-foreground">
                                    {formatDate(sheet.created_at)}
                                </span>
                            </div>

                            <h3 className="font-black uppercase tracking-tighter italic text-sm mb-1 truncate">
                                {sheet.name}
                            </h3>
                            <p className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">
                                {sheet.category || 'General'}
                            </p>

                            <div className="flex justify-between items-end pt-4 border-t border-border/10">
                                <div>
                                    <p className="text-sm font-black text-muted-foreground uppercase tracking-widest">Costo Total</p>
                                    <p className="text-sm font-black tabular-nums">{formatCurrency(totalCost)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-primary uppercase tracking-widest">Precio Venta</p>
                                    <p className="text-sm font-black text-primary tabular-nums">{formatCurrency(salePrice)}</p>
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </section>
    );
};
