# Quick Follow-up website media and validation notes

The walkthrough is implemented in both website feature pages. English and Chinese share the same screenshots and separate editing clips.

## Capture evidence

A GPT-6.1 Terra sub-agent used Computer with the real ronkSG Chrome profile, a temporary Gemini chat, and Gemini Auto. It generated a morning-routine answer, selected two passages, added separate comments, sent them together, and confirmed Gemini answered both questions. It also captured the Command-held Send state without sending that extra draft; Command was released afterward. No page content or controls were fabricated.

## Screenshot plan

Paths are relative to `website/src/assets/features/quick-follow-up/`.

| Role | File | What the caption explains |
| --- | --- | --- |
| Entry | `quick-follow-up.gif` | Select a passage and click Ask Gemini. Existing exact entry demo. |
| Feature panel | `instant-comment.jpg` | Ask opens the immediate comment field beside the source; the checkmark adds without sending. |
| Feature panel | `quick-comment-send.jpg` | On macOS, holding Command changes the checkmark to the Send arrow; Windows/Linux uses Ctrl. |
| Feature panel | `multiple-comment-cards.jpg` | Two selected passages keep their own comments in separate numbered draft cards. |
| Result | `sent-follow-up-conversation.jpg` | Sent reference cards and comments remain in the conversation, followed by Gemini's answer. |
| Settings | `custom-prompt.png` | Skill name, icon, and Selected Text placeholder in the saved-prompt form. Existing screenshot. |

## Editing video split

Both clips come from the user's existing `Cap 2026-10-26 at 00.28.51.gif` (1020×720, 13.92 seconds), without new editing recordings.

- `website/public/videos/quick-follow-up-edit-from-card.mp4`: source 0–10 seconds; card hover, edit icon, source highlighting, comment editing, and Save. Feature-panel role.
- `website/public/videos/quick-follow-up-edit-from-marker.mp4`: source 10–13.92 seconds; marker hover highlights the source, marker click opens editing, then Save. Feature-panel role.
- Each clip has a matching `-poster.jpg` beside it and its own controls, accessible description, and visible caption. No autoplay; video loads on demand.

## Behavior sources

`QuickComment.tsx`, `controller.ts`, `cards.ts`, `SelectionMarkers.tsx`, settings components/store, and lifecycle tests were checked. Existing-comment edits use Save / Cancel. Only new comments use the Add / modifier-Send button. Draft cards are limited to 10; drafts are conversation-specific and not restored after refresh. This documentation update does not add a new marker setting or change extension code.

## Validation

- Astro build and `git diff --check` passed.
- Both languages render the entry GIF, five focused screenshot figures, and two videos; all referenced media files exist in the built site.
- Canonical URLs, Open Graph/Twitter images, TechArticle JSON-LD, sitemap entries, and `llms.txt` were checked.
- The in-app browser rendered all images and played both clips to completion (10.00s and 3.92s).
- English and Chinese at 390px showed no horizontal overflow; the desktop page was checked at 1280px.
- Updated page screenshots are saved under the current visualization directory. No commit or deployment performed.

## Screenshot focus revision

- `FocusedScreenshot.astro` shows a deliberate crop of each original screenshot with SVG outlines and arrows; the source bitmap is not retouched.
- Each figure has one short action title, an accessible image description, a visible caption, and a link to the full screenshot.
- Comment/Add, modifier/Send, multiple cards, sent history, and Skill settings use aligned English/Chinese focused views.
- Draft cards use an 880×375 view that preserves the complete input, toolbar, and Send button. Sent history uses an 880×781 view that preserves the sent message, Gemini's reply, and the input below.
- The duplicate marker-entry screenshot was removed after review; the numbered-marker instructions lead directly into the marker-editing video.
- The feature and tutorial openings now lead with the reading benefit: note questions as they come up, keep reading, and ask together without remembering every question or finding the passages again. English/Chinese titles, search descriptions, directory summaries, and `llms.txt` match this positioning.
