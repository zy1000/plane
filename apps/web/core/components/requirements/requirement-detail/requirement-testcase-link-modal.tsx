/**
 * 需求侧「关联测试用例」弹窗：从候选池里挑一批用例挂到需求上。
 *
 * 结构照搬 requirements/project-requirement-link-modal.tsx（Combobox 多选 +
 * 防抖搜索 + 无限滚动 + 请求序号防串台），只换候选池与行渲染。
 *
 * **刻意不复用 QA 侧那三个用例选择器**（qa/review/TestCaseSelectionModal、
 * qa/plans/plan-cases-modal 等）：它们是 antd + 硬编码中文 + any，把 antd 拖进需求域
 * 不划算；而 qa/shared 的 CaseTypePill / CasePriorityPill 依赖 testhub 路由里的
 * globalEnums 可变单例（由 testhub 页面 setEnums 填充），需求详情页先渲染时那个 map
 * 是空的，所有胶囊都会显示 "-"。所以这里只渲染自解释的字段：编号 / 标题 / 用例库·模块。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Combobox } from "@headlessui/react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirementTestCase } from "@plane/types";
import { EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import useDebounce from "@/hooks/use-debounce";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
const PAGE_SIZE = 50;

type TProps = {
  isOpen: boolean;
  workspaceSlug: string;
  productId: string;
  requirementId: string;
  /** 传了就把候选池收窄到该项目的用例库 + 共享库（项目侧抽屉用） */
  scopeProjectId?: string;
  handleClose: () => void;
  /** 返回后由调用方负责刷新已关联列表并提示 */
  onSubmit: (caseIds: string[]) => Promise<void>;
};

export const RequirementTestCaseLinkModal = (props: TProps) => {
  const { isOpen, workspaceSlug, productId, requirementId, scopeProjectId, handleClose: onClose, onSubmit } = props;
  const { t } = useTranslation();

  const [searchTerm, setSearchTerm] = useState("");
  const [rows, setRows] = useState<TRequirementTestCase[]>([]);
  const [selected, setSelected] = useState<TRequirementTestCase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadMoreElement, setLoadMoreElement] = useState<HTMLDivElement | null>(null);

  const optionsContainerRef = useRef<HTMLDivElement | null>(null);
  /** 请求序号：慢的那次响应可能后到并覆盖新结果，只认最后一次发出的请求 */
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
    // nextPage 是**页序号**，不是行偏移。后端游标形状是 "limit:page:is_prev"
    // （见 utils/paginator.py 的 Cursor），第 0 页就是 "50:0:0"。
    async ({ reset, nextPage }: { reset: boolean; nextPage: number }) => {
      if (!isOpen || !workspaceSlug || !productId || !requirementId) return;
      const requestSequence = ++requestSequenceRef.current;

      if (reset) {
        setIsLoading(true);
        setHasMore(false);
      } else {
        setIsLoadingMore(true);
      }

      try {
        const response = await requirementService.listLinkableTestCases(workspaceSlug, productId, requirementId, {
          search: debouncedSearchTerm,
          perPage: PAGE_SIZE,
          cursor: `${PAGE_SIZE}:${nextPage}:0`,
          project_id: scopeProjectId,
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
    [debouncedSearchTerm, isOpen, productId, requirementId, scopeProjectId, workspaceSlug]
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
        title: t("error"),
        message: payload?.error ?? t("requirement_detail.test_cases.toast_link_failed"),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXXL}>
      <Combobox
        as="div"
        onChange={(row: TRequirementTestCase) => {
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
              placeholder={t("requirement_detail.test_cases.search_placeholder")}
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

        {/* 已选区：选中项以可撤销的胶囊常驻在搜索框下方，与需求关联弹窗一致 */}
        <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-3 py-2 text-13 text-secondary">
          {selected.length > 0 ? (
            selected.map((row) => (
              <span
                key={row.id}
                className="flex items-center gap-1 rounded-md border border-subtle bg-layer-1 py-1 pr-1 pl-2 text-11 whitespace-nowrap text-primary"
              >
                {row.code || row.name}
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
              {t("requirement_detail.test_cases.selected", { count: 0 })}
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
                    {row.code && (
                      <span className="shrink-0 rounded-sm bg-layer-2 px-1.5 py-0.5 text-11 font-medium text-secondary">
                        {row.code}
                      </span>
                    )}
                    <Tooltip tooltipContent={row.name}>
                      <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    </Tooltip>
                    {/* 候选池横跨需求关联的多个项目 + 共享库，只靠标题分不出用例来自哪 */}
                    <span className="shrink-0 text-11 text-secondary">
                      {row.repository_project_id === null
                        ? t("requirement_detail.test_cases.shared_repository")
                        : (row.repository_name ?? "")}
                    </span>
                  </Combobox.Option>
                );
              })}
              {/* 无限滚动哨兵 */}
              <div ref={setLoadMoreElement} className="h-1" />
              {isLoadingMore && <p className="px-3 py-2 text-center text-11 text-secondary">{t("loading")}</p>}
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
              ? `${t("requirement_detail.test_cases.submit")} · ${selected.length}`
              : t("requirement_detail.test_cases.submit")}
          </Button>
        </div>
      </Combobox>
    </ModalCore>
  );
};
