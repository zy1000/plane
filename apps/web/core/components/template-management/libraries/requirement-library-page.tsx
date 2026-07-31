import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Link, useNavigate, useParams } from "react-router";
import { AlertCircle, FilePlus2, Library, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement } from "@plane/types";
import { AlertModalCore, Breadcrumbs, Checkbox, Header, Loader } from "@plane/ui";
import { renderFormattedDateTime, stripAndTruncateHTML } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { useLibraryRequirements } from "@/hooks/store/use-library-requirements";
import { StandardRequirementCreateModal } from "./create-requirement-modal";
import { useRequirementLibrariesContext } from "./context";

const SKELETON_ROWS = ["row-1", "row-2", "row-3", "row-4", "row-5"];

export const RequirementLibraryPage = observer(function RequirementLibraryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { libraryId } = useParams();
  const { workspaceSlug, libraries } = useRequirementLibrariesContext();
  const store = useLibraryRequirements(workspaceSlug, libraryId);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([]);
  const [requirementsToDelete, setRequirementsToDelete] = useState<TRequirement[]>([]);

  // 列表缓存能让刷新前的首屏不闪空标题，接口回来后以 store 为准
  const library = store.library ?? libraries.find((item) => item.id === libraryId) ?? null;
  const pageTitle = library?.name ?? t("requirement_libraries.title");

  const selectableRequirementIds = store.requirements.map((requirement) => requirement.id);
  const selectedOnPageCount = selectableRequirementIds.filter((id) => selectedRequirementIds.includes(id)).length;
  const isAllSelected = selectableRequirementIds.length > 0 && selectedOnPageCount === selectableRequirementIds.length;
  const isPartiallySelected = selectedOnPageCount > 0 && !isAllSelected;

  useEffect(() => {
    const availableIds = new Set(store.requirements.map((requirement) => requirement.id));
    setSelectedRequirementIds((current) => current.filter((id) => availableIds.has(id)));
  }, [store.requirements]);

  const toggleAllSelection = () => {
    setSelectedRequirementIds((current) => (isAllSelected ? [] : selectableRequirementIds));
  };

  const requirementPath = useMemo(
    () => (requirementId: string) => `/${workspaceSlug}/templates/libraries/${libraryId}/requirements/${requirementId}`,
    [libraryId, workspaceSlug]
  );

  const handleDelete = async () => {
    if (requirementsToDelete.length === 0) return;
    try {
      await store.deleteRequirements(requirementsToDelete.map((requirement) => requirement.id));
      setSelectedRequirementIds((current) =>
        current.filter((id) => !requirementsToDelete.some((requirement) => requirement.id === id))
      );
      setRequirementsToDelete([]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        message:
          requirementsToDelete.length > 1
            ? t("requirement_libraries.detail.delete_success", { count: requirementsToDelete.length })
            : t("requirement_libraries.toast.requirement_deleted"),
      });
    } catch (requestError) {
      const payload = requestError as { error?: string; detail?: string };
      setRequirementsToDelete([]);
      void store.fetchLibraryRequirements().catch(() => undefined);
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? payload?.detail ?? t("requirement_libraries.toast.requirement_failed"),
      });
    }
  };

  return (
    <>
      <PageHead title={`${pageTitle} - ${t("requirement_libraries.title")}`} />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem className="min-w-0">
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/templates/libraries`}
                      label={t("requirement_libraries.title")}
                      icon={<Library className="size-4 text-secondary" />}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-13 font-medium text-primary">{pageTitle}</span>
                      {library && (
                        <Tooltip tooltipContent={t("requirement_libraries.detail.template_tooltip")} position="bottom">
                          <Link
                            to={`/${workspaceSlug}/templates/requirements/${library.template_id}`}
                            className="max-w-48 shrink-0 truncate rounded-full bg-accent-primary/[0.08] px-2 py-0.5 text-11 text-accent-primary hover:bg-accent-primary/[0.14]"
                          >
                            {library.template_detail?.title}
                          </Link>
                        </Tooltip>
                      )}
                    </div>
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem className="shrink-0">
              {selectedRequirementIds.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    setRequirementsToDelete(
                      store.requirements.filter((requirement) => selectedRequirementIds.includes(requirement.id))
                    )
                  }
                >
                  <Trash2 className="size-3.5 text-danger-primary" />
                  {t("requirement_libraries.detail.delete_selected", { count: selectedRequirementIds.length })}
                </Button>
              )}
              <Button variant="primary" onClick={() => setIsCreateOpen(true)} disabled={!library}>
                <Plus className="size-3.5" />
                {t("requirement_libraries.requirements.create")}
              </Button>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex min-h-0 flex-col overflow-hidden bg-surface-1">
        {store.isLoading ? (
          <div className="flex-1 overflow-hidden p-3">
            {SKELETON_ROWS.map((row) => (
              <Loader key={row} className="mb-2">
                <Loader.Item height="36px" />
              </Loader>
            ))}
          </div>
        ) : store.error ? (
          <div className="flex h-full min-h-80 items-center justify-center p-6 text-center">
            <div>
              <span className="mx-auto grid size-10 place-items-center rounded-full bg-danger-subtle text-danger-primary">
                <AlertCircle className="size-5" />
              </span>
              <h2 className="mt-3 text-14 font-medium text-primary">{t("requirement_libraries.detail.error_title")}</h2>
              <p className="mt-1 max-w-sm text-12 text-secondary">{store.error}</p>
              <Button
                className="mt-4"
                variant="secondary"
                onClick={() => void store.fetchLibraryRequirements().catch(() => undefined)}
              >
                {t("retry")}
              </Button>
            </div>
          </div>
        ) : store.requirements.length === 0 ? (
          <div className="flex h-full min-h-80 items-center justify-center p-6">
            <div className="max-w-sm text-center">
              <span className="mx-auto grid size-11 place-items-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                <FilePlus2 className="size-5" />
              </span>
              <h2 className="mt-3 text-14 font-medium text-primary">
                {t("requirement_libraries.detail.empty_title")}
              </h2>
              <p className="mt-1 text-12 leading-5 text-secondary">
                {t("requirement_libraries.detail.empty_description", {
                  template: library?.template_detail?.title ?? "",
                })}
              </p>
              <Button className="mt-4" variant="primary" onClick={() => setIsCreateOpen(true)} disabled={!library}>
                {t("requirement_libraries.requirements.create")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1024px] table-fixed border-collapse text-left">
                <thead className="sticky top-0 z-[1] bg-layer-1">
                  <tr className="border-b border-subtle text-11 font-medium text-secondary">
                    <th className="w-11 px-3 py-2.5">
                      <Checkbox
                        checked={isAllSelected}
                        indeterminate={isPartiallySelected}
                        onChange={toggleAllSelection}
                        aria-label={t("requirement_libraries.detail.select_all")}
                      />
                    </th>
                    {/* 描述原来没设宽度，table-fixed 下会吃掉全部余量；更新时间要放下 yyyy-MM-dd HH:mm:ss */}
                    <th className="w-[26%] px-3 py-2.5">{t("requirement_libraries.requirements.fields.title")}</th>
                    <th className="w-36 px-3 py-2.5">{t("requirement_libraries.requirements.fields.owner")}</th>
                    <th className="w-28 px-3 py-2.5">{t("requirement_libraries.requirements.fields.detail_count")}</th>
                    <th className="w-[24%] px-3 py-2.5">{t("requirement_libraries.fields.description")}</th>
                    <th className="w-40 px-3 py-2.5">{t("requirement_libraries.list.updated_at")}</th>
                    <th className="w-14 px-3 py-2.5">{t("requirement_libraries.fields.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {store.requirements.map((requirement) => {
                    const isSelected = selectedRequirementIds.includes(requirement.id);
                    return (
                    <tr
                      key={requirement.id}
                      onClick={() => navigate(requirementPath(requirement.id))}
                      className={`group cursor-pointer border-b border-subtle transition-colors hover:bg-layer-transparent-hover ${
                        isSelected ? "bg-accent-primary/[0.05]" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() =>
                            setSelectedRequirementIds((current) =>
                              isSelected ? current.filter((id) => id !== requirement.id) : [...current, requirement.id]
                            )
                          }
                          aria-label={t("requirement_libraries.detail.select_requirement", { name: requirement.title })}
                        />
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <Link
                          to={requirementPath(requirement.id)}
                          onClick={(event) => event.stopPropagation()}
                          className="block truncate text-13 font-medium text-primary group-hover:text-accent-primary"
                        >
                          {requirement.title}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
                        <span className="truncate text-12 text-secondary">
                          {requirement.owner_detail?.display_name ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-12 tabular-nums text-secondary">{requirement.detail_count}</td>
                      <td className="px-3 py-2.5 align-middle">
                        <span className="block truncate text-12 text-secondary">
                          {requirement.description_html
                            ? stripAndTruncateHTML(requirement.description_html, 180)
                            : t("requirement_libraries.list.no_description")}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-11 whitespace-nowrap text-secondary">
                        {renderFormattedDateTime(requirement.updated_at)}
                      </td>
                      <td className="px-3 py-2.5 text-center align-middle" onClick={(event) => event.stopPropagation()}>
                        <Tooltip tooltipContent={t("delete")}>
                          <button
                            type="button"
                            onClick={() => setRequirementsToDelete([requirement])}
                            className="grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger-primary"
                            aria-label={t("requirement_libraries.detail.delete_requirement", {
                              name: requirement.title,
                            })}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </Tooltip>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex h-11 shrink-0 items-center border-t border-subtle bg-surface-1 px-4 text-11 text-secondary">
              {t("requirement_libraries.detail.total", { count: store.requirements.length })}
            </div>
          </>
        )}
      </ContentWrapper>
      <StandardRequirementCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        isMutating={store.isMutating}
        templateTitle={library?.template_detail?.title}
        fieldCount={library?.field_count ?? 0}
        onCreate={store.createRequirement}
        onCreated={(requirement) => {
          setIsCreateOpen(false);
          navigate(requirementPath(requirement.id));
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: t("success"),
            message: t("requirement_libraries.toast.requirement_created"),
          });
        }}
      />
      <AlertModalCore
        handleClose={() => setRequirementsToDelete([])}
        handleSubmit={handleDelete}
        isSubmitDisabled={requirementsToDelete.length === 0}
        isSubmitting={store.isMutating}
        isOpen={requirementsToDelete.length > 0}
        title={t(
          requirementsToDelete.length > 1
            ? "requirement_libraries.detail.delete_many_title"
            : "requirement_libraries.detail.delete_title"
        )}
        content={
          requirementsToDelete.length > 1 ? (
            t("requirement_libraries.detail.delete_many_description", { count: requirementsToDelete.length })
          ) : (
            <>
              {t("requirement_libraries.detail.delete_description_prefix")}
              <span className="font-medium text-primary">{requirementsToDelete[0]?.title}</span>
              {t("requirement_libraries.detail.delete_description_suffix")}
            </>
          )
        }
      />
    </>
  );
});
