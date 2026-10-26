import copy
import json
import pytest

from app.services.transform import (
    MISSING,
    Outcome,
    TransformError,
    apply_steps,
    del_path,
    evaluate_filter,
    get_path,
    process,
    set_path,
)


# =============================================================================
# 1. Path Helper Tests
# =============================================================================

def test_get_path_nested_and_arrays():
    data = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_123",
                    "amount": 50000,
                }
            }
        },
        "items": [
            {"sku": "SKU-A", "qty": 2},
            {"sku": "SKU-B", "qty": 5},
        ],
    }

    assert get_path(data, "event") == "payment.captured"
    assert get_path(data, "payload.payment.entity.id") == "pay_123"
    assert get_path(data, "payload.payment.entity.amount") == 50000
    assert get_path(data, "items.0.sku") == "SKU-A"
    assert get_path(data, "items.1.qty") == 5
    assert get_path(data, "items.9.sku") is MISSING
    assert get_path(data, "payload.unknown.field") is MISSING
    assert get_path(data, "") is MISSING
    assert get_path(None, "event") is MISSING


def test_set_path_creates_parents_and_updates():
    obj = {}
    set_path(obj, "a.b.c", 42)
    assert obj == {"a": {"b": {"c": 42}}}

    set_path(obj, "a.b.d", "test")
    assert obj == {"a": {"b": {"c": 42, "d": "test"}}}

    # Setting on root
    set_path(obj, "top", True)
    assert obj["top"] is True


def test_set_path_fails_on_non_object_parent():
    obj = {"a": "string_not_object"}
    with pytest.raises(TransformError) as exc_info:
        set_path(obj, "a.child", 123)
    assert "not an object" in str(exc_info.value)


def test_del_path_removes_existing_and_ignores_missing():
    obj = {
        "a": {"b": {"c": 1, "d": 2}},
        "tags": ["alpha", "beta"],
    }
    del_path(obj, "a.b.c")
    assert obj == {"a": {"b": {"d": 2}}, "tags": ["alpha", "beta"]}

    # Non-existent paths do nothing
    del_path(obj, "a.b.unknown")
    del_path(obj, "completely.missing.path")
    assert obj == {"a": {"b": {"d": 2}}, "tags": ["alpha", "beta"]}

    del_path(obj, "tags.0")
    assert obj == {"a": {"b": {"d": 2}}, "tags": ["beta"]}


# =============================================================================
# 2. Strict Type Operator Tests
# =============================================================================

def test_operators_type_strictness():
    # Strict equality: 1 does not equal True or "1"
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "equals", "value": 1}]}, {}, {"val": 1}) is True
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "equals", "value": 1}]}, {}, {"val": True}) is False
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "equals", "value": 1}]}, {}, {"val": "1"}) is False
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "equals", "value": True}]}, {}, {"val": True}) is True

    # not_equals
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "not_equals", "value": 1}]}, {}, {"val": 2}) is True
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "not_equals", "value": 1}]}, {}, {"val": 1}) is False

    # in / not_in (lists)
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "in", "value": [1, 2, 3]}]}, {}, {"val": 2}) is True
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "in", "value": [1, 2, 3]}]}, {}, {"val": True}) is False
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "in", "value": [1, 2, 3]}]}, {}, {"val": 4}) is False
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "not_in", "value": [1, 2, 3]}]}, {}, {"val": 4}) is True
    assert evaluate_filter({"conditions": [{"field": "body.val", "op": "not_in", "value": [1, 2, 3]}]}, {}, {"val": 2}) is False

    # contains (string substring vs list membership)
    assert evaluate_filter({"conditions": [{"field": "body.text", "op": "contains", "value": "cat"}]}, {}, {"text": "concatenate"}) is True
    assert evaluate_filter({"conditions": [{"field": "body.text", "op": "contains", "value": "dog"}]}, {}, {"text": "concatenate"}) is False
    assert evaluate_filter({"conditions": [{"field": "body.tags", "op": "contains", "value": "admin"}]}, {}, {"tags": ["user", "admin"]}) is True
    assert evaluate_filter({"conditions": [{"field": "body.tags", "op": "contains", "value": "super"}]}, {}, {"tags": ["user", "admin"]}) is False

    # starts_with
    assert evaluate_filter({"conditions": [{"field": "body.ev", "op": "starts_with", "value": "payment."}]}, {}, {"ev": "payment.captured"}) is True
    assert evaluate_filter({"conditions": [{"field": "body.ev", "op": "starts_with", "value": "payment."}]}, {}, {"ev": "order.created"}) is False

    # gt and lt (numbers only, booleans excluded)
    assert evaluate_filter({"conditions": [{"field": "body.num", "op": "gt", "value": 10}]}, {}, {"num": 15}) is True
    assert evaluate_filter({"conditions": [{"field": "body.num", "op": "gt", "value": 10}]}, {}, {"num": 5}) is False
    assert evaluate_filter({"conditions": [{"field": "body.num", "op": "gt", "value": 0}]}, {}, {"num": True}) is False
    assert evaluate_filter({"conditions": [{"field": "body.num", "op": "gt", "value": 10}]}, {}, {"num": "15"}) is False

    assert evaluate_filter({"conditions": [{"field": "body.num", "op": "lt", "value": 10}]}, {}, {"num": 5}) is True
    assert evaluate_filter({"conditions": [{"field": "body.num", "op": "lt", "value": 10}]}, {}, {"num": 15}) is False
    assert evaluate_filter({"conditions": [{"field": "body.num", "op": "lt", "value": 2}]}, {}, {"num": True}) is False


# =============================================================================
# 3. Missing Field Rule Tests
# =============================================================================

def test_missing_fields_always_return_false():
    body = {"present_key": "exists"}

    for op in ["equals", "not_equals", "in", "not_in", "contains", "starts_with", "gt", "lt", "exists"]:
        # Missing field must return False for EVERY operator, including not_equals and not_in
        res = evaluate_filter(
            {"conditions": [{"field": "body.missing_key", "op": op, "value": "anything"}]},
            {},
            body,
        )
        assert res is False, f"Operator {op} should return False on a missing field"

    # Present field with 'exists' returns True
    assert evaluate_filter(
        {"conditions": [{"field": "body.present_key", "op": "exists"}]},
        {},
        body,
    ) is True


# =============================================================================
# 4. Header Resolution (Case-Insensitive)
# =============================================================================

def test_header_resolution_case_insensitive():
    headers = {"X-GitHub-Event": "push", "content-type": "application/json"}

    assert evaluate_filter(
        {"conditions": [{"field": "header.X-GitHub-Event", "op": "equals", "value": "push"}]},
        headers,
        {},
    ) is True

    assert evaluate_filter(
        {"conditions": [{"field": "header.x-github-event", "op": "equals", "value": "push"}]},
        headers,
        {},
    ) is True

    assert evaluate_filter(
        {"conditions": [{"field": "header.X-GITHUB-EVENT", "op": "equals", "value": "push"}]},
        headers,
        {},
    ) is True

    assert evaluate_filter(
        {"conditions": [{"field": "header.missing-header", "op": "exists"}]},
        headers,
        {},
    ) is False


# =============================================================================
# 5. Transform Steps & Specification Razorpay Example
# =============================================================================

def test_razorpay_transformation_example():
    """
    Test the canonical Razorpay example specified in the requirements.
    Input payload:
      payment.captured event with nested payload.payment.entity
    Steps:
      1. project 5 fields
      2. mask email
      3. set source to 'razorpay'
    Output:
      Exact expected dictionary
    """
    input_body = {
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_123",
                    "amount": 50000,
                    "status": "captured",
                    "email": "customer@example.com",
                }
            }
        },
    }

    steps = [
        {
            "op": "project",
            "map": {
                "event": "event",
                "payment_id": "payload.payment.entity.id",
                "amount": "payload.payment.entity.amount",
                "status": "payload.payment.entity.status",
                "email": "payload.payment.entity.email",
            },
        },
        {"op": "mask", "path": "email"},
        {"op": "set", "path": "source", "value": "razorpay"},
    ]

    original_copy = copy.deepcopy(input_body)
    output = apply_steps(input_body, steps)

    assert output == {
        "event": "payment.captured",
        "payment_id": "pay_123",
        "amount": 50000,
        "status": "captured",
        "email": "***",
        "source": "razorpay",
    }

    # Original body must be 100% untouched
    assert input_body == original_copy


def test_steps_skip_missing_paths():
    input_body = {"name": "Alice"}
    steps = [
        {"op": "project", "map": {"name": "name", "missing": "missing_src"}},
        {"op": "mask", "path": "non_existent_path"},
        {"op": "drop", "paths": ["another_missing"]},
    ]

    output = apply_steps(input_body, steps)
    assert output == {"name": "Alice"}


# =============================================================================
# 6. Full Process Entry Point Tests (Outcomes)
# =============================================================================

def test_process_no_rules_returns_forward_original():
    raw_payload = b'{"msg":"hello world"}'
    outcome = process(None, {}, raw_payload)
    assert outcome.action == "forward_original"
    assert outcome.body_bytes == raw_payload


def test_process_filtered_outcome():
    rules = {
        "filter": {
            "match": "all",
            "conditions": [
                {"field": "body.event", "op": "equals", "value": "order.completed"}
            ],
        }
    }
    raw_payload = b'{"event":"order.cancelled"}'
    outcome = process(rules, {}, raw_payload)
    assert outcome.action == "filtered"
    assert outcome.body_bytes is None


def test_process_forward_transformed_outcome():
    rules = {
        "filter": {
            "match": "all",
            "conditions": [
                {"field": "body.event", "op": "in", "value": ["payment.captured", "payment.failed"]}
            ],
        },
        "transform": [
            {
                "op": "project",
                "map": {
                    "event": "event",
                    "payment_id": "payload.payment.entity.id",
                    "amount": "payload.payment.entity.amount",
                    "status": "payload.payment.entity.status",
                    "email": "payload.payment.entity.email",
                },
            },
            {"op": "mask", "path": "email"},
            {"op": "set", "path": "source", "value": "razorpay"},
        ],
    }

    raw_payload = json.dumps({
        "event": "payment.captured",
        "payload": {
            "payment": {
                "entity": {
                    "id": "pay_123",
                    "amount": 50000,
                    "status": "captured",
                    "email": "customer@example.com",
                }
            }
        },
    }).encode("utf-8")

    outcome = process(rules, {}, raw_payload)
    assert outcome.action == "forward_transformed"
    assert outcome.error is None

    expected_dict = {
        "event": "payment.captured",
        "payment_id": "pay_123",
        "amount": 50000,
        "status": "captured",
        "email": "***",
        "source": "razorpay",
    }
    # Check parsed content and canonical serialization without unnecessary whitespace
    assert json.loads(outcome.body_bytes.decode("utf-8")) == expected_dict
    assert outcome.body_bytes == json.dumps(expected_dict, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def test_process_fail_closed_on_non_json_body_with_transform():
    rules = {
        "transform": [{"op": "mask", "path": "token"}]
    }
    raw_payload = b"this is not json, it is plain text"
    outcome = process(rules, {}, raw_payload)
    assert outcome.action == "error"
    assert "transform_error" in outcome.error
    assert outcome.body_bytes is None


def test_process_fail_closed_on_invalid_set_traversal():
    rules = {
        "transform": [{"op": "set", "path": "data.child.prop", "value": 123}]
    }
    raw_payload = b'{"data": "a string primitive"}'
    outcome = process(rules, {}, raw_payload)
    assert outcome.action == "error"
    assert "transform_error" in outcome.error


def test_process_fail_closed_on_size_limit():
    # Construct a large transformed output exceeding 2 MB
    rules = {
        "transform": [
            {"op": "set", "path": "huge_string", "value": "x" * (2 * 1024 * 1024 + 10)}
        ]
    }
    raw_payload = b'{"initial": 1}'
    outcome = process(rules, {}, raw_payload)
    assert outcome.action == "error"
    assert "exceeds 2 MB limit" in outcome.error
