from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import (
    FileAsset,
    Product,
    ProductMember,
    Requirement,
    RequirementAttachment,
    RequirementChange,
    RequirementChangeStatus,
    RequirementComment,
    RequirementModule,
    RequirementVersion,
    User,
    WorkspaceMember,
)


def requirement_url(workspace_slug, product_id, requirement_id=None, suffix=None):
    base = f"/api/workspaces/{workspace_slug}/products/{product_id}/user-requirements/"
    if suffix:
        return f"{base}{suffix}/"
    return f"{base}{requirement_id}/" if requirement_id else base


def module_url(workspace_slug, product_id, module_id=None):
    base = f"/api/workspaces/{workspace_slug}/products/{product_id}/requirement-modules/"
    return f"{base}{module_id}/" if module_id else base


def change_url(workspace_slug, product_id, requirement_id, change_id=None):
    base = requirement_url(workspace_slug, product_id, requirement_id)
    return f"{base}changes/{f'{change_id}/' if change_id else ''}"


def review_url(workspace_slug, product_id, requirement_id, change_id):
    return f"{change_url(workspace_slug, product_id, requirement_id, change_id)}reviews/"


def comment_url(workspace_slug, product_id, requirement_id, comment_id=None, requirement_type="user"):
    prefix = "user-requirements" if requirement_type == "user" else "development-requirements"
    base = f"/api/workspaces/{workspace_slug}/products/{product_id}/{prefix}/{requirement_id}/comments/"
    return f"{base}{comment_id}/" if comment_id else base


def create_workspace_user(workspace, email, role=15):
    user = User.objects.create_user(email=email, username=email.split("@")[0])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    return user


@pytest.mark.contract
@pytest.mark.django_db
class TestUserRequirementApp:
    def test_requirement_comments_support_assets_replies_scope_and_author_delete(
        self, session_client, workspace, create_user
    ):
        product = Product.objects.create(
            name="Comment Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        requirement = Requirement.objects.create(
            product=product,
            name="Commented requirement",
            type=Requirement.RequirementType.USER,
        )
        other_requirement = Requirement.objects.create(
            product=product,
            name="Other requirement",
            type=Requirement.RequirementType.USER,
        )
        asset = FileAsset.objects.create(
            workspace=workspace,
            product=product,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.REQUIREMENT_COMMENT_DESCRIPTION,
            entity_identifier=str(requirement.id),
            attributes={"name": "comment.png", "type": "image/png", "size": 10},
            size=10,
            is_uploaded=True,
        )
        FileAsset.objects.filter(id=asset.id).update(created_by=create_user)

        root = session_client.post(
            comment_url(workspace.slug, product.id, requirement.id),
            {
                "comment_html": "<p>根评论 <strong>内容</strong></p>",
                "comment_json": {"type": "doc"},
                "asset_ids": [str(asset.id)],
            },
            format="json",
        )
        assert root.status_code == status.HTTP_201_CREATED, root.data
        assert root.data["comment_stripped"] == "根评论 内容"
        assert root.data["actor"] == create_user.id
        asset.refresh_from_db()
        assert asset.requirement_comment_id == root.data["id"]

        member = create_workspace_user(workspace, "requirement-commenter@example.com")
        session_client.force_authenticate(user=member)
        reply = session_client.post(
            comment_url(workspace.slug, product.id, requirement.id),
            {
                "comment_html": "<p>回复内容</p>",
                "parent": root.data["id"],
            },
            format="json",
        )
        assert reply.status_code == status.HTTP_201_CREATED, reply.data
        assert reply.data["parent"] == root.data["id"]

        foreign_parent = RequirementComment.objects.create(
            requirement=other_requirement,
            actor=member,
            comment_html="<p>另一个需求</p>",
        )
        invalid_parent = session_client.post(
            comment_url(workspace.slug, product.id, requirement.id),
            {"comment_html": "<p>错误回复</p>", "parent": str(foreign_parent.id)},
            format="json",
        )
        assert invalid_parent.status_code == status.HTTP_400_BAD_REQUEST

        forbidden_delete = session_client.delete(
            comment_url(workspace.slug, product.id, requirement.id, root.data["id"])
        )
        assert forbidden_delete.status_code == status.HTTP_403_FORBIDDEN

        listing = session_client.get(comment_url(workspace.slug, product.id, requirement.id))
        assert listing.status_code == status.HTTP_200_OK
        assert [item["id"] for item in listing.data] == [root.data["id"], reply.data["id"]]

        session_client.force_authenticate(user=create_user)
        immutable = session_client.patch(
            comment_url(workspace.slug, product.id, requirement.id, root.data["id"]),
            {"comment_html": "<p>不可编辑</p>"},
            format="json",
        )
        assert immutable.status_code == status.HTTP_405_METHOD_NOT_ALLOWED

        deleted = session_client.delete(
            comment_url(workspace.slug, product.id, requirement.id, root.data["id"])
        )
        assert deleted.status_code == status.HTTP_204_NO_CONTENT
        assert not RequirementComment.objects.filter(id__in=[root.data["id"], reply.data["id"]]).exists()
        assert not FileAsset.objects.filter(id=asset.id).exists()

        development_requirement = Requirement.objects.create(
            product=product,
            name="Development comment",
            type=Requirement.RequirementType.DEVELOPMENT,
        )
        development_comment = session_client.post(
            comment_url(
                workspace.slug,
                product.id,
                development_requirement.id,
                requirement_type="development",
            ),
            {"comment_html": "<p>研发需求评论</p>"},
            format="json",
        )
        assert development_comment.status_code == status.HTTP_201_CREATED, development_comment.data

    def test_visible_member_can_create_and_type_is_forced_to_user(self, session_client, workspace, create_user):
        product = Product.objects.create(
            name="Public Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        member = create_workspace_user(workspace, "requirement-member@example.com")
        session_client.force_authenticate(user=member)
        asset = FileAsset.objects.create(
            workspace=workspace,
            product=product,
            created_by=member,
            entity_type=FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT,
            attributes={"name": "voice.txt", "type": "text/plain", "size": 5},
            size=5,
            is_uploaded=True,
        )
        FileAsset.objects.filter(id=asset.id).update(created_by=member)
        asset.refresh_from_db()

        response = session_client.post(
            requirement_url(workspace.slug, product.id),
            {
                "name": "  Understand customer churn  ",
                "priority": "high",
                "type": "development",
                "product": str(workspace.id),
                "attachment_ids": [str(asset.id)],
                "reviewers": [str(member.id)],
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        requirement = Requirement.objects.get(id=response.data["id"])
        assert requirement.name == "Understand customer churn"
        assert requirement.type == Requirement.RequirementType.USER
        assert requirement.product_id == product.id
        assert requirement.attachments.filter(id=asset.id).exists()
        assert requirement.status == Requirement.Status.IN_REVIEW
        assert requirement.current_version == 0
        assert response.data["attachments"][0]["id"] == str(asset.id)

        listing = session_client.get(requirement_url(workspace.slug, product.id))
        assert listing.status_code == status.HTTP_200_OK
        assert listing.data["count"] == 1
        assert listing.data["data"][0]["type"] == "user"

        direct_update = session_client.patch(
            requirement_url(workspace.slug, product.id, requirement.id),
            {"attachment_ids": [], "type": "development", "product": str(workspace.id)},
            format="json",
        )
        assert direct_update.status_code == status.HTTP_409_CONFLICT

        changed = session_client.post(
            change_url(workspace.slug, product.id, requirement.id),
            {
                "name": requirement.name,
                "priority": requirement.priority,
                "reviewers": [str(member.id)],
                "attachment_ids": [],
            },
            format="json",
        )
        assert changed.status_code == status.HTTP_201_CREATED, changed.data
        approved = session_client.post(
            review_url(workspace.slug, product.id, requirement.id, changed.data["id"]),
            {"opinion": "approved"},
            format="json",
        )
        assert approved.status_code == status.HTTP_200_OK, approved.data
        requirement.refresh_from_db()
        assert requirement.status == Requirement.Status.ACTIVE
        assert requirement.current_version == 1
        assert not requirement.requirement_attachments.filter(asset_id=asset.id).exists()
        assert FileAsset.all_objects.get(id=asset.id).is_deleted is False

    def test_list_and_detail_are_scoped_to_product_and_user_type(self, session_client, workspace, create_user):
        product = Product.objects.create(name="Product A", workspace=workspace, owner=create_user)
        other_product = Product.objects.create(name="Product B", workspace=workspace, owner=create_user)
        user_requirement = Requirement.objects.create(
            product=product,
            name="User requirement",
            type=Requirement.RequirementType.USER,
        )
        Requirement.objects.create(
            product=product,
            name="Development requirement",
            type=Requirement.RequirementType.DEVELOPMENT,
        )
        foreign_requirement = Requirement.objects.create(
            product=other_product,
            name="Foreign requirement",
            type=Requirement.RequirementType.USER,
        )

        listing = session_client.get(requirement_url(workspace.slug, product.id))
        assert listing.status_code == status.HTTP_200_OK
        assert [row["id"] for row in listing.data["data"]] == [user_requirement.id]

        foreign_detail = session_client.get(requirement_url(workspace.slug, product.id, foreign_requirement.id))
        assert foreign_detail.status_code == status.HTTP_404_NOT_FOUND

    def test_modules_members_relations_and_parent_cycles_are_validated(self, session_client, workspace, create_user):
        product = Product.objects.create(name="Product", workspace=workspace, owner=create_user)
        other_product = Product.objects.create(name="Other Product", workspace=workspace, owner=create_user)
        other_module = RequirementModule.objects.create(product=other_product, name="Billing")
        module_response = session_client.post(
            module_url(workspace.slug, product.id),
            {"name": "Portal"},
            format="json",
        )
        assert module_response.status_code == status.HTTP_201_CREATED, module_response.data
        module = RequirementModule.objects.get(id=module_response.data["id"])
        rename_response = session_client.patch(
            module_url(workspace.slug, product.id, module.id),
            {"name": "Customer Portal"},
            format="json",
        )
        assert rename_response.status_code == status.HTTP_200_OK, rename_response.data
        parent = Requirement.objects.create(
            product=product,
            name="Parent",
            type=Requirement.RequirementType.USER,
        )
        outsider = User.objects.create_user(email="outsider@example.com", username="outsider")

        invalid = session_client.post(
            requirement_url(workspace.slug, product.id),
            {
                "name": "Invalid relations",
                "module": str(other_module.id),
                "assignee": str(outsider.id),
                "reviewers": [str(create_user.id)],
            },
            format="json",
        )
        assert invalid.status_code == status.HTTP_400_BAD_REQUEST

        child_response = session_client.post(
            requirement_url(workspace.slug, product.id),
            {
                "name": "Child",
                "module": str(module.id),
                "parent": str(parent.id),
                "reviewers": [str(create_user.id)],
            },
            format="json",
        )
        assert child_response.status_code == status.HTTP_201_CREATED, child_response.data

        cycle = session_client.post(
            change_url(workspace.slug, product.id, parent.id),
            {
                "name": parent.name,
                "priority": parent.priority,
                "parent": child_response.data["id"],
                "reviewers": [str(create_user.id)],
            },
            format="json",
        )
        assert cycle.status_code == status.HTTP_400_BAD_REQUEST

        delete_module = session_client.delete(module_url(workspace.slug, product.id, module.id))
        assert delete_module.status_code == status.HTTP_204_NO_CONTENT
        child = Requirement.objects.get(id=child_response.data["id"])
        assert child.module_id is None

    def test_delete_cascades_all_descendants_and_requirement_assets(self, session_client, workspace, create_user):
        product = Product.objects.create(name="Cascade Product", workspace=workspace, owner=create_user)
        parent = Requirement.objects.create(
            product=product,
            name="Parent",
            type=Requirement.RequirementType.USER,
        )
        child = Requirement.objects.create(
            product=product,
            parent=parent,
            name="Development child",
            type=Requirement.RequirementType.DEVELOPMENT,
        )
        grandchild = Requirement.objects.create(
            product=product,
            parent=child,
            name="Grandchild",
            type=Requirement.RequirementType.DEVELOPMENT,
        )
        asset = FileAsset.objects.create(
            workspace=workspace,
            product=product,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT,
            entity_identifier=str(parent.id),
            attributes={"name": "evidence.txt", "type": "text/plain", "size": 10},
            size=10,
            is_uploaded=True,
        )
        RequirementAttachment.objects.create(
            requirement=parent,
            asset=asset,
            created_by=create_user,
        )

        response = session_client.delete(requirement_url(workspace.slug, product.id, parent.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Requirement.objects.filter(id__in=[parent.id, child.id, grandchild.id]).exists()
        assert FileAsset.all_objects.get(id=asset.id).is_deleted is True
        assert FileAsset.all_objects.get(id=asset.id).deleted_at is not None

    def test_private_product_is_hidden_but_product_member_can_write(self, session_client, workspace, create_user):
        product = Product.objects.create(
            name="Private Product",
            workspace=workspace,
            owner=create_user,
            network=0,
        )
        guest = create_workspace_user(workspace, "requirement-guest@example.com", role=5)
        session_client.force_authenticate(user=guest)

        hidden = session_client.get(requirement_url(workspace.slug, product.id))
        assert hidden.status_code == status.HTTP_404_NOT_FOUND

        ProductMember.objects.create(product=product, member=guest)
        created = session_client.post(
            requirement_url(workspace.slug, product.id),
            {"name": "Guest supplied insight", "reviewers": [str(guest.id)]},
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data

    def test_visible_member_can_upload_requirement_assets_without_product_manage_permission(
        self, session_client, workspace, create_user
    ):
        product = Product.objects.create(
            name="Asset Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        member = create_workspace_user(workspace, "asset-member@example.com")
        session_client.force_authenticate(user=member)
        asset_url = f"/api/assets/v2/workspaces/{workspace.slug}/products/{product.id}/"

        with patch(
            "plane.app.views.asset.v2.presigned_post_for_asset",
            return_value={"url": "https://storage.invalid", "fields": {}},
        ):
            requirement_asset = session_client.post(
                asset_url,
                {
                    "name": "feedback.txt",
                    "type": "text/plain",
                    "size": 12,
                    "entity_type": FileAsset.EntityTypeContext.REQUIREMENT_ATTACHMENT,
                },
                format="json",
            )
            comment_asset = session_client.post(
                asset_url,
                {
                    "name": "comment.png",
                    "type": "image/png",
                    "size": 12,
                    "entity_type": FileAsset.EntityTypeContext.REQUIREMENT_COMMENT_DESCRIPTION,
                },
                format="json",
            )
            product_description = session_client.post(
                asset_url,
                {
                    "name": "description.png",
                    "type": "image/png",
                    "size": 12,
                    "entity_type": FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
                },
                format="json",
            )

        assert requirement_asset.status_code == status.HTTP_200_OK
        assert FileAsset.objects.get(id=requirement_asset.data["asset_id"]).entity_type == "REQUIREMENT_ATTACHMENT"
        assert comment_asset.status_code == status.HTTP_200_OK
        assert (
            FileAsset.objects.get(id=comment_asset.data["asset_id"]).entity_type
            == "REQUIREMENT_COMMENT_DESCRIPTION"
        )
        assert product_description.status_code == status.HTTP_403_FORBIDDEN

    def test_review_state_machine_clarification_approval_rejection_and_versions(
        self, session_client, workspace, create_user
    ):
        product = Product.objects.create(
            name="Review Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        reviewer = create_workspace_user(workspace, "reviewer@example.com")
        created = session_client.post(
            requirement_url(workspace.slug, product.id),
            {
                "name": "Review lifecycle",
                "priority": "medium",
                "reviewers": [str(create_user.id), str(reviewer.id)],
            },
            format="json",
        )
        assert created.status_code == status.HTTP_201_CREATED, created.data
        requirement_id = created.data["id"]
        change = RequirementChange.objects.get(requirement_id=requirement_id)

        session_client.force_authenticate(user=reviewer)
        clarification = session_client.post(
            review_url(workspace.slug, product.id, requirement_id, change.id),
            {"opinion": "needs_clarification", "reason": "请补充边界条件"},
            format="json",
        )
        assert clarification.status_code == status.HTTP_200_OK, clarification.data
        assert clarification.data["status"] == RequirementChangeStatus.PENDING

        reviewer_approval = session_client.post(
            review_url(workspace.slug, product.id, requirement_id, change.id),
            {"opinion": "approved", "reason": "已明确"},
            format="json",
        )
        assert reviewer_approval.status_code == status.HTTP_200_OK, reviewer_approval.data

        repeated = session_client.post(
            review_url(workspace.slug, product.id, requirement_id, change.id),
            {"opinion": "approved"},
            format="json",
        )
        assert repeated.status_code == status.HTTP_409_CONFLICT

        session_client.force_authenticate(user=create_user)
        final_approval = session_client.post(
            review_url(workspace.slug, product.id, requirement_id, change.id),
            {"opinion": "approved"},
            format="json",
        )
        assert final_approval.status_code == status.HTTP_200_OK, final_approval.data
        requirement = Requirement.objects.get(id=requirement_id)
        assert requirement.status == Requirement.Status.ACTIVE
        assert requirement.current_version == 1
        assert RequirementVersion.objects.filter(requirement=requirement).count() == 1

        proposed = session_client.post(
            change_url(workspace.slug, product.id, requirement_id),
            {
                "name": "Review lifecycle updated",
                "priority": "high",
                "reviewers": [str(create_user.id), str(reviewer.id)],
            },
            format="json",
        )
        assert proposed.status_code == status.HTTP_201_CREATED, proposed.data
        requirement.refresh_from_db()
        assert requirement.name == "Review lifecycle"
        assert requirement.status == Requirement.Status.IN_REVIEW

        session_client.force_authenticate(user=reviewer)
        missing_reason = session_client.post(
            review_url(workspace.slug, product.id, requirement_id, proposed.data["id"]),
            {"opinion": "rejected"},
            format="json",
        )
        assert missing_reason.status_code == status.HTTP_400_BAD_REQUEST
        rejected = session_client.post(
            review_url(workspace.slug, product.id, requirement_id, proposed.data["id"]),
            {"opinion": "rejected", "reason": "目标与产品方向冲突"},
            format="json",
        )
        assert rejected.status_code == status.HTTP_200_OK, rejected.data
        requirement.refresh_from_db()
        assert requirement.status == Requirement.Status.REJECTED
        assert requirement.current_version == 1
        assert RequirementVersion.objects.filter(requirement=requirement).count() == 1

    def test_development_requirements_support_full_api_and_type_aware_parents(
        self, session_client, workspace, create_user
    ):
        product = Product.objects.create(
            name="Development Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        user_parent = Requirement.objects.create(
            product=product,
            name="User parent",
            type=Requirement.RequirementType.USER,
        )
        development_base = f"/api/workspaces/{workspace.slug}/products/{product.id}/development-requirements/"
        development = session_client.post(
            development_base,
            {
                "name": "Implementation constraint",
                "parent": str(user_parent.id),
                "reviewers": [str(create_user.id)],
            },
            format="json",
        )
        assert development.status_code == status.HTTP_201_CREATED, development.data
        assert development.data["type"] == Requirement.RequirementType.DEVELOPMENT

        invalid_user_child = session_client.post(
            requirement_url(workspace.slug, product.id),
            {
                "name": "Invalid user child",
                "parent": development.data["id"],
                "reviewers": [str(create_user.id)],
            },
            format="json",
        )
        assert invalid_user_child.status_code == status.HTTP_400_BAD_REQUEST

        listing = session_client.get(development_base)
        assert listing.status_code == status.HTTP_200_OK
        assert [item["id"] for item in listing.data["data"]] == [development.data["id"]]
