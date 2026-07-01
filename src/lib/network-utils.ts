/**
 * Checks if a hostname or IP address belongs to a private network range (RFC 1918).
 */
export function isPrivateIP(hostname: string): boolean {
    const parts = hostname.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 4 || parts.some(isNaN)) return false;

    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 10.0.0.0/8 (Private)
    if (parts[0] === 10) return true;
    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 169.254.0.0/16 (Link-local/Metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;

    return false;
}

export function isSafeURL(raw: string): boolean {
    try {
        const url = new URL(raw);
        // Only allow HTTP/HTTPS
        if (!['http:', 'https:'].includes(url.protocol)) return false;

        const hostname = url.hostname.toLowerCase();
        const blocklist = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254'];
        if (blocklist.includes(hostname)) return false;

        if (isPrivateIP(hostname)) return false;

        return true;
    } catch {
        return false;
    }
}
