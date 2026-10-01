import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
export function Modal({ title, onClose, children, wide = false, eyebrow = 'KCM · 샘플 화면' }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; eyebrow?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); if (previous?.isConnected) previous.focus(); else document.getElementById('main-content')?.focus(); };
  }, []);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby="modal-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className="modal-content">
      <header className="modal-header"><div><span className="eyebrow">{eyebrow}</span><h2 id="modal-title">{title}</h2></div><button className="icon-button" aria-label="닫기" onClick={onClose}><Icon name="close"/></button></header>
      {children}
    </div>
  </dialog>;
}
