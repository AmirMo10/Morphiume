"use client";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

/** Native modal behavior supplies focus containment, Escape and an inert background. */
export function StorefrontDialog({ open, onClose, title, children, className = "", initialFocusRef }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string; initialFocusRef?: RefObject<HTMLElement | null> }) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId();
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current, previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = "hidden";
    initialFocusRef?.current?.focus();
    return () => { element.close(); document.body.style.overflow = previousOverflow; if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [open, initialFocusRef]);
  return <dialog ref={dialog} className={`sf-dialog ${className}`} aria-labelledby={heading} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sf-dialog-content"><div className="sf-dialog-heading"><h2 id={heading}>{title}</h2><button type="button" className="sf-close" aria-label={`بستن ${title}`} onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button></div>{open && children}</div>
  </dialog>;
}
