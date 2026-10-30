import { useState, useEffect, useCallback, useMemo } from 'react';
import * as client from './client.js';

const STORAGE_KEY = 'vs:counsel';

function readStoredCounsel() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStoredCounsel(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function useCounsel({ say } = {}) {
  const [serverStatus, setServerStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [connections, setConnections] = useState([]);
  const [roles, setRoles] = useState({
    paksh: { connectionId: null, model: null },
    vipaksh: { connectionId: null, model: null },
    judge: { connectionId: null, model: null },
  });
  const [knownConnections, setKnownConnections] = useState([]);

  // Load initial state from localStorage
  useEffect(() => {
    const stored = readStoredCounsel();
    if (stored) {
      if (stored.roles) setRoles((r) => ({ ...r, ...stored.roles }));
      if (Array.isArray(stored.knownConnections)) setKnownConnections(stored.knownConnections);
    }
  }, []);

  // Save to localStorage whenever roles or knownConnections change
  const persist = useCallback((nextRoles, nextKnown) => {
    writeStoredCounsel({
      version: 1,
      roles: nextRoles,
      knownConnections: nextKnown,
    });
  }, []);

  // Sync with server
  const syncWithServer = useCallback(async () => {
    setServerStatus('checking');
    const health = await client.checkHealth();
    if (!health.ok) {
      setServerStatus('offline');
      return;
    }
    setServerStatus('online');

    try {
      const [serverConns, serverRoles] = await Promise.all([
        client.fetchConnections(),
        client.fetchRoles(),
      ]);

      setConnections(serverConns);

      // Merge server roles with local remembered roles
      setRoles((prevLocal) => {
        const nextRoles = { ...prevLocal };
        for (const r of ['paksh', 'vipaksh', 'judge']) {
          // If server already has a role configured, use it
          if (serverRoles[r]?.connectionId) {
            nextRoles[r] = serverRoles[r];
          } else if (nextRoles[r]?.connectionId) {
            // Check if local connection still exists on server
            const exists = serverConns.find((c) => c.id === nextRoles[r].connectionId && c.status === 'verified');
            if (exists) {
              // Sync local role up to server
              client.updateRole(r, nextRoles[r]).catch(() => {});
            }
          }
        }
        return nextRoles;
      });

      // Update known connections with server list
      setKnownConnections((prevKnown) => {
        const map = new Map(prevKnown.map((k) => [k.id, k]));
        for (const c of serverConns) {
          map.set(c.id, {
            id: c.id,
            provider: c.provider,
            label: c.label,
            keyHint: c.keyHint,
            source: c.source,
          });
        }
        return Array.from(map.values());
      });
    } catch {
      setServerStatus('offline');
    }
  }, []);

  useEffect(() => {
    syncWithServer();
  }, [syncWithServer]);

  // Add connection
  const addConnection = useCallback(async ({ provider, key, label }) => {
    const res = await client.createConnection({ provider, key, label });
    const conn = res.connection;

    setConnections((prev) => {
      const exists = prev.some((c) => c.id === conn.id);
      return exists ? prev.map((c) => (c.id === conn.id ? conn : c)) : [...prev, conn];
    });

    setKnownConnections((prev) => {
      const next = [...prev.filter((c) => c.id !== conn.id), {
        id: conn.id,
        provider: conn.provider,
        label: conn.label,
        keyHint: conn.keyHint,
        source: conn.source,
      }];
      persist(roles, next);
      return next;
    });

    return res;
  }, [roles, persist]);

  // Re-verify connection
  const verifyConnection = useCallback(async (id) => {
    const updated = await client.reverifyConnection(id);
    setConnections((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  // Remove connection
  const removeConnection = useCallback(async (id) => {
    const res = await client.deleteConnection(id);
    setConnections((prev) => prev.filter((c) => c.id !== id));

    let nextRoles = { ...roles };
    if (Array.isArray(res.unassignedRoles)) {
      for (const r of res.unassignedRoles) {
        nextRoles[r] = { connectionId: null, model: null };
      }
    }
    setRoles(nextRoles);

    const nextKnown = knownConnections.filter((c) => c.id !== id);
    setKnownConnections(nextKnown);
    persist(nextRoles, nextKnown);

    return res;
  }, [roles, knownConnections, persist]);

  // Assign role
  const assignRole = useCallback(async (role, { connectionId, model }) => {
    const nextRole = await client.updateRole(role, { connectionId, model });
    setRoles((prev) => {
      const next = { ...prev, [role]: nextRole };
      persist(next, knownConnections);
      return next;
    });
    return nextRole;
  }, [knownConnections, persist]);

  // Test role
  const testRole = useCallback(async (role) => {
    try {
      return await client.testRole(role);
    } catch (err) {
      if (err.status === 401 || err.code === 'invalid_key') {
        // Refresh connections as one just failed
        client.fetchConnections().then(setConnections).catch(() => {});
      }
      throw err;
    }
  }, []);

  // Copy role choice to all other roles
  const copyRoleToAll = useCallback(async (sourceRole) => {
    const src = roles[sourceRole];
    if (!src?.connectionId || !src?.model) return;
    const targetRoles = ['paksh', 'vipaksh', 'judge'].filter((r) => r !== sourceRole);
    for (const r of targetRoles) {
      await assignRole(r, { connectionId: src.connectionId, model: src.model });
    }
  }, [roles, assignRole]);

  // Clear all roles
  const clearAllRoles = useCallback(async () => {
    for (const r of ['paksh', 'vipaksh', 'judge']) {
      await assignRole(r, { connectionId: null, model: null });
    }
  }, [assignRole]);

  // Ready count & failed state
  const { readyCount, hasFailed } = useMemo(() => {
    let ready = 0;
    let failed = false;

    const connMap = new Map(connections.map((c) => [c.id, c]));

    for (const r of ['paksh', 'vipaksh', 'judge']) {
      const assign = roles[r];
      if (assign?.connectionId) {
        const conn = connMap.get(assign.connectionId);
        if (conn?.status === 'verified' && assign.model) {
          ready++;
        } else if (conn?.status === 'failed') {
          failed = true;
        }
      }
    }

    return { readyCount: ready, hasFailed: failed };
  }, [roles, connections]);

  return {
    serverStatus,
    connections,
    roles,
    knownConnections,
    readyCount,
    hasFailed,
    syncWithServer,
    addConnection,
    verifyConnection,
    removeConnection,
    assignRole,
    testRole,
    copyRoleToAll,
    clearAllRoles,
  };
}
