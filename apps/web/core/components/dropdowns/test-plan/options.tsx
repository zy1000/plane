import { useEffect, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
import { ClipboardCheck } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn, sortBySelectedFirst } from "@plane/utils";
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { TPlanListItem } from "@/services/qa/plan.service";

type DropdownOptions =
  | {
      value: string | null;
      query: string;
      content: React.ReactNode;
    }[]
  | undefined;

interface Props {
  isOpen: boolean;
  plans: TPlanListItem[] | undefined;
  placement: Placement | undefined;
  referenceElement: HTMLButtonElement | null;
  value?: string | null;
}

const NO_TEST_PLAN_LABEL = "无测试计划";

export const TestPlanOptions = observer(function TestPlanOptions(props: Props) {
  const { isOpen, plans, placement, referenceElement, value } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();

  useEffect(() => {
    if (isOpen && !isMobile) {
      inputRef.current && inputRef.current.focus();
    }
  }, [isOpen, isMobile]);

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

  const options: DropdownOptions = plans?.map((plan) => ({
    value: String(plan.id),
    query: plan.name ?? "",
    content: (
      <div className="flex min-w-0 items-center gap-2">
        <ClipboardCheck className="h-3 w-3 flex-shrink-0" />
        <Tooltip tooltipContent={plan.name} isMobile={isMobile}>
          <span className="flex-grow truncate">{plan.name}</span>
        </Tooltip>
      </div>
    ),
  }));

  options?.unshift({
    value: null,
    query: NO_TEST_PLAN_LABEL,
    content: (
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-3 w-3 flex-shrink-0" />
        <span className="flex-grow truncate">{NO_TEST_PLAN_LABEL}</span>
      </div>
    ),
  });

  const filteredOptions = sortBySelectedFirst(
    query === "" ? options : options?.filter((o) => o.query.toLowerCase().includes(query.toLowerCase())),
    value
  );

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
        <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
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
