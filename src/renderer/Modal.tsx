import { useEffect, useRef, type ReactNode } from 'react';
export function Modal({
  children,
  onClose,
  label,
  className,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  className?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialogRef}
      className={`modal${className ? ` ${className}` : ''}`}
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]',
          ),
        ).filter(control => {
          if (!control.getClientRects().length) return false;
          const collapsed = control.closest('details:not([open])');
          if (collapsed && !collapsed.querySelector(':scope > summary')?.contains(control)) return false;
          if (control instanceof HTMLInputElement && control.type === 'radio' && control.name && !control.checked) {
            return !Array.from(event.currentTarget.querySelectorAll<HTMLInputElement>('input[type="radio"]')).some(radio => radio.name === control.name && radio.checked);
          }
          return true;
        });
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
