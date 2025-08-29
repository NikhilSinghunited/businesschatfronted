// src/lib/api.js
import axios from "axios";

// Prefer env, fallback local
const BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
// Optional: disable real API during dev
const DISABLE = import.meta.env.VITE_DISABLE_API === "1";

/** Convert axios error -> readable text */
export function errorToText(err) {
  if (!err) return "Unknown error";
  if (err.response) {
    const d = err.response.data;
    // FastAPI errors often live in data.detail or data.detail.error
    const detail = d?.detail?.error ?? d?.detail ?? d;
    return typeof detail === "string" ? detail : JSON.stringify(detail);
  }
  return err.message || String(err);
}

/**
 * Call backend chatbot.
 * @param {string} prompt
 * @param {"auto"|"monthly"|"products"|"quarterly"} chartType
 * @returns {Promise<{
 *   sql?: string,
 *   data?: any[],
 *   chart?: { type?: string, labels?: any[], values?: any[], title?: string },
 *   summary?: string,
 *   answer?: string,
 *   forecast?: any,
 *   chart_type?: "monthly"|"products"|"quarterly"|null
 * }>}
 */
export async function queryChatbot(prompt, chartType = "auto") {
  // Mock mode (no real network call)
  if (DISABLE) {
    return {
      summary: "⚠️ API disabled (mock). Showing sample results.",
      data: [{ CompanyName: "Sample Co A" }, { CompanyName: "Sample Co B" }],
      chart: { type: "bar", labels: ["Sample Co A", "Sample Co B"], values: [1, 1], title: "Mock Chart" },
      sql: "/* mock */",
      forecast: null,
    };
  }

  try {
    const res = await axios.post(`${BASE}/chatbot/query`, {
      prompt,
      chart_type: chartType,
    });
    // Return the entire backend payload
    
    return res.data;
  } catch (err) {
    // Throw a normalized Error so UI can show it
    throw new Error(errorToText(err));
  }
}
