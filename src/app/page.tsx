import { Suspense } from 'react';
import CyberShell from '@/components/ui/CyberShell';
import TerminalView from '@/components/views/TerminalView';
import DataDecryption from '@/components/ui/DataDecryption';

export const metadata = {
  title: 'Terminal - CostPro',
};

export default function HomePage() {
  return (
    <CyberShell>
      <Suspense fallback={<DataDecryption />}>
        <TerminalView />
      </Suspense>
    </CyberShell>
  );
}
