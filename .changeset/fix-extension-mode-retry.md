---
"@actionbookdev/cli": patch
---

Fix extension mode connectivity and harden bridge security:

- Unify extension commands through `ExtensionBackend` with 30-second connection retry, fixing immediate "Extension not connected" failure when Chrome extension needs 2-6s to connect via Native Messaging
- Restrict extension bridge auth to exact Actionbook extension ID (`native_messaging::EXTENSION_ID`), preventing other Chrome extensions from impersonating the bridge client
- Harden extension bridge against spoofing and PID race conditions
- Fix extension disconnect race, PID overflow guard, and bridge port constant
- Resolve PID lifecycle, SIGKILL safety, mode priority, and config preservation bugs
- Restore extension mode end-to-end pipeline and v0.7.5 setup wizard compatibility
