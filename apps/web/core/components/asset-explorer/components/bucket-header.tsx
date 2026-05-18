import { Database, Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@plane/propel/button";
import { formatBytes } from "../utils/format";

type TBucketHeaderProps = {
  /** Title shown at the top; pass the current folder name. */
  title: string;
  pathBar?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  /** Direct child folder count (current level only). */
  directFolderCount?: number;
  /** Direct child file count (current level only). */
  directFileCount?: number;
  /** Recursive total size in bytes (current folder + all descendants). */
  recursiveSize?: number;
  /** Whether stats are still being loaded. */
  statsLoading?: boolean;
  canUpload: boolean;
  uploading: boolean;
  onRefresh: () => void;
  onUpload: () => void;
};

const HeaderButton = ({
  icon,
  label,
  onClick,
  disabled,
  loading,
  variant = "secondary",
}: {
  icon: React.ReactElement;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
}) => (
  <Button
    type="button"
    onClick={onClick}
    disabled={disabled}
    loading={loading}
    variant={variant}
    size="lg"
    prependIcon={loading ? <Loader2 className="animate-spin" /> : icon}
  >
    {label}
  </Button>
);

const MetaPiece = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <span className="flex items-baseline gap-1.5 whitespace-nowrap">
    <span className="text-[11px] uppercase tracking-[0.08em] text-tertiary">{label}:</span>
    <span className="text-[12.5px] font-medium text-secondary">{value}</span>
  </span>
);

const StatsValue = ({ value, loading }: { value: React.ReactNode; loading?: boolean }) =>
  loading ? (
    <span className="inline-block h-3 w-12 animate-pulse rounded bg-layer-2 align-middle" />
  ) : (
    <>{value}</>
  );

export const BucketHeader = ({
  title,
  pathBar,
  secondaryActions,
  directFolderCount,
  directFileCount,
  recursiveSize,
  statsLoading,
  canUpload,
  uploading,
  onRefresh,
  onUpload,
}: TBucketHeaderProps) => {
  const directTotal =
    (Number(directFolderCount ?? 0) || 0) + (Number(directFileCount ?? 0) || 0);
  const objectLabel =
    directTotal === 0
      ? "0 Objects"
      : `${directTotal} ${directTotal === 1 ? "Object" : "Objects"}`;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 border-b border-subtle px-5 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-primary/10 text-accent-primary">
          <Database className="size-5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          {pathBar ?? (
            <h1
              className="truncate text-[18px] font-semibold leading-tight tracking-tight text-primary"
              title={title}
            >
              {title}
            </h1>
          )}
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px] text-secondary">
            <MetaPiece
              label="Size"
              value={
                <StatsValue
                  loading={statsLoading}
                  value={recursiveSize && recursiveSize > 0 ? formatBytes(recursiveSize) : "—"}
                />
              }
            />
            <span className="text-tertiary/60" aria-hidden>·</span>
            <MetaPiece
              label="Objects"
              value={<StatsValue loading={statsLoading} value={objectLabel} />}
            />
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 pt-1">
        {secondaryActions}
        <HeaderButton
          icon={<RefreshCw className="size-4" />}
          label="刷新"
          onClick={onRefresh}
          variant="secondary"
        />
        {canUpload && (
          <HeaderButton
            icon={<Upload className="size-4" />}
            label="上传"
            onClick={onUpload}
            disabled={uploading}
            loading={uploading}
            variant="primary"
          />
        )}
      </div>
    </div>
  );
};
