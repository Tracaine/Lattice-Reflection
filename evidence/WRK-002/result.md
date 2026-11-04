# WRK-002 verification

Base revision `180a83423af7258dc720d765daf778ba6e0fa835`. This report ships in the tested storage commit.

On Linux x64, Node 24.22.1 ABI 137 loaded better-sqlite3 12.10.0. Frozen install, typecheck, import boundaries and all 15 tests passed (8 storage, 7 contracts).

Four child-process tests reached SIGKILL before and after the acceptance/checkpoint commit. Reopen recovered exactly one accepted input and only the committed text. Recovery marked unfinished output interrupted. The initial test worker could not strip a TypeScript parameter property, which was corrected before rerunning all cases.

Other storage checks covered command replay/conflict, scope mismatch and deletion, revision conflict, initial migration rollback, and reopening a live WAL backup with the same transcript, receipts, outbox and recognized migration checksum.

Packaged Electron/Windows loading remains pending. Retention, scheduled backup rotation and restore UI are later work.
