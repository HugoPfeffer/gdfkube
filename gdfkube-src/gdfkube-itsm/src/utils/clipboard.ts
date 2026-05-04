/**
 * Copy `text` to the user's clipboard.
 *
 * Tries the modern `navigator.clipboard.writeText` API first. If that is
 * unavailable or rejects (e.g. document not focused, missing permission), falls
 * back to a hidden `<textarea>` + `document.execCommand("copy")`.
 *
 * Always resolves — never rejects — so callers don't need a try/catch.
 */
export async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // fall through to textarea fallback
    }
  }

  fallbackCopy(text);
}

function fallbackCopy(text: string): void {
  if (typeof document === 'undefined') return;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
  } catch {
    // best-effort; nothing more to do
  }
  document.body.removeChild(ta);
}
