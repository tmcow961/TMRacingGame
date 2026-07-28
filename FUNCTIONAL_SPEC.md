# Tuen Mun Cow Racing

## MVP Functional Specification

| Field | Value |
| --- | --- |
| Document status | Approved product direction, ready for implementation planning |
| Version | 1.0 |
| Date | 2026-07-16 |
| Platform | Desktop web browser |
| Primary browsers | Current stable Chrome and Microsoft Edge |
| Game mode | Single-player point-to-point racing |
| Target audience | Casual players |

## 1. Product Summary

**Tuen Mun Cow Racing** is a lighthearted, cartoon-style 3D browser racing game set on a compressed but recognizable recreation of Tuen Mun Road in Hong Kong. Instead of driving cars, the player controls a cow ridden by a cartoon human character and races against five AI-controlled cows.

The MVP contains one road model that supports two race directions:

- Tuen Mun to Tsuen Wan
- Tsuen Wan to Tuen Mun

The player holds an acceleration key to move, then steers, brakes, and jumps. Races have no time limit and should take an average player approximately three minutes to complete.

## 2. Product Goals

The MVP must:

1. Deliver a complete, playable race from menu to results in a desktop browser.
2. Make Tuen Mun Road recognizable through its route shape, curves, tunnels, signs, coastal setting, hills, and ordered landmark views.
3. Provide accessible arcade handling suitable for casual players.
4. Create a humorous and distinctive identity through cartoon cows, riders, exaggerated animation, and playful audio.
5. Maintain a stable target of 60 frames per second at 1920 x 1080 on a typical modern laptop.
6. Establish a maintainable foundation for future tracks, difficulty levels, and game modes without implementing them in the MVP.

## 3. MVP Scope

### 3.1 Included

- One compressed Tuen Mun Road track usable in both directions
- One daytime environment
- Five selectable cow appearances
- One cartoon human rider design
- Five Easy AI opponents
- Hold-to-accelerate movement
- Steering, braking, and jumping
- Chase camera
- Physical collisions between cows, road boundaries, and obstacles
- Stationary crashed-car obstacles with non-graphic presentation
- Automatic recovery to the most recent checkpoint
- Bilingual English and Traditional Chinese interface
- Title, direction selection, cow selection, race, pause, and results screens
- Music, sound effects, ambience, and volume controls
- Chrome and Edge desktop support
- Adjustable visual-quality settings

### 3.2 Explicitly Out of Scope

- Multiplayer of any kind
- Normal and Hard difficulty modes
- Mobile and touch controls
- Gamepad support
- Drifting
- Vehicle or cow damage systems
- Speed boosts, power-ups, and collectibles
- Progression, currency, upgrades, and unlocks
- User accounts, online services, and leaderboards
- Saving best times or selected cow appearance
- Night, sunset, or dynamic weather variants
- Graphic injury or accident content

## 4. Product Assumptions

1. The five appearances are interpreted as **Gold**, **Silver**, **Red**, **Black-and-White**, and **Brown**. Black-and-White is one patterned appearance, not two separate choices.
2. The user's reference to a "cash crash accident" is interpreted as a **car crash accident**.
3. The track preserves the recognizable horizontal route, major curves, terrain relationship, tunnel sequence, and landmark order, while compressing distances enough to support an average three-minute race.
4. The game is an artistic recreation, not a navigation product or survey-accurate road simulator.
5. Both race directions use the same world and track data with reversed start, finish, checkpoint order, racing line, and landmark progression.
6. Cow appearance is cosmetic. All player cow choices have identical gameplay statistics.
7. English is the default language on first launch. The player can switch to Traditional Chinese.

## 5. Target Experience

### 5.1 Player Profile

The primary player is a casual desktop user who should be able to understand the controls and begin racing within one minute, without knowledge of simulation racing games.

### 5.2 Core Loop

1. Open the game and reach the title screen.
2. Choose a race direction.
3. Choose one of five cow appearances.
4. View the controls and start the race.
5. Complete a three-second countdown.
6. Race five AI cows to the destination while steering, braking, jumping, and avoiding obstacles.
7. Cross the finish line and view position and completion time.
8. Retry the same race or return to the title screen.

## 6. Track and Environment

### 6.1 Track Format

- The race is point-to-point, not lap-based.
- The road must support travel in either selected direction.
- The target completion time is approximately three minutes for an average player on Easy difficulty.
- Three minutes is a balancing target, not a deadline. The player never loses solely because of elapsed time.
- The road must remain visually readable at racing speed through lane markings, barriers, chevrons, signs, lighting, and environmental silhouettes.

### 6.2 Geographic Recreation

The track should follow public geographic reference data for Tuen Mun Road wherever practical. Implementation may use OpenStreetMap-derived route geometry or another publicly usable data source, subject to its license and attribution requirements.

The recreation must prioritize, in order:

1. Recognizable overall route shape
2. Major bends and elevation character
3. Correct relative order of tunnels and landmark views
4. Coastal, hillside, and urban context
5. Representative road signs and roadside structures
6. Fine visual detail

Distance compression may remove repetitive road segments, reduce long straightaways, and bring landmarks closer together. It must not arbitrarily reorder major landmarks.

### 6.3 Required Environmental Features

Where geographically and visually appropriate, the route must include stylized representations of:

- Castle Peak Road context or views
- Sham Tseng
- Ting Kau Bridge views
- Coastal scenery
- Green hills and cut slopes
- From Tuen Mun to Tsuen Wan, the sea is on the right and the hillside is on the left; this relationship reverses naturally in the opposite race direction.
- Tunnels
- Directional road signs
- Road barriers and lane markings
- Residential buildings and distant urban clusters

Landmarks should be recognizable at a glance without requiring photorealism. Geometry, colors, silhouettes, and placement are more important than small architectural details.

### 6.4 Daytime Presentation

- Use clear daytime lighting and good visibility.
- The sky, sea, vegetation, road, buildings, cows, and UI must use a varied color palette rather than a single dominant hue.
- Tunnels must have an obvious lighting transition but remain playable and readable.
- Directional light and ambient light must prevent cows and obstacles from becoming silhouettes.

### 6.5 Obstacles

- The MVP must include stationary crashed-car scenes as track obstacles.
- Accident scenes may include damaged cars, traffic cones, barriers, debris, and warning lights.
- Accident scenes must not include injured people, blood, fire-related harm, or graphic imagery.
- Obstacles must leave at least one clearly navigable path.
- Obstacles must be visible early enough for a casual player to react by steering, braking, or jumping.
- Obstacle placement must be identical and fair for all competitors unless AI navigation requires a small invisible avoidance margin.

## 7. Racers and Characters

### 7.1 Player Cow

The player chooses one of these appearances:

1. Gold
2. Silver
3. Red
4. Black-and-White
5. Brown

All appearances share the same:

- Maximum speed
- Acceleration strength
- Braking strength
- Steering response
- Jump height and cooldown
- Collision mass and bounce response

Color choices must remain visually distinguishable under sunlight and tunnel lighting. Selection cards must use a rendered cow preview or clear cow swatch, not text alone.

### 7.2 Rider

The MVP rider is **Ah Mun**, a cheerful, gender-neutral cartoon local adventurer wearing a bright safety helmet, casual riding clothes, gloves, and a small backpack. Ah Mun is the same for every cow choice and has no gameplay effect.

Required rider animation behavior:

- Lean subtly into turns
- Bob in response to the cow's running cycle
- Brace during braking
- Rise and settle with jumps
- React comically but non-violently to strong collisions

### 7.3 Cow Animation

The cow must have exaggerated cartoon animation states:

- Idle at menus and starting grid
- Accelerating into a run
- Continuous running loop
- Left and right turning lean
- Braking/skidding legs
- Jump ascent
- Airborne pose
- Landing compression
- Collision reaction
- Finish-line celebration

Animation transitions must be blended to avoid abrupt pose changes.

### 7.4 AI Opponents

- Each race contains five AI-controlled cow racers.
- AI uses the same basic physical capabilities as the player.
- AI cow appearances should be assigned from colors that remain distinguishable from the player's cow. Duplicate opponent colors are allowed only when required.
- The MVP has one Easy difficulty.
- Easy AI should follow a authored racing path, steer around stationary obstacles, recover from collisions, and occasionally make small believable mistakes.
- Rubber-banding may be used gently to keep the field engaging, but must not produce obvious teleporting or impossible acceleration.
- AI must be able to finish both race directions.
- AI cows physically collide with the player and with each other.

## 8. Controls and Movement

### 8.1 Keyboard Mapping

| Action | Primary key | Alternate key |
| --- | --- | --- |
| Steer left | A | Left Arrow |
| Steer right | D | Right Arrow |
| Brake | S | Down Arrow |
| Jump | Space | None |
| Pause/resume | Escape | P |
| Confirm menu selection | Enter | Space where unambiguous |
| Navigate menus | Arrow keys | W/A/S/D |

Browser-default scrolling must be suppressed for gameplay keys while the game canvas is active.

### 8.2 Manual Acceleration

- After the countdown, the player must hold `W` or Up Arrow to accelerate toward normal racing speed.
- Releasing acceleration causes the cow to coast to a stop.
- Braking overrides acceleration input.
- Collisions, off-road surfaces, and sharp steering may temporarily reduce speed.
- Forward movement must remain arcade-like and forgiving rather than physically realistic.

### 8.3 Steering

- Steering response should increase smoothly with input rather than snapping instantly.
- At high speed, maximum steering angle should be limited to maintain control.
- The cow should visually lean into turns.
- Steering must remain responsive enough to avoid a clearly signposted obstacle.

### 8.4 Braking

- Holding the brake reduces forward speed but does not normally reverse the cow.
- Braking should help negotiate sharp bends and avoid obstacles.
- Reversal is not required in normal play because automatic recovery handles stuck states.

### 8.5 Jumping

- Jumping is available anywhere on the track.
- Jump input is accepted only while grounded and when the cooldown is ready.
- Initial tuning target: a 2.0-second cooldown beginning on landing.
- The HUD must communicate ready, airborne, and cooldown states.
- Jump height and airborne phasing must clear every accident vehicle and the longest five-vehicle scene, while off-track recovery continues to prevent route bypasses.
- Mid-air steering may be allowed at reduced strength for accessibility.
- Landing must restore stable ground contact without excessive bouncing.

### 8.6 Collisions

- Collisions use a strong, cartoon-style bounce response.
- Impacts reduce speed and push racers apart.
- Collisions must not cause damage or eliminate a racer.
- Collision response must be capped to prevent cows from being launched outside the playable world.
- A short control stabilization period may be applied after a major impact, but the player should regain meaningful control within approximately one second.

### 8.7 Recovery

The game automatically resets a racer when any of these conditions occur:

- The racer leaves the playable road volume.
- The racer falls below the world boundary.
- The racer is overturned or immobilized for approximately three seconds.
- The racer is moving away from the route with no valid recovery path.

Recovery behavior:

1. Briefly fade or signal the reset.
2. Place the cow at the most recent valid checkpoint.
3. Align the cow with the route direction.
4. Provide approximately 1.5 seconds of collision protection.
5. Wait for player acceleration input.

## 9. Race Rules

### 9.1 Race Start

- All six cows start from defined grid positions.
- A visible and audible `3`, `2`, `1`, `GO` countdown occurs.
- Steering and jumping may animate during countdown, but forward motion is locked until `GO`.
- Early input does not cause a false-start penalty in the MVP.

### 9.2 Checkpoints and Progress

- Ordered invisible checkpoints define valid route progress.
- Checkpoints work in the selected direction and reverse order for the opposite direction.
- A racer must pass checkpoints in order to finish.
- Position is determined primarily by the most recent checkpoint, then distance to the next checkpoint.
- Progress percentage is derived from checkpoint and route-distance data.

### 9.3 Finish

- The first racer to pass all checkpoints and cross the destination finish trigger wins.
- The player's race ends when the player crosses the finish line, regardless of position.
- AI finish times and positions already achieved must remain stable.
- The result screen shows the player's finishing position and completion time.

## 10. Camera

- The MVP uses one third-person chase camera.
- The camera follows behind and above the player cow.
- It must look ahead slightly in the direction of travel.
- It should damp sudden motion and collision rotation to reduce discomfort.
- Camera collision handling must prevent it from passing through hills, tunnel walls, and large roadside geometry.
- Field of view may widen subtly with speed but must respect a Reduced Motion setting.
- The cow, immediate road, upcoming obstacles, and useful portion of the next bend must remain visible.

## 11. User Interface

### 11.1 Language

- All player-facing interface text must be available in English and Traditional Chinese.
- Language can be changed from the title/settings interface.
- A language change updates the current screen immediately.
- Text must fit at 1280 x 720 and 1920 x 1080 without clipping or overlapping.
- Game terms must use a maintained translation table rather than hard-coded strings inside UI components.

### 11.2 Title Screen

Required controls:

- Start Race
- Settings
- Language switch
- Credits/Attributions

The title screen must prominently display the game name and an animated or rendered cow-and-rider scene.

### 11.3 Direction Selection

The player chooses:

- Tuen Mun to Tsuen Wan
- Tsuen Wan to Tuen Mun

Each choice must show direction names in both supported languages and a simple route preview or directional map.

### 11.4 Cow Selection

- Show all five appearances.
- Show the current cow and Ah Mun in a rotatable or automatically rotating 3D preview.
- Changing appearance updates the preview immediately.
- Show Back and Start Race commands.
- Do not show performance statistics because all choices are cosmetic.

### 11.5 Pre-Race Control Prompt

Before the first race in a page session, display the steering, brake, jump, and pause controls. It must be dismissible by keyboard. It should not reappear before every retry unless opened from Pause.

### 11.6 Race HUD

The HUD must display:

- Current position out of six
- Route progress percentage
- Elapsed race time
- Selected direction or destination
- Simplified minimap with player, opponents, start, and finish
- Jump status/cooldown
- Countdown at race start

The HUD must not include lap count, speed boost, damage, or time remaining.

### 11.7 Pause Screen

Pause must stop race simulation, AI, timers, and race audio progression. Required commands:

- Resume
- Restart Race
- Controls
- Settings
- Quit to Title

### 11.8 Results Screen

Required information:

- Finishing position
- Completion time
- Selected direction
- Cow appearance

Required commands:

- Retry
- Return to Title

No result data needs to persist after a page reload.

### 11.9 Settings

Required settings:

- Language: English / Traditional Chinese
- Master volume
- Music volume
- Sound-effects volume
- Visual quality: Low / Medium / High
- Reduced Motion: On / Off
- Fullscreen: Enter / Exit, where supported by the browser

Settings may remain in memory for the page session. Persistent storage is not required for the MVP.

## 12. Audio

The MVP must include:

- Playful background race music with an energetic Hong Kong-local flavor, without copying protected melodies
- Cow running/hoof sounds
- Cow vocal reactions
- Jump and landing sounds
- Braking/skid sounds
- Cow-to-cow collision sounds
- Cow-to-obstacle collision sounds
- Countdown and finish cues
- Tunnel ambience and reverb-like transition
- Light coastal/wind ambience where appropriate
- UI navigation and confirmation sounds

Audio must not autoplay before the player's first interaction. Music and sound effects must respond to their respective volume settings.

## 13. Visual and Content Direction

- Use a polished animated-cartoon style with simplified geometry, readable silhouettes, and bright but controlled colors.
- Avoid photorealistic injury, accident, or crash presentation.
- Use proportionally exaggerated cows and expressive character animation.
- Maintain enough geographic accuracy for Tuen Mun Road to be recognizable while allowing playful scale and scenery.
- Real-world brand logos on vehicles, buildings, or signs should be omitted or replaced with fictional equivalents unless their use is cleared.
- Road signs may reproduce functional place names and directional character, but should be simplified to match the art style.

## 14. Technology and Architecture

### 14.1 Required Public JavaScript Libraries

| Purpose | Library | Responsibility |
| --- | --- | --- |
| 3D rendering | Three.js | Scene, camera, lighting, materials, animation, GLTF assets, post-processing where affordable |
| Physics | Rapier JavaScript | Cow bodies, road/obstacle colliders, collision events, jump impulses, recovery detection |
| Audio | Howler.js | Music, sound effects, volume groups, browser audio lifecycle |
| Development/build | Vite | Local development server, ES modules, optimized production bundle |

Libraries must use versions that are current and mutually compatible when implementation begins. Exact versions must be locked in the package lockfile.

### 14.2 Application Structure

The implementation should separate these responsibilities:

- **App/state flow:** loading, title, selection, countdown, racing, paused, finished
- **Renderer:** Three.js scene, lighting, camera, visual effects, resizing
- **Physics world:** Rapier initialization, fixed-step simulation, collisions, triggers
- **Track system:** route spline, road mesh, checkpoint data, landmarks, obstacles, direction reversal
- **Vehicle system:** cow movement controller, jump, animation, collision response, recovery
- **AI system:** racing line following, obstacle avoidance, Easy tuning, recovery
- **Race manager:** countdown, timing, progress, position ranking, finish order
- **Input system:** keyboard state and menu focus
- **UI system:** screens, HUD, localization, settings
- **Audio system:** music, ambience, effects, volume buses
- **Asset manager:** loading, caching, progress reporting, failure handling

### 14.3 Simulation

- Physics must run with a fixed time step, recommended at 60 Hz.
- Rendering may interpolate between physics states.
- Race timing must use monotonic application time and pause correctly.
- Movement tuning values must be data-driven rather than scattered through source code.
- AI and player should use the same core cow-controller rules, with AI providing virtual inputs.

### 14.4 Track Data

The track should be defined with reusable structured data containing:

- Center route or racing spline
- Road width and elevation samples
- Start/finish definitions for both directions
- Ordered checkpoints
- Recovery transforms
- AI racing line and avoidance hints
- Landmark placement
- Obstacle placement
- Minimap path

Direction-specific behavior should be derived from shared track data wherever possible.

### 14.5 Asset Formats

- 3D models and animations: GLB/GLTF
- Textures: WebP or compressed GPU texture formats where practical
- Audio: WebM/Opus with MP3 fallback where needed
- Route/reference data: GeoJSON or normalized JSON during authoring
- UI icons: established icon library or optimized vector assets

All third-party assets must have a recorded source URL, license, author, required attribution, and modification status.

## 15. Loading and Failure States

- The game must show loading progress before interactive 3D content is ready.
- The title screen must not enable Start Race until required race assets are loaded.
- Optional audio failures must not prevent gameplay.
- A missing required model or track asset must show a bilingual recovery message and retry control.
- Loss of browser focus during a race must automatically pause the game.
- Window resizing must update the renderer and UI without reloading the game.

## 16. Performance Requirements

- Target: stable 60 FPS at 1920 x 1080 on a typical modern laptop in Chrome or Edge.
- Minimum acceptable fallback: 30 FPS using Low quality on supported hardware.
- Initial interactive load should target under 15 seconds on a typical broadband connection after compression, subject to final asset size.
- The production build should use lazy loading, model/texture compression, geometry instancing, level-of-detail models, and culled scenery where beneficial.
- Repeated roadside objects should use instancing.
- Distant buildings and terrain should use simplified meshes or baked representations.
- Quality settings must adjust expensive features such as shadows, pixel ratio, draw distance, vegetation density, and post-processing.
- Physics colliders must be simpler than rendered geometry wherever possible.

## 17. Accessibility and Usability

- All menus must be usable with keyboard only.
- Focus must always be visibly indicated.
- Important race state must not be conveyed by color alone.
- Reduced Motion must disable or reduce speed-based field-of-view change, camera shake, and intense UI animation.
- UI text and controls must remain legible at 1280 x 720.
- Sound must not be required to understand countdown, jump cooldown, collision, or finish state.
- The game must provide a clear control reference from both pre-race and pause screens.

## 18. Data and Privacy

- The MVP requires no account and no personal information.
- The MVP sends no gameplay data to a server.
- Best times and cow selections do not persist across reloads.
- Any analytics added later require a separate product decision and privacy review.

## 19. Acceptance Criteria

### AC-01: Complete Flow

From a fresh page load, a player can select a language, direction, and cow; start a race; finish; view results; retry; and return to the title screen without reloading the page.

### AC-02: Two Directions

Both Tuen Mun to Tsuen Wan and Tsuen Wan to Tuen Mun can be selected and completed. Checkpoints, recovery, AI routing, progress, minimap, signs, start, and finish work correctly in both directions.

### AC-03: Recognizable Route

The track follows a documented geographic reference for Tuen Mun Road, retains its recognizable overall curve and landmark order, and includes the specified coastal, hillside, tunnel, bridge-view, Sham Tseng, road-sign, and residential context where appropriate.

### AC-04: Race Duration

During balancing tests, the median completion time for new casual players is between 2 minutes 30 seconds and 3 minutes 30 seconds. Finishing outside that range does not cause an automatic loss.

### AC-05: Controls

Both key sets steer correctly, `W`/Up Arrow accelerates, `S`/Down Arrow brakes, Space jumps, and Escape/P pauses. The cow remains stopped without acceleration input.

### AC-06: Jump

The player can jump from normal road surfaces, cannot jump again while airborne or cooling down, can see cooldown state, and can clear cars, taxis, buses, and five-vehicle accident scenes without bypassing route boundaries.

### AC-07: Collisions

The player collides with AI cows, stationary accident vehicles, and road boundaries. The player starts with three lives; each accident-vehicle hit consumes one life and recovers to the latest checkpoint, and the third hit ends the game. Impacts remain non-graphic.

### AC-08: Recovery

A player who leaves the route, falls, overturns, or remains stuck is automatically restored at the latest valid checkpoint, facing the correct direction with temporary collision protection.

### AC-09: AI

Five Easy AI cows start, navigate obstacles, collide physically, recover when stuck, and finish the route in both directions without routine deadlocks.

### AC-10: Cow Choices

Gold, Silver, Red, Black-and-White, and Brown appearances can be selected and are visually distinct. Measured gameplay parameters are identical for all five choices.

### AC-11: UI and Localization

All menus, HUD labels, settings, loading messages, and errors are available in English and Traditional Chinese. No text clips or overlaps at 1280 x 720 or 1920 x 1080.

### AC-12: HUD and Ranking

Position, progress, elapsed time, destination, minimap, and jump state update during a race. Position remains correct when racers are on different checkpoint segments or cross each other.

### AC-13: Pause

Pausing stops movement, AI, race time, countdown, and appropriate audio. Resume, restart, controls, settings, and quit work without corrupting race state.

### AC-14: Audio

Music, ambience, cow movement, vocal reactions, jumps, landings, collisions, countdown, finish, tunnel, and UI sounds play at appropriate events and respect volume controls.

### AC-15: Browser Support

The production build completes the full game flow without blocking errors in current stable Chrome and Edge on Windows.

### AC-16: Performance

On the agreed reference laptop, High or Medium quality targets 60 FPS at 1920 x 1080. Low quality maintains at least 30 FPS, excluding brief initial loading or browser backgrounding.

### AC-17: Non-Persistence

Reloading the page resets race results, best time, direction, and cow selection. No account or server connection is required.

### AC-18: Content Safety

Accident obstacles contain stationary vehicles and optional cones, debris, barriers, or warning lights, but no injured people, blood, or graphic imagery.

## 20. Test Plan

### 20.1 Functional Testing

- Complete all menu and race flows in both languages.
- Complete races in both directions with every cow appearance.
- Verify player controls during countdown, racing, pause, recovery, and finish states.
- Trigger every recovery condition at multiple checkpoints.
- Validate checkpoint order, finish detection, ranking, and minimap in both directions.
- Test cow-to-cow, cow-to-car, cow-to-barrier, and cow-to-world collisions.
- Confirm all pause, restart, retry, fullscreen, quality, language, and volume controls.

### 20.2 AI Testing

- Run repeated unattended races in both directions.
- Record failure rate, finish rate, stuck locations, obstacle collisions, and recovery count.
- Confirm AI does not take invalid shortcuts or skip checkpoints.
- Confirm gentle rubber-banding does not create visible teleporting or impossible speed changes.

### 20.3 Visual Testing

- Compare route silhouette and landmark order with the selected geographic references.
- Inspect tunnels, accident scenes, road signs, coastal views, hills, bridge views, buildings, and cow colors.
- Capture screenshots at 1280 x 720 and 1920 x 1080 on every screen.
- Check for clipped text, overlapping UI, camera obstruction, missing textures, blank canvas, and excessive darkness.

### 20.4 Performance Testing

- Measure frame rate and frame-time spikes on the agreed reference laptop.
- Compare Low, Medium, and High settings.
- Profile draw calls, visible triangles, texture memory, JavaScript time, physics time, and loading size.
- Stress test all six cows colliding near an obstacle.

### 20.5 Browser Testing

- Test current stable Chrome and Edge.
- Verify keyboard focus, fullscreen, audio unlock, resizing, tab switching, and automatic pause on focus loss.
- Confirm the production build works when served from a normal static web host.

## 21. Asset and Attribution Requirements

Because no existing materials are available, implementation must source or create all models, animations, textures, audio, fonts, icons, and geographic references.

Attribution-required assets are allowed. Every externally sourced asset must be reviewed for:

- Commercial-use permission if the project may be distributed commercially
- Modification permission
- Attribution wording
- Share-alike or redistribution obligations
- Compatibility with web distribution

The Credits/Attributions screen and repository documentation must contain all required notices. Assets with unclear licensing must not be included.

## 22. Future Possibilities, Not Commitments

The architecture may leave room for the following, but the MVP must not depend on them:

- Normal and Hard AI difficulty
- Additional Hong Kong routes
- More cows, riders, and cosmetic choices
- Local or online multiplayer
- Gamepad and mobile controls
- Weather and time-of-day variants
- Time trials and leaderboards
- Persistent settings and best times

Any future multiplayer work will require a separate networking, anti-cheat, account, privacy, hosting, and latency specification.

## 23. Definition of Done

The MVP is complete when:

1. All acceptance criteria pass.
2. Both directions are playable from start to finish in Chrome and Edge.
3. The route and major visual references have been reviewed for recognizable Tuen Mun Road character.
4. The median casual-player race duration is near three minutes.
5. No critical or high-severity defects remain.
6. Performance meets the agreed target on the reference laptop.
7. All third-party code and assets have documented licenses and required attribution.
8. A production build can be deployed to a static web host and played without developer tools.
