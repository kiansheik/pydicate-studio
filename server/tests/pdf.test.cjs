'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { servePdf } = require('../pdf.cjs');

test('PDF range streaming closes handles after a partial response and a cancelled full download', { timeout: 10000 }, async t => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-pdf-stream-'));
    const filename = path.join(directory, 'scan.pdf'), bytes = Buffer.alloc(16 * 1024 * 1024, 73);
    bytes.write('%PDF-1.4\n');
    await fs.writeFile(filename, bytes);
    const handles = [], errors = [], transfers = [];
    const server = http.createServer(async (req, res) => {
        const handle = await fs.open(filename, 'r');
        handles.push(handle);
        const transfer = servePdf(req, res, { handle, size: bytes.length, id: 'a'.repeat(64) })
            .catch(error => { errors.push(error.code); });
        transfers.push(transfer);
        await transfer;
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
    const url = 'http://127.0.0.1:' + server.address().port;
    const range = await fetch(url, { headers: { Range: 'bytes=0-8' } });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), '%PDF-1.4\n');
    const whole = await fetch(url), reader = whole.body.getReader();
    const first = await reader.read();
    assert.ok(first.value.byteLength < bytes.length, 'stream returns initial data before the whole scan');
    await reader.cancel();
    for (let attempt = 0; attempt < 100 && handles.some(handle => handle.fd !== -1); attempt++)
        await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(handles.every(handle => handle.fd === -1), 'all file handles closed, including cancellation');
    // Closing the descriptor happens in finally, before the caller observes the
    // rejected pipeline. Wait for that observation instead of racing its catch.
    await Promise.all(transfers);
    assert.deepEqual(errors, ['ERR_STREAM_PREMATURE_CLOSE']);
});
