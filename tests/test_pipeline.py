"""Tests for the end-to-end IdentitySpherePipeline."""

import os

import pytest

from identitysphere.core.pipeline import IdentitySpherePipeline


class TestPipeline:
    def test_pipeline_runs_end_to_end(self):
        pipeline = IdentitySpherePipeline()
        report = pipeline.run()
        assert report is not None
        assert "metadata" in report
        assert "detection_summary" in report
        assert "top_risky_identities" in report

    def test_pipeline_produces_report_file(self):
        pipeline = IdentitySpherePipeline()
        pipeline.run()
        report_path = os.path.join(
            pipeline.config.get("output", {}).get("data_dir", "identitysphere/data/generated"),
            "pipeline_report.json",
        )
        assert os.path.exists(report_path)

    def test_pipeline_identity_coverage(self):
        pipeline = IdentitySpherePipeline()
        report = pipeline.run()
        coverage_str = report["success_metrics"]["identity_coverage"]
        coverage = float(coverage_str.replace("%", ""))
        assert coverage >= 95.0, f"Coverage {coverage}% below 95% target"

    def test_pipeline_detects_multiple_risk_types(self):
        pipeline = IdentitySpherePipeline()
        report = pipeline.run()
        risk_types = report["detection_summary"]["risk_distribution"]
        assert len(risk_types) >= 3, f"Only {len(risk_types)} risk types detected"

    def test_pipeline_compliance_mapping_complete(self):
        pipeline = IdentitySpherePipeline()
        report = pipeline.run()
        mapping = report["compliance_mapping"]
        assert len(mapping) >= 8, f"Only {len(mapping)} compliance mappings"
        for row in mapping:
            assert "nist_800_53" in row
            assert "mitre_attack" in row
            assert "gdpr" in row
            assert "cis" in row
