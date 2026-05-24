# Notes Triage

Raw notes → GitHub issues. As each note is processed (created or skipped), it moves to the log table and is removed from the Remaining list.

---

## Log

| # | Original Note | Action |
|---|---------------|--------|
| 1 | Get rid of Auto-mapped badge on node detail header | #45 — Remove "Auto-mapped" badge from node detail header |
| 2–7 | Drive: load autosave after sync / loading+saving indicators / confirmation dialogs / button labels / no cloud saves subdir / override confirmation with timestamp + backup count | Skipped — revisit later, Drive updates already in progress |
| 8 | If I deliver a navigation command while narrating, do not scroll to bottom | #46 — Don't scroll to bottom when navigation command issued during narration |
| 9 | First location after load includes score in name | Skipped — likely broken state, not reproducible |
| 10 | Review welcome screen settings | #47 — Review settings panel options on welcome screen |
| 11 | Top padding? PWA spacing top welcome bottom | #48 — Fix top/bottom spacing on welcome screen in PWA mode [PWA] |
| 12 | Add font size setting | Skipped — revisit if actually wanted |
| 13 | Clearing all should clear protected nodes / edges | #49 — "Clear all" should also clear protected (user-edited) nodes and edges |
| 14 | Get counterfeit monkey working | #50 — Add support for Counterfeit Monkey (Glulx game format) |
| 15 | Changing app with mic enabled makes mic appear to work but stop working | #51 — Mic appears active but stops working after switching apps |
| 16 | Sound fx stop if switch apps and back | #52 — Sound effects stop playing after switching apps and returning |
| 17 | When activate mic in lock while narrating, button on main doesn't highlight; voice switched from head to phone | Skipped — likely Bluetooth routing issue; recreate if reproducible |
| 18 | Should be a read-back-last-command command | Skipped — already implemented |
| 19 | Should be a 'hold mic' command so we can 'unmute' temporarily | Skipped — already implemented as 'freeze mic' |
| 20 | When I switch back to app with mic muted, I hear the mic connect sound but the icon doesn't change. Hear other fast sounds too | Skipped — believed fixed |
| 21 | Maybe should have font size options...? | Skipped — revisit later |
| 22 | Car — wonkiest can't change volume | #53 — Volume control doesn't work in car Bluetooth mode |
| 23 | How to make car Bluetooth just work like an app that's playing sound | #54 — Make app register as a media audio source for car Bluetooth compatibility |
| 24 | If I let go of mic during push to talk, it sends the interim as a failed command — should wait for full command | #55 — Push-to-talk sends interim result as failed command on release |
| 25 | Holding push to talk after sending command — no further commands can be issued without letting go and repressing | #56 — Push-to-talk locks out further commands until button is released and re-pressed |
| 26 | Echo not working in car — mic loses permission when I leave, app doesn't notice until restart, then asks for permission | Skipped — believed fixed |
| 27 | Echo controller not working in CarPlay mode — picking up whole narration; mic might be the car | #57 — Echo controller picks up narration audio in CarPlay mode |
| 28 | Narration never registers as finished so I can never speak a move — always blocks me saying narration is active | #58 — Narration never registers as finished in CarPlay, blocking voice commands |
| 29 | CarPlay not sending audio to car | #59 — Audio not routed to car speakers in CarPlay mode |
| 30 | Scroll down doesn't always go to bottom | #60 — Scroll-to-bottom button doesn't always reach the bottom |
| 31 | Hover appearance could be constant | Skipped — unclear intent; recreate if needed |
| 32 | Hold to talk is still sending interim command as low confidence on release | Skipped — duplicate of #55 |
| 33 | Sometimes scrolling content gets cut off | Skipped — revisit if reproducible |
| 34 | When I rotate phone screen, it should scroll to the bottom | #61 — Screen rotation should scroll to bottom of game output |
| 35 | On mobile refresh dialog is too high to tap | #62 — Refresh confirmation dialog positioned too high to tap on mobile |
| 36 | Map should be accessible while playing on desktop | Skipped — believed implemented |
| 37 | Keep screen awake shouldn't show on [desktop?] | #63 — "Keep screen awake" option should be hidden on desktop |
| 38 | No should not be instant | #64 — "No" should not be an instant command |
| 39 | Play should be delayed not instant for "ay piano" | #66 — "Play" should not be an instant command (mis-triggers on similar phrases and IF verbs) |
| 40 | Turn on auto map after import — get full map | #67 — Enable auto-map after save import to build full map from history |
| 41 | Update shown version number is wrong / behind | #68 — Displayed version number is incorrect or out of date |
| 42 | Update dialog doesn't respect padding in PWA | #69 — Update dialog doesn't respect safe area padding in PWA mode |
| 43 | Undo should be able to undo a node merge action | #70 — Undo should support undoing node merge actions on the map |
| 44 | Sometimes two taps for pager to scroll — first turns it white, second activates | #71 — Pager scroll requires two taps — first tap only changes appearance |
| 45 | Location should not get centered on small edits or movement, only when opening map overlay | #72 — Map should not re-center on current location during small edits or movement |
| 46 | Would be nice to have voice support on menu pages like read pages | #73 — Add voice command support on in-game menu and read/pager screens |
| 47 | Menus would only display new content when only new content was sent | #74 — Press-any-key menu screens only render new content when partial updates are sent |
| 48 | Characters like arrow and star in the menu have content meaning — not sure what to do about them | #75 — Special characters (arrows, stars) in press-any-key menus have semantic meaning — handle appropriately |
| 49a | Escape in the press-any-key screen is not working | #76 — Escape key not working on press-any-key screens |
| 49b | Would be nice to have a visual of what was pressed | #77 — Show visual indicator of key pressed on press-any-key screens |
| 50 | Need to get rid of github issues [in-app link?] | Skipped — interpreted as "triage issues," which is this session |
| 51 | Need to make google drive authentication real | Skipped — duplicate of #65 |
| 52 | OpenAI cheap voice? Would track usage. | Skipped — revisit later |
| 53 | "Breath alone" → brief | #78 — Add missing voice substitutions (combined) |
| 54 | "Town alone" → down | #78 — combined |
| 55 | "Quicksand alone" → quick save | #78 — combined |
| 56 | "Poor" as verb → pour | #78 — combined |
| 79 | "We" and "what" need to be replacements for West | #78 — combined |
| 81 | Left → west (voice substitution) | #78 — combined |
| 85 | "Quicksand" → quicksave (another variant) | #78 — combined |
| 86 | "Quicks save" → quicksave | #78 — combined |
| 57 | If saving a game and it lists game numbers, saying a number should save to that slot; save games that are numbers not allowed currently | #79 — Voice should accept slot numbers when saving; numbered save names not currently allowed |
| 58 | Same for restore — saying "three" looks for a game named "three" instead of slot 3 | #79 — added as comment |
| 59 | Playback still says app messages (e.g. "game restored" or "game saved") | #80 — "Repeat" / "last command" should not replay app status messages |
| 60 | Line breaks when listing save games should act as pauses for reader | #81 — Line breaks in save game listings should be read as pauses by TTS |
| 61 | Navigation mode probably should have voice activation; let voice interrupt narration with a command; probably in input menu too | #82 — Add "navigation mode" — always-on voice directions that interrupt narration |
| 62 | Remove confidence references? Maybe unless low confidence; maybe put confidence and type into element — not using | Skipped — unclear intent; revisit later |
| 63 | Portal/dotted-line map logic: if unedited, future cardinal directions upgrade portal → actual direction, solid line, correct direction label | #83 — Auto-upgrade portal connections to real directions when cardinal direction is later confirmed |
| 64 | 'Mark trapdoor' → adds note to map node on new line | #84 — "Mark [thing]" voice command should add a note to the current map node |
| 65 | If user closes node detail it should not change view to center on current loc | #85 — Closing node detail panel should not re-center map on current location |
| 66 | If direction A→B and direction B→A differ — should we handle connection bending? Anchor is weird. | #86 — Handle asymmetric bidirectional connections on map (A→B and B→A differ) |
| 67 | Throw should be added to tap-to-examine verbs; and fill | #87 — Add "throw" and "fill" to tap-to-examine verb list |
| 68 | "Examines"/"examined" → normalize to examine | #78 — added as comment |
| 69 | "Looks" → normalize to look | #78 — added as comment |
| 70 | Tap to examine: if a second item is tapped, the exam gets unselected | Skipped — unclear/uncertain; recreate if needed |
| 71 | Escape button not like the others — top and bottom cut off | #88 — Escape button has top and bottom clipped compared to other buttons |
| 72 | More quick save backups — 5? | #89 — Increase number of quick save backups (suggest 5) |
| 73 | Save games should be case insensitive and number-word/number insensitive | #90 — Save game names should be case-insensitive and treat number words and digits as equivalent |
| 74 | Restoring quick save backup should actually load the quick save (not just replace the slot) | #91 — Restoring a quick save backup should load it immediately, not just overwrite the slot |
| 75 | Freeze and unfreeze should be instant commands | #92 — "Freeze" and "unfreeze" should be instant voice commands |
| 76 | Cell. South. [map edge note?] | #78 — added as comment ("cell" alone → south) |
| 77 | Don't read press-any-key screen on every press | #93 — TTS should not re-read the press-any-key screen on every key press |
| 78 | Create a note for a curve on one of the map connections | skipped — too complex |
| 80 | Panel showing all speech-to-text substitutions; allow add/delete | #94 — Add a panel for viewing and managing speech-to-text substitutions |
| 82 | Enter key substituting for entry key on non-press-any-key pages | #95 — Enter key is incorrectly treated as a substitution for the entry key on non-press-any-key pages |
| 83 | Fast navigation option (say directions to interrupt narration) | #82 — bundled |
| 84 | Conversation mode | skipped — unclear intent |
| 87 | "I didn't understand that sentence" after load on first command | bundled — Anchorhead autorestore Bug 3 (ember 20260505-034920-dde9) |
| 88 | Remove quick actions menu | #96 — Remove the quick actions menu |
| 89 | When no drive permission, button inert | #97 — Google Drive sync button should appear disabled when Drive permission has not been granted |
| 90 | Echo detection doesn't work on Bluetooth | #98 — Echo detection does not work when using Bluetooth audio |
| 91 | "Come mark map, locked" — appends note to map | skipped — unclear intent |
| 92 | Need multi-map system | #99 — Support multiple maps for games with distinct areas or floors |
| 93 | Warning for map weirdness? Badge on menu/map? | #100 — Show a badge or warning indicator when the map has detected anomalies |
| — | Upgrade Google Drive sync to official OAuth | #65 — Upgrade Google Drive sync to use official OAuth authentication |

---

## Remaining

### Mic / Voice

15. Changing app with mic enabled makes mic appear to work but stop working
16. Sound fx stop if switch apps and back
17. When activate mic in lock while narrating, button on main doesn't highlight; voice switched from head to phone
18. Should be a read-back-last-command command
19. Should be a 'hold mic' command so we can 'unmute' temporarily
20. When I switch back to app with mic muted, I hear the mic connect sound but the icon doesn't change. Hear other fast sounds too — maybe related to sounds stop working.
21. Maybe should have font size options...?

### Car / Bluetooth

22. Car — wonkiest can't change volume
23. How to make car Bluetooth just work like an app that's playing sound
24. If I let go of mic during push to talk, it sends the interim as a failed command — should wait for full command
25. Holding push to talk after sending command — no further commands can be issued without letting go and repressing
26. Echo not working in car — mic loses permission when I leave, app doesn't notice until restart, then asks for permission
27. Echo controller not working in CarPlay mode — picking up whole narration; mic might be the car
28. Narration never registers as finished so I can never speak a move — always blocks me saying narration is active
29. CarPlay not sending audio to car

### UI / Scroll

30. Scroll down doesn't always go to bottom
31. Hover appearance could be constant
32. Hold to talk is still sending interim command as low confidence on release
33. Sometimes scrolling content gets cut off
34. When I rotate phone screen, it should scroll to the bottom
35. On mobile refresh dialog is too high to tap

### Older / Desktop

36. Map should be accessible while playing on desktop
37. Keep screen awake shouldn't show on [desktop?]
38. No should not be instant
39. Play should be delayed not instant for "ay piano"
40. Turn on auto map after import — get full map
41. Update shown version number is wrong / behind
42. Update dialog doesn't respect padding in PWA
43. Undo should be able to undo a node merge action
44. Sometimes two taps for pager to scroll — first turns it white, second activates
45. Location should not get centered on small edits or movement, only when opening map overlay

### Press-Any-Key / Voice Nav on Menus

46. Would be nice to have voice support on menu pages like read pages
47. Menus would only display new content when only new content was sent
48. Characters like arrow and star in the menu have content meaning — not sure what to do about them
49. Escape in the press-any-key screen is not working. Would be nice to have a visual of what was pressed.

### TODO / Auth

50. Need to get rid of github issues [in-app link?]
51. Need to make google drive authentication real
52. OpenAI cheap voice? Would track usage.

### Voice Commands & Save

53. "Breath alone" → brief
54. "Town alone" → down
55. "Quicksand alone" → quick save
56. "Poor" as verb → pour
57. If saving a game and it lists game numbers, saying a number should save to that slot; save games that are numbers not allowed currently
58. Same for restore — saying "three" looks for a game named "three" instead of slot 3
59. Playback still says app messages (e.g. "game restored" or "game saved")
60. Line breaks when listing save games should act as pauses for reader
61. Navigation mode probably should have voice activation; let voice interrupt narration with a command; probably in input menu too
62. Remove confidence references? Maybe unless low confidence; maybe put confidence and type into element — not using
63. Portal/dotted-line map logic: if unedited, future cardinal directions upgrade portal → actual direction, solid line, correct direction label
64. 'Mark trapdoor' → adds note to map node on new line
65. If user closes node detail it should not change view to center on current loc
66. If direction A→B and direction B→A differ — should we handle connection bending? Anchor is weird.
67. Throw should be added to tap-to-examine verbs; and fill
68. "Examines"/"examined" → normalize to examine
69. "Looks" → normalize to look
70. Tap to examine: if a second item is tapped, the exam gets unselected
71. Escape button not like the others — top and bottom cut off
72. More quick save backups — 5?
73. Save games should be case insensitive and number-word/number insensitive
74. Restoring quick save backup should actually load the quick save (not just replace the slot)
75. Freeze and unfreeze should be instant commands
76. Cell. South. [map edge note?]
77. Don't read press-any-key screen on every press
79. "We" and "what" need to be replacements for West
81. Left → west (voice substitution)
85. "Quicksand" → quicksave (another variant)
86. "Quicks save" → quicksave
