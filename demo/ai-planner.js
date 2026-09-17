const MAX_STEPS = 6;
const MIN_STEPS = 3;

function responseText(response) {
  if (typeof response === 'string') return response;
  if (typeof response?.message?.content === 'string') return response.message.content;
  if (Array.isArray(response?.message?.content)) {
    return response.message.content.map((part) => part?.text ?? '').join('');
  }
  if (typeof response?.text === 'string') return response.text;
  return String(response ?? '');
}

export function parseAIPlan(response) {
  const raw = responseText(response)
    .replace(/^~~~(?:json)?\s*/i, '')
    .replace(/\s*~~~$/i, '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The AI response did not contain a plan.');

  const parsed = JSON.parse(raw.slice(start, end + 1));
  if (!Array.isArray(parsed.steps)) throw new Error('The AI response did not contain steps.');

  const steps = parsed.steps
    .map((item) => ({
      text: typeof item?.text === 'string' ? item.text.trim() : '',
      tiny: typeof item?.tiny === 'string' ? item.tiny.trim() : ''
    }))
    .filter((item) => item.text && item.tiny)
    .slice(0, MAX_STEPS);

  if (steps.length < MIN_STEPS) throw new Error('The AI response did not contain enough usable steps.');
  if (steps.some((item) => item.text.length > 220 || item.tiny.length > 180)) {
    throw new Error('The AI response contained an overlong step.');
  }
  return steps;
}

export function buildPlanningPrompt(task, mode, minutes) {
  return [
    'You are the planning component of Phasr, an executive-function companion.',
    'Turn the user task into 3 to 6 concrete, correctly ordered physical actions.',
    'The plan must be practical for a real person, not generic productivity advice.',
    'Include setup, safety checks and cleanup when relevant.',
    'Each main step must express one action. Each tiny alternative must be a genuinely smaller action that can be started in about two minutes.',
    'Do not include praise, diagnosis, therapy language or commentary.',
    'Do not invent facts. If the task is ambiguous, begin with one observation or decision that resolves the ambiguity.',
    'If the task appears unsafe, illegal or to require a qualified professional, make the first step a clear instruction to stop and get appropriate help.',
    'Return JSON only in exactly this shape:',
    '{"steps":[{"text":"Main action.","tiny":"Smaller action."}]}',
    '',
    'Mode: ' + mode,
    'Time available: ' + minutes + ' minutes',
    'Task: ' + task
  ].join('\n');
}

export async function createAIPlan(task, mode, minutes, chat) {
  if (typeof chat !== 'function') throw new Error('AI is unavailable.');
  const prompt = buildPlanningPrompt(task, mode, minutes);
  const response = await chat(prompt);
  return parseAIPlan(response);
}
