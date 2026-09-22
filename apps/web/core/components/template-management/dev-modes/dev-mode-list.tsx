import { useCallback, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Plus, Workflow } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TDevMode } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Header, Loader } from "@plane/ui";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { toTypeIconProps } from "@/components/common/type-icon-picker";
import { useDevModes } from "@/hooks/store/use-dev-modes";
import { useTemplatePermissions } from "../permissions";
import { DevModeCard } from "./dev-mode-card";
import { DevModeFormModal, type TDevModeFormValue } from "./dev-mode-form-modal";
import { DEV_MODE_I18N } from "./dev-modes-grid";

type TEditorState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; devMode: TDevMode };

/** 模板中心「研发模式」页签：卡片网格 + 新建 / 编辑 / 删除。 */
export const DevModeList = observer(function DevModeList({ workspaceSlug }: { workspaceSlug: string }) {
  const { t } = useTranslation();
  const { canManageDevModes } = useTemplatePermissions(workspaceSlug);
  const { devModes, isLoading, isMutating, error, fetchDevModes, createDevMode, updateDevMode, deleteDevMode } =
    useDevModes(workspaceSlug);

  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<TEditorState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<TDevMode | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const visibleDevModes = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return devModes;
    return devModes.filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) || (item.description ?? "").toLowerCase().includes(keyword)
    );
  }, [devModes, query]);

  const handleSubmit = useCallback(
    async (value: TDevModeFormValue) => {
      const payload = {
        description: value.description,
        icon_props: { in_use: "icon" as const, icon: toTypeIconProps(value.icon) },
        features: value.features,
      };
      if (editor.mode === "edit") {
        const { devMode } = editor;
        // 预置模式的名称是只读的，别把原值再发一遍触发后端的只读校验
        await updateDevMode(devMode.id, devMode.is_system ? payload : { ...payload, name: value.name });
        setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.updated`) });
      } else {
        await createDevMode({ ...payload, name: value.name });
        setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.created`) });
      }
      setEditor({ mode: "closed" });
    },
    [createDevMode, editor, t, updateDevMode]
  );

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteDevMode(pendingDelete.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t(`${DEV_MODE_I18N}.toast.deleted`) });
      setPendingDelete(null);
    } catch (deleteError) {
      const payload = deleteError as { code?: string; error?: string } | undefined;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(`${DEV_MODE_I18N}.toast.delete_failed`, { name: pendingDelete.name }),
        message:
          payload?.code === "DEV_MODE_IN_USE"
            ? t(`${DEV_MODE_I18N}.errors.dev_mode_in_use`)
            : (payload?.error ?? t(`${DEV_MODE_I18N}.errors.generic`)),
      });
    } finally {
      setIsDeleting(false);
    }
  }, [deleteDevMode, pendingDelete, t]);

  const renderBody = () => {
    if (isLoading) {
      return (
        <Loader className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Loader.Item key={index} height="208px" />
          ))}
        </Loader>
      );
    }
    if (error) {
      return (
        <div className="rounded-lg border border-subtle p-10 text-center">
          <p className="text-13 font-medium text-primary">{t(`${DEV_MODE_I18N}.error_title`)}</p>
          <p className="mt-1 text-12 text-secondary">{error}</p>
          {/* fetchDevModes 失败时会 setError 后 rethrow，裸 void 会留下 unhandled rejection */}
          <Button className="mt-4" variant="secondary" size="lg" onClick={() => void fetchDevModes().catch(() => undefined)}>
            {t("retry")}
          </Button>
        </div>
      );
    }
    if (visibleDevModes.length === 0) {
      return (
        <div className="flex min-h-80 items-center justify-center p-6">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
              <Workflow className="size-5" />
            </span>
            <h2 className="mt-3 text-14 font-medium text-primary">
              {t(query ? `${DEV_MODE_I18N}.empty.no_match_title` : `${DEV_MODE_I18N}.empty.title`)}
            </h2>
            <p className="mt-1 text-12 leading-5 text-secondary">
              {t(query ? `${DEV_MODE_I18N}.empty.no_match_description` : `${DEV_MODE_I18N}.empty.description`)}
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {visibleDevModes.map((devMode) => (
          <DevModeCard
            key={devMode.id}
            workspaceSlug={workspaceSlug}
            devMode={devMode}
            canEdit={canManageDevModes}
            onEdit={(item) => setEditor({ mode: "edit", devMode: item })}
            onDelete={setPendingDelete}
          />
        ))}
      </div>
    );
  };

  return (
    <>
      <PageHead title={t(`${DEV_MODE_I18N}.title`)} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      label={t(`${DEV_MODE_I18N}.title`)}
                      icon={<Workflow className="size-4 text-secondary" />}
                      isLast
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem className="gap-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-placeholder" />
                <input
                  className="h-8 w-56 rounded-md border border-subtle bg-surface-1 pl-8 pr-2.5 text-12 text-primary outline-none placeholder:text-placeholder focus:border-accent-strong"
                  placeholder={t(`${DEV_MODE_I18N}.search_placeholder`)}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              {canManageDevModes && (
                <Button variant="primary" onClick={() => setEditor({ mode: "create" })}>
                  <Plus className="size-3.5" />
                  {t(`${DEV_MODE_I18N}.create`)}
                </Button>
              )}
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-y-auto bg-surface-1 p-5">{renderBody()}</ContentWrapper>

      <DevModeFormModal
        isOpen={editor.mode !== "closed"}
        devMode={editor.mode === "edit" ? editor.devMode : null}
        isSubmitting={isMutating}
        onClose={() => setEditor({ mode: "closed" })}
        onSubmit={handleSubmit}
      />

      <AlertModalCore
        isOpen={Boolean(pendingDelete)}
        variant="danger"
        isSubmitting={isDeleting}
        handleClose={() => setPendingDelete(null)}
        handleSubmit={() => void handleDelete()}
        title={t(`${DEV_MODE_I18N}.delete_modal.title`, { name: pendingDelete?.name ?? "" })}
        content={t(`${DEV_MODE_I18N}.delete_modal.description`)}
        primaryButtonText={{
          default: t(`${DEV_MODE_I18N}.delete_modal.confirm`),
          loading: t(`${DEV_MODE_I18N}.delete_modal.deleting`),
        }}
        secondaryButtonText={t("cancel")}
      />
    </>
  );
});
