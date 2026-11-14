import { getLang } from './strings';

let enabled = false;

/** Turn spoken messages on or off. */
export function setVoice(on: boolean): void {
  enabled = on;
  if (!on) speechSynthesis?.cancel();
}

/**
 * Read a message aloud with the system's speech synthesis, in the game's language. A newer
 * message interrupts an older one; nothing happens where speech is unavailable.
 */
export function speak(text: string, urgent = false): void {
  if (!enabled || typeof speechSynthesis === 'undefined') return;
  const lang = getLang() === 'es' ? 'es' : 'en';
  const voices = speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang === 'es' ? 'es-es' : 'en-gb')) ?? voices.find((v) => v.lang.toLowerCase().startsWith(lang));
  const u = new SpeechSynthesisUtterance(text.replace(/[«»“”]/g, ''));
  u.lang = lang === 'es' ? 'es-ES' : 'en-GB';
  if (voice) u.voice = voice;
  u.rate = urgent ? 1.08 : 1;
  u.pitch = 1.05;
  if (urgent || speechSynthesis.speaking) speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
