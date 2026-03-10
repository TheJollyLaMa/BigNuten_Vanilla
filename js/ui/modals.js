// --- Modal Show/Hide Helper Functions ---

export function showModal(id) {
  document.getElementById(id)?.classList.remove('modal-hidden');
  document.body.classList.add('modal-active');
  document.body.classList.add('hide-icons');
}

export function hideModal(id) {
  document.getElementById(id)?.classList.add('modal-hidden');
  if (!document.querySelector('.modal-overlay:not(.modal-hidden)')) {
    document.body.classList.remove('modal-active');
    document.body.classList.remove('hide-icons');
  }
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('modal-hidden'));
  document.querySelectorAll('.round-button').forEach(btn => btn.classList.remove('active'));
  document.body.classList.remove('modal-active');
  document.body.classList.remove('hide-icons');
}

export function initModalSystem() {
  // Bind all close buttons to close every open modal overlay
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  // Close a modal overlay when the backdrop itself is clicked
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeAllModals();
      }
    });
  });

  // Close all modals on Escape key
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}
