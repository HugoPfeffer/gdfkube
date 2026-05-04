// UtilityBand: top-of-app environment indicator with version label.
// Mirrors the bundle's verbatim copy from gdfkube-remix/project/shell.jsx.

export function UtilityBand() {
  return (
    <div className="utility">
      <span>
        <span className="dot"></span>Demo environment · operational
      </span>
      <span className="spacer"></span>
      <span style={{ opacity: 0.7 }}>v0.4.2-rc1</span>
    </div>
  );
}

export default UtilityBand;
