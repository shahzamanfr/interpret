import React from "react";

interface PDFNoticeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const PDFNoticeModal: React.FC<PDFNoticeModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-800 bg-black p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="relative z-10 space-y-8 text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-orange-500/20 bg-orange-500/10 text-orange-500">
                        <svg
                            className="w-8 h-8"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            />
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 11l3 3L15 11"
                            />
                        </svg>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-xl font-bold tracking-tight text-white uppercase">
                            PDF/Document Notice
                        </h3>
                        <div className="mx-auto h-[1px] w-12 bg-orange-500/50" />
                    </div>

                    <div className="space-y-4">
                        <p className="text-sm leading-relaxed text-gray-300">
                            "To extract text from this source, please use images or screenshots.
                            Automatic extraction from PDFs and Documents is currently disabled."
                        </p>
                        <p className="text-xs text-gray-500 italic">
                            Tip: Take a quick screenshot of your document pages and upload them as images for instant OCR.
                        </p>
                    </div>

                    <div className="pt-2 text-[10px] font-bold uppercase tracking-[0.25em] text-gray-600">
                        Source Restriction: Images Only
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full rounded-full border border-gray-800 bg-white py-3 text-xs font-bold uppercase tracking-widest text-black transition-all hover:bg-gray-200 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                    >
                        I Understand
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PDFNoticeModal;
