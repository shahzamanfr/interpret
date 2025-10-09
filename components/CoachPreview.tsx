import React from 'react';

const CoachPreview: React.FC = () => {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
      <div className="space-y-3">
        <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-200 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.8)]">
          Describe what’s happening in this image in 3-4 sentences.
        </div>
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-tr-sm border border-gray-800 bg-gray-800 px-4 py-3 text-sm text-white shadow-[0_10px_30px_-20px_rgba(0,0,0,0.8)]">
            A presenter explains a product update while teammates take notes and discuss next steps.
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="h-6 w-6 shrink-0 rounded-full bg-gray-800 grid place-items-center text-white text-[10px]">AI</div>
          <div className="flex-1 rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 text-sm text-gray-200">
            Strong opening. Try adding context (“why it matters”) and end with a clear outcome.
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-800 bg-gray-950/60 px-2 py-0.5">✔ Clarity</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-800 bg-gray-950/60 px-2 py-0.5">▲ Structure</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-800 bg-gray-950/60 px-2 py-0.5">● Tone</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <div className="inline-flex items-center gap-1 rounded-full border border-gray-800 bg-gray-900/60 px-3 py-1 text-xs text-gray-300">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400 animate-pulse" />
            Live coaching
          </div>
        </div>
      </div>
    </div>
  );
};

export default CoachPreview;


