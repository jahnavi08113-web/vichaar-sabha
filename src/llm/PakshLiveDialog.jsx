import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Icon, Seal } from '../icons.jsx';
import { createHearing, runPakshOpening, deleteHearing } from './client.js';
import { PROVIDER_MAP } from './providers.js';

export function PakshLiveDialog({
  kase,
  counsel,
  onClose,
  onOpenCounsel,
}) {
  const [researchMode, setResearchMode] = useState('case'); // 'case' | 'off'
  const [status, setStatus] = useState('idle'); // 'idle' | 'running' | 'checking' | 'ok' | 'incomplete' | 'error'
  const [stepLabel, setStepLabel] = useState('Paksh is drafting…');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [displayedStatement, setDisplayedStatement] = useState('');
  const [highlightedEvidenceId, setHighlightedEvidenceId] = useState(null);

  const abortControllerRef = useRef(null);
  const hearingIdRef = useRef(null);
  const timerRef = useRef(null);
  const startMsRef = useRef(0);
  const dialogRef = useRef(null);

  const pakshRole = counsel?.roles?.paksh;
  const conn = pakshRole?.connectionId
    ? counsel?.connections?.find((c) => c.id === pakshRole.connectionId)
    : null;
  const providerMeta = conn?.provider ? PROVIDER_MAP[conn.provider] : null;

  const prefersReducedMotion = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (hearingIdRef.current) {
        deleteHearing(hearingIdRef.current).catch(() => {});
      }
    };
  }, []);

  // Keyboard navigation & focus trap
  useEffect(() => {
    const prev = document.activeElement;
    const el = dialogRef.current;
    if (!el) return;

    const focusables = () =>
      [...el.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
        .filter((x) => !x.disabled && x.getClientRects().length);

    const first = el.querySelector('[data-autofocus]') || focusables()[0] || el;
    first?.focus({ preventScroll: true });

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const a = list[0];
      const z = list[list.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    };

    el.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('keydown', onKey);
      if (prev && prev.focus) prev.focus({ preventScroll: true });
    };
  }, []);

  const handleRun = useCallback(async () => {
    if (!kase || !conn) return;

    setStatus('running');
    setStepLabel('Paksh is drafting…');
    setElapsed(0);
    setErrorMessage('');
    setResult(null);
    setDisplayedStatement('');
    startMsRef.current = Date.now();

    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startMsRef.current) / 1000);
      setElapsed(sec);
      if (sec >= 4) {
        setStepLabel('Checking quotes…');
      }
    }, 1000);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. Create hearing with case
      const created = await createHearing(kase);
      hearingIdRef.current = created.hearingId;

      // 2. Run Paksh opening
      const t0 = Date.now();
      const res = await runPakshOpening(created.hearingId, {
        researchMode,
        signal: controller.signal,
      });

      if (timerRef.current) clearInterval(timerRef.current);
      res.latencyMs = Date.now() - t0;

      setResult(res);
      if (res.status === 'ok') {
        setStatus('ok');
        const stmt = res.opening?.statement || '';
        if (prefersReducedMotion) {
          setDisplayedStatement(stmt);
        } else {
          // Reveal typing animation
          let charIdx = 0;
          setDisplayedStatement('');
          const interval = setInterval(() => {
            charIdx += 2;
            if (charIdx >= stmt.length) {
              setDisplayedStatement(stmt);
              clearInterval(interval);
            } else {
              setDisplayedStatement(stmt.slice(0, charIdx));
            }
          }, 16);
        }
      } else {
        setStatus('incomplete');
      }
    } catch (err) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (err.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      setStatus('error');
      setErrorMessage(err.message || 'Call failed.');
    } finally {
      abortControllerRef.current = null;
    }
  }, [kase, conn, researchMode, prefersReducedMotion]);

  // Start automatically when opened
  useEffect(() => {
    handleRun();
  }, [handleRun]);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (hearingIdRef.current) {
      deleteHearing(hearingIdRef.current).catch(() => {});
    }
    onClose();
  };

  const handleCopyJson = async () => {
    if (!result) return;
    const payload = {
      opening: result.opening,
      ledger: result.ledger,
      usage: result.usage,
      model: result.model,
      provider: result.provider,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const scrollToEvidence = (evidenceId) => {
    setHighlightedEvidenceId(evidenceId);
    const target = document.getElementById(`evidence-row-${evidenceId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => setHighlightedEvidenceId(null), 2500);
  };

  const opening = result?.opening;
  const ledger = result?.ledger;
  const contrarySet = new Set(opening?.contrary_evidence || []);

  return (
    <div
      className="backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && status !== 'running') onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="dialog glass glass-strong dialog-lg paksh-live-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="paksh-live-title"
        tabIndex={-1}
      >
        <header className="dialog-head">
          <div>
            <p className="eyebrow">
              <span className="dot dot-live" /> Live · Paksh only. Vipaksh and the Judge are still scripted.
            </p>
            <div className="row gap-8 items-center">
              <Seal role="paksh" size={26} />
              <h2 id="paksh-live-title" className="dialog-title">
                Paksh · live opening
              </h2>
            </div>
            <div className="paksh-meta-bar row gap-12 items-center">
              <span className="chip chip-neutral">
                {providerMeta?.name || conn?.provider || 'Provider'}: {pakshRole?.model || '—'}
              </span>
              <div className="paksh-mode-selector row gap-4 items-center">
                <span className="muted" style={{ fontSize: '12px' }}>Research:</span>
                <button
                  type="button"
                  className={`chip ${researchMode === 'case' ? 'chip-active' : 'chip-ghost'}`}
                  onClick={() => {
                    if (status !== 'running') {
                      setResearchMode('case');
                    }
                  }}
                  disabled={status === 'running'}
                >
                  Case only
                </button>
                <button
                  type="button"
                  className={`chip ${researchMode === 'off' ? 'chip-active' : 'chip-ghost'}`}
                  onClick={() => {
                    if (status !== 'running') {
                      setResearchMode('off');
                    }
                  }}
                  disabled={status === 'running'}
                >
                  Off (Assumptions only)
                </button>
              </div>
            </div>
          </div>
          <button className="icon-btn" onClick={handleCancel} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>

        <div className="dialog-body paksh-live-body">
          {/* Status announcement for screen readers */}
          <div className="sr-only" aria-live="polite">
            {status === 'running' && `${stepLabel} (${elapsed} seconds)`}
            {status === 'ok' && 'Paksh opening delivered successfully.'}
            {status === 'incomplete' && "Paksh couldn't produce a valid opening."}
            {status === 'error' && `Error: ${errorMessage}`}
          </div>

          {/* Running State */}
          {status === 'running' && (
            <div className="paksh-running-state">
              <div className="paksh-pulse-orb" />
              <p className="paksh-running-title">
                {stepLabel} <span className="muted">({elapsed}s)</span>
              </p>
              <p className="muted" style={{ fontSize: '13px', maxWidth: '42ch', margin: '0 auto' }}>
                Building isolated brief, checking exact exhibit quotes, and validating confidence limits.
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCancel}
                style={{ marginTop: '16px' }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Error State */}
          {status === 'error' && (
            <div className="paksh-error-box" role="alert">
              <Icon name="flag" size={24} className="error-icon" />
              <div>
                <h3>Opening call failed</h3>
                <p>{errorMessage}</p>
              </div>
              <div className="row gap-8" style={{ marginTop: '12px' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={handleRun}>
                  Retry
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenCounsel?.('paksh')}>
                  Check Counsel settings
                </button>
              </div>
            </div>
          )}

          {/* Incomplete State (after 1 repair) */}
          {status === 'incomplete' && (
            <div className="paksh-incomplete-box" role="alert">
              <div className="row gap-12 items-center">
                <Seal role="paksh" size={28} />
                <div>
                  <h3 className="paksh-incomplete-title">Paksh couldn't produce a valid opening</h3>
                  <p className="muted">
                    The model response did not pass strict evidence and rule validation checks after 1 repair attempt.
                    No partial or invented opening is shown.
                  </p>
                </div>
              </div>
              <div className="paksh-errors-list-wrap">
                <p className="paksh-errors-header">Validation failures:</p>
                <ul className="paksh-errors-list">
                  {result?.errors?.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
              <div className="row gap-8 items-center" style={{ marginTop: '16px' }}>
                <button type="button" className="btn btn-primary" onClick={handleRun}>
                  Retry call
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => onOpenCounsel?.('paksh')}>
                  Change model
                </button>
              </div>
            </div>
          )}

          {/* Succeeded Result View */}
          {status === 'ok' && opening && (
            <div className="paksh-result-flow">
              {/* 1. Spoken Statement */}
              <section className="paksh-section paksh-statement-section" aria-label="Spoken statement">
                <div className="paksh-statement-wrap">
                  <span className="paksh-quote-mark" aria-hidden="true">“</span>
                  <p className="paksh-statement-text">
                    {displayedStatement || opening.statement}
                  </p>
                </div>
              </section>

              {/* 2. Claims Cards */}
              <section className="paksh-section" aria-label="Claims">
                <h4 className="paksh-section-title">Claims</h4>
                <div className="paksh-claims-grid">
                  {opening.claims?.map((claim) => (
                    <article key={claim.id} className="card glass paksh-claim-card">
                      <div className="paksh-claim-head row gap-8 items-center">
                        <span className="chip chip-area">{claim.area}</span>
                        <span className={`chip chip-conf-${claim.confidence}`}>
                          {claim.confidence.charAt(0).toUpperCase() + claim.confidence.slice(1)} confidence
                        </span>
                        <span className="chip chip-basis">
                          {claim.basis === 'evidence' ? 'Evidence' : 'Assumption'}
                        </span>
                      </div>
                      <p className="paksh-claim-text">{claim.text}</p>
                      {claim.evidence && claim.evidence.length > 0 && (
                        <div className="paksh-claim-evidence row gap-4 items-center">
                          <span className="muted" style={{ fontSize: '11px' }}>Evidence:</span>
                          {claim.evidence.map((eid) => (
                            <button
                              key={eid}
                              type="button"
                              className="chip chip-evidence-link"
                              onClick={() => scrollToEvidence(eid)}
                              title={`Jump to ${eid}`}
                            >
                              <Icon name="clip" size={11} /> {eid}
                            </button>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>

              {/* 3. Evidence List */}
              <section className="paksh-section" aria-label="Evidence ledger">
                <div className="row gap-8 items-center justify-between">
                  <h4 className="paksh-section-title">Evidence & quote verification</h4>
                  <span className="muted" style={{ fontSize: '12px' }}>
                    {ledger?.items?.length || 0} {ledger?.items?.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div className="paksh-evidence-list">
                  {!ledger?.items?.length ? (
                    <p className="muted" style={{ fontSize: '13px' }}>
                      No ledger items (research mode is Off — all claims are treated as assumptions).
                    </p>
                  ) : (
                    ledger.items.map((item) => {
                      const isContrary = contrarySet.has(item.id);
                      const isHighlighted = highlightedEvidenceId === item.id;
                      return (
                        <div
                          key={item.id}
                          id={`evidence-row-${item.id}`}
                          className={`paksh-evidence-row card glass ${
                            isContrary ? 'paksh-evidence-contrary' : ''
                          } ${isHighlighted ? 'paksh-evidence-highlight' : ''}`}
                        >
                          <div className="paksh-evidence-top row gap-8 items-center justify-between">
                            <div className="row gap-8 items-center">
                              <span className="paksh-item-id">{item.id}</span>
                              <span className={`chip chip-stance-${item.stance}`}>
                                {item.stance.charAt(0).toUpperCase() + item.stance.slice(1)}
                              </span>
                              <span className="chip chip-strength">{item.strength}</span>
                              {item.original_strength && item.cap_reason && (
                                <span className="chip chip-downgraded" title={`Downgraded from ${item.original_strength}`}>
                                  {item.original_strength} → {item.strength}
                                </span>
                              )}
                            </div>
                            <div className="row gap-4">
                              {/* Verification Badges */}
                              {item.verification === 'exact' && (
                                <span className="chip chip-found">
                                  <Icon name="check" size={12} /> Quote found
                                </span>
                              )}
                              {item.verification === 'normalized' && (
                                <span className="chip chip-found-diff">
                                  <Icon name="check" size={12} /> Quote found (formatting differs)
                                </span>
                              )}
                              {item.verification === 'not_found' && (
                                <span className="chip chip-badge-warn">
                                  <Icon name="flag" size={12} /> Quote not found — counted as assertion
                                </span>
                              )}
                              {item.verification === 'no_source_text' && (
                                <span className="chip chip-badge-warn">
                                  <Icon name="flag" size={12} /> Source text not available — counted as assertion
                                </span>
                              )}
                              {item.cap_reason === 'small_sample' && (
                                <span className="chip chip-badge-neutral">
                                  <Icon name="flag" size={12} /> Small sample — counted as opinion
                                </span>
                              )}
                              {item.same_quote_as && (
                                <span className="chip chip-neutral">
                                  Also cited as {item.same_quote_as}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="paksh-evidence-quote">“{item.quote}”</p>
                          <div className="paksh-evidence-source muted">
                            <span>Source: <code>{item.source}</code></span>
                            {item.note && <span> · {item.note}</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>

              {/* 4. Disclosed Against Paksh */}
              {opening.contrary_evidence && opening.contrary_evidence.length > 0 && (
                <section className="paksh-section paksh-contrary-section" aria-label="Disclosed contrary evidence">
                  <h4 className="paksh-section-title paksh-contrary-header">
                    <Icon name="flag" size={16} /> Disclosed contrary evidence (against Paksh)
                  </h4>
                  <p className="muted" style={{ fontSize: '13px', marginBottom: '8px' }}>
                    Rule 3 requirement: Paksh openly disclosed these exhibits that challenge the idea:
                  </p>
                  <div className="row gap-8">
                    {opening.contrary_evidence.map((eid) => (
                      <button
                        key={eid}
                        type="button"
                        className="chip chip-contrary-badge"
                        onClick={() => scrollToEvidence(eid)}
                      >
                        <Icon name="clip" size={12} /> {eid}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* 5. Concession and Proving Test */}
              <section className="paksh-section" aria-label="Concession and proving test">
                <h4 className="paksh-section-title">Concession & proving test</h4>
                {opening.concession && (
                  <div className="card glass paksh-concession-card">
                    <p className="paksh-concession-label">Concession</p>
                    <p className="paksh-concession-text">{opening.concession}</p>
                  </div>
                )}
                {opening.proving_test && (
                  <div className="card glass proving-test-card" style={{ marginTop: '12px' }}>
                    <div className="proving-test-head row gap-8 items-center justify-between">
                      <span className="proving-test-title">Smallest proving test</span>
                      {opening.proving_test.tests_claim && (
                        <span className="chip chip-neutral">
                          Tests claim {opening.proving_test.tests_claim}
                        </span>
                      )}
                    </div>
                    <dl className="proving-test-grid">
                      <div>
                        <dt>Action</dt>
                        <dd>{opening.proving_test.action}</dd>
                      </div>
                      <div>
                        <dt>Metric</dt>
                        <dd>{opening.proving_test.metric}</dd>
                      </div>
                      <div>
                        <dt>Success threshold</dt>
                        <dd>{opening.proving_test.success_threshold}</dd>
                      </div>
                      <div>
                        <dt>Timebox</dt>
                        <dd>{opening.proving_test.timebox}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </section>

              {/* 6. Checks & Warnings */}
              {result.warnings && result.warnings.length > 0 && (
                <section className="paksh-section" aria-label="Checks and warnings">
                  <details className="paksh-checks-details">
                    <summary className="paksh-checks-summary">
                      <Icon name="flag" size={14} /> Validator warnings ({result.warnings.length})
                    </summary>
                    <ul className="paksh-warnings-list">
                      {result.warnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </details>
                </section>
              )}

              {/* 7. Usage & Latency */}
              <section className="paksh-section" aria-label="Call usage">
                <h4 className="paksh-section-title">Call accounting</h4>
                <div className="paksh-usage-card card glass">
                  <div className="paksh-usage-grid">
                    <div>
                      <dt>Calls</dt>
                      <dd>{result.usage?.calls ?? 1}</dd>
                    </div>
                    <div>
                      <dt>Retries</dt>
                      <dd>{result.usage?.retries ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Input tokens</dt>
                      <dd>{result.usage?.inputTokens != null ? result.usage.inputTokens : '—'}</dd>
                    </div>
                    <div>
                      <dt>Output tokens</dt>
                      <dd>{result.usage?.outputTokens != null ? result.usage.outputTokens : '—'}</dd>
                    </div>
                    <div>
                      <dt>Total tokens</dt>
                      <dd>{result.usage?.totalTokens != null ? result.usage.totalTokens : '—'}</dd>
                    </div>
                    <div>
                      <dt>Latency</dt>
                      <dd>
                        {result.latencyMs != null
                          ? `${(result.latencyMs / 1000).toFixed(2)}s`
                          : '—'}
                      </dd>
                    </div>
                  </div>
                </div>
              </section>

              {/* 8. What Paksh Saw */}
              <section className="paksh-section" aria-label="What Paksh saw">
                <details className="paksh-what-saw-details" open>
                  <summary className="paksh-what-saw-summary">
                    <Icon name="spark" size={14} /> What Paksh saw ({result.allowedInputs?.length || 0} allowed inputs)
                  </summary>
                  <div className="paksh-what-saw-content">
                    <div className="prompt-hash-line row gap-8 items-center">
                      <span>Prompt SHA-256:</span>
                      <code>{result.promptSha256?.slice(0, 16)}…</code>
                    </div>
                    <p className="paksh-isolation-note muted">
                      Not visible to Paksh: scripted lines, rulings, verdict, Vipaksh’s work.
                    </p>
                    <div className="paksh-paths-list">
                      {result.allowedInputs?.map((p, i) => (
                        <span key={i} className="path-tag">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                </details>
              </section>
            </div>
          )}
        </div>

        <footer className="dialog-foot paksh-dialog-foot">
          <div className="row gap-8 items-center">
            {status === 'ok' && (
              <button type="button" className="btn btn-ghost" onClick={handleCopyJson}>
                <Icon name={copied ? 'check' : 'copy'} size={15} />
                {copied ? 'Copied JSON!' : 'Copy JSON'}
              </button>
            )}
          </div>
          <button type="button" className="btn btn-primary" onClick={handleCancel}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
