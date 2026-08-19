import { useCallback, useEffect, useRef, useState } from "react";
import type { Placement } from "@popperjs/core";
import { usePopper } from "react-popper";
import { FileText } from "lucide-react";
import { Combobox } from "@headlessui/react";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, SearchIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectRequirement } from "@plane/types";
import useDebounce from "@/hooks/use-debounce";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
const PAGE_SIZE = 50;

type DropdownOption = {
  value: string | null;
  content: React.ReactNode;
};

type RequirementOptionsProps = {
  workspaceSlug: string;
  projectId: string;
  referenceElement: HTMLButtonElement | null;
  placement: Placement | undefined;
  isOpen: boolean;
  canRemoveRequirement: boolean;
};

export function RequirementOptions(props: RequirementOptionsProps) {
  const { workspaceSlug, projectId, isOpen, referenceElement, placement, canRemoveRequirement } = props;
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<TProjectRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const requestSequenceRef = useRef(0);
  const { isMobile } = usePlatformOS();
  const debouncedQuery = useDebounce(query, 300);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: placement ?? "bottom-start",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
    ],
  });

  const fetchRows = useCallback(async () => {
    if (!isOpen || !workspaceSlug || !projectId) return;
    const requestSequence = ++requestSequenceRef.current;
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await requirementService.listProjectRequirements(workspaceSlug, projectId, {
        search: debouncedQuery || undefined,
        perPage: PAGE_SIZE,
        cursor: `${PAGE_SIZE}:0:0`,
        excludeClosed: true,
      });
      if (requestSequence !== requestSequenceRef.current) return;
      setRows(response?.results ?? []);
    } catch {
      if (requestSequence !== requestSequenceRef.current) return;
      setRows([]);
      setLoadError(true);
    } finally {
      if (requestSequence === requestSequenceRef.current) setIsLoading(false);
    }
  }, [debouncedQuery, isOpen, projectId, workspaceSlug]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isMobile) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMobile]);

  const searchInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (query !== "" && event.key === "Escape") {
      event.stopPropagation();
      setQuery("");
    }
  };

  const options: DropdownOption[] = rows.map((requirement) => {
    const label = [requirement.display_id, requirement.title].filter(Boolean).join(" ");
    return {
      value: requirement.id,
      content: (
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="h-3.5 w-3.5 flex-shrink-0" />
          <Tooltip tooltipContent={label} isMobile={isMobile}>
            <span className="flex-grow truncate">{label || "-"}</span>
          </Tooltip>
        </div>
      ),
    };
  });

  if (canRemoveRequirement) {
    options.unshift({
      value: null,
      content: (
        <div className="flex items-center gap-2">
          <FileText className="h-3 w-3 flex-shrink-0" />
          <span className="flex-grow truncate">{t("project_requirements.issues.no_requirement")}</span>
        </div>
      ),
    });
  }

  return (
    <Combobox.Options className="fixed z-10" static>
      <div
        className="my-1 w-72 rounded-sm border-[0.5px] border-strong bg-surface-1 px-2 py-2.5 text-11 shadow-raised-200 focus:outline-none"
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
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("common.search.label")}
            displayValue={(assigned: any) => assigned?.name}
            onKeyDown={searchInputKeyDown}
          />
        </div>
        <div className="mt-2 max-h-48 space-y-1 overflow-y-scroll">
          {isLoading ? (
            <p className="px-1.5 py-1 text-placeholder italic">{t("common.loading")}</p>
          ) : loadError ? (
            <p className="px-1.5 py-1 text-placeholder italic">{t("project_requirements.toast.failed")}</p>
          ) : options.length > 0 ? (
            options.map((option) => (
              <Combobox.Option
                key={option.value ?? "none"}
                value={option.value}
                className={({ active, selected }) =>
                  `flex w-full cursor-pointer items-center justify-between gap-2 truncate rounded-sm px-1 py-1.5 select-none ${
                    active ? "bg-layer-transparent-hover" : ""
                  } ${selected ? "text-primary" : "text-secondary"}`
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
            <p className="px-1.5 py-1 text-placeholder italic">{t("common.search.no_matches_found")}</p>
          )}
        </div>
      </div>
    </Combobox.Options>
  );
}
