from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any, Optional


ONLYOFFICE_SESSION_LIMIT = 20
ONLYOFFICE_SAVE_REQUEST_LIMIT = 20
# 会话过期兜底（秒）：仅在文档服务器漏发 status 2/4 终态回调、导致会话永久
# 停留在 open 时用于自愈；正常编辑（会持续刷新 last_activity_at）不受影响。
# <=0 表示关闭兜底。
ONLYOFFICE_SESSION_TTL_SECONDS_DEFAULT = 8 * 60 * 60


def _session_ttl_seconds() -> int:
    try:
        from django.conf import settings

        value = getattr(
            settings,
            "ONLYOFFICE_SESSION_TTL_SECONDS",
            ONLYOFFICE_SESSION_TTL_SECONDS_DEFAULT,
        )
        return int(value or 0)
    except Exception:
        return ONLYOFFICE_SESSION_TTL_SECONDS_DEFAULT


def _utc_now() -> datetime:
    try:
        from django.utils import timezone

        return timezone.now()
    except Exception:  # pragma: no cover - django 运行期始终可用
        from datetime import timezone as _dt_timezone

        return datetime.now(_dt_timezone.utc)


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except (TypeError, ValueError):
        return None


def is_session_active(
    session: dict,
    *,
    ttl_seconds: int | None = None,
    now: Any = None,
) -> bool:
    """会话是否仍处于活动编辑中。

    在 ``state == "open"`` 之外增加过期兜底：当会话最近活动时间超过 TTL
    （通常意味着文档服务器漏发了终态回调），视为非活动，便于自愈——允许新
    编辑重新开会话，并解除对文件的删除/重命名/移动等 409 限制。

    注意：回调保存链路不使用本函数（收到回调即证明会话仍存活），因此过期兜
    底不会影响正在进行的保存，只影响“是否复用会话 key / 是否阻断文件操作”。
    """
    if str(session.get("state") or "") != "open":
        return False
    if ttl_seconds is None:
        ttl_seconds = _session_ttl_seconds()
    if not ttl_seconds or ttl_seconds <= 0:
        return True
    last = _parse_iso_datetime(
        session.get("last_activity_at") or session.get("opened_at")
    )
    if last is None:
        # 无法判断活动时间时保持“活动”，避免误解锁导致协同会话被拆分。
        return True
    reference = _parse_iso_datetime(now) if now is not None else _utc_now()
    if reference is None:
        return True
    if last.tzinfo is None and reference.tzinfo is not None:
        reference = reference.replace(tzinfo=None)
    elif last.tzinfo is not None and reference.tzinfo is None:
        last = last.replace(tzinfo=None)
    try:
        age_seconds = (reference - last).total_seconds()
    except (TypeError, ValueError):
        return True
    return age_seconds <= ttl_seconds


def _trim_save_requests(requests: dict) -> dict:
    ordered_requests = sorted(
        requests.items(),
        key=lambda item: str(
            item[1].get("requested_at") if isinstance(item[1], dict) else ""
        ),
    )
    return dict(ordered_requests[-ONLYOFFICE_SAVE_REQUEST_LIMIT:])


def get_onlyoffice_state(attributes: dict | None) -> dict:
    if not isinstance(attributes, dict):
        return {}
    state = attributes.get("onlyoffice")
    return deepcopy(state) if isinstance(state, dict) else {}


def set_onlyoffice_state(attributes: dict | None, state: dict) -> dict:
    next_attributes = deepcopy(attributes) if isinstance(attributes, dict) else {}
    next_attributes["onlyoffice"] = state
    return next_attributes


def get_doc_session(state: dict, doc_key: str) -> dict:
    sessions = state.get("doc_sessions")
    if not isinstance(sessions, dict):
        return {}
    session = sessions.get(str(doc_key or ""))
    return deepcopy(session) if isinstance(session, dict) else {}


def has_active_session(
    attributes: dict | None,
    *,
    ttl_seconds: int | None = None,
    now: Any = None,
) -> bool:
    state = get_onlyoffice_state(attributes)
    doc_key = str(state.get("active_session_key") or "")
    if not doc_key:
        return False
    session = get_doc_session(state, doc_key)
    return is_session_active(session, ttl_seconds=ttl_seconds, now=now)


def put_doc_session(state: dict, doc_key: str, session: dict) -> None:
    sessions = state.get("doc_sessions")
    if not isinstance(sessions, dict):
        sessions = {}
    sessions[str(doc_key)] = session
    ordered_sessions = sorted(
        sessions.items(),
        key=lambda item: str(
            item[1].get("last_activity_at")
            or item[1].get("opened_at")
            or ""
            if isinstance(item[1], dict)
            else ""
        ),
    )
    state["doc_sessions"] = dict(ordered_sessions[-ONLYOFFICE_SESSION_LIMIT:])


def create_edit_session(
    *,
    doc_key: str,
    base_version_id: str,
    now: str,
) -> dict:
    return {
        "doc_key": str(doc_key),
        "kind": "current",
        "state": "open",
        "base_version_id": str(base_version_id or ""),
        "opened_at": now,
        "last_activity_at": now,
        "next_save_sequence": 0,
        "last_applied_sequence": 0,
        "checkpoint_version_id": "",
        "save_requests": {},
        "editors": {},
    }


def touch_editor(
    session: dict,
    *,
    user_id: str,
    user_name: str,
    now: str,
) -> dict:
    next_session = deepcopy(session)
    editors = next_session.get("editors")
    if not isinstance(editors, dict):
        editors = {}
    if user_id:
        editors[str(user_id)] = {
            "name": str(user_name or ""),
            "last_seen_at": now,
        }
    next_session.update(
        {
            "editor_user_id": str(user_id or ""),
            "editor_user_name": str(user_name or ""),
            "last_activity_at": now,
        }
    )
    next_session["editors"] = editors
    return next_session


def set_active_session(state: dict, doc_key: str, session: dict, now: str) -> None:
    state["active_session_key"] = str(doc_key)
    # Keep the legacy fields as compatibility/debug mirrors only.
    state["last_doc_key"] = str(doc_key)
    state["last_opened_at"] = now
    put_doc_session(state, doc_key, session)


def close_active_session(
    state: dict,
    doc_key: str,
    *,
    terminal_status: int,
    now: str,
) -> dict:
    session = get_doc_session(state, doc_key)
    session.update(
        {
            "state": "closed",
            "terminal_status": int(terminal_status),
            "closed_at": now,
            "last_activity_at": now,
        }
    )
    put_doc_session(state, doc_key, session)
    if str(state.get("active_session_key") or "") == str(doc_key):
        state["active_session_key"] = ""
    return session


def register_save_request(
    session: dict,
    *,
    request_id: str,
    requested_at: str,
) -> tuple[dict, int]:
    next_session = deepcopy(session)
    sequence = int(next_session.get("next_save_sequence") or 0) + 1
    next_session["next_save_sequence"] = sequence
    next_session["last_activity_at"] = requested_at

    requests = next_session.get("save_requests")
    if not isinstance(requests, dict):
        requests = {}
    requests[str(request_id)] = {
        "id": str(request_id),
        "sequence": sequence,
        "status": "pending",
        "requested_at": requested_at,
        "completed_at": "",
        "error": "",
    }
    next_session["save_requests"] = _trim_save_requests(requests)
    return next_session, sequence


def resolve_callback_sequence(
    session: dict,
    *,
    request_id: str,
    received_at: str,
) -> tuple[dict, int, bool]:
    next_session = deepcopy(session)
    requests = next_session.get("save_requests")
    if not isinstance(requests, dict):
        requests = {}
    request_state = requests.get(str(request_id)) if request_id else None
    if isinstance(request_state, dict):
        sequence = int(request_state.get("sequence") or 0)
        already_completed = str(request_state.get("status") or "") in {
            "saved",
            "no_changes",
        }
    else:
        sequence = int(next_session.get("next_save_sequence") or 0) + 1
        next_session["next_save_sequence"] = sequence
        already_completed = False
        if request_id:
            requests[str(request_id)] = {
                "id": str(request_id),
                "sequence": sequence,
                "status": "pending",
                "requested_at": received_at,
                "completed_at": "",
                "error": "",
            }
            next_session["save_requests"] = _trim_save_requests(requests)

    next_session["last_activity_at"] = received_at
    return next_session, sequence, already_completed


def complete_save_request(
    session: dict,
    *,
    request_id: str,
    status: str,
    completed_at: str,
    error: str = "",
) -> dict:
    next_session = deepcopy(session)
    if not request_id:
        return next_session
    requests = next_session.get("save_requests")
    if not isinstance(requests, dict):
        requests = {}
    request_state = requests.get(str(request_id))
    if not isinstance(request_state, dict):
        request_state = {
            "id": str(request_id),
            "sequence": 0,
            "requested_at": "",
        }
    if (
        str(request_state.get("status") or "") in {"saved", "no_changes"}
        and status == "failed"
    ):
        return next_session
    request_state.update(
        {
            "status": str(status),
            "completed_at": completed_at,
            "error": str(error or ""),
        }
    )
    requests[str(request_id)] = request_state
    next_session["save_requests"] = _trim_save_requests(requests)
    return next_session


def complete_pending_save_requests(
    session: dict,
    *,
    status: str,
    completed_at: str,
    error: str = "",
) -> dict:
    next_session = deepcopy(session)
    requests = next_session.get("save_requests")
    if not isinstance(requests, dict):
        return next_session
    for request_state in requests.values():
        if not isinstance(request_state, dict):
            continue
        if str(request_state.get("status") or "") != "pending":
            continue
        request_state.update(
            {
                "status": str(status),
                "completed_at": completed_at,
                "error": str(error or ""),
            }
        )
    next_session["save_requests"] = _trim_save_requests(requests)
    return next_session


def session_status(
    state: dict,
    *,
    doc_key: str,
    request_id: str = "",
) -> dict[str, Any]:
    session = get_doc_session(state, doc_key)
    request_state = None
    requests = session.get("save_requests")
    if request_id and isinstance(requests, dict):
        value = requests.get(str(request_id))
        request_state = value if isinstance(value, dict) else None
    return {
        "doc_key": str(doc_key or ""),
        "is_active": bool(doc_key)
        and str(state.get("active_session_key") or "") == str(doc_key)
        and str(session.get("state") or "") == "open",
        "state": str(session.get("state") or ""),
        "last_callback_status": int(session.get("last_callback_status") or 0),
        "last_callback_at": str(session.get("last_callback_at") or ""),
        "last_saved_at": str(session.get("last_saved_at") or ""),
        "last_saved_version_id": str(
            session.get("last_saved_version_id") or ""
        ),
        "last_error": str(session.get("last_error") or ""),
        "save_request": deepcopy(request_state),
    }
