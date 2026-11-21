const TOKEN_KEY = 'hackathon-token';
export const session = {
    get token() { return localStorage.getItem(TOKEN_KEY) || ''; },
    set token(v) { if (v)
        localStorage.setItem(TOKEN_KEY, v);
    else
        localStorage.removeItem(TOKEN_KEY); },
    clear() { localStorage.removeItem(TOKEN_KEY); }
};
export async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (session.token)
        headers.set('Authorization', `Bearer ${session.token}`);
    if (options.body && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');
    const res = await fetch(path, { ...options, headers });
    const type = res.headers.get('content-type') || '';
    const body = type.includes('application/json') ? await res.json() : await res.text();
    if (!res.ok)
        throw new Error(body?.message || `Request failed (${res.status})`);
    return body;
}
// Escape user-supplied text before inserting it into HTML templates.
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
// Allow only absolute http(s) links in href attributes; anything else (e.g. javascript:) becomes '#'.
export function safeUrl(value) {
    try {
        const url = new URL(String(value ?? ''));
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '#';
    }
    catch {
        return '#';
    }
}
export async function fileToBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}
