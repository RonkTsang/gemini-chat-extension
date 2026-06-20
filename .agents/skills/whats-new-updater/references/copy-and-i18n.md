# Copy and i18n

## Tone

Write as a product update inside Gemini Power Kit, not a changelog. Lead with the user benefit and keep the mechanism out of the headline.

Core sentence: this feature makes Gemini feel easier, clearer, faster, calmer, or more reliable to use.

Avoid:

- "Added support for..."
- "Implemented..."
- "Now the detector..."
- Permission or API details in the short toast copy
- Overpromising outcomes when browser or system permissions may block the feature

## Field Shape

Use exactly three fields per release-note item:

```json
"featureSlug": {
  "title": "...",
  "description": "...",
  "action": "..."
}
```

Recommended length:

- English title: 4-8 words.
- English description: 90-140 characters.
- English action: 2-4 words.
- Chinese title: 8-14 characters when possible.
- Chinese description: 35-60 characters.
- Chinese action: 2-5 characters.

## Baseline Drafting

Draft English first, then Simplified Chinese. Use the Chinese version as a tone check, not a literal translation.

Examples:

```json
"notification": {
  "title": "Know when Gemini is ready",
  "description": "Step away while Gemini works. Get a desktop notification when the reply is ready, then click back to the chat.",
  "action": "Set up notifications"
}
```

```json
"notification": {
  "title": "Gemini 回复好时提醒你",
  "description": "切到其他标签页、窗口或应用后，Gemini 完成回复时会发送桌面通知，点击即可回到对话。",
  "action": "设置通知"
}
```

For permission-sensitive features, prefer CTA words like "Set up", "Review", or "Configure" over words that imply guaranteed immediate activation.

## i18n Subagent Requirement

Use an i18n subagent for non-English locale completion when available.

Procedure:

1. Search for available multi-agent or subagent tools if not already exposed.
2. Give the subagent:
   - the English source copy
   - the Simplified Chinese tone reference
   - the target locale list from `src/locales/*.json`
   - the exact JSON shape to return
   - the length constraints above
3. Ask the subagent to preserve concise product tone and avoid formal technical phrasing.
4. Review returned locale strings before applying them. Keep locale tone consistent with existing files.

If no subagent tool is available, state that limitation and continue manually only if the user approves or the update is blocked.

## Review Checklist

- The title names a benefit, not an implementation.
- The description says what changes for the user.
- The CTA matches the actual action destination.
- No field is so long that it will dominate the toast.
- Locale keys are aligned across every `src/locales/*.json` file.
