# Change Log

All notable changes to the "atif-visualizer" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [0.5.0] - 2026-05-15

### Added

- Support for ATIF v1.7 features:
  - `trajectory_id` display in header and tab labels
  - `subagent_trajectories` — embedded subagent trajectories render as tabs alongside top-level entries
  - Subagent ref resolution via `trajectory_id` (embedded) and `trajectory_path` (file-ref)
  - `llm_call_count` badge — shows "deterministic" for `0`, "N LLM calls" for aggregated steps
  - `is_copied_context` — dims steps and shows "copied context" badge
  - `extra` metadata on tool calls and observation results
  - ATIF version shown in trajectory header

### Changed

- `session_id` is no longer required for ATIF detection; files with only `trajectory_id` are accepted
- Subagent reference resolution prefers `trajectory_id` over `session_id`
- Updated sample trajectory to ATIF v1.7 format

## [0.4.2] - 2026-05-04

### Changed

- Renamed extension to ATIF Preview

## [0.4.1] - 2026-05-01

### Changed

- Use distinct icon for trajectory preview

## [0.4.0] - 2026-04-29

### Added

- Copy-to-clipboard buttons for tool call arguments and results

## [0.3.0] - 2026-04-23

- Detect and visualize skill usage from tool calls reading files under known Agent Skills locations (`.github/skills/`, `.claude/skills/`, `.agents/skills/`, `.copilot/skills/`)

## [0.2.0] - 2026-04-23

- Support multiple preview panels for comparing trajectories side by side

## [0.1.1] - 2026-04-23

- Fix ATIF links in README

## [0.1.0] - 2026-04-23

- Initial release