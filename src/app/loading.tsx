import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';

export default function Loading() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <ViewLoadingSplash label="Gestión Empresarial" showTips={false} />
    </div>
  );
}
