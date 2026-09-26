# Implementation Plan: Rapid Development Governance

**Branch**: `002-rapid-development-governance` | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-rapid-development-governance/spec.md`

## Summary

Đồng bộ constitution v2.0.0 với toàn bộ artifact active của Project Foundation để GitHub Rulesets
và automated merge blocking không còn là completion gate trong rapid development. Implementation
chỉ sửa governance/documentation artifacts, giữ nguyên bốn CI jobs và giữ
`.github/rulesets/main.json` như template dormant cho một quyết định release-readiness sau này.

## Technical Context

**Language/Version**: Markdown, YAML và JSON trong repository hiện có; không thay đổi TypeScript hoặc runtime application

**Primary Dependencies**: Spec Kit artifacts, constitution v2.0.0, GitHub Actions workflow hiện có và optional ruleset template

**Storage**: N/A; không có persisted application data hoặc schema change

**Testing**: Static artifact-consistency checks bằng repository search, kiểm tra bốn CI job names, scope check và review documentation contracts

**Target Platform**: Repository governance và developer documentation trên GitHub; không thay đổi runtime platform

**Project Type**: Documentation/governance amendment trong web application monorepo hiện có

**Performance Goals**: Maintainer xác định được release-readiness trigger trong dưới 2 phút; 100% active artifacts không còn xem thiếu ruleset là rapid-development blocker

**Constraints**: Không apply/verify GitHub Rulesets; không đổi repository visibility hoặc hosting plan; không sửa application behavior; không xóa/đổi tên bốn CI jobs; không thêm deploy hoặc publish

**Scale/Scope**: Constitution và bảy active Foundation artifacts được đồng bộ; một CI workflow và một ruleset template chỉ được verify, không thay đổi behavior

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

Constitution v2.0.0 là governance authority. Feature này trực tiếp hoàn tất follow-up alignment được
ghi trong Sync Impact Report.

| Gate | Pre-Research | Post-Design | Evidence |
|------|--------------|-------------|----------|
| Scope discipline | PASS | PASS | Chỉ governance/docs artifacts; không application code hoặc provider operation |
| Independent application boundaries | PASS | PASS | Frontend/backend source, build và deploy boundaries không đổi |
| Reproducible developer experience | PASS | PASS | Local workflows và onboarding requirements được giữ nguyên |
| Explicit database evolution | PASS | PASS | Không schema hoặc migration change |
| Verifiable quality evidence | PASS | PASS | Bốn CI jobs được giữ nguyên và tiếp tục báo pass/fail độc lập |
| Optional rapid-development protection | PASS | PASS | Không apply ruleset; artifacts mô tả đúng trạng thái optional/dormant |
| Release-readiness trigger | PASS | PASS | Production delivery hoặc release-ready bắt buộc mở quyết định protection riêng |
| No unauthorized delivery | PASS | PASS | Không deploy, publish hoặc đổi repository visibility/plan |

Không có constitution violation, complexity exception hoặc unresolved clarification.

## Project Structure

### Documentation (this feature)

```text
specs/002-rapid-development-governance/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── artifact-alignment.md
└── tasks.md                 # Created later by $speckit-tasks
```

### Repository Artifacts in Scope

```text
.
├── .specify/memory/constitution.md
├── .github/
│   ├── workflows/ci.yml                 # verify only; preserve four jobs
│   └── rulesets/main.json                # retain as dormant optional template
├── README.md
├── docs/ci.md
└── specs/001-project-foundation/
    ├── spec.md
    ├── plan.md
    ├── tasks.md
    ├── quickstart.md
    └── checklists/foundation.md
```

**Structure Decision**: Đây là documentation-only change. Implementation cập nhật các assertion
đang mâu thuẫn với constitution v2.0.0, giữ task IDs cũ bằng disposition `deferred/superseded`, và
không sửa `apps/`, `scripts/`, `compose.yaml`, CI job implementation hoặc repository settings.

## Phase 0: Research Decisions

Research được tổng hợp trong [research.md](./research.md). Không còn `NEEDS CLARIFICATION`.

## Phase 1: Design Decisions

- Dùng logical governance model trong [data-model.md](./data-model.md); không có persistence mới.
- Dùng [artifact-alignment contract](./contracts/artifact-alignment.md) làm source of truth cho file,
  assertion và disposition cần đồng bộ.
- Dùng [quickstart.md](./quickstart.md) để xác minh stale blockers đã biến mất, CI evidence còn nguyên
  và release trigger có thể tìm thấy.
- Không tạo API/UI contract vì feature không expose runtime interface.

## Known Risks

- Project Foundation vẫn còn fresh-clone và five-developer onboarding gates không liên quan đến
  rulesets; feature này không được phép waive hoặc giả lập chúng.
- Local branch hiện có thể chưa trùng `main`; đây là repository initialization concern, không được
  sửa ngầm trong documentation-only feature.
- `.github/rulesets/main.json` chứa desired-state `enforcement: active`; documentation phải nói rõ
  file này không phải bằng chứng ruleset đang active.
