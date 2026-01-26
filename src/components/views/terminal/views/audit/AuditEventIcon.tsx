import React from 'react';
import {
  Package,
  ShoppingCart,
  Users,
  Store,
  AlertTriangle,
  Plus,
  Edit,
  Trash2,
  RefreshCcw,
  LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type AuditCategory = 'inventory' | 'sales' | 'users' | 'stores' | 'adjustments' | 'other';

interface AuditEventIconProps {
  tableName: string;
  action: string;
  className?: string;
}

export const getAuditCategory = (tableName: string, action: string): AuditCategory => {
  const table = tableName.toLowerCase();
  const act = action.toUpperCase();

  if (['DELETE', 'VOID', 'CANCEL'].includes(act)) return 'adjustments';

  if ([
    'products', 'inventory', 'stock_movements', 'receipts',
    'receipt_items', 'purchase_orders', 'purchase_items', 'inventory_batches'
  ].includes(table)) return 'inventory';

  if ([
    'transactions', 'transaction_items', 'cash_register_sessions',
    'cash_movements', 'cash_closures', 'sales_items'
  ].includes(table)) return 'sales';

  if (['profiles', 'user_store_memberships', 'users'].includes(table)) return 'users';

  if (['stores'].includes(table)) return 'stores';

  return 'other';
};

export default function AuditEventIcon({ tableName, action, className }: AuditEventIconProps) {
  const category = getAuditCategory(tableName, action);

  let Icon: LucideIcon = Package;
  let colorClass = 'bg-slate-500/10 text-slate-600';

  switch (category) {
    case 'inventory':
      Icon = Package;
      colorClass = 'bg-green-500/10 text-green-600';
      break;
    case 'sales':
      Icon = ShoppingCart;
      colorClass = 'bg-blue-500/10 text-blue-600';
      break;
    case 'users':
      Icon = Users;
      colorClass = 'bg-purple-500/10 text-purple-600';
      break;
    case 'stores':
      Icon = Store;
      colorClass = 'bg-orange-500/10 text-orange-600';
      break;
    case 'adjustments':
      Icon = AlertTriangle;
      colorClass = 'bg-red-500/10 text-red-600';
      break;
    default:
      Icon = RefreshCcw;
      colorClass = 'bg-slate-500/10 text-slate-600';
  }

  // Override icon based on action if it's a basic one
  const act = action.toUpperCase();
  if (act === 'INSERT' || act === 'CREATE') Icon = Plus;
  if (act === 'UPDATE' || act === 'EDIT') Icon = Edit;
  if (act === 'DELETE') Icon = Trash2;

  return (
    <div className={cn("p-2 rounded-full", colorClass, className)}>
      <Icon size={16} strokeWidth={2.5} />
    </div>
  );
}
