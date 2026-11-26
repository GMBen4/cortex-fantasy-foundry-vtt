# Cortex Fantasy — v0.1.8

Targets Foundry V14 Build 369. With Foundry closed, extract the versioned ZIP into `Data/systems/` so that `system.json` is at `Data/systems/cortex-fantasy/system.json`. Restart Foundry.

## v0.1.8 changes

- A roll with zero or one non-hitch die can be confirmed. Missing total dice contribute zero. The fallback effect is d4.
- The pool builder allows one Specialty per roll and shows inline feedback if more than one is selected.
- Existing unlinked PC tokens open the original world Actor sheet. Their link settings and local overrides remain stored on the token. New PC Actors still default to linked prototypes. NPC sheets use Foundry's normal routing.
- The sheet preserves its active tab's scroll offset during rerenders. Plot Point changes are applied before chat announcements.

## v0.1.8 limitations

- Existing unlinked PC tokens keep their token-local state for other Foundry mechanics. Opening the world Actor sheet requires the world Actor to exist and the user to have access.
- Plot Point updates are queued per Actor on each client. Concurrent updates from different clients can still race. If chat posting fails after a successful Actor update, the Plot Point change remains applied.
- Build 369 and Dice So Nice need live verification with the checklist below.

## v0.1.8 testing checklist

| Test on Foundry V14 Build 369 | Result |
| --- | --- |
| Install the ZIP in a copy of a v0.1.7 world. Confirm existing character fields, tabs, and creation budgets still work. | Pass / Fail / Skip |
| Confirm all-hitch and one-usable-die rolls. Expect totals of zero and the usable result respectively, d4 effects, and hitch markers. | Pass / Fail / Skip |
| Select two Specialties. Confirm the builder blocks rolling and preserves selections. Deselect one and roll. | Pass / Fail / Skip |
| As a player, open linked and existing unlinked PC tokens. Confirm both open the world Actor sheet and the unlinked token retains its overrides. Verify linked and unlinked NPCs behave as before. | Pass / Fail / Skip |
| From the bottom of a long tab, use PP +/−, Use Plot Point, and a roll that changes PP. Confirm the tab and scroll offset stay in place. | Pass / Fail / Skip |
| Verify successful PP updates precede chat announcements. Simulate an Actor update failure and confirm no announcement is posted. | Pass / Fail / Skip |
| Confirm each Hinder step (d10 → d6, d8 → d4, d6 → no die). Confirm the award is 1 PP and cannot fund that roll. Cancel a Hindered roll and check that PP is unchanged. | Pass / Fail / Skip |
| Confirm a normal roll and a roll using both PP purchases. Verify totals, separate effect dice, and PP deductions. With Dice So Nice enabled, verify one animation and the same dice in chat. | Pass / Fail / Skip |

**Additional Observations:** _______________________

To create the versioned install ZIP from the reviewed commit:

```sh
git archive --format=zip --prefix=cortex-fantasy/ -o cortex-fantasy-0.1.8.zip HEAD
```

## v0.1.7 changes
- **Hinder Distinction** in the dice-pool builder. Select a Distinction and check Hinder: d10→d6, d8→d4, d6→no die. One Hindered Distinction per roll. Award **+1 Plot Point when the confirmed result posts to chat**. You cannot spend that PP on the same roll. Hindering is narrative, not free PP farming.
- **Roll confirmation Plot Point options:** select *Use 1 Plot Point: keep a third die in your total* and/or *Use 1 Plot Point: keep a second effect die*. Choose 3 total dice or an EXTRA EFFECT die in the selection table accordingly. Each costs 1 PP. The dialog prevents spending more than the actor has. PP is deducted only on confirmation.
- **Use Plot Point button** on sheet, for a d6 temporary asset, extending or sharing an asset, contest interference, staying in the fight, Ability activation, or a GM-approved use. Manual spend records a chat message and subtracts 1 PP. This does not automatically create an asset or manage contest mechanics.
- **No extra rolling or Dice So Nice replay** on confirmation. The original roll results are posted to chat.

## v0.1.7 limitations
- A roll is not posted and no PP is adjusted if the second dialog is canceled.
- Hindered d6 Distinctions contribute no die but award PP after posting a roll with sufficient remaining dice.
- Only one Distinction can contribute to a given pool.
- At least two non-hitch dice are needed for two-die total (same as earlier versions).
- Spending Plot Points on narrative uses is **tracked and announced**, but does not automate creation/ownership of temporary assets, contest joining, or avoiding stress.
- Abilities remain descriptive notes.

## v0.1.7 testing checklist
1. d10 distinction Hindering contributes d6 and earns +1 PP upon confirmation.
2. d8 distinction Hindering contributes d4 and earns +1 PP.
3. d6 distinction Hindering contributes no die and earns +1 PP.
4. Canceling the second dialog neither spends PP nor awards Hinder PP.
5. Spending 1 PP permits exactly 3 total dice; displays correct total and deducts 1 PP.
6. Spending 1 PP permits an extra effect die; displays both effect sizes and deducts 1 PP.
7. Cannot spend more PP than currently available; newly earned Hinder PP cannot fund the current roll.
8. Sheet-level Use Plot Point opens choices, deducts 1 PP, and posts to chat.
9. Normal two-total, one-effect rolls still post correctly with no second animation.
10. Tabs, persistence, scroll position, actor-linked tokens, budgets remain functional.

**Additional Observations:** _______________________

## v0.1.7 fixes

- Hindered d6 Distinctions contribute **no die** (rather than an invalid d2) while awarding 1 PP on a confirmed roll.
- The roll selection dialog validates dice assignments and available Plot Points *before* confirmation. The Confirm button remains disabled and an inline message explains the issue until corrected. The rolled dice and selections are preserved while adjusting.
- Existing v0.1.6 characters and all stored traits remain compatible.
