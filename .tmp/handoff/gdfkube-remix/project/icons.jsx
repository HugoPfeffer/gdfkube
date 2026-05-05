// Reusable icons (line style, 16px) — original geometry, no branded glyphs.
const I = ({ d, size = 16, fill = "none", stroke = "currentColor", sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
);

const Icons = {
  home:    (p) => <I {...p} d={<><path d="M2.5 7L8 2.5L13.5 7v6.5h-4v-4h-3v4h-4z"/></>} />,
  catalog: (p) => <I {...p} d={<><rect x="2" y="2" width="5" height="5" rx="0.5"/><rect x="9" y="2" width="5" height="5" rx="0.5"/><rect x="2" y="9" width="5" height="5" rx="0.5"/><rect x="9" y="9" width="5" height="5" rx="0.5"/></>} />,
  list:    (p) => <I {...p} d={<><path d="M2 4h12M2 8h12M2 12h8"/></>} />,
  doc:     (p) => <I {...p} d={<><path d="M3.5 1.5h6L13 5v9.5H3.5z"/><path d="M9 1.5V5h4M5.5 8.5h5M5.5 11h5"/></>} />,
  shield:  (p) => <I {...p} d={<><path d="M8 1.5L13 3v5c0 3-2.2 5.4-5 6.5C5.2 13.4 3 11 3 8V3z"/></>} />,
  cluster: (p) => <I {...p} d={<><circle cx="8" cy="4" r="2"/><circle cx="3.5" cy="11.5" r="2"/><circle cx="12.5" cy="11.5" r="2"/><path d="M8 6v3M6.5 10.5l-2 1M9.5 10.5l2 1"/></>} />,
  bell:    (p) => <I {...p} d={<><path d="M3.5 11h9l-1.2-1.5V7c0-2-1.4-3.5-3.3-3.5C6.1 3.5 4.7 5 4.7 7v2.5z"/><path d="M6.5 13a1.5 1.5 0 003 0"/></>} />,
  search:  (p) => <I {...p} d={<><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/></>} />,
  chevronDown: (p) => <I {...p} d={<><path d="M4 6l4 4 4-4"/></>} />,
  chevronRight: (p) => <I {...p} d={<><path d="M6 4l4 4-4 4"/></>} />,
  plus:    (p) => <I {...p} d={<><path d="M8 3v10M3 8h10"/></>} />,
  filter:  (p) => <I {...p} d={<><path d="M2 3h12l-4.5 6V14L6.5 12V9z"/></>} />,
  refresh: (p) => <I {...p} d={<><path d="M13 6.5A5 5 0 003 7M3 4v3h3M3 9.5A5 5 0 0013 9M13 12V9h-3"/></>} />,
  download:(p) => <I {...p} d={<><path d="M8 2v8M4.5 7.5L8 11l3.5-3.5M3 13h10"/></>} />,
  ext:     (p) => <I {...p} d={<><path d="M9 3h4v4M13 3l-6 6M11 9v3.5H3V4h3.5"/></>} />,
  check:   (p) => <I {...p} d={<><path d="M3 8.5L6.5 12 13 4.5"/></>} />,
  x:       (p) => <I {...p} d={<><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></>} />,
  alert:   (p) => <I {...p} d={<><path d="M8 1.5L14.5 13.5h-13z"/><path d="M8 6v3.5M8 11.5v0.5"/></>} />,
  info:    (p) => <I {...p} d={<><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5v0.5"/></>} />,
  user:    (p) => <I {...p} d={<><circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c0-2.5 2.2-4.5 5-4.5s5 2 5 4.5"/></>} />,
  users:   (p) => <I {...p} d={<><circle cx="6" cy="6" r="2"/><circle cx="11" cy="6.5" r="1.5"/><path d="M2 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5M10 13c0-1.6 1.3-2.7 3-2.7"/></>} />,
  cog:     (p) => <I {...p} d={<><circle cx="8" cy="8" r="2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"/></>} />,
  chart:   (p) => <I {...p} d={<><path d="M2 13h12M4 11V8M7 11V5M10 11V7M13 11V3"/></>} />,
  db:      (p) => <I {...p} d={<><ellipse cx="8" cy="3.5" rx="5" ry="1.5"/><path d="M3 3.5v9c0 0.8 2.2 1.5 5 1.5s5-0.7 5-1.5v-9M3 8c0 0.8 2.2 1.5 5 1.5s5-0.7 5-1.5"/></>} />,
  form:    (p) => <I {...p} d={<><rect x="2.5" y="2" width="11" height="12" rx="0.5"/><path d="M5 5h6M5 8h6M5 11h4"/></>} />,
  cdc:     (p) => <I {...p} d={<><path d="M2 8a3 3 0 016 0 3 3 0 006 0"/><path d="M11.5 6.5L14 8l-2.5 1.5"/></>} />,
  stream:  (p) => <I {...p} d={<><path d="M2 5h12M2 8h8M2 11h12"/></>} />,
  gears:   (p) => <I {...p} d={<><circle cx="8" cy="8" r="2.5"/><path d="M8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.8 3.8l1 1M11.2 11.2l1 1M3.8 12.2l1-1M11.2 4.8l1-1"/></>} />,
  git:     (p) => <I {...p} d={<><circle cx="4" cy="4" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="12" cy="8" r="1.5"/><path d="M4 5.5v5M5.5 12c3.5 0 5-1.7 5-4"/></>} />,
  ns:      (p) => <I {...p} d={<><rect x="2" y="3" width="12" height="10" rx="0.5"/><path d="M2 6h12M5 9.5h6"/></>} />,
  scale:   (p) => <I {...p} d={<><path d="M3 13L13 3M9 3h4v4M7 13H3v-4"/></>} />,
  trash:   (p) => <I {...p} d={<><path d="M3 4h10M5.5 4V2.5h5V4M4.5 4l0.5 9h6l0.5-9M7 7v4M9 7v4"/></>} />,
  key:     (p) => <I {...p} d={<><circle cx="5" cy="11" r="2.5"/><path d="M7 10l5-5M10 5l1 1M11 4l1 1.5"/></>} />,
  clock:   (p) => <I {...p} d={<><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/></>} />,
  pin:     (p) => <I {...p} d={<><path d="M8 1.5L9.5 5L13 5.5L10.5 8L11 11.5L8 9.8L5 11.5L5.5 8L3 5.5L6.5 5z"/></>} />,
  link:    (p) => <I {...p} d={<><path d="M7 9.5l-2 2a2.5 2.5 0 11-3.5-3.5l2-2M9 6.5l2-2a2.5 2.5 0 113.5 3.5l-2 2M6 10l4-4"/></>} />,
  copy:    (p) => <I {...p} d={<><rect x="5" y="5" width="8.5" height="8.5" rx="1"/><path d="M3.5 10.5h-1V3a0.5 0.5 0 01.5-.5H10v1"/></>} />,
};
window.Icons = Icons;
