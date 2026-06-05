export type TTestCaseCommentActorDetail = {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  avatar?: string | null;
  avatar_url?: string | null;
};

export type TTestCaseComment = {
  id: string;
  case: string;
  creator: string;
  actor_detail?: TTestCaseCommentActorDetail;
  comment_html: string;
  comment_json: Record<string, unknown> | null;
  comment_stripped: string;
  /** 兼容旧纯文本字段 */
  content?: string;
  parent: string | null;
  edited_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  children?: TTestCaseComment[];
};

export type TTestCaseCommentOperations = {
  createComment: (data: Partial<TTestCaseComment>) => Promise<TTestCaseComment | undefined>;
  removeComment: (commentId: string) => Promise<void>;
};
