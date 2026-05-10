import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import type { VisualAgent } from "@/gateway/types";
import { SVG_WIDTH, SVG_HEIGHT } from "@/lib/constants";

interface SpeechBubbleOverlayProps {
  agent: VisualAgent;
}

export function SpeechBubbleOverlay({ agent }: SpeechBubbleOverlayProps) {
  const [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (agent.status !== "speaking") {
      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    }
    setVisible(true);
  }, [agent.status]);

  // Close expanded panel when agent stops speaking and fades out
  useEffect(() => {
    if (!visible) setExpanded(false);
  }, [visible]);

  // Compute panel position to stay within viewport
  const recalcPanelPosition = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const parentEl = container.offsetParent as HTMLElement | null;
    if (!parentEl) return;

    const parentRect = parentEl.getBoundingClientRect();
    const iconRect = container.getBoundingClientRect();

    const panelWidth = 300;
    const panelMaxHeight = 240;
    const gap = 8;

    // Default: above the icon, centered
    let top = iconRect.top - parentRect.top - panelMaxHeight - gap;
    let left = iconRect.left - parentRect.left + iconRect.width / 2 - panelWidth / 2;

    // If panel would overflow top, place below the icon
    if (top < 4) {
      top = iconRect.bottom - parentRect.top + gap;
    }

    // Clamp horizontal to parent bounds
    const maxLeft = parentRect.width - panelWidth - 4;
    if (left < 4) left = 4;
    if (left > maxLeft) left = maxLeft;

    // Clamp vertical bottom
    const maxTop = parentRect.height - panelMaxHeight - 4;
    if (top > maxTop) top = maxTop;
    if (top < 4) top = 4;

    setPanelStyle({
      position: "absolute",
      top: `${top}px`,
      left: `${left}px`,
      width: `${panelWidth}px`,
      maxHeight: `${panelMaxHeight}px`,
      zIndex: 30,
    });
  }, []);

  const handleToggle = useCallback(() => {
    setExpanded((prev) => {
      if (!prev) {
        requestAnimationFrame(recalcPanelPosition);
      }
      return !prev;
    });
  }, [recalcPanelPosition]);

  // Recalc on content change when expanded
  useEffect(() => {
    if (expanded) {
      requestAnimationFrame(recalcPanelPosition);
    }
  }, [expanded, agent.speechBubble?.text, recalcPanelPosition]);

  if (!agent.speechBubble || !visible) {
    return null;
  }

  const leftPct = (agent.position.x / SVG_WIDTH) * 100;
  const topPct = (agent.position.y / SVG_HEIGHT) * 100;

  const isSpeaking = agent.status === "speaking";

  return (
    <>
      {/* Collapsed: small chat indicator icon */}
      <div
        ref={containerRef}
        className="absolute"
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: "translate(-50%, -100%) translateY(-40px)",
          opacity: isSpeaking ? 1 : 0,
          transition: "opacity 500ms ease",
          zIndex: 21,
        }}
      >
        <button
          type="button"
          onClick={handleToggle}
          className={`flex items-center justify-center rounded-full shadow-md transition-all duration-200 ${
            expanded
              ? "h-8 w-8 bg-purple-600 text-white ring-2 ring-purple-300"
              : "h-7 w-7 bg-white text-purple-600 ring-1 ring-purple-200 hover:bg-purple-50 hover:ring-purple-300 dark:bg-gray-800 dark:text-purple-400 dark:ring-purple-700 dark:hover:bg-gray-700"
          }`}
          title={agent.speechBubble.text.slice(0, 60)}
        >
          {/* Chat bubble SVG icon */}
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={expanded ? "h-4 w-4" : "h-3.5 w-3.5"}
          >
            <path
              fillRule="evenodd"
              d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.102 41.102 0 01-3.55.414c-.28.02-.521.18-.643.413l-1.712 3.293a.75.75 0 01-1.33 0l-1.713-3.293a.783.783 0 00-.642-.413 41.108 41.108 0 01-3.55-.414C1.993 13.245 1 11.986 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902z"
              clipRule="evenodd"
            />
          </svg>
          {/* Pulsing dot when actively speaking */}
          {isSpeaking && !expanded && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-purple-500" />
            </span>
          )}
        </button>
      </div>

      {/* Expanded: full message panel (rendered as sibling to avoid clipping) */}
      {expanded && (
        <div
          ref={panelRef}
          style={panelStyle}
          className="animate-in fade-in zoom-in-95 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl duration-150 dark:border-gray-700 dark:bg-gray-900"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-1.5 dark:border-gray-800">
            <span className="flex items-center gap-1.5 text-xs font-medium text-purple-600 dark:text-purple-400">
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path
                  fillRule="evenodd"
                  d="M3.43 2.524A41.29 41.29 0 0110 2c2.236 0 4.43.18 6.57.524 1.437.231 2.43 1.49 2.43 2.902v5.148c0 1.413-.993 2.67-2.43 2.902a41.102 41.102 0 01-3.55.414c-.28.02-.521.18-.643.413l-1.712 3.293a.75.75 0 01-1.33 0l-1.713-3.293a.783.783 0 00-.642-.413 41.108 41.108 0 01-3.55-.414C1.993 13.245 1 11.986 1 10.574V5.426c0-1.413.993-2.67 2.43-2.902z"
                  clipRule="evenodd"
                />
              </svg>
              {agent.name}
            </span>
            <button
              type="button"
              onClick={handleToggle}
              aria-label="Close"
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>
          {/* Content */}
          <div className="overflow-y-auto px-3 py-2 text-sm leading-relaxed text-gray-800 dark:text-gray-200" style={{ maxHeight: "196px" }}>
            <Markdown>{agent.speechBubble.text}</Markdown>
          </div>
        </div>
      )}
    </>
  );
}
