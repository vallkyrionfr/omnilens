# Chrome Web Store Listing — OmniLens

> Last Updated: 2026-09-19

## Store Listing

**Extension Name** [REQUIRED]
OmniLens - Web Intelligence & Dev PowerTool

**Short Description** [REQUIRED]
Audit web pages for accessibility and SEO, extract live color palettes and typography, harvest assets, and run sandboxed JS snippets.

**Detailed Description** [REQUIRED]
OmniLens is an all-in-one web inspection, design intelligence, and productivity suite designed for web developers, designers, and accessibility auditors.

Access powerful deep-page analysis with a single click or keyboard shortcut right in your browser's side panel:

AUDIT & ACCESSIBILITY HEALTH
- Run real-time WCAG 2.1 Level AA accessibility and structure audits.
- Identify missing alt attributes, unlabeled form controls, duplicate element IDs, and broken heading hierarchies.
- Highlight offending elements directly on the active webpage with interactive visual overlays.

COLOR & TYPOGRAPHY PALETTE EXTRACTOR
- Automatically extract all CSS colors and font families active on any webpage.
- Calculate exact WCAG contrast ratios and compliance ratings for text against backgrounds.
- Copy colors in HEX, RGB, or HSL with one click, or export the entire palette as CSS variables.

ASSET & MEDIA HARVESTER
- Collect and preview images, embedded SVG icons, stylesheets, scripts, and links.
- Copy clean SVG vector code or resource links immediately.

SMART READER & ARTICLE METRICS
- Enjoy a clean, distraction-free reading mode.
- View estimated reading time, total word count, readability ease score, and top keyword frequencies.

SANDBOXED CONSOLE & SCRATCHPAD
- Experiment with JavaScript code safely in an isolated sandbox environment.
- Query active page elements and save frequently used snippets locally.

PRIVACY & PERMISSIONS
OmniLens runs entirely on your local machine. No website content, personal data, or browsing activity is ever collected, tracked, or sent to external servers.

**Category** [REQUIRED]
Developer Tools

**Single Purpose** [REQUIRED]
Inspect web pages for accessibility, extract design palettes and assets, and analyze content directly within the browser side panel.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | icons/icon-128.png |
| Screenshot 1 [REQUIRED] | 1280×800 | ⬜ Not created | screenshots/screenshot-audit.png |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ⬜ Not created | screenshots/screenshot-palette.png |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ⬜ Not created | screenshots/screenshot-harvester.png |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | promo/tile-small.png |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | promo/tile-marquee.png |

### Screenshot Notes
- Screenshot 1: Side panel displaying the Accessibility & Health Audit tab with score ring and issue highlights.
- Screenshot 2: Color palette grid showing extracted swatches, contrast inspector, and font family usage.
- Screenshot 3: Asset harvester filtering images and SVGs with preview thumbnails.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves user-created code snippets and customized UI preferences locally on device. |
| `activeTab` | permissions | Enables quick inspection snapshot when user opens the action popup. |
| `tabs` | permissions | Retrieves current tab title and URL to display in the side panel header and verify inspection compatibility. |
| `contextMenus` | permissions | Adds context menu shortcuts to open the side panel and capture highlighted text into the scratchpad. |
| `sidePanel` | permissions | Displays the multi-tab inspection interface in Chrome's dedicated browser side panel. |
| `scripting` | permissions | Injects the inspection overlay and analysis scripts into the active page when requested by the user. |
| `alarms` | permissions | Schedules temporary badge resets and non-blocking background notifications. |
| `<all_urls>` | host_permissions | Allows auditing DOM elements, computing styles, and harvesting public assets across any webpage the user chooses to inspect. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Distribution
**Visibility**: Public
**Regions**: All regions

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-09-19 | Initial release with full MV3 Side Panel, A11y, Palette, Assets, Reader, and Sandbox. | Draft |
