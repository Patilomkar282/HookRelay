import re
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, model_validator, field_validator


PATH_REGEX = re.compile(r"^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$")
HEADER_REGEX = re.compile(r"^[A-Za-z0-9_-]+$")

FilterOperator = Literal[
    "equals",
    "not_equals",
    "in",
    "not_in",
    "contains",
    "starts_with",
    "exists",
    "gt",
    "lt",
]

StepOp = Literal["project", "drop", "mask", "set"]


def validate_path(v: str, field_label: str = "Path") -> str:
    """Validate path format ^[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*$ and depth <= 10."""
    if not isinstance(v, str) or not v.strip():
        raise ValueError(f"{field_label} cannot be empty")
    clean = v.strip()
    if not PATH_REGEX.match(clean):
        raise ValueError(
            f"{field_label} '{clean}' is invalid. Must match ^[A-Za-z0-9_-]+(\\.[A-Za-z0-9_-]+)*$"
        )
    segments = clean.split(".")
    if len(segments) > 10:
        raise ValueError(f"{field_label} '{clean}' exceeds maximum allowed depth of 10")
    return clean


def validate_condition_field(v: str) -> str:
    """Validate condition field supporting header.<name>, body.<path>, or <path>."""
    if not isinstance(v, str) or not v.strip():
        raise ValueError("Condition field cannot be empty")
    clean = v.strip()
    if clean.startswith("header."):
        header_name = clean[len("header."):]
        if not header_name or not HEADER_REGEX.match(header_name):
            raise ValueError(f"Invalid header name in condition field '{clean}'")
        return clean
    elif clean.startswith("body."):
        body_path = clean[len("body."):]
        validate_path(body_path, "Body path")
        return clean
    else:
        validate_path(clean, "Field path")
        return clean


class ConditionSchema(BaseModel):
    field: str
    op: FilterOperator
    value: Optional[Any] = None

    @field_validator("field")
    @classmethod
    def check_field(cls, v: str) -> str:
        return validate_condition_field(v)

    @model_validator(mode="after")
    def validate_operator_value_pairing(self) -> "ConditionSchema":
        op = self.op
        val = self.value

        # exists operator takes no value
        if op == "exists":
            # Value is ignored or None
            return self

        # gt and lt need a number (int or float, strictly not bool, not string)
        if op in ("gt", "lt"):
            if isinstance(val, bool) or not isinstance(val, (int, float)):
                raise ValueError(f"Operator '{op}' requires a numeric value (int or float), got {type(val).__name__}")
            return self

        # in and not_in need a list
        if op in ("in", "not_in"):
            if not isinstance(val, list):
                raise ValueError(f"Operator '{op}' requires a list value, got {type(val).__name__}")
            if len(val) > 50:
                raise ValueError(f"Operator '{op}' list exceeds maximum 50 items")
            for item in val:
                if isinstance(item, str) and len(item) > 1000:
                    raise ValueError("List item string length cannot exceed 1,000 characters")
                elif not isinstance(item, (str, int, float, bool)):
                    raise ValueError(f"List item must be a primitive string, number, or boolean, got {type(item).__name__}")
            return self

        # String length limit for string values
        if isinstance(val, str) and len(val) > 1000:
            raise ValueError(f"Value string length exceeds maximum of 1,000 characters")

        # contains and starts_with need string values
        if op in ("contains", "starts_with"):
            if not isinstance(val, str):
                raise ValueError(f"Operator '{op}' requires a string value")

        return self


class FilterRuleSchema(BaseModel):
    match: Literal["all", "any"] = "all"
    conditions: List[ConditionSchema] = Field(default_factory=list, max_length=20)


class StepSchema(BaseModel):
    op: StepOp
    # For project: mapping of output key -> source path
    map: Optional[Dict[str, str]] = None
    # For drop: single path or list of paths
    paths: Optional[Union[List[str], str]] = None
    # For mask & set: target path
    path: Optional[str] = None
    # For set: assigned value
    value: Optional[Any] = None

    @model_validator(mode="after")
    def validate_step(self) -> "StepSchema":
        op = self.op

        if op == "project":
            if not self.map or not isinstance(self.map, dict):
                raise ValueError("Step 'project' requires a non-empty 'map' dictionary")
            if len(self.map) > 50:
                raise ValueError("Step 'project' exceeds maximum 50 mapped fields")
            for out_key, src_path in self.map.items():
                validate_path(out_key, "Project destination key")
                validate_path(src_path, "Project source path")

        elif op == "drop":
            target_paths = self.paths
            if target_paths is None and self.path is not None:
                target_paths = [self.path]
            elif isinstance(target_paths, str):
                target_paths = [target_paths]

            if not target_paths or not isinstance(target_paths, list):
                raise ValueError("Step 'drop' requires 'paths' or 'path'")
            for p in target_paths:
                validate_path(p, "Drop path")

        elif op == "mask":
            if not self.path:
                raise ValueError("Step 'mask' requires 'path'")
            validate_path(self.path, "Mask path")

        elif op == "set":
            if not self.path:
                raise ValueError("Step 'set' requires 'path'")
            validate_path(self.path, "Set path")
            if self.value is None:
                raise ValueError("Step 'set' requires a 'value'")
            if isinstance(self.value, str) and len(self.value) > 1000:
                raise ValueError("Step 'set' string value exceeds 1,000 characters")

        return self


class EndpointRulesUpdate(BaseModel):
    filter: Optional[FilterRuleSchema] = None
    transform: Optional[List[StepSchema]] = Field(default=None, max_length=20)
    steps: Optional[List[StepSchema]] = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def sync_transform_and_steps(self) -> "EndpointRulesUpdate":
        # Support both 'transform' and 'steps' seamlessly
        if self.transform is None and self.steps is not None:
            self.transform = self.steps
        elif self.steps is None and self.transform is not None:
            self.steps = self.transform
        return self


class EndpointRulesOut(BaseModel):
    filter: Optional[Dict[str, Any]] = None
    transform: Optional[List[Dict[str, Any]]] = None
    steps: Optional[List[Dict[str, Any]]] = None
    rules_version: int = 0


class RulesPreviewRequest(BaseModel):
    event_id: Optional[str] = None
    sample_json: Optional[Union[Dict[str, Any], List[Any], str]] = None
    sample_headers: Optional[Dict[str, Any]] = None
    rules: Optional[EndpointRulesUpdate] = None


class RulesPreviewOut(BaseModel):
    matches: bool
    action: str
    output: Optional[Any] = None
    error: Optional[str] = None
