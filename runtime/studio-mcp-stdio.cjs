#!/usr/bin/env node
'use strict';
// This shim is deliberately not an authoring worker. All requests go to the
// existing profile owner over its authenticated, job-scoped local socket.
const net = require('node:net');
const { StringDecoder } = require('node:string_decoder');
const MAX_BYTES = 900_000;
const socketPath = process.env.STUDIO_MCP_SOCKET,
  token = process.env.STUDIO_MCP_TOKEN;
if (!socketPath || !/^[a-f0-9]{64}$/.test(token ?? '')) {
  process.stderr.write('A scoped Studio MCP connection is required.\n');
  process.exit(1);
}
const socket = net.createConnection(socketPath);
let buffer = '';
const decoder = new StringDecoder('utf8');
process.stdin.on('data', (chunk) => {
  buffer += decoder.write(chunk);
  if (Buffer.byteLength(buffer) > MAX_BYTES) {
    process.stderr.write('MCP input exceeds the limit.\n');
    socket.destroy();
    process.exitCode = 1;
    process.stdin.destroy();
    return;
  }
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Invalid JSON.' },
        }) + '\n',
      );
      continue;
    }
    if (!socket.write(JSON.stringify({ token, message }) + '\n')) process.stdin.pause();
  }
});
socket.on('drain', () => process.stdin.resume());
socket.on('data', (chunk) => {
  if (!process.stdout.write(chunk)) socket.pause();
});
process.stdout.on('drain', () => socket.resume());
process.stdin.on('end', () => socket.end());
socket.on('end', () => {
  process.stdin.destroy();
});
socket.on('error', () => {
  process.stderr.write(
    'The Studio owner is unavailable or the scope has ended. Reopen Studio and obtain a fresh scoped configuration.\n',
  );
  process.exitCode = 1;
  process.stdin.destroy();
});
process.on('SIGTERM', () => {
  socket.destroy();
  process.stdin.destroy();
});
