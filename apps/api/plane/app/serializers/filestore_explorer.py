from __future__ import annotations

from rest_framework import serializers


class FolderCreateSerializer(serializers.Serializer):
    parent_folder_id = serializers.IntegerField(required=True)
    name = serializers.CharField(required=True, max_length=255)


class FolderRenameSerializer(serializers.Serializer):
    name = serializers.CharField(required=True, max_length=255)


class FolderListQuerySerializer(serializers.Serializer):
    folder_id = serializers.IntegerField(required=False)
    page = serializers.IntegerField(required=False, min_value=1)
    page_size = serializers.IntegerField(required=False, min_value=1, max_value=200)
    name__icontains = serializers.CharField(required=False, allow_blank=False)


class FolderBreadcrumbQuerySerializer(serializers.Serializer):
    folder_id = serializers.IntegerField(required=True)


class UploadAssetSerializer(serializers.Serializer):
    parent_folder_id = serializers.IntegerField(required=True)
    name = serializers.CharField(required=True, max_length=255)
    type = serializers.CharField(
        required=False,
        allow_blank=True,
        default="application/octet-stream",
    )
    size = serializers.IntegerField(required=False, min_value=0)


class MarkUploadedSerializer(serializers.Serializer):
    attributes = serializers.DictField(required=False)


class BatchDeleteSerializer(serializers.Serializer):
    asset_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=True,
        allow_empty=False,
    )


class BatchCopySerializer(serializers.Serializer):
    asset_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=True,
        allow_empty=False,
    )
    target_folder_id = serializers.IntegerField(required=True)


class BatchMoveSerializer(BatchCopySerializer):
    on_conflict = serializers.ChoiceField(
        choices=["overwrite", "rename", "cancel"],
        required=False,
        default="rename",
    )
