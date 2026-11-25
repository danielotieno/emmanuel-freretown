# Personal-data breach response

| | |
|---|---|
| Status | Draft, to be adopted by the Vicar before go-live |
| Decision | D42: the Vicar is the breach contact and notifies the Data Commissioner; the technical lead responds first |
| Law | Data Protection Act, 2019, s. 43; Data Protection (General) Regulations, 2021, regs. 37–38 |

## What counts as a breach

Any time members' or staff personal data may have been seen, copied, changed or destroyed by someone not authorised. For example:
- someone outside the parish gets into the database, a backup, the staff portal or a vendor account
- a staff account is used by someone else, or its password or second factor leaks
- an export or screenshot of member data is shared outside the parish
- member data shows up in logs, error reports, a GitHub issue or a public page

**When in doubt, report it.** It is better to report something that turns out to be nothing than to miss the 72-hour deadline.

Every record in the registry reveals religious affiliation (sensitive data), so assume that a breach of member records carries "a real risk of harm" (s. 43(1)) unless the assessment shows otherwise. A leaked staff login (an account name with a password or code) is notifiable under reg. 37(1)(b).

## Contacts

| Role | Who | Responsibility |
|---|---|---|
| First responder | Technical lead | Contain, investigate, brief the Vicar, draft the notifications |
| Breach contact (decides and notifies) | Vicar, for the parish as data controller (D23) | Decides whether the breach is notifiable; signs and sends notifications |
| Deputy, if the Vicar is unreachable | _to be named by the Vicar before go-live_ | Same authority as the Vicar for this procedure |

Contact numbers are kept in the parish's records and with each person on this list, not in this repository.

## Timeline

The clock starts when anyone at the parish, or any of our vendors, **becomes aware** of the breach. It does not wait for the investigation to finish.

| By | Step |
|---|---|
| Immediately | Whoever notices tells the technical lead (or, if unreachable, the Vicar). Don't discuss details in WhatsApp groups, GitHub issues or email threads with other people |
| Within 4 hours | **Contain.** Depending on what happened: revoke staff sessions, rotate the affected credentials (Neon roles, Cloudflare tokens, Mobile Sasa API token and webhook secret, GitHub secrets), block the staff portal in Cloudflare Access, or replace the public site with a maintenance page. Preserve evidence: audit log, Cloudflare and Neon logs. Take nothing down permanently and delete nothing |
| Within 24 hours | **Assess and brief the Vicar:** what data, how many people, how it happened, whether it is still happening, and whether there is a real risk of harm. Start a written timeline (reg. 38(1)(b) asks for one) |
| Within 72 hours of awareness | **Notify the Data Commissioner** (s. 43(1)(a)), signed by the Vicar, through the ODPC's current breach-notification channel (check odpc.go.ke for the form). If any detail is still unknown, send what is known and add the rest later (s. 43(7)). If the 72 hours are missed, notify anyway, with the reasons for the delay (s. 43(2)) |
| As soon as reasonably practical | **Tell affected members in writing** (s. 43(1)(b)), in English and Kiswahili: by SMS to their own phone where the content allows, otherwise through the church office. This may be delayed only if the police ask, for an investigation (s. 43(4)). It is not required if the data was protected, for example encrypted, so the breach exposes nothing (s. 43(6)). If members are not told, the notice to the Data Commissioner must say why (reg. 38(2)) |
| Within 2 weeks | Review: what failed, what changes, who does what. Record it in the parish's breach register. Update the DPIA if the risk picture changed |

Vendors (data processors) must tell us within 48 hours where reasonably practicable (s. 43(3)). Check each data processing agreement says so; Mobile Sasa, Sentry and GitHub notify the email address on the church-owned account; Neon and Cloudflare notify the technical lead's account (D40). Both inboxes must be watched.

## What the notification to the Data Commissioner contains (reg. 38(1))

1. When and how the parish became aware of the breach.
2. A dated account of every step taken since then, including how it was assessed as notifiable.
3. How the breach happened, if known.
4. How many members or other people are affected.
5. What personal data was involved.
6. The possible harm to the people affected.
7. What has been done, or will be done, to limit the harm and fix the cause.
8. Whether and how affected people or the public have been told, and what they can do to protect themselves.
9. Contact details of the Vicar (or deputy) as the parish's authorised representative.

## What the message to members contains (s. 43(5))

- What happened, in plain words.
- What the parish has done and will do.
- What the member can do to protect themselves (for example, be wary of calls or messages claiming to be from the church).
- Who took the data, if known.
- Who to contact for more information: the church office.

Never include another member's details in a notice.

## Records

Keep a breach register in the parish's records (not in GitHub): every incident, including ones judged not notifiable, with the timeline, the decision and who made it. The register itself must not contain more personal data than needed.
