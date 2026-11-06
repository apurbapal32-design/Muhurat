import React, { useState } from 'react';
import {
  Check,
  Code2,
  Copy,
  Download,
  FileCode,
  Folder,
  Server,
  Terminal,
} from 'lucide-react';
import { PYTHON_PROJECT_FILES } from '../utils/pythonCodeGenerator';

interface PythonExporterViewProps {
  theme?: 'dark' | 'light';
}

export const PythonExporterView: React.FC<PythonExporterViewProps> = ({
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const [selectedFilename, setSelectedFilename] = useState<string>('main.py');
  const [copied, setCopied] = useState<boolean>(false);

  const selectedFile =
    PYTHON_PROJECT_FILES.find((f) => f.filename === selectedFilename) ||
    PYTHON_PROJECT_FILES[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSingle = () => {
    const blob = new Blob([selectedFile.code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`border rounded-2xl p-4 sm:p-6 my-4 sm:my-6 transition-colors ${
        isDark
          ? 'bg-slate-900 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      }`}
    >
      {/* Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl ${
              isDark ? 'bg-slate-950 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
            }`}
          >
            <Code2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black italic tracking-tight uppercase flex items-center gap-2 flex-wrap">
              <span>Python 3.12 Engine Source Code</span>
              <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 font-mono font-bold rounded shadow-sm">
                FastAPI • Streamlit • TA-Lib
              </span>
            </h2>
            <p className="text-xs font-mono opacity-60">
              Multi-threaded production architecture, TA-Lib indicators, APScheduler, and Docker support
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono flex-wrap">
          <button
            onClick={handleCopy}
            className={`px-3.5 py-2 text-xs font-bold uppercase rounded-xl border transition-all flex items-center gap-1.5 ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? 'Copied Code' : 'Copy File'}</span>
          </button>

          <button
            onClick={handleDownloadSingle}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase rounded-xl transition-all flex items-center gap-1.5 shadow-md"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {selectedFile.filename}</span>
          </button>
        </div>
      </div>

      {/* Code Browser Layout */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 font-mono">
        {/* File Tree Navigation Sidebar */}
        <div
          className={`p-3 rounded-xl border space-y-1 ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div
            className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1.5 mb-1 flex items-center gap-1.5 border-b ${
              isDark ? 'border-slate-800 opacity-80' : 'border-slate-200 opacity-80'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>Project Files</span>
          </div>

          {PYTHON_PROJECT_FILES.map((file) => (
            <button
              key={file.filename}
              onClick={() => setSelectedFilename(file.filename)}
              className={`w-full text-left px-3 py-2 text-xs font-mono rounded-lg transition-all flex items-center justify-between border ${
                selectedFilename === file.filename
                  ? 'bg-emerald-600 text-white font-bold border-emerald-500 shadow-sm'
                  : isDark
                  ? 'border-transparent text-slate-300 hover:bg-slate-800'
                  : 'border-transparent text-slate-700 hover:bg-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <FileCode className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{file.filename}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Code View Canvas */}
        <div
          className={`md:col-span-3 rounded-xl border p-4 flex flex-col font-mono ${
            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div
            className={`flex items-center justify-between pb-3 mb-3 border-b text-xs ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <span className="font-bold flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span>{selectedFile.filename}</span>
            </span>
            <span className="text-[11px] font-bold opacity-60">
              {selectedFile.code.split('\n').length} lines
            </span>
          </div>

          <pre
            className={`text-xs p-4 rounded-xl border leading-relaxed font-mono max-h-[500px] overflow-x-auto ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-emerald-300'
                : 'bg-white border-slate-200 text-slate-800 shadow-inner'
            }`}
          >
            <code>{selectedFile.code}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
