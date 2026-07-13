from unittest.mock import patch

import pytest
from rest_framework import status

from plane.db.models import (
    FileAsset,
    Product,
    ProductMember,
    Requirement,
    User,
    WorkspaceMember,
)


def product_url(workspace_slug, product_id=None):
    base = f"/api/workspaces/{workspace_slug}/products/"
    return f"{base}{product_id}/" if product_id else base


def product_member_url(workspace_slug, product_id, member_id=None):
    base = f"{product_url(workspace_slug, product_id)}members/"
    return f"{base}{member_id}/" if member_id else base


def create_workspace_user(workspace, email, role):
    user = User.objects.create_user(email=email, username=email.split("@")[0])
    WorkspaceMember.objects.create(workspace=workspace, member=user, role=role)
    return user


@pytest.mark.contract
@pytest.mark.django_db
class TestProductApp:
    def test_create_product_binds_members_and_description_assets(self, session_client, workspace, create_user):
        owner = create_workspace_user(workspace, "product-owner@example.com", 15)
        asset = FileAsset.objects.create(
            workspace=workspace,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
            attributes={"name": "diagram.png", "type": "image/png", "size": 12},
            size=12,
            is_uploaded=True,
        )
        FileAsset.objects.filter(id=asset.id).update(created_by=create_user)
        asset.refresh_from_db()

        with patch("plane.app.views.product._rebind_assets_to_final_path"):
            response = session_client.post(
                product_url(workspace.slug),
                {
                    "name": "Customer Portal",
                    "description_html": f'<p><image-component id="{asset.id}"></image-component></p>',
                    "description_asset_ids": [str(asset.id)],
                    "network": 2,
                    "owner": str(owner.id),
                },
                format="json",
            )

        assert response.status_code == status.HTTP_201_CREATED, response.data
        product = Product.objects.get(name="Customer Portal")
        asset.refresh_from_db()
        assert product.workspace == workspace
        assert product.created_by_id == create_user.id
        assert product.owner_id == owner.id
        assert asset.product_id == product.id
        assert ProductMember.objects.filter(product=product, member=create_user).exists()
        assert ProductMember.objects.filter(product=product, member=owner).exists()
        assert response.data["can_manage"] is True

    def test_guest_cannot_create_product(self, session_client, workspace):
        guest = create_workspace_user(workspace, "product-guest@example.com", 5)
        session_client.force_authenticate(user=guest)

        response = session_client.post(
            product_url(workspace.slug),
            {"name": "Guest Product", "network": 2, "owner": str(guest.id)},
            format="json",
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_visibility_matches_product_network_and_membership(self, session_client, workspace, create_user):
        member = create_workspace_user(workspace, "product-member@example.com", 15)
        guest = create_workspace_user(workspace, "product-reader@example.com", 5)
        Product.objects.create(name="Public Product", workspace=workspace, owner=create_user)
        secret = Product.objects.create(name="Secret Product", workspace=workspace, owner=create_user, network=0)
        ProductMember.objects.create(product=secret, member=guest)

        session_client.force_authenticate(user=member)
        member_response = session_client.get(product_url(workspace.slug))
        assert member_response.status_code == status.HTTP_200_OK
        assert {row["name"] for row in member_response.data} == {"Public Product"}

        session_client.force_authenticate(user=guest)
        guest_response = session_client.get(product_url(workspace.slug))
        assert guest_response.status_code == status.HTTP_200_OK
        assert {row["name"] for row in guest_response.data} == {"Secret Product"}

    def test_creator_can_update_and_unrelated_member_cannot(self, session_client, workspace, create_user):
        product = Product.objects.create(
            name="Owned Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        unrelated = create_workspace_user(workspace, "unrelated-product@example.com", 15)

        session_client.force_authenticate(user=unrelated)
        denied = session_client.patch(
            product_url(workspace.slug, product.id),
            {"name": "Denied Rename"},
            format="json",
        )
        assert denied.status_code == status.HTTP_403_FORBIDDEN

        session_client.force_authenticate(user=create_user)
        updated = session_client.patch(
            product_url(workspace.slug, product.id),
            {"name": "Renamed Product", "owner": None},
            format="json",
        )
        assert updated.status_code == status.HTTP_200_OK
        product.refresh_from_db()
        assert product.name == "Renamed Product"
        assert product.owner_id is None

    def test_delete_soft_deletes_product_assets(self, session_client, workspace, create_user):
        product = Product.objects.create(
            name="Disposable Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        asset = FileAsset.objects.create(
            workspace=workspace,
            product=product,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
            attributes={"name": "delete.png", "type": "image/png", "size": 1},
            size=1,
            is_uploaded=True,
        )

        with patch("plane.db.mixins.soft_delete_related_objects.delay"):
            response = session_client.delete(product_url(workspace.slug, product.id))

        assert response.status_code == status.HTTP_204_NO_CONTENT
        assert not Product.objects.filter(id=product.id).exists()
        assert FileAsset.all_objects.get(id=asset.id).is_deleted is True
        assert FileAsset.all_objects.get(id=asset.id).deleted_at is not None

    def test_product_members_protect_requirement_participants_and_private_transition(
        self, session_client, workspace, create_user
    ):
        product = Product.objects.create(
            name="Member Product",
            workspace=workspace,
            owner=create_user,
            created_by=create_user,
        )
        reviewer = create_workspace_user(workspace, "product-reviewer@example.com", 15)
        assignee = create_workspace_user(workspace, "product-assignee@example.com", 15)

        added = session_client.post(
            product_member_url(workspace.slug, product.id),
            {"member": str(reviewer.id)},
            format="json",
        )
        assert added.status_code == status.HTTP_201_CREATED, added.data

        requirement = Requirement.objects.create(
            product=product,
            name="Protected requirement",
            type=Requirement.RequirementType.USER,
            assignee=assignee,
        )
        requirement.reviewers.add(reviewer)

        protected = session_client.delete(product_member_url(workspace.slug, product.id, reviewer.id))
        assert protected.status_code == status.HTTP_409_CONFLICT

        blocked_private = session_client.patch(
            product_url(workspace.slug, product.id),
            {"network": 0},
            format="json",
        )
        assert blocked_private.status_code == status.HTTP_409_CONFLICT
        assert str(assignee.id) in blocked_private.data["member_ids"]

        add_assignee = session_client.post(
            product_member_url(workspace.slug, product.id),
            {"member": str(assignee.id)},
            format="json",
        )
        assert add_assignee.status_code == status.HTTP_201_CREATED, add_assignee.data
        made_private = session_client.patch(
            product_url(workspace.slug, product.id),
            {"network": 0},
            format="json",
        )
        assert made_private.status_code == status.HTTP_200_OK, made_private.data
