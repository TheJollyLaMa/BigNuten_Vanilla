import { getFitnessData, saveFitnessData } from './fitnessData.js';
import { METRIC_REGISTRY } from './metrics.js';
import { genieClient } from './genieService.mjs';
import { getTodayInUserTz } from './timezone.js';
import { compareExperiment, createResearchEntry, RESEARCH_CATEGORIES, youtubeVideoId } from './researchExperiments.mjs';

const metricOptions = METRIC_REGISTRY.filter(metric => !metric.components && !metric.fields);
const today = () => getTodayInUserTz();
const makeId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const categories = new Map(RESEARCH_CATEGORIES.map(value => [value, value[0].toUpperCase() + value.slice(1)]));
const el = (tag, props = {}, text = '') => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  if (text) node.textContent = text;
  return node;
};
const button = (label, action, attrs = {}) => el('button', { type: 'button', dataset: { action }, ...attrs }, label);
const localData = async () => {
  const data = await getFitnessData();
  data.latestResearch ||= [];
  data.researchProtocols ||= [];
  data.researchExperiments ||= [];
  return data;
};

export function initResearchExperiments() {
  const dialog = document.getElementById('research-experiments-dialog');
  if (!dialog || dialog.dataset.initialized) return;
  dialog.dataset.initialized = 'true';
  const openButton = document.getElementById('research-open');
  const closeButton = dialog.querySelector('.research-close');
  const status = document.getElementById('research-status');
  const draft = document.getElementById('research-draft-protocol');
  const draftForm = document.getElementById('research-draft-form');
  let draftResearchId = '';
  let returnFocus = null;

  function announce(message, error = false) {
    status.textContent = message;
    status.dataset.error = error ? 'true' : 'false';
  }
  function open() {
    returnFocus = document.activeElement;
    dialog.hidden = false;
    document.body.classList.add('research-dialog-open');
    closeButton.focus();
    render().catch(error => announce(error.message, true));
  }
  function close() {
    dialog.hidden = true;
    document.body.classList.remove('research-dialog-open');
    returnFocus?.focus?.();
  }
  openButton?.addEventListener('click', open);
  closeButton?.addEventListener('click', close);
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  document.addEventListener('keydown', event => { if (!dialog.hidden && event.key === 'Escape') close(); });

  async function render() {
    const data = await localData();
    renderLibrary(data);
    renderProtocols(data);
    renderExperiments(data);
  }

  function renderLibrary(data) {
    const list = document.getElementById('research-library');
    list.replaceChildren();
    const query = document.getElementById('research-search').value.trim().toLowerCase();
    const category = document.getElementById('research-filter').value;
    const entries = data.latestResearch.filter(entry => {
      const searchable = [entry.title, entry.transcript, entry.summary, ...(entry.tags || [])].join(' ').toLowerCase();
      return (category === 'all' || entry.category === category) && (!query || searchable.includes(query));
    }).sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')));
    if (!entries.length) {
      list.append(el('p', { className: 'research-empty' }, data.latestResearch.length
        ? 'No saved videos match this search or category.' : 'Your private research library is empty. Add a YouTube video and paste a transcript to begin.'));
      return;
    }
    for (const entry of entries) {
      const card = el('article', { className: 'research-card', dataset: { researchId: entry.id } });
      const head = el('div', { className: 'research-card-head' });
      const image = el('img', { src: `https://i.ytimg.com/vi/${encodeURIComponent(entry.youtubeId || '')}/hqdefault.jpg`, alt: '', loading: 'lazy' });
      image.addEventListener('error', () => image.remove(), { once: true });
      const details = el('div');
      details.append(el('h4', {}, entry.title || 'Untitled video'));
      const added = String(entry.addedAt || '').slice(0, 10);
      details.append(el('p', { className: 'research-card-meta' }, `${categories.get(entry.category) || 'General'} · ${added || 'Date unknown'} · ${String(entry.transcript || '').length.toLocaleString()} transcript characters`));
      const video = el('a', { href: `https://www.youtube.com/watch?v=${encodeURIComponent(entry.youtubeId || '')}`, target: '_blank', rel: 'noopener noreferrer' }, 'Open video');
      details.append(video);
      if (entry.summary) details.append(el('p', { className: 'research-card-meta' }, entry.summary));
      if (entry.tags?.length) details.append(el('p', { className: 'research-card-meta' }, `Tags: ${entry.tags.join(', ')}`));
      head.append(image, details); card.append(head);
      const contextLabel = el('label', { className: 'research-check' });
      const context = el('input', { type: 'checkbox', checked: Boolean(entry.includeInGenie), dataset: { action: 'include-research' } });
      contextLabel.append(context, document.createTextNode('Include this saved research in Genie chat context'));
      card.append(contextLabel);
      const actions = el('div', { className: 'research-card-actions' });
      if (!entry.transcript) actions.append(button('Try YouTube captions', 'fetch-captions'));
      if (entry.transcript) actions.append(button('Turn into a protocol', 'draft-protocol'));
      actions.append(button('Delete', 'delete-research', { 'aria-label': `Delete ${entry.title || 'research entry'}` }));
      card.append(actions);
      const transcriptDetails = el('details');
      transcriptDetails.append(el('summary', {}, entry.transcript ? 'View / edit private transcript' : 'Paste a transcript later'));
      if (entry.transcript) transcriptDetails.append(el('pre', {}, entry.transcript));
      const transcriptEditor = el('textarea', { className: 'research-inline-transcript', rows: 5, maxlength: 100000, placeholder: 'Paste the transcript here. Saving is local and does not call Genie.' });
      transcriptEditor.value = entry.transcript || '';
      const saveTranscript = button('Save transcript locally', 'save-transcript');
      transcriptDetails.append(transcriptEditor, saveTranscript);
      card.append(transcriptDetails);
      list.append(card);
    }
  }

  function metricCheckboxes(targets = []) {
    const box = document.getElementById('research-target-metrics');
    box.replaceChildren();
    for (const metric of metricOptions) {
      const target = targets.find(item => item.metricId === metric.id);
      const label = el('label', { className: 'research-metric-option' });
      const input = el('input', { type: 'checkbox', value: metric.id, checked: Boolean(target), dataset: { metricId: metric.id } });
      const direction = el('select', { dataset: { direction: metric.id }, disabled: !target, 'aria-label': `${metric.label} expected direction` });
      for (const [value, name] of [['observe', 'Observe'], ['increase', 'Increase'], ['decrease', 'Decrease'], ['maintain', 'Maintain']]) {
        direction.append(el('option', { value, selected: target?.direction === value }, name));
      }
      input.addEventListener('change', () => { direction.disabled = !input.checked; });
      label.append(input, document.createTextNode(metric.label), direction);
      box.append(label);
    }
  }

  function fillDraft(protocol, researchId) {
    draftResearchId = researchId;
    draft.hidden = false;
    document.getElementById('protocol-title').value = protocol.title || '';
    document.getElementById('protocol-summary').value = protocol.summary || '';
    document.getElementById('protocol-rationale').value = protocol.rationale || '';
    document.getElementById('protocol-duration').value = protocol.durationDays || 14;
    document.getElementById('protocol-baseline').value = protocol.baselineDays || 7;
    document.getElementById('protocol-actions').value = (protocol.actions || []).map(action => [action.action, action.dose, action.timing].join(' | ')).join('\n');
    document.getElementById('protocol-clinician-review').checked = Boolean(protocol.clinicianReviewRequired);
    document.getElementById('protocol-clinician-reason').value = protocol.clinicianReviewReason || '';
    metricCheckboxes(protocol.targetMetrics || []);
    draft.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderProtocols(data) {
    const list = document.getElementById('research-protocols');
    list.replaceChildren();
    if (!data.researchProtocols.length) {
      list.append(el('p', { className: 'research-empty' }, 'No saved protocols yet. Draft one from a transcript, review and edit it, then save it here.'));
      return;
    }
    for (const protocol of data.researchProtocols) {
      const card = el('article', { className: 'research-protocol-card', dataset: { protocolId: protocol.id } });
      card.append(el('h4', {}, protocol.title));
      card.append(el('p', { className: 'research-small-note' }, `${protocol.durationDays} planned days · ${protocol.baselineDays} baseline days · ${protocol.actions?.length || 0} action(s)`));
      if (protocol.rationale) card.append(el('p', { className: 'research-small-note' }, protocol.rationale));
      if (protocol.targetMetrics?.length) card.append(el('p', { className: 'research-small-note' }, `Target metrics: ${protocol.targetMetrics.map(metric => `${metric.metricLabel} — ${metric.direction}`).join(', ')}`));
      if (protocol.clinicianReviewRequired) card.append(el('p', { className: 'research-small-note' }, `Clinician review: ${protocol.clinicianReviewReason || 'recommended'}`));
      const actionList = el('ul');
      for (const action of protocol.actions || []) actionList.append(el('li', {}, `${action.action}${action.dose ? ` · ${action.dose}` : ''}${action.timing ? ` · ${action.timing}` : ''}`));
      card.append(actionList);
      const startForm = el('form', { className: 'research-experiment-form', dataset: { action: 'start-experiment', protocolId: protocol.id } });
      const dateLabel = el('label', {}, 'Start date');
      dateLabel.append(el('input', { type: 'date', name: 'startDate', value: today(), required: true }));
      const durationLabel = el('label', {}, 'Duration (days)');
      durationLabel.append(el('input', { type: 'number', name: 'durationDays', value: protocol.durationDays, min: 1, max: 180, required: true }));
      const baselineLabel = el('label', {}, 'Baseline window (days)');
      baselineLabel.append(el('input', { type: 'number', name: 'baselineDays', value: protocol.baselineDays, min: 1, max: 90, required: true }));
      startForm.append(dateLabel, durationLabel, baselineLabel, el('button', { type: 'submit', className: 'research-primary' }, 'Start experiment'));
      card.append(startForm); list.append(card);
    }
  }

  function renderExperiments(data) {
    const list = document.getElementById('research-experiments');
    list.replaceChildren();
    if (!data.researchExperiments.length) {
      list.append(el('p', { className: 'research-empty' }, 'No experiments yet. Save a protocol, then start a dated experiment.'));
      return;
    }
    for (const experiment of [...data.researchExperiments].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))) {
      const protocol = data.researchProtocols.find(item => item.id === experiment.protocolId);
      if (!protocol) continue;
      const card = el('article', { className: 'research-experiment-card', dataset: { experimentId: experiment.id } });
      card.append(el('h4', {}, experiment.title || protocol.title));
      const endDate = new Date(`${experiment.startDate}T00:00:00Z`);
      endDate.setUTCDate(endDate.getUTCDate() + Number(experiment.durationDays) - 1);
      const comparison = compareExperiment({ experiment, protocol, metricLogs: data.metricLogs || [], today: today() });
      card.append(el('p', { className: 'research-small-note' }, `Start ${experiment.startDate} · ${experiment.durationDays} days · baseline ${experiment.baselineDays} days (${comparison.baselineStart}–${comparison.baselineEnd})`));
      const checkIn = el('form', { className: 'research-checkin-form', dataset: { action: 'check-in', experimentId: experiment.id } });
      checkIn.append(el('label', {}, 'Daily check-in date'));
      checkIn.append(el('input', { type: 'date', name: 'date', min: experiment.startDate, max: today(), value: today(), required: true }));
      const statusSelect = el('select', { name: 'status', 'aria-label': 'Daily check-in' });
      statusSelect.append(el('option', { value: 'done' }, 'Done'), el('option', { value: 'skip' }, 'Skip'));
      checkIn.append(statusSelect, el('button', { type: 'submit' }, 'Save check-in'));
      card.append(checkIn);
      const marks = Object.entries(experiment.checkIns || {}).sort(([a], [b]) => b.localeCompare(a));
      card.append(el('p', { className: 'research-small-note' }, marks.length ? `Check-ins: ${marks.map(([date, value]) => `${date} ${value}`).join(' · ')}` : 'No daily check-ins recorded yet.'));
      const result = el('div', { className: 'research-experiment-result' });
      result.append(el('p', {}, `Adherence: ${comparison.adherence === null ? 'not started' : `${comparison.adherence}%`} (${comparison.doneDays} done, ${comparison.skipDays} skipped, ${comparison.missingDays} not logged of ${comparison.elapsedDays} elapsed day(s)).`));
      result.append(el('p', {}, `Personal observation only — baseline ${comparison.baselineStart}–${comparison.baselineEnd} vs. during ${comparison.duringStart}–${comparison.duringEnd}. This is not proof; confounders, short windows, and missing measurements may affect the comparison.`));
      for (const metric of comparison.metrics) {
        const format = value => value === null ? 'not enough data' : Number(value.toFixed(2)).toString();
        const unit = metricOptions.find(option => option.id === metric.metricId)?.canonicalUnit || '';
        const delta = metric.change === null ? '' : ` · change ${metric.change > 0 ? '+' : ''}${Number(metric.change.toFixed(2))}`;
        result.append(el('p', {}, `${metric.metricLabel} (target: ${metric.direction}): baseline ${format(metric.baseline)} ${unit} (${metric.baselineCount} log(s)); during ${format(metric.during)} ${unit} (${metric.duringCount} log(s))${delta}.`));
      }
      card.append(result); list.append(card);
    }
  }

  document.getElementById('research-search').addEventListener('input', () => render().catch(error => announce(error.message, true)));
  document.getElementById('research-filter').addEventListener('change', () => render().catch(error => announce(error.message, true)));

  async function loadMetadata() {
    const input = document.getElementById('research-url');
    const videoId = youtubeVideoId(input.value.trim());
    const title = document.getElementById('research-new-title');
    announce('Requesting public YouTube oEmbed details. Only the video ID is sent; no AI model is called…');
    try {
      const data = await genieClient.request('/research/oembed', { videoId, consent: true });
      if (typeof data.title === 'string') title.value = data.title.slice(0, 300);
      announce('Video details loaded. Transcript can be pasted or fetched separately.');
    } catch (error) {
      announce(`${error.message || 'Video details unavailable.'} You can still enter a title, save the URL, and paste a transcript.`, true);
    }
    return videoId;
  }
  document.getElementById('research-add-form').addEventListener('submit', async event => {
    event.preventDefault();
    const saveButton = event.submitter;
    if (saveButton) saveButton.disabled = true;
    try {
      const url = document.getElementById('research-url').value.trim();
      const transcript = document.getElementById('research-transcript').value;
      const videoId = youtubeVideoId(url);
      const entry = createResearchEntry({ youtubeUrl: url, title: document.getElementById('research-new-title').value,
        category: document.getElementById('research-category').value, transcript, id: makeId('research') });
      entry.youtubeId = videoId;
      entry.youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      entry.summary = document.getElementById('research-summary').value.trim().slice(0, 1200);
      entry.tags = document.getElementById('research-tags').value.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 20);
      const data = await localData();
      data.latestResearch.unshift(entry);
      saveFitnessData(data);
      event.target.reset();
      document.getElementById('research-category').value = 'general';
      announce('Saved privately on this device. No AI call was made.');
      await render();
    } catch (error) { announce(error.message || 'Research could not be saved.', true); }
    finally { if (saveButton) saveButton.disabled = false; }
  });

  dialog.addEventListener('change', async event => {
    if (!event.target.matches('[data-action="include-research"]')) return;
    const card = event.target.closest('[data-research-id]');
    try {
      const data = await localData();
      const entry = data.latestResearch.find(item => item.id === card.dataset.researchId);
      if (!entry) return;
      entry.includeInGenie = event.target.checked;
      saveFitnessData(data);
      announce(event.target.checked ? 'Saved research will be included in Genie chat when you send a question.' : 'Saved research excluded from Genie chat context.');
    } catch (error) { announce(error.message, true); }
  });

  dialog.addEventListener('click', async event => {
    const control = event.target.closest('[data-action]');
    if (!control || control.type === 'submit') return;
    const action = control.dataset.action;
    const card = control.closest('[data-research-id]');
    if (action === 'delete-research') {
      const data = await localData();
      const ids = new Set(data.researchProtocols.filter(item => item.researchId === card.dataset.researchId).map(item => item.id));
      data.latestResearch = data.latestResearch.filter(item => item.id !== card.dataset.researchId);
      data.researchProtocols = data.researchProtocols.filter(item => item.researchId !== card.dataset.researchId);
      data.researchExperiments = data.researchExperiments.filter(item => !ids.has(item.protocolId));
      saveFitnessData(data);
      if (draftResearchId === card.dataset.researchId) { draft.hidden = true; draftResearchId = ''; }
      announce('Research and linked personal plans were deleted from this device.'); await render(); return;
    }
    if (action === 'save-transcript') {
      const transcript = card.querySelector('.research-inline-transcript').value.trim();
      if (transcript.length > 100000) { announce('Transcript must be 100,000 characters or fewer.', true); return; }
      const data = await localData();
      const entry = data.latestResearch.find(item => item.id === card.dataset.researchId);
      if (!entry) return;
      entry.transcript = transcript;
      entry.source = transcript ? 'pasted' : 'none';
      saveFitnessData(data); announce('Transcript saved locally. No AI call was made.'); await render(); return;
    }
    if (action === 'fetch-captions') {
      control.disabled = true;
      try {
        const data = await localData();
        const entry = data.latestResearch.find(item => item.id === card.dataset.researchId);
        if (!entry) return;
        announce('Requesting best-effort captions from the hosted Genie service…');
        const result = await genieClient.request('/research/captions', { videoId: entry.youtubeId, consent: true });
        if (typeof result.transcript !== 'string' || !result.transcript.trim()) throw new Error('No captions were returned. Paste a transcript to continue.');
        entry.transcript = result.transcript;
        entry.source = result.source || 'youtube-captions';
        saveFitnessData(data);
        announce('Captions saved locally. No AI model was called.'); await render();
      } catch (error) { announce(`${error.message || 'Caption fetch failed.'} You can paste a transcript instead.`, true); }
      finally { control.disabled = false; }
      return;
    }
    if (action === 'draft-protocol') {
      const consent = document.getElementById('research-genie-consent');
      const metricInputs = [...document.querySelectorAll('#research-target-metrics input[type="checkbox"]:checked')];
      if (!consent?.checked) { announce('Check the consent box before sending this transcript to Genie.', true); return; }
      if (!metricInputs.length) { announce('Select at least one BigNuten metric before drafting a protocol.', true); return; }
      try {
        const data = await localData();
        const entry = data.latestResearch.find(item => item.id === card.dataset.researchId);
        if (!entry?.transcript) throw new Error('Paste or fetch a transcript before asking Genie.');
        control.disabled = true;
        announce('Sending this transcript and the selected metric names to Genie for one structured draft…');
        const metrics = metricInputs.map(input => ({ id: input.dataset.metricId, label: metricOptions.find(metric => metric.id === input.dataset.metricId)?.label }));
        const result = await genieClient.request('/research/protocol', { title: entry.title, transcript: entry.transcript, metrics, consent: true });
        if (!result.protocol || typeof result.protocol !== 'object') throw new Error('Genie returned no editable protocol.');
        fillDraft(result.protocol, entry.id);
        consent.checked = false;
        announce('Draft ready to review and edit. It is not saved until you click “Save protocol”.');
      } catch (error) { announce(error.message || 'Genie could not draft a protocol.', true); }
      finally { control.disabled = false; }
    }
  });

  draftForm.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const actions = document.getElementById('protocol-actions').value.split('\n').map(line => line.split('|').map(value => value.trim()))
        .filter(parts => parts.some(Boolean)).map(([action, dose = '', timing = '']) => ({ action, dose, timing }));
      const targets = [...document.querySelectorAll('#research-target-metrics input[type="checkbox"]:checked')].map(input => ({
        metricId: input.dataset.metricId, metricLabel: metricOptions.find(metric => metric.id === input.dataset.metricId).label,
        direction: document.querySelector(`[data-direction="${input.dataset.metricId}"]`).value,
      }));
      const durationDays = Number(document.getElementById('protocol-duration').value);
      const baselineDays = Number(document.getElementById('protocol-baseline').value);
      if (!draftResearchId || !actions.length || !targets.length || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 180 || !Number.isInteger(baselineDays) || baselineDays < 1 || baselineDays > 90) {
        throw new Error('Add an action, choose a target metric, and use valid experiment/baseline days.');
      }
      const data = await localData();
      const entry = data.latestResearch.find(item => item.id === draftResearchId);
      if (!entry) throw new Error('The source research item was deleted.');
      const protocol = {
        id: makeId('protocol'), researchId: entry.id, title: document.getElementById('protocol-title').value.trim(),
        summary: document.getElementById('protocol-summary').value.trim(), rationale: document.getElementById('protocol-rationale').value.trim(),
        durationDays, baselineDays, actions, targetMetrics: targets,
        clinicianReviewRequired: document.getElementById('protocol-clinician-review').checked,
        clinicianReviewReason: document.getElementById('protocol-clinician-reason').value.trim(),
        createdAt: new Date().toISOString(),
      };
      if (!protocol.title) throw new Error('Enter a protocol title.');
      data.researchProtocols.unshift(protocol);
      if (protocol.summary) entry.summary = protocol.summary;
      saveFitnessData(data);
      draft.hidden = true; draftResearchId = '';
      announce('Protocol saved locally. Review it before starting an experiment.'); await render();
    } catch (error) { announce(error.message, true); }
  });

  dialog.addEventListener('submit', async event => {
    const form = event.target;
    if (form.matches('#research-add-form') || form.matches('#research-draft-form')) return;
    const action = form.dataset.action;
    if (action === 'start-experiment') {
      event.preventDefault();
      const data = await localData();
      const protocol = data.researchProtocols.find(item => item.id === form.dataset.protocolId);
      if (!protocol) return;
      const values = new FormData(form);
      const startDate = String(values.get('startDate'));
      const durationDays = Number(values.get('durationDays'));
      const baselineDays = Number(values.get('baselineDays'));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || durationDays < 1 || durationDays > 180 || baselineDays < 1 || baselineDays > 90) {
        announce('Choose a valid start date, duration, and baseline window.', true); return;
      }
      const experiment = { id: makeId('experiment'), protocolId: protocol.id, title: protocol.title,
        startDate, durationDays, baselineDays, checkIns: {}, createdAt: new Date().toISOString() };
      data.researchExperiments.unshift(experiment);
      saveFitnessData(data); announce('Experiment started and saved locally.'); await render(); return;
    }
    if (action === 'check-in') {
      event.preventDefault();
      const data = await localData();
      const experiment = data.researchExperiments.find(item => item.id === form.dataset.experimentId);
      if (!experiment) return;
      const values = new FormData(form), date = String(values.get('date')), state = String(values.get('status'));
      const last = new Date(`${experiment.startDate}T00:00:00Z`);
      last.setUTCDate(last.getUTCDate() + Number(experiment.durationDays) - 1);
      if (date < experiment.startDate || date > today() || date > last.toISOString().slice(0, 10) || !['done', 'skip'].includes(state)) {
        announce('Check-ins must be done or skip and within the experiment dates.', true); return;
      }
      experiment.checkIns ||= {};
      experiment.checkIns[date] = state;
      saveFitnessData(data); announce(`Saved ${state} for ${date}.`); await render();
    }
  });

  document.getElementById('research-preview').addEventListener('click', () => {
    loadMetadata().catch(error => announce(error.message, true));
  });
  metricCheckboxes();
  render().catch(error => announce(error.message, true));
}
