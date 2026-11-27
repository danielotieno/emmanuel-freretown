# Members' requests about their data

| | |
|---|---|
| Status | v1, 27 Nov 2026 (#26). Removal on request awaits a decision (#74) |
| Owner | The Vicar (data protection in the parish) |
| Promised to members in | The privacy notice, "Your rights" (`privacy_rights_body`, `privacy_rights_how`) |

The privacy notice tells members to contact the church office to see their information, have it corrected, object to its use or ask for its deletion where the law allows, or withdraw their consent to storage outside Kenya. This is how the office and staff handle each request with the platform as it is today. Every staff action below is recorded in the audit log (BR-12), so the handling can be shown later.

## For every request

1. **Receive it.** By the contacts in the privacy notice, or in person. Record the date, the request and who took it in the church office's request register (paper or email), never in the platform's free-text reasons.
2. **Confirm who is asking.** An FWO number identifies a member but never proves who someone is (CONTEXT.md). Confirm in person, as at the officer desk, or by calling back the mobile number on the member's record. Don't act for someone else without the member's written authority.
3. **Act, using the steps below.** Write reasons in the platform without names, phone or FWO numbers, as the forms ask.
4. **Reply to the member** with what was done, or why it can't be done, and their right to complain to the Office of the Data Protection Commissioner (www.odpc.go.ke). Record the reply in the register.

If a request is unclear, or the law's deadline for it is in doubt, ask the Vicar before acting.

## See their information

- A member can check their own registration status, name and HBC on the status page after a code to their phone (FR-7).
- For everything else, a Membership Administrator opens the member's record (`/members/<id>`) or the registration (`/review/<id>`) and reads it to them, including the HBC history, departments and the record's audit trail. Opening a record is recorded (D31).
- Copies on paper or by email: only to the member themselves, confirmed as above.

## Have wrong information corrected

- **A registration not yet approved:** if a correction was requested, a Registration Officer or Membership Administrator enters it at `/corrections` (FR-5). Otherwise the administrator asks for a correction from the review page, then it is entered.
- **A member:** a Membership Administrator edits the name, mobile number, SMS language or departments on the member's record, or moves them to another HBC, with a reason (FR-6).
- **The FWO number** can't be edited: a changed number would free the old one for reuse (D2). Raise it with the technical lead; it needs its own decision.

## Object, ask for deletion, or withdraw consent to storage outside Kenya

The platform keeps the FWO number of everyone who was ever a member, no longer linked to a name once their details are removed, so the number is never issued to anyone else (D2, BR-02). Nothing below removes it, and the audit log keeps its entries (FR-11), without their personal values.

- **A member who has left the parish or died:** a Membership Administrator marks the record transferred out or deceased, with a reason (FR-6). Their name, phone number and departments are removed automatically one year later (D45). Tell the member, or the family, about that year.
- **A registration not yet approved:** a Membership Administrator rejects it with the reason "Withdrawn at the member's request" until the withdraw action exists (#123). Its details are removed 12 months later (BR-14).
- **A member who stays, but asks for deletion or withdraws consent to storage outside Kenya:** the platform can't yet remove their details at once. Removal on request is proposed as D54 in #74 and still needs the Vicar's decision. Until then:
  - record the request and tell the member it is held, and when it will be acted on;
  - offer to keep their details on paper in the church office, as the notice says;
  - do not delete or blank fields by hand: an edit can't remove the audit trail's copy, and a blank record breaks the rules on FWO numbers (BR-01, BR-02).

## Not covered here

- Election records (Release 2): removed automatically after each election (D51, D52); complaints about results are D53 and Q29.
- A data breach: `breach-response.md`.
- How long each kind of data is kept: `retention-schedule.md`.
