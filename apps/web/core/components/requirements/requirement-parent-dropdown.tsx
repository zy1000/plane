import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox } from "@headlessui/react";
import { usePopper } from "react-popper";
import type { LucideIcon } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import type { TRequirement } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE = 20;

type Props = {
  workspaceSlug: string;
  /** 产品需求传 productId，标准库条目传 libraryId，二选一 —— 父项只能在同一归属内选 */
  productId?: string;
  libraryId?: string;
  value: string | null;
  onChange: (parentId: string | null) => void;
  /** 排除自身：一行不能做自己的父项 */
  excludeId?: string;
  buttonClassName?: string;
  /**
   * 外层定位容器。缺省撑满格子；建行弹窗底部的属性条要让它随内容收缩，
   * 否则这一个胶囊会把整行吃掉。
   */
  containerClassName?: string;
  /** 按钮文字的字号/颜色。缺省 text-14 + primary/placeholder（网格单元格的形态） */
  buttonTextClassName?: string;
  /** 按钮前置图标。属性条里用它表意，网格单元格里没有位置给图标 */
  icon?: LucideIcon;
  /** 空值时的按钮文字。网格有列头，传空串不再写「选择父项」 */
  placeholder?: string;
  disabled?: boolean;
};

/**
 * 父项选择器。检索走服务端（列表接口的 search 参数），不做本地全量缓存 ——
 * 一个产品下的需求可能上千条，为填一个下拉把它们全拉下来不值得，本地过滤也会在
 * 第一页之后静默漏掉候选项。
 *
 * 不复用工作项的 ParentIssuesListModal：那个查的是 issue，与需求条目不是一张表。
 * 成环由后端拦截（父项链上溯会撞回自己），这里只挡最直观的「选自己」。
 */
export const RequirementParentDropdown = ({
  workspaceSlug,
  productId,
  libraryId,
  value,
  onChange,
  excludeId,
  buttonClassName,
  containerClassName,
  buttonTextClassName,
  icon: Icon,
  placeholder,
  disabled = false,
}: Props) => {
  const { t } = useTranslation();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<TRequirement[]>([]);
  const [selectedRow, setSelectedRow] = useState<TRequirement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, { placement: "bottom-start" });
  useOutsideClickDetector(dropdownRef, () => setIsOpen(false));

  const fetchRows = useCallback(
    async (params: { search?: string; ids?: string[] }) => {
      const query = { ...params, perPage: PER_PAGE };
      // 已关闭的需求不进候选：不能再往它下面挂子项。按 ids 回显那次不加 —— 已选的父项
      // 哪怕后来关闭了也得把标题显示出来（服务端对带 ids 的请求本就豁免这个过滤）
      if (productId)
        return requirementService.listRequirements(workspaceSlug, productId, {
          ...query,
          ...(params.ids?.length ? {} : { excludeClosed: true }),
        });
      if (libraryId) return requirementService.listLibraryItems(workspaceSlug, libraryId, query);
      return null;
    },
    [workspaceSlug, productId, libraryId]
  );

  // 只在打开时检索；关着的单元格没必要为一个可能永远不点的下拉发请求
  useEffect(() => {
    if (!isOpen) return;
    setIsLoading(true);
    const timer = setTimeout(() => {
      void fetchRows({ search: query })
        .then((response) => setRows(response?.results ?? []))
        .finally(() => setIsLoading(false));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [isOpen, query, fetchRows]);

  // 已选的父项通常不在检索结果里，按 id 单独取一次它的标题，否则按钮上只剩一个 UUID
  useEffect(() => {
    if (!value) {
      setSelectedRow(null);
      return;
    }
    if (selectedRow?.id === value) return;
    const known = rows.find((row) => row.id === value);
    if (known) {
      setSelectedRow(known);
      return;
    }
    void fetchRows({ ids: [value] })
      .then((response) => setSelectedRow(response?.results[0] ?? null))
      .catch(() => setSelectedRow(null));
  }, [value, rows, selectedRow, fetchRows]);

  const options = rows.filter((row) => row.id !== excludeId);

  return (
    <Combobox
      as="div"
      ref={dropdownRef}
      value={value}
      onChange={(next: string | null) => {
        onChange(next);
        setIsOpen(false);
      }}
      disabled={disabled}
      className={cn("relative min-w-0", containerClassName ?? "w-full")}
    >
      <button
        type="button"
        ref={setReferenceElement}
        disabled={disabled}
        onClick={() => setIsOpen((previous) => !previous)}
        className={cn("flex min-w-0 items-center rounded-md text-left", containerClassName ? "w-auto" : "w-full", buttonClassName)}
      >
        {Icon && <Icon className="size-3.5 shrink-0 text-tertiary" />}
        <span
          className={
            buttonTextClassName
              ? cn("truncate", buttonTextClassName)
              : cn("truncate text-14", selectedRow ? "text-primary" : "text-placeholder")
          }
        >
          {selectedRow?.title || (placeholder ?? t("requirement_fields.builtin.select_parent"))}
        </span>
      </button>

      {isOpen && (
        <Combobox.Options className="fixed z-20" static>
          <div
            className="my-1 w-64 rounded-md border border-subtle bg-surface-1 p-2 shadow-raised-200 focus:outline-none"
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
          >
            <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
              <SearchIcon className="size-3.5 shrink-0 text-placeholder" strokeWidth={1.5} />
              <Combobox.Input
                className="w-full bg-transparent py-1 text-13 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("search")}
                displayValue={() => query}
              />
            </div>
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {value && (
                <Combobox.Option
                  value={null}
                  className={({ active }) =>
                    cn("cursor-pointer truncate rounded-sm px-2 py-1.5 text-13 text-secondary", active && "bg-layer-1")
                  }
                >
                  {t("requirement_grid.data.clear_selection")}
                </Combobox.Option>
              )}
              {isLoading ? (
                <Loader className="space-y-1">
                  <Loader.Item height="26px" />
                  <Loader.Item height="26px" />
                </Loader>
              ) : options.length ? (
                options.map((row) => (
                  <Combobox.Option
                    key={row.id}
                    value={row.id}
                    className={({ active }) =>
                      cn(
                        "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-13",
                        active && "bg-layer-1"
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className="truncate">{row.title || t("requirement_grid.data.untitled")}</span>
                        {selected && <CheckIcon className="size-3.5 shrink-0 text-accent-primary" />}
                      </>
                    )}
                  </Combobox.Option>
                ))
              ) : (
                <p className="px-2 py-1.5 text-13 text-placeholder">{t("no_matching_results")}</p>
              )}
            </div>
          </div>
        </Combobox.Options>
      )}
    </Combobox>
  );
};
