const SHARE_VERSION = 1;
const HASH_PREFIX = 'r=';

function toBase64Url(text) {
  return btoa(unescape(encodeURIComponent(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(encoded) {
  const pad = encoded.length % 4;
  const b64 = encoded.replace(/-/g, '+').replace(/_/g, '/') + (pad ? '='.repeat(4 - pad) : '');
  return decodeURIComponent(escape(atob(b64)));
}

export function compactResult(result) {
  return {
    v: SHARE_VERSION,
    rec: result.record,
    gr: result.grade,
    pw: result.avgRating,
    pf: !!result.perfect,
    df: result.difficulty || 'normal',
    dfl: result.difficultyLabel || '',
    md: result.mode || '',
    st: result.statTotals || {},
    ros: result.roster.map((pl) => ({
      s: pl.slot,
      n: pl.name,
      tn: pl.teamName,
      e: pl.era,
      r: pl.rating,
    })),
  };
}

export function expandSharedResult(payload) {
  if (!payload || payload.v !== SHARE_VERSION || !Array.isArray(payload.ros)) {
    throw new Error('Invalid share data');
  }

  return {
    record: payload.rec,
    grade: payload.gr,
    avgRating: payload.pw,
    perfect: payload.pf,
    difficulty: payload.df || 'normal',
    difficultyLabel: payload.dfl || '',
    mode: payload.md,
    statTotals: payload.st || {},
    wins: parseInt(payload.rec?.split('-')[0], 10) || 0,
    losses: parseInt(payload.rec?.split('-')[1], 10) || 0,
    roster: payload.ros.map((pl) => ({
      slot: pl.s,
      name: pl.n,
      teamName: pl.tn,
      era: pl.e,
      rating: pl.r,
    })),
  };
}

export function encodeSharePayload(result) {
  return toBase64Url(JSON.stringify(compactResult(result)));
}

export function decodeSharePayload(encoded) {
  return expandSharedResult(JSON.parse(fromBase64Url(encoded)));
}

export function buildShareUrl(result) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#${HASH_PREFIX}${encodeSharePayload(result)}`;
}

export function parseShareFromUrl() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash.startsWith(HASH_PREFIX)) return null;
  try {
    return decodeSharePayload(hash.slice(HASH_PREFIX.length));
  } catch {
    return null;
  }
}

export function clearShareHash() {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

async function loadHtml2Canvas() {
  if (window.html2canvas) return window.html2canvas;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load screenshot library'));
    document.head.appendChild(script);
  });
  return window.html2canvas;
}

export async function captureShareCard(element) {
  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(element, {
    backgroundColor: '#0d1117',
    scale: 2,
    useCORS: true,
    logging: false,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create image'));
    }, 'image/png');
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement('textarea');
  input.value = text;
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
}

export function getShareFilename(result) {
  const record = (result.record || 'roster').replace(/\s/g, '');
  return `undefeated-cbb-${record}.png`;
}
