export function shouldShowBlockerPrompt(view: string, blockerOpen: boolean, reason?: string) {
  return view === 'execute' && blockerOpen && !reason;
}

export function normalizeBlockerReason(value: string) {
  const reason = value.trim();
  return reason || null;
}