class MatchingLogService {
    private logs: string[] = [];

    logMatch(matchResult: string): void {
        const timestamp = new Date().toISOString();
        this.logs.push(`${timestamp}: ${matchResult}`);
        console.log(`Logged match result: ${matchResult}`);
    }

    getLogs(): string[] {
        return this.logs;
    }

    clearLogs(): void {
        this.logs = [];
        console.log(`Cleared all logs.`);
    }
}

export default MatchingLogService;
