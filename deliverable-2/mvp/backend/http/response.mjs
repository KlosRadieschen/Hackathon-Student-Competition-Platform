// Small helpers for reading JSON requests and sending JSON errors/responses.

// Security headers sent on every response. The CSP allows only same-origin scripts and styles,
// so injected inline scripts and event-handler attributes (onerror=...) are refused by the browser.
export const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
};

export function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, 'cache-control': 'no-store' });
  res.end(data);
}

export function sendError(res, error) {
  const status = Number(error?.status || 500);
  sendJson(res, status, { error: error?.code || 'INTERNAL_ERROR', message: status >= 500 ? 'Internal server error' : String(error?.message || 'Request failed') });
}

export async function readJson(req, limit = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Request body too large'), { status: 413, code: 'BODY_TOO_LARGE' });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400, code: 'INVALID_JSON' }); }
}
