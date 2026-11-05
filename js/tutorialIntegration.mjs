import { TUTORIAL_TOURS } from './tutorialContent.mjs';
import { initRabbitTutorial } from './rabbitTutorial.mjs';

function initialize() {
  const library = document.getElementById('rabbit-tutorial-library');
  if (!library || library.dataset.ready) return;
  library.dataset.ready = 'true';
  const rabbit = initRabbitTutorial();
  for (const tour of TUTORIAL_TOURS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.rabbitTour = tour.id;
    button.className = 'rabbit-library-tour';
    const title = document.createElement('strong');
    title.textContent = tour.title;
    const description = document.createElement('span');
    description.textContent = tour.description;
    const count = document.createElement('small');
    count.textContent = `${tour.cardIds.length} cards · optional, at your pace`;
    button.append(title, description, count);
    library.append(button);
  }
  document.addEventListener('click', event => {
    const launch = event.target.closest('[data-rabbit-tour]');
    if (launch) {
      document.getElementById('about-modal-close')?.click();
      rabbit.start(launch.dataset.rabbitTour);
    }
    if (event.target.closest('[data-rabbit-reset]')) rabbit.reset();
  });
  document.getElementById('rabbit-quest-launch')?.addEventListener('click', () => {
    document.getElementById('about-modal-close')?.click();
    const toggle = document.getElementById('quest-mode-toggle');
    if (!toggle) {
      document.getElementById('rabbit-tutorial-library-status').textContent = 'Community Quest is unavailable. Reopen Settings and try again.';
      return;
    }
    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
  });
}

function afterProfileReady() {
  const ready = globalThis.__bignutenProfileReady;
  if (ready && typeof ready.then === 'function') {
    ready.then(initialize).catch(error => {
      const status = document.getElementById('rabbit-tutorial-library-status');
      if (status) status.textContent = `Tutorials could not start: ${error.message}`;
      console.error('[tutorial] Profile startup prevented tutorial initialization.', error);
    });
  } else {
    window.addEventListener('bignuten:profile-changed', afterProfileReady, { once: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', afterProfileReady, { once: true });
} else afterProfileReady();
