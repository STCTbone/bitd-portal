# Enforce campaign access and GM confidentiality on the backend

Players join without email accounts, while a separate secret invitation grants GM access. We choose backend-enforced campaign roles, character ownership, and GM-only visibility over the upstream's client-claimed seats and interface-only hiding: a player must not receive hidden notes, clocks, or media through reads or realtime events, nor gain GM write authority by changing browser state. This adds identity and authorization work but preserves the low-friction table experience while making GM privacy a reliable product behavior.

The 2026-10-21 request adds recoverable Google accounts alongside existing guests; see [ADR 0005](0005-recoverable-google-identities.md). Google identifies the participant, while these campaign authority rules remain unchanged.
