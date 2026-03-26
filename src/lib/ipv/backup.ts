import { type Dexie } from 'dexie';
import { strToU8, zipSync } from 'fflate';

export interface BackupMetadata {
    version: string;
    timestamp: string;
    source: string;
    checksum?: string;
    tables: string[];
}

export interface FullBackup {
    metadata: BackupMetadata;
    data: Record<string, any[]>;
}

async function generateChecksum(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function exportFullBackup(db: Dexie) {
    try {
        const tables = db.tables;
        const backupData: Record<string, any[]> = {};
        const tableNames: string[] = [];

        for (const table of tables) {
            backupData[table.name] = await table.toArray();
            tableNames.push(table.name);
        }

        const dataString = JSON.stringify(backupData);
        const checksum = await generateChecksum(dataString);

        const fullBackup: FullBackup = {
            metadata: {
                version: '1.2',
                timestamp: new Date().toISOString(),
                source: 'CostPro IPV Engine',
                tables: tableNames,
                checksum: checksum
            },
            data: backupData
        };

        const json = JSON.stringify(fullBackup, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.href = url;
        a.download = `ipv-backup-standard-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error exporting backup:', error);
        throw error;
    }
}

export async function importFullBackup(db: Dexie, file: File) {
    return new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const json = e.target?.result as string;
                const fullBackup: FullBackup = JSON.parse(json);

                // Basic validation
                if (!fullBackup.metadata || !fullBackup.data) {
                    // Fallback for old backup format
                    if (typeof fullBackup === 'object' && !Array.isArray(fullBackup)) {
                         console.warn('Old backup format detected. Attempting legacy import.');
                         await db.transaction('rw', db.tables, async () => {
                            for (const table of db.tables) {
                                await table.clear();
                                if ((fullBackup as any)[table.name]) {
                                    await table.bulkAdd((fullBackup as any)[table.name]);
                                }
                            }
                        });
                        return resolve();
                    }
                    throw new Error('Formato de salva inválido: falta metadata o data');
                }

                // Checksum validation
                const dataString = JSON.stringify(fullBackup.data);
                const currentChecksum = await generateChecksum(dataString);

                if (fullBackup.metadata.checksum && fullBackup.metadata.checksum !== currentChecksum) {
                    throw new Error('Fallo de integridad: El checksum de la salva no coincide.');
                }

                await db.transaction('rw', db.tables, async () => {
                    for (const table of db.tables) {
                        await table.clear();
                        if (fullBackup.data[table.name]) {
                            await table.bulkAdd(fullBackup.data[table.name]);
                        }
                    }
                });
                resolve();
            } catch (error) {
                console.error('Error importing backup:', error);
                reject(error);
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsText(file);
    });
}

/**
 * Local Storage Backup Manager
 * Manages automated incremental backups in LocalStorage
 */
const BACKUP_PREFIX = 'costpro_ipv_auto_backup_';
const MAX_BACKUPS = 5;

export async function runAutoBackup(db: Dexie) {
    try {
        const backupData: Record<string, any[]> = {};
        for (const table of db.tables) {
            backupData[table.name] = await table.toArray();
        }

        const dataString = JSON.stringify(backupData);
        const compressed = zipSync({
            'backup.json': strToU8(dataString)
        });

        // Convert to base64 for LocalStorage
        const base64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));

        const timestamp = Date.now();
        const key = `${BACKUP_PREFIX}${timestamp}`;

        localStorage.setItem(key, base64);

        // Cleanup old backups
        const keys = Object.keys(localStorage)
            .filter(k => k.startsWith(BACKUP_PREFIX))
            .sort();

        if (keys.length > MAX_BACKUPS) {
            const toDelete = keys.slice(0, keys.length - MAX_BACKUPS);
            toDelete.forEach(k => localStorage.removeItem(k));
        }

        localStorage.setItem('costpro_ipv_last_backup_ts', timestamp.toString());
        console.log(`Auto-backup completed: ${new Date(timestamp).toLocaleString()}`);
    } catch (error) {
        console.error('Auto-backup failed:', error);
    }
}

export function getLastBackupTimestamp(): number | null {
    const ts = localStorage.getItem('costpro_ipv_last_backup_ts');
    return ts ? parseInt(ts, 10) : null;
}
