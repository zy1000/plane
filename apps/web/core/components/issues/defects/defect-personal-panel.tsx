import { useEffect, useState, type FC } from "react";
import { Trophy, UserRound } from "lucide-react";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { useCountUp } from "@/hooks/use-count-up";

type TAssignee = {
  member_id: string;
  display_name: string;
  avatar_url: string;
  defect_count: number;
};

type Props = {
  isLoading: boolean;
  currentUserName: string;
  myDefectCount: number;
  myDefectRatio: number;
  totalDefects: number;
  topAssignees: TAssignee[];
};

const AssigneeDefectRow: FC<{
  animateBars: boolean;
  index: number;
  maxCount: number;
  member: TAssignee;
}> = ({ animateBars, index, maxCount, member }) => {
  const displayCount = useCountUp(member.defect_count);
  const width = (member.defect_count / maxCount) * 100;

  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "w-4 shrink-0 text-center text-xs font-semibold tabular-nums",
          index === 0 ? "text-amber-500" : "text-placeholder"
        )}
      >
        {index + 1}
      </span>
      <Avatar name={member.display_name} src={getFileURL(member.avatar_url)} size="md" showTooltip={false} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-primary">{member.display_name}</span>
          <span className="shrink-0 text-xs font-medium tabular-nums text-secondary">{displayCount}</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-red-500/60 transition-[width] duration-1000 ease-out"
            style={{ width: `${animateBars ? width : 0}%` }}
          />
        </div>
      </div>
    </div>
  );
};

export const DefectPersonalPanel: FC<Props> = ({
  isLoading,
  currentUserName,
  myDefectCount,
  myDefectRatio,
  totalDefects,
  topAssignees,
}) => {
  const ranked = topAssignees.slice(0, 5);
  const maxCount = ranked.reduce((max, member) => Math.max(max, member.defect_count), 0) || 1;
  const displayMyDefectCount = useCountUp(myDefectCount, { enabled: !isLoading });
  const displayMyDefectRatio = useCountUp(myDefectRatio, { enabled: !isLoading });
  const displayTotalDefects = useCountUp(totalDefects, { enabled: !isLoading });
  const rankingAnimationKey = ranked.map((member) => `${member.member_id}:${member.defect_count}`).join("|");
  const [animateBars, setAnimateBars] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setAnimateBars(false);
      return;
    }

    setAnimateBars(false);

    if (typeof window === "undefined") {
      setAnimateBars(true);
      return;
    }

    const frameId = window.requestAnimationFrame(() => setAnimateBars(true));
    return () => window.cancelAnimationFrame(frameId);
  }, [isLoading, myDefectRatio, rankingAnimationKey]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* 个人缺陷状况 */}
      <div className="rounded-xl border border-subtle bg-surface-1 p-5 shadow-sm lg:col-span-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <UserRound className="h-4 w-4 text-secondary" />
          我的缺陷状况
        </div>
        <div className="mt-4 flex items-end gap-2 tabular-nums">
          {isLoading ? (
            <span className="h-10 w-16 animate-pulse rounded bg-surface-2" />
          ) : (
            <span className="text-4xl font-semibold tracking-tight text-primary">{displayMyDefectCount}</span>
          )}
          <span className="pb-1 text-sm text-placeholder">个待你处理的缺陷</span>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-secondary">
            <span className="truncate">{currentUserName}</span>
            <span className="tabular-nums">占全部缺陷 {displayMyDefectRatio}%</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-red-500/70 transition-[width] duration-1000 ease-out"
              style={{ width: `${animateBars ? Math.min(myDefectRatio, 100) : 0}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-placeholder">项目共 {displayTotalDefects} 个缺陷</div>
        </div>
      </div>

      {/* 负责人缺陷分布 Top 5 */}
      <div className="rounded-xl border border-subtle bg-surface-1 p-5 shadow-sm lg:col-span-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-primary">
          <Trophy className="h-4 w-4 text-amber-500" />
          负责人缺陷分布 Top 5
        </div>
        {isLoading ? (
          <div className="mt-4 space-y-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="h-8 w-full animate-pulse rounded bg-surface-2" />
            ))}
          </div>
        ) : ranked.length === 0 ? (
          <div className="mt-6 flex h-20 items-center justify-center text-xs text-placeholder">
            暂无已指派负责人的缺陷
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {ranked.map((member, index) => (
              <AssigneeDefectRow
                key={member.member_id}
                animateBars={animateBars}
                index={index}
                maxCount={maxCount}
                member={member}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
