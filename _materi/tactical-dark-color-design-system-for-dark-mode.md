# Tactical Dark --- Color Design System

> **Scope:** This document defines only the color system for the
> Tactical Dark visual direction. It is intended for AI coding agents
> and designers implementing a consistent dark interface.
>
> **Visual reference:** The supplied dark dashboard screenshot.
>
> **Design character:** Calm, precise, professional, restrained, modern,
> and data-oriented.

------------------------------------------------------------------------

## 1. Color philosophy

Tactical Dark uses a neutral charcoal foundation with carefully
controlled accent colors. The interface should feel focused and composed
rather than aggressively futuristic or neon.

The palette follows five principles:

1.  **Dark foundation:** use charcoal and near-black tones instead of
    pure black as the primary surfaces.
2.  **Layered surfaces:** distinguish the application canvas, sidebar,
    and cards through subtle tonal differences.
3.  **Restrained accents:** keep most of the interface neutral; use
    bright colors only where they communicate hierarchy or meaning.
4.  **Consistent semantics:** a color should retain the same meaning
    across pages and components.
5.  **Readable contrast:** text, icons, borders, and data marks must
    remain distinguishable against their backgrounds.

The colors below are estimated from the visual reference. They are
proposed design tokens, not verified original source values. Validate
contrast and adjust only when necessary for accessibility.

------------------------------------------------------------------------

## 2. Core palette

### 2.1 Dark foundation

  Token                    HEX         Role
  ------------------------ ----------- -----------------------------
  `color-bg`               `#141517`   Main application background
  `color-sidebar`          `#1E1F23`   Sidebar background
  `color-surface`          `#1E1F23`   Standard cards and panels
  `color-surface-raised`   `#24252A`   Raised or nested surface
  `color-surface-hover`    `#292A30`   Hovered surface
  `color-surface-active`   `#303137`   Selected or pressed surface
  `color-border`           `#303137`   Default subtle border
  `color-border-subtle`    `#292A30`   Low-emphasis separators

**Usage guidance**

-   Use `#141517` for the main content canvas.
-   Use `#1E1F23` for the sidebar and primary cards.
-   Use `#24252A` for nested panels or controls that need slight
    separation.
-   Use `#292A30` for hover states and subtle surface changes.
-   Use `#303137` sparingly for borders, active surfaces, and stronger
    separators.
-   Do not use pure black (`#000000`) as the default application
    background.
-   Avoid adding shadows to compensate for insufficient surface
    contrast. Prefer tonal layering.

### 2.2 Text palette

  ------------------------------------------------------------------------
  Token                    HEX                     Role
  ------------------------ ----------------------- -----------------------
  `color-text-primary`     `#F5F5F5`               Main headings and
                                                   important values

  `color-text-secondary`   `#A1A1AA`               Supporting text and
                                                   normal labels

  `color-text-muted`       `#71717A`               Inactive labels and
                                                   low-priority metadata

  `color-text-inverse`     `#141517`               Text on sufficiently
                                                   light surfaces
  ------------------------------------------------------------------------

**Usage guidance**

-   Primary text is reserved for important information.
-   Secondary text is the default for descriptions, table content, and
    supporting labels.
-   Muted text is only for non-critical information. Do not use it for
    essential instructions or small text without checking contrast.
-   Inverse text is intended for light accent surfaces or light emphasis
    cards, after contrast has been checked.
-   Do not reduce opacity indiscriminately to create hierarchy; use the
    defined text tokens.

------------------------------------------------------------------------

## 3. Accent palette

The Tactical Dark accent system has four core colors.

  --------------------------------------------------------------------------
  Token                      HEX                     Semantic role
  -------------------------- ----------------------- -----------------------
  `color-accent-primary`     `#8585F5`               Primary accent, key
                                                     data series

  `color-accent-secondary`   `#FF896A`               Secondary data series,
                                                     contrasting highlight

  `color-accent-warning`     `#F5C65B`               Attention, warning,
                                                     tertiary data series

  `color-accent-success`     `#24B99A`               Positive state and
                                                     successful outcome
  --------------------------------------------------------------------------

### 3.1 Violet --- primary accent

**HEX:** `#8585F5`

Use violet as the main visual accent of the product.

Appropriate uses: - Primary chart series. - Selected navigation
indicators. - Primary data highlights. - Active controls and selected
filters. - Key interactive states, where contrast is sufficient.

Violet should be the most recognizable accent in the interface. Do not
apply it to every icon, border, or label.

### 3.2 Coral --- secondary accent

**HEX:** `#FF896A`

Use coral to contrast with violet and distinguish a second category or
data series.

Appropriate uses: - Secondary chart series. - Comparative metrics. -
Important but non-primary highlights. - Attention states where the
meaning is not an error.

Do not use coral as a universal error color. Reserve error semantics for
a separately defined semantic token if the product needs one.

### 3.3 Yellow --- warning and attention accent

**HEX:** `#F5C65B`

Use yellow selectively to attract attention without overwhelming the
interface.

Appropriate uses: - Warning and attention indicators. - Tertiary chart
series. - Pending or requires-attention status. - Small highlights and
markers.

Avoid large yellow surfaces. Yellow should remain an accent, not a
dominant background.

### 3.4 Teal --- success accent

**HEX:** `#24B99A`

Use teal for positive or completed states.

Appropriate uses: - Successful status badges. - Positive trend
indicators, when the metric context confirms that an increase is
beneficial. - Completed actions. - Successful processing states.

Do not automatically treat every upward trend as positive. The semantic
meaning must follow the metric.

------------------------------------------------------------------------

## 4. Semantic color rules

Accent colors can also serve semantic roles, but keep those roles
consistent.

  --------------------------------------------------------------------------
  Meaning                 Preferred token            Example
  ----------------------- -------------------------- -----------------------
  Primary / selected      `color-accent-primary`     Active item, selected
                                                     series

  Secondary / comparison  `color-accent-secondary`   Comparison series

  Warning / attention     `color-accent-warning`     Pending, needs review

  Success / completed     `color-accent-success`     Completed, received

  Error / critical        Define separately when     Failed, rejected,
                          needed                     critical alert

  Neutral / inactive      `color-text-muted`         Disabled or inactive
                                                     metadata
  --------------------------------------------------------------------------

### Optional error tokens

The reference screenshot does not establish a dedicated error color. If
the application requires one, introduce it deliberately rather than
overloading coral.

Suggested starting point:

  Token                   HEX         Role
  ----------------------- ----------- -----------------------------
  `color-error`           `#F06B73`   Error text, icon, or marker
  `color-error-surface`   `#382326`   Subtle error background

These are proposed extensions, not colors identified in the reference.

### Semantic rules

-   Always pair a status color with a text label or icon.
-   Never use color as the only way to communicate status.
-   Do not use teal for warning or yellow for success.
-   Do not change the meaning of violet and coral between charts without
    a clear legend.
-   Ensure positive and negative trend indicators are based on business
    meaning, not arrow direction alone.

------------------------------------------------------------------------

## 5. Color hierarchy and visual balance

The interface should remain predominantly neutral.

Suggested visual balance (a directional guideline, not a strict pixel
measurement):

  ------------------------------------------------------------------------
  Color group                      Approximate share Purpose
  --------------------- ---------------------------- ---------------------
  Dark foundation and                        75--85% Establish the overall
  surfaces                                           dark environment

  Text and neutral                           10--18% Communicate content
  details                                            and structure

  Accent colors                                5--8% Highlight data,
  combined                                           state, and
                                                     interaction
  ------------------------------------------------------------------------

The exact proportions will vary by screen. A chart-heavy page may
naturally contain more accent color than a settings page.

### Priority order

1.  Neutral dark surfaces establish the environment.
2.  Primary text communicates the most important information.
3.  Violet provides the primary visual identity.
4.  Coral distinguishes secondary information.
5.  Yellow and teal appear only when their semantic roles are relevant.

Avoid giving all four accent colors equal visual weight.

------------------------------------------------------------------------

## 6. Surface and contrast relationships

Use tonal separation to create hierarchy.

  Foreground       Background      Intended relationship
  ---------------- --------------- -------------------------------
  Primary text     `#141517`       Strong, clear contrast
  Primary text     `#1E1F23`       Strong, clear contrast
  Secondary text   `#141517`       Supporting information
  Secondary text   `#1E1F23`       Supporting information
  Muted text       Dark surfaces   Low-priority information only
  Violet accent    Dark surfaces   Primary visual highlight
  Coral accent     Dark surfaces   Secondary visual highlight
  Yellow accent    Dark surfaces   Attention highlight
  Teal accent      Dark surfaces   Positive-state highlight

Do not assume every accent color is suitable for small text. For badges
and buttons, test both the foreground and background combination. If the
accent is too bright or too low-contrast for text, use it as an icon,
border, dot, or chart mark instead.

For accessibility: - Check text contrast against WCAG 2.2 AA guidance. -
Aim for at least 4.5:1 for normal text and 3:1 for large text. - Check
focus indicators and non-text UI boundaries separately. - Test actual
foreground/background combinations, not isolated hex values.

------------------------------------------------------------------------

## 7. Recommended CSS color tokens

``` css
:root {
  color-scheme: dark;

  /* Foundation */
  --color-bg: #141517;
  --color-sidebar: #1E1F23;
  --color-surface: #1E1F23;
  --color-surface-raised: #24252A;
  --color-surface-hover: #292A30;
  --color-surface-active: #303137;

  /* Borders */
  --color-border: #303137;
  --color-border-subtle: #292A30;

  /* Text */
  --color-text-primary: #F5F5F5;
  --color-text-secondary: #A1A1AA;
  --color-text-muted: #71717A;
  --color-text-inverse: #141517;

  /* Accents */
  --color-accent-primary: #8585F5;
  --color-accent-secondary: #FF896A;
  --color-accent-warning: #F5C65B;
  --color-accent-success: #24B99A;

  /* Optional semantic extension */
  --color-error: #F06B73;
  --color-error-surface: #382326;
}
```

Do not introduce additional one-off hex values in individual components
unless there is a documented reason. Components should consume these
shared tokens.

------------------------------------------------------------------------

## 8. Example color application

### Sidebar

-   Background: `--color-sidebar`
-   Product name: `--color-text-primary`
-   Inactive navigation: `--color-text-secondary`
-   Active navigation surface: `--color-surface-hover`
-   Active navigation text: `--color-text-primary`
-   Optional active marker: `--color-accent-primary`
-   Group separator: `--color-border-subtle`

### Main content

-   Background: `--color-bg`
-   Page title: `--color-text-primary`
-   Subtitle: `--color-text-secondary`
-   Main card: `--color-surface`
-   Card border: `--color-border-subtle`

### KPI cards

-   Label: `--color-text-secondary`
-   Value: `--color-text-primary`
-   Primary sparkline: `--color-accent-primary`
-   Secondary sparkline: `--color-accent-secondary`
-   Positive status: `--color-accent-success`
-   Attention status: `--color-accent-warning`

### Charts

-   Chart canvas: transparent or `--color-surface`
-   Gridlines: `--color-border-subtle`
-   Axis labels: `--color-text-muted`
-   Primary series: `--color-accent-primary`
-   Secondary series: `--color-accent-secondary`
-   Tertiary series: `--color-accent-warning`
-   Positive outcome series or marker: `--color-accent-success`, only
    when semantically appropriate

### Tables and badges

-   Table header: `--color-text-secondary`
-   Table body: `--color-text-secondary`
-   Divider: `--color-border-subtle`
-   Success badge: teal-tinted background with readable foreground
-   Warning badge: yellow-tinted background with readable foreground
-   Error badge: use the separately defined error tokens if needed

For tinted badge backgrounds, create tested color variants rather than
applying a bright accent as a large solid background.

------------------------------------------------------------------------

## 9. Light mode policy

Tactical Dark is a dark-first palette. Do not automatically generate a
light theme by inverting the dark tokens.

If light mode is required later: - Define a separate light surface
hierarchy. - Re-check all accent and text contrast combinations. -
Preserve the semantic meaning of violet, coral, yellow, and teal. - Do
not assume the dark-mode muted text or border colors are suitable for
light mode.

Light mode is outside the current color-system scope and should be
designed as a separate, deliberate extension.

------------------------------------------------------------------------

## 10. AI agent implementation instructions

Use this document as the source of truth for color decisions.

### Required behavior

1.  Implement the color tokens centrally using CSS variables or the
    project's theme system.
2.  Use the provided HEX values as the initial palette.
3.  Apply the same semantic color roles consistently across the
    application.
4.  Keep the interface predominantly charcoal and neutral.
5.  Use violet as the primary accent and coral as the secondary data
    accent.
6.  Use yellow for attention and teal for success.
7.  Use muted text only for low-priority information.
8.  Avoid arbitrary colors, unnecessary gradients, neon effects, and
    excessive shadows.
9.  Do not introduce new colors without documenting their purpose.
10. Validate actual text and UI contrast before finalizing.

### Completion checklist

-   [ ] Main background uses the defined charcoal token.
-   [ ] Sidebar and cards use the defined surface tokens.
-   [ ] Text uses primary, secondary, and muted roles consistently.
-   [ ] Violet is the primary accent.
-   [ ] Coral is the secondary accent.
-   [ ] Yellow is reserved for warning or attention.
-   [ ] Teal is reserved for positive or success states.
-   [ ] Borders are subtle and consistent.
-   [ ] No arbitrary one-off colors have been introduced.
-   [ ] Status is not communicated by color alone.
-   [ ] Text and interactive elements pass contrast checks.

------------------------------------------------------------------------

## 11. Copy-ready prompt for an AI coding agent

``` text
Implement the Tactical Dark color system defined in this document.

Focus ONLY on colors. Do not redesign layout, typography, spacing, component
structure, or interaction behavior unless a color change requires a minimal
adjustment.

Use the charcoal foundation:
- Background: #141517
- Sidebar and standard surface: #1E1F23
- Raised surface: #24252A
- Hover surface: #292A30
- Border: #303137

Use the text palette:
- Primary: #F5F5F5
- Secondary: #A1A1AA
- Muted: #71717A

Use the accent palette:
- Primary violet: #8585F5
- Secondary coral: #FF896A
- Warning yellow: #F5C65B
- Success teal: #24B99A

Centralize these values as design tokens/CSS variables. Apply colors according
to their documented semantic roles. Keep the overall interface predominantly
neutral and dark. Avoid arbitrary new colors, excessive gradients, neon effects,
and strong decorative shadows. Check contrast for text, badges, controls, and
chart labels. Do not use color as the only status indicator.

Preserve the existing product layout and content. This task is a color-system
implementation only.
```

------------------------------------------------------------------------

**End of Tactical Dark Color Design System.**
