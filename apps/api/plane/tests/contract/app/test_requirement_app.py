from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import (
    FileAsset,
    Product,
    ProductMember,
    Requirement,
    RequirementAttachment,
    RequirementModule,
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


def create_workspace_user(workspace, email, role=15):
    user = User.objects.create_user(email=email, username=email.split("@")[0])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    return user


@pytest.mark.contract
@pytest.mark.django_db
class TestUserRequirementApp:
    def test_visible_member_can_create_and_type_is_forced_to_user(
        self, session_client, workspace, create_user
    ):
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
            },
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        requirement = Requirement.objects.get(id=response.data["id"])
        assert requirement.name == "Understand customer churn"
        assert requirement.type == Requirement.RequirementType.USER
        assert requirement.product_id == product.id
        assert requirement.attachments.filter(id=asset.id).exists()
        assert response.data["attachments"][0]["id"] == str(asset.id)

        listing = session_client.get(requirement_url(workspace.slug, product.id))
        assert listing.status_code == status.HTTP_200_OK
        assert listing.data["count"] == 1
        assert listing.data["data"][0]["type"] == "user"

        updated = session_client.patch(
            requirement_url(workspace.slug, product.id, requirement.id),
            {"attachment_ids": [], "type": "development", "product": str(workspace.id)},
            format="json",
        )
        assert updated.status_code == status.HTTP_200_OK, updated.data
        assert updated.data["type"] == "user"
        assert updated.data["attachments"] == []
        assert FileAsset.all_objects.get(id=asset.id).is_deleted is True

    def test_list_and_detail_are_scoped_to_product_and_user_type(
        self, session_client, workspace, create_user
    ):
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

        foreign_detail = session_client.get(
            requirement_url(workspace.slug, product.id, foreign_requirement.id)
        )
        assert foreign_detail.status_code == status.HTTP_404_NOT_FOUND

    def test_modules_members_relations_and_parent_cycles_are_validated(
        self, session_client, workspace, create_user
    ):
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
            },
            format="json",
        )
        assert invalid.status_code == status.HTTP_400_BAD_REQUEST

        child_response = session_client.post(
            requirement_url(workspace.slug, product.id),
            {"name": "Child", "module": str(module.id), "parent": str(parent.id)},
            format="json",
        )
        assert child_response.status_code == status.HTTP_201_CREATED, child_response.data

        cycle = session_client.patch(
            requirement_url(workspace.slug, product.id, parent.id),
            {"parent": child_response.data["id"]},
            format="json",
        )
        assert cycle.status_code == status.HTTP_400_BAD_REQUEST

        delete_module = session_client.delete(module_url(workspace.slug, product.id, module.id))
        assert delete_module.status_code == status.HTTP_204_NO_CONTENT
        child = Requirement.objects.get(id=child_response.data["id"])
        assert child.module_id is None

    def test_delete_cascades_all_descendants_and_requirement_assets(
        self, session_client, workspace, create_user
    ):
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
            type=Requirement.RequirementType.USER,
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

    def test_private_product_is_hidden_but_product_member_can_write(
        self, session_client, workspace, create_user
    ):
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
            {"name": "Guest supplied insight"},
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
        assert product_description.status_code == status.HTTP_403_FORBIDDEN
