/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Rocket, UserCheck } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { Combobox } from "@headlessui/react";
// i18n
import { useTranslation } from "@plane/i18n";
// types
import { Button } from "@plane/propel/button";
import { SearchIcon, CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { ISearchIssueResponse, TProjectIssuesSearchParams } from "@plane/types";
// ui
import { Loader, ToggleSwitch, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { generateWorkItemLink, getTabIndex } from "@plane/utils";
// helpers
// hooks
import useDebounce from "@/hooks/use-debounce";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web components
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
// services
import { ProjectService, projectIssueTypesCache } from "@/services/project";
// components
import { IssueSearchModalEmptyState } from "./issue-search-modal-empty-state";

type Props = {
  workspaceSlug: string | undefined;
  projectId?: string;
  isOpen: boolean;
  handleClose: () => void;
  searchParams: Partial<TProjectIssuesSearchParams>;
  handleOnSubmit: (data: ISearchIssueResponse[]) => Promise<void>;
  workspaceLevelToggle?: boolean;
  shouldHideIssue?: (issue: ISearchIssueResponse) => boolean;
  selectedWorkItemIds?: string[];
  workItemSearchServiceCallback?: (params: TProjectIssuesSearchParams) => Promise<ISearchIssueResponse[]>;
};

const projectService = new ProjectService();
const PAGE_SIZE = 50;

export function ExistingIssuesListModal(props: Props) {
  const { t } = useTranslation();

  const {
    workspaceSlug,
    projectId,
    isOpen,
    handleClose: onClose,
    searchParams,
    handleOnSubmit,
    workspaceLevelToggle = false,
    shouldHideIssue,
    selectedWorkItemIds,
    workItemSearchServiceCallback,
  } = props;
  // states
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [issues, setIssues] = useState<ISearchIssueResponse[]>([]);
  const [selectedIssues, setSelectedIssues] = useState<ISearchIssueResponse[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWorkspaceLevel, setIsWorkspaceLevel] = useState(false);
  const [selectedTypeIds, setSelectedTypeIds] = useState<string[]>([]);
  const [isMyWorkItems, setIsMyWorkItems] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(null);
  const { isMobile } = usePlatformOS();
  const debouncedSearchTerm: string = useDebounce(searchTerm, 500);
  const { baseTabIndex } = getTabIndex(undefined, isMobile);
  const hasInitializedSelection = useRef(false);
  const requestSequenceRef = useRef(0);
  const optionsContainerRef = useRef<HTMLDivElement | null>(null);
  const searchParamsKey = useMemo(() => JSON.stringify(searchParams ?? {}), [searchParams]);
  const normalizedSearchParams = useMemo(
    () => JSON.parse(searchParamsKey) as Partial<TProjectIssuesSearchParams>,
    [searchParamsKey]
  );
  const selectedTypeIdsQuery = useMemo(() => selectedTypeIds.join(","), [selectedTypeIds]);

  const handleClose = () => {
    requestSequenceRef.current += 1;
    onClose();
    setSearchTerm("");
    setIssues([]);
    setSelectedIssues([]);
    setIsWorkspaceLevel(false);
    setSelectedTypeIds([]);
    setIsMyWorkItems(false);
    setOffset(0);
    setHasMore(false);
    setIsLoading(false);
    setIsLoadingMore(false);
    hasInitializedSelection.current = false;
  };

  const onSubmit = async () => {
    if (selectedIssues.length === 0) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("issue.select.error"),
      });

      return;
    }

    setIsSubmitting(true);

    await handleOnSubmit(selectedIssues).finally(() => setIsSubmitting(false));

    handleClose();
  };

  // 获取项目工作项类型映射
  const projectIssueTypesMap = projectId ? projectIssueTypesCache.get(projectId) : undefined;
  const issueTypes = projectIssueTypesMap ? Object.values(projectIssueTypesMap) : [];

  const visibleIssues = useMemo(
    () => issues.filter((issue) => !shouldHideIssue?.(issue)),
    [issues, shouldHideIssue]
  );

  const allVisibleSelected = useMemo(
    () =>
      visibleIssues.length > 0 &&
      visibleIssues.every((issue) => selectedIssues.some((selectedIssue) => selectedIssue.id === issue.id)),
    [selectedIssues, visibleIssues]
  );

  const fetchIssues = useCallback(
    async ({ reset, nextOffset }: { reset: boolean; nextOffset: number }) => {
      if (!isOpen || !workspaceSlug) return;

      const searchService =
        workItemSearchServiceCallback ??
        (projectId
          ? projectService.projectIssuesSearch.bind(projectService, workspaceSlug.toString(), projectId.toString())
          : undefined);

      if (!searchService) return;

      const requestSequence = ++requestSequenceRef.current;

      if (reset) {
        setIsLoading(true);
        setHasMore(false);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await searchService({
          ...normalizedSearchParams,
          search: debouncedSearchTerm,
          workspace_search: isWorkspaceLevel,
          limit: PAGE_SIZE,
          offset: nextOffset,
          my_work_items: isMyWorkItems,
          type_ids: selectedTypeIdsQuery || undefined,
        } as TProjectIssuesSearchParams);

        if (requestSequence !== requestSequenceRef.current) return;

        setIssues((previousIssues) => (reset ? response : [...previousIssues, ...response]));
        setOffset(nextOffset + response.length);
        setHasMore(response.length === PAGE_SIZE);
      } finally {
        if (requestSequence === requestSequenceRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [
      debouncedSearchTerm,
      isMyWorkItems,
      isOpen,
      isWorkspaceLevel,
      normalizedSearchParams,
      projectId,
      selectedTypeIdsQuery,
      workItemSearchServiceCallback,
      workspaceSlug,
    ]
  );

  const loadMoreIssues = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore) return;
    void fetchIssues({ reset: false, nextOffset: offset });
  }, [fetchIssues, hasMore, isLoading, isLoadingMore, offset]);

  useIntersectionObserver(optionsContainerRef, loadMoreElement, loadMoreIssues, "0px 0px 120px 0px");

  const handleSelectIssues = useCallback(() => {
    setSelectedIssues((prevSelectedIssues) => {
      const visibleIssueIds = new Set(visibleIssues.map((issue) => issue.id));
      const everyVisibleIssueSelected =
        visibleIssues.length > 0 && visibleIssues.every((issue) => prevSelectedIssues.some((i) => i.id === issue.id));

      if (everyVisibleIssueSelected) {
        return prevSelectedIssues.filter((issue) => !visibleIssueIds.has(issue.id));
      }

      const selectedIssuesMap = new Map(prevSelectedIssues.map((issue) => [issue.id, issue]));
      visibleIssues.forEach((issue) => selectedIssuesMap.set(issue.id, issue));
      return Array.from(selectedIssuesMap.values());
    });
  }, [visibleIssues]);

  useEffect(() => {
    if (isOpen && !hasInitializedSelection.current && selectedWorkItemIds && visibleIssues.length > 0) {
      setSelectedIssues(visibleIssues.filter((issue) => selectedWorkItemIds.includes(issue.id)));
      hasInitializedSelection.current = true;
    }
  }, [isOpen, selectedWorkItemIds, visibleIssues]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchIssues({ reset: true, nextOffset: 0 });
  }, [fetchIssues, isOpen]);

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXXL}>
      <Combobox
        as="div"
        onChange={(val: ISearchIssueResponse) => {
          if (selectedIssues.some((i) => i.id === val.id))
            setSelectedIssues((prevData) => prevData.filter((i) => i.id !== val.id));
          else setSelectedIssues((prevData) => [...prevData, val]);
        }}
      >
        <div className="border-b border-subtle px-3 py-3">
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-secondary"
              aria-hidden="true"
            />
            <Combobox.Input
              className="h-10 w-full rounded-md border border-subtle bg-layer-1 pr-9 pl-9 text-13 text-primary outline-none placeholder:text-placeholder focus:border-accent-primary"
              placeholder={t("common.search.placeholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              tabIndex={baseTabIndex}
            />
            {searchTerm && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchTerm("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-secondary hover:bg-layer-2 hover:text-primary"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-b border-subtle px-3 py-2 text-13 text-secondary sm:flex-row sm:items-center sm:justify-between">
          {selectedIssues.length > 0 ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {selectedIssues.map((issue) => (
                <div
                  key={issue.id}
                  className="flex items-center gap-1 rounded-md border border-subtle bg-layer-1 py-1 pr-1 pl-2 text-11 whitespace-nowrap text-primary"
                >
                  <IssueIdentifier
                    projectId={issue.project_id}
                    issueTypeId={issue.type_id}
                    projectIdentifier={issue.project__identifier}
                    issueSequenceId={issue.sequence_id}
                    size="xs"
                    variant="secondary"
                  />
                  <button
                    type="button"
                    className="group p-1"
                    onClick={() => setSelectedIssues((prevData) => prevData.filter((i) => i.id !== issue.id))}
                  >
                    <CloseIcon className="h-3 w-3 text-secondary group-hover:text-primary" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-min rounded-md border border-subtle bg-layer-1 p-2 text-11 whitespace-nowrap">
              {t("issue.select.empty")}
            </div>
          )}
          {workspaceLevelToggle && (
            <Tooltip tooltipContent="Toggle workspace level search" isMobile={isMobile}>
              <div
                className={`flex flex-shrink-0 cursor-pointer items-center gap-1 text-11 ${
                  isWorkspaceLevel ? "text-primary" : "text-secondary"
                }`}
              >
                <ToggleSwitch value={isWorkspaceLevel} onChange={() => setIsWorkspaceLevel((prevData) => !prevData)} />
                <button
                  type="button"
                  onClick={() => setIsWorkspaceLevel((prevData) => !prevData)}
                  className="flex-shrink-0"
                >
                  {t("common.workspace_level")}
                </button>
              </div>
            </Tooltip>
          )}
        </div>

        <div className="border-b border-subtle px-3 py-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-sm">
              <button
                type="button"
                onClick={() => setSelectedTypeIds([])}
                className={`flex-shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                  selectedTypeIds.length === 0
                    ? "border-accent-primary bg-accent-primary text-white"
                    : "border-transparent bg-layer-1 text-secondary hover:bg-layer-2"
                }`}
              >
                {t("common.all")}
              </button>
              {issueTypes.map((type) => {
                const isSelected = selectedTypeIds.includes(type.id);
                const IconComp = type.logo_props?.icon?.name
                  ? ((LucideIcons as any)[type.logo_props.icon.name] as React.FC<any> | undefined)
                  : undefined;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => {
                      setSelectedTypeIds((prev) =>
                        prev.includes(type.id) ? prev.filter((id) => id !== type.id) : [...prev, type.id]
                      );
                    }}
                    className={`flex flex-shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
                      isSelected
                        ? "border-accent-primary bg-accent-primary/20 text-accent-primary"
                        : "border-transparent bg-layer-1 text-secondary hover:bg-layer-2"
                    }`}
                  >
                    {IconComp && (
                      <span
                        className="inline-flex items-center justify-center rounded-sm"
                        style={{
                          color: type.logo_props?.icon?.color || "currentColor",
                          width: "14px",
                          height: "14px",
                        }}
                      >
                        <IconComp className="h-3 w-3" strokeWidth={2} />
                      </span>
                    )}
                    <span>{type.name}</span>
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setIsMyWorkItems((currentState) => !currentState)}
              className={`inline-flex flex-shrink-0 items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                isMyWorkItems
                  ? "border-accent-primary bg-accent-primary/15 text-accent-primary"
                  : "border-subtle bg-layer-1 text-secondary hover:bg-layer-2 hover:text-primary"
              }`}
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>{t("issue.select.my_work_items")}</span>
            </button>
          </div>
        </div>

        <div ref={optionsContainerRef} className="vertical-scrollbar scrollbar-md max-h-[30rem] overflow-y-auto">
          <Combobox.Options static className="scroll-py-2">
            {/* TODO: Translate here */}
            {searchTerm !== "" && (
              <h5 className="px-3 pt-2 text-12 text-secondary">
                Search results for{" "}
                <span className="text-primary">
                  {'"'}
                  {searchTerm}
                  {'"'}
                </span>{" "}
                in project:
              </h5>
            )}

            {isLoading ? (
              <Loader className="space-y-3 p-3">
                <Loader.Item height="40px" />
                <Loader.Item height="40px" />
                <Loader.Item height="40px" />
                <Loader.Item height="40px" />
              </Loader>
            ) : (
              <>
                {visibleIssues.length === 0 ? (
                  <IssueSearchModalEmptyState
                    debouncedSearchTerm={debouncedSearchTerm}
                    isSearching={isLoading}
                    issues={visibleIssues}
                    searchTerm={searchTerm}
                  />
                ) : (
                  <ul className="p-2 text-13 text-primary">
                    {visibleIssues.map((issue) => {
                      const selected = selectedIssues.some((i) => i.id === issue.id);

                      return (
                        <Combobox.Option
                          key={issue.id}
                          as="label"
                          htmlFor={`issue-${issue.id}`}
                          value={issue}
                          className={({ active }) =>
                            `group my-0.5 flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-transparent px-3 py-2.5 text-secondary select-none ${
                              active || selected ? "bg-layer-1 text-primary" : "hover:bg-layer-1"
                            }`
                          }
                        >
                          <div className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-subtle"
                              checked={selected}
                              readOnly
                            />
                            <span
                              className="block h-1.5 w-1.5 flex-shrink-0 rounded-full"
                              style={{
                                backgroundColor: issue.state__color,
                              }}
                            />
                            {projectIssueTypesMap &&
                              issue?.type_id &&
                              projectIssueTypesMap[issue.type_id]?.logo_props?.icon &&
                              (() => {
                                const { name, color } = projectIssueTypesMap[issue.type_id].logo_props!.icon!;
                                const IconComp = (LucideIcons as any)[name] as React.FC<any> | undefined;
                                return (
                                  <span
                                    className="inline-flex flex-shrink-0 items-center justify-center rounded-sm"
                                    style={{
                                      color: color || "currentColor",
                                      width: "16px",
                                      height: "16px",
                                    }}
                                  >
                                    {IconComp ? (
                                      <IconComp className="h-3.5 w-3.5" strokeWidth={2} />
                                    ) : (
                                      <span className="h-3.5 w-3.5" />
                                    )}
                                  </span>
                                );
                              })()}
                            <span className="flex-shrink-0">
                              <IssueIdentifier
                                projectId={issue.project_id}
                                issueTypeId={issue.type_id}
                                projectIdentifier={issue.project__identifier}
                                issueSequenceId={issue.sequence_id}
                                size="xs"
                                variant="secondary"
                              />
                            </span>
                            <span className="truncate">{issue.name}</span>
                          </div>
                          <a
                            href={generateWorkItemLink({
                              workspaceSlug,
                              projectId: issue?.project_id,
                              issueId: issue?.id,
                              projectIdentifier: issue.project__identifier,
                              sequenceId: issue?.sequence_id,
                            })}
                            target="_blank"
                            className="relative z-1 flex-shrink-0 text-secondary opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Rocket className="h-4 w-4" />
                          </a>
                        </Combobox.Option>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </Combobox.Options>
          {isLoadingMore && (
            <div className="px-3 py-2 text-center text-xs text-secondary">{t("issue.select.loading_more")}</div>
          )}
          {hasMore && !isLoadingMore && <div ref={setLoadMoreElement} className="h-1 w-full" />}
        </div>
      </Combobox>
      <div className="flex items-center justify-between border-t border-subtle p-3">
        <Button
          variant="link"
          onClick={handleSelectIssues}
          disabled={visibleIssues.length === 0}
          className={visibleIssues.length === 0 ? "p-0" : ""}
        >
          {allVisibleSelected ? t("issue.select.deselect_all") : t("issue.select.select_all")}
        </Button>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={handleClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={onSubmit}
            loading={isSubmitting}
            disabled={isSubmitting || selectedIssues.length === 0}
          >
            {isSubmitting ? t("common.adding") : t("issue.select.add_selected")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
