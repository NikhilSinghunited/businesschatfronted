export default function PendingInstall({ options, onConfirm }) {
  return (
    <div className="border rounded-xl p-4 bg-white shadow-sm">
      <p className="font-medium mb-2">Multiple versions found. Please choose one:</p>
      <select
        className="w-full border rounded-lg p-2 mb-3"
        onChange={(e) => (window.__choice = e.target.value)}
        defaultValue=""
      >
        <option value="" disabled>
          Select version…
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>

      <button
        onClick={() => onConfirm(window.__choice)}
        className="px-4 py-2 rounded-xl bg-blue-600 text-white"
      >
        Confirm Selection
      </button>
    </div>
  );
}
