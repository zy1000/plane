import uuid

import pytest
from rest_framework import status

from plane.db.models import (
    Product,
    ProductMember,
    Requirement,
    RequirementFieldTemplate,
    RequirementStructuredRevision,
    RequirementVersion,
    User,
    WorkspaceMember,
)


def development_url(workspace_slug, product_id, requirement_id=None):
    base = f"/api/workspaces/{workspace_slug}/products/{product_id}/development-requirements/"
    return f"{base}{requirement_id}/" if requirement_id else base


def revision_url(workspace_slug, product_id, requirement_id, revision_id, suffix=""):
    return (
        f"{development_url(workspace_slug, product_id, requirement_id)}"
        f"structured-revisions/{revision_id}/{suffix}"
    )


def template_url(workspace_slug, product_id, template_id=None):
    base = f"/api/workspaces/{workspace_slug}/products/{product_id}/requirement-templates/"
    return f"{base}{template_id}/" if template_id else base


@pytest.mark.contract
@pytest.mark.django_db
class TestRequirementStructureApp:
    def test_requirement_template_atomic_crud_revision_and_active_filter(
        self, session_client, workspace, create_user
    ):
        product = Product.objects.create(
            name="Template Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        field_key = str(uuid.uuid4())
        created = session_client.post(
            template_url(workspace.slug, product.id),
            {
                "name": "Power template",
                "description": "Reusable structured power fields",
                "template_type": "structured",
                "is_active": True,
                "fields": [
                    {
                        "key": field_key,
                        "name": "Sequence",
                        "field_type": "auto_id",
                        "config": {"prefix": "PR", "padding": 0},
                    }
                ],
            },
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data
        template_id = created.data["id"]
        assert created.data["revision"] == 1
        assert created.data["template_type"] == "structured"
        assert created.data["field_count"] == 1
        assert created.data["fields"][0]["key"] == field_key
        legacy = session_client.get(
            f"/api/workspaces/{workspace.slug}/products/{product.id}/requirement-field-templates/"
        )
        assert legacy.status_code == status.HTTP_200_OK, legacy.data
        assert legacy.data[0]["id"] == template_id

        invalid = session_client.post(
            template_url(workspace.slug, product.id),
            {
                "name": "Invalid template",
                "fields": [
                    {
                        "key": str(uuid.uuid4()),
                        "name": "Invalid sequence",
                        "field_type": "auto_id",
                        "config": {"prefix": ""},
                    }
                ],
            },
            format="json",
        )
        assert invalid.status_code == status.HTTP_400_BAD_REQUEST, invalid.data
        assert not RequirementFieldTemplate.objects.filter(product=product, name="Invalid template").exists()

        updated = session_client.put(
            template_url(workspace.slug, product.id, template_id),
            {
                "revision": 1,
                "name": "Power specification template",
                "description": "Updated description",
                "template_type": "structured",
                "is_active": True,
                "fields": [
                    {
                        "key": field_key,
                        "name": "Sequence",
                        "field_type": "auto_id",
                        "config": {"prefix": "REQ", "padding": 0},
                    }
                ],
            },
            format="json",
        )
        assert updated.status_code == status.HTTP_200_OK, updated.data
        assert updated.data["revision"] == 2
        assert updated.data["name"] == "Power specification template"

        stale = session_client.put(
            template_url(workspace.slug, product.id, template_id),
            {
                "revision": 1,
                "name": "Stale overwrite",
                "template_type": "structured",
                "is_active": True,
                "fields": [],
            },
            format="json",
        )
        assert stale.status_code == status.HTTP_409_CONFLICT, stale.data
        assert stale.data["code"] == "REQUIREMENT_TEMPLATE_STALE"

        disabled = session_client.patch(
            template_url(workspace.slug, product.id, template_id),
            {"revision": 2, "is_active": False},
            format="json",
        )
        assert disabled.status_code == status.HTTP_200_OK, disabled.data
        assert disabled.data["revision"] == 3
        assert disabled.data["is_active"] is False

        active = session_client.get(
            template_url(workspace.slug, product.id),
            {"active": "true", "template_type": "structured"},
        )
        assert active.status_code == status.HTTP_200_OK, active.data
        assert active.data == []
        disabled_import = session_client.post(
            development_url(workspace.slug, product.id),
            {
                "name": "Cannot use disabled template",
                "content_mode": "structured",
                "template_id": template_id,
                "reviewers": [str(create_user.id)],
            },
            format="json",
        )
        assert disabled_import.status_code == status.HTTP_400_BAD_REQUEST, disabled_import.data
        assert disabled_import.data["template_id"] == ["REQUIREMENT_TEMPLATE_INVALID"]
        deleted = session_client.delete(template_url(workspace.slug, product.id, template_id))
        assert deleted.status_code == status.HTTP_204_NO_CONTENT, deleted.data
        assert session_client.get(template_url(workspace.slug, product.id, template_id)).status_code == status.HTTP_404_NOT_FOUND

    def test_requirement_template_guest_is_read_only(self, api_client, session_client, workspace, create_user):
        product = Product.objects.create(
            name="Guest Template Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        created = session_client.post(
            template_url(workspace.slug, product.id),
            {"name": "Guest visible template", "fields": []},
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data

        guest = User.objects.create(email="template-guest@example.com", username="template-guest")
        WorkspaceMember.objects.create(workspace=workspace, member=guest, role=5)
        ProductMember.objects.create(product=product, member=guest)
        api_client.force_authenticate(user=guest)
        detail_url = template_url(workspace.slug, product.id, created.data["id"])

        assert api_client.get(template_url(workspace.slug, product.id)).status_code == status.HTTP_200_OK
        assert api_client.get(detail_url).status_code == status.HTTP_200_OK
        assert (
            api_client.post(template_url(workspace.slug, product.id), {"name": "Forbidden"}, format="json").status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert (
            api_client.patch(
                detail_url,
                {"revision": created.data["revision"], "is_active": False},
                format="json",
            ).status_code
            == status.HTTP_403_FORBIDDEN
        )
        assert api_client.delete(detail_url).status_code == status.HTTP_403_FORBIDDEN

    def test_structured_requirement_ids_order_children_and_review_lifecycle(
        self, session_client, workspace, create_user
    ):
        product = Product.objects.create(
            name="Structured Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        created = session_client.post(
            development_url(workspace.slug, product.id),
            {
                "name": "Power supply specification",
                "content_mode": "structured",
                "reviewers": [str(create_user.id)],
                "submit_for_review": True,
            },
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data
        requirement_id = created.data["id"]
        assert created.data["content_mode"] == "structured"
        assert created.data["status"] == Requirement.Status.DRAFT
        change = created.data["open_change"]
        revision_id = change["structured_revision_id"]
        assert change["status"] == "draft"

        root_id_key = str(uuid.uuid4())
        voltage_key = str(uuid.uuid4())
        table_key = str(uuid.uuid4())
        child_id_key = str(uuid.uuid4())
        city_key = str(uuid.uuid4())
        schema = session_client.put(
            revision_url(workspace.slug, product.id, requirement_id, revision_id, "schema/"),
            {
                "lock_version": 1,
                "fields": [
                    {
                        "key": root_id_key,
                        "name": "Sequence",
                        "field_type": "auto_id",
                        "config": {"prefix": "PR", "padding": 0},
                    },
                    {
                        "key": voltage_key,
                        "name": "Voltage",
                        "field_type": "number",
                        "is_required": True,
                    },
                    {
                        "key": table_key,
                        "name": "Addresses",
                        "field_type": "table",
                    },
                    {
                        "key": child_id_key,
                        "parent_key": table_key,
                        "name": "Address sequence",
                        "field_type": "auto_id",
                        "config": {"prefix": "S", "padding": 0},
                    },
                    {
                        "key": city_key,
                        "parent_key": table_key,
                        "name": "City",
                        "field_type": "text",
                        "is_required": True,
                    },
                ],
            },
            format="json",
        )
        assert schema.status_code == status.HTTP_200_OK, schema.data
        lock_version = schema.data["lock_version"]

        rows_url = revision_url(workspace.slug, product.id, requirement_id, revision_id, "rows/")
        root_one = session_client.post(
            rows_url,
            {"lock_version": lock_version, "values": {voltage_key: "220"}},
            format="json",
        )
        assert root_one.status_code == status.HTTP_201_CREATED, root_one.data
        lock_version = root_one.data["lock_version"]
        assert root_one.data["row"]["display_id"] == "PR1"

        root_two = session_client.post(
            rows_url,
            {"lock_version": lock_version, "values": {voltage_key: "110"}},
            format="json",
        )
        assert root_two.status_code == status.HTTP_201_CREATED, root_two.data
        lock_version = root_two.data["lock_version"]
        assert root_two.data["row"]["display_id"] == "PR2"

        inserted = session_client.post(
            rows_url,
            {
                "lock_version": lock_version,
                "before_row_key": root_two.data["row"]["key"],
                "values": {voltage_key: "60"},
            },
            format="json",
        )
        assert inserted.status_code == status.HTTP_201_CREATED, inserted.data
        lock_version = inserted.data["lock_version"]
        assert inserted.data["row"]["display_id"] == "PR3"

        listing = session_client.get(rows_url)
        assert listing.status_code == status.HTTP_200_OK, listing.data
        assert [row["display_id"] for row in listing.data["data"]] == ["PR1", "PR3", "PR2"]

        child_one = session_client.post(
            rows_url,
            {
                "lock_version": lock_version,
                "parent_row_key": root_one.data["row"]["key"],
                "table_field_key": table_key,
                "values": {city_key: "Shanghai"},
            },
            format="json",
        )
        assert child_one.status_code == status.HTTP_201_CREATED, child_one.data
        lock_version = child_one.data["lock_version"]
        assert child_one.data["row"]["display_id"] == "PR1-S1"

        child_two = session_client.post(
            rows_url,
            {
                "lock_version": lock_version,
                "parent_row_key": root_two.data["row"]["key"],
                "table_field_key": table_key,
                "values": {city_key: "Beijing"},
            },
            format="json",
        )
        assert child_two.status_code == status.HTTP_201_CREATED, child_two.data
        assert child_two.data["row"]["display_id"] == "PR2-S1"

        submitted = session_client.post(
            f"{development_url(workspace.slug, product.id, requirement_id)}changes/{change['id']}/submit/",
            format="json",
        )
        assert submitted.status_code == status.HTTP_200_OK, submitted.data
        assert submitted.data["status"] == "pending"

        review = session_client.post(
            f"{development_url(workspace.slug, product.id, requirement_id)}changes/{change['id']}/reviews/",
            {"opinion": "approved"},
            format="json",
        )
        assert review.status_code == status.HTTP_200_OK, review.data

        requirement = Requirement.objects.get(id=requirement_id)
        revision = RequirementStructuredRevision.objects.get(id=revision_id)
        version = RequirementVersion.objects.get(requirement=requirement, version=1)
        assert requirement.status == Requirement.Status.PUBLISHED
        assert requirement.active_structured_revision_id == revision.id
        assert requirement.structured_root_row_count == 3
        assert revision.status == RequirementStructuredRevision.Status.LOCKED
        assert version.structured_revision_id == revision.id

    def test_user_requirement_rejects_structured_content_mode(self, session_client, workspace, create_user):
        product = Product.objects.create(
            name="User Requirement Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/products/{product.id}/user-requirements/",
            {
                "name": "Invalid structured user requirement",
                "content_mode": "structured",
                "reviewers": [str(create_user.id)],
            },
            format="json",
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert response.data["content_mode"] == ["REQUIREMENT_USER_CONTENT_MODE_TEXT_ONLY"]
