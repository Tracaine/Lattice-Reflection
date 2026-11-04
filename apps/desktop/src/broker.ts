import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import seed from "../../../examples/mock-configuration.json";
import type { SeedConfiguration } from "../../../packages/contracts/management";
import type { ResolvedBinding } from "../../../packages/contracts/inference";
import type { Welcome } from "../../../packages/contracts/companion";
import { CompanionStore } from "../../../packages/storage";
import { MockSession } from "../../../packages/core/session";

const config = seed as SeedConfiguration;
const path = process.argv[2];
if (!path) throw new Error("Database location missing");
mkdirSync(dirname(path), { recursive: true });
const store = new CompanionStore(path);
const channel = config.channels.find(channel => channel.kind === "desktop");
const profile = config.characters[0];
if (!channel || !profile) throw new Error("Desktop seed incomplete");
const conversations = config.characters.map((character, index) => {
  const id = `10000000-0000-4000-8000-${String(71 + index).padStart(12, "0")}`;
  const conversation = { id, channelId: channel.id, title: character.name };
  store.seed(character, conversation);
  return conversation;
});
const conversation = conversations[0];
const route = config.routeBindings.find(route => route.scope.kind === "application" && route.role === "dialogue");
const binding = route?.binding;
const model = config.modelProfiles.find(profile => binding?.mode === "model" && profile.id === binding.profileId);
const connection = config.connections.find(connection => connection.id === model?.connectionId && connection.kind === "mock");
if (!conversation || !profile || !route || binding?.mode !== "model" || !model || !connection) throw new Error("Offline seed incomplete");

const resolved: ResolvedBinding = {
  selectionId: randomUUID(), role: "dialogue", sourceScope: route.scope, sourceRouteId: route.id,
  sourceRouteRevision: route.revision, connection, profile: model, parameters: binding, resolvedAtMs: Date.now(),
};
const hello = z.strictObject({
  protocol: z.literal("companion"), supportedVersions: z.tuple([z.literal(1)]),
  clientId: z.uuidv4(), role: z.literal("owner_ui"),
});
process.parentPort.on("message", event => {
  const port = event.ports[0];
  if (event.data !== "connect" || !port) return;
  const session = new MockSession(store, {
    characterId: profile.id, conversationId: conversation.id, channelId: conversation.channelId, avatarId: profile.avatarId,
  }, resolved, message => port.postMessage(message));
  let ready = false;
  port.on("message", message => {
    if (ready) {
      void session.receive(message.data);
      return;
    }
    const result = hello.safeParse(message.data);
    if (!result.success) { port.close(); return; }
    ready = true;
    const welcome: Welcome = {
      protocol: "companion", version: 1, sessionId: session.sessionId,
      clientId: result.data.clientId, heartbeatMs: 500, maximumControlBytes: 262144,
    };
    port.postMessage(welcome);
    session.snapshot();
  });
  port.start();
});
