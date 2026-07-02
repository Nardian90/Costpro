'use client';

import { debounce } from 'lodash';
import React, { useMemo, useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';

import { useLiveQuery } from 'dexie-react-hooks';
import { db, BankTransaction, ReconciliationLine } from '@/lib/dexie';
import { StockService } from '@/lib/ipv/StockService';
import { Card } from '@/components/ui/card';
import { formatCurrency, formatCurrencyCents } from '@/lib/utils';
import {
    calculateIPVMetrics,
    getDailySalesHistory,
    getTopProducts,
    getTopPayers
} from '@/lib/ipv/calculations';
import {
    TrendingUp,
    Users,
    PieChart as PieIcon,
    Percent,
    ArrowUpRight,
    ArrowDownRight,
    DollarSign,
    Package,
    Activity,
    ArrowRight,
    Clock,
    RotateCcw,
    AlertTriangle,
    Sparkles,
    Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
    transactions: BankTransaction[];
    reconciliationLines: ReconciliationLine[];
    onStart?: () => void;
    onNavigate?: (tab: string, kpi?: string, stock?: string) => void;
}

export function IPVInstitutionalDashboard({ transactions, reconciliationLines, onStart, onNavigate }: Props) {
    const products = useLiveQuery(() => db.products.toArray()) || [];

    // Calculate negative stock products
    const [negativeProductsCount, setNegativeProductsCount] = useState(0);

    useEffect(() => {
        async function checkNegativeStock() {
            let count = 0;
            for (const p of products) {
                const stock = await StockService.calculateCurrentStock(p.cod);
                if (stock < 0) count++;
            }
            setNegativeProductsCount(count);
        }
        if (products.length > 0) checkNegativeStock();
    }, [products]);

    const [timeFilter, setTimeFilter] = useState<'DAY' | 'MONTH' | 'YEAR'>('DAY');

    const metrics = useMemo(() => {
        const filteredTransactions = transactions.filter(t => t.tipo !== "Db");
        const total = filteredTransactions.length;
        const matched = filteredTransactions.filter(t => t.estado_conciliacion === "COMPLETO").length;
        const inProcess = filteredTransactions.filter(t => t.estado_conciliacion === "PARCIAL" || (t.estado_conciliacion === "PENDIENTE" && (t.applied_rules?.length ?? 0) > 0)).length;
        const pending = filteredTransactions.filter(t => t.estado_conciliacion === "PENDIENTE" && (!t.applied_rules || t.applied_rules.length === 0)).length;

        const totalCredits = transactions
            .filter(t => t.tipo === "Cr")
            .reduce((sum, t) => sum + (t.importe_cents || 0), 0);

        const totalDebits = transactions
            .filter(t => t.tipo === "Db")
            .reduce((sum, t) => sum + (t.importe_cents || 0), 0);

        return { total, matched, inProcess, pending, totalCredits, totalDebits };
    }, [transactions]);

    const dailyHistory = useMemo(() => {
        const history: Record<string, any> = {};

        transactions.forEach(tx => {
            let dateKey = tx.fecha || 'Sin fecha';
            if (timeFilter === 'MONTH') {
                dateKey = dateKey.substring(0, 7); // YYYY-MM
            } else if (timeFilter === 'YEAR') {
                dateKey = dateKey.substring(0, 4); // YYYY
            }

            if (!history[dateKey]) {
                history[dateKey] = { date: dateKey, credits: 0, debits: 0, taxes: 0 };
            }

            const amount = Math.abs(tx.importe_cents || 0);
            const obs = (tx.observaciones || '').toUpperCase();
            const client = (tx.nombre_cliente || '').toUpperCase();
            const isTax = tx.tipo === 'Db' && (obs.includes('NIT') || client.includes('NIT'));

            if (tx.tipo === 'Cr') {
                history[dateKey].credits += amount;
            } else if (isTax) {
                history[dateKey].taxes += amount;
            } else {
                history[dateKey].debits += amount;
            }
        });

        // Convert to array and sort by dateKey
        return Object.values(history).sort((a: any, b: any) => a.date.localeCompare(b.date));
    }, [transactions, timeFilter]);
    const topProducts = useMemo(() => getTopProducts(reconciliationLines), [reconciliationLines]);
    const topPayers = useMemo(() => getTopPayers(transactions), [transactions]);

    return (
        <div className="space-y-6  ">
            {/* KPI Cards Grid */}
            {/* Financial KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <KPICard
                    title="Total Créditos (Ingresos) — CUP"
                    value={formatCurrencyCents(metrics.totalCredits)}
                    icon={<ArrowUpRight className="w-5 h-5" />}
                    color="emerald"
                    onClick={() => onNavigate?.('transactions', 'ALL')}
                />
                <KPICard
                    title="Total Débitos (Egresos) — CUP"
                    value={formatCurrencyCents(metrics.totalDebits)}
                    icon={<ArrowDownRight className="w-5 h-5" />}
                    color="rose"
                    onClick={() => onNavigate?.('transactions', 'ALL')}
                />
            </div>

            {/* Operational KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                <KPICard
                    title="Total Transacciones"
                    value={metrics.total}
                    icon={<Activity className="w-5 h-5" />}
                    onClick={() => onNavigate?.('transactions', 'ALL')}
                    color="blue"
                />
                <KPICard
                    title="Cuadradas (Matching)"
                    value={metrics.matched}
                    icon={<Check className="w-5 h-5" />}
                    onClick={() => onNavigate?.('transactions', 'CUADRADAS')}
                    color="emerald"
                />
                <KPICard
                    title="En Proceso"
                    value={metrics.inProcess}
                    icon={<RotateCcw className="w-5 h-5" />}
                    onClick={() => onNavigate?.('transactions', 'EN_PROCESO')}
                    color="amber"
                />
                <KPICard
                    title="Pendientes"
                    value={metrics.pending}
                    icon={<Clock className="w-5 h-5" />}
                    onClick={() => onNavigate?.('transactions', 'PENDIENTES')}
                    color="rose"
                />
                <KPICard
                    title="Productos Negativos"
                    value={negativeProductsCount}
                    icon={<AlertTriangle className="w-5 h-5" />}
                    onClick={() => onNavigate?.('catalog', undefined, 'negative_stock')}
                    color={negativeProductsCount > 0 ? "rose" : "emerald"}
                    highlight={negativeProductsCount > 0}
                />
            </div>

            {/* Main Bento Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 auto-rows-[450px]">
                {/* Sales Trend - Large */}
                <Card className="lg:col-span-8 p-6 rounded-[32px] border-none bg-card/40 backdrop-blur-md shadow-2xl overflow-hidden relative group">
                    <div className="flex justify-between items-center mb-6">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 mb-2 lg:mb-0">
                                <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mr-4">
                                    <TrendingUp className="w-4 h-4" />
                                    Comportamiento de Ventas
                                </h3>
                                <div className="flex bg-muted/50 p-1 rounded-xl">
                                    {(['DAY', 'MONTH', 'YEAR'] as const).map((f) => (
                                        <Button
                                            key={f}
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setTimeFilter(f)}
                                            className={cn(
                                                "h-7 px-3 text-[10px] font-black rounded-lg transition-all",
                                                timeFilter === f ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {f === 'DAY' ? 'DÍA' : f === 'MONTH' ? 'MES' : 'AÑO'}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground/60 font-bold">HISTÓRICO DIARIO POR CANAL</p>
                        </div>
                    </div>
                    {dailyHistory.length > 0 ? (
                        <D3AreaChart data={dailyHistory} />
                    ) : (
                        <EmptyState message="No hay datos de ventas para mostrar" />
                    )}
                </Card>

                {/* Matching Distribution - Small */}
                <Card className="lg:col-span-4 p-6 rounded-[32px] border-none bg-card/40 backdrop-blur-md shadow-2xl overflow-hidden">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-6">
                        <PieIcon className="w-4 h-4" />
                        Estado del Matching
                    </h3>
                    <D3DonutChart data={[
                        { label: 'Cuadradas', value: metrics.matched, color: '#10b981' },
                        { label: 'En Proceso', value: metrics.inProcess, color: '#f59e0b' },
                        { label: 'Pendientes', value: metrics.pending, color: '#f43f5e' }
                    ]} />
                </Card>

                {/* Top Products - Medium */}
                <Card className="lg:col-span-6 p-6 rounded-[32px] border-none bg-card/40 backdrop-blur-md shadow-2xl overflow-hidden">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-6">
                        <Package className="w-4 h-4" />
                        Top Productos (Valor)
                    </h3>
                    {topProducts.length > 0 ? (
                        <D3BarChart data={topProducts.map(p => ({ label: p.name, value: p.total }))} color="#3b82f6" />
                    ) : (
                        <EmptyState message="No hay productos vendidos" />
                    )}
                </Card>

                {/* Top Payers - Medium */}
                <Card className="lg:col-span-6 p-6 rounded-[32px] border-none bg-card/40 backdrop-blur-md shadow-2xl overflow-hidden">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2 mb-6">
                        <Users className="w-4 h-4" />
                        Top Pagadores (Banco)
                    </h3>
                    {topPayers.length > 0 ? (
                        <D3BarChart data={topPayers.map(p => ({ label: p.name, value: p.amount / 100 }))} color="#10b981" />
                    ) : (
                        <EmptyState message="No hay transacciones bancarias" />
                    )}
                </Card>
            </div>
        </div>
    );
}

function KPICard({ title, value, icon, onClick, color, highlight }: any) {
    const colorMap: any = {
        blue: "text-primary bg-primary/10",
        emerald: "text-success bg-success/10",
        amber: "text-warning bg-warning/10",
        rose: "text-rose-500 bg-rose-500/10",
    };

    return (
        <Card
            className={cn(
                "p-5 border-none bg-card/40 backdrop-blur-sm shadow-lg rounded-[24px] cursor-pointer hover:scale-[1.03] active:scale-95 transition-all group",
                highlight && "ring-2 ring-rose-500/50 bg-rose-500/5"
            )}
            onClick={onClick}
        >
            <div className="flex justify-between items-start mb-2">
                <div className={cn("p-2 rounded-xl", colorMap[color] || colorMap["blue"])}>
                    {icon}
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
            </div>
            <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{title}</p>
                <h3 className="text-3xl font-black">{value}</h3>
            </div>
        </Card>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="h-full w-full flex flex-col items-center justify-center text-muted-foreground opacity-40 space-y-4">
            <Sparkles className="w-12 h-12 stroke-[1]" />
            <p className="text-xs font-black uppercase tracking-[0.2em] text-center">{message}</p>
        </div>
    );
}


function D3AreaChart({ data }: { data: any[] }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const svgRef = useRef<any>(null);

    const drawChartRef = useRef(debounce((container: HTMLDivElement, svgStore: { current: any }, data: any[]) => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        const margin = { top: 20, right: 30, bottom: 30, left: 60 };
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;

        let svg: any;
        if (!svgStore.current) {
            svg = d3.select(container)
                .append('svg')
                .attr('width', width)
                .attr('height', height)
                .attr('viewBox', `0 0 ${width} ${height}`);

            const g = svg.append('g')
                .attr('class', 'chart-main-group')
                .attr('transform', `translate(${margin.left},${margin.top})`);

            svgStore.current = svg;

            const defs = svg.append('defs');
            const addGradient = (id: string, color: string) => {
                const grad = defs.append('linearGradient').attr('id', id).attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
                grad.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.3);
                grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0);
            };
            addGradient('grad-credits', '#10b981');
            addGradient('grad-debits', '#f43f5e');
            addGradient('grad-taxes', '#f59e0b');

            g.append('g').attr('class', 'x-axis').attr('transform', `translate(0,${innerHeight})`);
            g.append('g').attr('class', 'y-axis');
            g.append('g').attr('class', 'grid-lines').attr('opacity', 0.05);
        } else {
            svg = svgStore.current;
            svg.attr('width', width).attr('height', height).attr('viewBox', `0 0 ${width} ${height}`);
        }

        const g = svg.select('.chart-main-group');
        const x = d3.scalePoint()
            .domain(data.map(d => d.date))
            .range([0, innerWidth]);

        const yValueMax = d3.max(data, (d: any) => Math.max(d.credits || 0, d.debits || 0, d.taxes || 0)) || 100;
        const y = d3.scaleLinear()
            .domain([0, yValueMax * 1.1])
            .range([innerHeight, 0])
            .nice();

        // X Axis
        g.select('.x-axis')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(d3.axisBottom(x).tickSize(0).tickPadding(10).tickFormat((d: any) => {
                if (data.length > 12) {
                    const idx = data.findIndex(item => item.date === d);
                    return idx % Math.ceil(data.length / 8) === 0 ? String(d) : "";
                }
                return String(d);
            }))
            .attr('font-size', '10px')
            .attr('font-weight', '700')
            .attr('color', '#888');
        g.select('.x-axis').select('.domain').remove();

        // Y Axis
        g.select('.y-axis')
            .call(d3.axisLeft(y).ticks(5).tickFormat((d: any) => `$${(Number(d)/100).toLocaleString()}`).tickSize(0).tickPadding(10))
            .attr('font-size', '10px')
            .attr('font-weight', '700')
            .attr('color', '#888');
        g.select('.y-axis').select('.domain').remove();

        // Grid lines
        g.select('.grid-lines')
            .call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(() => ""));

        const areaGenerator = (key: string) => d3.area<any>()
            .x(d => x(d.date) || 0)
            .y0(innerHeight)
            .y1(d => y(d[key] || 0))
            .curve(d3.curveMonotoneX);

        const lineGenerator = (key: string) => d3.line<any>()
            .x(d => x(d.date) || 0)
            .y(d => y(d[key] || 0))
            .curve(d3.curveMonotoneX);

        const series = [
            { key: 'credits', color: '#10b981' },
            { key: 'debits', color: '#f43f5e' },
            { key: 'taxes', color: '#f59e0b' }
        ];

        series.forEach(s => {
            let areaPath = g.select(`.area-${s.key}`);
            if (areaPath.empty()) {
                areaPath = g.append('path').attr('class', `area-${s.key}`).attr('fill', `url(#grad-${s.key})`);
            }
            areaPath.datum(data).attr('opacity', 1).attr('d', areaGenerator(s.key));

            let linePath = g.select(`.line-${s.key}`);
            if (linePath.empty()) {
                linePath = g.append('path')
                    .attr('class', `line-${s.key}`)
                    .attr('fill', 'none')
                    .attr('stroke', s.color)
                    .attr('stroke-width', 2.5);
            }
            linePath.datum(data).attr('d', lineGenerator(s.key));
        });
    }, 150));

    useEffect(() => {
        const resizeObserver = new ResizeObserver(() => {
            if (containerRef.current) drawChartRef.current(containerRef.current, svgRef, data);
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
            drawChartRef.current(containerRef.current, svgRef, data);
        }

        return () => {
            resizeObserver.disconnect();
            drawChartRef.current.cancel();
        };
    }, [data]);

    return <div ref={containerRef} className="w-full h-full" />;
}



function D3DonutChart({ data }: { data: any[] }) {
    const containerRef = useRef<HTMLDivElement>(null);

    const drawChartRef = useRef(debounce((container: HTMLDivElement, data: any[]) => {
        container.innerHTML = '';

        const totalValue = d3.sum(data, d => d.value);
        if (totalValue === 0) {
            d3.select(container).append('div').attr('class', 'h-full w-full flex items-center justify-center opacity-40 text-xs font-black uppercase').text('Sin datos');
            return;
        }

        const width = container.clientWidth;
        const height = container.clientHeight;
        const radius = Math.min(width, height) / 2 - 40;

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${width / 2},${height / 2})`);

        const pie = d3.pie<any>().value(d => d.value).sort(null);
        const arcGenerator = d3.arc<any>().innerRadius(radius * 0.6).outerRadius(radius).cornerRadius(10).padAngle(0.05);

        svg.selectAll('path')
            .data(pie(data))
            .enter()
            .append('path')
            .attr('fill', d => d.data.color)
            .attr('d', arcGenerator as any)
            .attr('opacity', 0.8)
            .on('mouseover', (event) => { d3.select(event.currentTarget as SVGPathElement).transition().duration(200).attr('opacity', 1); })
            .on('mouseout', (event) => { d3.select(event.currentTarget as SVGPathElement).transition().duration(200).attr('opacity', 0.8); });

        const center = svg.append('g').attr('text-anchor', 'middle');
        center.append('text').attr('dy', '-0.5em').attr('class', 'fill-muted-foreground').attr('style', 'font-size: 10px; font-weight: 900;').text('TOTAL');
        center.append('text').attr('dy', '0.6em').attr('class', 'fill-foreground').attr('style', 'font-size: 24px; font-weight: 900;').text(totalValue);
    }, 150));

    useEffect(() => {
        if (containerRef.current) drawChartRef.current(containerRef.current, data);
        return () => drawChartRef.current.cancel();
    }, [data]);

    return <div ref={containerRef} className="w-full h-full" />;
}


function D3BarChart({ data, color }: { data: any[], color: string }) {
    const containerRef = useRef<HTMLDivElement>(null);

    const drawChartRef = useRef(debounce((container: HTMLDivElement, data: any[], color: string) => {
        if (data.length === 0) return;
        container.innerHTML = '';

        const width = container.clientWidth;
        const height = container.clientHeight;
        const margin = { top: 10, right: 30, bottom: 40, left: 100 };

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear()
            .domain([0, d3.max(data, d => d.value) || 0])
            .range([0, width - margin.left - margin.right]);

        const y = d3.scaleBand()
            .domain(data.map(d => d.label))
            .range([0, height - margin.top - margin.bottom])
            .padding(0.3);

        svg.append('g')
            .call(d3.axisLeft(y).tickSize(0).tickPadding(10))
            .attr('font-size', '9px')
            .attr('font-weight', '800')
            .attr('color', '#888')
            .select('.domain').remove();

        svg.selectAll('rect')
            .data(data)
            .enter()
            .append('rect')
            .attr('y', d => y(d.label) || 0)
            .attr('x', 0)
            .attr('height', y.bandwidth())
            .attr('fill', color)
            .attr('rx', 6)
            .attr('width', d => x(d.value));

        svg.selectAll('.label-val')
            .data(data)
            .enter()
            .append('text')
            .attr('class', 'label-val')
            .attr('y', d => (y(d.label) || 0) + y.bandwidth() / 2)
            .attr('x', d => x(d.value) + 5)
            .attr('dy', '.35em')
            .attr('font-size', '10px')
            .attr('font-weight', '900')
            .attr('fill', '#888')
            .text(d => d.value.toLocaleString())
            .attr('opacity', 1);
    }, 150));

    useEffect(() => {
        if (containerRef.current) drawChartRef.current(containerRef.current, data, color);
        return () => drawChartRef.current.cancel();
    }, [data, color]);

    return <div ref={containerRef} className="w-full h-full" />;
}
