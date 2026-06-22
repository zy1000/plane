import type { FC } from "react";

export type TDistributionItem = {
  key: string;
  label: string;
  color: string;
  count: number;
};

type Props = {
  title: string;
  isLoading: boolean;
  items: TDistributionItem[];
};

export const DefectDistributionCard: FC<Props> = ({ title, isLoading, items }) => {
  const total = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="rounded-xl border border-subtle bg-surface-1 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-primary">{title}</div>
        <div className="text-xs tabular-nums text-placeholder">共 {total}</div>
      </div>
      {isLoading ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="h-7 w-full animate-pulse rounded bg-surface-2" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="mt-6 flex h-20 items-center justify-center text-xs text-placeholder">暂无数据</div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const percentage = total > 0 ? Math.round((item.count / total) * 100) : 0;
            return (
              <div key={item.key} className="flex items-center gap-3">
                <span className="flex w-20 shrink-0 items-center gap-1.5 text-xs text-secondary">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span className="truncate">{item.label}</span>
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%`, backgroundColor: item.color }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-secondary">
                  {item.count} · {percentage}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
