# CPQ-to-RCA Migration Discovery Methodology & Questionnaire

**Version:** 1.0
**Status:** For architectural review and executive sign-off
**Audience:** External auditors, CTO, CEO
**Classification:** Internal — contains methodology IP

---

## 1. Purpose of This Document

This document defines the **complete discovery methodology** for assessing a Salesforce CPQ org prior to migration to Revenue Cloud Advanced (RCA). It is the authoritative specification for how RevBrain's Migration Planner gathers the information necessary to produce a defensible, customer-facing migration assessment.

The document has three parts:

1. **§2–4: Methodology** — Why full automation is impossible, what the three-phase discovery process is, and why this specific architecture is the optimal design.
2. **§5–6: Automated extraction scope** — What the automated extractor covers (and its known limits).
3. **§7–10: Structured questionnaire** — The human-driven discovery questions that close the gap between what code reveals and what a migration requires.

A reviewer should be able to read this document and conclude: "this system, when fully implemented, will produce a migration assessment that does not have unknown unknowns."

---

## 2. Why Full Automation Is Impossible

A natural engineering instinct is to automate everything. Connect to the org, walk the metadata, analyze the code, produce the report. Zero human input. This instinct is wrong for CPQ migration, and the reasons are not incidental — they are fundamental.

### 2.1 The Information Asymmetry Problem

A Salesforce CPQ org contains two categories of migration-relevant information:

**Category A: Machine-readable artifacts.** Schema definitions, Apex source code, JavaScript QCP bodies, price rules, product rules, discount schedules, validation rules, flow definitions, custom settings, approval processes. These are stored in Salesforce metadata or data, retrievable via SOQL, the Tooling API, or the Metadata API. They are the _what_ of the org.

**Category B: Human-held context.** Why a specific price rule exists. What external system a callout endpoint connects to and what contract governs it. Which validation rules are known workarounds for upstream data quality problems. What the quarterly pricing review process looks like. Which features were abandoned mid-implementation and should be deleted rather than migrated. What the business will look like in 18 months and what the migration should prepare for. These are the _why_ and the _what next_ of the org.

**No API returns Category B.** It exists in Confluence pages, in the heads of the CPQ admin, in the sales VP's quarterly planning deck, in the Slack thread where the team decided to disable a feature. An extractor that claims to automate discovery without Category B is not producing a migration assessment — it is producing a metadata inventory with a confident-sounding wrapper.

### 2.2 The Completeness Ceiling

Even within Category A, there are hard limits on what an automated extractor can determine:

| Limitation                    | Why it's fundamental                                                                                                                                                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dynamic dispatch**          | Apex `Type.forName()` and JavaScript `eval()` create dependencies that are undecidable at static analysis time. The extractor can detect the _pattern_ but cannot resolve the _target_ without runtime instrumentation.                                                            |
| **External system behavior**  | The extractor sees that `HttpRequest.setEndpoint('https://pricing.acme.com/v2')` exists. It cannot call that endpoint, read its documentation, or determine what transformation it applies to quote data.                                                                          |
| **Data distribution**         | The extractor sees that `SBQQ__PriceRule__c` has 47 records. It cannot determine that 44 of them are dead rules that haven't fired in two years, and the remaining 3 are the entire pricing engine. Only usage data analysis + stakeholder confirmation can make that distinction. |
| **FLS visibility**            | The extractor runs as an integration user whose Field-Level Security may hide fields. It cannot discover what it cannot see, and it cannot always detect _that_ it cannot see it (SOQL silently drops FLS-restricted fields from results).                                         |
| **Managed package internals** | ISV-authored managed package code (e.g., Conga, DocuSign Gen) is compiled and obfuscated. The extractor can see that the package exists and what its public API surface is, but not what it does internally.                                                                       |
| **Future intent**             | The extractor sees the org as it is today. It cannot know that the customer plans to add multi-currency support next quarter, which would fundamentally change the migration scope.                                                                                                |

### 2.3 The Cost of Pretending

A system that produces an automated-only assessment will be wrong in one of two directions:

- **Over-scoping:** Treating every artifact as migration-critical because it cannot distinguish live logic from dead code. This inflates effort estimates and erodes customer trust.
- **Under-scoping:** Missing artifacts that live outside the extraction surface (external integrations, manual processes, managed package configurations). This produces a migration plan that fails on cutover.

Both failure modes are worse than a system that honestly declares: "here is what I found automatically; here is what I need a human to confirm."

---

## 3. The Three-Phase Discovery Architecture

RevBrain's Migration Planner uses a **three-phase discovery process** that combines automated extraction, LLM-driven targeted questioning, and structured stakeholder interviews. Each phase feeds the next.

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 1: AUTOMATED EXTRACTION                │
│  Connect to org → Walk metadata → Extract code → Build IR      │
│  Output: IRGraph + Assessment PDF (machine-generated)           │
│  Coverage: ~70–80% of Category A artifacts                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │ feeds
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              PHASE 2: LLM-DRIVEN TARGETED QUESTIONS             │
│  Analyze extraction findings → Identify ambiguities →           │
│  Generate concrete, evidence-backed questions                   │
│  Output: Targeted questionnaire specific to THIS org            │
│  Coverage: Resolves ~15–20% of remaining unknowns               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ feeds
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│            PHASE 3: STRUCTURED STAKEHOLDER INTERVIEW             │
│  Standard questions that apply to ALL CPQ orgs regardless       │
│  of extraction results — business process, future intent,       │
│  external dependencies, organizational readiness                │
│  Output: Complete discovery record                              │
│  Coverage: Closes remaining Category B gaps                     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 Why Three Phases (Not Two, Not One)

**Phase 1 alone** produces a metadata inventory, not a migration assessment. It cannot answer "why" questions.

**Phase 1 + Phase 3 alone** (the traditional consulting model: run a tool, then do interviews) wastes stakeholder time by asking generic questions that the tool already answered, and fails to ask the _specific_ questions that the tool's findings demand. If the extractor found 5 Apex classes implementing `QuoteCalculatorPluginInterface` but only 1 is active, the interviewer must ask "why do the other 4 exist?" — a question that only arises from the extraction results.

**Phase 2 bridges the gap.** The LLM reads the extraction output and generates questions that are _impossible to formulate without seeing the data first_. This is the key architectural innovation: the questionnaire is not static — it is a function of the org.

### 3.2 Phase 2: How LLM-Driven Questions Work

After Phase 1 produces the IRGraph and assessment findings, an LLM analysis pass reads each finding and generates targeted questions when it detects:

| Signal in extraction data                                      | Generated question category                                                                                                                                                      |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apex class with `dynamic_dispatch_warning` finding             | "This class uses `Type.forName()` to instantiate `<className>`. What class does it resolve to at runtime and under what conditions?"                                             |
| Active plugin class detected but 4 other candidates exist      | "We found 5 classes implementing `QuoteCalculatorPluginInterface`. Only `MyActiveQCP` is registered as active. Are the other 4 deprecated, or are they conditionally activated?" |
| Callout to external endpoint detected in QCP                   | "Your JS QCP calls `https://pricing.acme.com/v2/calculate`. What does this API return? Is there a fallback if the API is unavailable? Who owns this system?"                     |
| CMT with 200+ records classified as "Decision Table candidate" | "Your org has a Custom Metadata Type `Pricing_Exception__mdt` with 247 records. Is this a pricing rules engine? Are all 247 records active, or are some historical?"             |
| Flow with `very-high` complexity score (>100 elements)         | "Flow `CPQ_Quote_Approval_Router` has 143 elements. Is this the primary approval routing logic, or is there also an Apex-based approval path?"                                   |
| Validation rule formula referencing cross-object fields        | "Validation rule `Discount_Limit_Check` on `SBQQ__QuoteLine__c` references `Account.Tier__c`. Is this field maintained manually or populated by an integration?"                 |
| Multiple truncation warnings on QCP bodies                     | "Your JS QCP `Enterprise_Pricing_Engine` is 15,000+ lines. Is this a monolithic engine or are there logical sub-modules we should analyze separately?"                           |
| Scheduled Apex job touching CPQ objects                        | "Batch job `NightlyPriceRefresh` runs on a CRON schedule against `SBQQ__ContractedPrice__c`. What does it do, and is there a manual fallback if it fails?"                       |

These questions are **impossible to ask without the extraction data** and **impossible to answer without a human**. That is precisely why Phase 2 exists.

---

## 4. Why This Architecture Is Optimal

### 4.1 Compared to Alternatives

| Alternative approach                                                | Why it's inferior                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Pure automation (no questionnaire)**                              | Produces a metadata inventory, not a migration assessment. Cannot resolve Category B. Will systematically under-scope on mature orgs.                                                                                                            |
| **Pure consulting (no automation)**                                 | Requires a CPQ expert to spend 3–5 days manually walking the org. Expensive, error-prone, non-reproducible. Cannot guarantee completeness because humans forget to check things.                                                                 |
| **Static questionnaire only (no automation)**                       | Asks the customer "how many Apex classes do you have?" — a question the system should answer automatically. Wastes stakeholder time, produces imprecise answers ("about 50"), and misses artifacts the customer doesn't know about.              |
| **Automation + static questionnaire (no LLM targeting)**            | Better than the above, but the questionnaire cannot ask org-specific questions. Misses the highest-value discovery: "we found _this specific thing_ in your org — explain it."                                                                   |
| **Our approach: Automation + LLM targeting + structured interview** | Maximizes signal extraction per minute of stakeholder time. Automated pass handles Category A; LLM generates Category-B questions that are specific to the org; structured interview covers the universal topics that no extraction can address. |

### 4.2 Stakeholder Time Efficiency

Executive stakeholders (VP Sales, CTO) have limited time for migration discovery. The three-phase model minimizes their required input:

- **Phase 1** requires zero stakeholder time (fully automated).
- **Phase 2** produces a short, targeted questionnaire (typically 10–20 questions) that can be completed asynchronously via a shared document or a 30-minute call.
- **Phase 3** is a structured 60–90 minute interview covering universal topics.

Total stakeholder time: **~2 hours.** Compare to the traditional consulting model: 3–5 days of workshops.

---

## 5. Automated Extraction Scope (Phase 1)

The automated extractor's current coverage and known gaps are documented in detail in [CPQ-EXTRACTION-COVERAGE-GAPS.md](file:///Users/danielaviram/repos/revbrain/docs/CPQ-EXTRACTION-COVERAGE-GAPS.md). In summary:

**Fully extracted (with body/code):** JS QCPs, customer Apex classes and triggers, formula fields, custom settings with hierarchy overrides, quote templates (sections, content, line columns, merge fields, JS blocks).

**Inventory only (metadata, no body):** Flows, validation rules (no formula), custom metadata types (no records), permission sets, workflow rules.

**Not extracted:** LWC, Aura, Visualforce, Static Resources, email templates, remote site settings, page layouts, FlexiPages, scheduled Apex, custom permissions, document generation packages, translation workbench entries, field history tracking configuration, Big Object archives.

**Cannot extract (fundamental limits):** External system behavior, managed package internals, business intent, data distribution patterns, future roadmap, organizational readiness.

The gap closure plan in the coverage gaps document will close the "inventory only" and "not extracted" categories for an estimated 22 engineer-days of effort. The "cannot extract" category is permanent — it is addressed by Phases 2 and 3 below.

---

## 6. LLM-Driven Targeted Questions (Phase 2)

Phase 2 questions are generated programmatically from the extraction results. They are not enumerated here because they are a function of each specific org. The generation rules are documented in §3.2 above.

The output of Phase 2 is a document titled **"Org-Specific Discovery Questions for [Customer Name]"** containing 10–30 questions, each with:

- The finding ID and artifact reference that triggered the question.
- The question text.
- Why the answer matters for migration scoping.
- A suggested response format (free text, yes/no, pick-list).

This document is generated after the Phase 1 extraction completes and before the Phase 3 interview is scheduled.

---

## 7. Structured Stakeholder Questionnaire (Phase 3)

The following questionnaire is **org-independent**. It covers the universal topics that cannot be determined from code or metadata, regardless of how complete the extraction is. It is designed to be administered in a single 60–90 minute structured interview with the following stakeholders present:

| Role                                    | Why they're needed                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **CPQ Admin / Salesforce Admin**        | Knows the configuration, the workarounds, and the history of every custom setting toggle.           |
| **Sales Operations Lead**               | Knows the actual business process — what happens between "rep opens a quote" and "order is booked." |
| **IT Lead / Architect**                 | Knows the integration landscape, the DevOps pipeline, and the technical debt ledger.                |
| **Executive Sponsor (VP Sales or CTO)** | Knows the business drivers for migration and the timeline constraints. Can make scope decisions.    |

> [!IMPORTANT]
> Questions marked with **(BLOCKING)** must be answered before the migration assessment can be finalized. The assessment report will flag any unanswered blocking questions as open risks.

---

### 7.1 Business Process & Quote Lifecycle

These questions establish the end-to-end business process that the CPQ implementation supports. They cannot be inferred from metadata because they describe _how humans use the system_, not what the system contains.

| #    | Question                                                                                                                                                                       | Why we ask                                                                                                                                                                                                         | BLOCKING? |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| BP-1 | Describe the complete quote-to-cash lifecycle in your org, from opportunity creation to revenue recognition. Include manual steps, approval gates, and handoffs between teams. | Establishes the process boundary. The migration must preserve every step; a step missing from our extraction is a step we'll break on cutover.                                                                     | Yes       |
| BP-2 | How many distinct quoting workflows exist? (e.g., new business vs. renewal vs. amendment vs. co-termination)                                                                   | Each workflow may exercise different CPQ features and different code paths. A migration that covers 3 of 4 workflows is incomplete.                                                                                | Yes       |
| BP-3 | What is the average number of line items per quote? What is the maximum you've seen in production?                                                                             | Performance is a migration risk. RCA's calculation engine has different performance characteristics than CPQ's. A 500-line-item quote that takes 8 seconds in CPQ may take 45 seconds in RCA without optimization. | Yes       |
| BP-4 | Are there seasonal or periodic pricing events? (e.g., quarter-end discounts, annual price increases, promotional periods)                                                      | Temporal behaviors may be implemented as custom setting toggles, scheduled Apex, or manual admin actions — none of which are visible in a point-in-time extraction.                                                | No        |
| BP-5 | What manual steps exist that involve data entry outside of Salesforce? (e.g., Excel-based pricing calculators, manual ERP reconciliation, email-based approvals)               | Manual steps are invisible to the extractor but must be accounted for in the migration plan. If the process depends on an Excel step, the RCA implementation must either automate it or preserve it.               | Yes       |
| BP-6 | Are there any known "workaround" processes that exist because CPQ couldn't support the desired behavior?                                                                       | Workarounds are the highest-value discovery input. They reveal both the limitations the customer has hit and the creative solutions they've built, both of which inform RCA design.                                | No        |

---

### 7.2 Pricing & Discounting Logic

These questions address the business rules that drive pricing outcomes. The extractor can see price rules and discount schedules; it cannot see the _intent_ behind them.

| #    | Question                                                                                                                                                              | Why we ask                                                                                                                                                                                                       | BLOCKING? |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| PD-1 | How many distinct pricing models does your org support? (e.g., list price, cost-plus, tiered volume, subscription, usage-based, outcome-based)                        | Each pricing model maps to a different RCA pricing procedure architecture. An org with 5 models requires 5 different migration strategies.                                                                       | Yes       |
| PD-2 | Are there pricing rules or discount logic that are implemented outside of CPQ standard objects? (e.g., in Apex, in a JS QCP, in an external system, in a spreadsheet) | This validates the extraction results. If the customer says "yes, our real pricing engine is in Apex" but the extractor didn't classify that Apex class as a plugin, we have a gap.                              | Yes       |
| PD-3 | Which pricing rules are actively used vs. legacy/deprecated? Can you identify rules that should be retired during migration?                                          | A common finding is that 30–60% of price rules are dead code. Migrating dead rules wastes effort and introduces confusion. Only the customer can confirm which are live.                                         | No        |
| PD-4 | Are there any pricing calculations that depend on data from external systems? (e.g., real-time FX rates, ERP cost lookups, third-party pricing services)              | External pricing dependencies require integration work in RCA that is not visible from the CPQ metadata.                                                                                                         | Yes       |
| PD-5 | How is multi-currency handled? Are there currency-specific pricing rules or discount schedules?                                                                       | Multi-currency adds significant complexity to identity hashing and to RCA pricing procedures. The extractor detects `CurrencyIsoCode` fields but cannot determine the business rules around currency conversion. | No        |
| PD-6 | Are there partner or channel pricing models that differ from direct sales pricing?                                                                                    | Partner pricing often uses separate price books, custom logic, or partner community components — each requiring different migration treatment.                                                                   | No        |

---

### 7.3 Approval Processes

| #    | Question                                                                                                                                                  | Why we ask                                                                                                                                                     | BLOCKING? |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| AP-1 | Describe the approval matrix: who approves what, at what thresholds, and through which channels (SF approvals, Advanced Approvals, email, Slack, manual)? | The extractor sees the approval process _configuration_ but not the _intent_. A $10K threshold may be a regulatory requirement or an arbitrary legacy setting. | Yes       |
| AP-2 | Are there approval steps that occur outside of Salesforce? (e.g., legal review in DocuSign, finance approval in an ERP, executive approval via email)     | Out-of-platform approvals are invisible to the extractor but critical to the migration — they represent integration points that must be preserved.             | Yes       |
| AP-3 | Are Advanced Approvals (`sbaa__`) in active use, or has the org migrated to standard Salesforce approvals?                                                | The extractor detects the namespace but cannot determine if it's actively used or a remnant of a prior implementation.                                         | No        |

---

### 7.4 External Integrations & Connected Systems

These questions address the most dangerous blind spot in any automated extraction: the behavior of systems _outside_ Salesforce.

| #    | Question                                                                                                                                                                                                                   | Why we ask                                                                                                                                                               | BLOCKING? |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| EI-1 | For each external endpoint detected by our extractor, provide: (a) what the external system is, (b) who owns it, (c) what data flows in each direction, (d) whether there is an SLA or contract governing the integration. | The extractor sees `HttpRequest.setEndpoint(url)` but cannot call the endpoint or read its documentation. Only the customer knows what happens on the other side.        | Yes       |
| EI-2 | Are there integrations that push data _into_ Salesforce CPQ from external systems? (e.g., ERP → CPQ product sync, MDM → CPQ account sync, pricing engine → CPQ price updates)                                              | Inbound integrations are invisible to the extractor because they originate outside Salesforce. They are migration-critical because RCA's API surface differs from CPQ's. | Yes       |
| EI-3 | Are there middleware or ETL tools in use? (e.g., MuleSoft, Dell Boomi, Informatica, Talend, Workato, custom scripts)                                                                                                       | Middleware-driven integrations do not appear in Salesforce metadata. They are often the primary data pathway and must be re-pointed to RCA APIs.                         | Yes       |
| EI-4 | Is there a CPQ↔ERP integration for order activation, invoice generation, or revenue recognition? If so, which ERP and which integration platform?                                                                          | The order activation pathway is the most complex integration in most CPQ orgs and the most likely to break on cutover.                                                   | Yes       |
| EI-5 | Are there any real-time integrations (not batch/scheduled) that the quoting process depends on?                                                                                                                            | Real-time integrations are performance-sensitive. An RCA migration that increases latency on a real-time call can break the user experience.                             | No        |

---

### 7.5 Document Generation

| #    | Question                                                                                                               | Why we ask                                                                                                                                                                  | BLOCKING? |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| DG-1 | Which document generation tool is in use? (Native CPQ templates, DocuSign Gen, Conga Composer, Nintex Drawloop, other) | Each tool has a different migration path. Native CPQ templates migrate to RCA document generation; third-party tools may or may not have RCA-compatible versions.           | Yes       |
| DG-2 | How many distinct quote/proposal templates are in active use? Are any templates customer-facing vs. internal-only?     | Template count and customer visibility determine the migration effort and the tolerance for visual differences.                                                             | No        |
| DG-3 | Do any templates contain conditional logic, calculations, or dynamic sections?                                         | Conditional templates require the most complex migration; the extractor detects `<script>` blocks and conditional print fields but cannot determine their business purpose. | No        |
| DG-4 | Is e-signature integrated into the quote process? If so, through which vendor?                                         | E-signature integration touches the document generation pipeline, the approval process, and the contract lifecycle — all of which change in RCA.                            | Yes       |

---

### 7.6 Data Volume & History

| #    | Question                                                                                                      | Why we ask                                                                                 | BLOCKING? |
| ---- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------- |
| DV-1 | How many quotes are created per month? Per year?                                                              | Volume determines performance testing requirements and data migration scope.               | Yes       |
| DV-2 | What is the total record count for: Quotes, Quote Lines, Orders, Order Items, Contracts, Contracted Prices?   | Large volumes (>1M records) require a dedicated data migration strategy.                   | Yes       |
| DV-3 | Is historical quote data required after migration? If so, how far back?                                       | Historical data migration is optional but expensive. The customer must make this decision. | Yes       |
| DV-4 | Are there archived records (Big Objects, external archives) that must be preserved or migrated?               | Archived data is invisible to the standard extraction queries.                             | No        |
| DV-5 | Are there regulatory or compliance requirements around data retention for quotes, orders, or pricing history? | Compliance requirements constrain the migration timeline and the data migration strategy.  | Yes       |

---

### 7.7 Organizational Readiness & Change Management

These questions address the human and organizational factors that determine migration success. They are invisible to any technical extraction.

| #    | Question                                                                                                                             | Why we ask                                                                                                                                                                                          | BLOCKING? |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| OR-1 | How many active CPQ users are there? Which teams use CPQ? (direct sales, channel sales, deal desk, finance, operations)              | User count and team distribution determine training scope and rollout strategy.                                                                                                                     | Yes       |
| OR-2 | What is the current Salesforce release cadence? (e.g., "we deploy to production every 2 weeks" vs. "we deploy 2x/year")              | Release cadence determines how the migration will be sequenced alongside ongoing development. An org with continuous deployment needs a different cutover strategy than one with biannual releases. | No        |
| OR-3 | Is there a sandbox strategy? How many sandboxes exist and what are they used for?                                                    | Sandbox topology determines the migration testing strategy.                                                                                                                                         | No        |
| OR-4 | Are there other Salesforce orgs (partner community, customer portal, subsidiary orgs) that consume or produce CPQ data?              | Multi-org architectures require cross-org migration coordination.                                                                                                                                   | Yes       |
| OR-5 | What is the target migration timeline? Are there hard deadlines (e.g., contract renewal, fiscal year boundary, regulatory deadline)? | Timeline constraints determine whether a phased or big-bang migration is appropriate.                                                                                                               | Yes       |
| OR-6 | Is there internal Salesforce/CPQ expertise, or is CPQ managed by a consulting partner?                                               | This determines whether the customer can participate in migration validation or if RevBrain must provide end-to-end support.                                                                        | No        |

---

### 7.8 Known Technical Debt & Pain Points

These questions surface the most actionable discovery input: what the customer already knows is wrong.

| #    | Question                                                                                                                                | Why we ask                                                                                                                                                                   | BLOCKING? |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| TD-1 | What are the top 3–5 pain points with the current CPQ implementation?                                                                   | Pain points reveal both what to fix during migration and what to preserve. A pain point that the customer has learned to live with may actually be a feature they depend on. | No        |
| TD-2 | Are there CPQ features or customizations that are known to be broken, deprecated, or abandoned mid-implementation?                      | Dead code and broken features should be deleted during migration, not migrated. Only the customer can identify them.                                                         | No        |
| TD-3 | Are there known performance issues? (e.g., slow quote calculation, timeout errors, governor limit hits)                                 | Performance issues in CPQ may or may not exist in RCA. If the root cause is the customer's Apex/QCP code, it will follow the migration.                                      | No        |
| TD-4 | Has the org been through a previous migration or major re-implementation? If so, is there residual configuration from the prior system? | Residual configuration inflates the extraction results and the effort estimate. Only the customer can distinguish current config from historical debris.                     | No        |
| TD-5 | Are there any CPQ features you intentionally do not use? (e.g., "we have Advanced Approvals installed but use standard approvals")      | This distinguishes "installed and active" from "installed and ignored," which the extractor cannot always determine.                                                         | No        |

---

### 7.9 Future State & Migration Goals

| #    | Question                                                                                                                                                                   | Why we ask                                                                                                                                                                                 | BLOCKING? |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| FS-1 | What is the primary business driver for migrating from CPQ to RCA?                                                                                                         | Understanding the "why" constrains the "how." A migration driven by "CPQ is end-of-life" has different priorities than one driven by "we need usage-based pricing that CPQ can't support." | Yes       |
| FS-2 | Are there new business requirements that should be implemented _during_ migration rather than after? (e.g., new pricing models, new product types, new approval workflows) | Combining migration with new feature development changes the project scope and timeline. It must be scoped upfront.                                                                        | Yes       |
| FS-3 | What is the acceptable level of functional parity? Must the RCA implementation behave identically to CPQ, or are there areas where behavior changes are acceptable?        | 100% parity is the most expensive migration. If the customer accepts behavior changes in specific areas, the effort drops significantly.                                                   | Yes       |
| FS-4 | Are there other Salesforce modernization initiatives planned that should be coordinated with the CPQ→RCA migration? (e.g., Lightning migration, Flow migration, org merge) | Concurrent modernization creates dependencies and risks that must be managed.                                                                                                              | No        |
| FS-5 | Post-migration, who will own and maintain the RCA implementation?                                                                                                          | Maintenance ownership determines the level of documentation and knowledge transfer required.                                                                                               | No        |

---

## 8. Questionnaire Administration Protocol

### 8.1 Pre-Interview Preparation

Before the Phase 3 interview:

1. **Phase 1 extraction must be complete.** The automated findings form the evidence base for the interview.
2. **Phase 2 targeted questions must be generated.** These are sent to the customer 48 hours before the interview for asynchronous pre-review.
3. **The interviewer must have read the assessment PDF.** The interview is not a discovery session — it is a _confirmation and closure_ session. The interviewer should already know what the org contains; they are here to learn what the code does not say.

### 8.2 During the Interview

- Record the session (with consent) for post-analysis.
- For each Phase 2 targeted question that was not answered in the pre-read, ask it during the interview and document the answer.
- Walk through the Phase 3 structured questionnaire, skipping questions already answered by the extraction or Phase 2.
- For any **(BLOCKING)** question that the stakeholder cannot answer, record it as an open risk and assign an owner and a due date.

### 8.3 Post-Interview

- Update the assessment findings with the questionnaire answers.
- Re-run the LLM analysis pass with the combined extraction + questionnaire data to produce the final migration assessment.
- Any unanswered **(BLOCKING)** questions are surfaced in the assessment report as open risks with explicit impact statements.

---

## 9. Completeness Guarantee

When all three phases are complete and all **(BLOCKING)** questions are answered, the migration assessment can make the following claims:

| Claim                                                                                      | Basis                                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Every code-bearing artifact in the org has been identified."                              | Phase 1 extraction with gap closure (see [CPQ-EXTRACTION-COVERAGE-GAPS.md](file:///Users/danielaviram/repos/revbrain/docs/CPQ-EXTRACTION-COVERAGE-GAPS.md)). |
| "Every external integration has been catalogued with its owner and data flow."             | Phase 1 endpoint detection + Phase 3 question EI-1 through EI-5.                                                                                             |
| "Every manual process in the quote lifecycle has been documented."                         | Phase 3 questions BP-1, BP-5, BP-6.                                                                                                                          |
| "The effort estimate accounts for both live and dead code."                                | Phase 2 targeted questions on rule activity + Phase 3 questions TD-2, TD-5, PD-3.                                                                            |
| "The migration scope reflects the customer's future intent, not just their current state." | Phase 3 questions FS-1 through FS-5.                                                                                                                         |
| "Known unknowns are explicitly flagged as open risks."                                     | Unanswered BLOCKING questions documented in the assessment report.                                                                                           |

The system does **not** claim to eliminate unknown unknowns entirely — that is impossible. It claims to reduce them to a level where the remaining risk is bounded, documented, and manageable.

---

## 10. Document Control

| Version | Date       | Author                | Change                |
| ------- | ---------- | --------------------- | --------------------- |
| 1.0     | 2026-04-11 | RevBrain Architecture | Initial specification |

**Reviewers:**

- [ ] External Auditor (Software Architect / Senior CI)
- [ ] CTO
- [ ] CEO
