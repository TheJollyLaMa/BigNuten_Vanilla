'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('public community data preview never includes private gut-health records', async () => {
  const { buildDataPreview } = await import('../js/communityDashboard.js');
  const data = {
    gutHealth: {
      sessions: [{ id: 'synthetic-private', challenge: 'Synthetic gut data marker', readings: [{ hydrogen: { value: 99, scale: 'ppm' } }] }],
      symptoms: [{ id: 'synthetic-symptom', type: 'Bloating', intensity: 10 }],
    },
    foods: [{ name: 'Synthetic logged food' }],
    exercises: { entries: [{ type: 'Synthetic exercise', reps: 2 }] },
  };
  const preview = buildDataPreview(data, { exercise: false, nutrition: false, weight: false, supplements: false });
  assert.deepEqual(preview, {});
  const selected = buildDataPreview(data, { exercise: false, nutrition: true, weight: false, supplements: false });
  assert.deepEqual(selected, { nutrition: { totalFoodLogs: 1, totalSuppLogs: 0, uniqueFoods: 1 } });
  assert.doesNotMatch(JSON.stringify(selected), /Synthetic gut data marker|Synthetic symptom|hydrogen|Bloating/);
});
