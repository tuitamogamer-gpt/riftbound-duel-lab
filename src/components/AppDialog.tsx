import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";
import "./AppDialog.css";

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
  const headingId = useId();
  const backdropPress = useRef(false);
  let labelledBy: string | undefined;
  const content = Children.map(children, (child) => {
    if (
      !labelledBy &&
      isValidElement<{ id?: string }>(child) &&
      child.type === "h2"
    ) {
      labelledBy = child.props.id || headingId;
      return cloneElement(child, { id: labelledBy });
    }
    return child;
  });
  return (
    <div
      className="modal-backdrop app-dialog-backdrop"
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget)
          close();
        backdropPress.current = false;
      }}
    >
      <section
        ref={panel}
        className={`modal app-dialog ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </section>
    </div>
  );
}
