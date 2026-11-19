// Small helpers for reading JSON requests and sending JSON errors/responses.
export function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, 'cache-control': 'no-store' });
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
