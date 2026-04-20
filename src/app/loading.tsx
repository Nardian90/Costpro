import { CostProLoader } from '@/components/ui/CostProLoader';

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#020617]">
      <CostProLoader size={160} text="COSTPRO" subtext="Cargando..." />
    </div>
  );
}
