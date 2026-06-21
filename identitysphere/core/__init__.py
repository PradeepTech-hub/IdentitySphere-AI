"""Core pipeline modules — lazy-loaded to keep API startup light."""

__all__ = [
    "IngestionEngine",
    "IdentityResolver",
    "PrivilegeCalculator",
    "DetectionEngine",
    "BehavioralEngine",
    "ScoringEngine",
    "AttackGraph",
    "BlastRadiusEngine",
    "LLMClient",
    "SecurityCopilot",
    "DatasetExporter",
    "IdentitySpherePipeline",
]

_LAZY_IMPORTS = {
    "IngestionEngine": ("identitysphere.core.ingest", "IngestionEngine"),
    "IdentityResolver": ("identitysphere.core.resolver", "IdentityResolver"),
    "PrivilegeCalculator": ("identitysphere.core.privilege", "PrivilegeCalculator"),
    "DetectionEngine": ("identitysphere.core.detectors", "DetectionEngine"),
    "BehavioralEngine": ("identitysphere.core.behavioral", "BehavioralEngine"),
    "ScoringEngine": ("identitysphere.core.scoring", "ScoringEngine"),
    "AttackGraph": ("identitysphere.core.graph", "AttackGraph"),
    "BlastRadiusEngine": ("identitysphere.core.blast_radius", "BlastRadiusEngine"),
    "LLMClient": ("identitysphere.core.llm", "LLMClient"),
    "SecurityCopilot": ("identitysphere.core.copilot", "SecurityCopilot"),
    "DatasetExporter": ("identitysphere.core.export", "DatasetExporter"),
    "IdentitySpherePipeline": ("identitysphere.core.pipeline", "IdentitySpherePipeline"),
}


def __getattr__(name: str):
    if name not in _LAZY_IMPORTS:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    module_name, attr = _LAZY_IMPORTS[name]
    import importlib

    module = importlib.import_module(module_name)
    value = getattr(module, attr)
    globals()[name] = value
    return value
