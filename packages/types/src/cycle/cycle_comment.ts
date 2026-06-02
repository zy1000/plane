export type TCycleCommentActorDetail = {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  avatar?: string | null;
  avatar_url?: string | null;
};

export type TCycleComment = {
  id: string;
  workspace: string;
  project: string;
  cycle: string;
  actor: string;
  actor_detail?: TCycleCommentActorDetail;
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

export type TCycleCommentOperations = {
  createComment: (data: Partial<TCycleComment>) => Promise<TCycleComment | undefined>;
  removeComment: (commentId: string) => Promise<void>;
  copyCommentLink?: (commentId: string) => void;
};
