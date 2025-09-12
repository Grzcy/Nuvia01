export let userCountryCode = null;
export let userCurrency = { code: 'USD', symbol: '$', label: 'USD' };

const COUNTRY_TO_CURRENCY = {
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CO: 'COP', CL: 'CLP', PE: 'PEN',
  GB: 'GBP', IE: 'EUR', FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', PT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', MT: 'EUR', CY: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR', LV: 'EUR', LT: 'EUR',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', TR: 'TRY', UA: 'UAH', RU: 'RUB',
  AU: 'AUD', NZ: 'NZD', JP: 'JPY', CN: 'CNY', HK: 'HKD', SG: 'SGD', KR: 'KRW', IN: 'INR', ID: 'IDR', TH: 'THB', MY: 'MYR', PH: 'PHP', VN: 'VND',
  NG: 'NGN', ZA: 'ZAR', KE: 'KES', GH: 'GHS', EG: 'EGP', MA: 'MAD', DZ: 'DZD', TN: 'TND', ET: 'ETB', UG: 'UGX', TZ: 'TZS', CM: 'XAF', SN: 'XOF', CI: 'XOF', BF: 'XOF', BJ: 'XOF', NE: 'XOF', ML: 'XOF', TG: 'XOF', GW: 'XOF', GN: 'GNF',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', IL: 'ILS'
};

const CURRENCY_SYMBOL = {
  USD: '$', EUR: '€', GBP: '£', NGN: '₦', CAD: 'CA$', AUD: 'A$', NZD: 'NZ$', JPY: '¥', CNY: '¥', HKD: 'HK$', SGD: 'S$', KRW: '₩', INR: '₹', IDR: 'Rp', THB: '฿', MYR: 'RM', PHP: '₱', VND: '₫',
  CHF: 'CHF', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', CZK: 'Kč', HUF: 'Ft', RON: 'lei', BGN: 'лв', TRY: '₺', UAH: '₴', RUB: '₽',
  ZAR: 'R', KES: 'KSh', GHS: '₵', EGP: 'E£', MAD: 'MAD', DZD: 'د.ج', TND: 'د.ت', ETB: 'Br', UGX: 'USh', TZS: 'TSh', XAF: 'FCFA', XOF: 'CFA', GNF: 'FG',
  AED: 'د.إ', SAR: 'ر.س', QAR: 'ر.ق', KWD: 'د.ك', BHD: 'ب.د', OMR: 'ر.ع', ILS: '₪', MXN: 'MX$', BRL: 'R$', ARS: '$', COP: 'COL$', CLP: 'CLP$', PEN: 'S/'
};

export function inferCountryCodeFromProfileOrLocale(profile) {
  try {
    const pref = localStorage.getItem('jchat-currency-preference');
    if (pref && pref !== 'AUTO') {
      if (pref.length === 3) return null; // currency override handled elsewhere
      return pref.toUpperCase();
    }
    const raw = (profile?.country || '').toString().trim();
    if (raw) {
      const r = raw.toUpperCase();
      if (COUNTRY_TO_CURRENCY[r]) return r;
      if (r.includes('NIGERIA') || r === 'NG' || r === 'NGN') return 'NG';
    }
    const lang = navigator.language || navigator.userLanguage || '';
    const match = lang.match(/-([A-Z]{2})$/);
    if (match && match[1]) return match[1];
  } catch (_) {}
  return null;
}

export function resolveCurrencyForCountry(countryCode) {
  const code = COUNTRY_TO_CURRENCY[(countryCode || '').toUpperCase()] || 'USD';
  const symbol = CURRENCY_SYMBOL[code] || code;
  return { code, symbol, label: code };
}

export function setUserCurrencyFromProfile(profile) {
  userCountryCode = inferCountryCodeFromProfileOrLocale(profile) || userCountryCode;
  userCurrency = resolveCurrencyForCountry(userCountryCode);
  return userCurrency;
}

export function formatLocalCurrency(amount) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: userCurrency.code }).format(Number(amount));
  } catch (_) {
    const value = Number(amount).toFixed(2);
    return `${userCurrency.symbol}${value} ${userCurrency.label}`;
  }
}

export function applyCurrencyDisplayForWallet(jcoinPackagesGrid) {
  const amountLabel = document.querySelector('label[for="nairaInput"]');
  const manualBuySection = document.querySelector('.manual-buy-section');
  if (manualBuySection) manualBuySection.style.display = '';

  if (userCurrency.code === 'NGN') {
    if (amountLabel) amountLabel.textContent = 'Amount Paid (NGN):';
  } else {
    if (amountLabel) amountLabel.textContent = 'Amount Paid';
    if (jcoinPackagesGrid) {
      jcoinPackagesGrid.innerHTML = '<p style="text-align: center; color: var(--text-light);">Packages are priced in NGN. You can still submit a receipt with an equivalent amount.</p>';
    }
  }
}
