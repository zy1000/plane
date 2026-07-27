/**
 * 版本快照的只读预览。
 *
 * 复用明细网格的二级表头与值渲染，但去掉勾选框列和操作列（快照不可编辑），
 * 分页口径与明细网格一致（20 / 50 / 100），行数据由服务端对快照 JSON 切片而来。
 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TRequirementDetailChangeSnapshot, TRequirementField } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  getFormRows,
  getMaxFormRows,
  LeafValue,
  RequirementGridHeader,
} from "@/components/template-management/requirements/requirement-grid-shared";

const PER_PAGE_OPTIONS = [20, 50, 100];

type TProps = {
  workspaceSlug: string;
  fields: TRequirementField[];
  rows: TRequirementDetailChangeSnapshot[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  perPage: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
};

export function VersionSnapshotPreview(props: TProps) {
  const {
    workspaceSlug,
    fields,
    rows,
    totalCount,
    isLoading,
    error,
    perPage,
    nextCursor,
    prevCursor,
    nextPageResults,
    prevPageResults,
    onPerPageChange,
    onCursorChange,
  } = props;
  const { t } = useTranslation();
  const rootFields = fields.filter((field) => field.is_active);
  const formFields = rootFields.filter((field) => field.field_type === "form");
  const currentPage = Number(prevCursor?.split(":")[1] ?? -1) + 2;
  const pageStart = (Math.max(currentPage, 1) - 1) * perPage + 1;
  const groupCellClass = "border-b border-b-subtle";

  return (
    <div className="flex min-w-0 flex-col">
      {isLoading ? (
        <div className="p-4">
          <Loader className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Loader.Item key={index} height="44px" />
            ))}
          </Loader>
        </div>
      ) : error ? (
        <p className="px-4 py-6 text-12 text-danger-primary">{error}</p>
      ) : !rows.length ? (
        <p className="px-4 py-10 text-center text-13 text-tertiary">
          {t("workspace_templates.requirements.data.empty")}
        </p>
      ) : (
        <div className="overflow-auto">
          <table className="w-max min-w-full border-collapse text-left">
            <RequirementGridHeader rootFields={rootFields} showActionGutter={false} />
            {rows.map((row) => {
              const totalRows = Math.max(1, getMaxFormRows(row.data, formFields));
              return (
                <tbody key={row.id}>
                  {Array.from({ length: totalRows }, (_, rowIndex) => (
                    <tr key={`${row.id}-${rowIndex}`} className="bg-surface-1">
                      {rootFields.flatMap((field) => {
                        if (field.field_type !== "form") {
                          if (rowIndex !== 0) return [];
                          return [
                            <td
                              key={field.id}
                              rowSpan={totalRows}
                              className={cn(
                                "min-w-40 border-r border-subtle px-3 py-2 align-middle",
                                groupCellClass
                              )}
                            >
                              <LeafValue field={field} value={row.data[field.id]} workspaceSlug={workspaceSlug} />
                            </td>,
                          ];
                        }
                        if (!field.children.length) {
                          return [
                            <td
                              key={`${field.id}-empty`}
                              className={cn(
                                "min-w-40 border-r border-subtle px-3 py-2 align-middle text-13 text-placeholder",
                                groupCellClass
                              )}
                            >
                              {rowIndex === 0 ? t("workspace_templates.requirements.fields.no_children") : null}
                            </td>,
                          ];
                        }
                        const subRow = getFormRows(row.data, field.id)[rowIndex];
                        return field.children.map((child) => (
                          <td
                            key={`${field.id}-${child.id}`}
                            className={cn("min-w-40 border-r border-subtle px-3 py-2 align-middle", groupCellClass)}
                          >
                            {subRow ? (
                              <LeafValue
                                field={child}
                                value={subRow.values[child.id]}
                                workspaceSlug={workspaceSlug}
                              />
                            ) : null}
                          </td>
                        ));
                      })}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-subtle px-4 py-3 text-11 text-secondary">
        <span>
          {totalCount > 0
            ? t("workspace_products.requirements.change.grid.range", {
                start: pageStart,
                end: Math.min(pageStart + rows.length - 1, totalCount),
                total: totalCount,
              })
            : ""}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={perPage}
            onChange={(event) => onPerPageChange(Number(event.target.value))}
            className="h-7 rounded border border-subtle bg-surface-1 px-1.5 outline-none"
            aria-label={t("workspace_templates.requirements.list.per_page")}
          >
            {PER_PAGE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {t("workspace_products.requirements.change.grid.per_page_value", { count: value })}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!prevPageResults}
            onClick={() => onCursorChange(prevCursor)}
            className="grid size-7 place-items-center rounded border border-subtle disabled:opacity-40"
            aria-label={t("workspace_templates.requirements.list.previous_page")}
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="tabular-nums">{Math.max(currentPage, 1)}</span>
          <button
            type="button"
            disabled={!nextPageResults}
            onClick={() => onCursorChange(nextCursor)}
            className="grid size-7 place-items-center rounded border border-subtle disabled:opacity-40"
            aria-label={t("workspace_templates.requirements.list.next_page")}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
