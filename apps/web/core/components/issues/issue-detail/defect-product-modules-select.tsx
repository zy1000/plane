import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueProductLink } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectProduct } from "@/hooks/store/use-project-product";
import type { TIssueOperations } from "./root";

type Props = {
  className?: string;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/**
 * 缺陷属性栏的「产品模块」：候选按已关联的产品分组，每个产品至多一个模块；
 * 同一产品下勾新的就替换旧的，再点已勾的取消。
 * 走 issueOperations.update（整组 products），跟属性栏其他字段一样进编辑态的暂存：保存才落库、取消能撤回。
 */
export const DefectProductModulesSelect = observer(function DefectProductModulesSelect(props: Props) {
  const { className = "", workspaceSlug, projectId, issueId, issueOperations, disabled = false } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getProductModuleIds, getProductModuleById, fetchProductModules } = useProjectProduct();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const issue = getIssueById(issueId);
  const links: TIssueProductLink[] = (issue?.products ?? []).filter((item) => typeof item === "object" && !!item);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-start",
    // 属性栏外层有 overflow 裁剪，用 fixed 定位浮出去
    strategy: "fixed",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });

  // 打开时把各关联产品的模块树拉下来
  useEffect(() => {
    if (!isOpen) return;
    links.forEach((link) => {
      if (!getProductModuleIds(link.product_id)) void fetchProductModules(workspaceSlug, projectId, link.product_id);
    });
  }, [isOpen, links, getProductModuleIds, fetchProductModules, workspaceSlug, projectId]);

  // 点外面关闭
  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || popperElement?.contains(target)) return;
      setIsOpen(false);
      setQuery("");
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, popperElement]);

  const selected = links.filter((link) => link.product_module_id);
  const label = selected.length
    ? `${selected[0].product_module_name ?? getProductModuleById(selected[0].product_module_id ?? "")?.name ?? ""}`
    : null;

  const handlePick = async (productId: string, moduleId: string) => {
    const current = links.find((link) => link.product_id === productId)?.product_module_id ?? null;
    const nextModuleId = current === moduleId ? null : moduleId;
    const nextLinks = links.map((link) =>
      link.product_id === productId
        ? {
            ...link,
            product_module_id: nextModuleId,
            product_module_name: nextModuleId ? (getProductModuleById(nextModuleId)?.name ?? null) : null,
          }
        : link
    );
    setIsUpdating(true);
    try {
      await issueOperations.update(workspaceSlug, projectId, issueId, {
        products: nextLinks,
        product_module_id: nextLinks[0]?.product_module_id ?? null,
        product_module_ids: nextLinks.map((link) => link.product_module_id).filter((id): id is string => !!id),
      });
    } catch {
      // 提示由 issueOperations 给出
    } finally {
      setIsUpdating(false);
    }
  };

  const keyword = query.trim().toLowerCase();
  const tooltipContent =
    selected.length > 1 ? (
      <span className="flex flex-col gap-0.5">
        {selected.map((link) => (
          <span key={link.product_id}>
            {link.product_name} / {link.product_module_name}
          </span>
        ))}
      </span>
    ) : null;

  const button = (
    <button
      ref={setReferenceElement}
      type="button"
      disabled={disabled || isUpdating || links.length === 0}
      onClick={() => setIsOpen((value) => !value)}
      className={cn(
        "group flex h-7.5 w-full items-center justify-between gap-1 rounded-sm px-2 text-left text-body-xs-medium hover:bg-layer-1",
        { "cursor-not-allowed": disabled, "text-placeholder": !label }
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        {label ?? (links.length ? t("product_module_field.no_module") : t("product_module_field.select_product_first"))}
      </span>
      {selected.length > 1 && (
        <span className="flex-shrink-0 rounded-sm bg-accent-subtle px-1 text-caption-sm-medium leading-4 text-accent-primary">
          +{selected.length - 1}
        </span>
      )}
      <ChevronDownIcon className="hidden h-3.5 w-3.5 flex-shrink-0 group-hover:inline" aria-hidden="true" />
    </button>
  );

  return (
    <div ref={containerRef} className={cn("flex h-full items-center gap-1", className)}>
      {tooltipContent ? (
        <Tooltip tooltipHeading={t("product_module_field.label")} tooltipContent={tooltipContent}>
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {isOpen && (
          <div
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
            className="z-30 my-1 w-64 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200"
          >
            <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
              <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
              <input
                className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("common.search.label")}
                autoFocus
              />
            </div>
            <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
              {links.map((link) => {
                const moduleIds = getProductModuleIds(link.product_id);
                const modules = (moduleIds ?? [])
                  .map((id) => getProductModuleById(id))
                  .filter((module): module is NonNullable<typeof module> => !!module)
                  .filter((module) => !keyword || module.path.toLowerCase().includes(keyword));
                return (
                  <div key={link.product_id}>
                    <p className="px-1 pb-1 text-11 font-medium text-tertiary">{link.product_name}</p>
                    {!moduleIds ? (
                      <p className="px-1.5 py-1 text-placeholder italic">{t("common.loading")}</p>
                    ) : modules.length === 0 ? (
                      <p className="px-1.5 py-1 text-placeholder italic">
                        {keyword ? t("common.search.no_matching_results") : "该产品暂无模块"}
                      </p>
                    ) : (
                      modules.map((module) => {
                        const isSelected = link.product_module_id === module.id;
                        return (
                          <button
                            key={module.id}
                            type="button"
                            disabled={isUpdating}
                            onClick={() => void handlePick(link.product_id, module.id)}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-sm px-1 py-1.5 text-left hover:bg-layer-transparent-hover",
                              isSelected ? "text-primary" : "text-secondary"
                            )}
                            style={{ paddingLeft: 4 + module.depth * 12 }}
                          >
                            <span className="truncate">{module.name}</span>
                            {isSelected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          </div>
      )}
    </div>
  );
});
