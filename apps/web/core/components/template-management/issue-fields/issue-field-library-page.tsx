import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { AlertCircle, Check, ChevronDown, Rows2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueFieldLibraryItem, TIssueFieldLibraryPayload } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import {
  FIELD_KIND_FILTERS,
  FieldKindIcon,
  getFieldDefaultLabel,
  getFieldKindLabel,
  getFieldOptionsSummary,
  RequiredMark,
} from "@/components/project-issue-types/field-display";
import { useIssueFieldLibrary } from "@/hooks/store/use-issue-field-library";
import { useTemplatePermissions } from "../permissions";
import { AnchoredPopover } from "./anchored-popover";
import { getIssueFieldErrorMessage } from "./helpers";
import { IssueFieldFormModal } from "./issue-field-form-modal";
import { IssueFieldUsedBy } from "./issue-field-used-by";

type TKindFilter = "all" | TIssueFieldLibraryItem["field_type"];

const GRID_WITH_ACTIONS =
  "grid-cols-[minmax(220px,1.3fr)_110px_minmax(200px,1.6fr)_minmax(220px,1.4fr)_92px]";
const GRID_READONLY = "grid-cols-[minmax(220px,1.3fr)_110px_minmax(200px,1.6fr)_minmax(220px,1.4fr)]";

/**
 * 模板中心「通用字段」：工作区级字段库。库字段的定义只在这里改，保存后后端同步到所有绑定它的类型。
 * 读要研发模式 view（页面路由已拦），新建 / 编辑 / 删除要研发模式 manage。
 */
export const IssueFieldLibraryPage = observer(function IssueFieldLibraryPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const { canManageDevModes: canManage } = useTemplatePermissions(workspaceSlug);
  const { fields, isLoading, hasLoaded, error, fetchFields, createField, updateField, deleteField } =
    useIssueFieldLibrary(workspaceSlug);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<TKindFilter>("all");
  // 关闭时保留 field，离场动画期间不闪成「新建字段」
  const [modal, setModal] = useState<{ isOpen: boolean; field: TIssueFieldLibraryItem | null }>({
    isOpen: false,
    field: null,
  });
  const [fieldToDelete, setFieldToDelete] = useState<TIssueFieldLibraryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const visibleFields = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return fields.filter(
      (field) =>
        (kind === "all" || field.field_type === kind) &&
        (!keyword ||
          field.name.toLowerCase().includes(keyword) ||
          (field.description ?? "").toLowerCase().includes(keyword))
    );
  }, [fields, kind, search]);

  const gridClassName = cn("grid items-center gap-x-5 px-5", canManage ? GRID_WITH_ACTIONS : GRID_READONLY);
  const kindLabel = FIELD_KIND_FILTERS.find((filter) => filter.value === kind)?.label;

  const handleSubmit = async (payload: TIssueFieldLibraryPayload) => {
    if (modal.field) {
      await updateField(modal.field.id, payload);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "字段已保存" });
    } else {
      await createField(payload);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "字段已创建" });
    }
  };

  const handleDelete = async () => {
    if (!fieldToDelete) return;
    setIsDeleting(true);
    try {
      await deleteField(fieldToDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "字段已删除" });
      setFieldToDelete(null);
    } catch (deleteError) {
      // 仍有类型绑定时 409，提示后端给的原因
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "删除失败",
        message: getIssueFieldErrorMessage(deleteError, "无法删除字段，请稍后重试。"),
      });
      setFieldToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderRow = (field: TIssueFieldLibraryItem) => {
    const summary = getFieldOptionsSummary(field);
    const defaultLabel = getFieldDefaultLabel(field);
    return (
      <div key={field.id} className={cn(gridClassName, "min-h-[62px] border-t border-subtle py-2.5")}>
        <span className="flex min-w-0 items-center gap-3">
          <FieldKindIcon field={field} className="size-[30px]" />
          <span className="truncate text-14 font-medium text-primary">{field.name}</span>
          {field.is_required && <RequiredMark />}
        </span>
        <span className="text-13 text-secondary">{getFieldKindLabel(field)}</span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className={cn("truncate text-13", summary ? "text-secondary" : "text-placeholder")} title={summary}>
            {summary || "—"}
          </span>
          {defaultLabel && <span className="truncate text-12 text-tertiary">默认 {defaultLabel}</span>}
        </span>
        <IssueFieldUsedBy field={field} />
        {canManage && (
          <span className="flex justify-end gap-1">
            <button
              type="button"
              className="h-7 rounded-md px-1.5 text-13 whitespace-nowrap text-accent-primary hover:underline"
              onClick={() => setModal({ isOpen: true, field })}
            >
              编辑
            </button>
            <button
              type="button"
              className="h-7 rounded-md px-1.5 text-13 whitespace-nowrap text-danger-primary hover:underline"
              onClick={() => setFieldToDelete(field)}
            >
              删除
            </button>
          </span>
        )}
      </div>
    );
  };

  const renderBody = () => {
    if (isLoading && !hasLoaded) {
      return (
        <Loader className="space-y-2">
          <Loader.Item height="44px" />
          <Loader.Item height="62px" />
          <Loader.Item height="62px" />
          <Loader.Item height="62px" />
        </Loader>
      );
    }
    if (error && fields.length === 0) {
      return (
        <div className="flex min-h-80 items-center justify-center p-6 text-center">
          <div>
            <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
              <AlertCircle className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">字段库加载失败</h2>
            <p className="mt-1 max-w-sm text-12 text-secondary">{error}</p>
            <Button
              className="mt-4"
              variant="secondary"
              size="xl"
              onClick={() => void fetchFields().catch(() => undefined)}
            >
              {t("retry")}
            </Button>
          </div>
        </div>
      );
    }
    if (fields.length === 0) {
      return (
        <div className="flex min-h-80 items-center justify-center rounded-xl border border-subtle p-6 text-center">
          <div>
            <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
              <Rows2 className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">还没有通用字段</h2>
            {canManage && (
              <Button
                className="mt-4 px-3"
                variant="primary"
                size="xl"
                onClick={() => setModal({ isOpen: true, field: null })}
              >
                新建字段
              </Button>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className="overflow-x-auto rounded-xl border border-subtle">
        <div className="min-w-[900px]">
          <div className={cn(gridClassName, "h-11 rounded-t-xl bg-surface-2 text-13 font-medium text-tertiary")}>
            <span>字段</span>
            <span>字段类型</span>
            <span>选项 / 默认值</span>
            <span>使用的类型</span>
            {canManage && <span className="text-right">操作</span>}
          </div>
          {visibleFields.length === 0 ? (
            <div className="flex h-40 items-center justify-center border-t border-subtle text-13 text-tertiary">
              没有匹配的字段
            </div>
          ) : (
            visibleFields.map(renderRow)
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <PageHead title={`通用字段 - ${t("workspace_templates.title")}`} />
      <ContentWrapper className="bg-surface-1">
        <div className="flex min-h-full flex-col gap-5 px-8 pt-6 pb-8">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <h1 className="text-20 leading-7 font-semibold text-primary">通用字段</h1>
              {hasLoaded && <span className="text-14 tabular-nums text-tertiary">{fields.length}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-placeholder" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="搜索字段"
                  className="h-8 w-60 rounded-md border border-subtle bg-surface-1 pr-2.5 pl-8 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
                />
              </div>
              <AnchoredPopover
                placement="bottom-end"
                buttonClassName={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-13 whitespace-nowrap",
                  kind === "all"
                    ? "border-strong bg-layer-2 text-secondary hover:bg-layer-2-hover"
                    : "border-accent-strong bg-accent-subtle text-accent-primary"
                )}
                buttonContent={
                  <>
                    {kindLabel ?? "字段类型"}
                    <ChevronDown className="size-3.5" />
                  </>
                }
                panelClassName="w-40"
              >
                {(close) =>
                  [{ value: "all" as const, label: "全部类型" }, ...FIELD_KIND_FILTERS].map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-13 text-primary hover:bg-layer-1-hover"
                      onClick={() => {
                        setKind(filter.value);
                        close();
                      }}
                    >
                      <span className="flex-1">{filter.label}</span>
                      {kind === filter.value && <Check className="size-3.5 text-accent-primary" />}
                    </button>
                  ))
                }
              </AnchoredPopover>
              {canManage && (
                <Button
                  variant="primary"
                  size="xl"
                  className="px-3"
                  onClick={() => setModal({ isOpen: true, field: null })}
                >
                  新建字段
                </Button>
              )}
            </div>
          </header>
          {renderBody()}
        </div>
      </ContentWrapper>

      <IssueFieldFormModal
        isOpen={modal.isOpen}
        field={modal.field}
        onClose={() => setModal((current) => ({ ...current, isOpen: false }))}
        onSubmit={handleSubmit}
      />

      <AlertModalCore
        isOpen={Boolean(fieldToDelete)}
        handleClose={() => !isDeleting && setFieldToDelete(null)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        variant="danger"
        title="删除字段"
        content={
          <>
            确定要删除字段<span className="font-medium text-primary">「{fieldToDelete?.name}」</span>吗？此操作不可撤销。
          </>
        }
        primaryButtonText={{ default: "删除", loading: "删除中" }}
        secondaryButtonText="取消"
      />
    </>
  );
});
