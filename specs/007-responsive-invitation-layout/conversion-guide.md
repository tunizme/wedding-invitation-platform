# Manual conversion to sections

Admin creates a separate template with “Sections responsive”; the original canvas and its published revisions stay immutable. In the new section editor choose “Mẫu cũ”, load the authorized source, select each piece of content and explicitly add it to the selected section. Text, appearance, existing bindings and image asset identities can be reused. Canvas x/y/width/height never determine section order or geometry.

Compose sections in reading order, choose stack or grid, and review mobile/desktop padding, typography and artwork. Image flow requires meaningful alt text and an explicit aspect ratio. Decorations remain clipped and hidden from assistive technology. Sample data stays WeddingData1; no album or audio fields are introduced. Use the existing asset library to select/upload authorized template assets.

Save and reload the new draft, review390/900 previews, then publish through the same readiness/overflow/state validation as other v2 templates. Publication creates a new revision for the new template. Existing invitations remain pinned to the original revision; moving them is a separate explicit product action, never part of this conversion.

The required authoring browser suite exercises the source/re-author/save/publish/pinning workflow with synthetic owned actors/assets on Chromium, Firefox and WebKit. The gate fails if it mutates the source document or old invitation pin. Nothing seeds a default Customer catalog or deploys these fixtures.
