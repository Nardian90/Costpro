import React from 'react';
import { AuditLog } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import AuditEventIcon, { getAuditCategory } from './AuditEventIcon';
import AuditEventMeta from './AuditEventMeta';
import { cn, formatCurrency } from '@/lib/utils';

interface AuditEventCardProps {
  log: AuditLog;
}

const getBusinessText = (log: AuditLog) => {
  const { table_name, action, new_data, old_data } = log;

  const tableMap: Record<string, string> = {
    'products': 'Producto',
    'inventory': 'Inventario',
    'stock_movements': 'Movimiento de Stock',
    'receipts': 'Recepción',
    'transactions': 'Venta',
    'profiles': 'Perfil de Usuario',
    'stores': 'Tienda',
    'cash_closures': 'Cierre de Caja',
    'user_store_memberships': 'Membresía de Tienda',
    'transfers': 'Transferencia'
  };

  const actionMap: Record<string, string> = {
    'INSERT': 'creó',
    'UPDATE': 'actualizó',
    'DELETE': 'eliminó',
    'VOID': 'anuló',
    'CANCEL': 'canceló',
    'CREATE_PRODUCT': 'creó el producto',
    'UPDATE_PRODUCT': 'actualizó el producto',
    'UPDATE_PRICES': 'cambió precios de',
    'DELETE_PRODUCT': 'eliminó el producto',
    'ACTIVATE_PRODUCT': 'activó el producto',
    'DEACTIVATE_PRODUCT': 'desactivó el producto',
    'CREATE_SALE': 'realizó una venta',
    'MANUAL_STOCK_ADJUSTMENT': 'ajustó stock de',
    'CREATE_TRANSFER': 'inició una transferencia',
    'CONFIRM_TRANSFER': 'confirmó una transferencia',
    'CREATE_USER': 'creó el usuario',
    'UPDATE_USER_NAME': 'actualizó el nombre de',
    'DELETE_USER': 'eliminó el usuario',
    'CHANGE_ROLE': 'cambió el rol de',
    'CHANGE_ACTIVE_STORE': 'cambió de tienda activa',
    'UPDATE_STORE_CONFIG': 'actualizó configuración de tienda'
  };

  const tableName = tableMap[table_name] || table_name.replace(/_/g, ' ');
  const actionName = actionMap[action.toUpperCase()] || action.toLowerCase();

  // Custom logic for specific actions/tables
  if (action === 'CREATE_SALE') {
    const total = new_data?.total_amount || 0;
    return `realizó una venta por ${formatCurrency(total)}`;
  }

  if (action === 'MANUAL_STOCK_ADJUSTMENT') {
    const name = old_data?.product_name || 'producto';
    const delta = new_data?.delta || 0;
    return `ajustó stock de ${name} (${delta > 0 ? '+' : ''}${delta} unid.)`;
  }

  if (action === 'UPDATE_PRICES') {
    const name = new_data?.name || old_data?.name || '';
    return `cambió precios de ${name}`;
  }

  if (table_name === 'products') {
    const name = new_data?.name || old_data?.name || '';
    return `${actionName} ${name}`.trim();
  }

  if (table_name === 'transactions') {
    const total = new_data?.total_amount || old_data?.total_amount || 0;
    return `${actionName} una venta por ${formatCurrency(total)}`;
  }

  if (table_name === 'receipts') {
      const ref = new_data?.reference_doc || old_data?.reference_doc || '';
      return `${actionName} la recepción ${ref}`.trim();
  }

  if (table_name === 'profiles') {
      const name = new_data?.full_name || old_data?.full_name || '';
      return `${actionName} ${name}`.trim();
  }

  if (table_name === 'transfers') {
      return `${actionName}`;
  }

  return `${actionName} ${tableName}`;
};

export default function AuditEventCard({ log }: AuditEventCardProps) {
  const category = getAuditCategory(log.table_name, log.action);
  const timeAgo = formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: es });
  const businessText = getBusinessText(log);

  const roleColors: Record<string, string> = {
    'admin': 'text-destructive bg-destructive/5 border-destructive/20',
    'encargado': 'text-warning bg-warning/5 border-warning/20',
    'manager': 'text-success bg-success/5 border-success/20',
    'usuario': 'text-muted-foreground bg-muted border-border'
  };

  const roleLabel = log.profile?.role || 'Sistema';
  const storeName = log.store_name || log.metadata?.store_name || log.new_data?.store_name || log.old_data?.store_name || '';

  return (
    <div className="relative pl-8 pb-8 group last:pb-0">
      {/* Timeline Line */}
      <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border group-last:bottom-8" />

      {/* Timeline Node */}
      <div className="absolute left-0 top-0 z-10">
        <AuditEventIcon tableName={log.table_name} action={log.action} />
      </div>

      <div className="bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="font-black text-sm text-foreground">
              {log.profile?.full_name || 'Sistema'}
            </span>
            {log.profile?.role && (
              <span className={cn(
                "text-xs font-black uppercase px-1.5 py-0.5 rounded border",
                roleColors[log.profile.role as keyof typeof roleColors] || 'text-slate-600 bg-slate-50 border-slate-200'
              )}>
                {log.profile.role}
              </span>
            )}
          </div>
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {timeAgo}
          </span>
        </div>

        <p className="text-sm text-muted-foreground font-medium mb-3">
          {businessText}
        </p>

        <div className="flex flex-wrap items-center gap-3 mt-auto pt-3 border-t border-border/50">
          {storeName && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-warning" />
              <span className="text-xs font-black uppercase text-muted-foreground">
                🏬 {storeName}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground uppercase">
              ID: {log.record_id?.slice(0, 8)}...
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={cn(
              "px-1.5 py-0.5 rounded text-xs font-black uppercase tracking-tighter",
              category === 'inventory' ? 'bg-success/10 text-success' :
              category === 'sales' ? 'bg-primary/10 text-primary' :
              category === 'users' ? 'bg-info/10 text-info' :
              category === 'stores' ? 'bg-warning/10 text-warning' :
              category === 'adjustments' ? 'bg-destructive/10 text-destructive' :
              'bg-muted text-muted-foreground'
            )}>
              {category}
            </span>
          </div>
        </div>

        <AuditEventMeta
          oldData={log.old_data}
          newData={log.new_data}
          metadata={log.metadata}
        />
      </div>
    </div>
  );
}
