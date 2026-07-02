import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../src/server/server.js';
import { ConfigStore, loadConfig } from '../src/config/config.js';
import type { Container } from '../src/server/container.js';

describe('MCP server (end-to-end over in-memory transport)', () => {
  let client: Client;
  let container: Container;
  let dir: string;

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'medium-e2e-'));
    const configStore = new ConfigStore(loadConfig({ MEDIUM_DATA_DIR: dir, MEDIUM_LOG_LEVEL: 'error' }));
    const built = buildServer(configStore);
    container = built.container;

    client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([built.server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterAll(async () => {
    container.scheduler.stop();
    await client.close();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('advertises a rich tool set', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain('create_article');
    expect(names).toContain('publish_article');
    expect(names).toContain('save_draft');
    expect(names).toContain('analyze_seo');
    expect(tools.length).toBeGreaterThan(40);
  });

  it('exposes prompts and resources', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain('write_technical_tutorial');
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri)).toContain('medium://templates');
  });

  it('runs a deterministic tool (fix_markdown)', async () => {
    const res = await client.callTool({
      name: 'fix_markdown',
      arguments: { markdown: '##Heading\n\ntext' },
    });
    const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain('## Heading');
  });

  it('saves and retrieves a draft round-trip', async () => {
    const save = await client.callTool({
      name: 'save_draft',
      arguments: { title: 'Round Trip', markdown: 'Hello world, this is a body.' },
    });
    const saved = (save.structuredContent as { data: { id: string } }).data;
    expect(saved.id).toBeTruthy();

    const list = await client.callTool({ name: 'list_drafts', arguments: {} });
    const data = (list.structuredContent as { data: { count: number } }).data;
    expect(data.count).toBeGreaterThanOrEqual(1);
  });

  it('returns a structured error for a missing article', async () => {
    const res = await client.callTool({ name: 'get_article', arguments: { id: 'nope' } });
    expect(res.isError).toBe(true);
  });
});
