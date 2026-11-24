import React, { useState } from 'react';
import { Image as ImageIcon, ScanEye, Sparkles, Upload } from 'lucide-react';
import { apiRequest } from '../lib/api';

interface ReplyImgResult {
  mediaId: string;
  mediaUrl: string;
  analysis: {
    description: string;
    objects: string[];
    extractedText: string;
    caption: string;
    diagramOrScreenshotExplanation: string;
    answerToQuestion: string;
    suggestedSocialReply: string;
  };
}

export function ReplyImgView({ onUpdated }: { onUpdated: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('image/png');
  const [filename, setFilename] = useState('');
  const [question, setQuestion] = useState('Extract any visible text, explain what is shown, and draft a helpful social reply.');
  const [pushToInbox, setPushToInbox] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<ReplyImgResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setFilename(file.name);
    setMimeType(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      setPreviewUrl(dataUrl);
      setImageBase64(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageBase64) {
      setError('Upload an image first.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await apiRequest<ReplyImgResult>('/api/ai/replyimg', {
        method: 'POST',
        body: JSON.stringify({
          imageBase64,
          mimeType,
          filename,
          question,
          pushToInbox,
          platform: 'whatsapp',
          senderName: 'ReplyImg Upload',
        }),
      });
      setResult(res);
      onUpdated();
    } catch (err: any) {
      setError(err.message || 'ReplyImg analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold text-white">ReplyImg — AI Image Understanding</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Analyze inbound photos, receipts, diagrams, and app screenshots. Extracts OCR text, recognizes objects, and drafts platform replies.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/40 text-xs text-red-200">{error}</div>
      )}

      <div className="grid lg:grid-cols-12 gap-6 items-start">
        <form onSubmit={handleAnalyze} className="lg:col-span-5 p-5 rounded-xl bg-[#111114] border border-white/10 space-y-4">
          <label className="block border border-dashed border-white/20 hover:border-red-500/60 rounded-xl p-6 text-center cursor-pointer transition-colors bg-black/40">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0])}
            />
            {previewUrl ? (
              <img src={previewUrl} alt="Uploaded preview" className="max-h-60 mx-auto rounded-lg object-contain" />
            ) : (
              <div className="py-6">
                <Upload className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-white">Upload Image, Screenshot, or Diagram</p>
                <p className="mt-1 text-[11px] text-zinc-500">PNG, JPG, WEBP up to 8MB</p>
              </div>
            )}
          </label>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">Question or Analysis Prompt</label>
            <textarea
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-black border border-white/12 text-xs text-white focus:outline-none focus:border-red-500"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={pushToInbox}
              onChange={(e) => setPushToInbox(e.target.checked)}
            />
            <span>Also route analyzed image into Universal Inbox</span>
          </label>

          <button
            type="submit"
            disabled={analyzing || !imageBase64}
            className="w-full py-2.5 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer"
          >
            <ScanEye className="w-4 h-4" />
            <span>{analyzing ? 'Inspecting Image...' : 'Analyze with ReplyImg'}</span>
          </button>
        </form>

        <div className="lg:col-span-7 p-6 rounded-xl bg-[#111114] border border-white/10 space-y-5">
          {!result ? (
            <div className="py-16 text-center">
              <ImageIcon className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="font-display text-base font-semibold text-zinc-200">Awaiting Visual Input</p>
              <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
                Upload a screenshot, receipt, product photo, or diagram to generate structured OCR, captions, and reply drafts.
              </p>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div>
                <p className="text-zinc-400 font-medium mb-1">Visual Description</p>
                <p className="text-sm text-white leading-relaxed">{result.analysis.description}</p>
              </div>

              <div className="pt-3 border-t border-white/8">
                <p className="text-zinc-400 font-medium mb-1">Recognized Objects</p>
                <p className="text-zinc-200">{result.analysis.objects.join(' · ') || 'None detected'}</p>
              </div>

              <div className="pt-3 border-t border-white/8">
                <p className="text-zinc-400 font-medium mb-1">Extracted Visible Text (OCR)</p>
                <pre className="p-3 rounded-lg bg-black border border-white/8 font-mono text-zinc-200 whitespace-pre-wrap">
                  {result.analysis.extractedText || 'No readable text detected'}
                </pre>
              </div>

              <div className="pt-3 border-t border-white/8">
                <p className="text-zinc-400 font-medium mb-1">Diagram / Screenshot Breakdown</p>
                <p className="text-zinc-200 leading-relaxed">{result.analysis.diagramOrScreenshotExplanation}</p>
              </div>

              <div className="pt-3 border-t border-white/8">
                <p className="text-zinc-400 font-medium mb-1">Generated Social Caption</p>
                <p className="text-zinc-200">{result.analysis.caption}</p>
              </div>

              <div className="p-4 rounded-xl bg-red-600/12 border border-red-500/35">
                <p className="font-semibold text-red-300 flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3.5 h-3.5" /> Suggested Automated Reply
                </p>
                <p className="text-sm text-white leading-relaxed">{result.analysis.suggestedSocialReply}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
