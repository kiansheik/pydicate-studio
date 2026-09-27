/**
 * The packaged window denies the renderer's clipboard permission, so a bare
 * navigator.clipboard.writeText fails with NotAllowedError. The desktop bridge writes from
 * the main process and has no such gate, so it goes first; a hidden selection copy is the
 * last resort for a plain browser that refuses the async API.
 */
export async function copyText(text: string) {
  const bridge = window.studio?.copyText;
  if (bridge) {
    try {
      await bridge(text);
      return;
    } catch {
      // A failing bridge still leaves the two browser paths worth trying.
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch (denied) {
    if (!selectionCopy(text))
      throw new Error(
        `Não foi possível copiar (${denied instanceof Error ? denied.message : String(denied)}). Selecione o texto e copie com o teclado.`,
      );
  }
}

function selectionCopy(text: string) {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.setAttribute('aria-hidden', 'true');
  field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.append(field);
  const restore = document.activeElement as HTMLElement | null;
  try {
    field.select();
    field.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
    restore?.focus?.();
  }
}
