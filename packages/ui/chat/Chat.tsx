import { useEffect, useState } from "react";
import type { CompanionCommand, CompanionEvent, Hello, Snapshot, Welcome } from "../../contracts/companion";
import type { MessageView } from "../../contracts/common";
import { parseEvent } from "../../contracts/validation";

declare global {
  interface Window { companionHost: { connect(): void } }
}

export function Chat() {
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState("");
  const [transport, setTransport] = useState<{ port: MessagePort; welcome: Welcome; snapshot: Snapshot } | null>(null);
  useEffect(() => {
    let port: MessagePort | undefined;
    let welcome: Welcome | undefined;
    let seq = 0;
    const clientId = crypto.randomUUID();
    const receive = (event: CompanionEvent) => {
      if (event.kind === "state.snapshot" && welcome && port) {
        setTransport({ welcome, port, snapshot: event.body });
        setMessages(event.body.transcriptTail);
        setPending(Boolean(event.body.activeTurn));
      }
      if (event.kind === "command.result") {
        if (event.body.status === "accepted") setDraft("");
        else { setPending(false); setProblem(event.body.error?.message ?? "The input was rejected."); }
      }
      if (event.kind === "turn.started") {
        const { userMessage, assistantMessageId, turnId } = event.body;
        setMessages(previous => [...previous, userMessage, {
          id: assistantMessageId, turnId, role: "assistant", revision: 1, text: "",
          createdAtMs: userMessage.createdAtMs, status: "streaming",
        }]);
      }
      if (event.kind === "message.delta") {
        const delta = event.body;
        setMessages(previous => previous.map(message =>
          message.id === delta.messageId && message.revision === delta.fromRevision && message.text.length === delta.offsetUtf16
            ? { ...message, text: message.text + delta.textDelta, revision: delta.toRevision } : message));
      }
      if (event.kind === "message.final") {
        const final = event.body;
        setMessages(previous => previous.map(message => message.id === final.messageId
          ? { ...message, text: final.text, revision: final.revision, status: final.status } : message));
      }
      if (event.kind === "system.problem") setProblem(event.body.message);
      if (event.kind === "turn.finished") setPending(false);
    };
    const onHost = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin) return;
      if (event.data === "companion:lost") {
        setTransport(null);
        setProblem("The conversation process stopped. Restart Open Companion to recover your transcript.");
      }
      if (event.data !== "companion:port" || port || !event.ports[0]) return;
      port = event.ports[0];
      port.onmessage = ({ data }: MessageEvent) => {
        if (!welcome) {
          if (data.protocol !== "companion" || data.version !== 1 || data.clientId !== clientId) return;
          welcome = data as Welcome;
          return;
        }
        try {
          const frame = parseEvent(data);
          if (frame.sessionId !== welcome.sessionId || frame.eventSeq <= seq) return;
          if (frame.eventSeq !== seq + 1 && frame.kind !== "state.snapshot") {
            const sync: CompanionCommand = {
              protocol: "companion", version: 1, sessionId: welcome.sessionId, commandId: crypto.randomUUID(),
              kind: "sync.request", scope: { characterId: null, conversationId: null, expectedEpoch: null },
              body: { lastEventSeq: seq },
            };
            port?.postMessage(sync);
            return;
          }
          seq = frame.eventSeq;
          receive(frame);
        } catch {
          setProblem("The conversation received an invalid event.");
        }
      };
      const hello: Hello = { protocol: "companion", supportedVersions: [1], clientId, role: "owner_ui" };
      port.postMessage(hello);
    };
    window.addEventListener("message", onHost);
    window.companionHost.connect();
    return () => { window.removeEventListener("message", onHost); port?.close(); };
  }, []);

  return <main>
    <header><h1>Open Companion</h1><p>Offline mock conversation</p></header>
    <ol aria-label="Transcript" aria-live="polite">
      {messages.map(message => <li key={message.id} data-status={message.status}>
        <strong>{message.role === "user" ? "You" : "Companion"}</strong>
        <p>{message.text || (message.status === "streaming" ? "…" : "")}</p>
        {message.status === "interrupted" && <small>Interrupted</small>}
      </li>)}
    </ol>
    {problem && <p role="alert">{problem}</p>}
    <form onSubmit={event => {
      event.preventDefault();
      if (!transport || pending || !draft.trim() || !draft.isWellFormed()) return;
      const { port, welcome, snapshot } = transport;
      const command: CompanionCommand = {
        protocol: "companion", version: 1, sessionId: welcome.sessionId, commandId: crypto.randomUUID(),
        kind: "input.submit",
        scope: { characterId: snapshot.characterId, conversationId: snapshot.conversationId, expectedEpoch: snapshot.epoch },
        body: { text: draft, clientInputId: crypto.randomUUID(), source: "desktop_text" },
      };
      setProblem("");
      setPending(true);
      port.postMessage(command);
    }}>
      <label htmlFor="input">Message</label>
      <textarea id="input" value={draft} onChange={event => setDraft(event.target.value)} maxLength={16000} disabled={pending} />
      <button disabled={!transport || pending || !draft.trim()}>Send</button>
    </form>
  </main>;
}
