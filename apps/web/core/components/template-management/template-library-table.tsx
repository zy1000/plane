import type { MouseEvent, ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { cn, renderFormattedDate } from "@plane/utils";

export type TTemplateLibraryRow = {
  id: string;
  name: string;
  description: string;
  /** 点整行进入的库详情地址 */
  href: string;
  /** 第三列：需求类型 / 产品模板的标签，空时传 null 显示「—」 */
  tag: ReactNode;
  /** 两列数量：标准需求库是条目数、字段数，测试用例库是用例数、模块数 */
  counts: [number, number];
  updatedAt: string;
};

type Props = {
  rows: TTemplateLibraryRow[];
  columnLabels: { tag: string; counts: [string, string] };
  /** 不传就不出「操作」列（没有管理权限） */
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
};

const GRID_COLUMNS = "minmax(200px,1.3fr) minmax(220px,1.7fr) minmax(130px,0.9fr) 88px 88px 120px";

/** 模板中心两个资产库（标准需求库、测试用例库）的列表：同一套列，点整行进库，编辑 / 删除常显 */
export function TemplateLibraryTable({ rows, columnLabels, onEdit, onDelete }: Props) {
  const navigate = useNavigate();
  const showActions = Boolean(onEdit || onDelete);
  const gridStyle = { gridTemplateColumns: showActions ? `${GRID_COLUMNS} 100px` : GRID_COLUMNS };
  const rowClassName = "grid items-center gap-x-4 px-5";

  const stop = (event: MouseEvent) => event.stopPropagation();

  return (
    <div className="overflow-x-auto rounded-lg border border-subtle">
      <div className="min-w-[980px]">
        <div
          className={cn(rowClassName, "h-10 bg-surface-2 text-13 font-medium text-secondary")}
          style={gridStyle}
        >
          <span>名称</span>
          <span>说明</span>
          <span>{columnLabels.tag}</span>
          <span className="text-right">{columnLabels.counts[0]}</span>
          <span className="text-right">{columnLabels.counts[1]}</span>
          <span className="pl-3">更新时间</span>
          {showActions && <span className="text-right">操作</span>}
        </div>
        {rows.map((row) => (
          <div
            key={row.id}
            className={cn(
              rowClassName,
              "h-12 cursor-pointer border-t border-subtle text-14 transition-colors hover:bg-layer-1-hover"
            )}
            style={gridStyle}
            onClick={() => navigate(row.href)}
          >
            <Link to={row.href} onClick={stop} className="truncate font-medium text-primary" title={row.name}>
              {row.name}
            </Link>
            {row.description.trim() ? (
              <span className="truncate text-13 text-secondary" title={row.description}>
                {row.description}
              </span>
            ) : (
              <span className="text-placeholder">—</span>
            )}
            <span className="flex min-w-0 items-center gap-1.5">
              {row.tag ?? <span className="text-placeholder">—</span>}
            </span>
            {row.counts.map((value, index) => (
              <span
                key={index}
                className={cn("text-right tabular-nums", value > 0 ? "text-primary" : "text-placeholder")}
              >
                {value.toLocaleString()}
              </span>
            ))}
            <span className="pl-3 text-13 tabular-nums text-secondary">
              {renderFormattedDate(row.updatedAt, "yyyy-MM-dd")}
            </span>
            {showActions && (
              <span className="flex justify-end gap-4">
                {onEdit && (
                  <button
                    type="button"
                    className="text-13 text-accent-primary hover:underline"
                    onClick={(event) => {
                      stop(event);
                      onEdit(row.id);
                    }}
                  >
                    编辑
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    className="text-13 text-danger-primary hover:underline"
                    onClick={(event) => {
                      stop(event);
                      onDelete(row.id);
                    }}
                  >
                    删除
                  </button>
                )}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
