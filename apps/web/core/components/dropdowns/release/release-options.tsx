import { useEffect, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import { Combobox } from "@headlessui/react";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { IRelease } from "@plane/types";
import { cn, sortBySelectedFirst } from "@plane/utils";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { Rocket } from "lucide-react";

type DropdownOptions =
  | {
      value: string | null;
      query: string;
      content: React.ReactNode;
    }[]
  | undefined;

interface Props {
  getReleaseById: (releaseId: string) => IRelease | null;
  isOpen: boolean;
  releaseIds?: string[];
  multiple: boolean;
  onDropdownOpen?: () => void;
  placement: Placement | undefined;
  referenceElement: HTMLButtonElement | null;
  value?: string[] | string | null;
}

export const ReleaseOptions = observer(function ReleaseOptions(props: Props) {
  const { getReleaseById, isOpen, releaseIds, multiple, onDropdownOpen, placement, referenceElement, value } = props;
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

  const options: DropdownOptions = releaseIds?.map((releaseId) => {
    const releaseDetails = getReleaseById(releaseId);
    return {
      value: releaseId,
      query: `${releaseDetails?.name}`,
      content: (
        <div className="flex min-w-0 items-center gap-2">
          <Rocket className="h-3 w-3 flex-shrink-0" />
          <Tooltip tooltipContent={releaseDetails?.name} isMobile={isMobile}>
            <span className="flex-grow truncate">{releaseDetails?.name}</span>
          </Tooltip>
        </div>
      ),
    };
  });

  if (!multiple) {
    const noReleaseLabel = t("release.no_release");
    options?.unshift({
      value: null,
      query: noReleaseLabel,
      content: (
        <div className="flex items-center gap-2">
          <Rocket className="h-3 w-3 flex-shrink-0" />
          <span className="flex-grow truncate">{noReleaseLabel}</span>
        </div>
      ),
    });
  }

  const filteredOptions = sortBySelectedFirst(
    query === "" ? options : options?.filter((o) => o.query.toLowerCase().includes(query.toLowerCase())),
    value
  );

  return (
    <Combobox.Options className="fixed z-10" static>
      <div
        className="my-1 w-48 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
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
                  key={option.value}
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
