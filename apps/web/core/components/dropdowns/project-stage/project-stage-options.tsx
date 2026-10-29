import { useEffect, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
import { Layers } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { TProjectStageOption } from "@/store/project-stage.store";

type DropdownOption = {
  value: string | null;
  query: string;
  depth: number;
  content: React.ReactNode;
};

interface Props {
  isOpen: boolean;
  /** undefined = 还没拉到候选 */
  options?: TProjectStageOption[];
  onDropdownOpen?: () => void;
  placement: Placement | undefined;
  referenceElement: HTMLButtonElement | null;
  value?: string | null;
}

/** 选项按树先序排、不按已选置顶（树一乱就看不出父子）；只显示名称（编号可能很长会叠到名称上），搜索仍能按编号命中；搜索时去掉缩进。 */
export const ProjectStageOptions = observer(function ProjectStageOptions(props: Props) {
  const { isOpen, options, onDropdownOpen, placement, referenceElement, value } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();

  useEffect(() => {
    if (isOpen) {
      onDropdownOpen?.();
      if (!isMobile) {
        inputRef.current && inputRef.current.focus();
      }
    }
  }, [isOpen, isMobile, onDropdownOpen]);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [{ name: "preventOverflow", options: { padding: 12 } }],
  });

  const searchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (query !== "" && e.key === "Escape") {
      e.stopPropagation();
      setQuery("");
    }
  };

  const stageOptions: DropdownOption[] | undefined = options?.map(({ stage, depth }) => ({
    value: stage.id,
    query: `${stage.name} ${stage.code}`,
    depth,
    content: (
      <div className="flex min-w-0 items-center gap-1.5">
        {depth > 0 && <span className="flex-shrink-0 text-placeholder">└</span>}
        <Tooltip tooltipContent={stage.name} isMobile={isMobile}>
          <span className="flex-grow truncate">{stage.name}</span>
        </Tooltip>
      </div>
    ),
  }));

  const noStageLabel = t("stage_field.no_stage");
  const allOptions: DropdownOption[] | undefined = stageOptions && [
    {
      value: null,
      query: noStageLabel,
      depth: 0,
      content: (
        <div className="flex items-center gap-2">
          <Layers className="h-3 w-3 flex-shrink-0" />
          <span className="flex-grow truncate">{noStageLabel}</span>
        </div>
      ),
    },
    ...stageOptions,
  ];

  const filteredOptions =
    query === "" ? allOptions : allOptions?.filter((o) => o.query.toLowerCase().includes(query.toLowerCase()));

  return (
    <Combobox.Options className="fixed z-10" static>
      <div
        className="my-1 w-56 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
        ref={setPopperElement}
        style={styles.popper}
        {...attributes.popper}
      >
        <div className="flex items-center gap-1.5 rounded-sm border border-subtle bg-surface-2 px-2">
          <SearchIcon className="h-3.5 w-3.5 text-placeholder" strokeWidth={1.5} />
          <Combobox.Input
            as="input"
            ref={inputRef}
            className="w-full bg-transparent py-1 text-11 text-secondary placeholder:text-placeholder focus:outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search.label")}
            displayValue={(assigned: any) => assigned?.name}
            onKeyDown={searchInputKeyDown}
          />
        </div>
        <div className="mt-2 max-h-60 space-y-1 overflow-y-scroll">
          {filteredOptions ? (
            filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <Combobox.Option
                  key={option.value ?? "none"}
                  value={option.value}
                  className={({ active, selected }) =>
                    cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none",
                      {
                        "bg-layer-transparent-hover": active,
                        "text-primary": selected,
                        "text-secondary": !selected,
                      }
                    )
                  }
                  style={{ paddingLeft: query ? 4 : 4 + option.depth * 12 }}
                >
                  {({ selected }) => (
                    <>
                      <span className="flex-grow truncate">{option.content}</span>
                      {selected && <CheckIcon className="h-3.5 w-3.5 flex-shrink-0" />}
                    </>
                  )}
                </Combobox.Option>
              ))
            ) : (
              <p className="px-1.5 py-1 text-placeholder italic">{t("common.search.no_matching_results")}</p>
            )
          ) : (
            <p className="px-1.5 py-1 text-placeholder italic">{t("common.loading")}</p>
          )}
        </div>
      </div>
    </Combobox.Options>
  );
});
