import React from 'react';

type Props = {
  onClick: () => void;
  loading?: boolean;
};

export default function CalcButton({ onClick, loading }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      className="shrink-0 h-[44px] rounded-xl px-3 bg-sky-600 hover:bg-sky-500 transition text-sm font-semibold shadow disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? '...' : 'Calc'}
    </button>
  );
}
