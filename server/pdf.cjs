'use strict';
const { pipeline } = require('node:stream/promises');

function byteRange(value, size) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(value);
    if (!match || (!match[1] && !match[2])) return null;
    const first = match[1] ? Number(match[1]) : null, last = match[2] ? Number(match[2]) : null;
    if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
    if (first === null) return last > 0 && size > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null;
    if (first >= size || (last !== null && last < first)) return null;
    return { start: first, end: last === null ? size - 1 : Math.min(last, size - 1) };
}

// Serve the exact managed bytes. Both authorization and integrity validation
// happen before this function receives the opened file; no path comes from HTTP.
async function servePdf(req, res, { handle, size, id }) {
    try {
        const etag = '"sha256-' + id + '"';
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'private, no-store, no-transform');
        res.setHeader('Content-Encoding', 'identity');
        let range;
        if (req.method === 'GET' && req.headers.range && (!req.headers['if-range'] || req.headers['if-range'] === etag)) {
            range = byteRange(req.headers.range, size);
            if (!range) {
                res.writeHead(416, { 'Content-Range': 'bytes */' + size, 'Content-Length': '0' });
                res.end();
                return;
            }
        }
        const { start, end } = range || { start: 0, end: size - 1 };
        if (range) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.writeHead(range ? 206 : 200, { 'Content-Length': String(end - start + 1) });
        if (req.method === 'HEAD' || !size) { res.end(); return; }
        res.flushHeaders();
        await pipeline(handle.createReadStream({ start, end, autoClose: false }), res);
    } finally {
        await handle.close();
    }
}

module.exports = { servePdf, byteRange };
