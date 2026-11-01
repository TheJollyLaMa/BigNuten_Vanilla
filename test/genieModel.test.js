const { test } = require('node:test');
const assert = require('node:assert/strict');
const payload = { assistant: 'health', consent: true,
  messages: [{ role: 'system', content: 'Synthetic wellness logs' }, { role: 'user', content: 'What do these observations mean?' }] };
test('private Genie sends server-held credentials, untrusted context, separate scope and store:false without search', async () => {
  const { chatWithPrivateGenie } = await import('../services/genieModel.mjs');
  const calls = [];
  const result = await chatWithPrivateGenie({ apiKey: 'synthetic-server-key', model: 'synthetic', input: payload,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ status: 'completed', usage: { input_tokens: 2, output_tokens: 3 },
        output: [{ type: 'message', content: [{ type: 'output_text', text: 'Synthetic non-diagnostic answer' }] }] }) };
    } });
  assert.equal(result.answer, 'Synthetic non-diagnostic answer');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].body.store, false);
  assert.equal(calls[0].body.tools, undefined);
  assert.match(calls[0].body.input[0].content, /untrusted data/);
  assert.match(calls[0].body.instructions, /correlation is not a diagnosis/);
  assert.match(calls[0].body.instructions, /Current assistant: health/);
  assert.doesNotMatch(JSON.stringify(calls[0].body), /synthetic-server-key/);
});
test('private Genie rejects wrong scopes, extra fields, invalid history and exact context limits', async () => {
  const { validateGenieInput } = await import('../services/genieModel.mjs');
  for (const bad of [{ ...payload, assistant: 'nutrition' }, { ...payload, consent: false },
    { ...payload, apiKey: 'unexpected' }, { ...payload, messages: [{ role: 'assistant', content: 'No question' }] },
    { ...payload, messages: [{ role: 'user', content: 'a'.repeat(60001) }] }]) assert.throws(() => validateGenieInput(bad));
  assert.equal(validateGenieInput({ ...payload, messages: [{ role: 'user', content: 'a'.repeat(60000) }] }).messages[0].content.length, 60000);
});
test('provider errors, incomplete output and empty/non-text answers never become successful replies', async () => {
  const { chatWithPrivateGenie } = await import('../services/genieModel.mjs');
  for (const data of [{ status: 'incomplete', output: [] }, { status: 'completed', output: [] },
    { status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 42 }] }] }]) {
    await assert.rejects(chatWithPrivateGenie({ apiKey: 'synthetic', model: 'synthetic', input: payload,
      fetchImpl: async () => ({ ok: true, json: async () => data }) }), /incomplete|invalid/);
  }
  await assert.rejects(chatWithPrivateGenie({ apiKey: 'synthetic', model: 'synthetic', input: payload,
    fetchImpl: async () => ({ ok: false, status: 401 }) }), /HTTP 401/);
});
