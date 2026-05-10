import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { generateAvatar3dColor } from "@/lib/avatar-generator";
import { useOfficeStore } from "@/store/office-store";

function formatCost(n: number): string {
  if (n >= 100) {
    return `$${n.toFixed(0)}`;
  }
  if (n >= 1) {
    return `$${n.toFixed(2)}`;
  }
  if (n >= 0.01) {
    return `$${n.toFixed(3)}`;
  }
  if (n > 0) {
    return `<$0.01`;
  }
  return "$0";
}

export function CostPieChart() {
  const { t } = useTranslation("panels");
  const agentCosts = useOfficeStore((s) => s.agentCosts);
  const agents = useOfficeStore((s) => s.agents);

  const entries = Object.entries(agentCosts).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);

  if (entries.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-xs text-gray-400 dark:text-gray-500">
        {t("common:empty.noCostData")}
      </div>
    );
  }

  const data = entries.map(([agentId, value]) => ({
    name: agents.get(agentId)?.name ?? agentId,
    agentId,
    value,
    color: generateAvatar3dColor(agentId),
  }));

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative aspect-square w-full max-w-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: unknown, name: string) => {
                const v = typeof value === "number" ? value : 0;
                const pct = total > 0 ? ((v / total) * 100).toFixed(0) : "0";
                return [`${formatCost(v)} (${pct}%)`, name];
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
            {formatCost(total)}
          </span>
          <span className="text-[9px] text-gray-400 dark:text-gray-500">
            {t("metrics.costLabel")}
          </span>
        </div>
      </div>
      {data.length > 1 && (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 px-1">
          {data.map((entry) => (
            <div key={entry.agentId} className="flex items-center gap-1">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="max-w-[80px] truncate text-[10px] text-gray-600 dark:text-gray-400">
                {entry.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
