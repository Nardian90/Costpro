import { type Dexie } from 'dexie';

export async function exportFullBackup(db: Dexie) {
    try {
        const tables = db.tables;
        const backupData: Record<string, any[]> = {};

        for (const table of tables) {
            backupData[table.name] = await table.toArray();
        }

        const json = JSON.stringify(backupData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `ipv-builder-backup-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting backup:', error);
        throw error;
    }
}
