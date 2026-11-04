import { createRoot } from "react-dom/client";
import { Chat } from "../../../packages/ui/chat/Chat";

import { Stage } from "../../../packages/ui/stage/Stage";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(<div className="desktop-layout"><Stage /><Chat /></div>);
