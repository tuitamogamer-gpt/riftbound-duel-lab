import type { ReactNode } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";

export function AppDialog({
  children,
  className,
  label,
  close,
}: {
  children: ReactNode;
  className: string;
  label: string;
  close: () => void;
}) {
  const panel = useDialogFocus(close);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={panel}
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}
