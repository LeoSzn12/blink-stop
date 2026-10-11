import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

export async function serveBuiltWeb() {
    const types = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css',
        json: 'application/json', wasm: 'application/wasm', png: 'image/png', txt: 'text/plain' };
    const server = createServer(async (req, res) => {
        try {
            const pathname = new URL(req.url, 'http://localhost').pathname;
            const file = pathname === '/' ? 'index.html' : pathname.slice(1);
            if (file.includes('..')) throw new Error('Invalid path');
            const body = await readFile(new URL(`../../www/${file}`, import.meta.url));
            res.writeHead(200, { 'Content-Type': types[file.split('.').at(-1)] || 'application/octet-stream' });
            res.end(body);
        } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { url: `http://127.0.0.1:${server.address().port}/`,
        close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
