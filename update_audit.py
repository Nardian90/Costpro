import sys
import re

file_path = 'src/components/views/terminal/views/ipv/MatchingAuditView.tsx'
with open(file_path, 'r') as f:
    content = f.read()

# 1. Add db import and icons
content = content.replace(
    "import { MatchingLogService } from '@/services/matching-log-service';",
    "import { MatchingLogService } from '@/services/matching-log-service';\nimport { db } from '@/lib/dexie';"
)
content = content.replace(
    "CheckCircle2,\n  Clock,",
    "CheckCircle2,\n  UserCheck,\n  Clock,"
)

# 2. Add query for transactions
content = content.replace(
    "const txHistory = useLiveQuery(",
    "const transactions = useLiveQuery(() => db.bank_statements.where('fecha').equals(selectedDate).toArray(), [selectedDate]);\n\n  const txHistory = useLiveQuery("
)

# 3. Update stats calculation
stats_search = """  const stats = useMemo(() => {
    if (!logs || logs.length === 0) return null;
    return {
      total: logs.length,
      completo: logs.filter(l => l.resultado_estado === 'COMPLETO').length,
      parcial: logs.filter(l => l.resultado_estado === 'PARCIAL').length,
      pendiente: logs.filter(l => l.resultado_estado === 'PENDIENTE').length,
      avgConfidence: logs.reduce((sum, l) => sum + l.matching_confidence, 0) / logs.length,
      successRate: (logs.filter(l => l.resultado_estado === 'COMPLETO').length / logs.length) * 100
    };
  }, [logs]);"""

stats_replace = """  const stats = useMemo(() => {
    if (!logs || !transactions) return null;

    // Transacciones cuadradas reales en la DB
    const realComplete = transactions.filter(t => t.estado_conciliacion === 'COMPLETO').length;
    const realPartial = transactions.filter(t => t.estado_conciliacion === 'PARCIAL').length;
    const realPending = transactions.filter(t => t.estado_conciliacion === 'PENDIENTE').length;

    // Diferenciar entre automático (en logs) y manual
    const autoCompleteRefs = new Set(logs.filter(l => l.resultado_estado === 'COMPLETO').map(l => l.transaction_ref));
    const manualComplete = transactions.filter(t => t.estado_conciliacion === 'COMPLETO' && !autoCompleteRefs.has(t.referencia_origen)).length;

    return {
      total: transactions.length,
      completo: realComplete,
      manualCompleto: manualComplete,
      autoCompleto: autoCompleteRefs.size,
      parcial: realPartial,
      pendiente: realPending,
      avgConfidence: logs.length > 0 ? logs.reduce((sum, l) => sum + l.matching_confidence, 0) / logs.length : 0,
      successRate: transactions.length > 0 ? (realComplete / transactions.length) * 100 : 0
    };
  }, [logs, transactions]);"""

content = content.replace(stats_search, stats_replace)

# 4. Update chart data
chart_search = """  const chartData = useMemo(() => {
    if (!logs || !stats) return [];
    return [
      { name: 'COMPLETO', value: stats.completo, color: '#22c55e' },
      { name: 'PARCIAL', value: stats.parcial, color: '#f97316' },
      { name: 'PENDIENTE', value: stats.pendiente, color: '#ef4444' }
    ];
  }, [logs, stats]);"""

chart_replace = """  const chartData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'AUTO', value: stats.autoCompleto, color: '#22c55e' },
      { name: 'MANUAL', value: stats.manualCompleto, color: '#3b82f6' },
      { name: 'PARCIAL', value: stats.parcial, color: '#f97316' },
      { name: 'PENDIENTE', value: stats.pendiente, color: '#ef4444' }
    ];
  }, [stats]);"""

content = content.replace(chart_search, chart_replace)

# 5. Update UI cards to show Manual Completo
ui_search = """          <Card className="p-4 bg-green-500/5 border-green-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">CUADRADAS</p>
                <p className="text-2xl font-black text-green-600">{stats.completo}</p>
              </div>
              <CheckCircle2 className="w-6 h-6 text-green-600 opacity-20" />
            </div>
          </Card>"""

ui_replace = """          <Card className="p-4 bg-green-500/5 border-green-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">CUADRADAS (TOTAL)</p>
                <p className="text-2xl font-black text-green-600">{stats.completo}</p>
                <div className="flex gap-2 mt-1">
                    <span className="text-[9px] font-bold text-green-700 bg-green-500/10 px-1 rounded">AUTO: {stats.autoCompleto}</span>
                    <span className="text-[9px] font-bold text-blue-700 bg-blue-500/10 px-1 rounded">MANUAL: {stats.manualCompleto}</span>
                </div>
              </div>
              <CheckCircle2 className="w-6 h-6 text-green-600 opacity-20" />
            </div>
          </Card>"""

content = content.replace(ui_search, ui_replace)

with open(file_path, 'w') as f:
    f.write(content)

print("Audit view updated.")
