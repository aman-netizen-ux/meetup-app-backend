# Project guide for coding agents

Before implementing a feature, read `HANDOFF.md`, `TASKS.md`, and `docs/meetup-app-mvp-scope.md`. The scope is product reference material; follow the current user's request for what to work on. Check `git status` and preserve existing work. Update the task status and handoff after completing a task, including verification results and cross-repo API changes. The Flutter client is maintained in the separate [meetup-app-frontend](https://github.com/aman-netizen-ux/meetup-app-frontend) repository.

Follow `ARCHITECTURE.md`: one class per file; separate domain, application, presentation routes, and infrastructure; keep SQL out of routes and business policies.

After implementing a task, explain to the user what changed, how the main backend concept works, why that design was chosen, and how it was verified. Carry this explanation preference into future chats.
