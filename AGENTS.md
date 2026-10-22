# easton-duals: map for agents

Read `CLAUDE.md` for the conventions and `docs/design.md` for the rationale by component. The rules live in the coherence specs: `easton-duals.spec.md` at the root and one `*.spec.md` in each component folder.

| Component | Folder | Spec |
| --- | --- | --- |
| Easton Duals | `.` | `easton-duals.spec.md` |
| Audit and certification | `server/src/audit` | `server/src/audit/audit.spec.md` |
| Auth | `server/src/auth` | `server/src/auth/auth.spec.md` |
| Database | `server/src/db` | `server/src/db/db.spec.md` |
| Divisions and formats | `server/src/formats` | `server/src/formats/formats.spec.md` |
| Live snapshot and mat binding | `server/src/live` | `server/src/live/live.spec.md` |
| Match state machine | `server/src/match` | `server/src/match/match.spec.md` |
| Matchmaker | `server/src/matchmaker` | `server/src/matchmaker/matchmaker.spec.md` |
| Roster | `server/src/roster` | `server/src/roster/roster.spec.md` |
| Routes | `server/src/routes` | `server/src/routes/routes.spec.md` |
| Running order | `server/src/schedule` | `server/src/schedule/schedule.spec.md` |
| Shared rules | `server/src/shared` | `server/src/shared/shared.spec.md` |
| Smoothcomp standings | `server/src/smoothcomp` | `server/src/smoothcomp/smoothcomp.spec.md` |
| Console, scorer and board | `web/src` | `web/src/web.spec.md` |

`npx --no -- coherence spec --check` lists every invariant with its state. `npx --no -- coherence query status` lists the structural defects and the open requirements.
