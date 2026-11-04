import { createRoot } from "react-dom/client";
import { Chat } from "../../../packages/ui/chat/Chat";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(<Chat />);
