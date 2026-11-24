# The filmed flight

The career journey used to be a real-time Three.js scene. It is now a film: seven short AI-generated clips, scrubbed by scroll. The page no longer downloads a 3D engine, shaders or models. It shows a 26 KB still at once and streams clips one at a time, nearest first.

## How the clips were made (Higgsfield)

1. **Keyframes.** Eight stills, one per chapter boundary, made with GPT Image 2.6 at 16:9. The first (the runway at dawn) set the aircraft's design. The other seven used it as an image reference, so the jet's shape, livery, "SR-01" marking and framing stay the same. In every frame the jet is centred in a rear chase view, which keeps the joins clean and lets phones crop the centre.
2. **Clips.** Kling 3.0 Pro, silent, with the start frame and end frame pinned to consecutive keyframes. Every clip therefore starts on the frame the previous one ends on.
3. **Transitions.** The first set of clips changed landscape by morphing the ground in plain view over 4–6 frames. Clips 1–4 were regenerated (4 s each) so the aircraft flies through cloud or mist at each change. Clip 3 was generated a third time because its wingtip lights glowed green.

| Clip | Shows | Higgsfield job |
| --- | --- | --- |
| Keyframe 0 | Runway at dawn (aircraft reference) | `3efbefcb-ff08-49bf-88aa-79f17992ef48` |
| Keyframes 1–7 | Coast, valley, industry, terrain from above, city, clouds, sunrise | `08d86350…`, `636da606…`, `5b8c68fc…`, `57925896…`, `99b00482…`, `e7da042d…`, `fe1851f2…` |
| 0 | Takeoff, climb-out over the coast (5 s) | `0685b898-1628-40cf-a5c0-41fc049a6552` |
| 1 | Coast → cloud bank → valley (4 s) | `caad0ba8-86e1-4fb2-9581-78ad9e497800` |
| 2 | Valley → valley mist → industrial region (4 s) | `a3077039-96b8-4bf3-af16-7cfba210211c` |
| 3 | Industry → cloud → terrain from above (4 s) | `646ccf2b-cddb-413b-b813-5b1f68068d17` |
| 4 | Terrain → cloud → city (4 s) | `55d3426a-b969-41da-a099-809392b507c5` |
| 5 | City → climb through the clouds (5 s) | `aa97fd13-2ccd-45ec-9f32-54ca4653d16e` |
| 6 | Above the clouds → wide shot into the sunrise (5 s) | `b6cf9074-aa5e-4eb6-b34d-2a6e58f6e7ce` |



4. **Upscaling.** Every clip was upscaled to 4K (3840×2160) with Topaz Video through Higgsfield. Kling delivers 1080p, which looked soft on large screens. The upscaler restores fine detail (foliage, window frames, lettering), and every size the site serves is cut from these masters.

| Clip | 4K upscale job |
| --- | --- |
| 0 | `a55731b6-174b-483a-9327-2c6f3d1b94f4` |
| 1 | `088f25f7-ee2c-45e4-9c9d-ad8294af6545` |
| 2 | `74cc293b-7431-4cec-96d5-944ff1b516ad` |
| 3 | `d5a226d1-331f-404f-8ba3-d868f2816288` |
| 4 | `8a8e8f2a-4ca8-4228-894a-f4ae053f6da4` |
| 5 | `22d418c8-ffd8-4f79-9c96-0dc71c77929b` |
| 6 | `1643e3d8-73d4-463b-90a9-922d0152bd14` |

Credits: keyframes about 6, the first seven clips 61.25, the four cloud-pass clips 28, the clip 3 reshoot 7, the 4K upscales 5 each (5-second clips) or less (4-second clips).

## Rebuilding

Neither the delivered clips nor the 4K masters are committed (several hundred MB). Both can be downloaded again from Higgsfield by job id. Put the 4K masters in `media/film-src/uhd/` as `clip-0.mp4` … `clip-6.mp4`, then run:

```sh
node scripts/build-film.mjs
```

Needs ffmpeg. It writes `public/film/`:

| Folder | Size | Served to |
| --- | --- | --- |
| `wide-uhd/` | 2560×1440, CRF 24 | Landscape screens needing more than about 1200 lines (1440p monitors, Retina laptops, 4K) |
| `wide/` | 1920×1080, CRF 23 | Other landscape screens |
| `wide-sd/` | 1280×720, CRF 24 | Landscape screens on 3G |
| `tall-uhd/`, `tall/`, `tall-sd/` | 4:3 centre crop at 1440, 1080 and 720 lines | Portrait screens, chosen the same way |
| `wide/poster-N.webp`, `tall/poster-N.webp` | First frame of each clip | Shown while a clip loads; static-mode chapter backdrops |

The player measures the film's box in device pixels (`linesNeeded` in `src/flight/film.ts`) and picks the smallest tier that fills it without noticeable enlargement. Clips are encoded for seeking, not playback: a keyframe every 12 frames, no B-frames, no audio, and `faststart`. Every size is a downscale of the 4K master.

## Playback

- `src/flight/film.ts` turns flight progress into a film position measured in clips (0–7). The position passes through `FILM_CUES`, one per chapter, on a monotone cubic. The film never runs backward between cues and its speed changes smoothly. Each cue sits where the cloud is thickest, so a chapter's text leaves as the aircraft enters the cloud and the next arrives as it comes out.
- `src/components/flight/filmPlayer.ts` reads the progress the GSAP director publishes, shows the right clip and seeks it. Before each join the next clip fades in over 8 % of a clip, which hides the small differences the model leaves on the shared keyframe. Clips are fetched whole as blobs, because seeking a partly downloaded file stalls. The order is nearest first, re-chosen after each download.
- The head script (`src/lib/flight-mode-script.ts`) serves the static experience to reduced-motion, data-saver and 2G visitors, and to browsers that cannot play H.264. In static mode every chapter stands over its keyframe still.

To re-time a chapter after replacing a clip, tile its frames (`ffmpeg -i clip.mp4 -vf "select='not(mod(n\,8))',scale=200:-1,tile=13x1" -frames:v 1 strip.jpg`), find where the cloud is thickest, and move that chapter's cue.
