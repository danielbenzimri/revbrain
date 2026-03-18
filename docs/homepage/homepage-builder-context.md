# RevBrain Homepage Builder Context

> Complete context document for building a premium, bilingual homepage for the RevBrain platform.

---

## 1. Design System & Brand Guidelines

### Color Palette (Tailwind CSS)

**Primary Brand Colors (Emerald)**

```
emerald-400: #34d399  (light accent, badges)
emerald-500: #10b981  (primary buttons, highlights)
emerald-600: #059669  (button hover, primary actions)
emerald-700: #047857  (dark primary, text on light bg)
```

**Neutral Colors (Slate)**

```
slate-50:  #f8fafc  (light backgrounds)
slate-100: #f1f5f9  (cards, sections)
slate-200: #e2e8f0  (borders, dividers)
slate-300: #cbd5e1  (disabled states)
slate-400: #94a3b8  (placeholder text, icons)
slate-500: #64748b  (secondary text)
slate-600: #475569  (body text)
slate-700: #334155  (headings)
slate-800: #1e293b  (dark backgrounds)
slate-900: #0f172a  (darkest backgrounds, footer)
```

**Accent & Status Colors**

```
blue-500:  #3b82f6  (links, info)
red-500:   #ef4444  (errors, warnings)
amber-500: #f59e0b  (warnings, highlights)
```

### Typography

**Font Family:** Inter (primary), system-ui fallback

```css
font-family:
  Inter,
  system-ui,
  -apple-system,
  sans-serif;
```

**Heading Scales:**

- Hero: 4xl-6xl (48-72px), font-bold
- Section titles: 2xl-3xl (24-36px), font-bold
- Subheadings: lg-xl (18-24px), font-semibold
- Body: base (16px), font-normal

### Design Principles

1. **Premium & Professional** - Clean lines, generous whitespace, subtle shadows
2. **Trustworthy** - Professional photography, client logos, testimonials
3. **Bilingual RTL/LTR** - Full support for Hebrew (RTL) and English (LTR)
4. **Mobile-First** - Responsive design from 320px to 1920px+
5. **Accessibility** - WCAG 2.1 AA compliant

---

## 2. Internationalization (i18n)

### Language Support

| Language | Code | Direction | Default |
| -------- | ---- | --------- | ------- |
| Hebrew   | he   | RTL       | Yes     |
| English  | en   | LTR       | No      |

### Implementation Requirements

- Language switcher in header (prominent, always visible)
- URL-based routing: `/he/...` and `/en/...`
- Auto-detect browser language on first visit
- Persist language preference in localStorage
- All content must have both Hebrew and English versions
- RTL/LTR layout flipping (margins, paddings, icons)

### Hebrew Text Guidelines

- Use formal/professional register (not casual)
- Right-to-left text direction
- Proper Hebrew typography (line-height 1.6+)
- Numbers remain LTR even in RTL context

---

## 3. Platform Overview

**RevBrain** is a construction project management and quantity surveying platform designed specifically for the Israeli infrastructure and construction market. The platform digitizes the traditionally manual, error-prone process of quantity calculations, bill verification, and project execution tracking.

### Core Value Proposition

> "Transform weeks of manual calculation work into hours of verified, traceable results."
>
> Hebrew: "הפכו שבועות של עבודת חישוב ידנית לשעות של תוצאות מאומתות ומעקיבות."

---

## 4. Target Audiences

### Persona 1: Quantity Surveyors & Contractors (חשב כמויות / קבלן)

**Who:** Professional quantity surveyors, construction contractors, engineering offices, infrastructure companies

**Pain Points:**

- Manual CAD/DXF calculations take days/weeks
- Excel is error-prone and hard to audit
- No traceability between drawings and quantities
- Version control nightmares

**Key Features:**

- 20 Calculation Modules (earthworks, paving, walls, drainage, etc.)
- CAD/DXF Integration
- Automatic BoQ Generation
- Version Tracking
- Excel Export

**Message (HE):** "מחשבים כמויות? עברו מאקסל ל-RevBrain. חישובים מדויקים, מעקב שינויים, ודוחות מוכנים להגשה."

**Message (EN):** "Calculating quantities? Switch from Excel to RevBrain. Accurate calculations, change tracking, and reports ready for submission."

---

### Persona 2: Inspectors & Controllers (מפקח / בקר)

**Who:** Site inspectors, project controllers, government supervisors, third-party verification consultants

**Pain Points:**

- Can't verify calculations from thick folders
- No traceability to original plans
- Manual comparison is time-consuming
- Disputes take months

**Key Features:**

- Read-only access to contractor calculations
- Visual verification on drawings
- Full audit trail
- Notes & approval workflow
- Photo evidence attachment

**Message (HE):** "קיבלתם חשבון ביצוע? בדקו אותו ב-RevBrain. כל הנתונים, התמונות והחישובים - במקום אחד."

**Message (EN):** "Received an execution bill? Verify it with RevBrain. All data, photos, and calculations - in one place."

---

### Persona 3: Tender Estimation (אומדנים למכרזים)

**Who:** Contractors bidding on public tenders, estimation departments, consultants

**Pain Points:**

- Tight tender deadlines (2-4 weeks)
- Need rough quantities fast
- No historical benchmarks
- Risk of under/over estimation

**Key Features:**

- Quick estimation mode
- Historical project comparisons
- Risk buffer calculations
- Unit cost database

**Message (HE):** "מכרז בעוד שבועיים? קבלו אומדן כמויות מהיר ומבוסס על נתוני עבר."

**Message (EN):** "Tender in two weeks? Get fast quantity estimates based on historical data."

---

### Persona 4: Managed Service (שירות מלא)

**Who:** Small contractors without in-house surveyors, companies with overflow work

**Key Features:**

- Full outsourced calculations
- Real-time progress visibility
- Certified results
- Fixed pricing per project

**Message (HE):** "אין לכם חשב כמויות? אנחנו נעשה את העבודה, ואתם תראו הכל במערכת."

**Message (EN):** "No quantity surveyor? We'll do the work, and you'll see everything in the system."

---

## 5. Homepage Sections Structure

### Section 1: Hero

- Bold headline with value proposition
- Subheadline explaining the platform
- Two CTAs: "התחילו בחינם" (primary) + "הזמינו הדגמה" (secondary)
- Background: abstract geometric pattern or construction imagery
- Optional: animated statistics counter

### Section 2: Trusted By (Social Proof)

- Logo carousel of customers/partners
- "X פרויקטים חושבו ב-RevBrain"
- Trust badges (security certifications if any)

### Section 3: Features Overview

- 3-4 key feature cards with icons
- Interactive demo preview or video
- "Before/After" visual comparison

### Section 4: Calculation Modules

- Grid/carousel of 20 modules with icons
- Brief description of each
- Filter by category (earthworks, walls, infrastructure, etc.)

### Section 5: Use Cases (Tabs or Cards)

- Tab for each persona
- Workflow illustration
- Key benefits per persona
- CTA per persona

### Section 6: Pricing

- 3-4 pricing tiers (Starter, Professional, Business, Enterprise)
- Feature comparison table
- Annual/Monthly toggle
- Enterprise: "Contact Sales"
- Clear "התחילו בחינם" button

### Section 7: About the Company

- Company mission and vision
- Brief history/founding story
- Key differentiators

### Section 8: Leadership Team

- Photos and bios of key team members
- LinkedIn links (optional)
- Professional, trustworthy presentation

### Section 9: Testimonials

- Customer quotes with photos
- Company logos
- Video testimonials (if available)

### Section 10: FAQ

- Accordion with common questions
- Searchable if many questions

### Section 11: Contact / Get Started

- Contact form
- Phone, email, address
- Map (optional)
- WhatsApp integration (common in Israel)

### Section 12: Footer

- Navigation links
- Social media
- Legal (Terms, Privacy)
- Language switcher
- Newsletter signup

---

## 6. Integration Requirements

### Authentication Integration

The homepage must integrate with the main application at `app.revbrain.com`:

**Login Button:**

- URL: `https://app.revbrain.com/login`
- Opens in same tab
- Visible in header (all pages)

**Signup Flow:**

- URL: `https://app.revbrain.com/signup`
- Or: `https://app.revbrain.com/signup?plan=professional` (with plan preselected)
- Primary CTA throughout the site

**Pricing CTA Links:**
| Plan | URL |
|------|-----|
| Free Trial | `https://app.revbrain.com/signup?plan=free` |
| Starter | `https://app.revbrain.com/signup?plan=starter` |
| Professional | `https://app.revbrain.com/signup?plan=professional` |
| Business | `https://app.revbrain.com/signup?plan=business` |
| Enterprise | Opens contact form / `mailto:sales@revbrain.com` |

### Analytics & Tracking

- Google Analytics 4 integration
- Facebook Pixel (optional)
- LinkedIn Insight Tag (B2B)
- Hotjar or similar for heatmaps

### SEO Requirements

- Server-side rendering (SSR) or Static Site Generation (SSG)
- Proper meta tags per page (title, description, og:image)
- Structured data (Organization, Product, FAQ schemas)
- XML sitemap
- robots.txt
- Canonical URLs for language variants

---

## 7. Pricing Tiers

### SaaS Subscription

| Plan         | Target           | Price      | Key Features                                |
| ------------ | ---------------- | ---------- | ------------------------------------------- |
| Starter      | Freelancers      | ₪199/month | 3 projects, basic modules                   |
| Professional | Small firms      | ₪499/month | Unlimited projects, all modules             |
| Business     | Medium companies | ₪999/month | Team collaboration, API, priority support   |
| Enterprise   | Large orgs       | Custom     | Dedicated support, SLA, custom integrations |

### Managed Service

| Service      | Price Range    |
| ------------ | -------------- |
| Per Module   | ₪500-2,000     |
| Full Project | ₪5,000-20,000  |
| Retainer     | Custom monthly |

---

## 8. Calculation Modules (20 total)

**Earthworks & Demolition**

- עבודות עפר (Earthworks) - cut/fill calculations
- הריסות (Demolition)

**Paving & Landscaping**

- ריצוף וסלילה (Paving)
- אבני שפה (Curbs)
- פיתוח סביבתי (Landscaping)
- גינון (Gardening)

**Walls & Structures**

- קירות כובד (Gravity Walls)
- קירות מזוינים (Reinforced Walls)
- קירות קרקע משוריינת (MSE Walls)
- קירות חיפוי (Cladding Walls)
- עמודי בטון (Concrete Columns)

**Foundations**

- כלונסאות (Piles)
- עוגני סלע (Rock Bolts)

**Infrastructure**

- צנרת (Pipes)
- השקיה (Irrigation)
- בזק (Communications)
- תאורת רחוב (Street Lighting)
- תמרורים (Traffic Signs)

**Other**

- חריגים (Exceptions)
- רג'י (Regie/Daily Work)

---

## 9. SEO Keywords

**Primary (HE):**

- חשב כמויות
- תוכנת כמויות
- חישוב כמויות בנייה
- מערכת ניהול פרויקטים בנייה
- חשבון ביצוע

**Primary (EN):**

- quantity surveying software
- construction quantity calculator
- bill of quantities software
- QS platform Israel

**Long-tail (HE):**

- תוכנה לחישוב כמויות מתוכניות DXF
- מערכת לניהול חשבונות ביצוע
- חישוב קירות תמך אוטומטי

---

## 10. Competitive Advantages

### vs. Excel / Manual

- 10x faster calculations
- Zero transcription errors
- Full audit trail
- Professional reports

### vs. Generic CAD Software

- Purpose-built for Israeli standards
- Hebrew interface, RTL support
- Local BoQ formats (מחירון דקל, פלג)
- No CAD expertise required

### vs. International Platforms

- Hebrew language native
- Israeli standards compliance
- Local support
- NIS pricing
