/**
 * MPP Specs Studio Client Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadIntents();
  initFormListeners();
});

function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t === tab));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.toggle('active', p.id === `tab-${tab.dataset.tab}`));
    });
  });
}

async function loadIntents() {
  const container = document.getElementById('intents-container');
  try {
    const res = await fetch('/api/specs');
    const data = await res.json();

    container.innerHTML = '';
    data.intents.forEach(intent => {
      const card = document.createElement('div');
      card.className = 'intent-card';
      card.innerHTML = `
        <div class="intent-name">${intent.name}</div>
        <p class="text-muted" style="font-size: 0.85rem;">${intent.description}</p>
        <div class="mt-2" style="font-size: 0.78rem;">
          <span style="color: #635bff; font-weight: 600;">Required:</span>
          <span class="mono">${intent.requiredFields.join(', ')}</span>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Failed to load intents: ${err.message}</div>`;
  }
}

function initFormListeners() {
  document.getElementById('validate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-validate');
    const resultBox = document.getElementById('validate-result');

    const headerName = document.getElementById('val-header-select').value;
    const headerValue = document.getElementById('val-header-val').value;

    btn.disabled = true;
    btn.textContent = '⏳ Validating RFC Schema...';

    try {
      const res = await fetch('/api/validate/header', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headerName, headerValue }),
      });
      const data = await res.json();

      if (data.valid) {
        resultBox.innerHTML = `
          <div class="card" style="border-color: #10b981; background: rgba(16, 185, 129, 0.08);">
            <strong style="color: #34d399;">✅ Valid MPP ${data.headerName} Header!</strong>
            <p class="mt-2 text-muted" style="font-size: 0.85rem;">Parsed Parameters:</p>
            <pre class="mono mt-1" style="color: #a5b4fc; font-size: 0.8rem;">${JSON.stringify(data.parameters, null, 2)}</pre>
          </div>
        `;
      } else {
        resultBox.innerHTML = `
          <div class="card" style="border-color: #f87171; background: rgba(248, 113, 113, 0.08);">
            <strong style="color: #f87171;">❌ Invalid Header: ${data.error}</strong>
          </div>
        `;
      }
    } catch (err) {
      resultBox.innerHTML = `<div class="badge red">Validation error: ${err.message}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Check RFC Compliance';
    }
  });
}

window.genHeader = async function(type) {
  const out = document.getElementById('gen-output');
  out.textContent = 'Generating...';

  try {
    const res = await fetch('/api/generate/header', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    const data = await res.json();
    out.textContent = data.header;
  } catch (e) {
    out.textContent = `Error: ${e.message}`;
  }
};
