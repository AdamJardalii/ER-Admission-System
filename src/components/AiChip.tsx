import { Sparkles } from "lucide-react";

export function AiChip() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: "var(--color-purple-ai-tint)", color: "var(--color-purple-ai)" }}
    >
      <Sparkles size={12} />
      AI
    </span>
  );
}
