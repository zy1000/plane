import { Fragment } from "react";
import { Paperclip, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import type { TStageReview } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { StageReviewKindBadge } from "@/components/template-management/reviews/stage-review-kind-badge";
import { StageReviewResultBadge, StageReviewStatusBadge } from "./badges";
import type { TStageReviewGroup } from "./stage-review-rows";

const I18N = "stage_review";

/** 计划日期列：`09-01 → 09-12`。跨年在列表里没有意义，年份留给详情抽屉 */
const formatDateRange = (start: string | null, end: string | null) => {
  const short = (value: string | null) => (value ? value.slice(5) : null);
  const from = short(start);
  const to = short(end);
  if (!from && !to) return "—";
  if (from && to) return `${from} → ${to}`;
  return from ?? to ?? "—";
};

const Person = ({ user }: { user: TStageReview["leader_detail"] }) => {
  if (!user) return <span className="text-13 text-tertiary">—</span>;
  return (
    <span className="flex items-center gap-2 text-13 text-secondary">
      <Avatar size="sm" name={user.display_name} src={getFileURL(user.avatar_url ?? "")} />
      <span className="truncate">{user.display_name}</span>
    </span>
  );
};

/**
 * 评审列表：按产品分组，评审活动缩进挂在所属评审下。
 *
 * 评审与评审活动**共用同一行结构** —— 两者字段几乎一样，只有层级不同（产品决策），
 * 所以这里不按 kind 分叉，只用缩进和类型徽章区分。
 */
export const StageReviewTable = ({
  groups,
  activeReviewId,
  canManage,
  onOpen,
  onDelete,
}: {
  groups: TStageReviewGroup[];
  activeReviewId: string | null;
  canManage: boolean;
  onOpen: (reviewId: string) => void;
  onDelete: (review: TStageReview) => void;
}) => {
  const { t } = useTranslation();

  return (
    <Table className="text-13">
      <TableHeader>
        <TableRow className="bg-layer-1">
          <TableHead className="px-3.5 text-12 w-[36%]">{t(`${I18N}.table.title`)}</TableHead>
          <TableHead className="px-3.5 text-12 w-[9%]">{t(`${I18N}.table.kind`)}</TableHead>
          <TableHead className="px-3.5 text-12 w-[13%]">{t(`${I18N}.table.leader`)}</TableHead>
          <TableHead className="px-3.5 text-12 w-[11%]">{t(`${I18N}.table.status`)}</TableHead>
          <TableHead className="px-3.5 text-12 w-[11%]">{t(`${I18N}.table.result`)}</TableHead>
          <TableHead className="px-3.5 text-12 w-[13%]">{t(`${I18N}.table.dates`)}</TableHead>
          <TableHead className="px-3.5 text-12 w-[7%]">{t(`${I18N}.table.attachments`)}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <Fragment key={group.product.id}>
            <TableRow className="border-b border-subtle bg-layer-2">
              <TableCell colSpan={7} className="px-3.5 py-2 text-13 font-medium text-primary">
                {group.product.name}
                <span className="ml-2.5 text-12 font-normal text-tertiary">
                  {group.product.code ? `${group.product.code} · ` : ""}
                  {t(`${I18N}.table.group_progress`, { completed: group.completed, total: group.total })}
                </span>
              </TableCell>
            </TableRow>

            {group.rows.map(({ review, depth }) => (
              <TableRow
                key={review.id}
                onClick={() => onOpen(review.id)}
                className={cn(
                  "group cursor-pointer border-b border-subtle hover:bg-layer-1",
                  review.id === activeReviewId && "bg-accent-subtle hover:bg-accent-subtle"
                )}
              >
                <TableCell className="px-3.5 py-2.5">
                  <span className={cn("relative flex items-center gap-2", depth === 1 && "pl-6")}>
                    {depth === 1 && <span className="absolute left-2.5 w-2.5 border-t border-subtle" />}
                    <span className={cn("truncate text-primary", depth === 0 && "font-medium")}>{review.title}</span>
                    {review.is_manual && (
                      <span className="shrink-0 rounded border border-subtle px-1 text-10 text-tertiary">
                        {t(`${I18N}.table.manual`)}
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="px-3.5 py-2.5">
                  <StageReviewKindBadge kind={review.kind} />
                </TableCell>
                <TableCell className="px-3.5 py-2.5">
                  <Person user={review.leader_detail} />
                </TableCell>
                <TableCell className="px-3.5 py-2.5">
                  <StageReviewStatusBadge status={review.status} />
                </TableCell>
                <TableCell className="px-3.5 py-2.5">
                  <StageReviewResultBadge result={review.result} />
                </TableCell>
                <TableCell className="px-3.5 py-2.5 tabular-nums text-tertiary">
                  {formatDateRange(review.start_date, review.end_date)}
                </TableCell>
                <TableCell className="px-3.5 py-2.5">
                  <span className="flex items-center gap-2">
                    {review.attachment_count > 0 ? (
                      <span className="flex items-center gap-1 text-12 text-tertiary">
                        <Paperclip className="size-3.5" />
                        {review.attachment_count}
                      </span>
                    ) : (
                      <span className="text-13 text-tertiary">—</span>
                    )}
                    {/* 只有手工建的能删：裁剪生成的要回裁剪表取消勾选，后端也是这么挡的 */}
                    {canManage && review.is_manual && (
                      <button
                        type="button"
                        title={t(`${I18N}.actions.delete`)}
                        className={cn(
                          "ml-auto rounded p-1 text-tertiary opacity-0 transition",
                          "hover:bg-danger-subtle hover:text-danger-primary group-hover:opacity-100"
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(review);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </Fragment>
        ))}
      </TableBody>
    </Table>
  );
};
