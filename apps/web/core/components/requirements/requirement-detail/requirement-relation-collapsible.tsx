/**
 * 需求详情关联区块的折叠壳：与抽屉其它区块共用同一条标题行（DetailSectionHeader），
 * 左侧箭头 + 图标 + 标题 + 计数/进度，右侧是该区块自己的操作。
 *
 * 操作在折叠态也保留 —— 「关联已有工作项」这类入口不该藏在展开之后；空列表时用户正是
 * 要点它。
 */
import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CircularProgressIndicator } from "@plane/ui";
import { DetailSectionHeader } from "./requirement-detail-section";

type TProgress = {
  completed: number;
  total: number;
  doneLabel: string;
};

type TProps = {
  title: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  count?: number;
  progress?: TProgress;
  actions?: ReactNode;
  children: ReactNode;
};

export const RequirementRelationCollapsible = (props: TProps) => {
  const { title, icon, defaultOpen = true, count, progress, actions, children } = props;
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const meta = progress ? (
    <span className="inline-flex items-center gap-1.5">
      <CircularProgressIndicator
        size={14}
        percentage={progress.total ? (progress.completed / progress.total) * 100 : 0}
        strokeWidth={3}
      />
      <span className="tabular-nums">
        {progress.completed}/{progress.total} {progress.doneLabel}
      </span>
    </span>
  ) : typeof count === "number" ? (
    <span className="tabular-nums">{count}</span>
  ) : undefined;

  return (
    <section className="flex flex-col">
      <DetailSectionHeader
        icon={icon}
        title={title}
        meta={meta}
        actions={actions}
        isOpen={isOpen}
        onToggle={() => setIsOpen((open) => !open)}
      />
      {isOpen && <div className="pt-1">{children}</div>}
    </section>
  );
};
