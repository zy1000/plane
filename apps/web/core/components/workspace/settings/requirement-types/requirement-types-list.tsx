import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ChevronRight, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TCreateRequirementTypePayload, TRequirementType, TUpdateRequirementTypePayload } from "@plane/types";
import { AlertModalCore, CustomMenu, Loader, ToggleSwitch } from "@plane/ui";
import { RequirementTypeSettingsModal } from "@/components/requirements/requirement-type-settings-modal";
import { SettingsHeading } from "@/components/settings/heading";
import { getSettingsRequirementTypePath } from "./navigation";
import { RequirementTypeCreateModal } from "./requirement-type-create-modal";

/** 与项目设置的工作项类型页保持同一视觉族；那边是 1874 行页面里的私有 const，从那里导出比复制更糟。 */
const StatusBadge = ({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "danger" | "blue" | "success";
}) => {
  const toneClassName = {
    neutral: "border border-subtle bg-surface-2 text-secondary",
    danger: "border-0 bg-danger-subtle/35 text-danger-primary",
    blue: "border border-accent-primary/30 bg-accent-primary/10 text-accent-primary",
    success: "border-0 bg-success-subtle/35 text-success-primary",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${toneClassName}`}>
      {children}
    </span>
  );
};

type Props = {
  workspaceSlug: string;
  canEdit: boolean;
  requirementTypes: TRequirementType[];
  isLoading: boolean;
  error: string | null;
  isMutating: boolean;
  fetchRequirementTypes: () => Promise<TRequirementType[]>;
  createRequirementType: (payload: TCreateRequirementTypePayload) => Promise<TRequirementType>;
  updateRequirementType: (id: string, payload: TUpdateRequirementTypePayload) => Promise<TRequirementType>;
  deleteRequirementType: (id: string) => Promise<void>;
};

export function RequirementTypesList(props: Props) {
  const {
    workspaceSlug,
    canEdit,
    requirementTypes,
    isLoading,
    error,
    isMutating,
    fetchRequirementTypes,
    createRequirementType,
    updateRequirementType,
    deleteRequirementType,
  } = props;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<TRequirementType | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TRequirementType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const resync = () => void fetchRequirementTypes().catch(() => undefined);

  const handleToggle = async (requirementType: TRequirementType, value: boolean) => {
    try {
      await updateRequirementType(requirementType.id, { is_active: value });
    } catch (requestError) {
      const payload = requestError as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_templates.requirement_types.toast.failed"),
      });
      // 这一行其实没变，把服务端的真实状态拉回来
      resync();
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteRequirementType(pendingDelete.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_templates.requirement_types.toast.deleted"),
      });
      setPendingDelete(null);
    } catch (requestError) {
      const payload = requestError as { code?: string; error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          // library_count 为 0 也可能删不掉：后端还会检查需求明细与草稿明细
          payload?.code === "REQUIREMENT_TYPE_IN_USE"
            ? t("workspace_settings.settings.requirement_types.list.delete_in_use")
            : (payload?.error ?? t("workspace_templates.requirement_types.toast.failed")),
      });
      resync();
    } finally {
      setIsDeleting(false);
    }
  };

  const handleApplySettings = async (next: Pick<TRequirementType, "name" | "description" | "is_active">) => {
    if (!pendingEdit) return;
    try {
      await updateRequirementType(pendingEdit.id, next);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message: t("workspace_templates.requirement_types.toast.saved"),
      });
      setPendingEdit(null);
    } catch (requestError) {
      const payload = requestError as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("workspace_templates.requirement_types.toast.failed"),
      });
      throw requestError;
    }
  };

  const heading = (
    <SettingsHeading
      title={t("workspace_settings.settings.requirement_types.title")}
      description={t("workspace_settings.settings.requirement_types.description")}
      control={
        canEdit ? (
          <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="size-3.5" />
            {t("workspace_templates.requirement_types.create")}
          </Button>
        ) : undefined
      }
    />
  );

  const renderBody = () => {
    if (isLoading && requirementTypes.length === 0) {
      return (
        <Loader className="flex flex-col divide-y divide-subtle">
          {["a", "b", "c", "d"].map((key) => (
            <div key={key} className="flex items-center gap-3 py-4">
              <Loader.Item height="32px" width="32px" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Loader.Item height="14px" width="180px" />
                <Loader.Item height="12px" width="260px" />
              </div>
              <Loader.Item height="20px" width="120px" />
            </div>
          ))}
        </Loader>
      );
    }

    if (error && requirementTypes.length === 0) {
      return (
        <div className="rounded-lg border border-subtle p-10 text-center">
          <p className="text-13 font-medium text-primary">
            {t("workspace_templates.requirement_types.list.error_title")}
          </p>
          <p className="mt-1 text-12 text-secondary">{error}</p>
          <Button className="mt-3" variant="secondary" onClick={resync}>
            {t("retry")}
          </Button>
        </div>
      );
    }

    if (requirementTypes.length === 0) {
      return (
        <div className="flex flex-col items-center rounded-lg border border-dashed border-subtle px-6 py-12 text-center">
          <span className="grid size-10 place-items-center rounded-lg bg-layer-2 text-secondary">
            <ListChecks className="size-5" />
          </span>
          <p className="mt-3 text-13 font-medium text-primary">
            {t("workspace_templates.requirement_types.empty.title")}
          </p>
          <p className="mt-1 max-w-md text-12 text-secondary">
            {t("workspace_templates.requirement_types.empty.description")}
          </p>
          {canEdit && (
            <Button className="mt-4" variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="size-3.5" />
              {t("workspace_templates.requirement_types.create")}
            </Button>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col divide-y divide-subtle">
        {requirementTypes.map((requirementType) => {
          const detailPath = getSettingsRequirementTypePath(workspaceSlug, requirementType.id);
          const isInUse = requirementType.library_count > 0;
          return (
            <div key={requirementType.id} className="py-1.5 first:pt-0 last:pb-0">
              <div className="-mx-3 rounded-md px-3 transition-colors hover:bg-layer-1-hover">
                <div className="flex items-center justify-between gap-4 py-3">
                  {/* 只在左半边挂 Link：整行 onClick 会让右侧的启停开关顺带跳页 */}
                  <Link to={detailPath} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className="text-accent-primary flex size-8 shrink-0 items-center justify-center rounded-lg bg-layer-2">
                      <ListChecks className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-primary">{requirementType.name}</span>
                      <span className="block truncate text-xs text-secondary">
                        {requirementType.description?.trim() ||
                          t("workspace_templates.requirement_types.list.no_description")}
                      </span>
                    </span>
                  </Link>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge tone="neutral">
                      {t("workspace_settings.settings.requirement_types.list.field_count", {
                        count: requirementType.field_count,
                      })}
                    </StatusBadge>
                    {isInUse && (
                      <StatusBadge tone="blue">
                        {t("workspace_templates.requirement_types.list.used_by_count", {
                          count: requirementType.library_count,
                        })}
                      </StatusBadge>
                    )}
                    {requirementType.is_active ? (
                      <StatusBadge tone="success">
                        {t("workspace_settings.settings.requirement_types.list.enabled")}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">
                        {t("workspace_settings.settings.requirement_types.list.disabled")}
                      </StatusBadge>
                    )}
                    <ToggleSwitch
                      value={requirementType.is_active}
                      onChange={(value) => void handleToggle(requirementType, value)}
                      size="sm"
                      // 不按 isMutating 禁用：那是 hook 级全局标志，一个请求会冻住所有行
                      disabled={!canEdit}
                    />
                    <CustomMenu ellipsis placement="bottom-end" buttonClassName="text-tertiary hover:text-primary">
                      <CustomMenu.MenuItem
                        disabled={!canEdit}
                        onClick={() => setPendingEdit(requirementType)}
                      >
                        <span className="flex items-center gap-2">
                          <Pencil className="size-3.5" strokeWidth={2} />
                          {t("edit")}
                        </span>
                      </CustomMenu.MenuItem>
                      <CustomMenu.MenuItem
                        disabled={!canEdit || isInUse}
                        onClick={() => setPendingDelete(requirementType)}
                      >
                        <Tooltip
                          disabled={!isInUse}
                          tooltipContent={t("workspace_templates.requirement_types.list.delete_blocked", {
                            count: requirementType.library_count,
                          })}
                          position="left"
                        >
                          <span className="flex items-center gap-2 text-danger-primary">
                            <Trash2 className="size-3.5" strokeWidth={2} />
                            {t("delete")}
                          </span>
                        </Tooltip>
                      </CustomMenu.MenuItem>
                    </CustomMenu>
                    <ChevronRight className="size-4 text-tertiary" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {heading}
      <div className="mt-6 w-full">{renderBody()}</div>

      <RequirementTypeCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={createRequirementType}
        onCreated={(created) => {
          setIsCreateOpen(false);
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("success"),
            message: t("workspace_templates.requirement_types.toast.created"),
          });
          navigate(getSettingsRequirementTypePath(workspaceSlug, created.id));
        }}
        isSubmitting={isMutating}
      />

      <RequirementTypeSettingsModal
        isOpen={Boolean(pendingEdit)}
        onClose={() => setPendingEdit(null)}
        metadata={{
          name: pendingEdit?.name ?? "",
          description: pendingEdit?.description ?? "",
          is_active: pendingEdit?.is_active ?? true,
        }}
        onApply={handleApplySettings}
        requirementType={pendingEdit ?? undefined}
        // 列表只有 field_count，没有层级拆分；概况用总数近似即可
        fieldSummary={{
          topLevel: pendingEdit?.field_count ?? 0,
          columns: pendingEdit?.field_count ?? 0,
        }}
      />

      <AlertModalCore
        isOpen={Boolean(pendingDelete)}
        handleClose={() => setPendingDelete(null)}
        handleSubmit={() => void handleDelete()}
        isSubmitting={isDeleting}
        variant="danger"
        title={t("workspace_templates.requirement_types.list.delete_one_title")}
        content={
          <>
            {t("workspace_templates.requirement_types.list.delete_one_description_prefix")}
            <span className="font-medium text-primary">{pendingDelete?.name}</span>
            {t("workspace_templates.requirement_types.list.delete_one_description_suffix")}
          </>
        }
      />
    </>
  );
}
