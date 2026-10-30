import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import courtroomImg from '../public/assets/courtroom.webp';
import pakshImg from '../public/assets/paksh.webp';
import judgeImg from '../public/assets/judge.webp';
import vipakshImg from '../public/assets/vipaksh.webp';
import { ROLES, CASES, OBJECTIONS, STATEMENT_MS, buildCustomCase, isApproved, rulingStatus } from './data.js';
import { Icon, Seal, SealDefs } from './icons.jsx';
import { useCounsel } from './llm/useCounsel.js';
import { CounselDialog } from './llm/CounselDialog.jsx';
import { PakshLiveDialog } from './llm/PakshLiveDialog.jsx';
import { PROVIDER_MAP } from './llm/providers.js';

const PORTRAITS = { paksh: pakshImg, judge: judgeImg, vipaksh: vipakshImg };
const AR = 1376 / 768;
const TYPE_SHARE = 0.6; // share of each statement spent "typing"
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const roleName = (r) => (r === 'you' ? 'You' : ROLES[r]?.name || r);

/* ---------- small utilities ---------- */
const store = {
  get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch { return f; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

function useMedia(q) {
  const [m, setM] = useState(() => window.matchMedia?.(q).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(q); if (!mq) return;
    const on = () => setM(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [q]);
  return m;
}

let audioCtx;
function tone(freqs, { dur = 0.55, type = 'sine', vol = 0.045, gap = 0.07 } = {}) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = audioCtx.currentTime;
    freqs.forEach((f, i) => {
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      const t = t0 + i * gap;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t + dur + 0.05);
    });
  } catch { /* audio unavailable */ }
}
const SOUNDS = {
  paksh: () => tone([523.25, 659.25]),
  vipaksh: () => tone([440, 392]),
  judge: () => tone([392, 587.33], { dur: 0.8 }),
  gavel: () => { tone([140], { type: 'triangle', dur: 0.18, vol: 0.12 }); setTimeout(() => tone([120], { type: 'triangle', dur: 0.22, vol: 0.1 }), 170); },
  soft: () => tone([880], { dur: 0.3, vol: 0.03 }),
};

function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'hearing'; }

function hearingMarkdown(kase, evidence, transcript) {
  const approved = isApproved(kase);
  const lines = [
    `# Vichaar Sabha hearing — ${kase.title}`, '',
    '_Scripted sample hearing. The dialogue and verdict are illustrative, not a live AI review._', '',
    `**Case:** ${kase.number}  `, `**Brief:** ${kase.brief}  `, `**Goal:** ${kase.goal}`, '',
    '## Exhibits', ...evidence.map((e) => `- ${e.title}${e.detail ? ` — ${e.detail}` : ''}`), '',
    '## Transcript',
    ...transcript.map((t) => {
      const who = t.kind === 'note' ? 'Your note' : t.kind === 'objection' ? 'Your objection' : t.kind === 'ruling' ? 'Judge (ruling)' : roleName(t.speaker);
      return `**${who}:** ${t.text}\n`;
    }),
  ];
  const v = kase.verdict;
  lines.push(
    approved ? '## Illustrative verdict — Approved' : '## Illustrative verdict',
    `**${v.headline}**`, '',
    v.summary, '',
    `- **Possibility:** ${v.possibility}`,
    `- **Open risk:** ${v.risk}`,
    `- **${approved ? 'First milestone' : 'Next experiment'}:** ${v.experiment}`, '',
    approved ? '**The court would revisit this if:**' : '**The verdict would change if:**',
    ...v.changeIf.map((c) => `- ${c}`), '',
  );
  if (v.plan) {
    lines.push(
      `## ${v.plan.title}`,
      ...v.plan.steps.map((s, i) => `${i + 1}. **${s.when} — ${s.title}:** ${s.detail}`),
      '',
    );
    if (v.plan.track?.length) {
      lines.push(`**Track:** ${v.plan.track.join(' · ')}`);
    }
    if (v.plan.budget) {
      lines.push(`**Budget:** ${v.plan.budget}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/* ---------- dialog shell with focus management ---------- */
function Dialog({ title, eyebrow, onClose, children, size = 'md', className = '', footer }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current;
    const focusables = () => [...el.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])')]
      .filter((x) => !x.disabled && x.getClientRects().length);
    const first = el.querySelector('[data-autofocus]') || focusables()[1] || focusables()[0] || el;
    first.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab') return;
      const list = focusables(); if (!list.length) return;
      const a = list[0]; const z = list[list.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    el.addEventListener('keydown', onKey);
    return () => { el.removeEventListener('keydown', onKey); if (prev && prev.focus) prev.focus({ preventScroll: true }); };
  }, []);
  const id = useMemo(() => `dlg-${Math.random().toString(36).slice(2, 8)}`, []);
  return (
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`dialog glass glass-strong dialog-${size} ${className}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
        <header className="dialog-head">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id={id} className="dialog-title">{title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ---------- scene ---------- */
const MOTES = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 37 + 11) % 92 + 4}%`, top: `${(i * 53 + 7) % 60 + 12}%`,
  delay: `${-(i * 1.7) % 14}s`, dur: `${12 + (i % 5) * 2.5}s`, size: `${2 + (i % 3)}px`,
}));

function Scene({ geo, focus, phase, onRole, speaking, roles, connections }) {
  return (
    <div className={`scene-wrap phase-${phase}`}>
      <div className="scene" style={{ width: geo.baseW, height: geo.baseH, transform: `translate3d(${geo.ox}px, ${geo.oy}px, 0) scale(${geo.z})` }}>
        <img className="scene-img" src={courtroomImg} alt="" draggable="false" />
        <div className="scene-beams" aria-hidden="true" />
        <div className="scene-lamps" aria-hidden="true" />
        <div className="motes" aria-hidden="true">
          {MOTES.map((m, i) => <span key={i} style={{ left: m.left, top: m.top, animationDelay: m.delay, animationDuration: m.dur, width: m.size, height: m.size }} />)}
        </div>
        {Object.values(ROLES).map((r) => (
          <div key={r.id} className={`head head-${r.id} ${speaking === r.id ? 'is-speaking' : ''} ${focus === r.id ? 'is-focus' : ''}`}
            style={{ left: `${r.anchor.x * 100}%`, top: `${r.anchor.y * 100}%`, width: `${r.r * 200}%` }}
            onClick={() => onRole(r.id)} aria-hidden="true">
            <span className="ring" /><span className="ring ring-2" />
          </div>
        ))}
        {phase === 'court' && Object.values(ROLES).map((r) => {
          const roleCfg = roles?.[r.id];
          const conn = roleCfg?.connectionId ? connections?.find((c) => c.id === roleCfg.connectionId) : null;
          const prov = conn ? PROVIDER_MAP[conn.provider] : null;
          const isReady = !!(conn && conn.status === 'verified' && roleCfg?.model);
          const isFailed = conn?.status === 'failed';
          const dotClass = isFailed ? 'dot-failed' : isReady ? 'dot-ready' : '';

          return (
            <button key={r.id} className={`plate plate-${r.id} ${speaking === r.id ? 'is-speaking' : ''}`}
              style={{ left: `${r.plate.x * 100}%`, top: `${r.plate.y * 100}%` }}
              onClick={() => onRole(r.id)} aria-label={`${r.name}, ${r.title}${prov ? ` (${prov.name})` : ''}. View profile`}>
              <Seal role={r.id} size={18} />
              {(isReady || isFailed) && <span className={`plate-dot ${dotClass}`} aria-hidden="true" />}
              <span>{r.name}</span>
              {prov && <span className="plate-provider">· {prov.name}</span>}
              {speaking === r.id && <span className="eq" aria-hidden="true"><i /><i /><i /></span>}
            </button>
          );
        })}
      </div>
      <div className="scene-vignette" aria-hidden="true" />
    </div>
  );
}

/* ---------- court panels ---------- */
function CaseCard({
  kase,
  evidenceCount,
  onBrief,
  onEvidence,
  compact,
  mobile,
  counsel,
  onHearPakshLive,
  onOpenCounsel,
  mode = 'demo',
  onSwitchMode,
}) {
  const isFile = typeof window !== 'undefined' && window.location.protocol === 'file:';
  const isOnline = counsel?.serverStatus === 'online';
  const showLiveButton = !isFile && isOnline;

  const pakshRole = counsel?.roles?.paksh;
  const isPakshReady = Boolean(
    pakshRole?.connectionId &&
    pakshRole?.model &&
    counsel?.connections?.some((c) => c.id === pakshRole.connectionId && c.status === 'verified')
  );

  return (
    <section className="card case-card glass float" aria-label="Case brief">
      <div className="case-top">
        <p className="eyebrow"><Icon name="case" size={14} /> Case {kase.number} · {kase.custom ? 'Your idea' : 'Sample'}</p>
        <span className={`chip ${mode === 'live' ? 'chip-live-accent' : 'chip-live'}`}>
          <span className="dot" />{mode === 'live' ? 'Live review' : 'Under review'}
        </span>
      </div>
      <h1 className="case-title">{kase.title}</h1>
      <p className="case-headline">{kase.headline}</p>
      {!compact && <p className="case-brief">{kase.brief}</p>}
      <dl className="case-meta">
        <div><dt>Goal</dt><dd>{kase.goal}</dd></div>
        <div><dt>Record</dt><dd>{evidenceCount} {evidenceCount === 1 ? 'exhibit' : 'exhibits'}</dd></div>
      </dl>

      {mode === 'live' && (
        <div className="live-mode-banner">
          <span className="live-dot" />
          <span><b>Live AI Mode:</b> Real-time evidence grounding & advocate arguments.</span>
        </div>
      )}

      <div className="row gap-8 items-center case-card-actions" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={onBrief}><Icon name="edit" size={16} />Edit brief</button>
        <button className="btn btn-ghost btn-sm" onClick={onEvidence}><Icon name="clip" size={16} />Evidence</button>
        {showLiveButton && (
          isPakshReady ? (
            <button
              type="button"
              className={`btn btn-paksh-live btn-sm ${mode === 'live' ? 'is-featured' : ''}`}
              onClick={onHearPakshLive}
            >
              <Seal role="paksh" size={16} />
              Hear Paksh live
              <span className="chip chip-live-tag">Live</span>
            </button>
          ) : (
            <div className="paksh-live-disabled-wrap row gap-6 items-center">
              <button
                type="button"
                className="btn btn-paksh-live btn-sm is-disabled"
                disabled
                title="Set Paksh's model in Counsel & models"
              >
                <Seal role="paksh" size={16} />
                Hear Paksh live
                <span className="chip chip-live-tag">Live</span>
              </button>
              <span className="paksh-live-hint muted">
                Set model in <button type="button" className="link-action" onClick={() => onOpenCounsel?.('paksh')}>Counsel & models</button>
              </span>
            </div>
          )
        )}
      </div>
    </section>
  );
}

function NotesList({ kase, step, objections, userNotes }) {
  const delivered = step < 0 ? [] : kase.script.slice(0, Math.min(step, 4) + 1);
  if (!delivered.length) {
    return <p className="empty">Key points land here as each side speaks. Object to any advocate’s claim to put it on the record.</p>;
  }
  return (
    <>
      <ol className="notes">
        {delivered.map((s, i) => {
          const objCat = objections[i];
          const obj = objCat && OBJECTIONS.find((o) => o.id === objCat);
          const status = objCat ? rulingStatus(kase.rulings?.[objCat]) : '';
          return (
            <li key={i} className={`note note-${s.speaker} ${i === step ? 'is-current' : ''}`}>
              <Seal role={s.speaker} size={22} />
              <div>
                <p className="note-who">{ROLES[s.speaker].name}</p>
                <p className="note-text">{s.note}</p>
                {obj && <p className="note-flag"><Icon name="flag" size={13} />Objection · {obj.label}{status ? ` · ${status}` : ''}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {userNotes > 0 && <p className="notes-foot"><Icon name="pen" size={14} />{userNotes} {userNotes === 1 ? 'note' : 'notes'} from you in the transcript</p>}
    </>
  );
}

function NotesCard(props) {
  return (
    <section className="card notes-card glass float float-2" aria-label="Hearing notes">
      <div className="case-top">
        <p className="eyebrow"><Icon name="notes" size={14} /> Hearing notes</p>
        <span className="chip">{props.step < 0 ? 0 : Math.min(props.step + 1, 5)}/5</span>
      </div>
      <NotesList {...props} />
    </section>
  );
}

function Bubble({ data, pos, mobile, reduced }) {
  if (!data) return null;
  const r = ROLES[data.speaker];
  const shown = data.typing && !reduced ? data.text.slice(0, Math.ceil(data.text.length * clamp(data.fraction, 0, 1))) : data.text;
  const style = mobile || !pos ? undefined : { left: pos.left, top: pos.top, width: pos.width };
  return (
    <div className={`bubble glass glass-strong bubble-${data.speaker} tail-${pos?.tail || 'center'} ${data.kind ? `bubble-${data.kind}` : ''}`} style={style} key={data.key}>
      <div className="bubble-head">
        <Seal role={data.speaker} size={26} />
        <div>
          <p className="bubble-name">{r.name}</p>
          <p className="bubble-role">{data.label || r.title}</p>
        </div>
        {data.counter && <span className="chip chip-quiet">{data.counter}</span>}
      </div>
      <p className="bubble-text" aria-hidden="true">{shown}<span className={shown.length < data.text.length ? 'caret' : 'caret is-done'} /></p>
      {data.progress != null && <div className="bubble-bar" aria-hidden="true"><span style={{ transform: `scaleX(${data.progress})` }} /></div>}
    </div>
  );
}

const STEP_LABELS = ['Opening', 'Challenge', 'Response', 'Rebuttal', 'Judge', 'Verdict'];

function Dock({ kase, step, playing, onPrimary, onNext, onReplay, onObject, onStep, canObject, objected, onSubmitNote, onAttach, mobile, interjection }) {
  const [text, setText] = useState('');
  const primary = step === -1 ? { icon: 'play', label: 'Begin hearing' }
    : step === 5 ? { icon: 'gavel', label: 'View verdict' }
    : playing ? { icon: 'pause', label: 'Pause' }
    : { icon: 'play', label: interjection ? 'Continue' : 'Resume' };
  const submit = (e) => { e.preventDefault(); if (!text.trim()) return; onSubmitNote(text.trim()); setText(''); };
  return (
    <div className="dock">
      <div className="dock-controls glass">
        <ol className="steps" aria-label="Hearing progress">
          {STEP_LABELS.map((l, i) => {
            const sp = i < 5 ? kase.script[i].speaker : 'judge';
            const state = i < step ? 'done' : i === step ? 'current' : 'todo';
            const isApprovedStep = i === 5 && step === 5 && isApproved(kase);
            return (
              <li key={i}>
                <button className={`step step-${state} step-${sp}`} onClick={() => onStep(i)} disabled={step === -1}
                  aria-label={`${l}${i < 5 ? ` — ${ROLES[sp].name}` : ''}${state === 'current' ? ' (current)' : ''}`} aria-current={state === 'current' ? 'step' : undefined}>
                  {i < 5 ? <Seal role={sp} size={16} /> : isApprovedStep ? <Icon name="check" size={14} /> : <Icon name="gavel" size={14} />}
                </button>
                {!mobile && <span className="step-label">{l}</span>}
              </li>
            );
          })}
        </ol>
        <div className="dock-actions">
          {step >= 0 && <button className="icon-btn" onClick={onReplay} aria-label="Replay hearing from the start" title="Replay"><Icon name="replay" /></button>}
          <button className="btn btn-ghost" onClick={onObject} disabled={!canObject} aria-label={objected ? 'Objection already recorded for this claim' : 'Object to this claim'}>
            <Icon name="flag" size={18} />{mobile ? 'Object' : objected ? 'Objection recorded' : 'Object'}
          </button>
          <button className="icon-btn" onClick={onNext} disabled={step >= 5} aria-label={step === -1 ? 'Begin hearing' : 'Next statement'} title="Next (→)"><Icon name="next" /></button>
          <button className={`btn btn-primary ${step === -1 || step === 5 ? 'pulse' : ''}`} onClick={onPrimary} data-primary>
            <Icon name={primary.icon} size={18} />{primary.label}
          </button>
        </div>
      </div>
      <form className="composer glass" onSubmit={submit}>
        <button type="button" className="icon-btn" onClick={onAttach} aria-label="Attach a file as evidence" title="Attach evidence"><Icon name="clip" /></button>
        <label className="sr-only" htmlFor="composer-input">Add a note or link to the record</label>
        <input id="composer-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} autoComplete="off"
          placeholder={mobile ? 'Add a note or link…' : 'Add a note, question or source link for the court…'} />
        <button type="submit" className="btn btn-primary btn-send" disabled={!text.trim()} aria-label="Add to record"><Icon name="send" size={18} />{!mobile && 'Add to record'}</button>
      </form>
    </div>
  );
}

/* ---------- dialogs ---------- */
function BriefDialog({ current, custom, onOpenSample, onOpenCustom, onClose }) {
  const [tab, setTab] = useState(current.custom ? 'custom' : 'samples');
  const [form, setForm] = useState({ title: custom.title || '', brief: custom.brief || '', goal: custom.goal || '' });
  const [err, setErr] = useState('');
  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.brief.trim()) { setErr('Add an idea name and a one-line pitch to open the hearing.'); return; }
    onOpenCustom(form);
  };
  return (
    <Dialog title="Choose a case" eyebrow="The docket" onClose={onClose} size="lg">
      <div className="tabs" role="tablist" aria-label="Case source">
        <button role="tab" aria-selected={tab === 'samples'} className={tab === 'samples' ? 'is-on' : ''} onClick={() => setTab('samples')}>Sample cases</button>
        <button role="tab" aria-selected={tab === 'custom'} className={tab === 'custom' ? 'is-on' : ''} onClick={() => setTab('custom')}>Your idea</button>
      </div>
      {tab === 'samples' ? (
        <div className="case-grid">
          {CASES.map((c) => (
            <button key={c.id} className={`case-option ${current.id === c.id ? 'is-on' : ''}`} onClick={() => onOpenSample(c.id)}>
              <div className="case-option-bar">
                <span className="eyebrow">Case {c.number}</span>
                {c.id === 'print' && <span className="chip chip-quiet">Strong evidence</span>}
              </div>
              <span className="case-option-title">{c.title}</span>
              <span className="case-option-head">{c.headline}</span>
              <span className="case-option-brief">{c.brief}</span>
              <span className="case-option-cta">{current.id === c.id ? <><Icon name="replay" size={15} />Restart this hearing</> : <>Open hearing<Icon name="arrow" size={15} /></>}</span>
            </button>
          ))}
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <label className="field"><span>Idea name</span>
            <input data-autofocus value={form.title} maxLength={60} onChange={(e) => { setForm({ ...form, title: e.target.value }); setErr(''); }} placeholder="e.g. Hostel laundry alerts" />
          </label>
          <label className="field"><span>One-line pitch</span>
            <textarea rows={3} value={form.brief} maxLength={240} onChange={(e) => { setForm({ ...form, brief: e.target.value }); setErr(''); }} placeholder="Who is it for, and what does it change?" />
          </label>
          <label className="field"><span>Goal for this hearing <em>optional</em></span>
            <input value={form.goal} maxLength={60} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder="e.g. Decide what to test first" />
          </label>
          <p className="hint"><Icon name="spark" size={14} />Custom ideas get a generic, illustrative hearing. This demo has no live AI, so it can’t evaluate your idea.</p>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="row end gap-8"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" type="submit">Open hearing<Icon name="arrow" size={16} /></button></div>
        </form>
      )}
    </Dialog>
  );
}

function EvidenceDialog({ evidence, onAdd, onRemove, onClose, startWith }) {
  const [mode, setMode] = useState(startWith || 'note');
  const [note, setNote] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const addNote = () => { if (!note.trim()) return setErr('Write a short note first.'); onAdd({ kind: 'note', title: note.trim() }); setNote(''); setErr(''); };
  const addLink = () => {
    let u = url.trim(); if (!u) return setErr('Paste a link first.');
    if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
    try { const p = new URL(u); onAdd({ kind: 'link', title: p.hostname.replace(/^www\./, ''), detail: u, href: u }); setUrl(''); setErr(''); } catch { setErr('That doesn’t look like a valid link.'); }
  };
  const addFiles = (files) => {
    [...files].slice(0, 5).forEach((f) => {
      const isImg = f.type.startsWith('image/') && f.size < 8e6;
      onAdd({ kind: 'file', title: f.name, detail: `${(f.size / 1024).toFixed(0)} KB · listed by name only`, preview: isImg ? URL.createObjectURL(f) : null });
    });
  };
  useEffect(() => { if (startWith === 'file') setTimeout(() => fileRef.current?.click(), 60); }, [startWith]);
  return (
    <Dialog title="Evidence on record" eyebrow="Exhibits" onClose={onClose} size="md">
      <ul className="exhibits">
        {evidence.map((e, i) => (
          <li key={e.id} className="exhibit">
            {e.preview ? <img src={e.preview} alt="" className="exhibit-thumb" /> : <span className="exhibit-icon"><Icon name={e.kind === 'link' ? 'link' : e.kind === 'file' ? 'file' : 'pen'} size={18} /></span>}
            <div className="exhibit-body">
              <p className="exhibit-label">Exhibit {String.fromCharCode(65 + i)}{e.sample ? ' · sample' : ''}</p>
              {e.href ? <a href={e.href} target="_blank" rel="noopener noreferrer" className="exhibit-title">{e.title}</a> : <p className="exhibit-title">{e.title}</p>}
              {e.detail && <p className="exhibit-detail">{e.detail}</p>}
            </div>
            {!e.sample && <button className="icon-btn icon-btn-sm" onClick={() => onRemove(e.id)} aria-label={`Remove ${e.title}`}><Icon name="close" size={16} /></button>}
          </li>
        ))}
      </ul>
      <div className="add-evidence">
        <div className="segmented" role="radiogroup" aria-label="Evidence type">
          {[['note', 'pen', 'Note'], ['link', 'link', 'Link'], ['file', 'file', 'File']].map(([k, ic, l]) => (
            <button key={k} role="radio" aria-checked={mode === k} className={mode === k ? 'is-on' : ''} onClick={() => { setMode(k); setErr(''); }}><Icon name={ic} size={15} />{l}</button>
          ))}
        </div>
        {mode === 'note' && <div className="row gap-8"><label className="sr-only" htmlFor="ev-note">Evidence note</label><input id="ev-note" className="grow" value={note} maxLength={240} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="e.g. 12 students joined the waitlist in two days" /><button className="btn btn-primary" onClick={addNote}>Add</button></div>}
        {mode === 'link' && <div className="row gap-8"><label className="sr-only" htmlFor="ev-link">Source link</label><input id="ev-link" className="grow" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLink()} placeholder="https://…" /><button className="btn btn-primary" onClick={addLink}>Add</button></div>}
        {mode === 'file' && (
          <label className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <input ref={fileRef} type="file" multiple className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            <Icon name="clip" size={20} /><span><b>Choose files</b> or drop them here</span>
          </label>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <p className="hint">Evidence stays in this browser tab. Files are listed by name — this demo doesn’t read their contents.</p>
      </div>
    </Dialog>
  );
}

function ObjectionDialog({ statement, onChoose, onClose }) {
  return (
    <Dialog title="Raise an objection" eyebrow={`Against ${ROLES[statement.speaker].name}`} onClose={onClose} size="sm">
      <blockquote className={`claim claim-${statement.speaker}`}><Seal role={statement.speaker} size={22} /><span>“{statement.note}”</span></blockquote>
      <p className="muted">What’s wrong with this claim?</p>
      <div className="choices">
        {OBJECTIONS.map((o, i) => (
          <button key={o.id} className="choice" onClick={() => onChoose(o.id)} data-autofocus={i === 0 ? true : undefined}>
            <Icon name="flag" size={18} /><span><b>{o.label}</b><small>{o.hint}</small></span><Icon name="arrow" size={16} className="choice-arrow" />
          </button>
        ))}
      </div>
    </Dialog>
  );
}

function TranscriptDialog({ kase, transcript, onExport, onCopy, onClose }) {
  const listRef = useRef(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, []);
  return (
    <Dialog title="Transcript" eyebrow={`Case ${kase.number} · ${kase.title}`} onClose={onClose} size="md"
      footer={<><button className="btn btn-ghost" onClick={onCopy} disabled={!transcript.length}><Icon name="copy" size={16} />Copy</button><button className="btn btn-primary" onClick={onExport} disabled={!transcript.length}><Icon name="download" size={16} />Export .md</button></>}>
      {transcript.length === 0 ? <p className="empty">Nothing on the record yet. Begin the hearing, add a note, or raise an objection.</p> : (
        <ol className="transcript" ref={listRef}>
          {transcript.map((t) => (
            <li key={t.id} className={`tx tx-${t.kind} tx-${t.speaker}`}>
              <Seal role={t.speaker} size={24} />
              <div>
                <p className="tx-who">{t.kind === 'note' ? 'Your note' : t.kind === 'objection' ? 'Your objection' : t.kind === 'ruling' ? 'Judge · ruling' : t.kind === 'verdict' ? 'Judge · verdict' : roleName(t.speaker)}</p>
                <p className="tx-text">{t.text}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

function VerdictDialog({ kase, objections, onReplay, onNewCase, onExport, onClose }) {
  const v = kase.verdict;
  const count = Object.keys(objections).length;
  const approved = isApproved(kase);
  return (
    <Dialog title={v.headline} eyebrow={approved ? `Approved · Case ${kase.number}` : `Verdict · Case ${kase.number}`} onClose={onClose} size="lg" className={`verdict ${approved ? 'is-approved' : ''}`}
      footer={<><button className="btn btn-ghost" onClick={onExport}><Icon name="download" size={16} />Export hearing</button><button className="btn btn-ghost" onClick={onNewCase}><Icon name="case" size={16} />Another case</button><button className="btn btn-primary" onClick={onReplay} data-autofocus><Icon name="replay" size={16} />Replay</button></>}>
      <div className="verdict-seal" aria-hidden="true"><img src={judgeImg} alt="" /><span className={`stamp ${approved ? 'stamp-approved' : ''}`}>{approved ? 'Approved' : 'Ruled'}</span></div>
      <p className="verdict-summary">{v.summary}</p>
      <div className="verdict-grid">
        <article className="vcard vcard-paksh"><p className="eyebrow"><Seal role="paksh" size={16} />Possibility</p><p>{v.possibility}</p></article>
        <article className="vcard vcard-vipaksh"><p className="eyebrow"><Seal role="vipaksh" size={16} />Open risk</p><p>{v.risk}</p></article>
        <article className="vcard vcard-judge"><p className="eyebrow"><Seal role="judge" size={16} />{approved ? 'First milestone' : 'Next experiment'}</p><p>{v.experiment}</p></article>
      </div>
      {v.plan && (
        <section className="plan-section" aria-label="Starter plan">
          <div className="plan-head">
            <p className="eyebrow"><Icon name="check" size={16} />{v.plan.title}</p>
          </div>
          <ol className="plan">
            {v.plan.steps.map((s, idx) => (
              <li key={idx} className="plan-step">
                <div className="plan-step-head">
                  <span className="plan-when">{s.when}</span>
                  <strong className="plan-title">{s.title}</strong>
                </div>
                <p className="plan-detail">{s.detail}</p>
              </li>
            ))}
          </ol>
          {v.plan.track && (
            <div className="plan-track">
              <span className="eyebrow">Track</span>
              <div className="plan-chips">
                {v.plan.track.map((item) => (
                  <span key={item} className="chip chip-quiet">{item}</span>
                ))}
              </div>
            </div>
          )}
          {v.plan.budget && <p className="plan-budget muted">{v.plan.budget}</p>}
        </section>
      )}
      <div className="change">
        <p className="eyebrow">{approved ? 'The court would revisit this if' : 'The verdict would change if'}</p>
        <ul>{v.changeIf.map((c) => <li key={c}><Icon name="check" size={16} />{c}</li>)}</ul>
      </div>
      <p className="fine">{count ? `${count} ${count === 1 ? 'objection' : 'objections'} from you ${count === 1 ? 'is' : 'are'} on the record. ` : ''}{approved ? 'Illustrative approval from a scripted hearing with sample evidence — not a live AI review.' : 'Illustrative verdict from a scripted hearing — not a live AI review.'}</p>
    </Dialog>
  );
}

function ProfileDialog({ role, onClose, counsel, onOpenCounsel }) {
  const r = ROLES[role];
  const roleCfg = counsel?.roles?.[role];
  const conn = roleCfg?.connectionId ? counsel?.connections?.find((c) => c.id === roleCfg.connectionId) : null;
  const prov = conn ? PROVIDER_MAP[conn.provider] : null;
  const hasModel = !!(conn && roleCfg?.model);

  return (
    <Dialog title={r.name} eyebrow={r.title} onClose={onClose} size="md" className={`profile profile-${role}`}>
      <div className="profile-grid">
        <div className="portrait"><img src={PORTRAITS[role]} alt={`${r.name}, ${r.title}: a mascot with a ${role === 'paksh' ? 'terracotta plus' : role === 'judge' ? 'golden star' : 'sage-green slash'} medallion head, in a black advocate’s robe`} /></div>
        <div>
          <p className="motto">{r.motto}</p>
          <p>{r.bio}</p>
          <p className="eyebrow mt">Listens for</p>
          <ul className="looks">{r.looksFor.map((l) => <li key={l}><Seal role={role} size={14} />{l}</li>)}</ul>

          <div className="profile-model-box">
            <div className="profile-model-info">
              <span className="profile-model-label">Counsel & model</span>
              <span className="profile-model-val">
                {hasModel ? `${prov?.name || conn.provider} · ${roleCfg.model}` : 'Scripted (no model assigned)'}
              </span>
              {hasModel && conn.status === 'verified' && (
                <span className="hint" style={{ margin: 0, fontSize: '12px' }}>
                  <Icon name="check" size={12} /> Key {conn.keyHint} verified
                </span>
              )}
              {hasModel && conn.status === 'failed' && (
                <span className="error" style={{ margin: 0, fontSize: '12px' }}>
                  Key verification failed
                </span>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => onOpenCounsel(role)}>
              <Icon name="counsel" size={14} />{hasModel ? 'Change' : 'Configure'}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- welcome ---------- */
function Welcome({ leaving, onEnter, counsel }) {
  const demoBtn = useRef(null);
  useEffect(() => { demoBtn.current?.focus({ preventScroll: true }); }, []);

  const readyCount = counsel?.readyCount || 0;

  return (
    <div className={`welcome ${leaving ? 'is-leaving' : ''}`}>
      <div className="letterbox top" /><div className="letterbox bottom" />
      <div className="welcome-inner">
        <div className="welcome-seals" aria-hidden="true"><Seal role="paksh" size={34} /><Seal role="judge" size={44} /><Seal role="vipaksh" size={34} /></div>
        <p className="welcome-brand">Vichaar Sabha <span>· The court of better ideas</span></p>
        <h1 className="welcome-title">Every idea deserves<br />its day in court.</h1>
        <p className="welcome-sub">One voice sees the possibility. Another asks the hard questions. You leave with a clearer next step.</p>

        <div className="welcome-modes" role="region" aria-label="Choose hearing mode">
          {/* 1. Demo Mode */}
          <div className="welcome-mode-card welcome-mode-demo">
            <div className="welcome-mode-top">
              <span className="welcome-mode-chip">Demo Mode</span>
              <span className="welcome-mode-tag">Scripted · Instant</span>
            </div>
            <h2 className="welcome-mode-name">Scripted Courtroom</h2>
            <p className="welcome-mode-text">
              Explore 4 curated cases with pre-recorded dialogue, objections, and judge verdicts. No API keys required.
            </p>
            <button
              ref={demoBtn}
              type="button"
              className="btn btn-ghost btn-mode"
              onClick={() => onEnter('demo')}
            >
              <Icon name="case" size={16} />
              <span>Enter Demo</span>
              <Icon name="arrow" size={16} />
            </button>
          </div>

          {/* 2. Live AI Mode */}
          <div className="welcome-mode-card welcome-mode-live">
            <div className="welcome-mode-top">
              <span className="welcome-mode-chip chip-live-accent">
                <span className="live-dot" /> Live AI Mode
              </span>
              <span className="welcome-mode-tag">
                {readyCount > 0 ? `${readyCount}/3 counsel ready` : 'Multi-provider'}
              </span>
            </div>
            <h2 className="welcome-mode-name">Live AI Hearing</h2>
            <p className="welcome-mode-text">
              Powered by connected models (Gemini, Claude, OpenAI). Isolated orchestrator, quote checks against exhibits, and live advocate arguments.
            </p>
            <button
              type="button"
              className="btn btn-primary btn-mode"
              onClick={() => onEnter('live')}
            >
              <span className="live-dot pulse-white" />
              <span>Enter Live Mode</span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>

        <p className="welcome-fine">Choose a mode to enter · Switch anytime from the top bar inside the courtroom</p>
      </div>
    </div>
  );
}

/* ---------- app ---------- */
function App() {
  const vp = useViewport();
  const mobile = vp.w < 760;
  const compact = vp.w < 1100;
  const reduced = useMedia('(prefers-reduced-motion: reduce)');

  const [phase, setPhase] = useState('welcome');
  const [leaving, setLeaving] = useState(false);
  const [mode, setMode] = useState(() => store.get('vs:mode', 'demo')); // 'demo' | 'live'
  const [theme, setTheme] = useState(() => store.get('vs:theme', 'day'));
  const [sound, setSound] = useState(false);
  const [custom, setCustom] = useState(() => store.get('vs:custom', { title: '', brief: '', goal: '' }));
  const [caseId, setCaseId] = useState('gear');
  const kase = useMemo(() => (caseId === 'custom' ? buildCustomCase(custom) : CASES.find((c) => c.id === caseId)), [caseId, custom]);

  const [step, setStep] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [interjection, setInterjection] = useState(null);
  const [objections, setObjections] = useState({});
  const [transcript, setTranscript] = useState([]);
  const [evidence, setEvidence] = useState(() => CASES[0].exhibits);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(null);
  const logged = useRef(new Set());
  const ids = useRef(0);
  const verdictTimer = useRef(null);

  useEffect(() => { document.documentElement.dataset.theme = theme; store.set('vs:theme', theme); }, [theme]);

  const say = useCallback((msg) => { setToast({ msg, k: Date.now() }); }, []);
  const counsel = useCounsel({ say });
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 2600); return () => clearTimeout(t); }, [toast]);
  const play = useCallback((s) => { if (sound) SOUNDS[s]?.(); }, [sound]);
  const addEntry = useCallback((e) => setTranscript((t) => [...t, { id: ++ids.current, ...e }]), []);

  const goTo = useCallback((n, keepPlaying) => {
    clearTimeout(verdictTimer.current);
    setInterjection(null);
    setStep(n);
    setProgress(keepPlaying ? 0 : TYPE_SHARE);
    if (n >= 0 && n <= 4) {
      const s = kase.script[n];
      if (!logged.current.has(n)) { logged.current.add(n); addEntry({ kind: 'statement', speaker: s.speaker, text: s.text }); }
      play(s.speaker);
    }
  }, [kase, addEntry, play]);

  const finish = useCallback(() => {
    setPlaying(false); setInterjection(null); setStep(5); setProgress(1);
    const approved = isApproved(kase);
    if (!logged.current.has(5)) { logged.current.add(5); addEntry({ kind: 'verdict', speaker: 'judge', text: `${approved ? 'Approved — ' : ''}${kase.verdict.headline} ${kase.verdict.summary}` }); }
    play('gavel');
    clearTimeout(verdictTimer.current);
    verdictTimer.current = setTimeout(() => setDialog((d) => d || 'verdict'), reduced ? 150 : 1100);
  }, [kase, addEntry, play, reduced]);

  // statement clock (pauses while a dialog is open)
  useEffect(() => {
    if (!playing || dialog || step < 0 || step > 4) return undefined;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now(); const dt = now - last; last = now;
      setProgress((p) => Math.min(1, p + dt / STATEMENT_MS));
    }, 60);
    return () => clearInterval(id);
  }, [playing, dialog, step]);

  useEffect(() => {
    if (!playing || progress < 1) return;
    if (step < 4) goTo(step + 1, true); else if (step === 4) finish();
  }, [progress, playing, step, goTo, finish]);

  const reset = useCallback(() => {
    clearTimeout(verdictTimer.current);
    setPlaying(false); setStep(-1); setProgress(0); setInterjection(null); setObjections({}); setTranscript([]);
    logged.current = new Set();
  }, []);

  const begin = useCallback(() => { setPlaying(true); goTo(0, true); }, [goTo]);
  const primary = useCallback(() => {
    if (step === -1) begin();
    else if (step === 5) setDialog('verdict');
    else if (playing) { setPlaying(false); setProgress((p) => Math.max(p, TYPE_SHARE)); }
    else { setInterjection(null); setPlaying(true); }
  }, [step, playing, begin]);
  const next = useCallback(() => {
    if (step === -1) begin();
    else if (step < 4) goTo(step + 1, playing);
    else if (step === 4) finish();
  }, [step, playing, begin, goTo, finish]);
  const replay = useCallback(() => { setDialog(null); reset(); setTimeout(() => { setPlaying(true); goTo(0, true); }, 30); }, [reset, goTo]);
  const jump = useCallback((i) => { if (i === 5) { if (step >= 4) finish(); else say('The verdict comes after the judge speaks.'); return; } goTo(i, false); setPlaying(false); }, [goTo, finish, step, say]);

  const openCase = useCallback((id, data) => {
    reset();
    const k = id === 'custom' ? buildCustomCase(data) : CASES.find((c) => c.id === id);
    if (id === 'custom') { setCustom(data); store.set('vs:custom', data); }
    setCaseId(id); setEvidence(k.exhibits); setDialog(null);
    say(`Case ${k.number} opened · ${k.title}`);
  }, [reset, say]);

  const current = step >= 0 && step <= 4 ? kase.script[step] : null;
  const canObject = !!current && current.speaker !== 'judge' && !interjection && objections[step] == null;
  const objected = !!current && objections[step] != null;

  const chooseObjection = (cat) => {
    const s = kase.script[step];
    const o = OBJECTIONS.find((x) => x.id === cat);
    const rulingText = kase.rulings[cat];
    const status = rulingStatus(rulingText);
    setObjections((m) => ({ ...m, [step]: cat }));
    addEntry({ kind: 'objection', speaker: 'you', text: `${o.label} — against ${ROLES[s.speaker].name}: “${s.note}”` });
    addEntry({ kind: 'ruling', speaker: 'judge', text: rulingText });
    setInterjection({ text: rulingText, label: `Ruling · ${status || o.label}` });
    setPlaying(false); setProgress((p) => Math.max(p, TYPE_SHARE)); setDialog(null);
    play('gavel');
  };

  const addEvidence = (e) => { setEvidence((ev) => [...ev, { id: `u-${++ids.current}`, ...e }]); say('Added to the record'); play('soft'); };
  const submitNote = (text) => {
    const isLink = /^(https?:\/\/|www\.)\S+$/i.test(text);
    if (isLink) {
      const href = text.startsWith('http') ? text : `https://${text}`;
      let host = text; try { host = new URL(href).hostname.replace(/^www\./, ''); } catch { /* keep raw */ }
      addEvidence({ kind: 'link', title: host, detail: href, href });
      addEntry({ kind: 'note', speaker: 'you', text: `Source filed: ${href}` });
    } else {
      addEvidence({ kind: 'note', title: text });
      addEntry({ kind: 'note', speaker: 'you', text });
    }
  };

  const markdown = () => hearingMarkdown(kase, evidence, transcript);
  const exportMd = () => {
    try {
      const url = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `vichaar-sabha-${slug(kase.title)}.md` });
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      say('Hearing exported');
    } catch { say('Export isn’t available here — try Copy instead'); }
  };
  const copyMd = () => {
    (navigator.clipboard?.writeText(markdown()) || Promise.reject()).then(() => say('Transcript copied'), () => say('Copy isn’t available in this browser'));
  };

  // keyboard: Space = play/pause, → = next
  const keys = useRef({}); keys.current = { primary, next };
  useEffect(() => {
    const on = (e) => {
      if (phase !== 'court' || dialog) return;
      const t = e.target;
      if (t.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (e.key === ' ' && !t.closest?.('button, a')) { e.preventDefault(); keys.current.primary(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); keys.current.next(); }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [phase, dialog]);

  const enter = (chosenMode = 'demo') => {
    setMode(chosenMode);
    store.set('vs:mode', chosenMode);
    setLeaving(true);
    setTimeout(() => {
      setPhase('court'); setLeaving(false);
      setTimeout(() => document.querySelector('[data-primary]')?.focus({ preventScroll: true }), 60);
    }, reduced ? 0 : 1050);
  };

  /* who is on camera */
  const speaker = interjection ? 'judge' : current ? current.speaker : step === 5 ? 'judge' : null;
  const focus = phase === 'welcome' ? null : speaker || (step === -1 ? 'judge' : null);

  /* camera geometry: cover the viewport, pan/zoom toward the speaker */
  const geo = useMemo(() => {
    const baseW = Math.max(vp.w, vp.h * AR); const baseH = baseW / AR;
    const z = mobile ? (phase === 'welcome' && !leaving ? 1.22 : 1.12)
      : phase === 'welcome' && !leaving ? 1.1 : speaker && playing ? 1.045 : 1;
    const w = baseW * z; const h = baseH * z;
    const fx = focus ? ROLES[focus].anchor.x : 0.5;
    const ox = clamp(vp.w / 2 - fx * w, vp.w - w, 0);
    const fy = mobile && focus ? ROLES[focus].anchor.y : 0.5;
    const oy = clamp(vp.h * (mobile ? 0.44 : 0.47) - fy * h, vp.h - h, 0);
    return { baseW, baseH, z, w, h, ox, oy };
  }, [vp, focus, phase, leaving, mobile, speaker, playing]);

  /* speech-bubble data + placement */
  const bubble = useMemo(() => {
    if (phase !== 'court') return null;
    if (interjection) return { key: `i-${transcript.length}`, speaker: 'judge', label: interjection.label, text: interjection.text, kind: 'ruling' };
    if (current) {
      const frac = progress / TYPE_SHARE;
      return { key: `s-${caseId}-${step}`, speaker: current.speaker, text: current.text, typing: frac < 1, fraction: frac, progress, counter: `${step + 1} / 5` };
    }
    if (step === 5) {
      const approved = isApproved(kase);
      return {
        key: `v-${caseId}`,
        speaker: 'judge',
        label: approved ? 'Approved' : 'Verdict delivered',
        text: approved
          ? `${kase.verdict.headline} Open the verdict for the starter plan.`
          : `${kase.verdict.headline} Open the verdict for the full reasoning and the next experiment.`,
        kind: 'ruling',
      };
    }
    return { key: `w-${caseId}`, speaker: 'judge', label: 'Court assembled', text: `Today’s matter: “${kase.title}”. ${kase.headline} Press Begin hearing when you’re ready.` };
  }, [phase, interjection, current, progress, step, caseId, kase, transcript.length]);

  const bubblePos = useMemo(() => {
    if (!bubble || mobile) return null;
    const r = ROLES[bubble.speaker];
    const hx = geo.ox + r.anchor.x * geo.w; const hy = geo.oy + r.anchor.y * geo.h; const rad = r.r * geo.w;
    const width = Math.min(380, vp.w - 48);
    const leftSafe = 24 + 312 + 20; const rightSafe = compact ? 24 : 24 + 312 + 20;
    const top = Math.max(hy - rad - 22, 300);
    if (bubble.speaker === 'paksh') return { left: clamp(Math.max(hx + rad + 26, leftSafe), 24, vp.w - width - rightSafe), top, width, tail: 'left' };
    if (bubble.speaker === 'vipaksh') return { left: clamp(hx - rad - 26 - width, leftSafe, vp.w - width - rightSafe), top, width, tail: 'right' };
    return { left: clamp(hx - width / 2, leftSafe, vp.w - width - rightSafe), top: Math.max(hy - rad - 26, 280), width, tail: 'center' };
  }, [bubble, geo, vp, mobile, compact]);

  const approved = isApproved(kase);
  const status = phase !== 'court' ? '' : interjection ? 'Objection · Judge ruling'
    : step === -1 ? 'Court assembled · Ready'
    : step === 5 ? (approved ? 'Verdict delivered · Approved' : 'Verdict delivered')
    : `${playing ? 'In session' : 'Paused'} · ${ROLES[current.speaker].name} speaking`;
  const live = phase === 'court' && (playing || interjection);
  const userNotes = transcript.filter((t) => t.kind === 'note').length;

  return (
    <div className={`app ${mobile ? 'is-mobile' : ''} ${compact ? 'is-compact' : ''} ${reduced ? 'reduced' : ''}`}>
      <SealDefs />
      <Scene
        geo={geo}
        focus={focus}
        phase={phase}
        speaking={phase === 'court' ? speaker : null}
        onRole={(r) => phase === 'court' && setDialog(`profile:${r}`)}
        roles={counsel.roles}
        connections={counsel.connections}
      />

      {phase === 'welcome' && <Welcome leaving={leaving} onEnter={enter} counsel={counsel} />}

      {phase === 'court' && (
        <div className="ui">
          <header className="topbar">
            <div className="brand"><Seal role="judge" size={30} /><div><p className="brand-name">Vichaar Sabha</p>{!mobile && <p className="brand-tag">The court of better ideas</p>}</div></div>
            <div className={`status glass ${live ? 'is-live' : ''}`} role="status" aria-live="polite"><span className="dot" />{status}</div>
            <div className="top-actions">
              <div className="segmented mode-switcher" role="radiogroup" aria-label="Courtroom mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'demo'}
                  className={mode === 'demo' ? 'is-on' : ''}
                  onClick={() => {
                    setMode('demo');
                    store.set('vs:mode', 'demo');
                    say('Switched to Demo Mode (scripted)');
                  }}
                  title="Demo Mode: Scripted sample hearing"
                >
                  <Icon name="case" size={13} />
                  <span>Demo</span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'live'}
                  className={mode === 'live' ? 'is-on' : ''}
                  onClick={() => {
                    setMode('live');
                    store.set('vs:mode', 'live');
                    say('Switched to Live AI Mode');
                  }}
                  title="Live AI Mode: Connected models & live hearings"
                >
                  <span className="live-dot" />
                  <span>Live AI</span>
                </button>
              </div>

              {!mobile && (
                mode === 'live' ? (
                  <span className="chip chip-live-mode" title="Live AI mode active">
                    <span className="live-dot" />
                    {counsel.readyCount > 0 ? `${counsel.readyCount}/3 ready` : 'Live AI'}
                  </span>
                ) : (
                  <span className="chip chip-demo" title="Dialogue and verdicts are scripted samples">
                    Interactive demo
                  </span>
                )
              )}
              {compact && <button className="icon-btn glass" onClick={() => setDialog('notes')} aria-label="Hearing notes"><Icon name="notes" /></button>}
              <button
                className="icon-btn glass"
                onClick={() => setDialog('counsel')}
                aria-label="Counsel & models"
                title="Counsel & models"
              >
                <Icon name="counsel" />
                {(counsel.readyCount > 0 || counsel.hasFailed) && (
                  <span
                    className={`badge ${
                      counsel.hasFailed
                        ? 'badge-bad'
                        : counsel.readyCount === 3
                        ? 'badge-ok'
                        : 'badge-warn'
                    }`}
                  >
                    {counsel.hasFailed && counsel.readyCount === 0 ? '!' : `${counsel.readyCount}/3`}
                  </span>
                )}
              </button>
              <button className="icon-btn glass" onClick={() => setDialog('transcript')} aria-label="Transcript" title="Transcript"><Icon name="scroll" />{transcript.length > 0 && <span className="badge">{transcript.length}</span>}</button>
              <button className="icon-btn glass" onClick={() => setTheme(theme === 'day' ? 'evening' : 'day')} aria-label={theme === 'day' ? 'Switch to evening light' : 'Switch to daylight'} title="Light"><Icon name={theme === 'day' ? 'moon' : 'sun'} /></button>
              <button className="icon-btn glass" onClick={() => { const s = !sound; setSound(s); if (s) SOUNDS.soft(); }} aria-pressed={sound} aria-label={sound ? 'Mute sound cues' : 'Turn on sound cues'} title="Sound"><Icon name={sound ? 'soundOn' : 'soundOff'} /></button>
            </div>
          </header>

          <CaseCard
            kase={kase}
            evidenceCount={evidence.length}
            compact={mobile || compact || vp.h < 760}
            mobile={mobile}
            onBrief={() => setDialog('brief')}
            onEvidence={() => setDialog('evidence')}
            counsel={counsel}
            onHearPakshLive={() => setDialog('paksh-live')}
            onOpenCounsel={(r) => setDialog(`counsel:${r || 'paksh'}`)}
            mode={mode}
            onSwitchMode={setMode}
          />
          {!compact && <NotesCard kase={kase} step={step} objections={objections} userNotes={userNotes} />}

          <Bubble data={bubble} pos={bubblePos} mobile={mobile} reduced={reduced} />
          <p className="sr-only" aria-live="polite">{bubble ? `${ROLES[bubble.speaker].name}: ${bubble.text}` : ''}</p>

          <Dock kase={kase} step={step} playing={playing} mobile={mobile} interjection={interjection}
            onPrimary={primary} onNext={next} onReplay={replay} onStep={jump}
            onObject={() => { setPlaying(false); setDialog('objection'); }} canObject={canObject} objected={objected}
            onSubmitNote={submitNote} onAttach={() => setDialog('evidence:file')} />

          <p className="scripted-tag">
            {mode === 'live'
              ? `Live AI Mode · ${counsel.readyCount > 0 ? `${counsel.readyCount}/3 counsel configured` : 'Configure counsel in top bar'}`
              : 'Scripted hearing · no live AI'}
          </p>
          {toast && <div className="toast glass glass-strong" key={toast.k} role="status">{toast.msg}</div>}
        </div>
      )}

      {dialog === 'brief' && <BriefDialog current={kase} custom={custom} onClose={() => setDialog(null)} onOpenSample={(id) => openCase(id)} onOpenCustom={(d) => openCase('custom', d)} />}
      {dialog?.startsWith('evidence') && <EvidenceDialog evidence={evidence} startWith={dialog === 'evidence:file' ? 'file' : undefined} onClose={() => setDialog(null)} onAdd={addEvidence} onRemove={(id) => setEvidence((ev) => ev.filter((e) => e.id !== id))} />}
      {dialog === 'objection' && current && <ObjectionDialog statement={current} onChoose={chooseObjection} onClose={() => setDialog(null)} />}
      {dialog === 'transcript' && <TranscriptDialog kase={kase} transcript={transcript} onExport={exportMd} onCopy={copyMd} onClose={() => setDialog(null)} />}
      {dialog === 'verdict' && <VerdictDialog kase={kase} objections={objections} onReplay={replay} onExport={exportMd} onNewCase={() => setDialog('brief')} onClose={() => setDialog(null)} />}
      {dialog === 'notes' && <Dialog title="Hearing notes" eyebrow={`Case ${kase.number}`} onClose={() => setDialog(null)} size="sm"><NotesList kase={kase} step={step} objections={objections} userNotes={userNotes} /></Dialog>}
      {dialog?.startsWith('profile:') && (
        <ProfileDialog
          role={dialog.split(':')[1]}
          counsel={counsel}
          onOpenCounsel={(r) => setDialog(`counsel:${r}`)}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.startsWith('counsel') && (
        <CounselDialog
          counsel={counsel}
          initialFocusRole={dialog.includes(':') ? dialog.split(':')[1] : null}
          onClose={() => setDialog(null)}
          say={say}
        />
      )}
      {dialog === 'paksh-live' && (
        <PakshLiveDialog
          kase={kase}
          counsel={counsel}
          onClose={() => setDialog(null)}
          onOpenCounsel={(r) => setDialog(`counsel:${r || 'paksh'}`)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
