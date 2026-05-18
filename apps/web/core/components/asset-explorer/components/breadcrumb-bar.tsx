import type { TAssetFolder } from "@/services/asset-explorer.service";

type TPathBarProps = {
  breadcrumbs: TAssetFolder[];
  onNavigate: (folderId: number) => void;
};

export const BreadcrumbBar = ({ breadcrumbs, onNavigate }: TPathBarProps) => {
  const segments = breadcrumbs.length > 0 ? breadcrumbs : [];

  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 font-mono text-[13px] leading-none text-secondary">
      {segments.length === 0 ? (
        <span className="text-tertiary">/</span>
      ) : (
        <ol className="flex min-w-0 flex-wrap items-center gap-y-1">
          {segments.map((item, index) => {
            const isLast = index === segments.length - 1;
            return (
              <li key={item.id} className="flex items-center">
                {isLast ? (
                  <span
                    className="rounded px-1 py-0.5 font-semibold text-primary"
                    title={item.name}
                  >
                    {item.name}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="cursor-pointer rounded px-1 py-0.5 text-accent-primary transition-colors hover:bg-accent-primary/10 hover:text-accent-primary"
                    onClick={() => onNavigate(item.id)}
                    title={item.name}
                  >
                    {item.name}
                  </button>
                )}
                {!isLast && <span className="select-none px-0.5 text-tertiary">/</span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};
