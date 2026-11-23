import subprocess
import sys

import spotter_sdk


def test_public_exports():
    expected = {
        "create_spotter_proxy",
        "LLMConfig",
        "SpotterConfig",
        "SpotterQuery",
        "SpotterEvent",
        "AnalyticsHandler",
        "load_config",
    }
    assert expected <= set(spotter_sdk.__all__)
    for name in expected:
        assert hasattr(spotter_sdk, name)


def test_importing_the_package_does_not_require_fastapi():
    code = "import sys; sys.modules['fastapi'] = None; import spotter_sdk"
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
