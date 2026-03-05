from .base import BaseSerializer
from plane.db.models import FileAsset,File


class FileAssetSerializer(BaseSerializer):
    class Meta:
        model = FileAsset
        fields = "__all__"
        read_only_fields = ["created_by", "updated_by", "created_at", "updated_at"]

class FileSerializer(BaseSerializer):
    class Meta:
        model = File
        fields = "__all__"