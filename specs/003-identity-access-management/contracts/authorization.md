# Authorization and Ownership Contract

## Purpose

Định nghĩa trust boundary mà Identity & Access Management cung cấp cho REST controllers hiện tại và future resource modules. Contract này không tạo template, invitation, order hoặc payment module.

## Canonical actors

| Actor | Persisted role | Meaning |
|-------|----------------|---------|
| Guest | none | Không có authenticated principal |
| Customer | `CUSTOMER` | Truy cập account và owned resources của chính mình |
| Admin | `ADMIN` | Chỉ dùng Admin capabilities được route/policy allowlist |

`PUBLIC`/`GUEST` không xuất hiện trong database hoặc Access Token role.

## Authenticated principal

Access-token guard tạo immutable request principal từ JWT đã verify:

```text
AuthenticatedPrincipal {
  userId: UUID        // JWT sub
  sessionId: UUID     // JWT sid
  role: CUSTOMER | ADMIN
  tokenId: UUID       // JWT jti
  issuedAt: instant
  expiresAt: instant
}
```

Không controller/service nào lấy principal, role hoặc ownership authority từ request body/query/path ngoài việc dùng path ID làm resource lookup. Email/profile claim không nằm trong token.

## Enforcement order

1. **Authentication**: verify signature, algorithm, `typ`, issuer, audience, expiry và required claims.
2. **Role authorization**: route metadata allowlist role; default protected route không tự cho ADMIN bypass ownership.
3. **Resource load**: repository lấy resource theo route identifier.
4. **Ownership/policy**: compare persisted owner key với `principal.userId`, hoặc chạy explicit Admin policy được route cho phép.
5. **Mutation**: service rechecks policy trong transaction nếu resource ownership/status có thể đổi giữa load và write.

Frontend role visibility chỉ là UX; backend luôn chạy đủ enforcement.

## Route capability matrix

| Capability | Guest | CUSTOMER | ADMIN |
|------------|-------|----------|-------|
| Public content/register/login/verification/reset/OAuth | Allowed by route | Allowed but no extra privilege | Allowed but no extra privilege |
| Refresh/logout current | Valid refresh session only | Same | Same |
| Own profile/change password/logout-all | No | Own account | Own account where applicable |
| Customer Admin list/detail/lock/unlock | No | No | Yes, target must CUSTOMER |
| Lock/unlock own or another ADMIN account | No | No | No |
| Future owned resource | No unless public | Owner only | Explicit resource policy only; no implicit bypass |

## Ownership port for future modules

Future module exposes a resource-specific lookup/policy; IAM exports principal and guard primitives, not generic `ownerId` trust.

**Current dependency status (US9):** no template, invitation, order or payment resource
module exists in the repository. US9 therefore validates the reusable policy contract and
the guards on existing IAM operations only. Each future resource feature must supply its
own persisted owner lookup and integration matrix before using this policy; frontend
`ownerId`/`userId` values are never an ownership source.

```text
OwnedResourcePolicy.authorize({
  principal,
  resourceId,
  action
}) -> allow | deny
```

Required behavior:

- Load `owner_user_id` from persisted resource, never from frontend-provided owner/user field.
- Return the same not-found/forbidden behavior selected by that resource contract to avoid cross-owner enumeration.
- Add integration cases: owner allowed, other CUSTOMER denied, forged ownerId ignored, Guest denied, ADMIN behavior explicitly defined.
- Do not create placeholder resource tables/controllers/tests before its feature exists.

## Admin Customer policy

- Principal role must be ADMIN from verified Access Token.
- Target is loaded from `users`; target role must CUSTOMER and target ID must differ from actor ID.
- Lock transaction changes ACTIVE→LOCKED, revokes all target sessions and appends audit.
- Unlock changes LOCKED→ACTIVE and appends audit; it never restores sessions.
- Every accepted lock/unlock includes an audit with requested action, previous/new status, request ID and CHANGED/NO_CHANGE outcome. Repeated requests still audit; lock ensures all refresh sessions revoked even on NO_CHANGE; audit failure rolls back the operation.
- No endpoint in this feature changes role, deletes account or edits Customer profile.

## Access-token revocation boundary

Authorization deliberately does not query session/user status for every normal Access Token request. Logout, password change/reset or account lock revokes Refresh Tokens immediately, while already-issued Access Tokens may pass authentication until their 15-minute expiry, matching the spec. Sensitive future features that require fresher status checks must add an explicit policy requirement rather than silently changing global token semantics.

## Failure contract

- Missing/invalid/expired Access Token: `401` safe Problem Details.
- Authenticated but role/ownership denied: `403` or resource-selected non-enumerating `404`.
- Never echo trusted role/userId/ownerId decision data from the rejected request.
- Logs contain request ID, route policy and safe result; no token, email, password, provider code or proof.
