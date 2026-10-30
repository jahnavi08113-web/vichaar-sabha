import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getAdapter } from './providers/index.mjs';
import { TIMEOUTS } from './providers/config.mjs';

export function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) continue;
      const k = line.slice(0, eqIdx).trim();
      let v = line.slice(eqIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  } catch (err) {
    // Ignore read errors
  }
}

export class ConnectionManager {
  constructor({ fake = false } = {}) {
    this.fake = fake;
    this.connections = new Map();
    this.roles = {
      paksh: { connectionId: null, model: null },
      vipaksh: { connectionId: null, model: null },
      judge: { connectionId: null, model: null },
    };
  }

  hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  makeKeyHint(key) {
    const clean = (key || '').trim();
    if (clean.length <= 4) return '••••' + clean;
    return '••••' + clean.slice(-4);
  }

  sanitize(conn) {
    if (!conn) return null;
    return {
      id: conn.id,
      provider: conn.provider,
      label: conn.label || null,
      keyHint: conn.keyHint,
      source: conn.source,
      status: conn.status,
      verifiedAt: conn.verifiedAt || null,
      models: conn.models || [],
      error: conn.error || null,
    };
  }

  getConnections() {
    return Array.from(this.connections.values()).map((c) => this.sanitize(c));
  }

  getConnection(id) {
    return this.connections.get(id) || null;
  }

  async addConnection({ provider, key, label }) {
    const cleanKey = (key || '').trim();
    if (!cleanKey) {
      return { ok: false, error: { code: 'invalid_key', message: 'API key cannot be empty.' } };
    }

    const keyHash = this.hashKey(cleanKey);

    // Duplicate key check: reuse existing connection if key matches for same provider
    for (const existing of this.connections.values()) {
      if (existing.provider === provider && existing.keyHash === keyHash) {
        return {
          ok: true,
          reused: true,
          connection: this.sanitize(existing),
        };
      }
    }

    // Verify key with adapter
    const adapter = getAdapter(provider, { fake: this.fake });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.verifyMs);

    let verifyResult;
    try {
      verifyResult = await adapter.verify(cleanKey, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (!verifyResult.ok) {
      return { ok: false, error: verifyResult.error };
    }

    const id = crypto.randomUUID();
    const conn = {
      id,
      provider,
      key: cleanKey,
      keyHash,
      label: (label || '').trim() || null,
      keyHint: this.makeKeyHint(cleanKey),
      source: 'session',
      status: 'verified',
      verifiedAt: Date.now(),
      models: verifyResult.models || [],
      error: null,
    };

    this.connections.set(id, conn);
    return {
      ok: true,
      reused: false,
      connection: this.sanitize(conn),
    };
  }

  async verifyConnection(id) {
    const conn = this.connections.get(id);
    if (!conn) {
      return { ok: false, error: { code: 'not_found', message: 'Connection not found.' } };
    }

    const adapter = getAdapter(conn.provider, { fake: this.fake });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUTS.verifyMs);

    let verifyResult;
    try {
      verifyResult = await adapter.verify(conn.key, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    if (verifyResult.ok) {
      conn.status = 'verified';
      conn.verifiedAt = Date.now();
      conn.models = verifyResult.models || [];
      conn.error = null;
    } else {
      conn.status = 'failed';
      conn.error = verifyResult.error;
    }

    return { ok: true, connection: this.sanitize(conn) };
  }

  deleteConnection(id) {
    const conn = this.connections.get(id);
    if (!conn) {
      return { ok: false, error: { code: 'not_found', message: 'Connection not found.' } };
    }

    if (conn.source === 'env') {
      return { ok: false, error: { code: 'forbidden', message: 'Environment keys cannot be removed from the UI.' } };
    }

    this.connections.delete(id);

    // Unassign roles using this connection
    const unassignedRoles = [];
    for (const [roleName, roleData] of Object.entries(this.roles)) {
      if (roleData.connectionId === id) {
        this.roles[roleName] = { connectionId: null, model: null };
        unassignedRoles.push(roleName);
      }
    }

    return { ok: true, unassignedRoles };
  }

  getRoles() {
    return { ...this.roles };
  }

  assignRole(role, { connectionId, model }) {
    if (!['paksh', 'vipaksh', 'judge'].includes(role)) {
      return { ok: false, error: { code: 'invalid_role', message: 'Invalid role.' } };
    }

    if (connectionId == null && model == null) {
      this.roles[role] = { connectionId: null, model: null };
      return { ok: true, role: this.roles[role] };
    }

    const conn = this.connections.get(connectionId);
    if (!conn) {
      return { ok: false, error: { code: 'not_found', message: 'Connection not found.' } };
    }

    if (conn.status !== 'verified') {
      return { ok: false, error: { code: 'not_verified', message: 'Connection is not verified.' } };
    }

    let cleanModel = (model || '').trim();
    if (cleanModel === 'gemini-flash-3.8') {
      cleanModel = 'gemini-3.8-flash';
    }
    if (!cleanModel) {
      return { ok: false, error: { code: 'missing_model', message: 'Model is required.' } };
    }

    this.roles[role] = { connectionId, model: cleanModel };
    return { ok: true, role: this.roles[role] };
  }

  markConnectionFailed(id, error) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.status = 'failed';
      conn.error = error;
    }
  }

  async initEnvironmentKeys() {
    const envMap = {
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
      gemini: process.env.GEMINI_API_KEY,
      xai: process.env.XAI_API_KEY,
      groq: process.env.GROQ_API_KEY,
    };

    const verifyPromises = [];

    for (const [provider, rawKey] of Object.entries(envMap)) {
      const key = (rawKey || '').trim();
      if (!key) continue;

      const id = `env-${provider}`;
      const conn = {
        id,
        provider,
        key,
        keyHash: this.hashKey(key),
        label: 'Environment',
        keyHint: this.makeKeyHint(key),
        source: 'env',
        status: 'verifying',
        verifiedAt: null,
        models: [],
        error: null,
      };

      this.connections.set(id, conn);

      // Verify and auto-assign any configured roles
      const p = this.verifyConnection(id).then((res) => {
        for (const role of ['paksh', 'vipaksh', 'judge']) {
          const connEnv = process.env[`${role.toUpperCase()}_CONNECTION`];
          let modelEnv = process.env[`${role.toUpperCase()}_MODEL`];
          if (connEnv === id && modelEnv && res.ok && res.connection?.status === 'verified') {
            if (modelEnv === 'gemini-flash-3.8') modelEnv = 'gemini-3.8-flash';
            this.roles[role] = { connectionId: id, model: modelEnv };
          }
        }
        return res;
      }).catch(() => {});

      verifyPromises.push(p);
    }

    await Promise.allSettled(verifyPromises);
    return this.getConnections();
  }
}
