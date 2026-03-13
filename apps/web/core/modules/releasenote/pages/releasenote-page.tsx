import { useEffect, useState } from "react";
import { Loader } from "@plane/ui";
import { PageHead } from "@/components/core/page-title";
import { ReleasenoteTimeline } from "../components/releasenote-timeline";
import { releasenoteService } from "../services/releasenote.service";
import type { IReleasenoteItem } from "../types";

type Props = {
  workspaceSlug: string;
};

export const ReleasenotePage = ({ workspaceSlug }: Props) => {
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<IReleasenoteItem[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await releasenoteService.getReleasenoteList({
          page: 1,
          page_size: 50,
        });
        setItems(response?.data ?? []);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <>
      <PageHead title="更新日志" />
      <div className="h-full w-full overflow-y-auto p-4 md:p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-primary">更新日志</h1>
            </div>
          </div>
          {isLoading ? (
            <Loader className="space-y-3">
              <Loader.Item height="90px" />
              <Loader.Item height="90px" />
              <Loader.Item height="90px" />
            </Loader>
          ) : items.length === 0 ? (
            <div className="rounded border border-subtle p-6 text-sm text-secondary">暂无更新日志</div>
          ) : (
            <ReleasenoteTimeline items={items} />
          )}
        </div>
      </div>
    </>
  );
};
