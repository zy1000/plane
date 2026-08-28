/**
 * 「关联需求」弹窗：从本项目已关联的需求里挑一批挂到某个容器上（迭代 / 工作项）。
 *
 * 结构照搬 projects/requirements/existing-requirements-modal.tsx（Combobox 多选 +
 * 防抖搜索 + 无限滚动 + 请求序号防串台），但候选池不同：这里是**项目需求列表**
 * （exclude_* 排除已挂在该容器上的行，exclude_closed 排除已关闭的需求），不是产品
 * 下的可关联候选池，且行上自带 product_identifier，不需要外部传产品清单，所以没有
 * 直接复用那个组件。
 *
 * 容器只体现在候选池的排除参数上（excludeCycleId / excludeIssueId），其余交互完全一样，
 * 所以是一个组件而不是每种容器复制一份。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Combobox } from "@headlessui/react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectRequirement } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { ProductChip } from "@/components/products/product-chip";
import { RequirementIdentifier } from "@/components/requirements/requirement-identifier";
import useDebounce from "@/hooks/use-debounce";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
const PAGE_SIZE = 50;

type TProps = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  /** 候选池排除已在该迭代里的需求 */
  excludeCycleId?: string;
  /** 候选池排除已挂在该工作项上的需求 */
  excludeIssueId?: string;
  handleClose: () => void;
  /** 返回后由调用方负责刷新容器的关联需求列表 */
  onSubmit: (requirementIds: string[]) => Promise<void>;
};

export const ProjectRequirementLinkModal = (props: TProps) => {
  const { isOpen, workspaceSlug, projectId, excludeCycleId, excludeIssueId, handleClose: onClose, onSubmit } = props;
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [rows, setRows] = useState<TProjectRequirement[]>([]);
  const [selected, setSelected] = useState<TProjectRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(null);

  const optionsContainerRef = useRef<HTMLDivElement | null>(null);
  /**
   * 请求序号：搜索词变化很快，慢的那次响应可能后到并把新结果覆盖掉。
   * 只认最后一次发出的请求。
   */
  const requestSequenceRef = useRef(0);
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  const handleClose = useCallback(() => {
    requestSequenceRef.current += 1;
    onClose();
    setSearchTerm("");
    setRows([]);
    setSelected([]);
    setPage(0);
    setHasMore(false);
    setIsLoading(false);
    setIsLoadingMore(false);
  }, [onClose]);

  const fetchRows = useCallback(
    // nextPage 是**页序号**，不是行偏移。后端游标的形状是 "limit:page:is_prev"
    // （见 utils/paginator.py 的 Cursor），第 0 页就是 "50:0:0"。
    async ({ reset, nextPage }: { reset: boolean; nextPage: number }) => {
      if (!isOpen || !workspaceSlug || !projectId) return;
      const requestSequence = ++requestSequenceRef.current;

      if (reset) {
        setIsLoading(true);
        setHasMore(false);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await requirementService.listProjectRequirements(workspaceSlug, projectId, {
          search: debouncedSearchTerm,
          searchIn: "id_title",
          perPage: PAGE_SIZE,
          cursor: `${PAGE_SIZE}:${nextPage}:0`,
          exclude_cycle_id: excludeCycleId,
          exclude_issue_id: excludeIssueId,
          excludeClosed: true,
        });
        if (requestSequence !== requestSequenceRef.current) return;

        const results = response?.results ?? [];
        setRows((previous) => (reset ? results : [...previous, ...results]));
        setPage(nextPage);
        setHasMore(Boolean(response?.next_page_results));
      } catch {
        if (requestSequence !== requestSequenceRef.current) return;
        if (reset) setRows([]);
        setHasMore(false);
      } finally {
        if (requestSequence === requestSequenceRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [debouncedSearchTerm, excludeCycleId, excludeIssueId, isOpen, projectId, workspaceSlug]
  );

  useEffect(() => {
    if (!isOpen) return;
    void fetchRows({ reset: true, nextPage: 0 });
  }, [fetchRows, isOpen]);

  const loadMore = useCallback(() => {
    if (!hasMore || isLoading || isLoadingMore) return;
    void fetchRows({ reset: false, nextPage: page + 1 });
  }, [fetchRows, hasMore, isLoading, isLoadingMore, page]);

  useIntersectionObserver(optionsContainerRef, loadMoreElement, loadMore, "0px 0px 120px 0px");

  const selectedIds = useMemo(() => new Set(selected.map((row) => row.id)), [selected]);

  const handleSubmit = async () => {
    if (!selected.length) return;
    setIsSubmitting(true);
    try {
      await onSubmit(selected.map((row) => row.id));
      handleClose();
    } catch (error) {
      const payload = error as { error?: string } | null;
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("project_requirements.container.toast_failed"),
        message: payload?.error ?? t("project_requirements.toast.failed"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXXL}>
      <Combobox
        as="div"
        onChange={(row: TProjectRequirement) => {
          setSelected((previous) =>
            previous.some((item) => item.id === row.id)
              ? previous.filter((item) => item.id !== row.id)
              : [...previous, row]
          );
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
              placeholder={t("project_requirements.linkable.search_placeholder")}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {searchTerm && (
              <button
                type="button"
                aria-label={t("cancel")}
                onClick={() => setSearchTerm("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-secondary hover:bg-layer-2 hover:text-primary"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 已选区：与工作项弹窗一致，选中项以可撤销的胶囊常驻在搜索框下方 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-2 text-13 text-secondary">
          {selected.length > 0 ? (
            selected.map((row) => (
              <span
                key={row.id}
                className="flex items-center gap-1 rounded-md border border-subtle bg-layer-1 py-1 pr-1 pl-2 text-11 whitespace-nowrap text-primary"
              >
                {row.display_id ?? row.title}
                <button
                  type="button"
                  className="group p-1"
                  onClick={() => setSelected((previous) => previous.filter((item) => item.id !== row.id))}
                >
                  <CloseIcon className="h-3 w-3 text-secondary group-hover:text-primary" />
                </button>
              </span>
            ))
          ) : (
            <span className="w-min rounded-md border border-subtle bg-layer-1 p-2 text-11 whitespace-nowrap">
              {t("project_requirements.linkable.selected", { count: 0 })}
            </span>
          )}
        </div>

        <Combobox.Options static as="div" ref={optionsContainerRef} className="max-h-96 overflow-y-auto px-2 py-2">
          {isLoading ? (
            <Loader className="space-y-2 p-2">
              <Loader.Item height="36px" />
              <Loader.Item height="36px" />
              <Loader.Item height="36px" />
            </Loader>
          ) : rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-13 text-secondary">{t("no_data_yet")}</p>
          ) : (
            <>
              {rows.map((row) => {
                const isSelected = selectedIds.has(row.id);
                return (
                  <Combobox.Option
                    key={row.id}
                    value={row}
                    className={({ active }) =>
                      cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-13 text-primary select-none",
                        active && "bg-layer-transparent-hover",
                        isSelected && "bg-accent-primary/5"
                      )
                    }
                  >
                    <input type="checkbox" checked={isSelected} readOnly className="pointer-events-none size-3.5" />
                    {row.display_id && <RequirementIdentifier displayId={row.display_id} />}
                    <Tooltip tooltipContent={row.title}>
                      <span className="min-w-0 flex-1 truncate">{row.title}</span>
                    </Tooltip>
                    {/* 项目可以同时引用多个产品，两条同名需求只能靠所属产品徽标区分 */}
                    <ProductChip
                      identifier={row.product_identifier}
                      name={row.product_name}
                      hideName
                      className="shrink-0"
                    />
                  </Combobox.Option>
                );
              })}
              {/* 无限滚动哨兵 */}
              <div ref={setLoadMoreElement} className="h-1" />
              {isLoadingMore && (
                <p className="px-3 py-2 text-center text-11 text-secondary">{t("loading")}</p>
              )}
            </>
          )}
        </Combobox.Options>

        <div className="flex items-center justify-end gap-2 border-t border-subtle px-3 py-3">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={isSubmitting}
            disabled={!selected.length || isSubmitting}
            onClick={() => void handleSubmit()}
          >
            {selected.length > 0
              ? `${t("project_requirements.linkable.submit")} · ${selected.length}`
              : t("project_requirements.linkable.submit")}
          </Button>
        </div>
      </Combobox>
    </ModalCore>
  );
};
