/** The small how-to-play panel: one looping picture and six short lines. Opened from the ? button or H. */
export const HOWTO_ROWS: readonly (readonly [string, string])[] = [
  ["Hold", "dive down a slope"],
  ["Let go at the bottom", "fly off the next crest"],
  ["Land along the slope", "a Perfect, and a faster ride"],
  ["Hold in the air", "backflip, then let go to land flat"],
  ["Swipe up, double-tap or add a finger", "Surge: a burst and a ring magnet"],
  ["Rings and gems", "refill your light"],
];

const WAVE = "M0 40 Q55 -10 110 40 T220 40 T330 40";

export function howToHtml(): string {
  const rows = HOWTO_ROWS.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join("");
  const fade = (kt: string, v: string) => `<animate attributeName="opacity" values="${v}" keyTimes="${kt}" dur="6s" repeatCount="indefinite"/>`;
  return `
    <h2 id="panel-title">How to play</h2>
    <svg class="howto-art" viewBox="0 0 320 110" role="img" aria-label="A spirit dives down a slope while held, lets go at the bottom and flies off the crest">
      <path d="${WAVE} L330 110 L0 110Z" fill="rgba(120,150,255,0.14)"/>
      <path d="${WAVE}" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="2.4" stroke-linecap="round"/>
      <circle r="6" fill="#ffe7a8"><animateMotion dur="6s" repeatCount="indefinite" path="${WAVE}"/></circle>
      <g opacity="0">${fade("0;0.14;0.18;0.48;0.52;1", "0;0;1;1;0;0")}<circle cx="110" cy="38" r="15" fill="none" stroke="#ff9f6b" stroke-width="2.4"/><text x="110" y="42" text-anchor="middle" font-size="10" font-weight="700" fill="#ff9f6b">HOLD</text></g>
      <g opacity="0">${fade("0;0.48;0.52;0.66;0.7;1", "0;0;1;1;0;0")}<text x="165" y="92" text-anchor="middle" font-size="11" font-weight="700" fill="#9fe4ff">LET GO</text></g>
    </svg>
    <ul class="howto">${rows}</ul>
    <div class="row"><button class="primary" data-act="back" data-autofocus>Got it</button></div>
  `;
}
