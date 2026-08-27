import { X } from 'lucide-react'
import type { PropsWithChildren, ReactNode } from 'react'

interface ModalProps extends PropsWithChildren {
  title: string
  eyebrow?: string
  onClose: () => void
  footer?: ReactNode
  wide?: boolean
}

export function Modal({ title, eyebrow, onClose, footer, wide, children }: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? 'modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id="modal-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </section>
    </div>
  )
}
