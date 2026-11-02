'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const feature = import('../js/researchExperiments.mjs');

test('YouTube URLs are constrained and pasted transcripts save locally without any model dependency', async () => {
  const { youtubeVideoId, createResearchEntry } = await feature;
  assert.equal(youtubeVideoId('https://youtu.be/abcdefghijk?t=42'), 'abcdefghijk');
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.throws(() => youtubeVideoId('https://youtube.example/watch?v=abcdefghijk'), /youtube/i);
  assert.throws(() => youtubeVideoId('https://www.youtube.com.evil.example/watch?v=abcdefghijk'), /youtube/i);
  const entry = createResearchEntry({ youtubeUrl: 'https://www.youtube.com/watch?v=abcdefghijk', title: 'Synthetic video', category: 'sleep', transcript: 'Synthetic private transcript', now: '2026-10-28T12:00:00Z', id: 'research-1' });
  assert.equal(entry.source, 'pasted');
  assert.equal(entry.transcript, 'Synthetic private transcript');
  assert.equal(entry.thumbnailUrl, 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg');
  assert.equal(entry.includeInGenie, false);
});

test('baseline-versus-during comparison uses date windows, averages, and elapsed-day adherence', async () => {
  const { compareExperiment } = await feature;
  const result = compareExperiment({
    experiment: { startDate: '2026-10-04', durationDays: 7, baselineDays: 3, checkIns: {
      '2026-10-04': 'done', '2026-10-05': 'skip', '2026-10-06': 'done',
    } },
    protocol: { targetMetrics: [{ metricId: 'sleep', metricLabel: 'Sleep duration', direction: 'increase' }] },
    metricLogs: [
      { metric: 'sleep', date: '2026-10-01', value: 24000 }, { metric: 'sleep', date: '2026-10-02', value: 25200 },
      { metric: 'sleep', date: '2026-10-03', value: 27000 }, { metric: 'sleep', date: '2026-10-04', value: 28800 },
      { metric: 'sleep', date: '2026-10-05', value: 27000 }, { metric: 'sleep', date: '2026-10-06', value: 30600 },
      { metric: 'rhr', date: '2026-10-04', value: 70 }, { metric: 'sleep', date: '2026-10-08', value: 99999 },
    ],
    today: '2026-10-07',
  });
  assert.deepEqual([result.baselineStart, result.baselineEnd, result.duringEnd], ['2026-10-01', '2026-10-03', '2026-10-07']);
  assert.equal(result.metrics[0].baseline, 25400);
  assert.equal(result.metrics[0].during, 28800);
  assert.equal(result.metrics[0].change, 3400);
  assert.deepEqual([result.doneDays, result.skipDays, result.missingDays, result.elapsedDays, result.adherence], [2, 1, 1, 4, 50]);
  assert.equal(result.metrics[0].duringCount, 3);
});

test('saved research chat context is opt-in and shrinks to a summary when the transcript exceeds its token budget', async () => {
  const { researchChatContext } = await feature;
  const entries = [{ id: 'r', youtubeId: 'abcdefghijk', title: 'Synthetic recovery video', transcript: 'x'.repeat(10000), summary: 'A short saved summary.', tags: ['sleep'], includeInGenie: true }];
  const full = researchChatContext(entries, 4000);
  assert.match(full, /Untrusted transcript reference/);
  assert.match(full, /Synthetic recovery video/);
  const compact = researchChatContext(entries, 100);
  assert.match(compact, /A short saved summary/);
  assert.doesNotMatch(compact, /x{100}/);
  assert.equal(researchChatContext([{ ...entries[0], includeInGenie: false }], 4000), '');
});
