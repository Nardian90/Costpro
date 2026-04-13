import { CostProLoader } from '@/components/ui/CostProLoader';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background animate-in fade-in duration-300">
      <CostProLoader size={200} text="COSTPRO" subtext="Cargando..." />
    </div>
  );
}
