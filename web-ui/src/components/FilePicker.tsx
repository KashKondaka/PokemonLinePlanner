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
  const [modalOpen, setModalOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const handleFileSelect = () => inputRef.current?.click();

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setFileName(f.name);
      onFileText(String(r.result || ''), f.name);
      setModalOpen(false);
      setPasteText('');
    };
    r.readAsText(f);
  };

  const handlePasteSubmit = () => {
    if (!pasteText.trim()) return;
    setFileName('');
    onFileText(pasteText);
    setModalOpen(false);
    setPasteText('');
  };

  const handleClear = () => {
    setFileName('');
    onClear();
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleChange}
        />
        <button
          onClick={() => setModalOpen(true)}
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

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-4">Upload {label}</h3>

            <div className="mb-4">
              <button
                onClick={handleFileSelect}
                className="w-full rounded-xl px-4 py-3 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm transition"
              >
                Choose file from disk...
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-neutral-700" />
              <span className="text-xs text-neutral-500">or paste below</span>
              <div className="flex-1 h-px bg-neutral-700" />
            </div>

            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`Paste your ${label} contents here...`}
              className="w-full h-48 rounded-xl bg-neutral-800 border border-neutral-700 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 resize-none focus:outline-none focus:border-neutral-500"
              autoFocus
            />

            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setModalOpen(false); setPasteText(''); }}
                className="rounded-xl px-4 py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePasteSubmit}
                disabled={!pasteText.trim()}
                className="rounded-xl px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 disabled:text-neutral-500 text-sm font-semibold transition"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
