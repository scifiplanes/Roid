/** How often researching labels reshuffle (much slower than frame rate). */
export const GIBBERISH_INTERVAL_MS = 2000

const GIBBERISH_ALPHABET =
  '█▓▒░▀▄▌▐┤┘┌┴┬├┼│─┼╪Øµþÿ¿½¼£¥ßðþÞ¦§'

export function randomGibberish(len: number): string {
  let s = ''
  const n = Math.max(0, len | 0)
  for (let i = 0; i < n; i++) {
    s += GIBBERISH_ALPHABET[(Math.random() * GIBBERISH_ALPHABET.length) | 0]
  }
  return s
}
