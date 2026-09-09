#!/usr/bin/env python3
"""Fail if derived renderer inputs drift from canonical Engram metrics."""
import json
from pathlib import Path
import pandas as pd
root=Path(__file__).resolve().parents[1]; out=root/'evidence/canonical/analysis/latest'; canonical=json.loads((root/'evidence/canonical/longitudinal/latest/summary.json').read_text()); arm=pd.read_csv(out/'arm-metrics.csv'); dashboard=pd.read_csv(out/'dashboard-import.csv'); vega=json.loads((out/'utility-by-arm.vega-lite.json').read_text()); html=(out/'engram-analysis.html').read_text()
expected=canonical['summary']; lookup=arm.set_index('arm')['mean_utility'].to_dict()
assert len(canonical['observations']) == len(dashboard) == 240
assert lookup['A0_NO_MEMORY'] == -1.0
assert lookup['A1_RAW_HISTORY'] == 0.85
assert lookup['A2_INITIAL_ENGRAM_MEMORY'] == 0.9
assert lookup['A3_IRRELEVANT_MEMORY'] == 0.95
assert lookup['A4_STALE_OR_CONTRADICTORY'] == 0.0
assert lookup['A5_EVALUATED_UPDATED_MEMORY'] == 0.92
assert round(lookup['A2_INITIAL_ENGRAM_MEMORY'] - lookup['A0_NO_MEMORY'], 2) == round(expected['deltaUA2A0'], 2)
assert round(lookup['A5_EVALUATED_UPDATED_MEMORY'] - lookup['A2_INITIAL_ENGRAM_MEMORY'], 2) == round(expected['deltaUA5A2'], 2)
assert int(dashboard['unauthorizedEscapes'].sum()) == 0
vega_values={row['arm']:row['mean_utility'] for row in vega['data']['values']}
assert vega_values == lookup
for arm_name in ['A0_NO_MEMORY','A1_RAW_HISTORY','A2_INITIAL_ENGRAM_MEMORY','A3_IRRELEVANT_MEMORY','A4_STALE_OR_CONTRADICTORY','A5_EVALUATED_UPDATED_MEMORY']:
    assert arm_name in html
print(json.dumps({'status':'PASS','observations':len(dashboard),'deltaUA2A0':expected['deltaUA2A0'],'deltaUA5A2':expected['deltaUA5A2'],'unauthorizedEscapes':0}))
