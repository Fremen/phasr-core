const WORDS_PER_SECOND = 2; // ~15 words in 8 seconds
const DEFAULT_MAX_SECONDS = 8;

export function truncateForVoice(text: string, maxSeconds: number = DEFAULT_MAX_SECONDS): string {
  const maxWords = Math.floor(WORDS_PER_SECOND * maxSeconds);
  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(' ') + '…';
}

export function isVoiceInput(_message: string): boolean {
  // Placeholder — in production, check for audio metadata or voice toggle
  return false;
}

