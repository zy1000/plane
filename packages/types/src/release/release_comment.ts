export type TReleaseCommentActorDetail = {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  avatar?: string | null;
  avatar_url?: string | null;
};

export type TReleaseComment = {
  id: string;
  workspace: string;
  project: string;
  release: string;
  actor: string;
  actor_detail?: TReleaseCommentActorDetail;
  comment_html: string;
  comment_json: Record<string, unknown> | null;
  comment_stripped: string;
  parent: string | null;
  edited_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TReleaseCommentOperations = {
  createComment: (data: Partial<TReleaseComment>) => Promise<TReleaseComment | undefined>;
  removeComment: (commentId: string) => Promise<void>;
  copyCommentLink?: (commentId: string) => void;
};
