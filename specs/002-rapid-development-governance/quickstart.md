# Quickstart Validation: Rapid Development Governance

Guide này xác minh governance alignment; không apply repository settings và không thay đổi
application runtime.

## Prerequisites

- Repository checkout có constitution v2.0.0 và artifacts của feature 001/002.
- `rg` để chạy static consistency checks.

## Validate constitution policy

```bash
rg -n "Version.*2\.0\.0|rulesets and merge protection MAY be omitted|Applicable CI checks MUST run" \
  .specify/memory/constitution.md
```

Expected: version 2.0.0, optional rapid-development protection và mandatory CI evidence đều xuất
hiện; production/release-ready trigger được mô tả trong cùng document.

## Validate stale blockers are removed

Review các path trong [artifact alignment contract](./contracts/artifact-alignment.md), rồi chạy:

```bash
rg -n "^- \[ \] T(053|063)" specs/001-project-foundation/tasks.md
rg -n -i "ruleset.*(completion blocker|hoàn tất)|từ chối merge|chặn merge" \
  README.md docs/ci.md specs/001-project-foundation
```

Expected: command đầu không có output. Command sau không tìm thấy assertion bắt buộc trong active
rapid-development policy; future release-readiness wording hoặc historical disposition phải được
review theo context, không tính là stale blocker.

## Validate CI evidence remains intact

```bash
for job in frontend-checks backend-checks backend-integration full-stack-health; do
  rg -n "^  ${job}:" .github/workflows/ci.yml
done
rg -n "contents: read" .github/workflows/ci.yml
rg -n -i "deploy|publish" .github/workflows/ci.yml
```

Expected: cả bốn jobs và read-only contents permission được tìm thấy; search deploy/publish không có
output vì workflow chỉ validation. Mỗi job vẫn cung cấp một kết quả độc lập; chúng không được mô tả
là merge-blocking enforcement. `.github/rulesets/main.json` vẫn là optional dormant template, không
phải active-state proof.

## Validate unrelated gates remain truthful

```bash
rg -n "T061|T064|T065|SC-001|SC-003|SC-005" specs/001-project-foundation
```

Expected: fresh-clone và five-developer onboarding obligations vẫn hiện diện và không bị đánh dấu
pass nếu chưa có evidence thật.

## Timed policy lookup

Đưa constitution cho một maintainer và bắt đầu timer. Maintainer phải xác định trong dưới 2 phút:

- rulesets/merge protection là optional trong rapid development;
- CI evidence vẫn bắt buộc;
- production delivery hoặc release-ready kích hoạt một approved policy decision mới.

Ghi pass/fail trong review notes của feature; không tạo giả GitHub API evidence.

### Review note — 2026-09-26

**PASS** — Static maintainer lookup trong `docs/ci.md` hoàn tất trong `0.00s`, thấp hơn giới hạn 2
phút. Kết quả tìm thấy cả `production delivery` và `release-ready`, hosting/visibility constraints,
owner approval và failing-check verification. Đây là document lookup evidence, không phải bằng chứng
GitHub Ruleset đang active.

## Actual validation — 2026-09-26

| Check | Outcome | Evidence |
|---|---|---|
| Constitution policy | PASS | Version `2.0.0`, optional rapid-development rulesets, mandatory CI và release triggers đều hiện diện. |
| Stale blockers | PASS | Không còn open `T053`/`T063`; không tìm thấy các mandatory-ruleset assertion cũ trong active artifacts. |
| CI job identity | PASS | Tìm thấy `frontend-checks`, `backend-checks`, `backend-integration`, `full-stack-health` và `contents: read`. |
| Delivery boundary | PASS | Không tìm thấy `deploy` hoặc `publish` trong `.github/workflows/ci.yml`. |
| Unrelated obligations | PASS | `T061`, `T064`, `T065`, `SC-001`, `SC-003`, `SC-005` vẫn hiện diện và chưa bị waive. |
| Scope guard | PASS | `pnpm scope:check` trả về `Scope check passed.` |

Các kết quả trên chỉ xác minh governance artifacts. `T061`, `T064` và `T065` của Project Foundation
vẫn là external validation work chưa hoàn tất.

## Known limitation

Branch-name alignment giữa local repository và CI push target là repository setup concern riêng.
Feature này không rename branch, đổi visibility, nâng hosting plan hoặc gọi GitHub API.
