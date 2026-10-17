# Admin guide: running The Padel Series

This is the plain-English guide for the organiser. Everything below is done in the app at
**https://padel-survivor.web.app**, under **Admin** (the Admin tab, or "Open the admin area" on Home).

## 0. One-time setup (platform owner)
1. Create your account in the app and confirm the email.
2. On GitHub, open the repository, go to **Actions**, choose **Bootstrap platform owner (one-time)**, click **Run workflow** and enter your email. This makes you the platform owner. It refuses to run if an owner already exists.
3. In Supabase: Authentication, URL Configuration. Site URL is the app address, and the same address followed by `/**` is a Redirect URL. Authentication, Emails, SMTP settings: switch on custom SMTP with your Gmail app password.

## 1. Create a competition
Admin, **Competitions**, **New competition**. Set the name, capacity (how many players), players per tribe, entry fee and admin fee (in rand), and the finish date. It starts as a **draft** that only admins can see.

Then go to **Settings** and:
- add your **EFT payment instructions** (only registered players and admins can read them),
- set the **Phase** to *Registration open* when you want people to join.

## 2. Raise capacity
Settings, change **Capacity**, Save. It can't go below the number of players already approved. If the player count doesn't divide into tribes, Settings and the Random tribes panel explain the remainder and suggest valid options.

## 3. Manage players
**Registrations** shows who has joined.
- **Approve** (disabled with a reason when the competition is full), **Waitlist** or **Reject**.
- **Confirm payment** once the EFT arrives. You do this by hand, there is no payment gateway.
- **Add a paid player who hasn't signed up** holds a slot, counts in the prize pool, and can later be linked to their real account with **Link to a signed-up player**. The fee and tribe place carry over.

**Users** lets you suspend or restore a player (they are signed out and can't sign back in) and, as platform owner, delete one. Players with history are anonymised instead of erased, so results and payments stay intact. A player on a tribe must be replaced first. The platform owner also adds or removes other admins here, by email.

## 4. Assign tribes
**Tribes**:
1. Create the tribes (name, emblem, colour).
2. **Random tribes** previews a random split. Press *Shuffle again* until you like it, then *Apply*. Nothing changes until you apply. *Start again with everyone* reshuffles everybody and asks you to confirm.
3. **Pick random captains**, or use *Make captain* on a player.
4. Tribes stay hidden from players until you reveal them. Use **Reveal the next tribe** one at a time for the reveal screen, or **Reveal all tribes**.
5. **Replace** swaps a player and keeps the old membership in the history. **Withdraw tribe** turns all its unplayed matches into walkovers in one confirmed step.

## 5. Opening Americano
**Americano**, *Opening Americano*: choose rounds and points per match, **Preview schedule**, then **Create as a draft**. **Publish to players** makes it visible. Enter each match's score (the second score fills itself so the pair adds up). **Complete the Americano** when every match has a score. Americano points are individual and never change the tribal table.

## 6. Generate fixtures
**Fixtures**, **Generate fixtures** creates the single round robin (5 tribes give 10 matches over 5 rounds). Set match times (South African time), then **Publish to players**. If a tribe is added or withdrawn later, **Regenerate unplayed fixtures** rebuilds only the unplayed matches: played matches and approved scores are never touched. The confirmation tells you exactly how many will be kept and rebuilt.

Captains pick the **two players who represent their tribe** on each match page. You can lock line-ups, and the Tribes page shows who has played.

## 7. Approve results
Captains enter scores on the match page. **Results** lists everything waiting. **Approve**, or **Reject** with a reason (the captain enters it again). Rejected results can be deleted. Approved results feed the table, the home screen and the live feed straight away.

A walkover is recorded from **Fixtures**, *Record a walkover*, as 6-0, 6-0, 6-0 for the opponent.

Scores follow the rules everywhere: exactly 3 sets, each ending 6-0 to 6-4, 7-5 or 7-6, no level sets, nothing above 7.

## 8. Table, announcements, prize pool
- **Settings**: tick *Show the table* and *Show the fixtures* to open them to players. The **prize pool** is paid entries minus the admin fee, to the nearest rand. Type an **override** to set it exactly.
- **Announcements**: post, pin, delete. They appear on every player's Home screen.

## 9. Finale and awards
- **Americano**, *Closing Americano*: the generator mixes tribes so partners come from different tribes where possible.
- **Awards**: create awards (a player or a tribe), **Open voting**, look at anonymous **vote totals**, **Set winner**, then **Publish winners**. Votes are secret, you can't vote for yourself or your own tribe, and awards never change points. Set the phase to *Completed* and the Home screen shows the champions.

## 10. Audit log and exports
- **Audit log**: every change to players, payments, tribes, results, settings and roles, with who did it. It can't be edited. Bank details are never stored in it.
- **Exports**: CSV files for registrations and payments, tribes, standings, fixtures and results, Americano standings, award winners and the audit log.
