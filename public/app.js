(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const form = $('#questionnaire');
  const gate = $('#referenceGate');
  const globalError = $('#globalError');
  const state = { mode: '', steps: [], index: 0, csrf: '', prefillToken: '', prefill: null, startedAt: Date.now() };

  // The questionnaire mode decides which steps exist. It always comes from the
  // staff-issued link, never from anything the client can change.
  const SEQUENCES = {
    FOS_ONLY: ['details', 'fos1', 'fos2', 'fos3', 'review'],
    TIMEBAR_AND_FOS: ['details', 'tb1', 'tb2', 'tb3', 'fos1', 'fos2', 'fos3', 'review']
  };
  const STEP_TITLES = {
    details: 'Your details',
    tb1: 'Your first awareness',
    tb2: 'The lender communication',
    tb3: 'Circumstances',
    fos1: 'Your circumstances',
    fos2: 'The lending',
    fos3: 'Your finances',
    review: 'Review'
  };
  const INTRO = {
    FOS_ONLY: {
      title: 'Questions about your complaint',
      lead: 'These questions help us put your complaint forward. Please answer based on your own recollection.'
    },
    TIMEBAR_AND_FOS: {
      title: 'Questions about the time limit raised in the lender’s final response, and about your complaint',
      lead: 'The lender has applied a time limit to some or all of your complaint. These questions help us understand what you genuinely knew and understood at the relevant time, and help us put your complaint forward.'
    }
  };

  const MONEY_FIELDS = [
    'fosLendingAmount',
    'fosIncomeEmployment', 'fosIncomeBenefits', 'fosIncomeMaintenance', 'fosIncomePension',
    'fosOutHousing', 'fosOutUtilities', 'fosOutFood', 'fosOutTransport'
  ];
  const INCOME_ROWS = [
    ['Employment', 'fosIncomeEmployment'], ['Benefits', 'fosIncomeBenefits'],
    ['Maintenance', 'fosIncomeMaintenance'], ['Pension', 'fosIncomePension']
  ];
  const OUTGOING_ROWS = [
    ['Housing costs (like mortgage, rent or council housing payment)', 'fosOutHousing'],
    ['Utilities (like gas, electric, phone, council tax, water)', 'fosOutUtilities'],
    ['Food or grocery costs', 'fosOutFood'],
    ['Fuel or transport costs', 'fosOutTransport']
  ];
  const VULNERABILITY_NONE = 'None of these apply';
  const UNKNOWN_DATE_LABEL = "I don't know the exact date";
  const MONEY_MESSAGE = 'Please enter an amount in pounds, for example 250 or 1250.50';

  function showError(message) {
    globalError.textContent = message;
    globalError.hidden = false;
    globalError.focus();
  }
  function clearError() { globalError.hidden = true; globalError.textContent = ''; }

  async function getCsrf() {
    const r = await fetch('/api/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error('csrf');
    state.csrf = (await r.json()).token;
  }
  function tokenFromHash() {
    const m = /^#t=([A-Za-z0-9_-]+)$/.exec(location.hash);
    if (m) { state.prefillToken = m[1]; history.replaceState(null, '', location.pathname); }
  }

  function currentStep() { return state.steps[state.index]; }
  function showStep(i) {
    state.index = Math.max(0, Math.min(state.steps.length - 1, i));
    const active = currentStep();
    $$('.step').forEach((el) => { el.hidden = el.dataset.step !== active; });
    $('#progressLabel').textContent = `Step ${state.index + 1} of ${state.steps.length}`;
    $('#progressTitle').textContent = STEP_TITLES[active] || '';
    $('#progressBar').style.width = `${Math.round(((state.index + 1) / state.steps.length) * 100)}%`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selected(name) { return form.querySelector(`input[name="${name}"]:checked`)?.value || ''; }
  function checkedValues(name) { return $$(`input[name="${name}"]:checked`).map((el) => el.value); }
  function value(id) { return $(id)?.value?.trim() || ''; }

  function fieldError(name, msg) {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return;
    const p = el.closest('.money-row') || el.closest('.form-row') || el.closest('fieldset');
    if (!p) return;
    p.querySelector('.error-text')?.remove();
    const d = document.createElement('div'); d.className = 'error-text'; d.textContent = msg; p.appendChild(d);
  }
  function clearFieldErrors() { $$('.error-text').forEach((e) => e.remove()); }

  // Which step owns a field, so a server-side rejection can send the client
  // back to the answer that needs changing instead of to a dead end.
  const FIELD_STEP = {
    clientName: 'details', lender: 'details', product: 'details', reference: 'details',
    communicationEvent: 'details', communicationDate: 'details',
    q1ThoughtBefore: 'tb1', q1YesMonthYear: 'tb1', q1YesWhy: 'tb1', q1AwarenessSource: 'tb1', q1NoMonthYear: 'tb1', q1NoExplain: 'tb1',
    q2Remember: 'tb2', q2RememberWhat: 'tb2', q2MadeThink: 'tb2', q2Explain: 'tb2', q2OtherMemory: 'tb2',
    q3Circumstances: 'tb3', q3Dates: 'tb3', q3Explain: 'tb3',
    fosVulnerabilities: 'fos1', fosVulnerabilityDetail: 'fos1',
    fosCourtAction: 'fos2', fosLendingStart: 'fos2', fosLendingStartUnknown: 'fos2',
    fosLendingAmount: 'fos2', fosBalancesPaid: 'fos2',
    fosIncomeEmployment: 'fos3', fosIncomeBenefits: 'fos3', fosIncomeMaintenance: 'fos3', fosIncomePension: 'fos3',
    fosSavings: 'fos3', fosOutHousing: 'fos3', fosOutUtilities: 'fos3', fosOutFood: 'fos3', fosOutTransport: 'fos3',
    fosOtherExpenses: 'fos3', fosDependants: 'fos3', fosFurtherLending: 'fos3',
    confirmation: 'review'
  };
  const FRIENDLY = {
    'Too long': 'This answer is too long. Please shorten it.',
    'Required': 'Please answer this question.',
    'Invalid choice': 'Please select one of the options.',
    'Please select an answer': 'Please select an answer.',
    'Please answer this question': 'Please answer this question.',
    'Confirmation is required': 'Please tick the confirmation box.'
  };

  function updateConditionals() {
    const q1 = selected('q1ThoughtBefore');
    if ($('#q1Yes')) { $('#q1Yes').hidden = q1 !== 'Yes'; $('#q1No').hidden = !(q1 === 'No' || q1 === 'Not sure'); }
    const q2 = selected('q2Remember');
    if ($('#q2Yes')) { $('#q2Yes').hidden = q2 !== 'Yes'; $('#q2No').hidden = !(q2 === 'No' || q2 === 'Not sure'); }
    if ($('#q3Yes')) $('#q3Yes').hidden = selected('q3Circumstances') !== 'Yes';
  }

  // "None of these apply" is mutually exclusive with every other option, in
  // both directions. Enforced again on the server.
  function enforceVulnerabilityExclusivity(changed) {
    const boxes = $$('input[name="fosVulnerabilities"]');
    if (!changed || !changed.checked) return;
    if (changed.value === VULNERABILITY_NONE) {
      boxes.forEach((b) => { if (b.value !== VULNERABILITY_NONE) b.checked = false; });
    } else {
      boxes.forEach((b) => { if (b.value === VULNERABILITY_NONE) b.checked = false; });
    }
  }

  // The exact date and "I don't know the exact date" are mutually exclusive, in
  // both directions. Enforced again on the server.
  function enforceLendingDateExclusivity(changed) {
    const unknown = $('#fosLendingStartUnknown');
    const date = $('#fosLendingStart');
    if (!unknown || !date) return;
    if (changed === unknown && unknown.checked) date.value = '';
    if (changed === date && date.value) unknown.checked = false;
    date.disabled = unknown.checked;
  }

  function loadPrefill(data) {
    state.prefill = data;
    state.mode = data.mode;
    state.steps = SEQUENCES[data.mode] || SEQUENCES.FOS_ONLY;
    $('#introTitle').textContent = INTRO[data.mode].title;
    $('#introLead').textContent = INTRO[data.mode].lead;
    $('#showClientName').textContent = data.clientName;
    $('#showReference').textContent = data.reference;
    $('#showLender').textContent = data.lender;
    $('#showProduct').textContent = data.product;
    if (data.mode === 'TIMEBAR_AND_FOS') {
      $('#eventCard').hidden = false;
      $('#showEvent').textContent = data.communicationEvent;
      $('#showEventDate').textContent = data.communicationDate;
      $('#q2Event').textContent = data.communicationEvent;
      $('#q2Date').textContent = data.communicationDate;
    }
  }

  $('#startBtn').addEventListener('click', async () => {
    clearError();
    const reference = $('#gateReference').value.trim();
    if (!/^\d{9}$/.test(reference)) return showError('Please enter your 9-digit TMS Legal reference.');
    // A staff-issued link is required: the questionnaire mode and the matter
    // details are only ever taken from it.
    if (!state.prefillToken) {
      return showError('Please open this questionnaire using the link TMS Legal sent you.');
    }
    try {
      const r = await fetch('/api/prefill-resolve', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': state.csrf },
        body: JSON.stringify({ token: state.prefillToken, reference })
      });
      const j = await r.json();
      if (!r.ok) return showError(j.error || 'Please check the reference.');
      loadPrefill(j.data);
    } catch { return showError('We could not open this link. Please try again.'); }
    gate.hidden = true; form.hidden = false; showStep(0);
  });

  form.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'fosVulnerabilities') enforceVulnerabilityExclusivity(e.target);
    if (e.target && (e.target.name === 'fosLendingStartUnknown' || e.target.name === 'fosLendingStart')) {
      enforceLendingDateExclusivity(e.target);
    }
    updateConditionals();
  });
  $$('.next').forEach((b) => b.addEventListener('click', () => {
    clearFieldErrors();
    if (!validateStep(currentStep())) return;
    if (state.steps[state.index + 1] === 'review') renderReview();
    showStep(state.index + 1);
  }));
  $$('.back').forEach((b) => b.addEventListener('click', () => showStep(state.index - 1)));

  function moneyOk(raw) {
    const s = String(raw).replace(/[£\s,]/g, '');
    return /^\d{1,9}(\.\d{1,2})?$/.test(s);
  }
  function validateStep(step) {
    let ok = true;
    const need = (name, msg = 'Please select an answer.') => {
      if (!selected(name)) { fieldError(name, msg); ok = false; }
    };
    if (step === 'tb1') {
      need('q1ThoughtBefore');
      const q1 = selected('q1ThoughtBefore');
      if (q1 === 'Yes' && !value('#q1YesWhy')) { fieldError('q1YesWhy', 'Please answer this question.'); ok = false; }
      if (q1 === 'No' || q1 === 'Not sure') need('q1AwarenessSource');
    }
    if (step === 'tb2') {
      need('q2Remember');
      if (selected('q2Remember') === 'Yes') {
        if (!value('#q2RememberWhat')) { fieldError('q2RememberWhat', 'Please answer this question.'); ok = false; }
        need('q2MadeThink');
        if (!value('#q2Explain')) { fieldError('q2Explain', 'Please answer this question.'); ok = false; }
      }
    }
    if (step === 'tb3') {
      need('q3Circumstances');
      if (selected('q3Circumstances') === 'Yes' && !value('#q3Explain')) { fieldError('q3Explain', 'Please answer this question.'); ok = false; }
    }
    if (step === 'fos1') {
      if (checkedValues('fosVulnerabilities').length === 0) {
        fieldError('fosVulnerabilities', 'Please select all that apply, or select “None of these apply”.');
        ok = false;
      }
    }
    if (step === 'fos2') {
      need('fosCourtAction');
      const unknownDate = $('#fosLendingStartUnknown').checked;
      const start = value('#fosLendingStart');
      if (unknownDate && start) {
        fieldError('fosLendingStart', `Please either enter the date or tick “${UNKNOWN_DATE_LABEL}”, not both.`);
        ok = false;
      } else if (!unknownDate && !start) {
        fieldError('fosLendingStart', `Please enter the date the lending started, or tick “${UNKNOWN_DATE_LABEL}”.`);
        ok = false;
      } else if (start && start > new Date().toISOString().slice(0, 10)) {
        fieldError('fosLendingStart', 'The date cannot be in the future.');
        ok = false;
      }
      const amount = value('#fosLendingAmount');
      if (!amount) { fieldError('fosLendingAmount', 'Please enter an amount.'); ok = false; }
      else if (!moneyOk(amount)) { fieldError('fosLendingAmount', MONEY_MESSAGE); ok = false; }
      need('fosBalancesPaid');
    }
    if (step === 'fos3') {
      MONEY_FIELDS.filter((f) => f !== 'fosLendingAmount').forEach((f) => {
        const v = value('#' + f);
        if (v && !moneyOk(v)) { fieldError(f, MONEY_MESSAGE); ok = false; }
      });
      need('fosSavings');
      need('fosDependants');
      need('fosFurtherLending');
    }
    if (!ok) showError('Please complete the highlighted question before continuing.'); else clearError();
    return ok;
  }

  function collect() {
    const p = state.prefill || {};
    const out = {
      mode: state.mode,
      clientName: p.clientName, reference: p.reference, lender: p.lender, product: p.product,
      prefillToken: state.prefillToken,
      fosVulnerabilities: checkedValues('fosVulnerabilities'),
      fosVulnerabilityDetail: value('#fosVulnerabilityDetail'),
      fosCourtAction: selected('fosCourtAction'),
      // When the client says they do not know the date, no date is sent: there
      // is nothing to generate or infer from.
      fosLendingStartUnknown: $('#fosLendingStartUnknown').checked,
      fosLendingStart: $('#fosLendingStartUnknown').checked ? '' : value('#fosLendingStart'),
      fosLendingAmount: value('#fosLendingAmount'),
      fosBalancesPaid: selected('fosBalancesPaid'),
      fosSavings: selected('fosSavings'),
      fosOtherExpenses: value('#fosOtherExpenses'),
      fosDependants: selected('fosDependants'),
      fosFurtherLending: selected('fosFurtherLending'),
      confirmation: $('#confirmation').checked,
      website: value('#website'),
      startedAt: state.startedAt
    };
    INCOME_ROWS.concat(OUTGOING_ROWS).forEach(([, f]) => { out[f] = value('#' + f); });
    // Time-Bar answers are sent only in combined mode; in FOS-only mode the
    // server rejects them as unknown fields, so they must not be included.
    if (state.mode === 'TIMEBAR_AND_FOS') {
      Object.assign(out, {
        communicationEvent: p.communicationEvent, communicationDate: p.communicationDate,
        q1ThoughtBefore: selected('q1ThoughtBefore'), q1YesMonthYear: value('#q1YesMonthYear'), q1YesWhy: value('#q1YesWhy'),
        q1AwarenessSource: selected('q1AwarenessSource'), q1NoMonthYear: value('#q1NoMonthYear'), q1NoExplain: value('#q1NoExplain'),
        q2Remember: selected('q2Remember'), q2RememberWhat: value('#q2RememberWhat'), q2MadeThink: selected('q2MadeThink'),
        q2Explain: value('#q2Explain'), q2OtherMemory: value('#q2OtherMemory'),
        q3Circumstances: selected('q3Circumstances'), q3Dates: value('#q3Dates'), q3Explain: value('#q3Explain')
      });
    }
    return out;
  }

  const NOT_PROVIDED = 'Not provided';
  function displayText(v) { return v || NOT_PROVIDED; }
  function displayMoney(v) {
    const s = String(v || '').replace(/[£\s,]/g, '');
    if (!s) return NOT_PROVIDED;
    const n = Number(s);
    if (!Number.isFinite(n)) return NOT_PROVIDED;
    return '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function displayDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : NOT_PROVIDED;
  }

  function renderReview() {
    const d = collect();
    const rows = [
      ['Client name', d.clientName], ['TMS Legal reference', d.reference],
      ['Lender', d.lender], ['Product', d.product]
    ];
    if (state.mode === 'TIMEBAR_AND_FOS') {
      rows.push(['Communication/event', d.communicationEvent], ['Date identified by lender', d.communicationDate]);
      rows.push(['Before current complaint, had you questioned whether the lender might have done something wrong?', d.q1ThoughtBefore]);
      if (d.q1ThoughtBefore === 'Yes') rows.push(['Approximately when?', displayText(d.q1YesMonthYear)], ['What happened / what information?', d.q1YesWhy]);
      else rows.push(['How did you first become aware?', d.q1AwarenessSource], ['Approximate month/year', displayText(d.q1NoMonthYear)], ['Explanation', displayText(d.q1NoExplain)]);
      rows.push(['Remember the lender communication/event?', d.q2Remember]);
      if (d.q2Remember === 'Yes') rows.push(['What do you remember / understand?', d.q2RememberWhat], ['Did it make you question earlier lending?', d.q2MadeThink], ['Explanation', d.q2Explain]);
      else rows.push(['Anything else remembered', displayText(d.q2OtherMemory)]);
      rows.push(['Serious circumstances affected understanding or ability to act?', d.q3Circumstances]);
      if (d.q3Circumstances === 'Yes') rows.push(['Approximate dates', displayText(d.q3Dates)], ['Explanation', d.q3Explain]);
    }
    rows.push(['Do any of the following apply?', d.fosVulnerabilities.length ? d.fosVulnerabilities.join('\n') : NOT_PROVIDED]);
    rows.push(['If there’s anything else you’d like to tell us about this, you can do so here', displayText(d.fosVulnerabilityDetail)]);
    rows.push(['Has there been any court action related to the complaint (or is any planned)?', d.fosCourtAction]);
    rows.push(['When did the lending start?', d.fosLendingStartUnknown ? UNKNOWN_DATE_LABEL : displayDate(d.fosLendingStart)]);
    rows.push(['How much was the lending initially for?', displayMoney(d.fosLendingAmount)]);
    rows.push(['Have any outstanding balances been paid?', d.fosBalancesPaid]);
    INCOME_ROWS.forEach(([label, f]) => rows.push([`Income — ${label}`, displayMoney(d[f])]));
    rows.push(['Did you have any savings at the time of the initial lending?', d.fosSavings]);
    OUTGOING_ROWS.forEach(([label, f]) => rows.push([`Essential outgoings — ${label}`, displayMoney(d[f])]));
    rows.push(['Please provide details of any other regular expenses you had at that time (optional)', displayText(d.fosOtherExpenses)]);
    rows.push(['Did you have any dependants at the time?', d.fosDependants]);
    rows.push(['Did you apply for any further lending?', d.fosFurtherLending]);

    const review = $('#review');
    review.textContent = '';
    rows.forEach(([k, v]) => {
      const wrap = document.createElement('div'); wrap.className = 'summary-item';
      const strong = document.createElement('strong'); strong.textContent = k;
      const span = document.createElement('span'); span.textContent = v || NOT_PROVIDED;
      wrap.append(strong, span); review.appendChild(wrap);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearError(); clearFieldErrors();
    if (!$('#confirmation').checked) { fieldError('confirmation', 'Please confirm before submitting.'); return showError('Please confirm your answers before submitting.'); }
    const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      const r = await fetch('/api/submit', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-csrf-token': state.csrf },
        body: JSON.stringify(collect())
      });
      const j = await r.json().catch(() => ({}));
      // A 400 means an answer needs changing. That is fixable here and now, so
      // keep the client in the form, show the errors and send them to the step
      // that owns the first one. Showing the delivery-failure screen instead
      // would tell them to wait and retry, which could never succeed.
      if (r.status === 400) {
        const fields = j.fields || {};
        const names = Object.keys(fields).filter((k) => !k.startsWith('_'));
        names.forEach((k) => fieldError(k, FRIENDLY[String(fields[k])] || String(fields[k])));
        const target = names.map((k) => state.steps.indexOf(FIELD_STEP[k])).filter((i) => i >= 0).sort((a, b) => a - b)[0];
        if (target !== undefined) showStep(target);
        return showError(names.length
          ? 'Please check the highlighted answer, then submit again.'
          : (j.error || 'Please check your answers, then submit again.'));
      }
      if (!r.ok) {
        if (j.fields) Object.entries(j.fields).forEach(([k, v]) => fieldError(k, String(v)));
        throw new Error(j.error || 'Submission failed');
      }
      form.reset(); form.hidden = true; $('#intro').hidden = true; $('#success').hidden = false;
      state.prefill = null; state.prefillToken = '';
      history.replaceState(null, '', location.pathname);
    } catch {
      form.hidden = true; $('#intro').hidden = true; $('#failure').hidden = false;
    } finally { btn.disabled = false; btn.textContent = 'Submit questionnaire'; }
  });

  $('#retryBtn').addEventListener('click', () => {
    $('#failure').hidden = true; $('#intro').hidden = false; form.hidden = false;
    showStep(state.steps.length - 1);
  });

  (async () => {
    tokenFromHash();
    try { await getCsrf(); } catch {
      showError('This form cannot start securely at the moment. Please try again later.');
      $('#startBtn').disabled = true;
    }
  })();
})();
