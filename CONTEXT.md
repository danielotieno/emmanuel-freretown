# Domain Language

Use these terms exactly, in conversation, code, tests and docs.

## Church structure

| Term | Meaning |
|---|---|
| **Parish** | ACK Emmanuel Freretown - Kengeleni as a whole |
| **HBC** | Home Based Cell: one of the parish's 11 zones (Jordan, Judea, Galilaya, Samaria, Zion Leisure, Zion Bombolulu, Zion Freretown, Damascus, Jerusalem, Bethlehem B, Bethlehem A). Every member belongs to exactly one. Code name: `hbc` |
| **Department** | A church group such as Mother's Union, KAMA / AMF, KAYO, Children Ministry. A member may belong to none or several |
| **Unit** | An HBC or a department. Administrators can deactivate a unit; it then can't be chosen on new registrations |
| **PCC** | Parish Church Council. Some seats are elected by the parish, some appointed, some held by clergy by right of office |
| **Vicar** | The parish priest; chairs the PCC |
| **Wardens** | Vicar's Warden (appointed) and People's Warden (elected) |

## Membership

| Term | Meaning |
|---|---|
| **Member** | An adult (18+) in the official registry, created by approving a registration or by importing the parish list (D47). Not a "user": members have no login in Release 1 |
| **FWO number** | Freewill offering number, issued per adult by the Church Secretary when they join. Digits only, never reused. Leading zeros don't count: "054" and "54" are the same number, stored as "54" (D61). Identifies a member; never proves who someone is |
| **New member** | A person registering who has no FWO number yet. The Secretary issues one before approval, and sets their HBC then if they didn't know it (D49) |
| **Imported member** | A member created from the parish list (D47, FR-13) rather than from a registration. Has no registration reference |
| **Registration** | An application to join (or update) the registry. Has a reference like `REG-7K3M9` |
| **Revision** | An immutable snapshot of a registration's details. Corrections add a revision; nothing is edited in place |
| **Self-registration** | Submitted by the member online, with phone OTP |
| **Assisted registration** | Captured by a Registration Officer on the member's behalf, usually at a desk |
| **Declared / confirmed department membership** | Declared: the member chose it. Confirmed: the department's leader signed the printed list and an election committee member entered it (D62). Department elections use confirmed rosters only |
| **Verification evidence** | A record of how something was checked: phone OTP, in person, or FWO confirmed by the Secretary. Evidence is not a status |
| **Status check** | The public page where someone proves control of a phone by OTP and sees the status of the record matching that phone and FWO |

## Statuses

| Thing | Values |
|---|---|
| Registration | `SUBMITTED`, `CORRECTION_REQUESTED`, `APPROVED`, `REJECTED`, `WITHDRAWN` |
| Member | `ACTIVE`, `INACTIVE`, `DECEASED`, `TRANSFERRED_OUT` |

## People who use the admin side

| Term | Meaning |
|---|---|
| **Staff user** | A login account for admin work. May link to a member record, but is a different thing |
| **Registration Officer** | Captures assisted registrations; cannot approve |
| **Membership Administrator** | Reviews and approves registrations; edits member records. Cannot approve a registration they captured |
| **Super Administrator** | Manages staff accounts and roles. Not the Secretary or a Warden |
| **Election Committee Member** | Release 2. Prints department and HBC lists for the leader or chairperson to sign, and enters roster confirmations and list checks (D62). HBC chairpersons, department leaders, Patrons and Matrons have no account |

## Elections (Release 2)

| Term | Meaning |
|---|---|
| **Election** | One contest for one HBC, department or the parish. HBC elections are for that HBC's members, department elections for that department's confirmed roster, the parish (PCC) election for every approved, active member (D54) |
| **Election round** | The HBC, department and PCC elections of one cycle, e.g. the January 2027 elections. Candidacy is limited per round (D56). A pilot belongs to no round |
| **Position** | A seat being filled, e.g. Chairperson. HBC elections fill Chairperson, Vice Chairperson, Secretary, Assistant Secretary, Treasurer; department elections Chairperson, Vice Chairperson, Secretary, Treasurer; the PCC election Parish Secretary, Parish Treasurer, People's Warden (D55) |
| **Candidate** | A member nominated for one position. One candidacy at a time per election round; free to stand again after losing or withdrawing, not after being elected (D56) |
| **Nomination** | Made beforehand or from the floor; closes before voting opens |
| **Electorate** | The frozen list of members eligible to vote in an election, taken when nominations close. HBC and department membership count as at the moment nominations open (D54) |
| **Participation** | The record that a member has voted. Never linked to their ballot |
| **Ballot** | The encrypted choices of one voter. No member reference, no timestamp |
| **Personal phone** | A phone number that belongs to one member only. No two active or inactive members share a number. A member may have none |
| **Online vote** | Cast from the member's own phone with FWO + phone OTP |
| **Manual vote** | Cast on paper on election day by a member without a personal phone, after an officer checks them in |
| **Check-in** | An officer recording that a member is voting manually. Blocks any online vote in their name, and is refused if they already voted online |
| **Abstain** | Leaving a position blank while voting on others |
| **Unopposed** | The only candidate for a position; elected without a vote |
| **Re-run** | A new vote for one position between only the candidates tied for first place |
| **Pilot** | A non-binding election run alongside paper; paper is official and electronic results stay sealed until the paper result is declared |
| **Turnout** | How many members could vote in an election, and how many voted online, manually, and at a pilot both. Kept after the records of who voted are removed (D53) |
| **Complaint** | A challenge to an election's result, raised within 5 days of the final result. While one is open, the records it concerns are not removed (D53) |

## Avoid

- "User" for members. Members are not users.
- "Verified member". Say which evidence exists.
- "Delete" for retention. Personal details are redacted; the record of the decision remains.
