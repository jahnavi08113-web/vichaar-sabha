const P = {
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  pause: <g fill="currentColor" stroke="none"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></g>,
  next: <><path d="M6 5.5v13l9-6.5z" fill="currentColor" stroke="none" /><path d="M18 5.5v13" /></>,
  flag: <><path d="M5.5 21V4" /><path d="M5.5 4.5h11l-2.2 4 2.2 4h-11" /></>,
  scroll: <><rect x="5" y="3.5" width="14" height="17" rx="2.5" /><path d="M9 8.5h6M9 12h6M9 15.5h3.5" /></>,
  clip: <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.3-8.3a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.6 1.6 0 0 1-2.3-2.3l7.5-7.5" />,
  send: <><path d="M4.5 12L20 4.5 15 20l-3-6.2z" /><path d="M12 13.8L20 4.5" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></>,
  moon: <path d="M19.5 14.5A8 8 0 1 1 9.5 4.5a6.3 6.3 0 0 0 10 10z" />,
  soundOn: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  soundOff: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  edit: <><path d="M4.5 19.5h4l10-10-4-4-10 10z" /><path d="M13 7l4 4" /></>,
  gavel: <><path d="M13.5 4.2l6.3 6.3M10.7 7l6.3 6.3M12.1 5.6l-4.9 4.9 6.3 6.3 4.9-4.9" /><path d="M9.8 13.2L4 19" /><path d="M12.5 20.5h8" /></>,
  download: <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />,
  replay: <><path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4" /><path d="M4.5 4v4.5H9" /></>,
  case: <><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3.5 12.5h17" /></>,
  notes: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" strokeWidth="2.2" />,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  file: <><path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" /><path d="M14 3.5V8h4.5" /></>,
  pen: <><path d="M5 19h14" /><path d="M7 15.5l1-3.5 8-8 2.5 2.5-8 8z" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 19.5a7 7 0 0 1 14 0" /></>,
  spark: <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z" />,
  counsel: <><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 9h6v6H9z" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>,
};

export function Icon({ name, size = 20, className = '', ...rest }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {P[name]}
    </svg>
  );
}

const star = Array.from({ length: 16 }, (_, i) => {
  const a = (i * Math.PI) / 8 - Math.PI / 2;
  const r = i % 2 ? 4.6 : 10.5;
  return `${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

// Role seals mirror the painted head symbols: plus (Paksh), eight-point star (Judge), slash (Vipaksh).
export function Seal({ role, size = 28, className = '' }) {
  return (
    <svg className={`seal seal-${role} ${className}`} width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="19" className="seal-face" />
      <circle cx="20" cy="20" r="19" fill="url(#sealShine)" />
      {role === 'paksh' && <path d="M20 11.5v17M11.5 20h17" stroke="#3a2418" strokeWidth="4" strokeLinecap="round" />}
      {role === 'judge' && <polygon points={star} fill="#4a2d10" />}
      {role === 'vipaksh' && <path d="M23.5 11.5l-7 17" stroke="#2c3a28" strokeWidth="4" strokeLinecap="round" />}
      {role === 'you' && <><circle cx="20" cy="16.5" r="4.6" fill="#fff6ea" /><path d="M12 29a8 8 0 0 1 16 0" fill="#fff6ea" /></>}
    </svg>
  );
}

export function SealDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="sealShine" cx="35%" cy="28%" r="75%">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" />
          <stop offset=".45" stopColor="#fff" stopOpacity=".08" />
          <stop offset="1" stopColor="#000" stopOpacity=".18" />
        </radialGradient>
      </defs>
    </svg>
  );
}
