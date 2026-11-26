# Cortex Fantasy — v0.1.7

Foundry V14 preview system. Install as `Data/systems/cortex-fantasy` after closing Foundry, then restart. Existing Actor data remains compatible with 0.1.5.

## Changes
- **Hinder Distinction** in the dice-pool builder. Select a Distinction and check Hinder: d10→d6, d8→d4, d6→no die. One Hindered Distinction per roll. Award **+1 Plot Point when the confirmed result posts to chat**. You cannot spend that PP on the same roll. Hindering is narrative, not free PP farming.
- **Roll confirmation Plot Point options:** select *Use 1 Plot Point: keep a third die in your total* and/or *Use 1 Plot Point: keep a second effect die*. Choose 3 total dice or an EXTRA EFFECT die in the selection table accordingly. Each costs 1 PP. The dialog prevents spending more than the actor has. PP is deducted only on confirmation.
- **Use Plot Point button** on sheet, for a d6 temporary asset, extending or sharing an asset, contest interference, staying in the fight, Ability activation, or a GM-approved use. Manual spend records a chat message and subtracts 1 PP. This does not automatically create an asset or manage contest mechanics.
- **No extra rolling or Dice So Nice replay** on confirmation. The original roll results are posted to chat.

## Important limitations
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
