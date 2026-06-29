# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from uuid import uuid4

from plane.app.serializers import WorkspaceUserMetricQuerySerializer


def test_profile_metric_query_uses_fixed_page_defaults():
    serializer = WorkspaceUserMetricQuerySerializer(
        data={},
        context={"metric": "assigned_issues"},
    )

    assert serializer.is_valid()
    assert serializer.validated_data["page"] == 1
    assert serializer.validated_data["page_size"] == 20


def test_profile_metric_query_rejects_incompatible_tree_filter():
    serializer = WorkspaceUserMetricQuerySerializer(
        data={"plan_id": uuid4()},
        context={"metric": "assigned_issues"},
    )

    assert not serializer.is_valid()
    assert "plan_id" in serializer.errors
