import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  ASSISTANT_ACTION_CHIPS,
  type AssistantConversation,
  type AssistantMessage,
  type AssistantPatch,
  type HardPatch,
  type SoftPatch,
} from '@/models/assistant';
import type { ChatModelInfo } from '@/models/chatModels';
import { toIpcPayload } from '@/models/ipc';
import { DEFAULT_FLASH_MODEL } from '@/models/settings';
import { useBudgetStore } from '@/stores/budget';
import { usePatternStore } from '@/stores/pattern';

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function titleFromMessage(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New chat';
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}…` : cleaned;
}

export const useAssistantStore = defineStore('assistant', () => {
  const open = ref(false);
  const conversations = ref<AssistantConversation[]>([]);
  const activeId = ref<string | null>(null);
  const busy = ref(false);
  const composerDraft = ref('');
  const lastError = ref<string | null>(null);
  const selectedModel = ref(DEFAULT_FLASH_MODEL);
  const chatModels = ref<ChatModelInfo[]>([]);
  const modelsLoading = ref(false);
  const modelsCached = ref(false);
  const modelsFetchedAt = ref<string | null>(null);
  let unsubscribeEvents: (() => void) | null = null;

  const activeConversation = computed(
    () => conversations.value.find((c) => c.id === activeId.value) ?? null,
  );

  const messages = computed(() => activeConversation.value?.messages ?? []);

  /** Pending lyric hard-patches in the active thread, newest message last. */
  const pendingLyricPatches = computed(() => {
    const out: { messageId: string; patchId: string; text: string; label: string }[] = [];
    for (const msg of messages.value) {
      for (const patch of msg.hardPatches ?? []) {
        if (patch.op !== 'lyrics' || patch.status !== 'pending') continue;
        out.push({
          messageId: msg.id,
          patchId: patch.id,
          text: typeof patch.value === 'string' ? patch.value : '',
          label: patch.label,
        });
      }
    }
    return out;
  });

  /** Latest pending lyric proposal for the Lyrics panel review surface. */
  const latestPendingLyricPatch = computed(
    () => pendingLyricPatches.value[pendingLyricPatches.value.length - 1] ?? null,
  );

  const canUndoSoft = computed(() => usePatternStore().lastSoftPatches.length > 0);

  function ensureListener(): void {
    if (!window.mytunes || unsubscribeEvents) return;
    unsubscribeEvents = window.mytunes.onAssistantEvent((event) => {
      if (!activeId.value || event.conversationId !== activeId.value) return;
      const conv = conversations.value.find((c) => c.id === event.conversationId);
      if (!conv) return;
      const last = [...conv.messages].reverse().find((m) => m.role === 'assistant');
      if (!last) return;

      if (event.type === 'progress') {
        last.progress = event.text;
      } else if (event.type === 'error') {
        last.error = event.message;
        delete last.progress;
        last.content = last.content || event.message;
      } else if (event.type === 'cancelled') {
        delete last.progress;
        last.content = last.content || '(stopped)';
      }
    });
  }

  async function refreshConversations(): Promise<void> {
    if (!window.mytunes) return;
    const listed = await window.mytunes.listAssistantConversations();
    const current = activeConversation.value;
    // Keep an in-memory draft/active chat that has not hit disk yet (race with newChat persist).
    if (current && !listed.some((c) => c.id === current.id)) {
      conversations.value = [current, ...listed.filter((c) => c.id !== current.id)];
    } else {
      conversations.value = listed;
    }
    if (!activeId.value && conversations.value.length) {
      const first = conversations.value[0];
      if (first) activeId.value = first.id;
    }
    if (activeId.value && !conversations.value.some((c) => c.id === activeId.value)) {
      activeId.value = conversations.value[0]?.id ?? null;
    }
  }

  async function toggleOpen(force?: boolean): Promise<void> {
    open.value = force ?? !open.value;
    if (open.value) {
      ensureListener();
      await refreshConversations();
      if (!activeId.value || !conversations.value.some((c) => c.id === activeId.value)) {
        await newChat();
      }
    }
  }

  async function newChat(): Promise<void> {
    const conversation: AssistantConversation = {
      id: newId(),
      title: 'New chat',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
    };
    conversations.value = [
      conversation,
      ...conversations.value.filter((c) => c.id !== conversation.id),
    ];
    activeId.value = conversation.id;
    composerDraft.value = '';
    lastError.value = null;
    await persistActive();
  }

  function selectConversation(id: string): void {
    activeId.value = id;
    lastError.value = null;
  }

  async function deleteActive(): Promise<void> {
    if (!activeId.value) return;
    const id = activeId.value;
    if (window.mytunes) {
      await window.mytunes.deleteAssistantConversation(id);
    }
    conversations.value = conversations.value.filter((c) => c.id !== id);
    activeId.value = conversations.value[0]?.id ?? null;
    if (!activeId.value) await newChat();
  }

  function ensureActiveConversation(): AssistantConversation {
    const conv = activeConversation.value;
    if (conv) return conv;
    const conversation: AssistantConversation = {
      id: newId(),
      title: 'New chat',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
    };
    conversations.value = [conversation, ...conversations.value];
    activeId.value = conversation.id;
    return conversation;
  }

  async function persistActive(): Promise<void> {
    const conv = activeConversation.value;
    if (!conv || !window.mytunes) return;
    await window.mytunes.saveAssistantConversation(toIpcPayload(conv));
  }

  function injectChip(prompt: string): void {
    composerDraft.value = prompt;
  }

  async function bootstrapModel(): Promise<void> {
    if (!window.mytunes) return;
    try {
      const settings = await window.mytunes.getSettings();
      if (settings.flashModel?.trim()) selectedModel.value = settings.flashModel.trim();
    } catch {
      /* keep default */
    }
    await refreshChatModels();
  }

  async function refreshChatModels(force = false): Promise<void> {
    if (!window.mytunes) return;
    modelsLoading.value = true;
    try {
      const result = await window.mytunes.listChatModels({ force });
      chatModels.value = result.models;
      modelsCached.value = result.cached;
      modelsFetchedAt.value = result.fetchedAt;
      if (
        selectedModel.value &&
        result.models.length &&
        !result.models.some((m) => m.id === selectedModel.value)
      ) {
        // Keep custom/settings id visible by injecting it.
        chatModels.value = [
          { id: selectedModel.value, displayName: selectedModel.value },
          ...result.models,
        ];
      }
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
    } finally {
      modelsLoading.value = false;
    }
  }

  async function setSelectedModel(modelId: string): Promise<void> {
    const id = modelId.trim();
    if (!id) return;
    selectedModel.value = id;
    if (!window.mytunes) return;
    try {
      await window.mytunes.setSettings({ flashModel: id });
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e);
    }
  }

  function applyIncomingPatches(patches: AssistantPatch[]): {
    soft: SoftPatch[];
    hard: HardPatch[];
  } {
    const soft = patches.filter((p): p is SoftPatch => p.kind === 'soft');
    const hard = patches
      .filter((p): p is HardPatch => p.kind === 'hard')
      .map((p) => ({ ...p, status: 'pending' as const }));
    if (soft.length) {
      usePatternStore().applySoftPatches(soft);
    }
    return { soft, hard };
  }

  function applyHardPatch(messageId: string, patchId: string): void {
    const conv = activeConversation.value;
    if (!conv) return;
    const msg = conv.messages.find((m) => m.id === messageId);
    const patch = msg?.hardPatches?.find((p) => p.id === patchId);
    if (!patch || patch.status !== 'pending') return;
    usePatternStore().applyHardPatch(patch);
    patch.status = 'applied';
    void persistActive();
  }

  function rejectHardPatch(messageId: string, patchId: string): void {
    const conv = activeConversation.value;
    if (!conv) return;
    const msg = conv.messages.find((m) => m.id === messageId);
    const patch = msg?.hardPatches?.find((p) => p.id === patchId);
    if (!patch || patch.status !== 'pending') return;
    patch.status = 'rejected';
    void persistActive();
  }

  function undoSoft(): void {
    usePatternStore().undoLastSoftPatches();
  }

  async function sendMessage(text?: string): Promise<void> {
    const content = (text ?? composerDraft.value).trim();
    if (!content || busy.value) return;
    if (!window.mytunes) {
      lastError.value = 'Run with Electron to use the assistant.';
      return;
    }

    ensureListener();
    const conv = ensureActiveConversation();

    const patternStore = usePatternStore();
    const budgetStore = useBudgetStore();

    const userMsg: AssistantMessage = {
      id: newId(),
      role: 'user',
      content,
      createdAt: nowIso(),
    };
    const assistantMsg: AssistantMessage = {
      id: newId(),
      role: 'assistant',
      content: '',
      createdAt: nowIso(),
      progress: 'Thinking…',
    };

    if (!conv.messages.length) {
      conv.title = titleFromMessage(content);
    }
    conv.messages.push(userMsg, assistantMsg);
    conv.updatedAt = nowIso();
    composerDraft.value = '';
    busy.value = true;
    lastError.value = null;
    await persistActive();

    const history = conv.messages
      .filter((m) => m.id !== userMsg.id && m.id !== assistantMsg.id)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
      .map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    try {
      const result = await window.mytunes.assistantChat({
        conversationId: conv.id,
        message: content,
        pattern: toIpcPayload(patternStore.pattern),
        history,
        model: selectedModel.value,
      });
      budgetStore.applyBudget(result.budget);
      const { soft, hard } = applyIncomingPatches(result.patches);
      assistantMsg.content = result.message;
      delete assistantMsg.progress;
      assistantMsg.costUsd = result.costUsd;
      assistantMsg.model = result.model;
      assistantMsg.softPatches = soft;
      assistantMsg.hardPatches = hard;
      conv.updatedAt = nowIso();
      await persistActive();
      await refreshConversations();
      activeId.value = conv.id;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      lastError.value = message;
      assistantMsg.error = message;
      delete assistantMsg.progress;
      if (!assistantMsg.content) assistantMsg.content = message;
      await persistActive();
      await budgetStore.refresh();
    } finally {
      busy.value = false;
    }
  }

  async function cancel(): Promise<void> {
    if (!activeId.value || !window.mytunes) return;
    await window.mytunes.assistantCancel(activeId.value);
  }

  return {
    open,
    conversations,
    activeId,
    busy,
    composerDraft,
    lastError,
    selectedModel,
    chatModels,
    modelsLoading,
    modelsCached,
    modelsFetchedAt,
    activeConversation,
    messages,
    pendingLyricPatches,
    latestPendingLyricPatch,
    canUndoSoft,
    actionChips: ASSISTANT_ACTION_CHIPS,
    toggleOpen,
    newChat,
    selectConversation,
    deleteActive,
    injectChip,
    bootstrapModel,
    refreshChatModels,
    setSelectedModel,
    sendMessage,
    cancel,
    applyHardPatch,
    rejectHardPatch,
    undoSoft,
    refreshConversations,
  };
});
