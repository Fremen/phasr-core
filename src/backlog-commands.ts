import type { ParsedBacklogCommand } from './types.js';

export function parseBacklogCommand(message: string): ParsedBacklogCommand | null {
  const trimmed = message.trim();

  // Must start with "backlog"
  if (!/^backlog\b/i.test(trimmed)) return null;

  const rest = trimmed.replace(/^backlog\s*/i, '').trim();

  // backlog stats
  if (/^stats$/i.test(rest)) {
    return { action: 'stats' };
  }

  // backlog purge [category]
  const purgeMatch = rest.match(/^purge(?:\s+(\w+))?$/i);
  if (purgeMatch) {
    return { action: 'purge', category: purgeMatch[1]?.toLowerCase() };
  }

  // backlog retriage
  if (/^retriage$/i.test(rest)) {
    return { action: 'retriage' };
  }

  // backlog search <query>
  const searchMatch = rest.match(/^search\s+(.+)/i);
  if (searchMatch) {
    return { action: 'search', text: searchMatch[1].trim() };
  }

  // backlog promote <item>
  const promoteMatch = rest.match(/^promote\s+(.+)/i);
  if (promoteMatch) {
    return { action: 'promote', text: promoteMatch[1].trim() };
  }

  // backlog demote <item>
  const demoteMatch = rest.match(/^demote\s+(.+)/i);
  if (demoteMatch) {
    return { action: 'demote', text: demoteMatch[1].trim() };
  }

  // backlog archive <item>
  const archiveMatch = rest.match(/^archive\s+(.+)/i);
  if (archiveMatch) {
    return { action: 'archive', text: archiveMatch[1].trim() };
  }

  // backlog add <item> [to <category>]
  const addMatch = rest.match(/^add\s+(.+?)(?:\s+to\s+(\w+))?$/i);
  if (addMatch) {
    return {
      action: 'add',
      text: addMatch[1].trim(),
      category: addMatch[2]?.toLowerCase(),
    };
  }

  // backlog list [category] / backlog [category] / bare "backlog"
  const listMatch = rest.match(/^(?:list\s+)?(\w+)?$/i);
  if (listMatch) {
    const cat = listMatch[1]?.toLowerCase();
    // Avoid matching action/keyword words as categories
    if (cat && /^(?:list|search|promote|demote|archive|add|stats|purge|retriage)$/i.test(cat)) {
      return { action: 'list' };
    }
    return { action: 'list', category: cat || undefined };
  }

  // bare "backlog"
  if (!rest) {
    return { action: 'list' };
  }

  return null;
}

