'use client';
import React, { useEffect } from 'react';
import CostSheetView from '@/components/views/terminal/views/cost_sheet/CostSheetView';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useAuthStore } from '@/store';

export default function VerifyMobilePage() {
    const { login } = useAuthStore();
    const { loadExample } = useCostSheetStore();

    useEffect(() => {
        login({
            id: '1',
            name: 'Test',
            role: 'admin',
            activeStoreId: '1'
        } as any, 'token');
        loadExample();
    }, [login, loadExample]);

    return (
        <div className="bg-background min-h-screen">
            <CostSheetView />
        </div>
    );
}
