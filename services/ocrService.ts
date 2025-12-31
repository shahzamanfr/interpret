/**
 * OCR Service - Text extraction from images and PDFs using OCR.space
 */

const OCR_SPACE_API_KEY = import.meta.env.VITE_OCR_SPACE_API_KEY || "K81443057188957";
const OCR_SPACE_URL = "https://api.ocr.space/parse/image";

export interface OCRResult {
    text: string;
    error?: string;
}

/**
 * Extracts text from a file (Base64 content) using OCR.space API
 * @param base64Content Base64 string of the file (without prefix)
 * @param fileType MIME type of the file
 * @returns Object containing the extracted text or an error message
 */
export async function extractTextFromImageOrPDF(
    base64Content: string,
    fileType: string
): Promise<OCRResult> {
    try {
        const formData = new FormData();
        formData.append("apikey", OCR_SPACE_API_KEY);
        formData.append("base64Image", `data:${fileType};base64,${base64Content}`);
        formData.append("language", "eng");
        formData.append("isOverlayRequired", "false");
        formData.append("filetype", fileType === "application/pdf" ? "PDF" : "");
        formData.append("isTable", "false");
        formData.append("OCREngine", "2"); // Engine 2 is generally better for professional text

        const response = await fetch(OCR_SPACE_URL, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`OCR API responded with status: ${response.status}`);
        }

        const data = await response.json();

        if (data.IsErroredOnProcessing) {
            return {
                text: "",
                error: data.ErrorMessage?.[0] || "OCR processing error",
            };
        }

        const extractedText = data.ParsedResults?.map(
            (result: any) => result.ParsedText
        ).join("\n") || "";

        return {
            text: extractedText,
        };
    } catch (error) {
        console.error("OCR extraction failed:", error);
        return {
            text: "",
            error: error instanceof Error ? error.message : "Unknown error occurred during OCR",
        };
    }
}
