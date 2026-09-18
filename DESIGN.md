---
name: Internal ATS
description: A minimalist, keyboard-complete hiring workspace where nothing on screen is decoration.
colors:
  accent: "#4c6ef5"
  accent-hover: "#4263eb"
  accent-wash: "#4c6ef51a"
  surface: "#ffffff"
  surface-sunken: "#f8f9fa"
  surface-header: "#ffffffd1"
  ink: "#000000"
  ink-quiet: "#868e96"
  rule: "#ced4da"
  hover: "#f8f9fa"
  signal-positive: "#12b886"
  signal-negative: "#fa5252"
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.6rem, 1.15rem + 1.6vw, 2rem)"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "normal"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  secondary:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "0.03em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "10px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.surface}"
    typography: "{typography.secondary}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.secondary}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "36px"
  button-default-hover:
    backgroundColor: "{colors.hover}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.secondary}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  badge-status:
    backgroundColor: "{colors.accent-wash}"
    textColor: "{colors.accent}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "20px"
  table-header-cell:
    textColor: "{colors.ink-quiet}"
    typography: "{typography.label}"
    padding: "{spacing.md} {spacing.lg}"
---

# Design System: Internal ATS

## Overview

**Creative North Star: "Nothing Extra"**

This is a tool for people deciding about other people's careers. Every pixel that is not
carrying information is competing with a judgement someone is trying to make carefully. So the
system subtracts: no illustrations, no gradients, no hero imagery, no ornament, no second accent
colour looking for a job. What remains is text, rule lines, whitespace, and one blue.

Minimalism here is a discipline, not a look. The test for any element is whether removing it
loses information or an affordance. If neither is lost, it goes. This is why surfaces are flat,
why borders are one hairline, why the palette is a single accent over neutral grey, and why
status colour appears only where colour *is* the data.

The one thing minimalism is never allowed to take is access. Stripped interfaces usually fail
the same way — labels become placeholders, buttons become bare icons, secondary text fades until
it cannot be read, focus rings get removed because they spoil a clean edge. Every one of those
removes an affordance while claiming to remove ornament. In this system that trade is forbidden.
The interface may be quiet, but it is never unusable.

**Key Characteristics:**

- One accent (indigo `#4c6ef5`) over a neutral grey scale; nothing else is decorative colour.
- Flat by default: hairline borders, no resting shadows.
- Dense but not cramped — 14px body, generous row padding, real whitespace between regions.
- Tabular numerals everywhere numbers line up.
- Every interactive element is reachable and operable by keyboard, with a visible focus ring.
- No marketing surface exists; the only unauthenticated screen is sign-in.

## Colors

A single indigo accent carried on an almost-white neutral field. Colour is either an action, a
location, or a piece of data — never atmosphere.

### Primary

- **Signal Indigo** (`#4c6ef5`): the only accent. It marks the primary action, the active
  navigation item, the active tab underline, and the focus ring. Its hover state deepens to
  `#4263eb`. A 10% wash of it (`#4c6ef51a`) backs light badges, the date chip, and the drop
  target on the pipeline board.

### Neutral

- **Ink** (`#000000`): body text and headings. Pure black, unapologetically — at 14px on white
  it is the most legible option available and softening it buys nothing but mood.
- **Quiet Ink** (`#868e96`): secondary text, table headers, timestamps, and meta lines. **This
  value measures roughly 3.3:1 on white and does not meet WCAG AA for text below 18.66px.** It
  is recorded here because it is what the code uses today, not because it is correct. See the
  Legibility Floor Rule.
- **Rule** (`#ced4da`): the hairline that separates every row, cell, card and panel. This colour
  does the work that shadows do in other systems.
- **Surface** (`#ffffff`): cards, tables, modals, the raised plane that content sits on.
- **Sunken** (`#f8f9fa`): the page field behind cards, the sidebar, pipeline columns, and the
  inset blocks inside interview cards. Also the row hover tint.

### Signal (data, not decoration)

- **Positive** (`#12b886`): open jobs, active people, hired outcomes.
- **Negative** (`#fa5252`): rejection, failure, destructive actions.

Additional Mantine hues (violet, orange, teal, gray) appear only as **stage dots and stage
avatars**, where the colour is assigned per pipeline stage by the database and is therefore data.

### Named Rules

**The One Accent Rule.** Indigo appears on no more than ~10% of any screen. If two things on a
page are both indigo, one of them is wrong. Secondary actions are `default` grey, not a second
colour.

**The Legibility Floor Rule.** No text may sit below 4.5:1 against its background, and no text
below 13px may be used for anything a person must actually read. Quiet Ink currently violates
this at label size; where minimalism and this rule conflict, this rule wins.

**The Colour Is Data Rule.** If colour is carrying meaning, it must not be the only thing
carrying it. Every stage dot has a name beside it; every status badge has a word in it.

## Typography

**Display / Body / Label Font:** Inter (with `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`)
**Mono:** `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`

**Character:** One family, six roles, nothing borrowed. Inter is chosen for the boring reason
that it is the most legible neutral grotesque at small sizes, which is where this product lives.
Personality comes from the scale and the spacing, not from the typeface.

### Hierarchy

- **Display** (650, `clamp(1.6rem, 1.15rem + 1.6vw, 2rem)`, 1.15): the page title, once per
  page. Fluid so it never dominates a narrow window.
- **Headline** (600, 1.375rem, 1.25): reserved. Currently unused in app chrome; available for
  modal-scale statements.
- **Title** (600, 1.0625rem, 1.3): section headings inside a page — "Hiring pipeline",
  "Interview plan", "Company access".
- **Body** (400, 0.875rem/14px, 1.55): the default. Names, values, note text, descriptions.
- **Secondary** (400, 0.8125rem/13px, 1.5): supporting lines under a name, form controls, button
  labels.
- **Label** (600, 0.6875rem/11px, 0.03em, uppercase): table headers, eyebrow labels, stat card
  captions.

### Named Rules

**The One Title Rule.** Exactly one Display per page, and it names the thing you are looking at.
Everything else steps down to Title or lower.

**The Tabular Rule.** Any column of numbers, dates, counts or ratings uses
`font-variant-numeric: tabular-nums` so figures align on the decimal. Applied globally to table
cells and to stat figures via `.tnum`.

## Layout

A fixed application shell with a scrolling content well. The header is 60px and translucent
(`#ffffffd1` with `saturate(180%) blur(12px)`); the sidebar is 256px and sits on the sunken
field; the main region holds a `1440px` max-width container centred in whatever space remains, so
content never runs to the full width of an ultrawide display.

Spacing follows Mantine's scale — 10 / 12 / 16 / 20 / 32px — used as a rhythm, not a grid.
Page title to first content is `xl` (32px). Within a card, padding is `lg` (20px). Between
sibling cards, `md`–`lg`. List rows are `md lg` (16/20px), tightening to `sm md` below 48em.

Responsive behaviour: the sidebar collapses to a burger drawer below `md` (768px); multi-column
grids collapse to single column via `Grid.Col span={{ base: 12, lg: 8|4 }}`; data tables keep
their real width and scroll horizontally inside `Table.ScrollContainer` rather than reflowing
into cards; the pipeline board scrolls horizontally with `grid-auto-columns: minmax(264px, 1fr)`
so it adapts to any number of stages.

### Named Rules

**The 1440 Rule.** Content stops at 1440px. A hiring table stretched across a 34-inch monitor is
unreadable, and whitespace at the edges costs nothing.

**The Tables Don't Reflow Rule.** A dense table scrolls sideways on small screens. It does not
become a stack of cards — the column relationships are the information.

## Elevation & Depth

Flat by default. Depth is carried by hairline borders (`#ced4da`) and the two-tone surface
relationship (white cards on `#f8f9fa` field), not by shadow. There is no resting shadow
anywhere in the application.

Shadow is a **response to state**, and appears in exactly three situations: a card lifting under
the cursor, an overlay floating above the page, and the search panel.

### Shadow Vocabulary

- **Lift** (`--mantine-shadow-md`, paired with `transform: translateY(-2px)` over 150ms): hover
  on an interactive card — dashboard metrics, pipeline candidate cards.
- **Float** (Mantine `shadow="lg"` / modal default): the global search results panel, menus,
  modals. These genuinely sit above the page.

### Named Rules

**The Flat-At-Rest Rule.** If an element is not being hovered, dragged, or floated above the
page, it has no shadow. A border is the answer to "how do I separate this".

## Shapes

Rectangles with softened corners and no other geometry. Three radii do all the work: `4px` for
small inline surfaces (nested criterion blocks), `8px` for controls — buttons, inputs, menus,
cards inside a board — and `16px` for page-level panels and modals. Badges and avatars are fully
rounded (`999px`).

Borders are always 1px, always the Rule colour, never doubled. Dashed borders mean "nothing here
yet" and appear only on empty pipeline stages. No corner is cut, no shape is rotated, no
container is asymmetric.

### Named Rules

**The Three Radii Rule.** 4, 8, 16. If a new surface needs a fourth radius, it is probably the
wrong size for its role.

## Components

### Buttons

- **Shape:** 8px radius (`{rounded.md}`), 36px tall, 18px horizontal padding.
- **Primary:** filled Signal Indigo with white text, weight 600, 13px. One per region — the
  single most likely next action.
- **Hover / Focus:** background deepens to `#4263eb`; focus shows Mantine's `auto` focus ring —
  visible for keyboard, suppressed for pointer.
- **Default (secondary):** white with a Rule border and Ink text. This is the correct choice for
  anything that is not *the* action. Hover fills with Sunken.
- **Light:** accent wash background with accent text; used for in-card secondary actions ("Add
  note", "Add kit") where a bordered button would add a second box inside a box.
- **Subtle / icon:** no border, no background until hover. Every icon-only button carries an
  `aria-label` naming its target ("Move Jordan Lee").

### Badges

- **Style:** pill, 11px uppercase-off (`tt: none`), weight 600, light variant.
- **Status badge:** colour mapped from a status vocabulary — teal for open/active/hired, red for
  rejected/cancelled, gray for draft/closed, yellow for on hold.
- **Stage badge:** deliberately **neutral outline, never coloured by the status map**. Stages are
  not statuses; colouring them from the status vocabulary produced meaningless colour.

### Cards and Panels

- **Corner:** 16px for page panels, 8px for cards nested inside a board.
- **Background:** Surface white on the Sunken field.
- **Border:** 1px Rule. **Shadow:** none at rest.
- **Internal padding:** 20px (`lg`).
- **Section header:** title + optional description on the left, one action on the right,
  separated from the body by a full-bleed 1px divider.

### Inputs

- **Style:** 1px Rule border, white fill, 8px radius, 36px tall, 13px text.
- **Label:** always a real `<label>` above the field. Placeholders are examples, never labels.
- **Focus:** accent border plus the focus ring.
- **Textarea:** autosizes (`autosize`, `maxRows: 16`) — a fixed two-row box for a decision
  summary is a false economy.

### Tables

- **Header:** 11px, 600, `0.03em`, uppercase, Quiet Ink, no fill — separated from the body by the
  row hairline alone.
- **Rows:** 16/20px padding, hover tint `#f8f9fa`, 1px Rule between rows.
- **Interactive rows** carry `role="link"`, `tabIndex=0`, an `aria-label` naming the destination,
  Enter/Space activation, and a 2px inset accent focus outline.
- **Numbers** are tabular.

### Navigation

- **Sidebar:** 256px on the Sunken field. Items are Mantine `NavLink variant="light"` — no fill
  at rest, accent wash plus accent text when active. Grouped under 11px uppercase Quiet Ink
  section captions ("Workspace", "System").
- **Section tabs are real links.** Every tab in this product is a route (`/admin/audit`,
  `/requisitions/[id]/kits`), rendered through Mantine `Tabs` with `renderRoot` so it looks like
  a tab and behaves like navigation — bookmarkable, back-button correct.
- **Header:** logo block sized to the sidebar width, a flexible search field capped at 520px, and
  the account menu pinned right. `/` focuses search.

### Pipeline Card (signature)

The one component that carries the product's character. A white 8px card on a sunken column:
stage-coloured avatar, name, current title, location, star rating or an explicit "Not rated yet",
then a hairline divider and a footer of source badge plus last-activity timestamp. Draggable by
mouse (`cursor: grab`, 40% opacity while dragging, dashed accent outline on the target column);
the `⋯` menu performs the identical move for keyboard and touch.

### Named Rules

**The Two Paths Rule.** Any action offered by direct manipulation must also exist as a menu item
or button. Drag is an accelerant, never the only route.

## Do's and Don'ts

### Do:

- **Do** subtract first. Before adding a panel, badge or icon, check whether removing something
  achieves the same clarity.
- **Do** use the Default (bordered grey) button for anything that is not the single primary
  action in its region.
- **Do** give every icon-only control an `aria-label` that names its object, not its icon.
- **Do** label form fields with real labels; placeholders disappear the moment someone types.
- **Do** keep numbers tabular in any column where they stack.
- **Do** separate with a 1px Rule hairline. It is the house answer to "these are different
  things".
- **Do** state empty states in words, with the next action when one exists — "No interview kits
  yet" beats an empty panel.

### Don't:

- **Don't** introduce a second accent colour. Status and stage hues are data and are not
  available for decoration.
- **Don't** add a resting shadow. If something needs to look separate, it needs a border.
- **Don't** use Quiet Ink (`#868e96`) for anything a person must read at 11–13px. It fails
  contrast; the Legibility Floor Rule outranks the palette.
- **Don't** remove a focus ring to tidy an edge.
- **Don't** reflow a data table into cards on mobile.
- **Don't** replace a text label with an icon to save space.
- **Don't** add illustration, gradient, hero imagery, or an empty-state mascot. There is no
  marketing surface in this product and no screen is trying to charm anyone.
- **Don't** colour a pipeline stage badge from the status vocabulary. Stages are not statuses.
