import React, { useRef, useState } from 'react';

type Props = {
  label: string;
  accept?: string;
  onFileText: (text: string, filename?: string) => void;
  onClear: () => void;
  currentText: string;
};

export default function FilePicker({
  label,
  accept = '.txt',
  onFileText,
  onClear,
  currentText,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');

  const handlePick = () => inputRef.current?.click();

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setFileName(f.name);
      onFileText(String(r.result || ''), f.name);
    };
    r.readAsText(f);
  };

  const handleClear = () => {
    setFileName('');
    onClear();
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
      <button
        onClick={handlePick}
        className="rounded-xl px-3 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
      >
        Upload {label}
      </button>
      <button
        onClick={handleClear}
        className="rounded-xl px-3 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-sm"
      >
        Clear
      </button>
      <div className="text-xs text-neutral-400 truncate">
        {fileName ? fileName : currentText ? '(from text)' : 'No file selected'}
      </div>
    </div>
  );
}
