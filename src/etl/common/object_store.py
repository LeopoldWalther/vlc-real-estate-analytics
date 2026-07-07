"""
Object storage edge interface + adapters for the ETL pipeline.

Defines the :class:`ObjectStore` Protocol (Abstraction / Dependency
Inversion), the boto3-backed :class:`S3ObjectStore` production adapter
(Adapter pattern) and the :class:`InMemoryObjectStore` test fake
(Polymorphism — both satisfy the same Protocol and are interchangeable).
"""

from __future__ import annotations

import logging
from typing import Dict, List, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@runtime_checkable
class ObjectStore(Protocol):
    """
    Narrow object-storage interface consumed by the pipeline core.

    Interface Segregation (review M3): exactly the four operations the
    three Lambdas need — read, write, prefix listing and an existence
    check for the silver incremental guard. No delete, no multipart, no
    presigning: consumers must not depend on operations they never use.
    """

    def get_bytes(self, key: str) -> bytes:
        """Return the raw bytes stored under *key*."""
        ...

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        """Store *data* under *key* with the given MIME *content_type*."""
        ...

    def list_keys(self, prefix: str) -> List[str]:
        """Return all keys starting with *prefix*, sorted ascending."""
        ...

    def exists(self, key: str) -> bool:
        """Return ``True`` when *key* is present in the store."""
        ...


class S3ObjectStore:
    """
    boto3-backed :class:`ObjectStore` adapter for a single S3 bucket.

    Adapter pattern: wraps the vendor SDK behind the project-owned
    Protocol so core logic never speaks the boto3 dialect. Encapsulation:
    the client and bucket are private; callers interact only through the
    Protocol methods.
    """

    def __init__(self, bucket: str, s3_client: object | None = None) -> None:
        """
        Args:
            bucket: Name of the S3 bucket all keys are relative to.
            s3_client: Optional pre-built boto3 S3 client (injected in
                tests via moto). Created lazily from boto3 when omitted.
        """
        # boto3 is imported here — inside the adapter — so that core
        # pipeline modules never import the vendor SDK (Dependency
        # Inversion at the composition edge).
        import boto3

        self._bucket = bucket
        self._client = s3_client if s3_client is not None else boto3.client("s3")

    def get_bytes(self, key: str) -> bytes:
        """Download and return the object body stored under *key*."""
        response = self._client.get_object(Bucket=self._bucket, Key=key)  # type: ignore[attr-defined]
        return response["Body"].read()  # type: ignore[no-any-return]

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        """Upload *data* under *key* with the given *content_type*."""
        self._client.put_object(  # type: ignore[attr-defined]
            Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
        )
        logger.info("Wrote %d bytes to s3://%s/%s", len(data), self._bucket, key)

    def list_keys(self, prefix: str) -> List[str]:
        """
        List all keys under *prefix* (paginated, sorted).

        Uses the ``list_objects_v2`` paginator so histories larger than
        1 000 objects are handled correctly.
        """
        paginator = self._client.get_paginator("list_objects_v2")  # type: ignore[attr-defined]
        keys: List[str] = []
        for page in paginator.paginate(Bucket=self._bucket, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.append(obj["Key"])
        return sorted(keys)

    def exists(self, key: str) -> bool:
        """
        Return ``True`` when *key* exists (HeadObject — no body download).

        A 404/NoSuchKey ClientError maps to ``False``; any other error is
        re-raised so real failures stay visible.
        """
        import botocore.exceptions

        try:
            self._client.head_object(Bucket=self._bucket, Key=key)  # type: ignore[attr-defined]
            return True
        except botocore.exceptions.ClientError as exc:
            if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
                return False
            raise


class InMemoryObjectStore:
    """
    Dict-backed :class:`ObjectStore` fake for unit tests.

    Polymorphism: satisfies the same Protocol as :class:`S3ObjectStore`,
    so pipeline objects run unchanged against it (no AWS, no network).
    Encapsulation: the backing dict is private; tests observe state only
    through the Protocol methods.
    """

    def __init__(self) -> None:
        self._objects: Dict[str, bytes] = {}
        self._content_types: Dict[str, str] = {}

    def get_bytes(self, key: str) -> bytes:
        """Return the stored bytes; KeyError when absent (mirrors a 404)."""
        return self._objects[key]

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        """Store *data* and remember its *content_type* for assertions."""
        self._objects[key] = data
        self._content_types[key] = content_type

    def list_keys(self, prefix: str) -> List[str]:
        """Return all stored keys starting with *prefix*, sorted."""
        return sorted(k for k in self._objects if k.startswith(prefix))

    def exists(self, key: str) -> bool:
        """Return ``True`` when *key* was previously written."""
        return key in self._objects

    def content_type_of(self, key: str) -> str:
        """Test helper: the content type recorded for *key*."""
        return self._content_types[key]
