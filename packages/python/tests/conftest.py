import pytest

from spotter_sdk.types import SpotterConfig
from tests.helpers import read_conformance_json


@pytest.fixture
def conformance_config() -> SpotterConfig:
    return SpotterConfig.model_validate(read_conformance_json("config.json"))
