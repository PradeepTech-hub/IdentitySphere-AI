"""Shared fixtures for IdentitySphere AI tests."""

import pytest
import yaml

from identitysphere.generators.synthetic import SyntheticDataGenerator


@pytest.fixture(scope="session")
def config():
    with open("identitysphere/config/settings.yaml", "r") as f:
        return yaml.safe_load(f)


@pytest.fixture(scope="session")
def generated_data(config):
    gen = SyntheticDataGenerator(config)
    return gen.generate_all()


@pytest.fixture(scope="session")
def generator(config):
    gen = SyntheticDataGenerator(config)
    gen.generate_all()
    return gen
