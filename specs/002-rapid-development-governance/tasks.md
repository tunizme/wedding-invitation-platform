# Tasks: Rapid Development Governance

**Input**: Design documents from `/specs/002-rapid-development-governance/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/artifact-alignment.md`, `quickstart.md`

**Tests**: Feature không yêu cầu test code mới; mỗi story dùng static artifact validation và review criteria trong `quickstart.md`.

**Organization**: Tasks được nhóm theo user story để mỗi policy outcome có thể được triển khai và xác minh độc lập.

## Phase 1: Setup (Governance Baseline)

**Purpose**: Xác nhận source of truth và phạm vi trước khi sửa active artifacts.

- [X] T001 Rà soát artifact inventory, required outcomes và forbidden outcomes trong `specs/002-rapid-development-governance/contracts/artifact-alignment.md`
- [X] T002 Xác nhận constitution version 2.0.0, rapid-development optional protection, mandatory CI evidence và release triggers trong `.specify/memory/constitution.md`

**Verification command**:

```bash
rg -n "Version.*2\.0\.0|rulesets and merge protection MAY be omitted|Applicable CI checks MUST run|production delivery|release-ready" .specify/memory/constitution.md
```

---

## Phase 2: Foundational (Preserve Existing Evidence)

**Purpose**: Chốt baseline không được thay đổi bởi bất kỳ user story nào.

**⚠️ CRITICAL**: Hoàn tất phase này trước khi đồng bộ artifact để tránh vô tình làm yếu CI hoặc tạo false activation evidence.

- [X] T003 [P] Ghi nhận và xác minh bốn job names cùng read-only permissions trong `.github/workflows/ci.yml`
- [X] T004 [P] Xác minh `.github/rulesets/main.json` chỉ là desired-state template và không dùng file content làm bằng chứng active repository state

**Verification command**:

```bash
for job in frontend-checks backend-checks backend-integration full-stack-health; do rg -n "^  ${job}:" .github/workflows/ci.yml; done
rg -n "contents: read" .github/workflows/ci.yml
```

**Checkpoint**: Bốn CI jobs và dormant-template boundary đã được ghi nhận; user story work có thể bắt đầu.

---

## Phase 3: User Story 1 - Tiếp tục phát triển không bị chặn bởi Rulesets (Priority: P1) 🎯 MVP

**Goal**: Loại mọi assertion coi thiếu ruleset là completion blocker trong rapid development mà không tạo evidence giả rằng ruleset đã active.

**Independent Test**: Rà soát constitution và toàn bộ active Project Foundation artifacts; không artifact nào yêu cầu đổi visibility, mua hosting plan hoặc apply ruleset để feature được xem là hoàn tất.

- [X] T005 [P] [US1] Thay yêu cầu unconditional ruleset trong `specs/001-project-foundation/spec.md` bằng optional rapid-development protection, đồng thời giữ bốn CI results observable
- [X] T006 [P] [US1] Đồng bộ constitution version/gate evidence và optional enforcement trong `specs/001-project-foundation/plan.md`
- [X] T007 [US1] Giữ task IDs nhưng chuyển `T053` và `T063` sang deferred/superseded disposition không còn unchecked blocker; cập nhật Phase 5 goal, independent test và strategy trong `specs/001-project-foundation/tasks.md`
- [X] T008 [P] [US1] Xóa ruleset khỏi pending external completion gates và mô tả optional dormant template trong `specs/001-project-foundation/quickstart.md`
- [X] T009 [P] [US1] Đồng bộ ruleset requirement item với constitution v2.0.0 trong `specs/001-project-foundation/checklists/foundation.md`
- [X] T010 [P] [US1] Xóa ruleset khỏi Foundation completion blockers và mô tả future opt-in control trong `README.md`
- [X] T011 [US1] Chạy stale-blocker review theo `specs/002-rapid-development-governance/quickstart.md` trên `README.md`, `specs/001-project-foundation/spec.md`, `specs/001-project-foundation/plan.md`, `specs/001-project-foundation/tasks.md`, `specs/001-project-foundation/quickstart.md`, `specs/001-project-foundation/checklists/foundation.md`

**Checkpoint**: User Story 1 hoàn tất khi thiếu ruleset không còn chặn rapid-development completion và historical task disposition vẫn truthful.

---

## Phase 4: User Story 2 - Duy trì bằng chứng chất lượng từ CI (Priority: P2)

**Goal**: Giữ bốn independent CI results và no-deploy/no-publish boundary dù merge không bị chặn tự động.

**Independent Test**: `.github/workflows/ci.yml` vẫn có đủ bốn jobs, mỗi job báo failure domain riêng, permissions chỉ đọc và không có delivery action.

- [X] T012 [P] [US2] Viết lại current CI evidence và dormant optional ruleset guidance trong `docs/ci.md`, không hướng dẫn apply như completion step hiện tại
- [X] T013 [US2] Xác minh `frontend-checks`, `backend-checks`, `backend-integration`, `full-stack-health` cùng `contents: read` không đổi trong `.github/workflows/ci.yml`
- [X] T014 [US2] Xác minh không có deploy/publish step và cập nhật expected evidence wording trong `specs/002-rapid-development-governance/quickstart.md`

**Checkpoint**: User Story 2 hoàn tất khi CI quality evidence còn nguyên nhưng không bị mô tả sai là merge-blocking enforcement.

---

## Phase 5: User Story 3 - Biết thời điểm xem xét lại merge protection (Priority: P3)

**Goal**: Maintainer xác định rõ production-delivery/release-ready trigger và evidence cần có cho policy decision tương lai.

**Independent Test**: Reviewer chỉ dùng governance documentation có thể xác định trong dưới 2 phút hai triggers, hosting constraints và bốn bước approval/validation của policy tương lai.

- [X] T015 [US3] Bổ sung release-readiness re-evaluation section, triggers và future verification evidence vào `docs/ci.md` sau current rapid-development guidance
- [X] T016 [US3] Chạy timed policy lookup và ghi pass/fail review note trong `specs/002-rapid-development-governance/quickstart.md`

**Checkpoint**: User Story 3 hoàn tất khi rapid-development exception có milestone boundary rõ ràng nhưng chưa áp đặt provider-specific policy.

---

## Phase 6: Polish & Cross-Cutting Validation

**Purpose**: Khép alignment loop và xác minh không có scope creep hoặc collateral waiver.

- [X] T017 Cập nhật Sync Impact Report để ghi nhận Project Foundation alignment đã hoàn tất trong `.specify/memory/constitution.md`
- [X] T018 [P] Chạy toàn bộ static governance validation commands và ghi actual outcomes trong `specs/002-rapid-development-governance/quickstart.md`
- [X] T019 [P] Xác minh fresh-clone/onboarding obligations `T061`, `T064`, `T065`, `SC-001`, `SC-003`, `SC-005` không bị waive trong `specs/001-project-foundation/`
- [X] T020 [P] Chạy scope guard để xác nhận không có application/provider implementation ngoài phạm vi bằng `scripts/scope-check.mjs`
- [X] T021 Hoàn tất cross-artifact review theo `specs/002-rapid-development-governance/contracts/artifact-alignment.md` và xác nhận mọi record đạt state `verified`

**Verification command**:

```bash
pnpm scope:check
rg -n "^- \[ \] T(053|063)" specs/001-project-foundation/tasks.md
for job in frontend-checks backend-checks backend-integration full-stack-health; do rg -n "^  ${job}:" .github/workflows/ci.yml; done
rg -n "T061|T064|T065|SC-001|SC-003|SC-005" specs/001-project-foundation
```

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: Không có dependency.
- **Phase 2 Foundational**: Phụ thuộc Phase 1 và block mọi user story.
- **US1 (Phase 3)**: Bắt đầu sau Phase 2; là MVP và source-of-truth alignment chính.
- **US2 (Phase 4)**: Bắt đầu sau Phase 2; có thể làm song song với US1 nếu tránh file overlap.
- **US3 (Phase 5)**: Bắt đầu sau T012 vì cùng cập nhật `docs/ci.md`; independently testable bằng timed lookup.
- **Phase 6 Polish**: Phụ thuộc các user stories được chọn hoàn tất; full completion cần cả US1–US3.

### User Story Dependency Graph

```text
Setup → Foundational ─┬─→ US1: Remove rapid-development ruleset blocker (MVP)
                      └─→ US2: Preserve CI evidence ─→ US3: Define release trigger
US1 + US2 + US3 → Cross-artifact validation
```

### Parallel Opportunities

- T003 và T004 có thể chạy song song vì chỉ đọc hai file khác nhau.
- T005, T006, T008, T009 và T010 có thể chạy song song; T007/T011 chạy sau để tránh conflict và validate kết quả tổng hợp.
- US1 và US2 có thể triển khai song song ngoại trừ final stale-text review.
- T018, T019 và T020 có thể chạy song song sau khi story edits hoàn tất.

---

## Parallel Example: User Story 1

```text
Task T005: Update specs/001-project-foundation/spec.md
Task T006: Update specs/001-project-foundation/plan.md
Task T008: Update specs/001-project-foundation/quickstart.md
Task T009: Update specs/001-project-foundation/checklists/foundation.md
Task T010: Update README.md
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Hoàn tất Setup và Foundational baseline.
2. Đồng bộ Project Foundation artifacts trong US1.
3. Dừng và chạy stale-blocker review.
4. Foundation không còn bị ruleset chặn, nhưng fresh-clone/onboarding gates vẫn giữ nguyên.

### Incremental Delivery

1. US1 loại ruleset completion blocker.
2. US2 làm rõ CI evidence và dormant template.
3. US3 thêm release-readiness re-evaluation boundary.
4. Polish xác minh scope, traceability và không waive unrelated gates.

### File Coordination

- Chỉ một task tại một thời điểm sửa `specs/001-project-foundation/tasks.md`.
- T015 chạy sau T012 vì cùng sửa `docs/ci.md`.
- T017 chạy cuối vì Sync Impact Report chỉ được đóng sau khi alignment thực sự hoàn tất.

## Notes

- `[P]` chỉ dùng khi task thao tác file khác nhau hoặc read-only validation độc lập.
- Không gọi GitHub API, không đổi visibility/hosting plan và không apply ruleset.
- Không đánh dấu ruleset là active nếu không có external evidence.
- Không sửa application code, CI job implementation hoặc onboarding results.
- Có thể commit theo từng user story hoặc một logical documentation batch sau khi verification pass.
