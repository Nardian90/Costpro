'use client';


import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import { CostSheetSidebarNav } from './CostSheetSidebarNav';
import { Progress } from '@/components/ui/progress';

interface CostSheetWizardProps {
  data: any;
  calculatedValues: any;
  calculatedHeader?: any;
}

const steps = [
  { id: 'header', label: 'Encabezado', description: 'Información general del producto' },
  { id: 'I', label: 'Anexo I', description: 'Materias Primas y Materiales' },
  { id: 'II', label: 'Anexo II', description: 'Mano de Obra Directa' },
  { id: 'III', label: 'Anexo III', description: 'Depreciación de Activos' },
  { id: 'IV', label: 'Anexo IV', description: 'Otros Gastos Directos' },
  { id: 'V', label: 'Anexo V', description: 'Dietas de Trabajadores' },
  { id: 'main', label: 'Cálculo Final', description: 'Revisión y ajustes de la tabla principal' },
  { id: 'signature', label: 'Firmas', description: 'Validación y aprobación' },
];

const CostSheetWizard: React.FC<CostSheetWizardProps> = ({ data, calculatedValues, calculatedHeader }) => {
  const [currentStep, setCurrentStep] = React.useState(0);
  const [activeSubSectionId, setActiveSubSectionId] = React.useState('');
  const [isSectionsSidebarOpen, setIsSectionsSidebarOpen] = React.useState(false);

  // Auto-select first section when wizard reaches the main step
  React.useEffect(() => {
    if (data?.sections && data.sections.length > 0 && !activeSubSectionId) {
       const firstId = data.sections[0]?.id;
       if (firstId && firstId !== activeSubSectionId) {
         setActiveSubSectionId(firstId);
       }
    }
  }, [data?.sections, activeSubSectionId]);

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Progress Header */}
      <div className="neu-card p-6 bg-slate-50 dark:bg-slate-900/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary mb-1">
              Paso {currentStep + 1} de {steps.length}
            </p>
            <h2 className="text-xl font-bold">{step.label}</h2>
            <p className="text-sm text-slate-500">{step.description}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrev} disabled={currentStep === 0} className="neu-button">
              <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
            </Button>
            <Button size="sm" onClick={handleNext} disabled={currentStep === steps.length - 1} className="neu-button bg-primary text-foreground">
              {currentStep === steps.length - 1 ? 'Finalizar' : 'Siguiente'} <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Step Content */}
      <div className="min-h-[400px]">
        {step.id === 'header' && <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />}
        {['I', 'II', 'III', 'IV', 'V'].includes(step.id) && <CostSheetAnnexEditor activeAnnexId={step.id} />}
        {step.id === 'main' && (
           <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-800 rounded-xl text-green-800 dark:text-green-300 text-sm flex gap-3">
                 <CheckCircle2 className="w-5 h-5 shrink-0" />
                 <p>En este paso puede revisar los cálculos automáticos y ajustar valores históricos o métodos de prorrateo para los gastos indirectos.</p>
              </div>
              <CostSheetInteractiveTable
                sections={data?.sections || []}
                calculatedValues={calculatedValues}
                annexes={data?.annexes || []}
                activeSubSectionId={activeSubSectionId}
                setActiveSubSectionId={setActiveSubSectionId}
                onOpenSections={() => setIsSectionsSidebarOpen(true)}
              />

              <CostSheetSidebarNav
                isOpen={isSectionsSidebarOpen}
                onClose={() => setIsSectionsSidebarOpen(false)}
                title="Secciones de la Ficha"
                type="sections"
                items={data?.sections || []}
                activeId={activeSubSectionId}
                onSelect={setActiveSubSectionId}
              />
           </div>
        )}
        {step.id === 'signature' && <CostSheetSignatureEditor />}
      </div>

      {/* Footer Navigation */}
      <div className="flex justify-between items-center py-6 border-t border-slate-200 dark:border-slate-800">
         <Button variant="ghost" onClick={handlePrev} disabled={currentStep === 0} className="text-slate-500">
            Regresar a {currentStep > 0 ? steps[currentStep-1].label : '...'}
         </Button>
         <Button onClick={handleNext} disabled={currentStep === steps.length - 1} className="bg-primary text-foreground px-8">
            Continuar a {currentStep < steps.length - 1 ? steps[currentStep+1].label : 'Finalizar'}
         </Button>
      </div>
    </div>
  );
};

export default CostSheetWizard;
