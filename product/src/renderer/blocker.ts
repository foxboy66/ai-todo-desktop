export function shouldShowBlockerPrompt(view: string, blockerOpen: boolean, reason?: string) {
  return view === 'execute' && blockerOpen && !reason;
}