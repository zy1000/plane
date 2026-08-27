"use client";

import * as React from "react";
import { CalendarDays, Link2Off } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import { renderFormattedDate } from "@plane/utils";
import UpdateModal from "@/components/qa/cases/update-modal";

type Props = {
  data: TestCaseItem[];
  loading: boolean;
  workspaceSlug: string;
  projectId: string;
  onDelete: (caseId: string | number) => void | Promise<void>;
  onRefresh?: () => void;
};

type TestCaseItem = {
  id: string | number;
  name: string;
  created_at?: string;
  review?: string;
  repository?: any;
};

export const QaCasesCollapsibleContent: React.FC<Props> = (props) => {
  const { data, loading, workspaceSlug, projectId, onDelete, onRefresh } = props;
  const [activeCaseId, setActiveCaseId] = React.useState<string | undefined>(undefined);
  const [isCaseModalOpen, setIsCaseModalOpen] = React.useState(false);

  const openCase = (caseId: string) => {
    setActiveCaseId(caseId);
    setIsCaseModalOpen(true);
  };

  return (
    <div className="pb-1">
      {loading ? (
        <div className="grid min-h-11 place-items-center text-13 text-secondary">加载中...</div>
      ) : data.length === 0 ? (
        <div className="grid min-h-11 place-items-center text-13 text-secondary">暂无相关用例</div>
      ) : (
        data.map((item) => (
          <div
            key={String(item.id)}
            className="group relative flex h-full min-h-11 w-full items-center py-1 pr-2 transition-all hover:bg-surface-2"
            style={{ paddingLeft: 6 }}
          >
            {/* 对齐子工作项行首的展开箭头占位，标题与 CULTER-xxx 同一竖线 */}
            <div className="flex size-5 shrink-0" aria-hidden />
            <div className="flex min-w-0 flex-1 items-center">
              <Tooltip tooltipContent={item.name} position="top">
                <button
                  type="button"
                  className="min-w-0 max-w-full truncate text-left text-13 text-primary"
                  onClick={() => openCase(String(item.id))}
                >
                  {item.name ?? "-"}
                </button>
              </Tooltip>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="inline-flex h-5 items-center justify-center whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-caption-md-medium text-secondary">
                {item.review || "-"}
              </span>
              <span className="inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-sm border-[0.5px] border-strong px-1.5 text-11 text-secondary">
                <CalendarDays className="h-3 w-3 shrink-0" />
                {item.created_at ? renderFormattedDate(item.created_at) : "-"}
              </span>
              <Tooltip tooltipContent="解除关联">
                <button
                  type="button"
                  aria-label="解除关联"
                  onClick={() => onDelete(item.id)}
                  className="grid size-6 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-secondary"
                >
                  <Link2Off className="size-3.5" />
                </button>
              </Tooltip>
            </div>
          </div>
        ))
      )}
      <UpdateModal
        open={isCaseModalOpen}
        onClose={() => {
          setIsCaseModalOpen(false);
          setActiveCaseId(undefined);
          onRefresh?.();
        }}
        caseId={activeCaseId}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
      />
    </div>
  );
};
