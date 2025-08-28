import { useEffect, useMemo, useRef, useState } from "react";
import ChatMessage from "./components/ChatMessage";
import PendingInstall from "./components/PendingInstall";
import { requestInstall, createTicket, showStatus } from "./lib/api";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Line, Pie } from 'react-chartjs-2';
import salesData from './lib/salesData.json';

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
- If the user asks to 'install' or' 'setup' software, ALWAYS call request_install first.
- If that returns multiple versions, show them and wait for the user's choice.
- If exactly one match, proceed (backend may create the ticket).
- If no match, backend creates a ticket automatically.
- If the user asks about an incident (INC...), call show_status.
- If the user asks about sales data, business metrics, or requests a chart, show the appropriate visualization.
`;

function loadHistory() {
  const raw = localStorage.getItem("chat_history_v1");
  if (!raw) {
    return [
      { role: "system", content: SYSTEM_RULES },
      { role: "assistant", content: "Hi! I'm your IT assistant. How can I help you today?" },
    ];
  }
  try {
    return JSON.parse(raw);
  } catch {
    return [{ role: "system", content: SYSTEM_RULES }];
  }
}

// Chart components
const MonthlySalesChart = () => {
  const data = {
    labels: salesData.monthlySales.map(item => item.month),
    datasets: [
      {
        label: 'Monthly Sales ($)',
        data: salesData.monthlySales.map(item => item.sales),
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Monthly Sales Performance',
      },
    },
  };

  return <Bar data={data} options={options} />;
};

const ProductSalesChart = () => {
  const data = {
    labels: salesData.products.map(item => item.name),
    datasets: [
      {
        label: 'Product Sales ($)',
        data: salesData.products.map(item => item.sales),
        backgroundColor: [
          'rgba(255, 99, 132, 0.5)',
          'rgba(54, 162, 235, 0.5)',
          'rgba(255, 206, 86, 0.5)',
          'rgba(75, 192, 192, 0.5)',
          'rgba(153, 102, 255, 0.5)',
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  return <Pie data={data} />;
};

const QuarterlyPerformanceChart = () => {
  const data = {
    labels: salesData.quarterlyPerformance.map(item => item.quarter),
    datasets: [
      {
        label: 'Actual Revenue',
        data: salesData.quarterlyPerformance.map(item => item.revenue),
        borderColor: 'rgb(53, 162, 235)',
        backgroundColor: 'rgba(53, 162, 235, 0.5)',
        yAxisID: 'y',
      },
      {
        label: 'Target',
        data: salesData.quarterlyPerformance.map(item => item.target),
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        type: 'line',
        yAxisID: 'y',
      },
    ],
  };

  const options = {
    responsive: true,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
      },
    },
  };

  return <Bar data={data} options={options} />;
};

export default function App() {
  const [messages, setMessages] = useState(loadHistory);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(null); // {user_query, options:[]}
  const [thinking, setThinking] = useState(false);
  const [showChart, setShowChart] = useState(null); // 'monthly', 'products', 'quarterly'
  const bottomRef = useRef(null);

  useEffect(() => {
    localStorage.setItem("chat_history_v1", JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending, showChart]);

  // Check if user is asking for sales data or charts
  const checkForChartRequest = (query) => {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('sales') || lowerQuery.includes('revenue')) {
      if (lowerQuery.includes('month') || lowerQuery.includes('monthly')) {
        return 'monthly';
      } else if (lowerQuery.includes('product') || lowerQuery.includes('item')) {
        return 'products';
      } else if (lowerQuery.includes('quarter') || lowerQuery.includes('q1') || lowerQuery.includes('q2') || lowerQuery.includes('q3') || lowerQuery.includes('q4')) {
        return 'quarterly';
      } else if (lowerQuery.includes('chart') || lowerQuery.includes('graph') || lowerQuery.includes('visual')) {
        return 'monthly'; // default to monthly sales chart
      }
    }
    
    return null;
  };

  // ---- UPDATED TOOL DECIDER ----
  const decideAndCallTool = useMemo(
    () => async (query) => {
      // Check for chart requests first
      const chartType = checkForChartRequest(query);
      if (chartType) {
        setShowChart(chartType);
        return `Here's the ${chartType} sales data you requested:`;
      }
      
      // Reset chart display for non-chart requests
      setShowChart(null);

      // 1) Incident check
      const incMatch = query.match(/\bINC\d+\b/i);
      if (incMatch) {
        try {
          const inc = incMatch[0].toUpperCase();
          const data = await showStatus(inc);
          // safety: if any pending UI is open, close it
          setPending(null);
          return `Incident ${inc} status: ${data.incident_status ?? "Unknown"}`;
        } catch (e) {
          return `Error while checking status: ${e?.response?.data || e.message}`;
        }
      }

      // 2) install/setup path
      if (/\b(install|setup|set up)\b/i.test(query)) {
        try {
          const data = await requestInstall(query, null);

          // ✅ If backend directly created a ticket, hide dropdown
          if (data && typeof data === "object" && data.incident) {
            setPending(null);
            return JSON.stringify(data, null, 2);
          }

          // ✅ Show dropdown ONLY when options > 1
          if (Array.isArray(data?.options) && data.options.length > 1) {
            setPending({ user_query: query, options: data.options });
            return data.message || "Multiple versions found. Please choose one.";
          }

          // If single/zero options but no incident in payload, just show message
          setPending(null);
          return JSON.stringify(data, null, 2);
        } catch (e) {
          setPending(null);
          return `Error while searching software: ${e?.response?.data || e.message}`;
        }
      }

      // 3) generic ticket
      try {
        const data = await createTicket(query);
        setPending(null);
        return `Ticket ${data.incident} created for: ${query}`;
      } catch (e) {
        setPending(null);
        return `Error while creating ticket: ${e?.response?.data || e.message}`;
      }
    },
    []
  );

  async function handleSend() {
    const text = input.trim();
    if (!text) return;

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setThinking(true);

    const result = await decideAndCallTool(text);
    setThinking(false);
    setMessages((m) => [...m, { role: "assistant", content: result }]);
  }

  async function confirmVersion(choice) {
    if (!choice) return;
    try {
      const data = await requestInstall(pending.user_query, choice);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            `✅ ${data?.message || "Ticket created"} • Incident: ${data?.incident || "N/A"}`,
        },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `❌ Failed: ${e?.response?.data || e.message}` },
      ]);
    } finally {
      // ✅ always hide dropdown after confirm
      setPending(null);
    }
  }

  function clearSession() {
    const fresh = [
      { role: "system", content: SYSTEM_RULES },
      { role: "assistant", content: "Hi! I'm your IT assistant. How can I help you today?" }
    ];
    setMessages(fresh);
    setPending(null);
    setShowChart(null);
    localStorage.setItem("chat_history_v1", JSON.stringify(fresh));
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 shadow-md">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">IT & Business Assistant</h1>
            <p className="text-blue-100">How can I help you today?</p>
          </div>
          <button
            onClick={clearSession}
            className="px-4 py-2 rounded-lg bg-white/20 hover:bg-white/30 text-sm font-medium transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear Chat
          </button>
        </div>
      </header>

      {/* Chat Container */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto rounded-xl bg-white/80 backdrop-blur-sm p-4 shadow-sm mb-4">
          {messages
            .filter((m) => m.role !== "system")
            .map((m, idx) => (
              <ChatMessage key={idx} role={m.role}>
                <pre className="whitespace-pre-wrap break-words font-sans">{m.content}</pre>
              </ChatMessage>
            ))}

          {/* Chart display */}
          {showChart === 'monthly' && (
            <div className="my-4 p-4 bg-white rounded-lg shadow">
              <MonthlySalesChart />
            </div>
          )}
          
          {showChart === 'products' && (
            <div className="my-4 p-4 bg-white rounded-lg shadow max-w-md mx-auto">
              <ProductSalesChart />
            </div>
          )}
          
          {showChart === 'quarterly' && (
            <div className="my-4 p-4 bg-white rounded-lg shadow">
              <QuarterlyPerformanceChart />
            </div>
          )}

          {/* Thinking indicator */}
          {thinking && (
            <div className="flex items-center justify-start my-4">
              <div className="bg-blue-100 rounded-xl p-4">
                <div className="flex space-x-2">
                  <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <div className="h-2 w-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          )}

          {/* Version selection dropdown */}
          {pending?.options?.length > 1 && (
            <div className="my-4">
              <PendingInstall
                options={pending.options}
                onConfirm={confirmVersion}
              />
            </div>
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
            />
            <button
              onClick={handleSend}
              disabled={thinking || input.trim() === ""}
              className="px-5 py-3 rounded-xl bg-blue-600 text-white disabled:opacity-60 hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              {thinking ? (
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
          
        </div>
      </div>

    
     
    </div>
  );
}