"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Combobox } from "@headlessui/react";
import { usePopper } from "react-popper";
import type { LucideIcon } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import type { TRequirementModule } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

type TFlatModule = { id: string; name: string; path: string; depth: number };

/** 树拍平成带路径的选项：同名模块靠完整路径（A / B）区分 */
const flattenModules = (nodes: TRequirementModule[], depth = 0, prefix = ""): TFlatModule[] =>
  nodes.flatMap((node) => {
    const path = prefix ? `${prefix} / ${node.name}` : node.name;
    return [{ id: node.id, name: node.name, path, depth }, ...flattenModules(node.children ?? [], depth + 1, path)];
  });

type TProps = {
  workspaceSlug: string;
  /** 产品需求传 productId，标准库条目传 libraryId，二选一 —— 模块只能在同一归属内选 */
  productId?: string;
  libraryId?: string;
  value: string | null;
  /** 行上已拍平的模块名（module_name），按钮回显用，关着时不用为它拉树 */
  valueName?: string | null;
  /** 选中即提交；moduleName 一并回传，调用方本地合并行数据时不用再解析树 */
  onChange: (moduleId: string | null, moduleName: string | null) => void;
  icon?: LucideIcon;
  buttonClassName?: string;
  buttonTextClassName?: string;
  placeholder?: string;
  disabled?: boolean;
};

/**
 * 模块选择器（详情页改挂靠用）。写入走 set-module 旁路端点（由调用方发），
 * 与批量移动同一条链路 —— 不进内容 PATCH、不触发审批。
 *
 * 树只在打开时拉一次：模块树很轻（一次 GET 全量），本地按名称/路径过滤即可，
 * 不像父项下拉那样需要服务端检索。
 */
export const RequirementModuleDropdown = ({
  workspaceSlug,
  productId,
  libraryId,
  value,
  valueName,
  onChange,
  icon: Icon,
  buttonClassName,
  buttonTextClassName,
  placeholder,
  disabled = false,
}: TProps) => {
  const { t } = useTranslation();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [modules, setModules] = useState<TFlatModule[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, { placement: "bottom-start" });
  useOutsideClickDetector(dropdownRef, () => setIsOpen(false));

  // 项目抽屉可以在不同产品的需求之间切换，作用域一变缓存的树就作废
  useEffect(() => {
    setModules(null);
  }, [workspaceSlug, productId, libraryId]);

  useEffect(() => {
    if (!isOpen || modules !== null) return;
    const scope = productId ? { productId } : libraryId ? { libraryId } : null;
    if (!scope) return;
    setIsLoading(true);
    void requirementService
      .listRequirementModules(workspaceSlug, scope)
      .then((response) => setModules(flattenModules(response.modules)))
      .catch(() => setModules([]))
      .finally(() => setIsLoading(false));
  }, [isOpen, libraryId, modules, productId, workspaceSlug]);

  const options = useMemo(() => {
    if (!modules) return [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return modules;
    return modules.filter((module) => module.path.toLowerCase().includes(keyword));
  }, [modules, query]);

  // 行上的 module_name 优先；行没带（比如刚在本地合并过）时从树里兜底解析
  const selectedName = valueName ?? (value ? (modules?.find((module) => module.id === value)?.name ?? null) : null);

  return (
    <Combobox
      as="div"
      ref={dropdownRef}
      value={value}
      onChange={(next: string | null) => {
        setIsOpen(false);
        if (next === value) return;
        onChange(next, next ? (modules?.find((module) => module.id === next)?.name ?? null) : null);
      }}
      disabled={disabled}
      className="relative w-full min-w-0"
    >
      <button
        type="button"
        ref={setReferenceElement}
        disabled={disabled}
        onClick={() => setIsOpen((previous) => !previous)}
        className={cn("flex w-full min-w-0 items-center rounded-md text-left", buttonClassName)}
      >
        {Icon && <Icon className="size-3.5 shrink-0 text-tertiary" />}
        <span
          className={cn("truncate", buttonTextClassName, selectedName ? "text-secondary" : "text-placeholder")}
          title={selectedName ?? undefined}
        >
          {selectedName ?? placeholder ?? t("requirement_modules.column")}
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
                  {t("requirement_modules.move_none")}
                </Combobox.Option>
              )}
              {isLoading ? (
                <Loader className="space-y-1">
                  <Loader.Item height="26px" />
                  <Loader.Item height="26px" />
                </Loader>
              ) : options.length ? (
                options.map((module) => (
                  <Combobox.Option
                    key={module.id}
                    value={module.id}
                    className={({ active }) =>
                      cn(
                        "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-13",
                        active && "bg-layer-1"
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className="truncate" style={{ paddingLeft: module.depth * 12 }} title={module.path}>
                          {module.name}
                        </span>
                        {selected && <CheckIcon className="size-3.5 shrink-0 text-accent-primary" />}
                      </>
                    )}
                  </Combobox.Option>
                ))
              ) : (
                <p className="px-2 py-1.5 text-13 text-placeholder">
                  {modules?.length === 0 ? t("requirement_modules.empty") : t("no_matching_results")}
                </p>
              )}
            </div>
          </div>
        </Combobox.Options>
      )}
    </Combobox>
  );
};
