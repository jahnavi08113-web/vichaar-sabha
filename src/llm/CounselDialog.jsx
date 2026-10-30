import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { PROVIDERS, PROVIDER_MAP } from './providers.js';
import { Icon, Seal } from '../icons.jsx';

function timeAgo(ms) {
  if (!ms) return '';
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}

function RoleCard({
  role,
  roleName,
  roleTitle,
  assigned,
  connections,
  knownConnections,
  onAssign,
  onAddConnection,
  onTest,
  isTargetRole,
  say,
}) {
  const cardRef = useRef(null);

  // Derive current connection if assigned
  const currentConn = useMemo(() => {
    if (!assigned?.connectionId) return null;
    return connections.find((c) => c.id === assigned.connectionId) || null;
  }, [assigned?.connectionId, connections]);

  // Selected provider: default to current connection's provider or 'anthropic'
  const [selectedProvider, setSelectedProvider] = useState(() => currentConn?.provider || 'anthropic');
  const [useDifferentKey, setUseDifferentKey] = useState(false);
  const [selectedConnId, setSelectedConnId] = useState(() => assigned?.connectionId || null);

  // Key form state
  const [keyInput, setKeyInput] = useState('');
  const [labelInput, setLabelInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  // Model selection state
  const [customModel, setCustomModel] = useState('');
  const [isCustomModel, setIsCustomModel] = useState(false);

  // Test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testError, setTestError] = useState(null);

  // Sync state if assigned role changes
  useEffect(() => {
    if (currentConn) {
      setSelectedProvider(currentConn.provider);
      setSelectedConnId(currentConn.id);
      setUseDifferentKey(false);
    }
  }, [currentConn]);

  // Scroll into view if opened focused on this role
  useEffect(() => {
    if (isTargetRole && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [isTargetRole]);

  // Verified connections available for the selected provider
  const providerConns = useMemo(() => {
    return connections.filter((c) => c.provider === selectedProvider && c.status === 'verified');
  }, [connections, selectedProvider]);

  // When provider changes, select the most recently verified connection if available
  useEffect(() => {
    if (providerConns.length > 0 && !useDifferentKey) {
      const sorted = [...providerConns].sort((a, b) => (b.verifiedAt || 0) - (a.verifiedAt || 0));
      const target = sorted[0];
      setSelectedConnId(target.id);
      // Auto assign if not already assigned to this connection
      if (assigned?.connectionId !== target.id) {
        const defaultModel = target.models[0]?.id || '';
        onAssign(role, { connectionId: target.id, model: defaultModel });
      }
    } else if (providerConns.length === 0) {
      setSelectedConnId(null);
    }
    setVerifyError(null);
  }, [selectedProvider, providerConns.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Determine role card status
  const cardStatus = useMemo(() => {
    if (!assigned?.connectionId) return { label: 'Not set', class: 'is-not-set' };
    if (!currentConn) return { label: 'Needs key', class: 'is-needs-key' };
    if (currentConn.status === 'failed') return { label: 'Key failed', class: 'is-failed' };
    if (currentConn.status === 'verified' && assigned.model) return { label: 'Ready', class: 'is-ready' };
    return { label: 'Needs key', class: 'is-needs-key' };
  }, [assigned, currentConn]);

  // Verify submit
  const handleVerify = async (e) => {
    e?.preventDefault();
    const clean = keyInput.trim();
    if (!clean || verifying) return;

    setVerifying(true);
    setVerifyError(null);

    try {
      const res = await onAddConnection({
        provider: selectedProvider,
        key: clean,
        label: labelInput.trim() || undefined,
      });

      if (res.reused) {
        say?.('That key is already connected — using it.');
      } else {
        const provMeta = PROVIDER_MAP[selectedProvider];
        say?.(`${provMeta.name} key verified · ${res.connection.keyHint}`);
      }

      setKeyInput('');
      setLabelInput('');
      setUseDifferentKey(false);
      setSelectedConnId(res.connection.id);

      const defaultModel = res.connection.models[0]?.id || '';
      await onAssign(role, { connectionId: res.connection.id, model: defaultModel });
    } catch (err) {
      setVerifyError(err.message || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  // Model change
  const handleModelChange = async (e) => {
    const val = e.target.value;
    if (val === '__custom__') {
      setIsCustomModel(true);
      return;
    }
    setIsCustomModel(false);
    if (selectedConnId) {
      await onAssign(role, { connectionId: selectedConnId, model: val });
    }
  };

  const handleCustomModelSubmit = async () => {
    const val = customModel.trim();
    if (val && selectedConnId) {
      await onAssign(role, { connectionId: selectedConnId, model: val });
    }
  };

  // Run test
  const handleTest = async () => {
    setTesting(true);
    setTestError(null);
    setTestResult(null);

    try {
      const res = await onTest(role);
      setTestResult(res);
    } catch (err) {
      setTestError(err.message || 'Test failed.');
    } finally {
      setTesting(false);
    }
  };

  const provMeta = PROVIDER_MAP[selectedProvider] || PROVIDERS[0];
  const activeConn = connections.find((c) => c.id === selectedConnId);

  return (
    <article ref={cardRef} className={`counsel-card counsel-card-${role}`} aria-label={`${roleName} counsel setup`}>
      <header className="counsel-card-head">
        <div className="counsel-role-info">
          <Seal role={role} size={28} />
          <div>
            <h3 className="counsel-role-name">{roleName}</h3>
            <p className="counsel-role-title">{roleTitle}</p>
          </div>
        </div>
        <span className={`status-chip ${cardStatus.class}`} aria-hidden="true">
          {cardStatus.label}
        </span>
        <span className="sr-only" aria-live="polite">
          {roleName} status: {cardStatus.label}
        </span>
      </header>

      {/* Step 1: Provider selection */}
      <div>
        <label className="counsel-section-label">Provider</label>
        <div className="provider-radiogroup" role="radiogroup" aria-label={`${roleName} model provider`}>
          {PROVIDERS.map((p) => {
            const isSelected = selectedProvider === p.id;
            const hasVerified = connections.some((c) => c.provider === p.id && c.status === 'verified');
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`provider-btn ${isSelected ? 'is-active' : ''}`}
                onClick={() => {
                  setSelectedProvider(p.id);
                  setUseDifferentKey(false);
                  setKeyInput('');
                  setVerifyError(null);
                }}
              >
                <div className="provider-btn-top">
                  <span className="provider-btn-name">{p.name}</span>
                  {hasVerified && <span className="provider-btn-dot" title="Connection ready" />}
                </div>
                <span className="provider-btn-sub">{p.company}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step 2: Connection Selection or Key Form */}
      <div>
        <label className="counsel-section-label">Connection</label>
        {providerConns.length > 0 && !useDifferentKey ? (
          <div className="conn-picker">
            {providerConns.map((c) => {
              const isChosen = selectedConnId === c.id;
              // Check what other roles use this
              const otherRoles = ['paksh', 'vipaksh', 'judge']
                .filter((r) => r !== role)
                .map((r) => (r === 'paksh' ? 'Paksh' : r === 'vipaksh' ? 'Vipaksh' : 'Judge'));
              const verifiedTime = timeAgo(c.verifiedAt);

              return (
                <button
                  key={c.id}
                  type="button"
                  className={`conn-row ${isChosen ? 'is-selected' : ''}`}
                  onClick={async () => {
                    setSelectedConnId(c.id);
                    const defaultModel = c.models[0]?.id || '';
                    await onAssign(role, { connectionId: c.id, model: defaultModel });
                  }}
                >
                  <span className="conn-check">{isChosen ? '✓' : '○'}</span>
                  <div>
                    <div>
                      <b>{c.label || `${PROVIDER_MAP[c.provider]?.name} key`}</b> {c.keyHint}
                    </div>
                    <small className="muted">
                      verified {verifiedTime || 'recently'}
                      {c.source === 'env' ? ' · from environment' : ''}
                    </small>
                  </div>
                </button>
              );
            })}
            <div className="row end mt-1">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setUseDifferentKey(true);
                  setKeyInput('');
                  setVerifyError(null);
                }}
              >
                Use a different {provMeta.name} key
              </button>
            </div>
          </div>
        ) : (
          <form className="form" onSubmit={handleVerify}>
            <label className="counsel-field">
              <span>{provMeta.name} API key</span>
              <input
                type="password"
                value={keyInput}
                onChange={(e) => {
                  setKeyInput(e.target.value);
                  setVerifyError(null);
                }}
                disabled={verifying}
                placeholder={provMeta.keyHint}
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore
              />
            </label>

            <label className="counsel-field">
              <span>Label <em>optional</em></span>
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                disabled={verifying}
                placeholder="e.g. Personal, Team"
                maxLength={40}
              />
            </label>

            <div className="counsel-helper-row">
              <a
                href={provMeta.keysUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="counsel-helper-link"
              >
                Get a {provMeta.name} key ↗
              </a>
              {providerConns.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setUseDifferentKey(false)}
                >
                  Cancel
                </button>
              )}
            </div>

            <p className="counsel-fine">
              Your key stays on this computer’s local server and is never saved in the browser.
            </p>

            {verifyError && (
              <p className="error" role="alert">
                {verifyError}
              </p>
            )}

            <div className="row end">
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={!keyInput.trim() || verifying}
              >
                {verifying ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    <span>Verifying…</span>
                  </>
                ) : (
                  'Verify key'
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Step 3: Model Selection (available when connection is verified) */}
      {activeConn && activeConn.status === 'verified' && (
        <div>
          <label className="counsel-field">
            <span>Model</span>
            <select
              value={isCustomModel ? '__custom__' : assigned?.model || ''}
              onChange={handleModelChange}
            >
              {activeConn.models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              <option value="__custom__">Custom model ID…</option>
            </select>
          </label>

          {isCustomModel && (
            <div className="row gap-8 mt-2">
              <input
                className="grow"
                type="text"
                placeholder="Enter model id…"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomModelSubmit()}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCustomModelSubmit}
              >
                Set
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Test Button & Response */}
      {activeConn && activeConn.status === 'verified' && assigned?.model && (
        <section className="test-section" aria-label={`Test ${roleName}`}>
          <div className="test-row">
            <span className="test-meta">
              {assigned.model}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleTest}
              disabled={testing}
            >
              {testing ? 'Testing…' : 'Test'}
            </button>
          </div>

          {testResult && (
            <div className="test-reply">
              <p>“{testResult.text}”</p>
              <p className="test-meta mt-1">
                {testResult.latencyMs} ms · {testResult.usage.inputTokens ?? '—'} in / {testResult.usage.outputTokens ?? '—'} out tokens{testResult.usage.reasoningTokens ? ` (${testResult.usage.reasoningTokens} reasoning)` : ''}
              </p>
            </div>
          )}

          {testError && (
            <p className="error" role="alert">
              {testError}
            </p>
          )}
        </section>
      )}
    </article>
  );
}

export function CounselDialog({
  counsel,
  initialFocusRole,
  onClose,
  say,
}) {
  const {
    serverStatus,
    connections,
    roles,
    knownConnections,
    syncWithServer,
    addConnection,
    verifyConnection,
    removeConnection,
    assignRole,
    testRole,
    copyRoleToAll,
    clearAllRoles,
  } = counsel;

  // Track confirmation prompts
  const [confirmPrompt, setConfirmPrompt] = useState(null);

  const ROLES_ORDER = [
    { id: 'paksh', name: 'Paksh', title: 'The advocate' },
    { id: 'vipaksh', name: 'Vipaksh', title: 'The challenger' },
    { id: 'judge', name: 'Judge', title: 'The presiding judge' },
  ];

  const handleCopy = (srcRole) => {
    const srcName = srcRole === 'paksh' ? 'Paksh' : srcRole === 'vipaksh' ? 'Vipaksh' : 'Judge';
    const others = ['paksh', 'vipaksh', 'judge'].filter((r) => r !== srcRole && roles[r]?.connectionId);
    if (others.length > 0) {
      setConfirmPrompt({
        msg: `Overwrite other roles with ${srcName}’s provider and model?`,
        onConfirm: async () => {
          await copyRoleToAll(srcRole);
          setConfirmPrompt(null);
          say?.(`Copied ${srcName}’s choice to all roles.`);
        },
      });
    } else {
      copyRoleToAll(srcRole);
      say?.(`Copied ${srcName}’s choice to all roles.`);
    }
  };

  const handleRemoveKey = (conn) => {
    const usedByRoles = ['paksh', 'vipaksh', 'judge'].filter((r) => roles[r]?.connectionId === conn.id);
    const names = usedByRoles.map((r) => (r === 'paksh' ? 'Paksh' : r === 'vipaksh' ? 'Vipaksh' : 'Judge')).join(' and ');

    if (usedByRoles.length > 0) {
      setConfirmPrompt({
        msg: `Remove this ${PROVIDER_MAP[conn.provider]?.name || conn.provider} key? ${names} will need a new key.`,
        onConfirm: async () => {
          await removeConnection(conn.id);
          setConfirmPrompt(null);
          say?.(`${names} need a key`);
        },
      });
    } else {
      removeConnection(conn.id);
      say?.('Key removed.');
    }
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog glass glass-strong dialog-lg counsel-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="counsel-title"
      >
        <header className="dialog-head">
          <div>
            <p className="eyebrow">Counsel & models</p>
            <h2 id="counsel-title" className="dialog-title">Choose who argues</h2>
            <p className="muted" style={{ fontSize: '13px', marginTop: '3px' }}>
              Pick a provider and model for each role. A key you verify once can be reused by any role.
            </p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <div className="dialog-body">
          {serverStatus === 'offline' ? (
            <div className="counsel-offline-box">
              <Icon name="counsel" size={40} className="muted" />
              <p>
                Live models need the local server. Run <code>npm run dev</code>, then reopen this page.
              </p>
              <button className="btn btn-primary" onClick={syncWithServer}>
                Check again
              </button>
            </div>
          ) : (
            <>
              {confirmPrompt && (
                <div className="confirm-banner row gap-8 justify-between p-3 rounded-xl bg-rust-soft">
                  <span>{confirmPrompt.msg}</span>
                  <div className="row gap-4">
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmPrompt(null)}>
                      Cancel
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={confirmPrompt.onConfirm}>
                      Confirm
                    </button>
                  </div>
                </div>
              )}

              {/* 3 Role Cards */}
              <div className="counsel-grid">
                {ROLES_ORDER.map((r) => (
                  <RoleCard
                    key={r.id}
                    role={r.id}
                    roleName={r.name}
                    roleTitle={r.title}
                    assigned={roles[r.id]}
                    connections={connections}
                    knownConnections={knownConnections}
                    onAssign={assignRole}
                    onAddConnection={addConnection}
                    onTest={testRole}
                    isTargetRole={initialFocusRole === r.id}
                    say={say}
                  />
                ))}
              </div>

              {/* Quick Actions */}
              <div className="counsel-quick-actions">
                {ROLES_ORDER.map((r) => {
                  const isReady = roles[r.id]?.connectionId && roles[r.id]?.model;
                  if (!isReady) return null;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleCopy(r.id)}
                    >
                      Use {r.name}’s choice for all
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={clearAllRoles}
                >
                  Clear all roles
                </button>
              </div>

              {/* Saved Keys Section */}
              <details className="counsel-saved-keys">
                <summary>Saved keys (this session) ({connections.length})</summary>
                <div className="saved-keys-table-wrap">
                  <table className="saved-keys-table">
                    <thead>
                      <tr>
                        <th>Provider</th>
                        <th>Label</th>
                        <th>Key</th>
                        <th>Source</th>
                        <th>Status</th>
                        <th>Used by</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {connections.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="muted text-center" style={{ padding: '16px' }}>
                            No keys saved yet.
                          </td>
                        </tr>
                      ) : (
                        connections.map((c) => {
                          const usedBy = ['paksh', 'vipaksh', 'judge']
                            .filter((r) => roles[r]?.connectionId === c.id)
                            .map((r) => (r === 'paksh' ? 'Paksh' : r === 'vipaksh' ? 'Vipaksh' : 'Judge'))
                            .join(', ');

                          const isEnv = c.source === 'env';

                          return (
                            <tr key={c.id}>
                              <td>
                                <b>{PROVIDER_MAP[c.provider]?.name || c.provider}</b>
                              </td>
                              <td>{c.label || '—'}</td>
                              <td>
                                <code>{c.keyHint}</code>
                              </td>
                              <td>{isEnv ? 'Environment' : 'Session'}</td>
                              <td>
                                <span
                                  className={`status-chip ${
                                    c.status === 'verified'
                                      ? 'is-ready'
                                      : c.status === 'failed'
                                      ? 'is-failed'
                                      : 'is-needs-key'
                                  }`}
                                >
                                  {c.status}
                                </span>
                              </td>
                              <td>{usedBy || '—'}</td>
                              <td>
                                <div className="row gap-4">
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => verifyConnection(c.id)}
                                  >
                                    Re-verify
                                  </button>
                                  {isEnv ? (
                                    <span className="muted" style={{ fontSize: '11px' }}>
                                      Set in .env.local
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-sm"
                                      onClick={() => handleRemoveKey(c)}
                                    >
                                      Remove
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </details>
            </>
          )}
        </div>

        <footer className="dialog-foot" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="counsel-fine" style={{ maxWidth: '44ch' }}>
            Hearings are still scripted in this demo. Models are only used for Test.
          </p>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
