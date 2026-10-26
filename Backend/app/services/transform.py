import copy
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union

# Sentinel for missing path lookup
MISSING = object()


class TransformError(Exception):
    """Raised when a transform step cannot be applied (e.g. invalid parent type)."""
    pass


@dataclass
class Outcome:
    """Result of rule engine processing on an event payload."""
    action: str  # "forward_original" | "filtered" | "forward_transformed" | "error"
    body_bytes: Optional[bytes] = None
    error: Optional[str] = None


# -----------------------------------------------------------------------------
# 1. Path Navigation Helpers (Dot Notation with Numeric Indexes)
# -----------------------------------------------------------------------------

def get_path(data: Any, path: str) -> Any:
    """
    Traverse nested dicts and lists using dot notation.
    Returns sentinel MISSING if the path cannot be resolved.
    Numeric segments access list indices (e.g. 'items.0.sku').
    """
    if not path or data is None or data is MISSING:
        return MISSING

    cur = data
    for seg in path.split("."):
        if isinstance(cur, dict) and seg in cur:
            cur = cur[seg]
        elif isinstance(cur, list) and seg.isdigit():
            idx = int(seg)
            if 0 <= idx < len(cur):
                cur = cur[idx]
            else:
                return MISSING
        else:
            return MISSING
    return cur


def set_path(data: dict, path: str, value: Any) -> None:
    """
    Set a value at a dot-separated path in a dictionary.
    Creates missing parent dictionaries if needed.
    Raises TransformError if a parent exists along the path but is not an object.
    """
    if not isinstance(data, dict):
        raise TransformError("Cannot set path on a non-object root")

    if not path:
        raise TransformError("Path cannot be empty")

    segs = path.split(".")
    cur = data

    for seg in segs[:-1]:
        if isinstance(cur, dict):
            if seg not in cur:
                cur[seg] = {}
                cur = cur[seg]
            else:
                cur = cur[seg]
                if not isinstance(cur, dict):
                    raise TransformError(
                        f"Parent path segment '{seg}' exists but is not an object (found {type(cur).__name__})"
                    )
        else:
            raise TransformError(
                f"Cannot navigate through non-object parent {type(cur).__name__}"
            )

    last_seg = segs[-1]
    if not isinstance(cur, dict):
        raise TransformError("Target container is not an object")

    cur[last_seg] = value


def del_path(data: dict, path: str) -> None:
    """
    Delete a key or element at a dot-separated path.
    Does nothing if any segment of the path is missing.
    """
    if not path or not isinstance(data, (dict, list)):
        return

    segs = path.split(".")
    cur = data

    for seg in segs[:-1]:
        if isinstance(cur, dict) and seg in cur:
            cur = cur[seg]
        elif isinstance(cur, list) and seg.isdigit():
            idx = int(seg)
            if 0 <= idx < len(cur):
                cur = cur[idx]
            else:
                return
        else:
            return

    last_seg = segs[-1]
    if isinstance(cur, dict) and last_seg in cur:
        del cur[last_seg]
    elif isinstance(cur, list) and last_seg.isdigit():
        idx = int(last_seg)
        if 0 <= idx < len(cur):
            cur.pop(idx)


# -----------------------------------------------------------------------------
# 2. Operators & Strict Type Checking
# -----------------------------------------------------------------------------

def _eq(a: Any, b: Any) -> bool:
    """Strict equality ensuring booleans are never considered equal to ints."""
    return a == b and isinstance(a, bool) == isinstance(b, bool)


def _num(x: Any) -> bool:
    """Check if value is a real number (int or float) and strictly not a boolean."""
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def _op_equals(actual: Any, expected: Any) -> bool:
    return _eq(actual, expected)


def _op_not_equals(actual: Any, expected: Any) -> bool:
    return not _eq(actual, expected)


def _op_in(actual: Any, expected: Any) -> bool:
    if isinstance(expected, (list, tuple)):
        return any(_eq(actual, item) for item in expected)
    if isinstance(expected, str) and isinstance(actual, str):
        return actual in expected
    return False


def _op_not_in(actual: Any, expected: Any) -> bool:
    return not _op_in(actual, expected)


def _op_contains(actual: Any, expected: Any) -> bool:
    if isinstance(actual, str) and isinstance(expected, str):
        return expected in actual
    if isinstance(actual, (list, tuple)):
        return any(_eq(item, expected) for item in actual)
    return False


def _op_starts_with(actual: Any, expected: Any) -> bool:
    if isinstance(actual, str) and isinstance(expected, str):
        return actual.startswith(expected)
    return False


def _op_exists(actual: Any, expected: Any) -> bool:
    return actual is not MISSING


def _op_gt(actual: Any, expected: Any) -> bool:
    if _num(actual) and _num(expected):
        return actual > expected
    return False


def _op_lt(actual: Any, expected: Any) -> bool:
    if _num(actual) and _num(expected):
        return actual < expected
    return False


OPERATORS = {
    "equals": _op_equals,
    "not_equals": _op_not_equals,
    "in": _op_in,
    "not_in": _op_not_in,
    "contains": _op_contains,
    "starts_with": _op_starts_with,
    "exists": _op_exists,
    "gt": _op_gt,
    "lt": _op_lt,
}


# -----------------------------------------------------------------------------
# 3. Filter Evaluation
# -----------------------------------------------------------------------------

def evaluate_filter(
    filter_config: Optional[Union[dict, Any]],
    headers: Optional[Dict[str, Any]],
    body: Any,
) -> bool:
    """
    Evaluate declarative filter conditions against headers and body.
    - No filter config returns True.
    - Missing fields make every operator return False (exists is also False when missing).
    - Combines conditions with 'all' or 'any' (default: 'all').
    """
    if not filter_config:
        return True

    if hasattr(filter_config, "model_dump"):
        cfg = filter_config.model_dump()
    elif isinstance(filter_config, dict):
        cfg = filter_config
    else:
        cfg = getattr(filter_config, "__dict__", {})

    conditions = cfg.get("conditions")
    if not conditions:
        return True

    match_mode = str(cfg.get("match", "all")).lower()

    # Normalize headers for case-insensitive lookup
    normalized_headers: Dict[str, Any] = {}
    if headers:
        for k, v in headers.items():
            normalized_headers[str(k).lower()] = v

    results: List[bool] = []

    for cond in conditions:
        if hasattr(cond, "model_dump"):
            c = cond.model_dump()
        elif isinstance(cond, dict):
            c = cond
        else:
            c = getattr(cond, "__dict__", {})

        field = str(c.get("field", "")).strip()
        op = str(c.get("op", "")).strip().lower()
        expected = c.get("value")

        # Resolve field value
        if field.startswith("header."):
            header_key = field[len("header."):].lower()
            actual = normalized_headers.get(header_key, MISSING)
        elif field.startswith("body."):
            body_path = field[len("body."):]
            if body is None or not isinstance(body, (dict, list)):
                actual = MISSING
            else:
                actual = get_path(body, body_path)
        else:
            actual = MISSING

        # Missing field rule: every operator returns False when field is missing
        if actual is MISSING:
            results.append(False)
            continue

        handler = OPERATORS.get(op)
        if not handler:
            results.append(False)
            continue

        results.append(bool(handler(actual, expected)))

    if match_mode == "any":
        return any(results)
    return all(results)


# -----------------------------------------------------------------------------
# 4. Transform Step Application
# -----------------------------------------------------------------------------

def apply_steps(body: Any, steps: Optional[List[Any]]) -> Any:
    """
    Apply sequential transform steps (project, drop, mask, set) on a deep copy of body.
    Raises TransformError if an operation is invalid (e.g. setting child on non-object).
    """
    if not steps:
        return copy.deepcopy(body)

    out = copy.deepcopy(body)

    for step in steps:
        if hasattr(step, "model_dump"):
            s = step.model_dump()
        elif isinstance(step, dict):
            s = step
        else:
            s = getattr(step, "__dict__", {})

        op = str(s.get("op", "")).strip().lower()

        if op == "project":
            mapping = s.get("map") or {}
            new_obj = {}
            for name, src_path in mapping.items():
                val = get_path(out, src_path)
                if val is not MISSING:
                    new_obj[name] = val
            out = new_obj

        elif op == "drop":
            paths = s.get("paths") or []
            if isinstance(paths, str):
                paths = [paths]
            for p in paths:
                del_path(out, p)

        elif op == "mask":
            path = s.get("path")
            if path and get_path(out, path) is not MISSING:
                set_path(out, path, "***")

        elif op == "set":
            path = s.get("path")
            value = s.get("value")
            if path:
                set_path(out, path, value)

    return out


# -----------------------------------------------------------------------------
# 5. Core Engine Entry Point
# -----------------------------------------------------------------------------

MAX_PAYLOAD_BYTES = 2 * 1024 * 1024  # 2 MB limit


def process(
    rules: Optional[Union[dict, Any]],
    headers: Optional[Dict[str, Any]],
    raw_body: Union[bytes, str, None],
) -> Outcome:
    """
    Single entry point for payload filtering and transformation.
    Returns one of four actions:
      1. 'forward_original'   - No transform configured, forward original bytes.
      2. 'filtered'           - Filter conditions did not match; drop cleanly.
      3. 'forward_transformed'- Successfully filtered and transformed.
      4. 'error'              - Transformation error (fail closed, nothing sent).
    """
    # 1. Normalize input raw_body to bytes and parse JSON
    if raw_body is None:
        raw_bytes = b""
        body_json = None
    elif isinstance(raw_body, bytes):
        raw_bytes = raw_body
        try:
            body_json = json.loads(raw_body.decode("utf-8"))
        except Exception:
            body_json = None
    elif isinstance(raw_body, str):
        raw_bytes = raw_body.encode("utf-8")
        try:
            body_json = json.loads(raw_body)
        except Exception:
            body_json = None
    else:
        raw_bytes = str(raw_body).encode("utf-8")
        body_json = None

    # 2. Extract rules dictionary
    if rules is None:
        rules_dict = {}
    elif hasattr(rules, "model_dump"):
        rules_dict = rules.model_dump()
    elif isinstance(rules, dict):
        rules_dict = rules
    else:
        rules_dict = getattr(rules, "__dict__", {})

    filter_cfg = rules_dict.get("filter")
    transform_steps = rules_dict.get("transform")

    # Fast path: No filter and no transform configured
    if not filter_cfg and not transform_steps:
        return Outcome(action="forward_original", body_bytes=raw_bytes)

    # 3. Evaluate filter
    if filter_cfg:
        try:
            matched = evaluate_filter(filter_cfg, headers or {}, body_json)
        except Exception as exc:
            return Outcome(action="error", error=f"transform_error: filter evaluation failed ({exc})")

        if not matched:
            return Outcome(action="filtered")

    # If filter matched and no transform steps exist, forward original
    if not transform_steps:
        return Outcome(action="forward_original", body_bytes=raw_bytes)

    # 4. Fail closed: transform steps exist but body is not valid JSON
    if body_json is None:
        return Outcome(
            action="error",
            error="transform_error: body is not valid JSON, cannot apply transformation steps",
        )

    # 5. Apply sequential transformation steps
    try:
        transformed = apply_steps(body_json, transform_steps)
    except TransformError as te:
        return Outcome(action="error", error=f"transform_error: {te}")
    except Exception as exc:
        return Outcome(action="error", error=f"transform_error: unexpected error ({exc})")

    # 6. Canonical JSON serialization
    try:
        out_bytes = json.dumps(
            transformed,
            separators=(",", ":"),
            ensure_ascii=False,
        ).encode("utf-8")
    except Exception as exc:
        return Outcome(action="error", error=f"transform_error: serialization failed ({exc})")

    # 7. Check 2 MB size limit
    if len(out_bytes) > MAX_PAYLOAD_BYTES:
        return Outcome(
            action="error",
            error=f"transform_error: transformed payload size ({len(out_bytes)} bytes) exceeds 2 MB limit",
        )

    return Outcome(action="forward_transformed", body_bytes=out_bytes)
