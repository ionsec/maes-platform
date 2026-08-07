// Detect an IOC's type from its value. Used for the "auto detect" lookup path.
export function detectIocType(value) {
  const v = (value || '').trim();
  if (!v) return 'ip';

  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) {
    return 'ip';
  }
  // IPv6 (contains colons, has hex)
  if (v.includes(':') && /^[0-9a-fA-F:]+$/.test(v)) {
    return 'ip';
  }
  // File hash: MD5 (32), SHA-1 (40), SHA-256 (64) hex
  if (/^[0-9a-fA-F]{32}$/.test(v) ||
      /^[0-9a-fA-F]{40}$/.test(v) ||
      /^[0-9a-fA-F]{64}$/.test(v)) {
    return 'hash';
  }
  // Domain/hostname
  if (/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(v)) {
    return 'domain';
  }
  return 'ip';
}
