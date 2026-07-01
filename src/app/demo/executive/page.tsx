import ExecutiveDemoView from '@/components/views/executive-demo/ExecutiveDemoView';

export const metadata = {
  title: 'Executive Demo - CostPro',
  description: 'Descubra el poder de la automatización de fichas de costo en tiempo real.',
};

export default function ExecutiveDemoPage() {
  return (
    <main className="min-h-screen bg-background">
      <ExecutiveDemoView />
    </main>
  );
}
