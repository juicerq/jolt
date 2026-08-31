---
version: alpha
name: Jots
description: A calm desktop workspace where Bots feel like capable collaborators and the conversation owns the screen.
colors:
  primary: "#f5f3f1"
  secondary: "#b3adaa"
  muted: "#7d7774"
  accent: "#e7e5e4"
  accent-ink: "#1a1816"
  canvas: "#0c0a09"
  sidebar: "#0c0a09"
  surface: "#151311"
  surface-raised: "#1c1917"
  surface-hover: "#24211f"
  surface-active: "#2d2926"
  outline: "#302c29"
  outline-strong: "#57514d"
  focus: "#d6d3d1"
  success: "#4ade80"
  warning: "#fbbf24"
  error: "#f87171"
  working: "#fbbf24"
  awaiting-decision: "#60a5fa"
  overlay: "rgb(0 0 0 / 72%)"
  inline-code: "#f0ad67"
  syntax-keyword: "#e4a7eb"
  syntax-string: "#b9df8f"
  syntax-number: "#f2b86f"
  syntax-title: "#8dcced"
typography:
  title:
    fontFamily: system-ui
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: -0.02em
  section:
    fontFamily: system-ui
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: system-ui
    fontSize: 15px
    fontWeight: 400
    lineHeight: 1.65
  control:
    fontFamily: system-ui
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4
  support:
    fontFamily: system-ui
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  metadata:
    fontFamily: system-ui
    fontSize: 11px
    fontWeight: 500
    lineHeight: 1.4
  label:
    fontFamily: system-ui
    fontSize: 11px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0.08em
rounded:
  sm: 8px
  md: 12px
  lg: 18px
  shell: 24px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  sidebar: 286px
  titlebar: 52px
components:
  app-shell:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
  sidebar:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.secondary}"
    width: "{spacing.sidebar}"
  conversation:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.shell}"
  list-item:
    backgroundColor: transparent
    textColor: "{colors.secondary}"
    rounded: "{rounded.md}"
    padding: "{spacing.md}"
  list-item-hover:
    backgroundColor: "{colors.surface-hover}"
  list-item-active:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.primary}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.secondary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.muted}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "{spacing.sm}"
  button-active:
    backgroundColor: "{colors.surface-active}"
    textColor: "{colors.primary}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary}"
    typography: "{typography.control}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md}"
  input-focus:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.focus}"
  dialog:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  status-available:
    backgroundColor: "{colors.success}"
    size: 7px
  status-working:
    backgroundColor: "{colors.working}"
    size: 7px
  status-waiting:
    backgroundColor: "{colors.warning}"
    size: 7px
  status-awaiting-decision:
    backgroundColor: "{colors.awaiting-decision}"
    size: 7px
  status-error:
    backgroundColor: "{colors.error}"
    size: 7px
  divider:
    backgroundColor: "{colors.outline}"
  control-outline:
    backgroundColor: "{colors.outline-strong}"
  overlay:
    backgroundColor: "{colors.overlay}"
---

# Jots

## Overview

Jots is a quiet workspace for working with Bots. It should feel closer to a
private conversation with capable collaborators than to a dashboard for
configuring automation.

The conversation owns the screen. The sidebar answers one question: who can I
talk to? A Bot appears as one person. When that Bot becomes a Leader, three
overlapping avatars reveal the team without turning teams into the product's
main organizing idea.

The signature is this shift from one avatar to three. It explains the product
model without a badge, tree, team switcher, or extra navigation level. Blobatar
gives every Bot a stable face. Color never replaces the avatar as identity.

The interface stays dark, warm, and restrained. Large rounded planes separate
the persistent workspace. Controls stay quiet until the pointer or keyboard
reaches them. The user's message, the Bot's answer, and the prompt are the
strongest elements in that order.

Inline code in conversations uses a strong warm amber and semibold monospace
text without a border or background. Fenced code remains contained in its own
surface with syntax highlighting.

The conversation's top edge uses a 12px translucent fade with a light 6px blur.
It softens clipped content without creating a visible header layer.

## Colors

The palette uses warm near-black surfaces and three strengths of neutral text.
The app has no decorative brand color.

- **Primary (#f5f3f1):** Names, headings, message text, and the current value.
  This is the strongest ink and should be spent sparingly outside conversation.
- **Secondary (#b3adaa):** Labels, control text, helper copy, and inactive
  values that still need comfortable reading.
- **Muted (#7d7774):** Timestamps, status copy, placeholders, and section labels.
  Muted text is metadata, never an instruction or a paragraph.
- **Canvas and sidebar (#0c0a09):** The window frame and navigation plane share
  one uninterrupted background. Spacing alone defines the sidebar.
- **Surfaces (#151311 → #2d2926):** `surface` holds the conversation.
  `surface-raised` holds dialogs, the prompt, and selected rows.
  `surface-hover` and `surface-active` belong only to interaction states.
- **Outlines (#302c29, #57514d):** The soft outline separates persistent
  regions. The strong outline belongs to controls and focus-adjacent states.
- **Status colors:** Green means available or complete. Yellow means working or
  interrupting. Red means failure. Blue is reserved for a future state where
  the Bot is waiting for a decision from the user. Each color answers a state
  question. In the sidebar, a status badge sits on the avatar and exposes its
  text in a top tooltip instead of repeating it in the Bot description.
- **Syntax colors:** Muted lavender, sage, amber, and blue distinguish code
  tokens inside fenced blocks. They never leave code or replace status colors.

Primary, secondary, and muted are the complete ink scale. Adding another gray
creates an unnamed focus level and weakens the hierarchy.

## Typography

Jots uses the operating system's sans-serif face. The app should feel native on
the computer where it runs, and long conversations need a familiar reading
face. A monospace face is reserved for paths, commands, hashes, and code inside
messages.

Five roles control the hierarchy:

- **Title, 20px:** Dialog titles and a Bot's name in a dedicated detail view.
  A screen gets one title.
- **Section, 15px:** Empty-state headings, compact panel headings, and names
  that anchor a local region.
- **Body, 15px:** Every message and any prose longer than one line. Conversation
  never drops below this size.
- **Control, 13px:** Inputs, buttons, Bot names in the sidebar, and short values.
- **Support, 12px:** Helper text and secondary status. It stays readable at a
  glance but does not compete with the control it explains.
- **Metadata and label, 11px:** Timestamps, terse state text, and uppercase
  region labels. This role never carries a sentence the user must understand.

Primary ink plus size and weight marks the first reading target. Muted ink alone
cannot create hierarchy between two equally sized headings. Weight stays between
400 and 600 so the interface does not alternate between faint and heavy text.

Uppercase belongs only to short region labels such as `BOTS`. Bot names,
actions, form labels, states, and messages use sentence case. Every text block
should survive 100% display scaling without relying on text below 11px.

## Layout

The desktop window has two persistent regions: a 286px sidebar and the fluid
conversation plane. A 12px channel separates them. Window controls occupy the
sidebar's upper-left corner without reserving height above the conversation.

The sidebar holds the Bot list directly. It does not start with a team picker.
A plus beside `BOTS` creates a Bot. Selection uses a tonal row, not a leading
line, checkmark, or accent color.

The conversation plane runs to the bottom and right window margins. It uses one
24px outer radius and one outline. The content column stays readable instead of
expanding with the window: messages top out near 720px, and the prompt follows
the same horizontal center.

The message list scrolls while the prompt remains visible. New content follows
the end while the reader is within 312px of it. Farther up, the position stays
fixed and a quiet return-to-end button appears above the prompt. Empty, loading,
streaming, interrupted, and failed states keep the same geometry. A state change
must not move the prompt or resize the conversation plane.

Dialogs sit above the complete window, including the sidebar and titlebar. A
dialog has a compact header, one scrollable body, and a footer whose actions stay
visible. Creation may use steps when all fields do not fit comfortably inside a
680px-wide dialog. It never replaces the conversation plane.

Spacing follows 4, 8, 12, 16, 24, 32, and 48px. A label sits 8px from its
control. Related controls sit 12 or 16px apart. Sections use 24 or 32px. Values
outside this scale need a visible alignment reason.

## Elevation & Depth

Persistent regions use tone and one outline. They do not cast shadows. The
conversation sits one step above the canvas because it holds the work; the
sidebar remains part of the window frame.

Temporary layers use shadow. A dialog combines a short contact shadow with a
wide ambient shadow, both tinted black. Menus and tooltips use the same light
direction with less spread. The overlay darkens the full window enough to leave
the dialog as the only active plane.

Hover states change tone without changing border width. Focus uses a visible
neutral ring. Neither state moves the control or changes the layout.

## Shapes

Large persistent planes use the 24px shell radius. Dialogs use 18px. Rows and
cards use 12px. Inputs and buttons use 8px. A nested shape always uses a smaller
radius than its container.

Circles belong to avatars, status lights, and icon buttons whose hit target is
visibly circular. Pills belong to the one-line prompt and short status chips.
Text buttons and form fields do not become pills.

## Components

**Bot row.** A 32px Blobatar sits beside two text lines. The first line is the
Bot name in control type and primary ink. The second line combines a 6px status
light, a short state, and a clipped work summary in metadata type. Hover and
selection use tone. The row keeps the same outline in every state.

**Leader row.** It has the same anatomy as a Bot row. Three 24px Blabatars
overlap inside the avatar slot. The stack alone communicates that the Bot leads
a team. The first avatar belongs to the Leader; the next two represent the most
relevant Integrantes.

**Conversation.** Bot messages read as plain content on the conversation plane.
User messages use a compact raised bubble aligned right. Message author and time
sit above the content in metadata type. Thinking and tool calls share one
activity history. While a response runs, reasoning and every tool call remain
visible as a progressive stack. The newest activity stays open with its detail;
each earlier activity becomes a compact status line but remains visible. New
activities enter with a short fade and vertical motion. Completed and failed
activities stop moving. Consecutive calls to the same tool form one activity,
such as `Leu 3 arquivos`, with their targets on the supporting line. Separate
reasoning periods remain separate activities with their own durations. Before
the Provider reports an activity, the response uses short contact copy such as
`Contatando Marina…`. It must not describe that waiting period as thinking. The
copy stays stable for the turn and gives way to reasoning or tool activity when
either begins. A completed response collapses the activity history into one
disclosure. Expanding it restores the same chronological sequence instead of
regrouping activities by type. The collapsed line replaces the live stack
instead of appearing beside it. It includes reasoning duration only when the Provider
explicitly reported reasoning; contact and response latency never become
`Raciocínio` after completion. Its collapsed summary uses a sentence that names
the observed work, such as `Raciocinou por 5s, leu 3 arquivos e executou 5
comandos.` The duration stays beside reasoning because it does not measure tool
execution. Each live and expanded step uses an icon for its action instead of a
generic completion check. The current step stays on the conversation plane
without a separate background. Live and expanded steps use the same branching
line as grouped team members in the sidebar, and the final step ends the line.
Failed and unfinished actions do not count as completed work.

**Prompt.** One line by default, centered near the bottom of the conversation.
The field is the strongest control on the screen. Its send action is the only
filled primary action in the normal chat state. Attach, stop, and secondary
actions remain ghost or outlined.

**Dialog.** A fixed header names the task and offers one ghost close action. A
thin progress indicator appears only for a real multi-step flow. The body groups
fields by the decision they ask the user to make. The footer places back or
cancel on the left and the single primary action on the right.

**Form field.** Every field has a visible label in control type. Placeholder
copy gives one realistic example. Helper text uses support type. Validation sits
below the field and says how to correct the value.

**Button.** Primary commits the current flow. Secondary offers a nearby
alternative. Ghost exposes low-frequency actions such as settings, add, close,
and window controls. All variants keep a visible keyboard focus state.

**Empty state.** One section heading explains the state. One support sentence
states the next move. When the next move is already visible nearby, the empty
state does not repeat it as a second button.

## Do's and Don'ts

- Do make the conversation the first reading target. Keep navigation and
  configuration one or two ink levels quieter.
- Do show a Bot as one identity and a Leader as a stack of identities. Keep the
  row anatomy unchanged when the role changes.
- Do use one primary action in each state. Let ghost controls wait for intent.
- Do use realistic Bot names, tasks, statuses, and messages when judging a
  screen. Empty placeholders hide hierarchy problems.
- Do keep all five interaction states: rest, hover, focus-visible, active, and
  disabled.
- Do preserve the shell while data loads or a Bot works.
- Don't make teams a required navigation level or a permanent selector.
- Don't use tiny text to fit more controls. Reduce the controls or disclose them
  later.
- Don't add a card around content that grouping and spacing already explain.
- Don't use status colors for selection, branding, or decoration.
- Don't introduce another radius, gray, font size, or component anatomy inside
  a feature. Extend this file and the shared component when the product needs a
  new role.
- Don't copy a Beautiful UI component's styling. Copy its useful interaction
  anatomy, then render it with Jots tokens and hierarchy.
