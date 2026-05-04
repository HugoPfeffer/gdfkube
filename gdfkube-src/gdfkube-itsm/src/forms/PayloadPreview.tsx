// PayloadPreview — read-only JSON pretty-print of the meta + vars that will
// be submitted. Updates on every prop change (React handles this automatically).

interface PayloadPreviewProps {
  meta: Record<string, unknown>;
  vars: Record<string, unknown>;
}

export function PayloadPreview({ meta, vars }: PayloadPreviewProps) {
  return (
    <pre className="payload-preview">
      {JSON.stringify({ meta, vars }, null, 2)}
    </pre>
  );
}

export default PayloadPreview;
