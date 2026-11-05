# Dashboard redesign verification

The user requested a coherent dark UI, one Inter font, shared button styles, dedicated admin user details, and profile editing in a modal. The implementation is in `de69b7815d4fc6c6a465deac43b12c2c66fbf8a9`, with follow-up global icon and mobile-table fixes on `main`.

## Checks

Frontend lint and type checks passed. The consolidated branch passed 40 web tests and 46 focused authentication and admin-route tests. The initial UI implementation also passed the full 331-test API suite before later issues were consolidated.

Live browser checks covered:

- Inter typography, visible icons, shared controls, and desktop/mobile layouts.
- Profile name validation, cancel without saving, successful save, real photo uploads, and immediate account updates.
- One profile dialog at a time, focus trapping, Escape, focus restoration, and mobile dialog bounds.
- User logout failure recovery and successful user/admin logout with session invalidation.
- Admin overview, filtered user list, dedicated details, direct reload, back navigation, status changes, and audit history.
- Admin access retained after name and avatar updates. The details endpoint returned 403 to a non-admin and 401 without a session.
- Mobile navigation, visible details actions with 44-pixel targets, and profile-route redirects.

Screenshots use temporary accounts and document fixtures. Email addresses are masked. Test accounts, status history, document files, avatars, allowance fixtures, and Redis sessions were removed afterward.

## Screenshots

- [Sign-in](signin.png)
- [User workspace](workspace-desktop.png) and [mobile workspace](workspace-mobile.png)
- [Profile modal](profile-desktop.png) and [mobile profile modal](profile-mobile.png)
- [Admin overview](admin-overview-desktop.png)
- [Admin users](admin-users-desktop.png) and [mobile users](admin-users-mobile.png)
- [User details](admin-detail-desktop.png) and [mobile details](admin-detail-mobile.png)
- [User navigation](user-navigation-mobile.png), [admin navigation](admin-navigation-mobile.png), and [admin profile](admin-profile-mobile.png)
