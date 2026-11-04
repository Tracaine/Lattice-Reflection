import { CompanionStore } from "../../../packages/storage";

export const profile = {
  id: "10000000-0000-4000-8000-000000000031", revision: 1, name: "Demo",
  biography: "", instructions: "", language: "en",
  avatarId: "10000000-0000-4000-8000-000000000041", voiceBindingId: null,
};
export const conversation = {
  id: "10000000-0000-4000-8000-000000000071",
  channelId: "10000000-0000-4000-8000-000000000061", title: "Desktop",
};
export const input = {
  characterId: profile.id, conversationId: conversation.id,
  commandId: "10000000-0000-4000-8000-000000000111",
  clientInputId: "10000000-0000-4000-8000-000000000110",
  source: "desktop_text" as const, text: "Hello", frozenContext: { revision: 1 },
};
export function seeded(path: string, beforeCommit?: (point: string) => void) {
  const store = new CompanionStore(path, { now: () => 123, beforeCommit: beforeCommit ?? (() => {}) });
  store.seed(profile, conversation);
  return store;
}
