"""
Contract tests for the SecretsProvider Protocol and its implementations.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Generator

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
from common.secrets_provider import (  # noqa: E402
    InMemorySecretsProvider,
    SecretError,
    SecretsManagerProvider,
    SecretsProvider,
)

SECRET_NAME = "dev/idealista/lvw"
SECRET_PAYLOAD = {"api_key": "key-123", "api_secret": "secret-456"}


@pytest.fixture()
def sm_provider() -> Generator[SecretsManagerProvider, None, None]:
    """Yield a SecretsManagerProvider backed by a moto-mocked secret."""
    with mock_aws():
        client = boto3.client("secretsmanager", region_name="eu-central-1")
        client.create_secret(Name=SECRET_NAME, SecretString=json.dumps(SECRET_PAYLOAD))
        yield SecretsManagerProvider(secrets_client=client)


class TestProtocolConformance:
    """Both implementations must satisfy the runtime-checkable Protocol."""

    def test_in_memory_provider_satisfies_protocol(self) -> None:
        assert isinstance(InMemorySecretsProvider(), SecretsProvider)

    def test_secrets_manager_provider_satisfies_protocol(
        self, sm_provider: SecretsManagerProvider
    ) -> None:
        assert isinstance(sm_provider, SecretsProvider)


class TestInMemorySecretsProvider:
    """Behavioural contract of the dict-backed fake."""

    def test_returns_registered_payload(self) -> None:
        provider = InMemorySecretsProvider({SECRET_NAME: SECRET_PAYLOAD})

        assert provider.get_secret(SECRET_NAME) == SECRET_PAYLOAD

    def test_missing_secret_raises_secret_error(self) -> None:
        provider = InMemorySecretsProvider()

        with pytest.raises(SecretError, match="Failed to retrieve credentials"):
            provider.get_secret("unknown")


class TestSecretsManagerProvider:
    """Behavioural contract of the boto3 adapter under moto."""

    def test_returns_decoded_payload(self, sm_provider: SecretsManagerProvider) -> None:
        assert sm_provider.get_secret(SECRET_NAME) == SECRET_PAYLOAD

    def test_missing_secret_raises_secret_error(
        self, sm_provider: SecretsManagerProvider
    ) -> None:
        with pytest.raises(SecretError, match="Failed to retrieve credentials"):
            sm_provider.get_secret("does/not/exist")

    def test_malformed_json_raises_secret_error(self) -> None:
        with mock_aws():
            client = boto3.client("secretsmanager", region_name="eu-central-1")
            client.create_secret(Name="broken", SecretString="not-json")
            provider = SecretsManagerProvider(secrets_client=client)

            with pytest.raises(SecretError, match="Malformed secret payload"):
                provider.get_secret("broken")
