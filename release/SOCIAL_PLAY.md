# Social play candidate

## Decision
Ship a small friend-challenge loop: photo-free 1080×1920 cards, mode-aware captions with portable codes, and Friend’s turn on one phone. These are friendly reported scores, not verified competitive rankings. Public links use https://www.playblinkstop.com/ with a challenge fragment and require an explicit Accept tap. No accounts, contacts access, auto-posting, analytics or additional provider are required.

## Player flow
1. Finish a valid round. Disqualified rounds cannot create or export a card or challenge.
2. Share Challenge sends a caption. Share Card sends a generated PNG and caption where the platform supports it. Save Card downloads on web or opens a native export sheet. The recipient app determines available posting destinations; attaching the image and caption manually always remains available on web.
3. A friend opens the play link and taps Accept, or pastes the code/caption under Got a challenge? The mode and Precision target are carried over. Scores compare at millisecond precision; higher survival wins, lower Precision error wins, equal results tie. Endurance/Surprise are capped at 30 seconds.
4. Friend’s turn releases the prior camera session and opens the same challenge. Surprise always shows the warning first; its timing is random for each round. Daily modifiers depend on local date and have no challenge code or comparison handoff.
5. Return to Menu or background the app to abandon the challenge and clear the result card/selfie from the UI. Challenge data remains in memory only. Exported copies are controlled by the player and receiving app.

## First step and evidence
Invite ten willing testers to try one round with a friend after device QA. Before the session, define an exploratory signal: at least five voluntarily export a card/caption, and at least three friends actually paste a code and finish a round without instructions. Record counts manually with their permission; do not add hidden telemetry. Observe whether people understand Precision error, can find the caption, and prefer a card or text. This small test is learning, not proof of virality or a representative conversion rate.

## Main risk and what changes the decision
Code entry adds friction, and an entertaining screenshot may not bring another player. If friends do not accept or complete challenges, simplify onboarding/copy before adding more modes or spending on acquisition. Observe whether direct challenge links reduce this friction. Genuine multiplayer, authenticated rankings, uploaded photos, and paid ads would require a separate data/policy design.

## Grounding
Applied the council's published frameworks, not endorsements by the authors:
- Marty Cagan: assess the user problem and value/usability/feasibility/viability risks. Favor a feasible loop over pretending a backend or demand exists. https://www.svpg.com/four-big-risks/
- Teresa Torres: test risky assumptions through observable behavior. The assumption is that a fun result prompts a friend to play, not merely to say they like the card. https://www.producttalk.org/discovering-solutions/
- David Ogilvy: research-led messages and revise when evidence contradicts them. Use a specific, understandable target instead of unsupported viral claims. https://www.ogilvy.com/ap/ideas/ogilvy-75-quotations-david-ogilvy-1

## Required physical checks
On iPhone and Android, test the native sheet with PNG plus text; Save Card destinations; cancellation/retry; app switch/background; Friend’s turn releasing the old camera; Surprise warnings and sound; Precision target parity; image/caption readability in actual social destinations; and local data deletion. Synthetic browser fixtures do not establish camera accuracy or social-app compatibility. Signed device builds and store submission remain pending.
