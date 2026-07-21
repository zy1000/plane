from unittest.mock import patch
from uuid import uuid4

import pytest
from rest_framework import status

from plane.db.models import FileAsset, Product, WorkspaceMember
from plane.tests.factories import UserFactory, WorkspaceFactory


@pytest.mark.contract
@pytest.mark.django_db
class TestProductAssets:
    def setup_method(self):
        self.owner = UserFactory()
        self.workspace = WorkspaceFactory(owner=self.owner)
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=self.owner,
            role=20,
        )
        self.product = Product.objects.create(
            name="Launchpad",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )

    def authenticate(self, api_client, user):
        api_client.force_authenticate(user=user)

    def upload(self, api_client, entity_identifier):
        with patch(
            "plane.app.views.asset.v2.presigned_post_for_asset",
            return_value={"url": "https://storage.example/upload", "fields": {}},
        ):
            return api_client.post(
                f"/api/assets/v2/workspaces/{self.workspace.slug}/",
                {
                    "name": "diagram.png",
                    "type": "image/png",
                    "size": 1024,
                    "entity_type": FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
                    "entity_identifier": str(entity_identifier),
                },
                format="json",
            )

    def test_temp_upload_binds_to_created_product_and_rebinds_path(self, api_client):
        self.authenticate(api_client, self.owner)
        response = self.upload(api_client, uuid4())
        assert response.status_code == status.HTTP_200_OK

        asset = FileAsset.objects.get(id=response.data["asset_id"])
        assert asset.product_id is None
        assert asset.path.entity_type == "TEMP"

        with patch(
            "plane.app.views.asset.v2._rebind_assets_to_final_path", return_value=[]
        ) as rebind:
            bulk_response = api_client.post(
                f"/api/assets/v2/workspaces/{self.workspace.slug}/{self.product.id}/bulk/",
                {"asset_ids": [str(asset.id)]},
                format="json",
            )

        assert bulk_response.status_code == status.HTTP_204_NO_CONTENT
        asset.refresh_from_db()
        assert asset.product_id == self.product.id
        rebind.assert_called_once()

    def test_existing_product_upload_is_bound_directly(self, api_client):
        self.authenticate(api_client, self.owner)
        response = self.upload(api_client, self.product.id)

        assert response.status_code == status.HTTP_200_OK
        asset = FileAsset.objects.get(id=response.data["asset_id"])
        assert asset.product_id == self.product.id
        assert asset.path.entity_type == "PRODUCT"
        assert asset.path.parent.entity_id == str(self.workspace.id)

    def test_bind_failure_keeps_product_and_allows_retry(self, api_client):
        self.authenticate(api_client, self.owner)
        response = self.upload(api_client, uuid4())
        asset = FileAsset.objects.get(id=response.data["asset_id"])

        with patch(
            "plane.app.views.asset.v2._rebind_assets_to_final_path",
            return_value=[str(asset.id)],
        ):
            bulk_response = api_client.post(
                f"/api/assets/v2/workspaces/{self.workspace.slug}/{self.product.id}/bulk/",
                {"asset_ids": [str(asset.id)]},
                format="json",
            )

        assert bulk_response.status_code == status.HTTP_409_CONFLICT
        asset.refresh_from_db()
        assert asset.product_id == self.product.id

        with patch(
            "plane.app.views.asset.v2._rebind_assets_to_final_path", return_value=[]
        ):
            retry_response = api_client.post(
                f"/api/assets/v2/workspaces/{self.workspace.slug}/{self.product.id}/bulk/",
                {"asset_ids": [str(asset.id)]},
                format="json",
            )
        assert retry_response.status_code == status.HTTP_204_NO_CONTENT

    def test_creator_can_bind_temp_assets_after_assigning_private_product(self, api_client):
        creator = UserFactory()
        product_owner = UserFactory()
        for user in (creator, product_owner):
            WorkspaceMember.objects.create(
                workspace=self.workspace,
                member=user,
                role=15,
            )
        self.authenticate(api_client, creator)
        response = self.upload(api_client, uuid4())
        asset = FileAsset.objects.get(id=response.data["asset_id"])
        product = Product.objects.create(
            name="Delegated private product",
            workspace=self.workspace,
            owner=product_owner,
            network=0,
            created_by=creator,
        )

        with patch(
            "plane.app.views.asset.v2._rebind_assets_to_final_path", return_value=[]
        ):
            bulk_response = api_client.post(
                f"/api/assets/v2/workspaces/{self.workspace.slug}/{product.id}/bulk/",
                {"asset_ids": [str(asset.id)]},
                format="json",
            )

        assert bulk_response.status_code == status.HTTP_204_NO_CONTENT
        asset.refresh_from_db()
        assert asset.product_id == product.id

    def test_duplicate_keeps_product_scope_and_rejects_cross_workspace_source(
        self, api_client
    ):
        self.authenticate(api_client, self.owner)
        source = FileAsset.objects.create(
            attributes={"name": "diagram.png", "type": "image/png", "size": 1024},
            size=1024,
            workspace=self.workspace,
            product=self.product,
            created_by=self.owner,
            entity_type=FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
            is_uploaded=True,
        )

        with patch("plane.app.views.asset.v2.S3Storage.copy_object") as copy_object:
            response = api_client.post(
                f"/api/assets/v2/workspaces/{self.workspace.slug}/duplicate-assets/{source.id}/",
                {
                    "entity_id": str(self.product.id),
                    "entity_type": FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
                },
                format="json",
            )

        assert response.status_code == status.HTTP_200_OK
        duplicated = FileAsset.objects.get(id=response.data["asset_id"])
        assert duplicated.product_id == self.product.id
        assert duplicated.workspace_id == self.workspace.id
        copy_object.assert_called_once()

        other_owner = UserFactory()
        other_workspace = WorkspaceFactory(owner=other_owner)
        WorkspaceMember.objects.create(
            workspace=other_workspace,
            member=other_owner,
            role=20,
        )
        other_product = Product.objects.create(
            name="Other product",
            workspace=other_workspace,
            owner=other_owner,
            network=2,
        )
        foreign_target_response = self.upload(api_client, other_product.id)
        assert foreign_target_response.status_code == status.HTTP_404_NOT_FOUND

        self.authenticate(api_client, other_owner)
        cross_workspace_response = api_client.post(
            f"/api/assets/v2/workspaces/{other_workspace.slug}/duplicate-assets/{source.id}/",
            {
                "entity_id": str(uuid4()),
                "entity_type": FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
            },
            format="json",
        )
        assert cross_workspace_response.status_code == status.HTTP_404_NOT_FOUND

    def test_guest_cannot_mutate_product_assets(self, api_client):
        guest = UserFactory()
        WorkspaceMember.objects.create(
            workspace=self.workspace,
            member=guest,
            role=5,
        )
        self.authenticate(api_client, guest)

        upload_response = self.upload(api_client, self.product.id)
        assert upload_response.status_code == status.HTTP_403_FORBIDDEN

        asset = FileAsset.objects.create(
            attributes={"name": "diagram.png", "type": "image/png", "size": 1024},
            size=1024,
            workspace=self.workspace,
            product=self.product,
            created_by=self.owner,
            entity_type=FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
            is_uploaded=True,
        )
        delete_response = api_client.delete(
            f"/api/assets/v2/workspaces/{self.workspace.slug}/{asset.id}/"
        )
        assert delete_response.status_code == status.HTTP_403_FORBIDDEN
        asset.refresh_from_db()
        assert asset.deleted_at is None

    def test_bulk_bind_cannot_move_another_products_asset(self, api_client):
        self.authenticate(api_client, self.owner)
        other_product = Product.objects.create(
            name="Other product",
            workspace=self.workspace,
            owner=self.owner,
            network=2,
        )
        asset = FileAsset.objects.create(
            attributes={"name": "diagram.png", "type": "image/png", "size": 1024},
            size=1024,
            workspace=self.workspace,
            product=other_product,
            created_by=self.owner,
            entity_type=FileAsset.EntityTypeContext.PRODUCT_DESCRIPTION,
            is_uploaded=True,
        )

        response = api_client.post(
            f"/api/assets/v2/workspaces/{self.workspace.slug}/{self.product.id}/bulk/",
            {"asset_ids": [str(asset.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        asset.refresh_from_db()
        assert asset.product_id == other_product.id
