// src/App.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import ChatMessage from "./components/ChatMessage";
import { queryChatbot } from "./lib/api";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const SYSTEM_RULES = `Title: Conversational Sales Insights with Northwind DB.

Rules:
- If the user asks about sales data, business metrics, or requests a chart, call the /chatbot/query API.
- Prefer showing a relevant visualization when the user mentions month/quarter/product.
`;

function loadHistory() {
  const raw = localStorage.getItem("chat_history_v1");
  if (!raw) {
    return [
      { role: "system", content: SYSTEM_RULES },
      {
        role: "assistant",
        content:
          "Hi! I’m your Sales Insights assistant. Ask me about sales, revenue, products, or trends.",
      },
    ];
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [{ role: "system", content: SYSTEM_RULES }];
  }
}

/* ---------- Helpers to render API results ---------- */
function buildChartJsSpec(spec) {
  const type = (spec?.type || "bar").toLowerCase();
  const labels = Array.isArray(spec?.labels) ? spec.labels : [];
  const rawValues = Array.isArray(spec?.values) ? spec.values : [];

  // Coerce to numbers; if non-numeric, count = 1 per label
  const numeric = rawValues.map((v) => (typeof v === "number" ? v : Number(v)));
  const allNums = numeric.every((n) => Number.isFinite(n));
  const dataValues = allNums ? numeric : labels.map(() => 1);

  return {
    type,
    data: {
      labels,
      datasets: [
        {
          label: allNums ? "Value" : "Count",
          data: dataValues,
          borderWidth: 1,
        },
      ],
    },
    options:
      type === "bar" || type === "line"
        ? {
            responsive: true,
            plugins: {
              legend: { position: "top" },
              title: { display: !!spec?.title, text: spec?.title || "" },
            },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
          }
        : {
            responsive: true,
            plugins: {
              legend: { position: "top" },
              title: { display: !!spec?.title, text: spec?.title || "" },
            },
          },
  };
}

function GenericChart({ spec }) {
  if (!spec) return null;
  const { type, data, options } = buildChartJsSpec(spec);
  if (type === "pie") return <Pie data={data} options={options} />;
  if (type === "line") return <Line data={data} options={options} />;
  return <Bar data={data} options={options} />;
}

function ApiPayloadRenderer({ payload }) {
  if (!payload) return null;

  const rows = Array.isArray(payload.data) ? payload.data : [];
  const hasRows = rows.length > 0;
  const columns = hasRows ? Object.keys(rows[0]) : [];

  const isSingleCol = hasRows && columns.length === 1;
  const singleColName = isSingleCol ? columns[0] : null;

  return (
    <div className="mt-2 space-y-4">
      {/* Summary */}
      {(payload.summary || payload.answer) && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="font-semibold mb-1">Summary</div>
          <div className="text-sm leading-relaxed">
            {payload.summary || payload.answer}
          </div>
        </div>
      )}

      {/* Chart from API */}
      {payload.chart && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="font-semibold mb-2">Chart</div>
          <GenericChart spec={payload.chart} />
        </div>
      )}

      {/* Single-column friendly list */}
      {isSingleCol && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="font-semibold mb-1">{singleColName}</div>
          <ul className="list-disc pl-5">
            {rows.map((r, i) => (
              <li key={i}>{String(r[singleColName])}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Full table */}
      {hasRows && (
        <div className="rounded-xl border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-2 text-left font-semibold border-b"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={i % 2 ? "bg-gray-50" : "bg-white"}>
                  {columns.map((c) => (
                    <td key={c} className="px-3 py-2 border-b">
                      {String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SQL (optional) */}
      {payload.sql && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="font-semibold mb-1">SQL</div>
          <pre className="text-xs whitespace-pre-wrap">{payload.sql}</pre>
        </div>
      )}
    </div>
  );
}

/* ---------- App ---------- */
export default function App() {
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);

  // fallback static chart type (only if backend doesn't send chart)
  const [showChart, setShowChart] = useState(null); // 'monthly' | 'products' | 'quarterly' | null
  const [lastPayload, setLastPayload] = useState(null); // full API response
  const [errorMsg, setErrorMsg] = useState("");

  const bottomRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("chat_history_v1", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showChart, lastPayload]);

  // Simple heuristic to hint chart type to backend
  const checkForChartRequest = (query) => {
    const lower = query.toLowerCase();
    if (lower.includes("sales") || lower.includes("revenue")) {
      if (lower.includes("month") || lower.includes("monthly")) return "monthly";
      if (lower.includes("product") || lower.includes("item")) return "products";
      if (lower.includes("quarter") || /\bq[1-4]\b/.test(lower)) return "quarterly";
      if (lower.includes("chart") || lower.includes("graph") || lower.includes("visual"))
        return "monthly";
    }
    return null;
  };

  const decideAndCallTool = useMemo(
    () => async (query) => {
      try {
        setErrorMsg("");
        const inferredChart = checkForChartRequest(query);

        const data = await queryChatbot(query, inferredChart ?? "auto");
        setLastPayload(data ?? null);

        // text shown in assistant bubble
        const answer =
          (data && (data.summary || data.answer)) ||
          "Here are your sales insights.";

        // prefer backend chart_type; if dynamic chart present, hide static
        const backendChartType = data?.chart_type;
        if (["monthly", "products", "quarterly"].includes(backendChartType)) {
          setShowChart(backendChartType);
        } else if (data?.chart) {
          setShowChart(null);
        } else {
          setShowChart(inferredChart ?? null);
        }

        return answer;
      } catch (e) {
        setLastPayload(null);
        setShowChart(null);
        const msg = e?.message || "Unknown error";
        setErrorMsg(msg);
        return `Chatbot error: ${msg}`;
      }
    },
    []
  );

  async function handleSend() {
    const text = input.trim();
    if (!text || thinking) return; // prevent double submit

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setThinking(true);

    const result = await decideAndCallTool(text);
    setThinking(false);
    setMessages((m) => [...m, { role: "assistant", content: result }]);
  }

  function clearSession() {
    const fresh = [
      { role: "system", content: SYSTEM_RULES },
      {
        role: "assistant",
        content:
          "Hi! I’m your Sales Insights assistant. Ask me about sales, revenue, products, or trends.",
      },
    ];
    setMessages(fresh);
    setShowChart(null);
    setLastPayload(null);
    setErrorMsg("");
    localStorage.setItem("chat_history_v1", JSON.stringify(fresh));
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 shadow-md">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Sales Insights Assistant</h1>
            <p className="text-blue-100">Ask me about sales, products, or trends</p>
          </div>
          <button
            onClick={clearSession}
            className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors"
          >
            Clear Chat
          </button>
        </div>
      </header>

      {/* Chat Container */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4">
        <div className="flex-1 overflow-y-auto rounded-xl bg-white/80 backdrop-blur-sm p-4 shadow-sm mb-4">
          {/* Error banner */}
          {errorMsg && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-sm">
              {errorMsg}
            </div>
          )}

          {/* Messages */}
          {messages
            .filter((m) => m.role !== "system")
            .map((m, idx) => (
              <ChatMessage key={idx} role={m.role}>
                <pre className="whitespace-pre-wrap break-words font-sans">
                  {m.content}
                </pre>
              </ChatMessage>
            ))}

          {/* Structured payload (summary + chart + table + sql) */}
          {lastPayload && (
            <div className="my-2">
              <ApiPayloadRenderer payload={lastPayload} />
            </div>
          )}

          {/* Fallback static chart only if backend sent no dynamic chart */}
          {!lastPayload?.chart && showChart && (
            <div className="my-4 p-4 bg-white rounded-lg shadow text-sm text-gray-500">
              A chart will appear when the backend suggests one for “{showChart}”.
            </div>
          )}

          {thinking && (
            <div className="text-sm text-gray-500 my-2">Thinking…</div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Area */}
        <div className="bg-white rounded-xl p-3 shadow-md">
          <div className="flex gap-2">
            <input
              className="flex-1 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder='e.g., "list top 5 company names"'
            />
            <button
              onClick={handleSend}
              disabled={thinking || input.trim() === ""}
              className="px-5 py-3 rounded-xl bg-blue-600 text-white disabled:opacity-60 hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              {thinking ? "…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
