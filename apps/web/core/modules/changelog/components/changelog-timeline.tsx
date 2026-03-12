import { Card } from "@plane/ui";
import { RichTextEditor } from "@/components/editor/rich-text";
import type { IChangelogItem } from "../types";

type Props = {
  items: IChangelogItem[];
};

const TYPE_LABEL: Record<IChangelogItem["update_type"], string> = {
  added: "新增",
  fixed: "修复",
  improved: "优化",
};

const TYPE_CLASS: Record<IChangelogItem["update_type"], string> = {
  added: "text-green-700 bg-green-100",
  fixed: "text-red-700 bg-red-100",
  improved: "text-blue-700 bg-blue-100",
};

const formatDate = (value: string | null) => {
  if (!value) return "未发布";
  return new Date(value).toLocaleString();
};

export const ChangelogTimeline = ({ items }: Props) => (
  <div className="flex flex-col gap-4">
    {items.map((item) => (
      <div key={item.id} className="relative pl-6">
        <span className="absolute left-1 top-2 h-2.5 w-2.5 rounded-full bg-accent-primary" />
        <span className="absolute left-[7px] top-5 bottom-[-20px] w-px bg-[var(--border-subtle)]" />
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-primary">{item.title}</span>
            <span className="rounded bg-layer-1-hover px-2 py-0.5 text-xs text-secondary">
              v{item.version}
            </span>
            <span className={`rounded px-2 py-0.5 text-xs ${TYPE_CLASS[item.update_type]}`}>
              {TYPE_LABEL[item.update_type]}
            </span>
            {item.is_pinned && (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700">置顶</span>
            )}
          </div>
          <p className="mt-2 text-xs text-secondary">发布日期：{formatDate(item.release_date)}</p>
          {item.summary && <p className="mt-2 text-sm text-primary">{item.summary}</p>}
          <div className="mt-3 rounded border border-subtle-1 bg-layer-1 p-2">
            <RichTextEditor
              id={`changelog-content-${item.id}`}
              editable={false}
              initialValue={item.content || item.description || ""}
              workspaceSlug=""
              workspaceId=""
            />
          </div>
          {item.links?.length > 0 && (
            <div className="mt-3 flex flex-col gap-1">
              {item.links.map((link) => (
                <a
                  key={link}
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-accent-primary hover:underline"
                >
                  {link}
                </a>
              ))}
            </div>
          )}
          {item.screenshots?.length > 0 && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {item.screenshots.map((url) => (
                <img key={url} src={url} alt={item.title} className="h-40 w-full rounded border object-cover" />
              ))}
            </div>
          )}
        </Card>
      </div>
    ))}
  </div>
);
