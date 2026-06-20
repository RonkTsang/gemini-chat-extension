# Promo Image Workflow

## Fixed Spec

- Final path: `src/assets/whatsnew/<feature-slug>.webp`
- Final size: `750x180`
- Source generation size: prefer `1500x360` or larger at the same `25:6` ratio, then downsample.
- Format: WebP, sRGB, target under 120 KB.
- Display context: `WhatsNewToast` renders the image about 60 px tall, so use one primary visual signal only.

## Decision Tree

This workflow has a mandatory confirmation gate. Do not process, resize, save, regenerate, or create any image until the user confirms the image plan.

If the user has no input image:

1. Ask: "Do you need a What's New promo image for this update?"
2. If no, summarize `Image plan: no image` and wait for approval before continuing.
3. If yes, propose image concepts, ask the user to choose one, then summarize the selected concept and wait for approval before generation.

If the user has an input image:

1. Ask whether to use it directly or regenerate from it.
2. Direct use: summarize `Image plan: use provided image directly`, include the expected `750x180` validation/crop step, and wait for approval before inspecting or editing the image.
3. Regenerate: treat the image as a reference, confirm the visual type and content proposal, and wait for approval before using `imagegen`.

Use this confirmation format:

```text
Image plan: <no image | use provided image directly | regenerate from provided image | generate new image>
Visual type: <only when relevant>
Content proposal: <one concise sentence>
Asset handling: <where it will be saved or that no asset will be created>
Please confirm this image plan before I continue.
```

## Visual Types

Use these categories when asking the user to choose a direction:

1. Single object close-up: one clear object such as a notification card, palette control, or export item.
2. Abstract feature icon plus minimal state: one icon-level symbol with 1-2 faint UI hints.
3. Local UI crop: a small real product section, such as sliders, toggles, or one panel row.
4. Before/after comparison: two simple states only; avoid when both sides need text.
5. Brand atmosphere plus one functional symbol: a quiet background with one functional signal.

For tiny banners, prefer type 1 or type 3 when a real UI reference exists. Prefer type 2 or type 5 when there is no real UI reference.

## Composition Rules

- Use one focal subject.
- Keep the focal subject large enough to read at 60 px tall.
- Do not put explanatory text, long labels, version numbers, arrows, stickers, or marketing badges inside the image.
- Blur, mask, or replace private chat content.
- Avoid full-page screenshots unless the feature is page-level and still readable after downscaling.
- The image should identify the feature category in one glance; the copy explains the details.

## Imagegen Prompt Shape

Before calling imagegen, confirm a short proposal with the user and wait for approval:

```text
Visual type: <one of the five types>
Primary signal: <one object/state the image should communicate>
Value conveyed: <what the user understands at first glance>
Composition: <where the focal subject sits>
Avoid: <text, arrows, dense UI, private content, logos if risky>
```

Then use a prompt shaped like:

```text
Use case: ui-mockup
Asset type: Gemini Power Kit What's New 750x180 promo banner
Primary request: <specific image idea>
Style/medium: polished product UI preview, calm and practical
Composition/framing: 25:6 horizontal banner, one large focal subject, readable at 60 px height
Constraints: no promotional text, no arrows, no badges, no private content, no watermark
Output intent: final asset will be saved as WebP at 750x180
```

After generation, inspect the output. If it is too dense, iterate by removing elements rather than adding labels.
