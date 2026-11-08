import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { AssistantConversation } from '../../src/models/assistant';

const MAX_CONVERSATIONS = 40;

function assistantDir(): string {
  const dir = path.join(app.getPath('userData'), 'assistant');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function indexPath(): string {
  return path.join(assistantDir(), 'conversations.json');
}

export function listConversations(): AssistantConversation[] {
  const file = indexPath();
  if (!fs.existsSync(file)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(file, 'utf8')) as AssistantConversation[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeAll(list: AssistantConversation[]): void {
  const trimmed = list
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);
  fs.writeFileSync(indexPath(), JSON.stringify(trimmed, null, 2), 'utf8');
}

export function saveConversation(conversation: AssistantConversation): AssistantConversation {
  const list = listConversations().filter((c) => c.id !== conversation.id);
  list.unshift(conversation);
  writeAll(list);
  return conversation;
}

export function loadConversation(id: string): AssistantConversation | null {
  return listConversations().find((c) => c.id === id) ?? null;
}

export function deleteConversation(id: string): { ok: boolean } {
  const list = listConversations();
  const next = list.filter((c) => c.id !== id);
  writeAll(next);
  return { ok: next.length !== list.length };
}
