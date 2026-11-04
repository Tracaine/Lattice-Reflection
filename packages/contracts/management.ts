/** INT-003/006/007/010/011. Owner-only management RPC; not a companion event payload. */
import type { Id, ChannelKind, MessageView, PublicError } from "./common";
import type { ProviderConnection, ModelProfile, RouteBinding } from "./inference";
import type { AvatarManifest, AvatarCapabilities } from "./avatar-speech";
import type { BackendConnection } from "./backend";

export type Result<T> = { ok: true; value: T } | { ok: false; error: PublicError };
export interface CharacterProfile {
  id: Id;
  revision: number;
  name: string;
  biography: string;
  instructions: string;
  language: string;
  avatarId: Id;
  voiceBindingId: Id | null;
}
export interface MemoryRecord {
  id: Id;
  revision: number;
  characterId: Id;
  text: string;
  status: "proposed" | "active" | "rejected" | "superseded" | "deleted";
  origin: "user_authored" | "user_reported" | "model_proposed" | "imported";
  sourceMessageIds: Id[];
  visibility: { channelKinds: ChannelKind[]; channelIds: Id[] };
  pinned: boolean;
  confidence: number | null;
  createdAtMs: number;
  updatedAtMs: number;
}
export interface VoiceBinding {
  id: Id;
  revision: number;
  label: string;
  kind: "mock-speech" | "openai-audio" | "external-audio";
  connectionId: Id | null; // Separate speech connection, never an inferred LLM connection.
  ttsModelId: string | null;
  sttModelId: string | null;
  voiceId: string | null;
  language: string | null;
}
export interface SpeechConnection {
  id: Id;
  revision: number;
  label: string;
  kind: "openai-audio";
  baseUrl: string;
  enabled: boolean;
  auth: { kind: "bearer"; secretRef: Id };
}
export interface ConversationSummary {
  id: Id;
  revision: number;
  characterId: Id;
  channelId: Id;
  title: string;
  updatedAtMs: number;
  archived: boolean;
}
export interface SeedConfiguration {
  schemaVersion: 1;
  connections: ProviderConnection[];
  modelProfiles: ModelProfile[];
  routeBindings: RouteBinding[];
  speechConnections: SpeechConnection[];
  voiceBindings: VoiceBinding[];
  characters: CharacterProfile[];
  channels: Array<{ id: Id; kind: ChannelKind; label: string }>;
}
export interface OwnerManagementApi {
  listCharacters(): Promise<Result<CharacterProfile[]>>;
  putCharacter(input: CharacterProfile, expectedRevision: number | null, commandId: Id): Promise<Result<CharacterProfile>>;
  deleteCharacter(id: Id, expectedRevision: number, commandId: Id): Promise<Result<{ deleted: true }>>;
  listConversations(input: { characterId: Id; channelId: Id | null; beforeUpdatedAtMs: number | null; beforeId: Id | null; limit: number }): Promise<Result<{ conversations: ConversationSummary[]; next: { updatedAtMs: number; id: Id } | null }>>;
  createConversation(input: { characterId: Id; channelId: Id; title: string }, commandId: Id): Promise<Result<ConversationSummary>>;
  deleteConversation(id: Id, expectedRevision: number, commandId: Id): Promise<Result<{ deleted: true }>>;
  getHistory(input: { characterId: Id; conversationId: Id; beforeOrdinal: number | null; limit: number; search: string | null }): Promise<Result<{ messages: MessageView[]; nextBeforeOrdinal: number | null }>>;
  getMemories(input: { characterId: Id; includeProposed: boolean; afterId: Id | null; limit: number }): Promise<Result<{ records: MemoryRecord[]; nextAfterId: Id | null }>>;
  putMemory(record: MemoryRecord, expectedRevision: number | null, commandId: Id): Promise<Result<MemoryRecord>>;
  deleteMemory(id: Id, expectedRevision: number, commandId: Id): Promise<Result<{ deleted: true }>>;
  requestDiary(input: { characterId: Id; conversationId: Id; fromOrdinal: number; toOrdinal: number }, commandId: Id): Promise<Result<{ proposalId: Id }>>;
  listConnections(): Promise<Result<ProviderConnection[]>>;
  listModelProfiles(): Promise<Result<ModelProfile[]>>;
  listRoutes(): Promise<Result<RouteBinding[]>>;
  putConnection(input: ProviderConnection, expectedRevision: number | null, commandId: Id): Promise<Result<ProviderConnection>>;
  putModelProfile(input: ModelProfile, expectedRevision: number | null, commandId: Id): Promise<Result<ModelProfile>>;
  putRoute(input: RouteBinding, expectedRevision: number | null, commandId: Id): Promise<Result<RouteBinding>>;
  testConnection(connectionId: Id): Promise<Result<{ reachable: boolean; models: Array<{ id: string; label: string }> }>>;
  openCredentialEditor(connectionId: Id): Promise<Result<{ configured: boolean }>>;
  listSpeechConnections(): Promise<Result<SpeechConnection[]>>;
  putSpeechConnection(input: SpeechConnection, expectedRevision: number | null, commandId: Id): Promise<Result<SpeechConnection>>;
  listVoiceBindings(): Promise<Result<VoiceBinding[]>>;
  putVoiceBinding(input: VoiceBinding, expectedRevision: number | null, commandId: Id): Promise<Result<VoiceBinding>>;
  listBackendConnections(): Promise<Result<BackendConnection[]>>;
  putBackendConnection(input: BackendConnection, expectedRevision: number | null, commandId: Id): Promise<Result<BackendConnection>>;
  setConversationBackend(input: { conversationId: Id; backendConnectionId: Id | null; expectedRevision: number }, commandId: Id): Promise<Result<ConversationSummary>>;
  importAvatarFromPicker(): Promise<Result<{ manifest: AvatarManifest; capabilities: AvatarCapabilities; warnings: string[] }>>;
  getAvatarManifest(avatarId: Id): Promise<Result<AvatarManifest>>;
  exportData(input: { characterIds: Id[]; includeAvatarAssets: boolean }): Promise<Result<{ exportId: Id }>>;
  backup(): Promise<Result<{ backupId: Id }>>;
  restoreFromPicker(): Promise<Result<{ restartRequired: true }>>;
}
// Every operation is main-process-authorized to an owner UI identity and validated again in the broker.
// File paths and secret values are collected by dedicated host flows, not returned to the stage UI.
