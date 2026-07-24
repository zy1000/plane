from __future__ import annotations

import pytest

from plane.utils.onlyoffice_sessions import (
    close_active_session,
    complete_pending_save_requests,
    complete_save_request,
    create_edit_session,
    get_doc_session,
    has_active_session,
    is_session_active,
    register_save_request,
    resolve_callback_sequence,
    session_status,
    set_active_session,
)


@pytest.mark.unit
class TestOnlyOfficeSessions:
    def test_active_session_key_stays_stable_when_editors_join(self):
        state = {}
        session = create_edit_session(
            doc_key="shared-key",
            base_version_id="version-1",
            now="2026-07-23T10:00:00+00:00",
        )
        set_active_session(
            state,
            "shared-key",
            session,
            "2026-07-23T10:00:00+00:00",
        )

        assert state["active_session_key"] == "shared-key"
        assert get_doc_session(state, "shared-key")["state"] == "open"

        close_active_session(
            state,
            "shared-key",
            terminal_status=2,
            now="2026-07-23T10:05:00+00:00",
        )

        assert state["active_session_key"] == ""
        assert get_doc_session(state, "shared-key")["state"] == "closed"

    def test_save_request_status_is_resolved_by_request_id(self):
        session = create_edit_session(
            doc_key="shared-key",
            base_version_id="version-1",
            now="2026-07-23T10:00:00+00:00",
        )
        session, sequence = register_save_request(
            session,
            request_id="save-1",
            requested_at="2026-07-23T10:01:00+00:00",
        )
        session, callback_sequence, already_completed = resolve_callback_sequence(
            session,
            request_id="save-1",
            received_at="2026-07-23T10:01:01+00:00",
        )

        assert callback_sequence == sequence
        assert already_completed is False

        session = complete_save_request(
            session,
            request_id="save-1",
            status="saved",
            completed_at="2026-07-23T10:01:02+00:00",
        )
        state = {}
        set_active_session(
            state,
            "shared-key",
            session,
            "2026-07-23T10:01:02+00:00",
        )

        result = session_status(
            state,
            doc_key="shared-key",
            request_id="save-1",
        )
        assert result["is_active"] is True
        assert result["save_request"]["sequence"] == sequence
        assert result["save_request"]["status"] == "saved"

        session = complete_save_request(
            session,
            request_id="save-1",
            status="failed",
            completed_at="2026-07-23T10:01:03+00:00",
            error="late error",
        )
        assert session["save_requests"]["save-1"]["status"] == "saved"

        _, duplicate_sequence, duplicate_completed = resolve_callback_sequence(
            session,
            request_id="save-1",
            received_at="2026-07-23T10:01:03+00:00",
        )
        assert duplicate_sequence == sequence
        assert duplicate_completed is True

        assert session_status({}, doc_key="")["is_active"] is False

    def test_expired_open_session_is_not_active(self):
        state = {}
        session = create_edit_session(
            doc_key="shared-key",
            base_version_id="version-1",
            now="2026-07-23T10:00:00+00:00",
        )
        set_active_session(state, "shared-key", session, "2026-07-23T10:00:00+00:00")

        stored = get_doc_session(state, "shared-key")
        # 未过期：终态回调未漏发前仍视为活动。
        assert is_session_active(
            stored, ttl_seconds=3600, now="2026-07-23T10:30:00+00:00"
        )
        assert has_active_session(
            {"onlyoffice": state}, ttl_seconds=3600, now="2026-07-23T10:30:00+00:00"
        )

        # 超过 TTL（漏发终态回调）：视为非活动，允许自愈。
        assert not is_session_active(
            stored, ttl_seconds=3600, now="2026-07-23T12:00:00+00:00"
        )
        assert not has_active_session(
            {"onlyoffice": state}, ttl_seconds=3600, now="2026-07-23T12:00:00+00:00"
        )

        # ttl<=0 表示关闭兜底，恒按 state 判定。
        assert is_session_active(
            stored, ttl_seconds=0, now="2026-07-25T10:00:00+00:00"
        )

    def test_terminal_callback_completes_all_pending_save_requests(self):
        session = create_edit_session(
            doc_key="shared-key",
            base_version_id="version-1",
            now="2026-07-23T10:00:00+00:00",
        )
        session, _ = register_save_request(
            session,
            request_id="save-1",
            requested_at="2026-07-23T10:01:00+00:00",
        )
        session, _ = register_save_request(
            session,
            request_id="save-2",
            requested_at="2026-07-23T10:01:01+00:00",
        )

        session = complete_pending_save_requests(
            session,
            status="saved",
            completed_at="2026-07-23T10:01:02+00:00",
        )

        assert {
            request["status"]
            for request in session["save_requests"].values()
        } == {"saved"}
