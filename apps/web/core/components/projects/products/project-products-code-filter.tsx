/**
 * 关联产品弹窗的「项目代号」筛选：单选，null 表示全部。
 * 下拉里本项目的代号单独成组排在最前，其余代号按字母序，每项带产品数。
 * 浮层不走 portal，直接绝对定位在弹窗里，省得和 Dialog 的层级、焦点陷阱打架。
 */
import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { CloseIcon, SearchIcon } from "@plane/propel/icons";
import { cn } from "@plane/utils";

export const CurrentProjectTag = () => {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[5px] bg-accent-subtle px-1.5 text-11 font-semibold text-accent-primary">
      {t("project_products.code_filter.current_project")}
    </span>
  );
};

type TOptionProps = {
  label: string;
  count: number;
  isSelected: boolean;
  onClick: () => void;
};

const CodeOption = ({ label, count, isSelected, onClick }: TOptionProps) => (
  <button
    type="button"
    role="option"
    aria-selected={isSelected}
    onClick={onClick}
    className={cn(
      "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-14 text-primary hover:bg-layer-transparent-hover",
      isSelected && "bg-layer-transparent-hover font-semibold"
    )}
  >
    <span className="flex w-4 shrink-0 text-accent-primary">{isSelected && <Check className="size-3.75" />}</span>
    <span className="min-w-0 flex-1 truncate" title={label}>
      {label}
    </span>
    <span className="shrink-0 text-12 font-normal text-placeholder tabular-nums">{count}</span>
  </button>
);

const GroupLabel = ({ children }: { children: string }) => (
  <div className="mx-2.5 mt-2 mb-1 text-11 font-semibold tracking-wide text-placeholder">{children}</div>
);

type TProps = {
  value: string | null;
  /** 本项目的项目代号；项目没填时为空串，不出「本项目」分组 */
  projectCode: string;
  /** 各代号下的可见产品数（不含空代号） */
  codeCounts: Map<string, number>;
  totalCount: number;
  onChange: (code: string | null) => void;
};

export const ProjectProductsCodeFilter = (props: TProps) => {
  const { value, projectCode, codeCounts, totalCount, onChange } = props;
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setIsOpen(false);
    setQuery("");
  };
  useOutsideClickDetector(containerRef, close);

  const pick = (code: string | null) => {
    onChange(code);
    close();
  };

  const otherCodes = useMemo(
    () => [...codeCounts.keys()].filter((code) => code !== projectCode).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [codeCounts, projectCode]
  );
  const keyword = query.trim().toLowerCase();
  const matches = (code: string) => !keyword || code.toLowerCase().includes(keyword);
  const showProjectCode = Boolean(projectCode) && matches(projectCode);
  const visibleOtherCodes = otherCodes.filter(matches);

  return (
    <div
      ref={containerRef}
      className="relative min-w-0"
      // Esc 只收起下拉，不要冒泡到 Dialog 把整个弹窗关掉
      onKeyDown={(event) => {
        if (event.key === "Escape" && isOpen) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <div
        className={cn(
          "flex h-10 max-w-[25rem] items-center overflow-hidden rounded-[10px] border bg-surface-1 transition-colors",
          isOpen ? "border-accent-strong" : "border-subtle-1"
        )}
      >
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => (isOpen ? close() : setIsOpen(true))}
          className="flex h-full min-w-0 items-center gap-2 pr-2.5 pl-3.5 text-14 text-primary"
        >
          <span className="shrink-0 text-tertiary">{t("project_products.code_filter.label")}</span>
          <span className="truncate font-medium" title={value ?? undefined}>
            {value ?? t("project_products.code_filter.all")}
          </span>
          {value !== null && value === projectCode && <CurrentProjectTag />}
          <ChevronDown
            className={cn("size-3.75 shrink-0 text-placeholder transition-transform", isOpen && "rotate-180")}
          />
        </button>
        {value !== null && (
          <button
            type="button"
            aria-label={t("project_products.code_filter.clear")}
            onClick={() => pick(null)}
            className="grid h-full w-8.5 shrink-0 place-items-center border-l border-subtle text-placeholder hover:bg-layer-transparent-hover hover:text-primary"
          >
            <CloseIcon className="size-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 z-20 mt-1.5 w-[28rem] max-w-[calc(100vw-2rem)] rounded-[10px] border border-subtle bg-surface-1 p-1 shadow-overlay-200">
          <label className="-mx-1 -mt-1 mb-1 flex h-10 items-center gap-2 border-b border-subtle px-3">
            <SearchIcon className="size-3.75 shrink-0 text-placeholder" />
            <input
              type="text"
              value={query}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("project_products.code_filter.search_placeholder")}
              className="min-w-0 flex-1 bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
            />
          </label>
          <div role="listbox" data-modal-wheel-scroll className="vertical-scrollbar scrollbar-sm max-h-80 overflow-y-auto">
            {!keyword && (
              <CodeOption
                label={t("project_products.code_filter.all_option")}
                count={totalCount}
                isSelected={value === null}
                onClick={() => pick(null)}
              />
            )}
            {showProjectCode && (
              <>
                <GroupLabel>{t("project_products.code_filter.current_project")}</GroupLabel>
                <CodeOption
                  label={projectCode}
                  count={codeCounts.get(projectCode) ?? 0}
                  isSelected={value === projectCode}
                  onClick={() => pick(projectCode)}
                />
              </>
            )}
            {visibleOtherCodes.length > 0 && (
              <>
                {projectCode && <GroupLabel>{t("project_products.code_filter.other_codes")}</GroupLabel>}
                {visibleOtherCodes.map((code) => (
                  <CodeOption
                    key={code}
                    label={code}
                    count={codeCounts.get(code) ?? 0}
                    isSelected={value === code}
                    onClick={() => pick(code)}
                  />
                ))}
              </>
            )}
            {keyword && !showProjectCode && visibleOtherCodes.length === 0 && (
              <p className="px-2.5 py-6 text-center text-13 text-tertiary">{t("project_products.code_filter.no_match")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
