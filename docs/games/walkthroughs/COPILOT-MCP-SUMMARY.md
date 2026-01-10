# Microsoft 365 Copilot Integration for TeamDynamix

**Date:** January 9, 2026
**Purpose:** Feasibility assessment for integrating TeamDynamix with Microsoft 365 Copilot

---

## What Is This?

An integration that allows TeamDynamix customers to interact with their TDX data directly from **Microsoft 365 Copilot** in Outlook, Teams, and other Microsoft 365 applications using natural language.

**User Experience:**
- User in Outlook: *"Show my open tickets"*
- Copilot responds: *"You have 5 open tickets: [list with details]"*
- User: *"Log 2 hours to ticket #12345"*
- Copilot: *"✓ Logged 2 hours to ticket #12345"*

No need to open TeamDynamix, no need to remember URLs, no context switching.

---

## How It Works

Microsoft recently added support for **Model Context Protocol (MCP)** to Copilot, allowing external systems to extend Copilot's capabilities. We would build an **MCP Server** that acts as a bridge:

```
Microsoft 365 Copilot ←→ Our MCP Server ←→ TDX Web API (existing)
     (Customer)              (We build)         (No changes)
```

**Key Points:**
- **No changes to TDX application code or database**
- **No changes to TDX Web API**
- **Only new component:** MCP Server (middleware we build and host)
- **Customer setup time:** 15 minutes for IT admin in Microsoft Copilot Studio

---

## Business Value

### For TDX Customers
- **Increased adoption:** Users access TDX where they already work (Outlook/Teams)
- **Improved efficiency:** Natural language queries vs. navigating UI
- **Better user experience:** Contextual ticket info while reading emails
- **Modern integration:** Aligns with their Microsoft 365 investment

### For TeamDynamix
- **Premium feature:** Justifies higher pricing tier or add-on
- **Competitive differentiation:** Most ITSM vendors don't offer this yet
- **Customer retention:** Deeper integration with customer workflows
- **Market positioning:** Shows innovation and modern architecture

### Example Use Cases
- Service desk agent checks ticket status while replying to email
- Manager reviews team's time entries from Teams chat
- Employee searches knowledge base without leaving Outlook
- Mobile user logs time using Copilot voice interface

---

## Costs

### Development (One-Time)
- **MCP Server development:** 6-9 weeks, 1-2 developers
- **Testing and security:** 2-3 weeks
- **Documentation and customer onboarding materials:** 1-2 weeks
- **Total development:** ~10-14 weeks

### Ongoing Infrastructure (Monthly)
- **Hosting (Azure):** $100-500/month (scales with usage)
- **Maintenance:** Minimal - monitoring and occasional updates

### Customer Costs
- **Microsoft 365 Copilot:** ~$30/user/month (they purchase from Microsoft)
- **TDX integration:** Potential add-on pricing opportunity for us
- **Setup effort:** 15 minutes IT admin time, zero for end users

**Total for 50-user organization:**
- Development amortized: Reusable across all customers
- Our hosting: ~$300/month (serves all customers)
- Their cost: ~$1,500/month (50 × $30 Copilot licenses)

---

## Technical Feasibility

### ✅ Confirmed Viable
- Microsoft 365 Copilot **does support MCP** (GA as of 2025)
- TDX Web API **already has authentication** (Bearer tokens)
- **User-context authentication is possible** (each user sees only their data)
- **OAuth integration supported** (standard enterprise auth)

### ⚠️ Limitations to Consider
1. **Response size limit:** 450 KB per response
   - **Solution:** Paginate results, return 10-20 tickets at a time, not 100

2. **Rate limits:** 100 requests/minute per customer environment
   - **Assessment:** Should be sufficient for typical usage
   - **Monitoring:** Track usage patterns in pilot

3. **Token expiration:** TDX Bearer tokens expire (likely 4-24 hours)
   - **Solution:** Store encrypted credentials, auto-refresh tokens transparently

4. **Customer adoption:** Requires customers to have Microsoft 365 Copilot licenses
   - **Reality:** Many enterprise customers are actively deploying Copilot
   - **Opportunity:** Offer this as customers adopt Copilot

---

## Architecture Overview

### What We Build
**MCP Server** (new component)
- Accept requests from Microsoft 365 Copilot
- Authenticate users via OAuth
- Securely store user credentials (encrypted, Azure Key Vault)
- Call existing TDX Web API on behalf of user
- Return data in MCP format

**Initial Tools to Expose:**
- Get my tickets
- Search tickets
- Get ticket details
- Log time to ticket
- Update ticket status

### What Stays the Same
- ✅ TDX applications (TDNext, TDWorkManagement, etc.)
- ✅ TDX Web API endpoints
- ✅ Database and authentication system
- ✅ All existing customer integrations

### Deployment Model
**Recommended:** SaaS model - we host one MCP server serving all customers
- Each customer's IT admin configures their Copilot Studio to point to our MCP server
- Our server routes requests to appropriate customer TDX instance
- Easy to maintain and update

---

## Customer Integration Process

### Customer Prerequisites
- Microsoft 365 Copilot licenses purchased (from Microsoft)
- Access to Microsoft Copilot Studio (included with Copilot)
- Existing TeamDynamix account

### Setup Steps (Customer IT Admin)
1. Access Microsoft Copilot Studio (web portal)
2. Create new agent: "TeamDynamix Assistant"
3. Add MCP server URL (we provide)
4. Configure OAuth credentials (we provide)
5. Test with their account
6. Publish to pilot group or entire organization
7. **Total time: 15 minutes**

### End User Experience
1. First time: "Connect your TeamDynamix account" (enters credentials once)
2. Forever after: Just works - ask questions naturally in Copilot
3. **No training needed** - natural language interface

---

## Timeline Estimate

### Phase 1: MVP Development (10-12 weeks)
- Week 1-6: Build MCP server with core tools
- Week 7-9: Security hardening and testing
- Week 10-12: Documentation and pilot preparation

### Phase 2: Pilot (4-6 weeks)
- Week 1-2: Onboard 2-3 pilot customers
- Week 3-4: Gather feedback and iterate
- Week 5-6: Refine based on learnings

### Phase 3: General Availability (2-4 weeks)
- Week 1-2: Finalize documentation and support processes
- Week 3-4: Marketing materials and customer communications

**Total: 16-22 weeks from kickoff to GA**

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Limited customer adoption of Microsoft 365 Copilot | Medium | Start with early adopters; market grows rapidly |
| Response size limits affect functionality | Medium | Implement pagination; return summaries not full data |
| Token management complexity | Low | Use proven OAuth patterns; store credentials securely |
| Support burden for customer setup | Low | Provide clear documentation; 15-minute setup process |
| Microsoft changes MCP specification | Medium | MCP is open standard; Microsoft committed to support |

---

## Recommendation

### ✅ **Proceed with Pilot**

**Rationale:**
1. **Market timing:** Microsoft 365 Copilot adoption is accelerating
2. **Technical feasibility:** All components proven viable
3. **Low risk:** No changes to core TDX platform
4. **High value:** Significant differentiation and customer value
5. **Reasonable investment:** 10-14 weeks development, reusable across customer base

### Suggested Approach
1. **Approve MVP development** (10-12 weeks)
2. **Identify 2-3 pilot customers** (early Copilot adopters)
3. **Run controlled pilot** (4-6 weeks)
4. **Evaluate results** before full GA commitment
5. **Consider pricing model** (add-on or premium tier feature)

### Success Metrics for Pilot
- Setup time: < 30 minutes for customer IT admin
- User satisfaction: > 80% find it useful
- Technical reliability: > 99% uptime, < 2 sec response time
- Usage patterns: Average queries per user per day
- Customer feedback: 2 of 3 pilot customers want to proceed

---

## Next Steps

If approved:
1. **Form project team** (1-2 developers, 1 product manager)
2. **Finalize technical architecture** (1 week)
3. **Begin MVP development** (Week of January 20, 2026)
4. **Identify pilot customer candidates** (January)
5. **Set up project tracking and checkpoints** (bi-weekly reviews)

---

## Questions for Discussion

1. Does this align with our product roadmap priorities?
2. What pricing model makes sense? (Premium tier vs. add-on vs. included)
3. Which customers should we approach for pilot participation?
4. What timeline constraints exist (e.g., upcoming releases)?
5. Are there other Microsoft 365 integrations to consider alongside this?

---

**Contact for Technical Questions:**
Ben Heard - ben.heard@teamdynamix.com

**Prepared with:** Claude Code Analysis - January 9, 2026
