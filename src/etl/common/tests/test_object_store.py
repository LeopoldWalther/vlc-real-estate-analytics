"""
Contract tests for the ObjectStore Protocol and its two implementations.

The same behavioural contract is asserted against the in-memory fake and
the moto-backed S3 adapter (Liskov Substitution: any ObjectStore must be
usable wherever the Protocol is expected).
"""

from __future__ import annotations

import os
import sys
from typing import Generator

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from common.object_store import (  # noqa: E402
    InMemoryObjectStore,
    ObjectStore,
    S3ObjectStore,
)

BUCKET = "test-bucket"


@pytest.fixture()
def s3_store() -> Generator[S3ObjectStore, None, None]:
    """Yield an S3ObjectStore backed by a moto-mocked bucket."""
    with mock_aws():
        client = boto3.client("s3", region_name="eu-central-1")
        client.create_bucket(
            Bucket=BUCKET,
            CreateBucketConfiguration={"LocationConstraint": "eu-central-1"},
        )
        yield S3ObjectStore(bucket=BUCKET, s3_client=client)


@pytest.fixture()
def memory_store() -> InMemoryObjectStore:
    """Yield a fresh in-memory fake."""
    return InMemoryObjectStore()


class TestProtocolConformance:
    """Both implementations must satisfy the runtime-checkable Protocol."""

    def test_in_memory_store_satisfies_protocol(
        self, memory_store: InMemoryObjectStore
    ) -> None:
        assert isinstance(memory_store, ObjectStore)

    def test_s3_store_satisfies_protocol(self, s3_store: S3ObjectStore) -> None:
        assert isinstance(s3_store, ObjectStore)


class TestInMemoryObjectStore:
    """Behavioural contract of the dict-backed fake."""

    def test_put_then_get_round_trips_identically(
        self, memory_store: InMemoryObjectStore
    ) -> None:
        payload = b'{"hello": "world"}'

        memory_store.put_bytes("a/b.json", payload, "application/json")

        assert memory_store.get_bytes("a/b.json") == payload
        assert memory_store.content_type_of("a/b.json") == "application/json"

    def test_get_missing_key_raises_key_error(
        self, memory_store: InMemoryObjectStore
    ) -> None:
        with pytest.raises(KeyError):
            memory_store.get_bytes("absent")

    def test_list_keys_filters_by_prefix_and_sorts(
        self, memory_store: InMemoryObjectStore
    ) -> None:
        memory_store.put_bytes("bronze/z.json", b"z", "application/json")
        memory_store.put_bytes("bronze/a.json", b"a", "application/json")
        memory_store.put_bytes("silver/a.parquet", b"s", "application/octet-stream")

        assert memory_store.list_keys("bronze/") == [
            "bronze/a.json",
            "bronze/z.json",
        ]

    def test_exists_reflects_written_state(
        self, memory_store: InMemoryObjectStore
    ) -> None:
        assert not memory_store.exists("k")
        memory_store.put_bytes("k", b"v", "text/plain")
        assert memory_store.exists("k")


class TestS3ObjectStore:
    """Behavioural contract of the boto3 adapter under moto."""

    def test_put_then_get_round_trips_identically(
        self, s3_store: S3ObjectStore
    ) -> None:
        payload = b"\x00binary\xff"

        s3_store.put_bytes("bronze/x.bin", payload, "application/octet-stream")

        assert s3_store.get_bytes("bronze/x.bin") == payload

    def test_list_keys_returns_only_matching_prefix(
        self, s3_store: S3ObjectStore
    ) -> None:
        s3_store.put_bytes("bronze/one.json", b"1", "application/json")
        s3_store.put_bytes("bronze/two.json", b"2", "application/json")
        s3_store.put_bytes("gold/latest.json", b"g", "application/json")

        assert s3_store.list_keys("bronze/") == [
            "bronze/one.json",
            "bronze/two.json",
        ]

    def test_exists_true_for_written_false_for_absent(
        self, s3_store: S3ObjectStore
    ) -> None:
        s3_store.put_bytes("present", b"x", "text/plain")

        assert s3_store.exists("present")
        assert not s3_store.exists("absent")

    def test_content_type_is_persisted(self, s3_store: S3ObjectStore) -> None:
        s3_store.put_bytes("doc.json", b"{}", "application/json")

        client = boto3.client("s3", region_name="eu-central-1")
        head = client.head_object(Bucket=BUCKET, Key="doc.json")
        assert head["ContentType"] == "application/json"
