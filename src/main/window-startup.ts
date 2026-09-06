// A hidden window is revealed once both Chromium and the restored UI are ready.
export function createWindowStartup(show: () => void) {
  let paintReady = false;
  let rendererReady = false;
  let shown = false;
  function reveal() {
    if (!shown && paintReady && rendererReady) {
      shown = true;
      show();
    }
  }
  return {
    paintReady() { paintReady = true; reveal(); },
    rendererReady() { rendererReady = true; reveal(); },
    isShown() { return shown; },
  };
}
