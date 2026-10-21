from enum import Enum

from pydantic import BaseModel




class IssueTypeModel(BaseModel):
    display: str
    in_use: str = 'icon'
    icon: dict
    is_default: bool = False
    category: str
    # 系统标识（seed_data/issue_scheme.py），种子类型必填，自建类型为空
    system_key: str | None = None
