import clsx from "clsx";

export default function ChatMessage({ role = "assistant", children }) {
  const isUser = role === "user";
  return (
    <div className={clsx("flex my-2", isUser ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "max-w-[80%] rounded-2xl px-4 py-2 border",
          isUser
            ? "bg-blue-600 text-white border-blue-700"
            : "bg-white text-gray-900 border-gray-200"
        )}
      >
        {children}
      </div>
    </div>
  );
}
