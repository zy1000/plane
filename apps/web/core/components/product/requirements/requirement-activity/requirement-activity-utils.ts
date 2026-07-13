import type { IUserLite } from "@plane/types";
import type { TRequirementComment } from "@/services/requirement-comment.service";
import type {
  TRequirementChange,
  TRequirementReviewOpinion,
  TRequirementVersion,
} from "@/services/requirement.service";

type TRequirementVersionActivity = {
  id: string;
  activityType: "version";
  actor: string | null;
  actorDetail?: IUserLite | null;
  createdAt: string;
  version: number;
  source: string;
  changeId: string | null;
};

type TRequirementReviewActivity = {
  id: string;
  activityType: "review";
  actor: string;
  actorDetail: IUserLite;
  createdAt: string;
  changeId: string;
  sequence: number;
  opinion: TRequirementReviewOpinion;
  reason: string;
};

type TRequirementCommentActivity = {
  id: string;
  activityType: "comment";
  actor: string;
  actorDetail: IUserLite;
  createdAt: string;
  comment: TRequirementComment;
  replyTarget?: TRequirementComment;
};

export type TRequirementActivityItem =
  | TRequirementVersionActivity
  | TRequirementReviewActivity
  | TRequirementCommentActivity;

const activityTimestamp = (item: TRequirementActivityItem) => new Date(item.createdAt).getTime();

export const sortRequirementActivityItems = (items: TRequirementActivityItem[], direction: "asc" | "desc") => {
  const sortedItems = [...items];
  sortedItems.sort((a, b) => {
    const timeDifference = activityTimestamp(a) - activityTimestamp(b);
    if (timeDifference !== 0) return direction === "asc" ? timeDifference : -timeDifference;
    return direction === "asc" ? a.id.localeCompare(b.id) : b.id.localeCompare(a.id);
  });
  return sortedItems;
};

export const buildRequirementActivityItems = (
  changes: TRequirementChange[],
  versions: TRequirementVersion[],
  comments: TRequirementComment[]
): TRequirementActivityItem[] => {
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]));
  const versionItems: TRequirementVersionActivity[] = versions.map((version) => ({
    id: `version-${version.id}`,
    activityType: "version",
    actor: version.created_by,
    createdAt: version.created_at,
    version: version.version,
    source: version.source,
    changeId: version.change_id,
  }));
  const reviewItems: TRequirementReviewActivity[] = changes.flatMap((change) =>
    change.reviewer_assignments.flatMap((assignment) =>
      assignment.records.map((record) => ({
        id: `review-${record.id}`,
        activityType: "review" as const,
        actor: assignment.reviewer,
        actorDetail: record.reviewer_detail ?? assignment.reviewer_detail,
        createdAt: record.created_at,
        changeId: change.id,
        sequence: change.sequence,
        opinion: record.opinion,
        reason: record.reason,
      }))
    )
  );
  const commentItems: TRequirementCommentActivity[] = comments.map((comment) => ({
    id: `comment-${comment.id}`,
    activityType: "comment",
    actor: comment.actor,
    actorDetail: comment.actor_detail,
    createdAt: comment.created_at,
    comment,
    replyTarget: comment.parent ? commentsById.get(comment.parent) : undefined,
  }));

  return sortRequirementActivityItems([...versionItems, ...reviewItems, ...commentItems], "asc");
};

export type TRequirementCommentTree = {
  roots: TRequirementComment[];
  childrenByParent: Record<string, TRequirementComment[]>;
  commentsById: Record<string, TRequirementComment>;
};

const compareComments = (a: TRequirementComment, b: TRequirementComment) =>
  new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

export const buildRequirementCommentTree = (comments: TRequirementComment[]): TRequirementCommentTree => {
  const roots: TRequirementComment[] = [];
  const childrenByParent: Record<string, TRequirementComment[]> = {};
  const commentsById: Record<string, TRequirementComment> = {};

  comments.forEach((comment) => {
    commentsById[comment.id] = comment;
    if (comment.parent) (childrenByParent[comment.parent] ||= []).push(comment);
    else roots.push(comment);
  });
  roots.sort(compareComments);
  Object.values(childrenByParent).forEach((children) => children.sort(compareComments));
  return { roots, childrenByParent, commentsById };
};

export const flattenRequirementCommentDescendants = (
  rootId: string,
  childrenByParent: Record<string, TRequirementComment[]>
) => {
  const descendants: TRequirementComment[] = [];
  const stack = [...(childrenByParent[rootId] ?? [])];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    descendants.push(current);
    stack.push(...(childrenByParent[current.id] ?? []));
  }
  descendants.sort(compareComments);
  return descendants;
};
