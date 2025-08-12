// Si el QR ya trae JSON válido → lo parsea.
// Si trae "a=1&b=2" o "a:1,b:2" → lo convierte.
// Si es texto plano → lo guarda como { value: "..."}.

export function isJSONLike(str) {
  if (typeof str !== 'string') return false;
  const s = str.trim();
  return (s.startsWith('{') && s.endsWith('}')) ||
         (s.startsWith('[') && s.endsWith(']'));
}

export function normalizeQRContent(raw) {
  const s = (raw || '').trim();
  if (!s) return {};

  // 1) JSON directo
  if (isJSONLike(s)) return s;

  // 2) Intentar URL o querystring
  try {
    // ¿Es URL? → usar sus searchParams
    if (/^https?:\/\//i.test(s)) {
      const url = new URL(s);
      const obj = Object.fromEntries(url.searchParams.entries());
      if (Object.keys(obj).length) return obj;
      // Si no hay params, guarda la URL
      return { url: s };
    }
  } catch { /* ignore */ }

  // 3) key=value&key2=value2
  if (s.includes('=') && s.includes('&')) {
    const obj = {};
    s.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) obj[decodeURIComponent(k.trim())] = decodeURIComponent((v||'').trim());
    });
    if (Object.keys(obj).length) return obj;
  }

  // 4) "a:1, b:2" o "a=1, b=2"
  if (s.includes(':') || s.includes('=')) {
    const obj = {};
    s.split(',').forEach(part => {
      const [k, v] = part.split(/[:=]/);
      if (k && v !== undefined) obj[k.trim()] = v.trim();
    });
    if (Object.keys(obj).length) return obj;
  }

  // 5) texto plano
  return { value: s };
}

export function toJSON(normalized) {
  // Si es string JSON → parsear
  if (typeof normalized === 'string') {
    try { return JSON.parse(normalized); } catch {}
  }
  // Si ya es objeto → retornar
  if (normalized && typeof normalized === 'object') return normalized;

  // Fallback
  return { value: String(normalized ?? '') };
}

export function toCSVLine(obj) {
  // Convierte un objeto a una línea CSV clave/valor simple
  if (!obj || typeof obj !== 'object') return `"value","${String(obj).replaceAll('"','""')}"`;
  const entries = Object.entries(obj);
  const headers = entries.map(([k]) => `"${k.replaceAll('"','""')}"`).join(',');
  const values  = entries.map(([,v]) => `"${String(v ?? '').replaceAll('"','""')}"`).join(',');
  return `${headers}\n${values}`;
}
