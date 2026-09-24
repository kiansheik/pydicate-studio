'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { randomBytes, createHash } = require('node:crypto');
const { StringDecoder } = require('node:string_decoder');
const { MAX_PAYLOAD } = require('./scratch-service.cjs');
const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
function protocolError(id, code, message, data) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}
function toolResult(result) {
  if (
    Array.isArray(result?.content) &&
    result.content.every((item) => ['text', 'image'].includes(item.type))
  )
    return result;
  const images = result?.images ?? (result?.image ? [result.image] : []);
  const value = images.length
    ? { ...result, images: images.map(({ data, ...metadata }) => metadata) }
    : result;
  if (value && images.length) delete value.image;
  return {
    content: [
      { type: 'text', text: JSON.stringify(value) },
      ...images
        .filter((image) => image?.data && /^image\/(png|jpeg|webp)$/.test(image.mimeType))
        .map((image) => ({ type: 'image', data: image.data, mimeType: image.mimeType })),
    ],
    structuredContent:
      value && typeof value === 'object' && !Array.isArray(value) ? value : { result: value },
  };
}
function createStudioMcpGateway({
  stateDirectory,
  callTool,
  listTools,
  getGuide,
  isJobActive = async () => true,
}) {
  const scopes = new Map(),
    sockets = new Set();
  let server,
    ownerDirectory,
    socketPath,
    startPromise,
    ownsDiscovery = false;
  const discoveryPath = path.join(stateDirectory, 'mcp-owner.json');
  async function start() {
    if (startPromise) return startPromise;
    startPromise = (async () => {
      await fs.mkdir(stateDirectory, { recursive: true, mode: 0o700 });
      try {
        const previous = JSON.parse(await fs.readFile(discoveryPath, 'utf8'));
        if (Number.isSafeInteger(previous.pid)) {
          try {
            process.kill(previous.pid, 0);
            throw Object.assign(new Error('Another Studio MCP owner already holds this profile.'), {
              code: 'OWNER_ACTIVE',
            });
          } catch (error) {
            if (error.code !== 'ESRCH') throw error;
          }
        }
        await fs.unlink(discoveryPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      ownerDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'pydicate-mcp-'));
      await fs.chmod(ownerDirectory, 0o700);
      // Windows IPC endpoints are named pipes rather than filesystem sockets.
      // The random name is only an address: every request still requires the
      // existing per-attempt authentication token.
      socketPath =
        process.platform === 'win32'
          ? `\\\\.\\pipe\\pydicate-mcp-${process.pid}-${randomBytes(16).toString('hex')}`
          : path.join(ownerDirectory, 'owner.sock');
      server = net.createServer(onConnection);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(socketPath, resolve);
      });
      if (process.platform !== 'win32') await fs.chmod(socketPath, 0o600);
      try {
        await fs.writeFile(
          discoveryPath,
          JSON.stringify({
            version: 1,
            pid: process.pid,
            socketPath,
            startedAt: new Date().toISOString(),
            protocol: 'authenticated-local-mcp',
            scopesDirectory: path.join(stateDirectory, 'mcp-scopes'),
          }),
          { flag: 'wx', mode: 0o600 },
        );
        ownsDiscovery = true;
      } catch (error) {
        server.close();
        await fs.rm(ownerDirectory, { recursive: true, force: true });
        throw error;
      }
      return { discoveryPath, socketPath };
    })();
    return startPromise;
  }
  function onConnection(socket) {
    sockets.add(socket);
    const connectionId = randomBytes(16).toString('hex');
    const decoder = new StringDecoder('utf8');
    let buffer = '',
      initialized = false,
      scopedToken;
    const pending = new Map(),
      replies = new Map();
    function reply(message) {
      if (!socket.destroyed) socket.write(JSON.stringify(message) + '\n');
    }
    socket.on('error', () => {});
    socket.on('close', () => {
      sockets.delete(socket);
      for (const controller of pending.values()) controller.abort();
    });
    socket.on('data', (chunk) => {
      buffer += decoder.write(chunk);
      if (Buffer.byteLength(buffer) > MAX_PAYLOAD) {
        reply(protocolError(null, -32600, 'Request exceeds the payload limit.'));
        socket.end();
        return;
      }
      let index;
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);
        if (line.trim())
          void receive(line).catch((error) => {
            reply(protocolError(null, -32603, error.message));
          });
      }
    });
    async function receive(line) {
      let envelope;
      try {
        envelope = JSON.parse(line);
      } catch {
        reply(protocolError(null, -32700, 'Invalid JSON.'));
        return;
      }
      const message = envelope?.message,
        token = envelope?.token;
      const scope = typeof token === 'string' && scopes.get(token);
      if (!scope || (scopedToken && scopedToken !== token) || scope.expiresAt < Date.now()) {
        reply(protocolError(message?.id, -32001, 'MCP scope is invalid or expired.'));
        socket.end();
        return;
      }
      scopedToken = token;
      if (
        !message ||
        message.jsonrpc !== '2.0' ||
        typeof message.method !== 'string' ||
        (message.id !== undefined &&
          typeof message.id !== 'string' &&
          !Number.isSafeInteger(message.id))
      ) {
        reply(protocolError(message?.id, -32600, 'Invalid JSON-RPC request.'));
        return;
      }
      const notification = message.id === undefined;
      if (message.method === 'notifications/cancelled') {
        pending.get(JSON.stringify(message.params?.requestId))?.abort();
        return;
      }
      if (notification) return;
      if (!(await isJobActive(scope.jobId, scope.attemptId))) {
        reply(protocolError(message.id, -32002, 'The authoring attempt is no longer active.'));
        return;
      }
      const requestId = JSON.stringify(message.id),
        signature = JSON.stringify(message);
      const prior = replies.get(requestId);
      if (prior) {
        if (prior.signature !== signature)
          reply(protocolError(message.id, -32600, 'Request ID reused with different content.'));
        else reply(await prior.result);
        return;
      }
      const controller = new AbortController();
      pending.set(requestId, controller);
      scope.controllers.add(controller);
      scope.inFlight++;
      const result = (async () => {
        try {
          let value;
          if (message.method === 'initialize') {
            initialized = true;
            value = {
              protocolVersion: PROTOCOLS.includes(message.params?.protocolVersion)
                ? message.params.protocolVersion
                : PROTOCOLS[0],
              capabilities: {
                tools: { listChanged: false },
                resources: { subscribe: false, listChanged: false },
              },
              serverInfo: { name: 'pydicate-studio-authoring', version: '1.0.0' },
              instructions:
                'Use only the tools listed for this job. Read the studio://authoring/guide resource for its workflow. Publication and editorial approval are unavailable.',
            };
          } else {
            if (!initialized)
              return protocolError(message.id, -32000, 'Initialize MCP before making requests.');
            if (message.method === 'ping') value = {};
            else if (message.method === 'tools/list') {
              const all = await listTools(scope.jobId),
                cursor = message.params?.cursor ?? '0';
              if (!/^(0|[1-9]\d{0,5})$/.test(String(cursor)))
                return protocolError(message.id, -32602, 'Invalid tool cursor.');
              // Codex 0.153.4 imports only the first discovery page. This small,
              // fixed schema catalog must include edit/evaluate/propose together;
              // paginated research results remain separate tool calls.
              const offset = Number(cursor),
                size = all.length;
              value = {
                tools: all.slice(offset, offset + size),
                ...(offset + size < all.length ? { nextCursor: String(offset + size) } : {}),
              };
            } else if (message.method === 'resources/list')
              value = {
                resources: [
                  {
                    uri: 'studio://authoring/guide',
                    name: 'Pydicate authoring guide',
                    mimeType: 'text/plain',
                    description: 'Shared operation, evidence, review and persistence rules.',
                  },
                ],
              };
            else if (message.method === 'resources/read') {
              if (message.params?.uri !== 'studio://authoring/guide')
                return protocolError(message.id, -32602, 'Unknown resource.');
              value = {
                contents: [
                  {
                    uri: 'studio://authoring/guide',
                    mimeType: 'text/plain',
                    text: await getGuide(scope.jobId),
                  },
                ],
              };
            } else if (message.method === 'tools/call') {
              if (typeof message.params?.name !== 'string')
                return protocolError(message.id, -32602, 'Tool name is required.');
              const explicitOperationId = message.params?._meta?.['studio/operationId'];
              if (
                explicitOperationId !== undefined &&
                (typeof explicitOperationId !== 'string' ||
                  !explicitOperationId.trim() ||
                  explicitOperationId.length > 256)
              )
                return protocolError(message.id, -32602, 'Invalid Studio operation ID.');
              // JSON-RPC IDs belong to a connection. Unrelated clients commonly
              // both start at 1; they must not share a durable mutation receipt.
              // A caller can explicitly preserve command identity across reconnects.
              const operationKey =
                explicitOperationId === undefined
                  ? JSON.stringify(['connection', connectionId, requestId])
                  : JSON.stringify(['operation', explicitOperationId]);
              const operationId =
                `mcp:${scope.attemptId}:` +
                createHash('sha256').update(operationKey).digest('hex').slice(0, 24);
              try {
                const output = await callTool(
                  scope.jobId,
                  message.params.name,
                  message.params.arguments ?? {},
                  { attemptId: scope.attemptId, operationId, signal: controller.signal },
                );
                controller.signal.throwIfAborted();
                if (!scopes.has(token) || !(await isJobActive(scope.jobId, scope.attemptId)))
                  throw Object.assign(new Error('The attempt ended before the tool completed.'), {
                    code: 'JOB_INACTIVE',
                  });
                value = toolResult(output);
              } catch (error) {
                value = {
                  isError: true,
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        code:
                          error.code ??
                          (controller.signal.aborted ? 'CANCELLED' : 'AUTHORING_ERROR'),
                        message: error.message,
                      }),
                    },
                  ],
                };
              }
            } else return protocolError(message.id, -32601, 'MCP method is not available.');
          }
          if (Buffer.byteLength(JSON.stringify(value)) > MAX_PAYLOAD)
            return protocolError(message.id, -32003, 'Result exceeds the bounded MCP payload.');
          return { jsonrpc: '2.0', id: message.id, result: value };
        } catch (error) {
          return protocolError(message.id, -32603, error.message);
        } finally {
          pending.delete(requestId);
          scope.controllers.delete(controller);
        }
      })();
      replies.set(requestId, { signature, result });
      // Requests and results are also durably idempotent in the owner queue.
      if (replies.size > 32) replies.delete(replies.keys().next().value);
      reply(await result);
      scope.inFlight--;
      if (!scope.inFlight) {
        for (const resolve of scope.idleWaiters) resolve();
        scope.idleWaiters.clear();
      }
    }
  }
  async function openScope({ jobId, attemptId, expiresInMs = 30 * 60_000 }) {
    await start();
    if (typeof jobId !== 'string' || typeof attemptId !== 'string' || !jobId || !attemptId)
      throw new Error('A job and execution attempt are required for MCP.');
    if (!(await isJobActive(jobId, attemptId)))
      throw new Error('The requested authoring attempt is inactive.');
    for (const current of [...scopes.values()]) {
      if (current.jobId === jobId && current.attemptId === attemptId) await current.revoke();
    }
    const token = randomBytes(32).toString('hex'),
      controllers = new Set();
    const scope = {
      jobId,
      attemptId,
      expiresAt: Date.now() + Math.max(1000, Math.min(24 * 60 * 60_000, expiresInMs)),
      controllers,
      inFlight: 0,
      idleWaiters: new Set(),
    };
    scopes.set(token, scope);
    const directory = path.join(stateDirectory, 'mcp-scopes');
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const configPath = path.join(
      directory,
      createHash('sha256')
        .update(jobId + ':' + attemptId)
        .digest('hex')
        .slice(0, 32) + '.json',
    );
    const descriptor = {
      name: 'studio_authoring',
      jobId,
      attemptId,
      expiresAt: new Date(scope.expiresAt).toISOString(),
      command: process.execPath,
      args: [path.join(__dirname, 'studio-mcp-stdio.cjs')],
      env: { STUDIO_MCP_SOCKET: socketPath, STUDIO_MCP_TOKEN: token, ELECTRON_RUN_AS_NODE: '1' },
      toolNames: (await listTools(jobId)).map((tool) => tool.name),
      configPath,
    };
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            studio_authoring: {
              command: descriptor.command,
              args: descriptor.args,
              env: descriptor.env,
            },
          },
          jobId,
          attemptId,
          expiresAt: new Date(scope.expiresAt).toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    await fs.chmod(configPath, 0o600);
    let revoked = false;
    const revoke = async () => {
      if (revoked) return;
      revoked = true;
      scopes.delete(token);
      for (const controller of controllers) controller.abort();
      await fs.rm(configPath, { force: true });
    };
    scope.revoke = revoke;
    return {
      ...descriptor,
      close: revoke,
      revoke,
      waitForIdle: () =>
        scope.inFlight === 0
          ? Promise.resolve()
          : new Promise((resolve) => scope.idleWaiters.add(resolve)),
    };
  }
  async function close() {
    for (const scope of [...scopes.values()]) await scope.revoke();
    for (const socket of sockets) socket.destroy();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    if (ownerDirectory) await fs.rm(ownerDirectory, { recursive: true, force: true });
    if (ownsDiscovery) {
      await fs.rm(discoveryPath, { force: true });
      ownsDiscovery = false;
    }
  }
  return { start, openScope, close, discoveryPath };
}
module.exports = { createStudioMcpGateway, toolResult, PROTOCOLS };
