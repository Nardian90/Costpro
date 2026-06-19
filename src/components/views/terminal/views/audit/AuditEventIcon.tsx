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
  let colorClass = 'bg-muted text-muted-foreground';

  switch (category) {
    case 'inventory':
      Icon = Package;
      colorClass = 'bg-success/10 text-success';
      break;
    case 'sales':
      Icon = ShoppingCart;
      colorClass = 'bg-primary/10 text-primary';
      break;
    case 'users':
      Icon = Users;
      colorClass = 'bg-info/10 text-info';
      break;
    case 'stores':
      Icon = Store;
      colorClass = 'bg-warning/10 text-warning';
      break;
    case 'adjustments':
      Icon = AlertTriangle;
      colorClass = 'bg-destructive/10 text-destructive';
      break;
    default:
      Icon = RefreshCcw;
      colorClass = 'bg-muted text-muted-foreground';
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
