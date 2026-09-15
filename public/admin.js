(() => {
  'use strict';
  let csrf = '';
  const $ = (s) => document.querySelector(s);
  const MODE_LABELS = {
    FOS_ONLY: 'FOS questionnaire only',
    TIMEBAR_AND_FOS: 'Time-Bar + FOS questionnaire'
  };

  async function init() {
    const r = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
    csrf = (await r.json()).token;
  }
  function err(msg) { $('#adminError').textContent = msg; $('#adminError').hidden = false; }
  function mode() {
    const el = /** @type {HTMLInputElement|null} */ (document.querySelector('input[name="mode"]:checked'));
    return el ? el.value : '';
  }

  // The Time-Bar matter details are only requested for the combined
  // questionnaire, and are never sent in FOS-only mode.
  function syncMode() {
    $('#timebarFields').hidden = mode() !== 'TIMEBAR_AND_FOS';
  }
  document.querySelectorAll('input[name="mode"]').forEach((el) => el.addEventListener('change', syncMode));
  syncMode();

  $('#adminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#adminError').hidden = true;
    $('#linkResult').hidden = true;
    const selectedMode = mode();
    if (!selectedMode) return err('Please choose which questionnaire is required.');

    const body = {
      mode: selectedMode,
      clientName: $('#clientName').value.trim(),
      reference: $('#reference').value.trim(),
      lender: $('#lender').value.trim(),
      product: $('#product').value
    };
    if (selectedMode === 'TIMEBAR_AND_FOS') {
      body.communicationEvent = $('#event').value.trim();
      body.communicationDate = $('#eventDate').value.trim();
    }
    if (!/^\d{9}$/.test(body.reference)) return err('Reference must be 9 digits.');

    try {
      const r = await fetch('/api/prefill-create', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': csrf, 'x-admin-key': $('#adminKey').value },
        body: JSON.stringify(body)
      });
      const j = await r.json();
      if (!r.ok) return err(j.error || 'Could not create link.');
      $('#linkMode').textContent = `Questionnaire: ${MODE_LABELS[selectedMode]}`;
      $('#linkText').textContent = j.link;
      $('#linkResult').hidden = false;
    } catch { err('Could not create link. Please try again.'); }
  });

  $('#copyBtn').addEventListener('click', async () => {
    const t = $('#linkText').textContent;
    await navigator.clipboard.writeText(t);
    $('#copyBtn').textContent = 'Copied';
    setTimeout(() => { $('#copyBtn').textContent = 'Copy link'; }, 1500);
  });

  init().catch(() => err('Secure session could not be started.'));
})();
