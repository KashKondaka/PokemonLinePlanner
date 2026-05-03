import React, { useState } from 'react';

type Props = {
  side: 'left' | 'right';
  children: React.ReactNode;
  title?: string;
};

export default function FlyoutPanel({ side, children, title }: Props) {
  const [open, setOpen] = useState(false);

  const arrowChar = open
    ? (side === 'left' ? '◀' : '▶')
    : (side === 'left' ? '▶' : '◀');

  return (
    <div
      className={`absolute ${side === 'left' ? 'left-0' : 'right-0'} top-0 bottom-0 z-20 flex ${side === 'right' ? 'flex-row-reverse' : 'flex-row'} transition-transform duration-300 ease-in-out`}
      style={{
        width: open ? 380 : 24,
      }}
    >
      {open && (
        <div className="flex-1 min-w-0 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl flex flex-col" style={{ height: '80vh' }}>
          {title && (
            <div className="px-3 py-2 border-b border-neutral-800 text-xs font-semibold text-neutral-400 shrink-0">
              {title}
            </div>
          )}
          <div className="flex-1 overflow-y-auto overflow-x-visible p-3">
            {children}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(!open)}
        className={`w-6 shrink-0 flex items-center justify-center bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 transition cursor-pointer self-center ${
          side === 'left' ? 'rounded-r-lg border-l-0' : 'rounded-l-lg border-r-0'
        }`}
        style={{ height: 60 }}
        title={open ? 'Collapse' : 'Expand'}
      >
        <span className="text-xs text-neutral-400">{arrowChar}</span>
      </button>
    </div>
  );
}
