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

    const metrics = useMemo(() => {
        const total = transactions.length;
        const matched = transactions.filter(t => t.estado_conciliacion === 'COMPLETO').length;
        const inProcess = transactions.filter(t => t.estado_conciliacion === 'PARCIAL' || (t.estado_conciliacion === 'PENDIENTE' && (t.applied_rules?.length ?? 0) > 0)).length;
        const pending = transactions.filter(t => t.estado_conciliacion === 'PENDIENTE' && (!t.applied_rules || t.applied_rules.length === 0)).length;

        return { total, matched, inProcess, pending };
    }, [transactions]);

    const dailyHistory = useMemo(() => getDailySalesHistory(reconciliationLines, transactions), [reconciliationLines, transactions]);
    const topProducts = useMemo(() => getTopProducts(reconciliationLines), [reconciliationLines]);
    const topPayers = useMemo(() => getTopPayers(transactions), [transactions]);

    return (
        <div className="space-y-6 animate-in fade-in duration-700">
            {/* KPI Cards Grid */}
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
                            <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                Comportamiento de Ventas
                            </h3>
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
        blue: "text-blue-500 bg-blue-500/10",
        emerald: "text-emerald-500 bg-emerald-500/10",
        amber: "text-amber-500 bg-amber-500/10",
        rose: "text-rose-500 bg-rose-500/10",
    };

    return (
        <Card
            className={cn(
                "p-5 border-none bg-card/40 backdrop-blur-sm shadow-lg rounded-[24px] cursor-pointer hover:scale-[1.03] active:scale-95 transition-all group",
                highlight && "ring-2 ring-rose-500/50 animate-pulse"
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

    useEffect(() => {
        if (!containerRef.current || data.length === 0) return;
        const container = containerRef.current;
        container.innerHTML = '';

        const width = container.clientWidth;
        const height = container.clientHeight;
        const margin = { top: 20, right: 20, bottom: 40, left: 50 };

        const svg = d3.select(container)
            .append('svg')
            .attr('width', width)
            .attr('height', height)
            .attr('viewBox', `0 0 ${width} ${height}`)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scalePoint()
            .domain(data.map(d => d.date))
            .range([0, width - margin.left - margin.right]);

        const y = d3.scaleLinear()
            .domain([0, d3.max(data, d => Math.max(d.cash, d.transfer, d.debits)) || 100])
            .range([height - margin.top - margin.bottom, 0]);

        const defs = svg.append('defs');

        const addGradient = (id: string, color: string) => {
            const grad = defs.append('linearGradient').attr('id', id).attr('x1', '0').attr('y1', '0').attr('x2', '0').attr('y2', '1');
            grad.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.4);
            grad.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0);
        };

        addGradient('grad-cash', '#10b981');
        addGradient('grad-transfer', '#3b82f6');

        svg.append('g')
            .attr('transform', `translate(0,${height - margin.top - margin.bottom})`)
            .call(d3.axisBottom(x).tickSize(0).tickPadding(10))
            .attr('font-size', '10px')
            .attr('font-weight', '700')
            .attr('color', '#888')
            .select('.domain').remove();

        svg.append('g')
            .call(d3.axisLeft(y).ticks(5).tickFormat(d => `$${d}`).tickSize(0).tickPadding(10))
            .attr('font-size', '10px')
            .attr('font-weight', '700')
            .attr('color', '#888')
            .select('.domain').remove();

        svg.append('g')
            .attr('class', 'grid')
            .attr('opacity', 0.05)
            .call(d3.axisLeft(y).tickSize(-(width - margin.left - margin.right)).tickFormat(() => ""));

        const areaGenerator = (key: string) => d3.area<any>()
            .x(d => x(d.date) || 0)
            .y0(height - margin.top - margin.bottom)
            .y1(d => y(d[key]))
            .curve(d3.curveMonotoneX);

        const lineGenerator = (key: string) => d3.line<any>()
            .x(d => x(d.date) || 0)
            .y(d => y(d[key]))
            .curve(d3.curveMonotoneX);

        ['cash', 'transfer'].forEach(key => {
            const color = key === 'cash' ? '#10b981' : '#3b82f6';
            svg.append('path')
                .datum(data)
                .attr('fill', `url(#grad-${key})`)
                .attr('d', areaGenerator(key))
                .attr('opacity', 0)
                .transition().duration(1000)
                .attr('opacity', 1);

            const path = svg.append('path')
                .datum(data)
                .attr('fill', 'none')
                .attr('stroke', color)
                .attr('stroke-width', 3)
                .attr('d', lineGenerator(key));

            const totalLength = (path.node() as SVGPathElement).getTotalLength();
            path.attr('stroke-dasharray', `${totalLength} ${totalLength}`)
                .attr('stroke-dashoffset', totalLength)
                .transition().duration(1500)
                .attr('stroke-dashoffset', 0);
        });

    }, [data]);

    return <div ref={containerRef} className="w-full h-full" />;
}

function D3DonutChart({ data }: { data: any[] }) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        container.innerHTML = '';

        const totalValue = d3.sum(data, d => d.value);
        if (totalValue === 0) {
            const emptyLabel = d3.select(container).append('div').attr('class', 'h-full w-full flex items-center justify-center opacity-40 text-xs font-black uppercase').text('Sin datos');
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

        const paths = svg.selectAll('path')
            .data(pie(data))
            .enter()
            .append('path')
            .attr('fill', d => d.data.color)
            .attr('d', arcGenerator as any)
            .attr('opacity', 0.8)
            .on('mouseover', function() { d3.select(this).transition().duration(200).attr('opacity', 1); })
            .on('mouseout', function() { d3.select(this).transition().duration(200).attr('opacity', 0.8); });

        paths.transition()
            .duration(1000)
            .attrTween('d', function(d) {
                const i = d3.interpolate({ startAngle: 0, endAngle: 0 }, d);
                return function(t) { return arcGenerator(i(t)) as string; };
            });

        const center = svg.append('g').attr('text-anchor', 'middle');
        center.append('text').attr('dy', '-0.5em').attr('class', 'fill-muted-foreground').attr('style', 'font-size: 10px; font-weight: 900;').text('TOTAL');
        center.append('text').attr('dy', '0.6em').attr('class', 'fill-foreground').attr('style', 'font-size: 24px; font-weight: 900;').text(totalValue);

    }, [data]);

    return <div ref={containerRef} className="w-full h-full" />;
}

function D3BarChart({ data, color }: { data: any[], color: string }) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current || data.length === 0) return;
        const container = containerRef.current;
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
            .attr('width', 0)
            .transition().duration(1000).delay((d, i) => i * 50)
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
            .attr('opacity', 0)
            .transition().duration(1000).delay((d, i) => i * 50 + 500)
            .attr('opacity', 1);

    }, [data, color]);

    return <div ref={containerRef} className="w-full h-full" />;
}
