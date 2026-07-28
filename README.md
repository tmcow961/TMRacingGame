# Tuen Mun Cow Racing

A single-player 3D browser racing game based on a playful, compressed interpretation of Tuen Mun Road. Race a cow and rider against five AI cows in either direction between Tuen Mun and Tsuen Wan.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open http://127.0.0.1:5173. For a production bundle:

```powershell
npm.cmd run build
npm.cmd run preview
```

## Controls

| Action | Keys |
| --- | --- |
| Accelerate | `W` or Up Arrow |
| Steer | `A` / `D` or Left / Right Arrow |
| Brake | `S` or Down Arrow |
| Jump | Space |
| Pause | Escape or `P` |

Hold `W` or Up Arrow to keep the cow moving. Releasing acceleration allows the cow to coast to a stop. The player has three lives; hitting an accident vehicle consumes one life and returns the cow to the latest checkpoint.

## Implementation

- Three.js procedural 3D renderer and animation
- Rapier fixed-step rigid-body collision world
- Howler.js audio lifecycle and volume control
- Shared reversible route spline for road, checkpoints, AI, recovery, and minimap
- OpenStreetMap-derived, distance-compressed Tuen Mun Road alignment
- Original code-generated scenery and audio; no external art or recordings

See [LICENSES.md](LICENSES.md) for dependency and geographic-reference attribution.

## Track authoring

The game reads its route from `src/data/tuen-mun-road.track.json`. The WGS84 source alignment and complete source manifest are committed beside it, so players never need a map service connection.

To intentionally refresh the authoring data:

```powershell
npm.cmd run generate:track
```

Review regenerated data in QGIS and test both race directions before accepting it. The capture and QGIS handoff workflow is documented in `reference/README.md`.
