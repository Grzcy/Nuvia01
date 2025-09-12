// Reusable bank details injector for purchase flows only
;(function(){
  const OPay = { bank: 'OPay', accountName: 'ELECHI JOSHUA', accountNumber: '8111609765' };
  const Keystone = { bank: 'Keystone Bank', accountName: 'ELECHI OSOUNDU JOSHUA', accountNumber: '6042862356' };

  // Expose constants for other pages (e.g., premium_subscriptions)
  window.BANK_DETAILS = Object.freeze({ opay: OPay, keystone: Keystone });

  function createEl(tag, attrs = {}, html = '') {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v; else if (k === 'style') el.setAttribute('style', v); else el.setAttribute(k, v);
    }
    if (html) el.innerHTML = html;
    return el;
  }

  function copy(text) {
    try { navigator.clipboard?.writeText?.(text); } catch(_) {}
  }

  function renderCards(container) {
    const wrapper = createEl('div', { class: 'bank' });

    [OPay, Keystone].forEach((acc) => {
      const card = createEl('div', { class: 'card' });
      const row = createEl('div', { class: 'row', style: 'gap:8px' }, `<i class="fas fa-university" style="color:#ffd700"></i><div><strong>Bank:</strong> ${acc.bank}</div>`);
      const name = createEl('div', {}, `<strong>Account Name:</strong> ${acc.accountName}`);
      const num = createEl('div');
      const span = createEl('span');
      span.textContent = acc.accountNumber;
      const label = document.createTextNode(' ');
      const copyBtn = createEl('button', { class: 'copy', type: 'button' }, 'Copy');
      copyBtn.addEventListener('click', () => copy(acc.accountNumber));
      num.appendChild(createEl('strong', {}, 'Account Number: '));
      num.appendChild(span);
      num.appendChild(label);
      num.appendChild(copyBtn);
      card.appendChild(row); card.appendChild(name); card.appendChild(num);
      wrapper.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(wrapper);
  }

  function renderChips(container) {
    const block = document.createDocumentFragment();
    const row1 = createEl('div', { class: 'row', style: 'gap:10px; flex-wrap:wrap;' });
    row1.appendChild(createEl('div', { class: 'chip' }, `<i class="fas fa-university"></i> OPay: <strong>${OPay.accountNumber}</strong>`));
    row1.appendChild(createEl('div', { class: 'chip' }, `<i class="fas fa-user"></i> Name: <strong>${OPay.accountName}</strong>`));
    const row2 = createEl('div', { class: 'row', style: 'gap:10px; margin-top:8px; flex-wrap:wrap;' });
    row2.appendChild(createEl('div', { class: 'chip' }, `<i class="fas fa-university"></i> Keystone: <strong>${Keystone.accountNumber}</strong>`));
    row2.appendChild(createEl('div', { class: 'chip' }, `<i class="fas fa-user"></i> Name: <strong>${Keystone.accountName}</strong>`));
    const btns = createEl('div', { style: 'margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;' });
    const btn1 = createEl('button', { class: 'btn', type: 'button' }, '<i class="fas fa-copy"></i> Copy OPay');
    const btn2 = createEl('button', { class: 'btn', type: 'button' }, '<i class="fas fa-copy"></i> Copy Keystone');
    btn1.addEventListener('click', () => copy(OPay.accountNumber));
    btn2.addEventListener('click', () => copy(Keystone.accountNumber));
    btns.appendChild(btn1); btns.appendChild(btn2);
    block.appendChild(row1); block.appendChild(row2); block.appendChild(btns);
    const containerDiv = createEl('div'); containerDiv.appendChild(block);
    container.innerHTML = '';
    container.appendChild(containerDiv);
  }

  window.renderBankDetails = function(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const layout = options.layout || 'cards';
    if (layout === 'chips') renderChips(container); else renderCards(container);
  }
})();

