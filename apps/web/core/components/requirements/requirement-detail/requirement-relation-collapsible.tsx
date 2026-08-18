/**
 * 需求详情关联区块的折叠壳，版式对齐工作项详情的 CollapsibleButton：
 * 48px 标题行 + 左侧箭头 + 标题 + 计数/进度，展开后右侧才露出操作。
 */
import { useState, type ReactNode } from "react";
import { CircularProgressIndicator, Collapsible, CollapsibleButton } from "@plane/ui";

type TProgress = {
  completed: number;
  total: number;
  doneLabel: string;
};

type TProps = {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  progress?: TProgress;
  actions?: ReactNode;
  children: ReactNode;
};

export const RequirementRelationCollapsible = (props: TProps) => {
  const { title, defaultOpen = true, count, progress, actions, children } = props;
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const indicatorElement = progress ? (
    <div className="flex items-center gap-1.5 text-13 text-tertiary">
      <CircularProgressIndicator
        size={18}
        percentage={progress.total ? (progress.completed / progress.total) * 100 : 0}
        strokeWidth={3}
      />
      <span>
        {progress.completed}/{progress.total} {progress.doneLabel}
      </span>
    </div>
  ) : typeof count === "number" ? (
    <span className="flex items-center justify-center">
      <span className="text-14 !leading-3 text-tertiary">{count}</span>
    </span>
  ) : undefined;

  return (
    <Collapsible
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      buttonClassName="w-full"
      title={
        <CollapsibleButton
          isOpen={isOpen}
          title={title}
          indicatorElement={indicatorElement}
          actionItemElement={
            actions ? (
              <div
                className="flex items-center gap-2"
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                }}
              >
                {actions}
              </div>
            ) : undefined
          }
        />
      }
    >
      {children}
    </Collapsible>
  );
};
