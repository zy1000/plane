export type TReleaseActivityActorDetail = {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  avatar?: string | null;
  avatar_url?: string | null;
};

export type TReleaseActivity = {
  id: string;
  workspace: string;
  project: string;
  release: string;
  actor: string | null;
  actor_detail?: TReleaseActivityActorDetail | null;
  verb: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  old_identifier: string | null;
  new_identifier: string | null;
  comment: string;
  release_comment: string | null;
  epoch: number | null;
  extra?: {
    reason?: string;
    comment_html?: string;
    reply_to_actor?: string | null;
    reply_to_name?: string | null;
  } | null;
  created_at: string;
  updated_at: string;
};
