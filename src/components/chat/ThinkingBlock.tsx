import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { memo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownContent } from "./MarkdownContent";

interface ThinkingBlockProps {
  thinking: string;
  isStreaming?: boolean;
}

export const ThinkingBlock = memo(function ThinkingBlock({
  thinking,
  isStreaming = false,
}: ThinkingBlockProps) {
  const { t } = useTranslation("chat");
  const [isExpanded, setIsExpanded] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) setIsExpanded(true);
  }, [isStreaming]);

  if (!thinking) return null;

  return (
    <div className="mb-2 rounded-lg border border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? t("thinking.collapse") : t("thinking.expand")}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <Brain className="h-3.5 w-3.5" />
        <span className="font-medium">{t("thinking.title")}</span>
        {isStreaming && (
          <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
        )}
        {isExpanded ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="ml-auto h-3.5 w-3.5" />
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50/80 px-3 py-2 text-xs italic leading-relaxed text-gray-600 dark:border-gray-800 dark:bg-gray-900/20 dark:text-gray-400">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <MarkdownContent content={thinking} />
          </div>
        </div>
      )}
    </div>
  );
});
