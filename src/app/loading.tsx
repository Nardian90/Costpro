import { CostProLoader } from '@/components/ui/CostProLoader';

export default function Loading() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <CostProLoader
        text="Gestión Empresarial"
        subtext="Inicializando sistema"
        showText
        showSubtext
      />
    </div>
  );
}
