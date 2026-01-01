/**
 * Centralized configuration for the frontend application.
 * Manages environment-specific variables like the backend API URL.
 */

// Deployment URL for the backend on AWS App Runner (once available)
// Fallback to localhost:8787 for local development
const DEFAULT_BACKEND_URL = "http://localhost:8787";

// Safely get environment variables with fallback
const getEnvVar = (name: string, fallback: string): string => {
    if (typeof import.meta !== "undefined" && (import.meta as any).env) {
        return (import.meta as any).env[name] || fallback;
    }
    return fallback;
};

export const BACKEND_URL = getEnvVar("VITE_BACKEND_URL", DEFAULT_BACKEND_URL);

/**
 * Returns the full API URL for a specific endpoint.
 * @param path The API endpoint path (e.g., "/api/speech/transcribe")
 * @returns The absolute URL
 */
export const getApiUrl = (path: string): string => {
    // Ensure we don't have double slashes if the path starts with a slash
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${BACKEND_URL}${cleanPath}`;
};

export default {
    BACKEND_URL,
    getApiUrl,
};
