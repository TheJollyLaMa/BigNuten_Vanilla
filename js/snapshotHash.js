export async function computeSnapshotHash(data) {
  const canonical = JSON.stringify(sortKeys(data));
  const encoded = new TextEncoder().encode(canonical);
  const buf = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map(k => [k, sortKeys(value[k])])
    );
  }
  return value;
}

