import type { ParsedListCommand, ItemCategory } from './types.js';

const CATEGORIES: ItemCategory[] = ['home', 'garden', 'work', 'tech', 'family', 'food', 'other'];

const CATEGORY_KEYWORDS: Record<ItemCategory, string[]> = {
  home: ['house', 'clean', 'fix', 'repair', 'laundry', 'room', 'furniture', 'blinds', 'paint', 'tap', 'door', 'hallway', 'garage', 'shelf', 'wall'],
  garden: ['garden', 'plant', 'mow', 'lawn', 'weed', 'water', 'prune', 'hedge', 'shed'],
  work: ['email', 'report', 'meeting', 'presentation', 'deadline', 'client', 'invoice', 'proposal', 'standup', 'quarterly'],
  tech: ['code', 'bug', 'deploy', 'server', 'app', 'website', 'api', 'database', 'debug', 'build'],
  family: ['kids', 'school', 'appointment', 'birthday', 'call', 'doctor', 'dentist', 'pickup'],
  food: ['cook', 'recipe', 'grocery', 'meal', 'dinner', 'lunch', 'breakfast', 'prep food'],
  other: [],
};

export function guessCategoryFromKeywords(text: string): ItemCategory {
  const lower = text.toLowerCase();
  let bestCat: ItemCategory = 'other';
  let bestScore = 0;

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [ItemCategory, string[]][]) {
    if (category === 'other') continue;
    const score = keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCat = category;
    }
  }
  return bestCat;
}

function parseCategory(text: string): ItemCategory | undefined {
  const lower = text.toLowerCase().trim();
  return CATEGORIES.find(c => c === lower);
}

export function parseListCommand(message: string): ParsedListCommand | null {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // --- View hot list ---
  if (/^(?:hot\s*list|show\s+(?:my\s+)?hot\s*list|what'?s?\s+on\s+(?:my\s+)?hot\s*list)$/i.test(trimmed)) {
    return { action: 'view' };
  }

  // --- Knock out ---
  const knockOut = trimmed.match(
    /^(?:knock\s+out|do|burn\s+(?:through|down))\s+(\d+)\s*(?:things?|items?|tasks?)?\s*(?:in\s+(\d+)\s*m(?:in(?:utes?)?)?)?$/i,
  );
  if (knockOut) {
    return {
      action: 'knock-out',
      count: parseInt(knockOut[1], 10),
      timeboxMinutes: knockOut[2] ? parseInt(knockOut[2], 10) : undefined,
    };
  }

  // --- Recommend ---
  if (/^(?:recommend|what\s+should\s+i\s+work\s+on|suggest\s+items?)$/i.test(trimmed)) {
    return { action: 'recommend' };
  }

  // --- Add to hot list ---
  const addHot = trimmed.match(/^add\s+(.+?)\s+to\s+hot\s*list$/i);
  if (addHot) {
    return { action: 'add', text: addHot[1].trim(), status: 'hot' };
  }

  // --- Add with category ---
  const addCat = trimmed.match(/^add\s+(.+?)\s+to\s+(\w+)$/i);
  if (addCat) {
    const cat = parseCategory(addCat[2]);
    if (cat) {
      return { action: 'add', text: addCat[1].trim(), category: cat };
    }
  }

  // --- Add (no category) ---
  const addPlain = trimmed.match(/^add\s+(.+)$/i);
  if (addPlain) {
    return { action: 'add', text: addPlain[1].trim() };
  }

  // --- Done X (with text — not bare "done") ---
  const doneItem = trimmed.match(/^(?:done|check\s+off|complete)\s+(.+)$/i);
  if (doneItem) {
    return { action: 'done', text: doneItem[1].trim() };
  }

  // --- Remove ---
  const removeItem = trimmed.match(/^remove\s+(.+)$/i);
  if (removeItem) {
    return { action: 'remove', text: removeItem[1].trim() };
  }

  // --- Promote ---
  const promote = trimmed.match(/^(?:promote|move)\s+(.+?)(?:\s+to\s+hot\s*list)?$/i);
  if (promote) {
    return { action: 'promote', text: promote[1].trim() };
  }

  // --- Show backlog (with optional category) ---
  const backlogView = trimmed.match(
    /^(?:show\s+)?(?:(?:my\s+)?(\w+)\s+)?backlog$|^what'?s?\s+in\s+(?:my\s+)?(\w+)\s+backlog$/i,
  );
  if (backlogView) {
    const catStr = backlogView[1] || backlogView[2];
    const cat = catStr ? parseCategory(catStr) : undefined;
    return { action: 'backlog', category: cat };
  }

  // --- Show archive (with optional category) ---
  const archiveView = trimmed.match(
    /^(?:show\s+)?(?:(?:my\s+)?(\w+)\s+)?archive$|^(\w+)\s+archive$/i,
  );
  if (archiveView) {
    const catStr = archiveView[1] || archiveView[2];
    const cat = catStr ? parseCategory(catStr) : undefined;
    return { action: 'archive', category: cat };
  }

  return null;
}

