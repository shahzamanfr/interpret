/**
 * OCR Service - Text extraction from images using Tesseract.js
 * Free, reliable, client-side OCR - no API keys needed!
 * 
 * Note: PDF support removed due to worker configuration issues.
 * To extract text from PDFs, please convert them to images first.
 */

import { createWorker } from 'tesseract.js';

export interface OCRResult {
    text: string;
    error?: string;
    confidence?: number;
}

/**
 * Extracts text from an image using Tesseract.js
 * @param base64Content Base64 string of the file (without prefix)
 * @param fileType MIME type of the file
 * @returns Object containing the extracted text or an error message
 */
export async function extractTextFromImageOrPDF(
    base64Content: string,
    fileType: string
): Promise<OCRResult> {
    console.log("🔍 [OCR] Starting text extraction...");
    console.log("📄 [OCR] File type:", fileType);

    // Check if it's a PDF
    if (fileType === "application/pdf") {
        console.warn("⚠️ [OCR] PDF files are not supported");
        return {
            text: "",
            error: "PDF text extraction is not supported. Please convert your PDF to an image (screenshot each page) or manually paste the content.",
        };
    }

    // Check if it's an image
    if (!fileType.startsWith("image/")) {
        console.error("❌ [OCR] Unsupported file type:", fileType);
        return {
            text: "",
            error: `Unsupported file type: ${fileType}. Please upload an image file (PNG, JPG, etc.)`,
        };
    }

    // Handle image files with Tesseract
    let worker;
    try {
        console.log("🚀 [Tesseract] Initializing OCR worker...");

        worker = await createWorker('eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    console.log(`📊 [Tesseract] Progress: ${Math.round(m.progress * 100)}%`);
                }
            }
        });

        console.log("✅ [Tesseract] Worker initialized");
        console.log("📤 [Tesseract] Processing image...");

        const imageData = `data:${fileType};base64,${base64Content}`;
        const { data } = await worker.recognize(imageData);

        console.log("✅ [Tesseract] Text extraction complete");
        console.log("📏 [Tesseract] Extracted text length:", data.text.length, "characters");
        console.log("🎯 [Tesseract] Confidence:", Math.round(data.confidence), "%");

        await worker.terminate();
        console.log("🧹 [Tesseract] Worker terminated");

        if (!data.text || data.text.trim().length === 0) {
            console.warn("⚠️ [Tesseract] No text found in image");
            return {
                text: "",
                error: "No text could be found in the image. The image may be blank or contain only graphics.",
            };
        }

        return {
            text: data.text.trim(),
            confidence: data.confidence,
        };
    } catch (error) {
        console.error("❌ [Tesseract] Extraction failed:", error);

        if (worker) {
            try {
                await worker.terminate();
            } catch (e) {
                console.error("Failed to terminate worker:", e);
            }
        }

        return {
            text: "",
            error: error instanceof Error ? `OCR Error: ${error.message}` : "Failed to extract text from image",
        };
    }
}
