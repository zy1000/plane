import { useState } from "react";
import { Button } from "@plane/propel/button";
import { Popover } from "@plane/propel/popover";
import type { TViewSummaryRow } from "./types";

type TModeViewUpdateButtonProps = {
  viewName: string;
  modeName: string;
  /** 跟随该模式的项目数，没拉回来时不写数字 */
  followingCount?: number;
  /** 改过的部分，按「筛选 / 布局 / 显示字段」给出现在的样子 */
  changes: TViewSummaryRow[];
  onConfirm: () => Promise<void> | void;
};

/** 研发模式视图有改动时的「更新到研发模式」：先确认影响范围，跟随该模式的项目一起变 */
export const ModeViewUpdateButton = (props: TModeViewUpdateButtonProps) => {
  const { viewName, modeName, followingCount, changes, onConfirm } = props;
  // state
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm();
      setIsOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={(open) => !isSubmitting && setIsOpen(open)}>
      <Popover.Button className="h-8 shrink-0 rounded-md bg-accent-primary px-3.5 text-13 font-semibold whitespace-nowrap text-on-color hover:bg-accent-primary-hover">
        更新到研发模式
      </Popover.Button>
      <Popover.Panel
        placement="bottom-end"
        sideOffset={6}
        positionerClassName="z-30"
        className="flex w-[22rem] flex-col gap-3 rounded-xl border border-subtle bg-surface-1 p-4.5 shadow-overlay-200"
      >
        <div className="text-14 font-semibold text-primary">更新研发模式视图</div>
        <p className="text-13 leading-[22px] text-secondary">
          <span className="font-semibold text-primary">{modeName}</span>下
          {followingCount !== undefined ? (
            <>
              {" "}
              <span className="font-semibold text-primary tabular-nums">{followingCount}</span> 个项目
            </>
          ) : (
            "所有跟随项目"
          )}
          的「{viewName}」视图会一起改成现在的设置。
        </p>
        {changes.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg bg-layer-1 px-3 py-2.5 text-12">
            {changes.map((row) => (
              <div key={row.kind} className="flex min-w-0 items-center gap-2.5">
                <span className="shrink-0 text-secondary">{row.label}改为</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                  {row.chips?.map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex h-5.5 shrink-0 items-center rounded border border-subtle bg-surface-1 px-2 text-primary"
                    >
                      {chip}
                    </span>
                  ))}
                  <span className={row.chips?.length ? "truncate text-tertiary" : "truncate text-primary"}>
                    {row.text}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="secondary" size="lg" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="lg" onClick={() => void handleConfirm()} loading={isSubmitting}>
            更新
          </Button>
        </div>
      </Popover.Panel>
    </Popover>
  );
};
