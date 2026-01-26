import { Suspense } from 'react';
import CyberShell from '@/components/ui/CyberShell';
import TerminalShell from '@/components/views/TerminalShell';
import DataDecryption from '@/components/ui/DataDecryption';

export const metadata = {
  title: 'Terminal - CostPro',
};

export default function HomePage() {
  return (
    <CyberShell>
      <Suspense fallback={<DataDecryption />}>
        <TerminalShell />
      </Suspense>
    </CyberShell>
  );
}
