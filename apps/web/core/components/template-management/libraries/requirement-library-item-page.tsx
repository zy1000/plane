"use client";

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams } from "react-router";
import { Library } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { CopyLinkIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementTypeSchema } from "@plane/types";
import { Breadcrumbs, Header, Loader } from "@plane/ui";
import { cn, copyUrlToClipboard } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import {
  RequirementDetailContent,
  RequirementDetailProperties,
  useRequirementDetail,
} from "@/components/requirements/requirement-detail";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import { canEditRequirementContent } from "@/components/requirements/requirement-status-cell";
import { useRequirementTitles } from "@/components/requirements/use-requirement-titles";
import { useLibraryConfiguration } from "@/hooks/store/use-library-configuration";
import { useAppRouter } from "@/hooks/use-app-router";
import { useRequirementLibrariesContext } from "./context";

/**
 * 标准库条目的整页 —— 抽屉头部「在整页中打开」的落点。
 *
 * 与产品需求整页同一套版式（主列铺满 + 右栏属性，窄屏属性回落主列底部），
 * 只是没有审批、变更轨迹、所属项目与关联工作项：库条目不走这些。
 * 深链进来时列表没加载过，行数据由 useRequirementDetail 自己按 id 取，字段来自库配置。
 */
export const RequirementLibraryItemPage = observer(function RequirementLibraryItemPage() {
  const { t } = useTranslation();
  const router = useAppRouter();
  const { libraryId, requirementId } = useParams();
  const { workspaceSlug, libraries } = useRequirementLibrariesContext();
  const currentLibraryId = libraryId ?? "";

  const configuration = useLibraryConfiguration({ workspaceSlug, libraryId });
  // 与条目列表页同理：编辑弹窗写回的是 context 里的列表缓存，以它为准；直接刷新时列表
  // 可能还没回来，先拿 configuration 里的兜底
  const library = libraries.find((item) => item.id === libraryId) ?? configuration?.library ?? null;

  const detail = useRequirementDetail({
    workspaceSlug,
    libraryId: currentLibraryId,
    requirementId: requirementId ?? null,
  });
  const { requirement } = detail;

  /** 库固定一个需求类型，字段来自库配置（后端实时解析），拼法与条目列表页一致 */
  const requirementType = useMemo<TRequirementTypeSchema | null>(
    () =>
      library
        ? {
            id: library.requirement_type_id,
            name: library.requirement_type_detail?.name ?? "",
            logo_props: library.requirement_type_detail?.logo_props,
            fields: configuration?.fields ?? [],
          }
        : null,
    [configuration?.fields, library]
  );

  /** 与条目列表页一致：标准库暂无页面级写权限区分；内容还要看这一行有没有锁定 / 关闭 */
  const canEdit = true;
  const isEditable = canEditRequirementContent(requirement, canEdit);
  /** 模块是旁路轴（set-module），只看页面级写权限 */
  const onModuleChange = (moduleId: string | null, moduleName: string | null) =>
    void detail.updateModule(moduleId, moduleName);

  const knownRows = useMemo(
    () => (requirement ? [requirement, ...detail.children] : []),
    [detail.children, requirement]
  );
  const parentTitles = useRequirementTitles({
    workspaceSlug,
    entityKind: "library",
    entityId: currentLibraryId,
    knownRows,
    parentIds: detail.parentIds,
  });
  const resolveParentTitle = useCallback((parentId: string) => parentTitles[parentId], [parentTitles]);

  const openRequirement = useCallback(
    (nextId: string) => router.push(`/${workspaceSlug}/templates/libraries/${currentLibraryId}/requirements/${nextId}`),
    [currentLibraryId, router, workspaceSlug]
  );
  /** 整页地址本身就是分享链接 */
  const copyLink = useCallback(
    () =>
      void copyUrlToClipboard(
        `${workspaceSlug}/templates/libraries/${currentLibraryId}/requirements/${requirementId ?? ""}`
      ).then(() => setToast({ type: TOAST_TYPE.SUCCESS, title: t("requirement_detail.link_copied") })),
    [currentLibraryId, requirementId, t, workspaceSlug]
  );

  /** 右栏与窄屏回落位置渲染的是同一份属性，只定义一次 */
  const properties = requirement && (
    <RequirementDetailProperties
      requirement={requirement}
      requirementTypeName={requirementType?.name ?? null}
      builtinLayout={configuration?.builtin_fields ?? null}
      readOnly={!isEditable}
      canEdit={canEdit}
      workspaceSlug={workspaceSlug}
      libraryId={currentLibraryId}
      resolveParentTitle={resolveParentTitle}
      onPatch={detail.submitPatch}
      onModuleChange={onModuleChange}
    />
  );

  return (
    <>
      <PageHead title={requirement?.title || t("requirement_detail.untitled")} />
      <AppHeader
        header={
          <Header className="min-w-0">
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
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/templates/libraries/${currentLibraryId}`}
                      label={library?.name}
                    />
                  }
                />
                <Breadcrumbs.Item
                  component={
                    <RequirementIdentifier
                      displayId={requirement?.display_id}
                      sourceDisplayId={requirement?.source_display_id}
                      size="sm"
                      enableClickToCopy
                    />
                  }
                  isLast
                />
              </Breadcrumbs>
            </Header.LeftItem>
          </Header>
        }
      />

      <ContentWrapper className="overflow-hidden">
        {detail.isLoading && !requirement ? (
          <div className="p-6">
            <Loader className="flex flex-col gap-3">
              <Loader.Item height="32px" width="50%" />
              <Loader.Item height="400px" />
            </Loader>
          </div>
        ) : detail.error || !requirement ? (
          <div className="grid flex-1 place-items-center p-6 text-center">
            <p className="text-13 text-secondary">{detail.error ?? t("requirement_detail.not_found")}</p>
          </div>
        ) : (
          <div className="flex h-full w-full overflow-hidden">
            {/* 主列只封顶不居中：1440px 之外才留白，而且留在右侧一处（与产品需求整页同款） */}
            <div className="vertical-scrollbar scrollbar-sm h-full min-w-0 flex-1 overflow-y-auto px-6 py-6 md:px-10 md:py-7">
              <div className="w-full max-w-[90rem]">
                <RequirementDetailContent
                  workspaceSlug={workspaceSlug}
                  libraryId={currentLibraryId}
                  requirement={requirement}
                  requirementType={requirementType}
                  subRequirements={detail.children}
                  trail={detail.trail}
                  readOnly={!isEditable}
                  layout="page"
                  resolveParentTitle={resolveParentTitle}
                  onPatch={detail.submitPatch}
                  onOpenRequirement={openRequirement}
                  headerActions={
                    <Tooltip tooltipContent={t("requirement_detail.copy_link")}>
                      <IconButton
                        variant="secondary"
                        size="lg"
                        icon={CopyLinkIcon}
                        aria-label={t("requirement_detail.copy_link")}
                        onClick={copyLink}
                      />
                    </Tooltip>
                  }
                />
                {/* 窄屏没有右栏，属性回落到主列底部 */}
                <div className="mt-8 border-t border-subtle pt-6 lg:hidden">{properties}</div>
              </div>
            </div>
            <div
              className={cn(
                "vertical-scrollbar hidden scrollbar-sm h-full w-[380px] flex-shrink-0 flex-col overflow-y-auto",
                "border-l border-subtle px-6 py-6 lg:flex"
              )}
            >
              {properties}
            </div>
          </div>
        )}
      </ContentWrapper>
    </>
  );
});
