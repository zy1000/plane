import type { ReactNode } from "react";
import { useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import type { TReviewTailoring } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import type { TTailoringListFilters } from "./filters";
import { EMPTY_TAILORING_FILTERS, TAILORING_STATUS_TONE, buildCreatorOptions, toggleValue } from "./filters";

const Chip = ({ children, onRemove }: { children: ReactNode; onRemove: () => void }) => (
  <span className="inline-flex h-5 items-center gap-1 rounded-sm bg-layer-2 pr-0.5 pl-1.5 text-12 text-primary">
    {children}
    <button
      type="button"
      className="grid size-4 place-items-center rounded-xs text-tertiary hover:bg-layer-2-hover hover:text-primary"
      onClick={onRemove}
    >
      <CloseIcon className="size-2.5" strokeWidth={2.2} />
    </button>
  </span>
);

const Group = ({ label, children }: { label: string; children: ReactNode }) => (
  <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-1.5">
    <span className="pl-0.5 text-12 text-tertiary">{label}</span>
    {children}
  </span>
);

/** 已应用条件：列表上方一行，每组一个框、每个值一个可摘的小块，最后是「清除全部」 */
export const TailoringAppliedFilters = ({
  tailorings,
  filters,
  onChange,
}: {
  tailorings: TReviewTailoring[];
  filters: TTailoringListFilters;
  onChange: (next: TTailoringListFilters) => void;
}) => {
  const { t } = useTranslation();
  const creators = useMemo(
    () => new Map(buildCreatorOptions(tailorings).map(({ user }) => [user.id, user])),
    [tailorings]
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-subtle px-6 py-2">
      {filters.status.length > 0 && (
        <Group label={t("review_tailoring.filters.status")}>
          {filters.status.map((status) => (
            <Chip key={status} onRemove={() => onChange({ ...filters, status: toggleValue(filters.status, status) })}>
              <span className={cn("size-1.5 rounded-full bg-current", TAILORING_STATUS_TONE[status])} />
              {t(`review_tailoring.status.${status}`)}
            </Chip>
          ))}
        </Group>
      )}
      {filters.createdBy.length > 0 && (
        <Group label={t("review_tailoring.filters.created_by")}>
          {filters.createdBy.map((userId) => {
            const user = creators.get(userId);
            return (
              <Chip
                key={userId}
                onRemove={() => onChange({ ...filters, createdBy: toggleValue(filters.createdBy, userId) })}
              >
                {user && (
                  <Avatar name={user.display_name} src={getFileURL(user.avatar_url ?? "")} showTooltip={false} size="sm" />
                )}
                {user?.display_name ?? "—"}
              </Chip>
            );
          })}
        </Group>
      )}
      <button
        type="button"
        className="h-7 rounded-md px-2 text-12 text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
        onClick={() => onChange(EMPTY_TAILORING_FILTERS)}
      >
        {t("review_tailoring.filters.clear_all")}
      </button>
    </div>
  );
};
