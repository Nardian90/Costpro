import { Suspense } from 'react';
import DataDecryption from '@/components/ui/DataDecryption';

export default function IPVPage() {
  return (
    <div className="container py-12">
      <h1 className="text-4xl font-black mb-8 uppercase tracking-tighter">Protocolo IPV</h1>
      <Suspense fallback={<DataDecryption />}>
        <div className="bg-surface p-8 border border-border rounded-2xl">
          <p className="text-on-surface-variant">Bienvenido al módulo de Validación de Inventario y Pagos.</p>
        </div>
      </Suspense>
    </div>
  );
}
