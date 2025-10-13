import React from 'react';

type Props = {
  onClick: () => void;
};

export default function DeleteButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 h-[44px] rounded-xl px-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition text-sm font-semibold shadow"
    >
      Delete
    </button>
  );
}
