# ML Methodology — IdentitySphere AI

## Overview

IdentitySphere AI uses a hybrid detection approach combining **rule-based detectors** with **unsupervised machine learning** (Isolation Forest) to identify anomalous identity behavior across hybrid enterprise platforms.

## Behavioral Anomaly Detection (Isolation Forest)

### Algorithm

We use scikit-learn's `IsolationForest` — an unsupervised anomaly detection algorithm that isolates anomalies by randomly partitioning the feature space with decision trees. Anomalies require fewer partitions to isolate, producing lower anomaly scores.

**Implementation:** `identitysphere/core/behavioral.py` — `BehavioralEngine` class

### Features (5 dimensions)

| Feature | Calculation | Range | What it captures |
|---------|-------------|-------|------------------|
| `login_frequency` | Login events per day over 30-day window | 0.0–∞ | Activity level — low frequency may indicate dormant/compromised account |
| `platform_spread` | Active platforms / total platforms | 0.0–1.0 | Cross-platform exposure — higher spread = larger attack surface |
| `privilege_to_usage` | Privilege score / activity level | 0.0–∞ | Over-provisioning — high privilege with low usage indicates risk |
| `dormancy` | Days since last login, normalized to 0–100 (capped at 365 days) | 0–100 | Staleness — dormant accounts are credential theft targets |
| `hour_entropy` | Shannon entropy of login hour distribution, normalized by log2(24) | 0.0–1.0 | Behavioral regularity — low entropy = predictable pattern; high entropy = anomalous timing |

### Training and Scoring

1. **Feature extraction** (`_extract_features`): For each identity, compute the 5 features from audit events within a configurable window (default: 30 days).

2. **Model training** (`_score_anomalies`): Fit `IsolationForest` on the full identity population:
   - `n_estimators`: 200 (configurable)
   - `contamination`: 0.10 (expected 10% anomaly rate)
   - `random_state`: 42 (reproducibility)

3. **Score normalization**: Raw `decision_function` scores are min-max normalized to [0, 100] where higher = more anomalous.

4. **Threshold**: Identities with normalized score ≥ 65.0 are flagged as anomalous (configurable via `anomaly_threshold`).

5. **Feature contributions** (`_compute_feature_contributions`): Leave-one-out perturbation — replace each feature with the population median, re-score, and measure the delta. Contributions are normalized to percentages summing to 100%.

### Integration with Rule-Based Detectors

**Implementation:** `identitysphere/core/detectors.py` — `DetectionEngine` class

The hybrid scoring formula merges rule-based and ML scores:

```
final_score = (rule_score × 0.6) + (ml_anomaly_score × 0.4)
```

**Rule-based detectors (8 types):**

| Detector | What it finds |
|----------|---------------|
| `_detect_orphaned` | HR-terminated with active platform accounts |
| `_detect_stale` | Admin accounts inactive > 90 days |
| `_detect_mfa_gap` | Active accounts without MFA |
| `_detect_over_privileged` | Admin on 2+ platforms or normalized score > 70 |
| `_detect_sod_violations` | Toxic role combinations (e.g., CRM Admin + Domain Admin) |
| `_detect_privilege_escalation` | Unapproved role/group changes |
| `_detect_token_abuse` | Tokens > 180 days old with anomalous usage |
| `_detect_offboarding_gap` | Terminated but accounts not disabled on all platforms |

**ML-only anomalies:** If the Isolation Forest flags an identity with ml_score > 75 but no rule-based findings, it's reported as a behavioral anomaly.

**Context adjustments:** Scores are reduced for legitimate high-privilege users:
- On-call personnel: 0.60× multiplier
- Recent role changes (< 14 days): 0.70× multiplier

### Composite Risk Scoring

**Implementation:** `identitysphere/core/scoring.py` — `ScoringEngine` class

Five weighted factors produce the final composite score:

| Factor | Weight | Source |
|--------|--------|--------|
| Privilege breadth | 0.25 | PrivilegeCalculator normalized score |
| Cross-platform exposure | 0.20 | Admin platforms / total platforms |
| Dormancy | 0.15 | Max dormancy days normalized |
| Detector severity | 0.25 | Highest severity from rule findings |
| Behavioral anomaly | 0.15 | Isolation Forest anomaly score |

**False-positive suppression rules (4):**
- `active_admin`: Admin logged in within 7 days → 0.85× score
- `mfa_all_platforms`: MFA on all active accounts → 0.80× score
- `on_call`: Tagged as on-call → 0.60× score
- `recent_role_change`: Role changed within 14 days → 0.70× score

## Detection Accuracy

Evaluated against ground truth labels (`ground_truth.csv`):

| Metric | Value |
|--------|-------|
| Precision | 0.686 |
| Recall | 0.779 |
| F1 Score | 0.730 |
| True Positives | 81 |
| False Negatives | 23 |

**Note:** 51 false-positive trap identities (legitimate high-privilege users with on-call context) are deliberately included in the dataset. These inflate false positives intentionally to test suppression effectiveness.

## Alert Consolidation

Raw risk events are clustered by identity into consolidated incidents:
- **Raw signals:** 604
- **Consolidated incidents:** 60
- **Reduction:** 90.1%

This exceeds the problem statement target of ≥ 40% reduction.

## Limitations and Assumptions

1. **Unsupervised training:** The Isolation Forest trains on the full population without labeled training data. It assumes ~10% contamination rate, which may not hold for all enterprise environments.

2. **Feature window:** The 30-day audit window may miss long-term behavioral patterns. Shorter windows increase sensitivity to recent changes but miss gradual drift.

3. **Static thresholds:** The anomaly threshold (65.0) and contamination rate (0.10) are configurable but not auto-tuned. Production deployments should calibrate these against labeled incident data.

4. **Single model:** One Isolation Forest is trained across all identity types (human, service, external). Service accounts and external identities have fundamentally different behavioral patterns; per-type models could improve accuracy.

5. **Offline LLM:** The AI Copilot defaults to offline template responses. With an OpenAI API key configured (`copilot.mode: "online"` in `settings.yaml`), it generates richer natural-language narratives.

## Future Improvements

- **Per-type models:** Separate Isolation Forest models for human, service, and external identities.
- **Temporal features:** Rolling averages and trend detection over 90-day windows.
- **Graph-based anomaly detection:** Leverage the NetworkX identity graph for community detection and outlier identification.
- **Online learning:** Incremental model updates as new audit events arrive.
- **Auto-threshold tuning:** Use precision-recall curves on labeled data to optimize the anomaly threshold.
- **LLM integration:** Default to online mode with Anthropic/OpenAI APIs for richer risk narratives and remediation plans.
